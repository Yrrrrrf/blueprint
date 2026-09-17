// ============================================================================
// Blueprint State Session (§5, §7.1, §7.4, §9.3, §10 of Blueprint Specification)
// Central session controller coordinating document state, commands, history,
// interaction machine actor, persistence, telemetry feeds, and renderer synchronization.
// ============================================================================

import type {
	AnnotationEntity,
	BlueprintCommand,
	BlueprintDocument,
	DeviceDefinition,
	DeviceEntity,
	DimensionEntity,
	Entity,
	EquipmentReportRow,
	Id,
	IsoDate,
	IssueReportRow,
	OpeningEntity,
	PowerReport,
	ReducerEnvironment,
	ReducerResult,
	RevisionReport,
	SpatialIssue,
	TelemetryValue,
	Vec2,
	WallEntity,
	ZoneEntity,
	ZoneReport,
} from "@sdk/core";
import {
	buildEquipmentReport,
	buildIssueReport,
	buildPowerReport,
	buildRevisionReport,
	buildZoneReport,
	computeContentHash,
	createBlankDocument,
	createReducerEnvironment,
	getCatalogDefinition,
	HistoryManager,
	runSpatialChecks,
} from "@sdk/core";
import type {
	ConnectionState,
	DocumentRepository,
	SaveDraftResult,
	TelemetryPort,
	TelemetrySample,
	TelemetrySource,
} from "@sdk/api";
import { StorageUnavailableError } from "@sdk/api";
import type { AssetTelemetry, RendererPort } from "@sdk/renderer";
import { getScalePixelsPerMm, viewToWorld } from "@sdk/renderer";
import type { ActorRefFrom } from "xstate";
import { createActor } from "xstate";
import type { PointerDownPayload } from "./interaction.machine.ts";
import { interactionMachine } from "./interaction.machine.ts";
import { persistenceMachine } from "./persistence.machine.ts";
import { telemetryMachine } from "./telemetry.machine.ts";
import { ConstraintsScheduler } from "./constraints-scheduler.ts";

export type BlueprintSessionMode = "editor" | "viewer";

export type PointerDownInput = Omit<PointerDownPayload, "worldPoint"> & {
	worldPoint?: { x: number; y: number };
};

export interface BlueprintClipboardPayload {
	entities: readonly Entity[];
	definitions: Record<string, DeviceDefinition>;
}

export interface BlueprintSessionOptions {
	document?: BlueprintDocument;
	storageVersion?: number;
	mode?: BlueprintSessionMode;
	repository?: DocumentRepository;
	telemetrySource?: TelemetrySource;
	telemetryPort?: TelemetryPort;
	renderer?: RendererPort;
	activeTool?: string;
	clock?: () => IsoDate;
	clockMs?: () => number;
	idFactory?: () => Id;
	debounceDelay?: number;
	maxWaitDelay?: number;
	staleWindowMs?: number;
	constraintsScheduler?: ConstraintsScheduler;
}

export type SessionListener = (session: BlueprintSession) => void;

export class BlueprintSession {
	private _doc: BlueprintDocument;
	private _mode: BlueprintSessionMode;
	private _selection: readonly Id[] = [];
	private _hover: Id | null = null;
	private _activeTool: string;
	private readonly _env: ReducerEnvironment;
	private readonly _history: HistoryManager;
	private readonly _constraintsScheduler: ConstraintsScheduler;
	private _repository: DocumentRepository | null = null;
	private _telemetrySource: TelemetrySource | null = null;
	private _telemetryPort: TelemetryPort | null = null;
	private readonly _telemetryActor: ActorRefFrom<typeof telemetryMachine>;
	private _freshnessIntervalId: ReturnType<typeof setInterval> | null = null;
	private _renderer: RendererPort | null = null;
	private readonly _telemetryData = new Map<Id, AssetTelemetry>();
	private readonly _listeners = new Set<SessionListener>();
	private readonly _interactionActor: ActorRefFrom<typeof interactionMachine>;
	private readonly _persistenceActor: ActorRefFrom<typeof persistenceMachine>;
	private _storageVersion: number;
	private _lastSavedContentHash: string | null = null;
	private _lastSavedAt: IsoDate | null = null;
	private _broadcastChannel: BroadcastChannel | null = null;
	private _clipboard: BlueprintClipboardPayload | null = null;
	private _pasteCounter = 0;
	private _nudgeDelta = { x: 0, y: 0 };
	private _nudgeTimer: ReturnType<typeof setTimeout> | null = null;
	private _nudgeActive = false;

	constructor(options: BlueprintSessionOptions = {}) {
		this._doc = options.document ?? createBlankDocument();
		this._mode = options.mode ?? "editor";
		this._activeTool = options.activeTool ?? "select";
		this._repository = options.repository ?? null;
		this._storageVersion = options.storageVersion ?? 1;
		this._lastSavedContentHash = computeContentHash(this._doc.content);

		this._env = createReducerEnvironment({
			mode: this._mode === "viewer" ? "preview" : "editor",
			clock: options.clock,
			idFactory: options.idFactory,
		});

		this._history = new HistoryManager(this._doc, this._env);

		this._constraintsScheduler =
			options.constraintsScheduler ?? new ConstraintsScheduler();
		this._constraintsScheduler.subscribe(() => {
			if (this._renderer) {
				this._renderer.setIssues(this.getSpatialIssues());
			}
			this._notify();
		});
		this._constraintsScheduler.schedule(this._doc);

		this._interactionActor = createActor(interactionMachine, {
			input: {
				initialMode: this._mode === "viewer" ? "preview" : "editor",
				initialTool: this._activeTool,
				initialSelection: this._selection,
			},
		});

		this._setupInteractionActor();
		this._interactionActor.start();

		const machine =
			options.debounceDelay !== undefined || options.maxWaitDelay !== undefined
				? persistenceMachine.provide({
						delays: {
							DEBOUNCE_DELAY: options.debounceDelay ?? 750,
							MAX_WAIT_DELAY: options.maxWaitDelay ?? 5000,
						},
					})
				: persistenceMachine;

		this._persistenceActor = createActor(machine, {
			input: {
				document: this._doc,
				storageVersion: this._storageVersion,
				repository: this._repository ?? undefined,
			},
		});

		this._setupPersistenceActor();
		this._persistenceActor.start();
		this._setupBroadcastChannel();

		const clockMs = options.clockMs ?? (() => Date.now());
		this._telemetrySource = options.telemetrySource ?? null;
		this._telemetryActor = createActor(telemetryMachine, {
			input: {
				source: this._telemetrySource,
				channels: this._extractActiveChannels(),
				clock: clockMs,
				staleWindowMs: options.staleWindowMs,
			},
		});

		this._setupTelemetryActor();
		this._telemetryActor.start();
		this._telemetryActor.send({ type: "CONNECT" });

		if (!options.telemetrySource && options.telemetryPort) {
			this.setTelemetryPort(options.telemetryPort);
		}

		if (options.renderer) {
			this.attachRenderer(options.renderer);
		}
	}

