// ============================================================================
// Blueprint History Engine (§5.2 of Blueprint Specification)
// Bounded memory undo/redo manager, collection-level deltas, gesture preview.
// ============================================================================

import type { BlueprintDocument, Entity, Id, IsoDate } from "./types.ts";
import type {
	BlueprintCommand,
	DocumentChanges,
	DocumentDelta,
	HistoryEntry,
	ReducerEnvironment,
	ReducerResult,
} from "./commands.ts";
import { reduceCommand } from "./reducer.ts";
import { runSpatialChecks } from "./constraints.ts";

// ----------------------------------------------------------------------------
// Limits & Defaults (§5.2, AC-023)
// ----------------------------------------------------------------------------

export const MAX_HISTORY_ENTRIES = 100;
export const MAX_HISTORY_BYTES = 32 * 1024 * 1024; // 32 MiB

// ----------------------------------------------------------------------------
// 1. Serialization Size & Delta Utilities
// ----------------------------------------------------------------------------

export function computeEntrySerializedBytes(entry: HistoryEntry): number {
	const json = JSON.stringify(entry);
	return new TextEncoder().encode(json).byteLength;
}

export const measureEntryBytes = computeEntrySerializedBytes;

export function computeChangesBetweenDocuments(
	beforeDoc: BlueprintDocument,
	afterDoc: BlueprintDocument,
): { beforeChanges: DocumentChanges; afterChanges: DocumentChanges } {
	const beforeChanges: DocumentChanges = {};
	const afterChanges: DocumentChanges = {};

	// Entities
	const bEntities = beforeDoc.content.entities;
	const aEntities = afterDoc.content.entities;
	const allEntityIds = new Set([
		...Object.keys(bEntities),
		...Object.keys(aEntities),
	]);
	const changedEntitiesBefore: Record<Id, Entity | undefined> = {};
	const changedEntitiesAfter: Record<Id, Entity | undefined> = {};
	let entitiesChanged = false;

	for (const id of allEntityIds) {
		const b = bEntities[id];
		const a = aEntities[id];
		if (!b && a) {
			changedEntitiesBefore[id] = undefined;
			changedEntitiesAfter[id] = a;
			entitiesChanged = true;
		} else if (b && !a) {
			changedEntitiesBefore[id] = b;
			changedEntitiesAfter[id] = undefined;
			entitiesChanged = true;
		} else if (b && a) {
			if (JSON.stringify(b) !== JSON.stringify(a)) {
				changedEntitiesBefore[id] = b;
				changedEntitiesAfter[id] = a;
				entitiesChanged = true;
			}
		}
	}

	if (entitiesChanged) {
		beforeChanges.entities = changedEntitiesBefore;
		afterChanges.entities = changedEntitiesAfter;
	}

	// Entity order
	if (
		JSON.stringify(beforeDoc.content.entityOrder) !==
		JSON.stringify(afterDoc.content.entityOrder)
	) {
		beforeChanges.entityOrder = [...beforeDoc.content.entityOrder];
		afterChanges.entityOrder = [...afterDoc.content.entityOrder];
	}

	// Layers
	if (
		JSON.stringify(beforeDoc.content.layers) !==
		JSON.stringify(afterDoc.content.layers)
	) {
		beforeChanges.layers = [...beforeDoc.content.layers];
		afterChanges.layers = [...afterDoc.content.layers];
	}

	// Groups
	if (
		JSON.stringify(beforeDoc.content.groups) !==
		JSON.stringify(afterDoc.content.groups)
	) {
		beforeChanges.groups = [...beforeDoc.content.groups];
		afterChanges.groups = [...afterDoc.content.groups];
	}

	// Definitions
	const bDefs = beforeDoc.content.definitions;
	const aDefs = afterDoc.content.definitions;
	const allDefIds = new Set([...Object.keys(bDefs), ...Object.keys(aDefs)]);
	let defsChanged = false;
	const cDefB: Record<Id, any> = {};
	const cDefA: Record<Id, any> = {};
	for (const id of allDefIds) {
		if (JSON.stringify(bDefs[id]) !== JSON.stringify(aDefs[id])) {
			cDefB[id] = bDefs[id];
			cDefA[id] = aDefs[id];
			defsChanged = true;
		}
	}
	if (defsChanged) {
		beforeChanges.definitions = cDefB;
		afterChanges.definitions = cDefA;
	}

	// Relations
	if (
		JSON.stringify(beforeDoc.content.relations) !==
		JSON.stringify(afterDoc.content.relations)
	) {
		beforeChanges.relations = [...beforeDoc.content.relations];
		afterChanges.relations = [...afterDoc.content.relations];
	}

	// Production Lines
	if (
		JSON.stringify(beforeDoc.content.lines) !==
		JSON.stringify(afterDoc.content.lines)
	) {
		beforeChanges.lines = [...beforeDoc.content.lines];
		afterChanges.lines = [...afterDoc.content.lines];
	}

	// Settings
	if (beforeDoc.content.name !== afterDoc.content.name) {
		beforeChanges.name = beforeDoc.content.name;
		afterChanges.name = afterDoc.content.name;
	}
	if (beforeDoc.content.description !== afterDoc.content.description) {
		beforeChanges.description = beforeDoc.content.description;
		afterChanges.description = afterDoc.content.description;
	}
	if (beforeDoc.content.displayUnit !== afterDoc.content.displayUnit) {
		beforeChanges.displayUnit = beforeDoc.content.displayUnit;
		afterChanges.displayUnit = afterDoc.content.displayUnit;
	}
	if (
		beforeDoc.content.facility.widthMm !== afterDoc.content.facility.widthMm ||
		beforeDoc.content.facility.heightMm !== afterDoc.content.facility.heightMm
	) {
		beforeChanges.facility = { ...beforeDoc.content.facility };
		afterChanges.facility = { ...afterDoc.content.facility };
	}
	if (
		JSON.stringify(beforeDoc.content.grid) !==
		JSON.stringify(afterDoc.content.grid)
	) {
		beforeChanges.grid = { ...beforeDoc.content.grid };
		afterChanges.grid = { ...afterDoc.content.grid };
	}
	if (
		JSON.stringify(beforeDoc.content.metadata) !==
		JSON.stringify(afterDoc.content.metadata)
	) {
		beforeChanges.metadata = { ...beforeDoc.content.metadata };
		afterChanges.metadata = { ...afterDoc.content.metadata };
	}

	return { beforeChanges, afterChanges };
}