	public get doc(): BlueprintDocument {
		return this._doc;
	}

	public get mode(): BlueprintSessionMode {
		return this._mode;
	}

	public setMode(mode: BlueprintSessionMode): void {
		if (this._mode === mode) return;
		this._mode = mode;
		this._env.mode = mode === "viewer" ? "preview" : "editor";
		this._history.setEnvironment(this._env);
		this._interactionActor.send({
			type: "SET_MODE",
			mode: mode === "viewer" ? "preview" : "editor",
		});
		this._notify();
	}

	public get selection(): readonly Id[] {
		return this._selection;
	}

	public setSelection(ids: readonly Id[]): void {
		this._selection = [...ids];
		this._interactionActor.send({
			type: "SELECT",
			ids: this._selection,
			toggle: false,
		});
		this._renderer?.setSelection(this._selection);
		this._notify();
	}

	public get hover(): Id | null {
		return this._hover;
	}

	public setHover(id: Id | null): void {
		if (this._hover === id) return;
		this._hover = id;
		this._interactionActor.send({ type: "HOVER", id });
		this._notify();
	}

	public get activeTool(): string {
		return this._activeTool;
	}

	public setActiveTool(tool: string): void {
		this.setTool(tool);
	}

	public setTool(tool: string): void {
		if (this._activeTool === tool) return;
		this._activeTool = tool;
		this._interactionActor.send({ type: "SET_TOOL", tool });
		this._notify();
	}

	public get interactionActor(): ActorRefFrom<typeof interactionMachine> {
		return this._interactionActor;
	}

	public get repository(): DocumentRepository | null {
		return this._repository;
	}

	public setRepository(repo: DocumentRepository | null): void {
		this._repository = repo;
		if (repo) {
			this._persistenceActor.send({
				type: "SET_REPOSITORY",
				repository: repo,
			});
		}
		this._notify();
	}

	public get storageVersion(): number {
		return this._persistenceActor.getSnapshot().context.storageVersion;
	}

	public get isDirty(): boolean {
		if (!this._lastSavedContentHash) return false;
		const currentHash = computeContentHash(this._doc.content);
		return currentHash !== this._lastSavedContentHash;
	}

	public get isSaving(): boolean {
		return this._persistenceActor.getSnapshot().matches("saving");
	}

	public get saveConflict(): boolean {
		return this._persistenceActor.getSnapshot().matches("conflict");
	}

	public get conflictStorageVersion(): number | null {
		return this._persistenceActor.getSnapshot().context.conflictStorageVersion;
	}

	public get lastSavedAt(): IsoDate | null {
		return this._lastSavedAt;
	}

	public get isDurable(): boolean {
		return this._repository?.isDurable ?? false;
	}

	public get persistenceState(): string {
		const val = this._persistenceActor.getSnapshot().value;
		return typeof val === "string" ? val : (Object.keys(val)[0] ?? "idle");
	}

	public get persistenceActor(): ActorRefFrom<typeof persistenceMachine> {
		return this._persistenceActor;
	}

	public get persistenceError(): Error | null {
		return this._persistenceActor.getSnapshot().context.error;
	}

	public get telemetryPort(): TelemetryPort | null {
		return this._telemetryPort;
	}

	public setTelemetryPort(port: TelemetryPort | null): void {
		this._telemetryPort = port;
		if (!port) {
			this.setTelemetrySource(null);
			return;
		}

		if (
			typeof (port as any).id === "string" &&
			typeof (port as any).subscribe === "function"
		) {
			this.setTelemetrySource(port as unknown as TelemetrySource);
			return;
		}

		const adapter: TelemetrySource = {
			id: "legacy-port-source",
			subscribe: (channels, observer) => {
				return port.subscribe(
					channels as string[],
					(sample: TelemetrySample) => {
						observer.next([sample]);
					},
				);
			},
		};
		this.setTelemetrySource(adapter);
	}

	public get telemetrySource(): TelemetrySource | null {
		return this._telemetrySource;
	}

	public setTelemetrySource(source: TelemetrySource | null): void {
		this._telemetrySource = source;
		this._telemetryActor.send({ type: "SET_SOURCE", source });
		if (source) {
			this._telemetryActor.send({ type: "CONNECT" });
		}
	}

	public get telemetryActor(): ActorRefFrom<typeof telemetryMachine> {
		return this._telemetryActor;
	}

	public get telemetryValues(): ReadonlyMap<Id, AssetTelemetry> {
		return this._telemetryData;
	}

	public get telemetryState():
		| "disconnected"
		| "connecting"
		| "connected"
		| "error" {
		return this._telemetryActor.getSnapshot().context.connectionState;
	}

	public checkFreshness(nowMs?: number): void {
		this._telemetryActor.send({ type: "CHECK_FRESHNESS", nowMs });
	}

	public getPowerReport(): PowerReport {
		return buildPowerReport(this._doc, this._telemetryData);
	}

	public getZoneReport(): ZoneReport {
		return buildZoneReport(this._doc, this._telemetryData);
	}

	public getEquipmentReport(): EquipmentReportRow[] {
		return buildEquipmentReport(this._doc, this._telemetryData);
	}

	public getSpatialIssues(): SpatialIssue[] {
		const issues = this._constraintsScheduler.getIssues();
		if (
			issues.length > 0 ||
			!this._constraintsScheduler.isOutdated(
				this._doc.revision,
				this._doc.documentId,
			)
		) {
			return issues;
		}
		return runSpatialChecks(this._doc);
	}

	public get isSpatialCheckPending(): boolean {
		return this._constraintsScheduler.isPending;
	}