export function applyDocumentChanges(
	doc: BlueprintDocument,
	changes: DocumentChanges,
	newRevision: number,
	newTimestamp: IsoDate,
): BlueprintDocument {
	const nextContent = { ...doc.content };

	if (changes.entities) {
		const nextEntities = { ...nextContent.entities };
		for (const [id, entity] of Object.entries(changes.entities)) {
			if (entity === undefined) {
				delete nextEntities[id];
			} else {
				nextEntities[id] = entity;
			}
		}
		nextContent.entities = nextEntities;
	}

	if (changes.entityOrder) {
		nextContent.entityOrder = [...changes.entityOrder];
	}
	if (changes.layers) {
		nextContent.layers = [...changes.layers];
	}
	if (changes.groups) {
		nextContent.groups = [...changes.groups];
	}
	if (changes.definitions) {
		const nextDefs = { ...nextContent.definitions };
		for (const [id, def] of Object.entries(changes.definitions)) {
			if (def === undefined) {
				delete nextDefs[id];
			} else {
				nextDefs[id] = def;
			}
		}
		nextContent.definitions = nextDefs;
	}
	if (changes.assets) {
		const nextAssets = { ...nextContent.assets };
		for (const [id, asset] of Object.entries(changes.assets)) {
			if (asset === undefined) {
				delete nextAssets[id];
			} else {
				nextAssets[id] = asset;
			}
		}
		nextContent.assets = nextAssets;
	}
	if (changes.lines) {
		nextContent.lines = [...changes.lines];
	}
	if (changes.relations) {
		nextContent.relations = [...changes.relations];
	}
	if (changes.name !== undefined) {
		nextContent.name = changes.name;
	}
	if (changes.description !== undefined) {
		nextContent.description = changes.description;
	}
	if (changes.displayUnit !== undefined) {
		nextContent.displayUnit = changes.displayUnit;
	}
	if (changes.facility !== undefined) {
		nextContent.facility = { ...changes.facility };
	}
	if (changes.grid !== undefined) {
		nextContent.grid = { ...changes.grid };
	}
	if (changes.metadata !== undefined) {
		nextContent.metadata = { ...changes.metadata };
	}

	return {
		...doc,
		revision: newRevision,
		updatedAt: newTimestamp,
		content: nextContent,
	};
}