	public get areSpatialIssuesOutdated(): boolean {
		return this._constraintsScheduler.isOutdated(
			this._doc.revision,
			this._doc.documentId,
		);
	}

	public get constraintsScheduler(): ConstraintsScheduler {
		return this._constraintsScheduler;
	}

	public async awaitSpatialChecks(cancellationToken?: {
		isCancelled: boolean;
	}): Promise<SpatialIssue[]> {
		return this._constraintsScheduler.awaitChecks(
			this._doc.revision,
			cancellationToken,
		);
	}

	public get renderer(): RendererPort | null {
		return this._renderer;
	}

	public attachRenderer(renderer: RendererPort): () => void {
		this._renderer = renderer;
		renderer.setDocument(this._doc);
		renderer.setSelection(this._selection);
		renderer.setTelemetry(new Map(this._telemetryData));

		return () => {
			if (this._renderer === renderer) {
				this._renderer = null;
			}
		};
	}

	public detachRenderer(): void {
		this._renderer = null;
	}

	/**
	 * Executes a command on the document authority (§5.1).
	 * Enforces read-only policy strictly in 'viewer' mode.
	 */
	public execute(cmd: BlueprintCommand): ReducerResult {
		const readOnlyErr = this._checkReadOnly();
		if (readOnlyErr) return readOnlyErr;

		const result = this._history.execute(cmd);
		this._applyHistoryResult(result);
		return result;
	}

	/**
	 * Reverts the most recent committed command (§5.2).
	 */
	public undo(): ReducerResult {
		const readOnlyErr = this._checkReadOnly();
		if (readOnlyErr) return readOnlyErr;

		const result = this._history.undo();
		this._applyHistoryResult(result);
		return result;
	}

	/**
	 * Re-applies the most recently undone command (§5.2).
	 */
	public redo(): ReducerResult {
		const readOnlyErr = this._checkReadOnly();
		if (readOnlyErr) return readOnlyErr;

		const result = this._history.redo();
		this._applyHistoryResult(result);
		return result;
	}

	private _checkReadOnly(): ReducerResult | null {
		if (this._mode === "viewer") {
			return {
				success: false,
				error: {
					code: "READ_ONLY",
					message: "Session is in viewer mode (read-only)",
				},
			};
		}
		return null;
	}

	private _applyHistoryResult(result: ReducerResult): void {
		if (result.success && !result.noChange) {
			this._doc = this._history.getDocument();
			this._persistenceActor.send({ type: "COMMIT", document: this._doc });
			this._renderer?.applyDelta(this._doc, result.delta);
			if (result.issues) {
				this._renderer?.setIssues(result.issues);
			}
			this._constraintsScheduler.schedule(this._doc);
			this._resubscribeTelemetry();
			this._notify();
		}
	}

	public get history(): HistoryManager {
		return this._history;
	}

	public canUndo(): boolean {
		return this._mode !== "viewer" && this._history.canUndo();
	}

	public canRedo(): boolean {
		return this._mode !== "viewer" && this._history.canRedo();
	}

	/**
	 * Keyboard nudging with coalescing (AC-030, AC-040, §7.4).
	 * Nudges 1 mm by default, 10 mm with Shift.
	 * Consecutive nudges coalesce into one undo entry ending on keyup or 300 ms idle.
	 */
	public nudge(
		direction: "up" | "down" | "left" | "right",
		shift = false,
	): void {
		if (this._mode === "viewer" || this._selection.length === 0) return;

		const step = shift ? 10 : 1;
		const delta = {
			x: direction === "left" ? -step : direction === "right" ? step : 0,
			y: direction === "up" ? -step : direction === "down" ? step : 0,
		};

		this._nudgeDelta.x += delta.x;
		this._nudgeDelta.y += delta.y;
		this._nudgeActive = true;

		if (this._nudgeTimer !== null) {
			clearTimeout(this._nudgeTimer);
		}

		this._nudgeTimer = setTimeout(() => {
			this._flushNudge();
		}, 300);
	}

	/**
	 * Flushes coalesced nudge movements into a single document transaction.
	 */
	public flushNudge(): void {
		this._flushNudge();
	}

	private _flushNudge(): void {
		if (this._nudgeTimer !== null) {
			clearTimeout(this._nudgeTimer);
			this._nudgeTimer = null;
		}

		if (!this._nudgeActive || this._selection.length === 0) {
			this._nudgeDelta = { x: 0, y: 0 };
			this._nudgeActive = false;
			return;
		}

		const totalDelta = { ...this._nudgeDelta };
		this._nudgeDelta = { x: 0, y: 0 };
		this._nudgeActive = false;

		if (totalDelta.x === 0 && totalDelta.y === 0) return;

		this.execute({
			type: "selection.transform",
			ids: [...this._selection],
			delta: totalDelta,
		});
	}

	/**
	 * Copies current selection into private clipboard (§7.4, AC-032).
	 */
	public copySelection(): BlueprintClipboardPayload | null {
		if (this._selection.length === 0) return null;

		const selectedEntities: Entity[] = [];
		const usedDefinitions: Record<string, DeviceDefinition> = {};

		for (const id of this._selection) {
			const ent = this._doc.content.entities[id];
			if (!ent) continue;
			selectedEntities.push(JSON.parse(JSON.stringify(ent)));
			if (ent.kind === "device") {
				const def =
					this._doc.content.definitions[ent.definitionId] ??
					getCatalogDefinition(ent.definitionId);
				if (def) {
					usedDefinitions[def.id] = JSON.parse(JSON.stringify(def));
				}
			}
		}

		if (selectedEntities.length === 0) return null;

		this._clipboard = {
			entities: selectedEntities,
			definitions: usedDefinitions,
		};
		return this._clipboard;
	}