export function computeDeltaFromChanges(
	fromChanges: DocumentChanges,
	toChanges: DocumentChanges,
): DocumentDelta {
	const addedEntityIds: Id[] = [];
	const updatedEntityIds: Id[] = [];
	const deletedEntityIds: Id[] = [];

	if (toChanges.entities) {
		for (const [id, entity] of Object.entries(toChanges.entities)) {
			const fromEntity = fromChanges.entities?.[id];
			if (entity === undefined) {
				deletedEntityIds.push(id);
			} else if (fromEntity === undefined) {
				addedEntityIds.push(id);
			} else {
				updatedEntityIds.push(id);
			}
		}
	}

	return {
		addedEntityIds,
		updatedEntityIds,
		deletedEntityIds,
		settingsChanged:
			toChanges.name !== undefined ||
			toChanges.description !== undefined ||
			toChanges.displayUnit !== undefined ||
			toChanges.facility !== undefined ||
			toChanges.grid !== undefined ||
			toChanges.metadata !== undefined,
	};
}

// ----------------------------------------------------------------------------
// 2. History Manager (§5.2)
// ----------------------------------------------------------------------------

export type HistoryManagerOptions = {
	maxEntries?: number;
	maxBytes?: number;
};

export class HistoryManager {
	private currentDoc: BlueprintDocument;
	private previewDoc: BlueprintDocument | null = null;
	private undoStack: HistoryEntry[] = [];
	private redoStack: HistoryEntry[] = [];
	private env: ReducerEnvironment;
	private maxEntries: number;
	private maxBytes: number;

	constructor(
		initialDoc: BlueprintDocument,
		env: ReducerEnvironment,
		options?: HistoryManagerOptions,
	) {
		this.currentDoc = initialDoc;
		this.env = env;
		this.maxEntries = options?.maxEntries ?? MAX_HISTORY_ENTRIES;
		this.maxBytes = options?.maxBytes ?? MAX_HISTORY_BYTES;
	}

	public getDocument(): BlueprintDocument {
		return this.previewDoc ?? this.currentDoc;
	}

	public getCommittedDocument(): BlueprintDocument {
		return this.currentDoc;
	}

	public setDocument(doc: BlueprintDocument): void {
		this.currentDoc = doc;
		this.previewDoc = null;
	}

	public setEnvironment(env: ReducerEnvironment): void {
		this.env = env;
	}

	public getEnvironment(): ReducerEnvironment {
		return this.env;
	}

	public getUndoStack(): readonly HistoryEntry[] {
		return this.undoStack;
	}

	public getRedoStack(): readonly HistoryEntry[] {
		return this.redoStack;
	}

	public canUndo(): boolean {
		return this.env.mode !== "preview" && this.undoStack.length > 0;
	}

	public canRedo(): boolean {
		return this.env.mode !== "preview" && this.redoStack.length > 0;
	}

	public clear(): void {
		this.undoStack = [];
		this.redoStack = [];
		this.previewDoc = null;
	}

	public getTotalBytes(): number {
		let sum = 0;
		for (const e of this.undoStack) sum += e.serializedBytes ?? 0;
		for (const e of this.redoStack) sum += e.serializedBytes ?? 0;
		return sum;
	}

	/**
	 * Preview a gesture state without committing to history or incrementing revision (AC-018).
	 */
	public preview(doc: BlueprintDocument | null): void {
		this.previewDoc = doc;
	}