	/**
	 * Pastes private clipboard into document at offset (§7.4, AC-032).
	 * Allocates new unique IDs, suffixes assetKey with -copy-N, clears telemetry bindings.
	 */
	public pasteClipboard(
		offset: { x: number; y: number } = { x: 1000, y: 1000 },
	): readonly Id[] {
		if (
			!this._clipboard ||
			this._clipboard.entities.length === 0 ||
			this._mode === "viewer"
		) {
			return [];
		}

		this._pasteCounter++;
		const suffix = `-copy-${this._pasteCounter}`;
		const idMap = new Map<Id, Id>();

		for (const ent of this._clipboard.entities) {
			const newId = `${ent.id}${suffix}`;
			idMap.set(ent.id, newId);
		}

		const newEntities: Entity[] = [];
		for (const ent of this._clipboard.entities) {
			const cloned = JSON.parse(JSON.stringify(ent)) as Entity;
			cloned.id = idMap.get(ent.id)!;
			cloned.transform = {
				...cloned.transform,
				x: cloned.transform.x + offset.x,
				y: cloned.transform.y + offset.y,
			};

			if (cloned.kind === "device") {
				if (cloned.assetKey) {
					cloned.assetKey = `${cloned.assetKey}${suffix}`;
				}
				cloned.bindings = [];
			}

			newEntities.push(cloned);
		}

		const newIds: Id[] = [];
		for (const newEnt of newEntities) {
			const res = this.execute({ type: "entity.add", entity: newEnt });
			if (res.success) {
				newIds.push(newEnt.id);
			}
		}

		this.setSelection(newIds);
		return newIds;
	}

	private _resolveHitAndWorld(
		point: { x: number; y: number },
		worldPoint?: { x: number; y: number },
	) {
		const hit = this._renderer?.hitTest(point, {
			mode: this._mode === "viewer" ? "viewer" : "editor",
			drillDown: false,
		});
		const worldPt =
			worldPoint ??
			hit?.worldPoint ??
			(this._renderer
				? viewToWorld(point, this._renderer.getCamera(), {
						x: 800,
						y: 600,
					})
				: point);
		return { hit, worldPt };
	}

	/**
	 * Forward pointer down event to interaction actor.
	 */
	public pointerDown(data: PointerDownInput): void {
		const { hit, worldPt } = this._resolveHitAndWorld(
			data.point,
			data.worldPoint,
		);

		this._interactionActor.send({
			type: "POINTER_DOWN",
			point: data.point,
			worldPoint: worldPt,
			hitEntityId:
				data.hitEntityId !== undefined
					? data.hitEntityId
					: (hit?.entityId ?? null),
			hitHandle:
				data.hitHandle !== undefined
					? data.hitHandle
					: (hit?.featureId ?? null),
			button: data.button ?? 0,
			shiftKey: data.shiftKey,
			altKey: data.altKey,
			ctrlKey: data.ctrlKey,
			metaKey: data.metaKey,
		});
	}

	/**
	 * Forward pointer move event to interaction actor.
	 */
	public pointerMove(data: {
		point: { x: number; y: number };
		worldPoint?: { x: number; y: number };
		shiftKey?: boolean;
		altKey?: boolean;
	}): void {
		const worldPt =
			data.worldPoint ??
			(this._renderer
				? viewToWorld(data.point, this._renderer.getCamera(), {
						x: 800,
						y: 600,
					})
				: data.point);
		this._interactionActor.send({
			type: "POINTER_MOVE",
			point: data.point,
			worldPoint: worldPt,
			shiftKey: data.shiftKey,
			altKey: data.altKey,
		});
	}

	/**
	 * Forward pointer up event to interaction actor.
	 */
	public pointerUp(data?: {
		point?: { x: number; y: number };
		worldPoint?: { x: number; y: number };
	}): void {
		this._interactionActor.send({
			type: "POINTER_UP",
			point: data?.point,
			worldPoint: data?.worldPoint,
		});
	}

	/**
	 * Forward pointer cancel event to interaction actor.
	 */
	public pointerCancel(): void {
		this._interactionActor.send({ type: "POINTER_CANCEL" });
	}

	/**
	 * Forward double click event to interaction actor.
	 */
	public doubleClick(data: {
		point: { x: number; y: number };
		worldPoint?: { x: number; y: number };
		hitEntityId?: string | null;
	}): void {
		const { hit, worldPt } = this._resolveHitAndWorld(
			data.point,
			data.worldPoint,
		);
		this._interactionActor.send({
			type: "DOUBLE_CLICK",
			point: data.point,
			worldPoint: worldPt,
			hitEntityId:
				data.hitEntityId !== undefined
					? data.hitEntityId
					: (hit?.entityId ?? null),
		});
	}

	/**
	 * Forward key down event to session shortcuts and interaction actor.
	 */
	public keyDown(event: {
		key: string;
		shiftKey?: boolean;
		altKey?: boolean;
		ctrlKey?: boolean;
		metaKey?: boolean;
	}): void {
		if (this._handleArrowKeys(event)) return;
		if (this._handleShortcuts(event)) return;

		this._interactionActor.send({
			type: "KEY_DOWN",
			key: event.key,
			shiftKey: event.shiftKey,
			altKey: event.altKey,
			ctrlKey: event.ctrlKey,
			metaKey: event.metaKey,
		});
	}

	private _handleArrowKeys(event: {
		key: string;
		shiftKey?: boolean;
	}): boolean {
		const map: Record<string, "up" | "down" | "left" | "right"> = {
			ArrowUp: "up",
			ArrowDown: "down",
			ArrowLeft: "left",
			ArrowRight: "right",
		};
		const dir = map[event.key];
		if (!dir) return false;
		this.nudge(dir, event.shiftKey);
		return true;
	}

	private _handleShortcuts(event: {
		key: string;
		shiftKey?: boolean;
		ctrlKey?: boolean;
		metaKey?: boolean;
	}): boolean {
		if (event.key === "Delete" || event.key === "Backspace") {
			if (this._selection.length > 0 && this._mode !== "viewer") {
				this.execute({ type: "entity.delete", ids: [...this._selection] });
				this.setSelection([]);
			}
			return true;
		}

		if (event.key === "Escape") {
			this._interactionActor.send({ type: "CANCEL" });
			if (this._selection.length > 0) this.setSelection([]);
			return true;
		}

		const isCmd = Boolean(event.ctrlKey || event.metaKey);
		if (!isCmd) return false;

		const k = event.key.toLowerCase();
		if (k === "z") {
			if (event.shiftKey) this.redo();
			else this.undo();
			return true;
		}
		if (k === "y") {
			this.redo();
			return true;
		}
		if (k === "a") {
			this.selectAll();
			return true;
		}
		if (k === "c") {
			this.copySelection();
			return true;
		}
		if (k === "v") {
			this.pasteClipboard();
			return true;
		}
		if (k === "d") {
			if (this._selection.length > 0 && this._mode !== "viewer") {
				this.execute({
					type: "selection.duplicate",
					ids: [...this._selection],
					offsetMm: { x: 1000, y: 1000 },
				});
			}
			return true;
		}

		return false;
	}