	/**
	 * Executes a command against the document authority (§5.1, §5.2).
	 */
	public execute(cmd: BlueprintCommand): ReducerResult {
		// Preview mode check (§5.1, AC-016)
		if (this.env.mode === "preview") {
			return {
				success: false,
				error: {
					code: "READ_ONLY",
					message: "Document is in preview mode (read-only)",
				},
			};
		}

		if (cmd.type === "history.undo") {
			return this.undo();
		}
		if (cmd.type === "history.redo") {
			return this.redo();
		}

		const oldDoc = this.currentDoc;
		const result = reduceCommand(oldDoc, cmd, this.env);

		if (!result.success) {
			return result;
		}

		// Net-zero gesture detection (AC-019)
		if (result.noChange) {
			this.previewDoc = null;
			return result;
		}

		const newDoc = result.document;
		const { beforeChanges, afterChanges } = computeChangesBetweenDocuments(
			oldDoc,
			newDoc,
		);

		const affectedIds: Id[] = [
			...result.delta.addedEntityIds,
			...result.delta.updatedEntityIds,
			...result.delta.deletedEntityIds,
		];

		const entry: HistoryEntry = {
			id: this.env.idFactory(),
			label: (cmd as { label?: string }).label ?? cmd.type,
			beforeChanges,
			afterChanges,
			affectedIds,
			timestamp: this.env.clock(),
		};

		const entryBytes = computeEntrySerializedBytes(entry);
		if (entryBytes > this.maxBytes) {
			// AC-023: Reject before commit with HISTORY_LIMIT
			return {
				success: false,
				error: {
					code: "HISTORY_LIMIT",
					message: `History entry size (${entryBytes} bytes) exceeds limit of ${this.maxBytes} bytes`,
				},
			};
		}

		entry.serializedBytes = entryBytes;

		// Commit document
		this.currentDoc = newDoc;
		this.previewDoc = null;

		// AC-020: New mutation after undo clears redo stack
		this.redoStack = [];
		this.undoStack.push(entry);

		// AC-023: Evict oldest complete entries to stay within bounds
		this.enforceBounds();

		return result;
	}

	/**
	 * Restores the semantic content prior to the most recent transaction (AC-020, AC-021).
	 */
	public undo(): ReducerResult {
		if (this.env.mode === "preview") {
			return {
				success: false,
				error: {
					code: "READ_ONLY",
					message: "Document is in preview mode (read-only)",
				},
			};
		}

		if (this.undoStack.length === 0) {
			return {
				success: false,
				error: {
					code: "CANNOT_UNDO",
					message: "Undo stack is empty",
				},
			};
		}

		const entry = this.undoStack.pop()!;
		// Revision remains strictly monotonic (§4.4, AC-020)
		const nextRevision = this.currentDoc.revision + 1;
		const nextTimestamp = this.env.clock();

		const restoredDoc = applyDocumentChanges(
			this.currentDoc,
			entry.beforeChanges,
			nextRevision,
			nextTimestamp,
		);

		this.currentDoc = restoredDoc;
		this.previewDoc = null;
		this.redoStack.push(entry);
		this.enforceBounds();

		const delta = computeDeltaFromChanges(
			entry.afterChanges,
			entry.beforeChanges,
		);
		const issues = runSpatialChecks(restoredDoc);

		return {
			success: true,
			document: restoredDoc,
			delta,
			issues,
		};
	}

	/**
	 * Reapplies the transaction at the top of the redo stack (AC-020).
	 */
	public redo(): ReducerResult {
		if (this.env.mode === "preview") {
			return {
				success: false,
				error: {
					code: "READ_ONLY",
					message: "Document is in preview mode (read-only)",
				},
			};
		}

		if (this.redoStack.length === 0) {
			return {
				success: false,
				error: {
					code: "CANNOT_REDO",
					message: "Redo stack is empty",
				},
			};
		}

		const entry = this.redoStack.pop()!;
		// Revision remains strictly monotonic (§4.4, AC-020)
		const nextRevision = this.currentDoc.revision + 1;
		const nextTimestamp = this.env.clock();

		const reappliedDoc = applyDocumentChanges(
			this.currentDoc,
			entry.afterChanges,
			nextRevision,
			nextTimestamp,
		);

		this.currentDoc = reappliedDoc;
		this.previewDoc = null;
		this.undoStack.push(entry);
		this.enforceBounds();

		const delta = computeDeltaFromChanges(
			entry.beforeChanges,
			entry.afterChanges,
		);
		const issues = runSpatialChecks(reappliedDoc);

		return {
			success: true,
			document: reappliedDoc,
			delta,
			issues,
		};
	}

	/**
	 * Enforces max entries count and total byte cap by evicting oldest complete entries (§5.2, AC-023).
	 */
	private enforceBounds(): void {
		while (
			this.undoStack.length > this.maxEntries ||
			this.getTotalBytes() > this.maxBytes
		) {
			if (this.undoStack.length === 0) break;
			// Evict oldest whole entry from bottom of undo stack
			this.undoStack.shift();
		}
	}
}