	/**
	 * Forward key up event to interaction actor and flush nudge on arrow keyup.
	 */
	public keyUp(event: { key: string }): void {
		if (event.key.startsWith("Arrow")) {
			this._flushNudge();
		}
		this._interactionActor.send({
			type: "KEY_UP",
			key: event.key,
		});
	}

	/**
	 * Selects all visible editable entities.
	 */
	public selectAll(): void {
		if (this._mode === "viewer") return;
		const visibleIds: Id[] = [];
		const layerMap = new Map(this._doc.content.layers.map((l) => [l.id, l]));

		for (const entity of Object.values(this._doc.content.entities)) {
			if (entity.hidden || entity.locked) continue;
			const layer = layerMap.get(entity.layerId);
			if (layer && (!layer.visible || layer.locked)) continue;
			visibleIds.push(entity.id);
		}

		this.setSelection(visibleIds);
	}

	/**
	 * Immediately flushes pending save to repository (§10.2).
	 */
	public async flushSave(): Promise<SaveDraftResult> {
		if (!this._repository) {
			throw new StorageUnavailableError(
				"Cannot save document: no repository attached to session",
			);
		}

		if (!this.isDirty && this._persistenceActor.getSnapshot().matches("idle")) {
			return { status: "saved", storageVersion: this.storageVersion };
		}

		return new Promise<SaveDraftResult>((resolve, reject) => {
			let sub: { unsubscribe: () => void } | null = null;
			const checkState = () => {
				const snap = this._persistenceActor.getSnapshot();
				if (snap.matches("idle")) {
					sub?.unsubscribe();
					resolve({ status: "saved", storageVersion: this.storageVersion });
				} else if (snap.matches("conflict")) {
					sub?.unsubscribe();
					resolve({
						status: "conflict",
						currentStorageVersion:
							snap.context.conflictStorageVersion ?? this.storageVersion,
					});
				} else if (snap.matches("failed")) {
					sub?.unsubscribe();
					reject(snap.context.error ?? new Error("Save failed"));
				}
			};

			sub = this._persistenceActor.subscribe(() => {
				checkState();
			});

			this._persistenceActor.send({ type: "FLUSH" });
			checkState();
		});
	}

	/**
	 * Saves active document to repository (§10.1).
	 */
	public async save(): Promise<void> {
		const res = await this.flushSave();
		if (res.status === "conflict") {
			throw new Error("Save failed due to storage conflict");
		}
	}

	/**
	 * Resolves save conflict by reloading saved version from repository (§10.2).
	 */
	public async resolveConflictReload(): Promise<void> {
		if (!this._repository) {
			throw new StorageUnavailableError("No repository attached to session");
		}
		const remote = await this._repository.load(this._doc.documentId);
		if (!remote) {
			throw new Error(
				`Document ${this._doc.documentId} not found in repository`,
			);
		}
		let version = 1;
		if (typeof (this._repository as any).getStorageVersion === "function") {
			version =
				(this._repository as any).getStorageVersion(this._doc.documentId) || 1;
		} else {
			const snap = this._persistenceActor.getSnapshot();
			version = snap.context.conflictStorageVersion ?? this.storageVersion + 1;
		}

		this._storageVersion = version;
		this.loadDocument(remote);
		this._persistenceActor.send({
			type: "RESOLVE_RELOAD",
			document: remote,
			storageVersion: version,
		});
		this._notify();
	}

	/**
	 * Resolves save conflict by saving current draft as a new document (§10.2, AC-043).
	 */
	public async resolveConflictSaveCopy(): Promise<BlueprintDocument> {
		if (!this._repository) {
			throw new StorageUnavailableError("No repository attached to session");
		}
		const newId = crypto.randomUUID();
		const now = new Date().toISOString();
		const copyDoc: BlueprintDocument = {
			...JSON.parse(JSON.stringify(this._doc)),
			documentId: newId,
			createdAt: now,
			updatedAt: now,
			revision: 1,
			content: {
				...JSON.parse(JSON.stringify(this._doc.content)),
				name: `${this._doc.content.name} (Copy)`,
				metadata: {
					...this._doc.content.metadata,
					originalDocumentId: this._doc.documentId,
				},
			},
		};

		await this._repository.create(copyDoc);
		this._storageVersion = 1;
		this.loadDocument(copyDoc);
		this._persistenceActor.send({
			type: "RESOLVE_SAVE_COPY",
			document: copyDoc,
			storageVersion: 1,
		});
		this._notify();
		return copyDoc;
	}

	/**
	 * Retries failed save operation (§10.2, AC-044).
	 */
	public retrySave(): void {
		this._persistenceActor.send({ type: "RETRY" });
	}

	/**
	 * Loads a document by ID from repository into session (§10.1).
	 */
	public async load(id: Id): Promise<boolean> {
		if (!this._repository) {
			throw new StorageUnavailableError(
				"Cannot load document: no repository attached to session",
			);
		}
		const doc = await this._repository.load(id);
		if (!doc) return false;
		let version = 1;
		if (typeof (this._repository as any).getStorageVersion === "function") {
			version = (this._repository as any).getStorageVersion(id) || 1;
		} else {
			const list = await this._repository.list();
			const item = list.find((d) => d.id === id);
			if (item?.storageVersion) {
				version = item.storageVersion;
			}
		}
		this._storageVersion = version;
		this.loadDocument(doc);
		return true;
	}

	/**
	 * Recovers a stored draft document from repository (§10.2, AC-045).
	 * Restores canonical content and IDs with empty gesture and history.
	 */
	public async recoverDraft(id: Id): Promise<boolean> {
		return await this.load(id);
	}

	/**
	 * Replaces session document, resets history and updates renderer.
	 */
	public loadDocument(doc: BlueprintDocument): void {
		this._doc = doc;
		this._history.setDocument(doc);
		this._history.clear();
		this._selection = [];
		this._hover = null;
		this._telemetryData.clear();

		this._lastSavedContentHash = computeContentHash(doc.content);
		this._interactionActor.send({ type: "DOCUMENT_REPLACED" });
		this._persistenceActor.send({
			type: "SET_DOCUMENT",
			document: doc,
			storageVersion: this._storageVersion,
		});
		this._renderer?.setDocument(doc);
		this._renderer?.setSelection([]);
		this._renderer?.setTelemetry(new Map());

		this._resubscribeTelemetry();
		this._constraintsScheduler.invalidateGeneration();
		this._constraintsScheduler.schedule(doc);
		this._notify();
	}

	/**
	 * Inspects device entity and current telemetry readings.
	 */
	public getInspectedDevice(
		entityId: Id,
	): { entity: DeviceEntity; telemetry?: AssetTelemetry } | null {
		const entity = this._doc.content.entities[entityId];
		if (!entity || entity.kind !== "device") {
			return null;
		}
		const telemetry = this._telemetryData.get(entityId);
		return { entity, telemetry };
	}

	/**
	 * Retrieves cached telemetry readings for an entity.
	 */
	public getTelemetry(entityId: Id): AssetTelemetry | undefined {
		return this._telemetryData.get(entityId);
	}

	/**
	 * Subscribes to session state changes.
	 */
	public subscribe(listener: SessionListener): () => void {
		this._listeners.add(listener);
		return () => {
			this._listeners.delete(listener);
		};
	}

	public dispose(): void {
		if (this._nudgeTimer !== null) {
			clearTimeout(this._nudgeTimer);
			this._nudgeTimer = null;
		}
		if (this._freshnessIntervalId !== null) {
			clearInterval(this._freshnessIntervalId);
			this._freshnessIntervalId = null;
		}
		this._constraintsScheduler.dispose();
		this._telemetryActor.send({ type: "UNMOUNT" });
		this._telemetryActor.stop();
		this._interactionActor.stop();
		this._persistenceActor.stop();
		if (this._broadcastChannel) {
			this._broadcastChannel.close();
			this._broadcastChannel = null;
		}
		this._renderer = null;
		this._listeners.clear();
		this._telemetryData.clear();
	}

	private _setupPersistenceActor(): void {
		this._persistenceActor.on("SAVED", (event) => {
			this._storageVersion = event.storageVersion;
			this._lastSavedContentHash = computeContentHash(event.document.content);
			this._lastSavedAt = new Date().toISOString();
			this._broadcastSave(event.document.documentId, event.storageVersion);
			this._notify();
		});

		this._persistenceActor.on("CONFLICT", () => {
			this._notify();
		});

		this._persistenceActor.on("FAILED", () => {
			this._notify();
		});

		this._persistenceActor.on("RELOAD_REMOTE", (event) => {
			if (!this.isDirty && this._repository) {
				this._repository.load(event.documentId).then((doc) => {
					if (doc) {
						this.loadDocument(doc);
						this._storageVersion = event.storageVersion;
						this._notify();
					}
				});
			}
		});
	}

	private _setupBroadcastChannel(): void {
		if (typeof BroadcastChannel !== "undefined") {
			try {
				this._broadcastChannel = new BroadcastChannel("blueprint-documents");
				this._broadcastChannel.onmessage = (ev) => {
					const data = ev.data;
					if (data && data.documentId === this._doc.documentId) {
						if (!this.isDirty) {
							if (this._repository) {
								this._repository.load(data.documentId).then((remoteDoc) => {
									if (remoteDoc) {
										this.loadDocument(remoteDoc);
										this._storageVersion = data.storageVersion;
										this._persistenceActor.send({
											type: "SET_DOCUMENT",
											document: remoteDoc,
											storageVersion: data.storageVersion,
										});
										this._notify();
									}
								});
							}
						} else {
							this._persistenceActor.send({
								type: "REMOTE_UPDATE",
								documentId: data.documentId,
								storageVersion: data.storageVersion,
							});
						}
					}
				};
			} catch {
				// Ignore broadcast errors
			}
		}
	}

	private _broadcastSave(documentId: Id, storageVersion: number): void {
		if (this._broadcastChannel) {
			try {
				this._broadcastChannel.postMessage({ documentId, storageVersion });
			} catch {
				// Ignore broadcast errors
			}
		}
	}

	private _setupInteractionActor(): void {
		this._interactionActor.on("COMMIT_COMMAND", (event) => {
			if (event.command) {
				this._handleInteractionCommand(event.command);
			}
		});

		this._interactionActor.on("SELECTION_CHANGED", (event) => {
			this._selection = [...event.selectedIds];
			this._renderer?.setSelection(this._selection);
			this._notify();
		});

		this._interactionActor.on("TOOL_CHANGED", (event) => {
			this._activeTool = event.tool;
			this._notify();
		});

		this._interactionActor.on("MODE_CHANGED", (event) => {
			const newMode = event.mode === "preview" ? "viewer" : "editor";
			if (this._mode !== newMode) {
				this._mode = newMode;
				this._env.mode = event.mode;
				this._history.setEnvironment(this._env);
				this._notify();
			}
		});

		this._interactionActor.on("CANCEL_GESTURE", () => {
			this._renderer?.setPreview(null);
			this._notify();
		});

		this._interactionActor.on("PREVIEW_UPDATE", (event) => {
			if (this._renderer && event.preview) {
				this._renderer.setPreview(event.preview);
			}
		});

		this._interactionActor.on("CAMERA_PAN", (event) => {
			if (this._renderer && event.delta) {
				const cam = this._renderer.getCamera();
				const s = getScalePixelsPerMm(cam.scale);
				this._renderer.setCamera({
					...cam,
					centerMm: {
						x: cam.centerMm.x - event.delta.x / s,
						y: cam.centerMm.y - event.delta.y / s,
					},
				});
			}
		});

		this._interactionActor.on("CAMERA_PINCH", (event) => {
			if (this._renderer) {
				const cam = this._renderer.getCamera();
				this._renderer.setCamera({
					...cam,
					scale: Math.max(0.01, Math.min(1000, cam.scale * event.zoomFactor)),
				});
			}
		});
	}

	private _handleInteractionCommand(cmd: any): ReducerResult {
		const findLayerByRole = (role: string): string => {
			const layer = this._doc.content.layers.find((l) => l.role === role);
			return layer ? layer.id : (this._doc.content.layers[0]?.id ?? "default");
		};

		if (cmd.type === "wall.create") {
			const id = this._env.idFactory();
			const wallEntity: WallEntity = {
				id,
				name: "Wall",
				kind: "wall",
				layerId: findLayerByRole("foundation"),
				groupId: null,
				transform: { x: 0, y: 0, rotationDeg: 0 },
				style: {
					fill: null,
					stroke: "#000000",
					strokeWidthMm: 300,
					opacity: 1,
					dashMm: [],
				},
				hidden: false,
				locked: false,
				tags: [],
				metadata: {},
				vertices: (cmd.vertices as Vec2[]).map((pt, idx) => ({
					id: `v${idx + 1}`,
					point: pt,
				})),
				thicknessMm: 300,
				closed: Boolean(cmd.closed),
			};
			const res = this.execute({ type: "entity.add", entity: wallEntity });
			if (res.success) {
				this.setSelection([id]);
			}
			return res;
		}

		if (cmd.type === "zone.create") {
			const id = this._env.idFactory();
			const zoneEntity: ZoneEntity = {
				id,
				name: "Zone",
				kind: "zone",
				layerId: findLayerByRole("sections"),
				groupId: null,
				transform: { x: 0, y: 0, rotationDeg: 0 },
				style: {
					fill: "rgba(0, 120, 255, 0.2)",
					stroke: "rgba(0, 120, 255, 0.8)",
					strokeWidthMm: 2,
					opacity: 1,
					dashMm: [],
				},
				hidden: false,
				locked: false,
				tags: [],
				metadata: {},
				polygon: {
					outer: (cmd.vertices as Vec2[]).map((pt, idx) => ({
						id: `zv${idx + 1}`,
						x: pt.x,
						y: pt.y,
					})),
					holes: [],
				},
				category: "production",
				restricted: false,
			};
			const res = this.execute({ type: "entity.add", entity: zoneEntity });
			if (res.success) {
				this.setSelection([id]);
			}
			return res;
		}

		if (cmd.type === "device.place") {
			const defId = cmd.definitionId ?? "def-cnc-v1";
			const def = getCatalogDefinition(defId);
			const id = this._env.idFactory();
			const devEntity: DeviceEntity = {
				id,
				name: def?.name ?? "Device",
				kind: "device",
				layerId: findLayerByRole("machinery"),
				groupId: null,
				definitionId: defId,
				assetKey: `${defId}-${id}`,
				transform: {
					x: cmd.position.x,
					y: cmd.position.y,
					rotationDeg: cmd.rotationDeg ?? 0,
				},
				style: {
					fill: null,
					stroke: null,
					strokeWidthMm: 1,
					opacity: 1,
					dashMm: [],
				},
				hidden: false,
				locked: false,
				tags: [],
				metadata: {},
				parameters: def?.defaults ? { ...def.defaults } : {},
				ratedPowerKw:
					def?.category === "cnc" ? 15 : def?.category === "robot" ? 5 : null,
				maintenanceDue: null,
				bindings: [],
			};
			const res = this.execute({ type: "entity.add", entity: devEntity });
			if (res.success) {
				this.setSelection([id]);
			}
			return res;
		}

		if (cmd.type === "dimension.create") {
			const id = this._env.idFactory();
			const dimEntity: DimensionEntity = {
				id,
				name: "Dimension",
				kind: "dimension",
				layerId: findLayerByRole("marks"),
				groupId: null,
				transform: { x: 0, y: 0, rotationDeg: 0 },
				style: {
					fill: null,
					stroke: "#000000",
					strokeWidthMm: 1,
					opacity: 1,
					dashMm: [],
				},
				hidden: false,
				locked: false,
				tags: [],
				metadata: {},
				a: { kind: "point", point: cmd.anchorA },
				b: { kind: "point", point: cmd.anchorB },
				axis: "aligned",
				offsetMm: typeof cmd.offsetMm === "number" ? cmd.offsetMm : 500,
				displayUnit: "document",
				precision: 2,
			};
			const res = this.execute({ type: "entity.add", entity: dimEntity });
			if (res.success) {
				this.setSelection([id]);
			}
			return res;
		}

		if (cmd.type === "annotation.create") {
			const id = this._env.idFactory();
			const anchor = cmd.entityId
				? ({
						kind: "entity" as const,
						entityId: cmd.entityId,
						feature: "origin" as const,
						featureId: null,
					} as const)
				: ({
						kind: "point" as const,
						point: cmd.point ?? { x: 0, y: 0 },
					} as const);
			const annEntity: AnnotationEntity = {
				id,
				name: "Annotation",
				kind: "annotation",
				layerId: findLayerByRole("marks"),
				groupId: null,
				transform: { x: 0, y: 0, rotationDeg: 0 },
				style: {
					fill: null,
					stroke: null,
					strokeWidthMm: 1,
					opacity: 1,
					dashMm: [],
				},
				hidden: false,
				locked: false,
				tags: [],
				metadata: {},
				anchor,
				offsetMm: { x: 0, y: 0 },
				text: cmd.text ?? "Note",
				annotationType: "label",
				textHeightMm: 250,
			};
			const res = this.execute({ type: "entity.add", entity: annEntity });
			if (res.success) {
				this.setSelection([id]);
			}
			return res;
		}

		if (cmd.type === "opening.create") {
			const id = this._env.idFactory();
			const wall = this._doc.content.entities[cmd.wallId] as
				| WallEntity
				| undefined;
			if (!wall || wall.vertices.length < 2) {
				return {
					success: false,
					error: {
						code: "OPENING_CONFLICT",
						message: "Invalid wall for opening",
					},
				};
			}
			const opening: OpeningEntity = {
				id,
				name: "Door Opening",
				kind: "opening",
				layerId: wall.layerId,
				groupId: null,
				wallId: wall.id,
				segmentStartId: wall.vertices[0].id,
				segmentEndId: wall.vertices[1].id,
				offsetMm: cmd.offsetMm ?? 500,
				widthMm: cmd.widthMm ?? 1000,
				openingType: cmd.openingType ?? "door",
				hinge: cmd.hinge ?? "start",
				swing: cmd.swing ?? "left",
				transform: { x: 0, y: 0, rotationDeg: 0 },
				style: {
					fill: null,
					stroke: "#000000",
					strokeWidthMm: 2,
					opacity: 1,
					dashMm: [],
				},
				hidden: false,
				locked: false,
				tags: [],
				metadata: {},
			};
			return this.execute({ type: "opening.add", opening });
		}

		if (cmd.type === "vertex.move") {
			const entity = this._doc.content.entities[cmd.entityId];
			if (entity && entity.kind === "wall") {
				const wall = entity as WallEntity;
				const updatedVertices = wall.vertices.map((v) =>
					v.id === cmd.vertexId ? { ...v, point: cmd.point } : v,
				);
				return this.execute({
					type: "wall.setVertices",
					id: wall.id,
					vertices: updatedVertices,
				});
			}
			return {
				success: false,
				error: {
					code: "INVALID_COMMAND",
					message: "Vertex move target not found",
				},
			};
		}

		if (cmd.type === "selection.resize") {
			return this.execute({
				type: "selection.transform",
				ids: cmd.ids,
				delta: cmd.delta,
			});
		}

		return this.execute(cmd as BlueprintCommand);
	}

	private _notify(): void {
		for (const listener of this._listeners) {
			listener(this);
		}
	}

	private _setupTelemetryActor(): void {
		this._telemetryActor.on("VALUES_UPDATED", () => {
			this._syncTelemetryToRenderer();
			this._notify();
		});
		this._telemetryActor.on("STATUS_CHANGED", () => {
			this._notify();
		});
		this._freshnessIntervalId = setInterval(() => {
			this._telemetryActor.send({ type: "CHECK_FRESHNESS" });
		}, 1000);
	}

	private _extractActiveChannels(): string[] {
		const channels = new Set<string>();
		for (const entity of Object.values(this._doc.content.entities)) {
			if (entity.kind === "device") {
				const dev = entity as DeviceEntity;
				if (dev.bindings && dev.bindings.length > 0) {
					for (const b of dev.bindings) {
						channels.add(b.channel);
					}
				}
				if (dev.assetKey) {
					const suffixes = [
						"",
						".status",
						".loadPct",
						".temperatureC",
						".vibrationMmS",
						".powerKw",
						".rpm",
						".speedMps",
						":status",
						":load",
						":power",
						":temperature",
						":vibration",
						":rpm",
						":speed",
					];
					for (const s of suffixes) {
						channels.add(`${dev.assetKey}${s}`);
					}
				}
			}
		}
		return Array.from(channels);
	}

	private _resubscribeTelemetry(): void {
		const channels = this._extractActiveChannels();
		this._telemetryActor.send({ type: "SET_CHANNELS", channels });
	}

	private _syncTelemetryToRenderer(): void {
		const snap = this._telemetryActor.getSnapshot();
		const values = snap.context.values;
		const staleChannels = snap.context.staleChannels;

		for (const entity of Object.values(this._doc.content.entities)) {
			if (entity.kind !== "device") continue;
			const device = entity as DeviceEntity;
			const state = {
				values: {} as Record<string, TelemetryValue>,
				status: "unknown" as "running" | "maintenance" | "offline" | "unknown",
				isStale: false,
				hasAny: false,
				quality: "good" as "good" | "bad" | "uncertain",
				observedAt: undefined as string | undefined,
			};

			extractBoundTelemetry(device, values, staleChannels, state);
			extractAssetKeyTelemetry(device.assetKey, values, staleChannels, state);

			if (state.hasAny) {
				const assetTel: AssetTelemetry = {
					values: state.values,
					status: state.status,
					stale: state.isStale,
				};
				(assetTel as any).quality = state.quality;
				if (state.observedAt) {
					(assetTel as any).observedAt = state.observedAt;
				}
				this._telemetryData.set(device.id, assetTel);
			}
		}

		this._renderer?.setTelemetry(new Map(this._telemetryData));
	}
}

function extractBoundTelemetry(
	device: DeviceEntity,
	values: Map<string, TelemetrySample>,
	staleChannels: Set<string>,
	state: {
		values: Record<string, TelemetryValue>;
		status: "running" | "maintenance" | "offline" | "unknown";
		isStale: boolean;
		hasAny: boolean;
		quality: "good" | "bad" | "uncertain";
		observedAt?: string;
	},
): void {
	if (!device.bindings || device.bindings.length === 0) return;
	for (const binding of device.bindings) {
		const sample = values.get(binding.channel);
		if (!sample) continue;
		state.hasAny = true;
		state.values[binding.field] = sample.value;
		if (sample.observedAt) state.observedAt = sample.observedAt;
		if (sample.quality === "bad") state.quality = "bad";
		else if (sample.quality === "uncertain" && state.quality !== "bad") {
			state.quality = "uncertain";
		}
		if (binding.field === "status" && typeof sample.value === "string") {
			state.status = sample.value as any;
		}
		if (staleChannels.has(binding.channel)) {
			state.isStale = true;
		}
	}
}

function extractAssetKeyTelemetry(
	assetKey: string | undefined,
	values: Map<string, TelemetrySample>,
	staleChannels: Set<string>,
	state: {
		values: Record<string, TelemetryValue>;
		status: "running" | "maintenance" | "offline" | "unknown";
		isStale: boolean;
		hasAny: boolean;
		observedAt?: string;
	},
): void {
	if (!assetKey) return;
	const statusSample =
		values.get(`${assetKey}.status`) ?? values.get(`${assetKey}:status`);
	if (statusSample) {
		state.hasAny = true;
		if (typeof statusSample.value === "string") {
			state.status = statusSample.value as any;
		}
		if (statusSample.observedAt) state.observedAt = statusSample.observedAt;
		if (staleChannels.has(statusSample.channel)) state.isStale = true;
	}

	const fields = [
		"loadPct",
		"powerKw",
		"temperatureC",
		"vibrationMmS",
		"rpm",
		"speedMps",
	] as const;
	const aliases: Record<string, string> = {
		loadPct: "load",
		powerKw: "power",
		temperatureC: "temperature",
		vibrationMmS: "vibration",
		speedMps: "speed",
	};

	for (const f of fields) {
		const s =
			values.get(`${assetKey}.${f}`) ??
			values.get(`${assetKey}:${f}`) ??
			values.get(`${assetKey}:${aliases[f]}`);
		if (s) {
			state.hasAny = true;
			state.values[f] = s.value;
			if (s.observedAt) state.observedAt = s.observedAt;
			if (staleChannels.has(s.channel)) state.isStale = true;
		}
	}
}
