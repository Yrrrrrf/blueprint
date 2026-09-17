<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { getLayoutStore, WorkspaceLayout } from "rune-lab/layout";
import {
	getCommandStore,
	getRegistryStore,
	getToastStore,
	useShortcuts,
} from "rune-lab/palettes";
import {
	BlueprintCanvas,
} from "@sdk/ui";
import { BlueprintSession } from "@sdk/state";
import {
	BUILTIN_DEFINITIONS,
	type BlueprintDocument,
	type DeviceEntity,
	type Id,
} from "@sdk/core";
import { getBlueprintStore } from "./plugin.ts";
import {
	createIndustrialDocument,
	createIndustrialSimulator,
	createNewDocument,
	getDocumentRepository,
	readDocumentFromFileInput,
} from "./runtime.ts";
import { isEditableTarget, registerBlueprintCommands } from "./commands.ts";
import Header from "./panels/Header.svelte";
import WorkspaceStrip from "./panels/WorkspaceStrip.svelte";
import NavigationPanel from "./panels/NavigationPanel.svelte";
import DetailPanel from "./panels/DetailPanel.svelte";
import StatusBar from "./panels/StatusBar.svelte";

interface Props {
	initialDoc?: BlueprintDocument;
	readOnly?: boolean;
	borrowedSession?: BlueprintSession;
	instanceId?: string;
}

let {
	initialDoc,
	readOnly = false,
	borrowedSession,
	instanceId = `bp-host-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
}: Props = $props();

const layoutStore = getLayoutStore();
const commandStore = getCommandStore();
const registryStore = getRegistryStore();
const toastStore = getToastStore();
const blueprintStore = getBlueprintStore();

let hostContainerEl = $state<HTMLDivElement | null>(null);
let fileInputEl = $state<HTMLInputElement | null>(null);

// Session state
let ownedSession: BlueprintSession | null = null;
let currentSession = $state<BlueprintSession | null>(null);
let unregisterSession: (() => void) | null = null;
let unregisterCommands: (() => void) | null = null;
let previousPreset: string | null = null;

// Telemetry state
let isSimulated = $state(false);
let simulatorCleanup: (() => void) | null = null;

// UI View State
let cursorWorld = $state<{ x: number; y: number } | null>(null);
let prefs = $derived(blueprintStore.preferences);

// Modals State
let exportModalFormat = $state<string | null>(null);
let revisionModalAction = $state<string | null>(null);
let dirtyPromptAction = $state<(() => void) | null>(null);

// Keyboard placement modal state
let keyboardPlacementDefId = $state<string | null>(null);
let keyboardPlaceX = $state(10000);
let keyboardPlaceY = $state(10000);

// Host shortcuts
useShortcuts([
	{
		id: "blueprint.shortcut.save",
		keys: "ctrl+s,cmd+s",
		label: "Save Document",
		category: "File",
		handler: (e) => {
			if (isEditableTarget(e)) return;
			e.preventDefault();
			if (currentSession && currentSession.mode !== "viewer") {
				currentSession.save().then(() => {
					toastStore.success("Document saved successfully");
				}).catch((err) => {
					toastStore.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
				});
			}
		},
	},
	{
		id: "blueprint.shortcut.open",
		keys: "ctrl+o,cmd+o",
		label: "Open Document",
		category: "File",
		handler: (e) => {
			if (isEditableTarget(e)) return;
			e.preventDefault();
			handleRequestOpenFile();
		},
	},
	{
		id: "blueprint.shortcut.fit",
		keys: "ctrl+0,cmd+0",
		label: "Fit Facility",
		category: "View",
		handler: (e) => {
			if (isEditableTarget(e)) return;
			e.preventDefault();
			currentSession?.renderer?.fit();
		},
	},
]);

function attachSession(s: BlueprintSession) {
	currentSession = s;
	unregisterSession?.();
	unregisterSession = blueprintStore.register(instanceId, s, hostContainerEl);
	blueprintStore.activate(instanceId);
}

function startSimulator(session: BlueprintSession) {
	stopSimulator();
	const sim = createIndustrialSimulator();
	session.setTelemetrySource(sim);
	sim.start();
	isSimulated = true;
	simulatorCleanup = () => {
		session.setTelemetrySource(null);
		sim.stop();
		isSimulated = false;
	};
}

function stopSimulator() {
	if (simulatorCleanup) {
		simulatorCleanup();
		simulatorCleanup = null;
	}
	isSimulated = false;
}

onMount(() => {
	// 1. Preset workspace layout once (§6)
	previousPreset = layoutStore.preset;
	layoutStore.applyPreset("workspace");

	// 2. Initialize or adopt session
	if (borrowedSession) {
		currentSession = borrowedSession;
		if (readOnly && currentSession.mode !== "viewer") {
			currentSession.setMode("viewer");
		}
		attachSession(currentSession);
	} else {
		initDefaultSession();
	}

	// 3. Register global commands
	unregisterCommands = registerBlueprintCommands(
		commandStore,
		blueprintStore,
		toastStore,
		{
			onNewDocument: handleRequestNewDocument,
			onOpenFilePicker: handleRequestOpenFile,
			onOpenExample: handleRequestOpenExample,
			onRequestExportModal: (format) => { exportModalFormat = format; },
			onRequestRevisionModal: (action) => { revisionModalAction = action; },
		},
	);
});

async function initDefaultSession() {
	let docToLoad = initialDoc;
	const repo = getDocumentRepository();

	if (!docToLoad) {
		try {
			const existingDocs = await repo.list();
			if (existingDocs.length > 0) {
				// Returning user: recover latest saved document (§4)
				const loaded = await repo.load(existingDocs[0].id);
				if (loaded) {
					docToLoad = loaded;
				}
			}
		} catch {
			// Nonfatal repository check
		}
	}

	// First visit or empty storage: provide deterministic industrial fixture (§2, §6, §8.2)
	if (!docToLoad) {
		docToLoad = createIndustrialDocument();
	}

	ownedSession = new BlueprintSession({
		document: docToLoad,
		mode: readOnly ? "viewer" : "editor",
		repository: repo,
	});
	currentSession = ownedSession;
	attachSession(currentSession);

	// If document has industrial equipment, start simulator
	if (currentSession && Object.keys(currentSession.doc.content.entities).length > 2) {
		startSimulator(currentSession);
	}
}

onDestroy(() => {
	stopSimulator();
	unregisterCommands?.();
	unregisterSession?.();
	if (ownedSession) {
		ownedSession.dispose();
		ownedSession = null;
	}
	// Restore previous preset
	if (previousPreset && previousPreset !== "workspace") {
		layoutStore.applyPreset(previousPreset);
	}
});

// Document Switch & Dirty-Work Handling (§4, §7.1)
function confirmDirtyWork(action: () => void) {
	if (currentSession?.isDirty) {
		dirtyPromptAction = action;
	} else {
		action();
	}
}

function handleRequestNewDocument() {
	confirmDirtyWork(() => {
		stopSimulator();
		const freshDoc = createNewDocument();
		const repo = getDocumentRepository();
		ownedSession?.dispose();
		ownedSession = new BlueprintSession({
			document: freshDoc,
			mode: "editor",
			repository: repo,
		});
		attachSession(ownedSession);
		toastStore.send("Created new blank facility", "info");
	});
}

function handleRequestOpenExample() {
	confirmDirtyWork(() => {
		stopSimulator();
		const fixtureDoc = createIndustrialDocument();
		const repo = getDocumentRepository();
		ownedSession?.dispose();
		ownedSession = new BlueprintSession({
			document: fixtureDoc,
			mode: "editor",
			repository: repo,
		});
		attachSession(ownedSession);
		startSimulator(ownedSession);
		toastStore.success("Opened industrial facility example");
	});
}

function handleRequestOpenFile() {
	confirmDirtyWork(() => {
		fileInputEl?.click();
	});
}

async function handleFileSelected(e: Event) {
	try {
		const result = await readDocumentFromFileInput(e);
		if (!result) return;
		const { doc, filename } = result;
		stopSimulator();
		ownedSession?.dispose();
		ownedSession = new BlueprintSession({
			document: doc,
			mode: "editor",
			repository: getDocumentRepository(),
		});
		attachSession(ownedSession);
		toastStore.success(`Opened "${doc.content.name || filename}"`);
	} catch (err) {
		toastStore.error(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`);
	}
}

// Keyboard Catalog Placement (§7.2, AC-058)
function handleOpenKeyboardPlacement(defId: string) {
	keyboardPlacementDefId = defId;
	if (currentSession?.renderer) {
		const cam = currentSession.renderer.getCamera();
		keyboardPlaceX = Math.round(cam.centerMm.x);
		keyboardPlaceY = Math.round(cam.centerMm.y);
	} else {
		keyboardPlaceX = 10000;
		keyboardPlaceY = 10000;
	}
}

function handleCommitKeyboardPlacement() {
	if (!currentSession || !keyboardPlacementDefId || currentSession.mode === "viewer") return;
	const def = BUILTIN_DEFINITIONS[keyboardPlacementDefId];
	if (!def) return;

	const id: Id = `dev-${Date.now()}`;
	const dev: DeviceEntity = {
		id,
		name: `${def.name} ${Date.now().toString().slice(-4)}`,
		kind: "device",
		layerId: "layer_machinery",
		groupId: null,
		definitionId: def.id,
		assetKey: `asset-${id.slice(-6)}`,
		transform: { x: keyboardPlaceX, y: keyboardPlaceY, rotationDeg: 0 },
		style: { fill: "#6366f1", stroke: "#000", strokeWidthMm: 1, opacity: 1, dashMm: [] },
		hidden: false,
		locked: false,
		tags: [def.category],
		metadata: {},
		parameters: {},
		ratedPowerKw: 10,
		maintenanceDue: null,
		bindings: [],
	};

	currentSession.execute({
		type: "entity.add",
		entity: dev,
	});
	currentSession.setSelection([id]);
	keyboardPlacementDefId = null;
	toastStore.success(`Placed ${def.name} at (${keyboardPlaceX}, ${keyboardPlaceY})`);
}

let activeTool = $derived(currentSession?.activeTool ?? "select");
let isDrawingTool = $derived(
	activeTool === "wall" || activeTool === "opening" || activeTool === "zone"
);
</script>

<!-- Hidden File Input for Native JSON Upload -->
<input
	bind:this={fileInputEl}
	type="file"
	accept=".json,application/json"
	class="hidden"
	onchange={handleFileSelected}
/>

<div
	bind:this={hostContainerEl}
	class="w-full h-full min-h-[100dvh] flex flex-col bg-base-100 text-base-content overflow-hidden select-none outline-none"
	tabindex="-1"
>
	<WorkspaceLayout>
		{#snippet workspaceStrip()}
			<WorkspaceStrip session={currentSession} />
		{/snippet}

		{#snippet navigationPanel()}
			<NavigationPanel
				session={currentSession}
				activeTab={prefs.navigationTab}
				onTabChange={(t) => blueprintStore.updatePreferences({ navigationTab: t })}
				onRequestKeyboardPlacement={handleOpenKeyboardPlacement}
			/>
		{/snippet}

		{#snippet content()}
			<div class="h-full w-full flex flex-col overflow-hidden relative bg-base-100">
				<Header
					session={currentSession}
					{isSimulated}
					onNewDocument={handleRequestNewDocument}
					onOpenFilePicker={handleRequestOpenFile}
					onOpenExample={handleRequestOpenExample}
					onOpenCommands={() => registryStore.open("commands")}
					onOpenSettings={() => registryStore.open("settings")}
					onRequestExportModal={(fmt) => { exportModalFormat = fmt; }}
				/>

				<!-- Main Canvas Host -->
				<div class="flex-1 w-full h-full relative overflow-hidden bg-base-100">
					{#if currentSession}
						<BlueprintCanvas
							session={currentSession}
							onCursorMove={(pt: { x: number; y: number }) => { cursorWorld = pt; }}
						/>
					{:else}
						<div class="flex items-center justify-center h-full w-full">
							<span class="loading loading-spinner loading-lg text-primary"></span>
						</div>
					{/if}

					<!-- Floating Tool Instruction Banner -->
					{#if isDrawingTool && currentSession?.mode !== "viewer"}
						<div class="absolute top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
							<div class="badge badge-lg badge-neutral gap-2 shadow-lg border border-base-300 px-4 py-3 font-medium text-xs">
								<span>✏️</span>
								<span>
									Drawing <strong>{activeTool.toUpperCase()}</strong>: Click to place points. Double-click or press Enter to finish. Escape to cancel.
								</span>
							</div>
						</div>
					{/if}
				</div>
			</div>
		{/snippet}

		{#snippet detailPanel()}
			<DetailPanel
				session={currentSession}
				activeTab={prefs.detailTab}
				{isSimulated}
				onTabChange={(t) => blueprintStore.updatePreferences({ detailTab: t })}
				onBindSimulator={() => { if (currentSession) startSimulator(currentSession); }}
				onUnbindSimulator={stopSimulator}
			/>
		{/snippet}

		{#snippet statusbar()}
			<StatusBar
				session={currentSession}
				{cursorWorld}
				snapEnabled={prefs.snapEnabled}
				displayUnit={prefs.displayUnit}
				{isSimulated}
				onToggleSnap={() => blueprintStore.updatePreferences({ snapEnabled: !prefs.snapEnabled })}
			/>
		{/snippet}
	</WorkspaceLayout>
</div>

<!-- MODAL 1: Staged Export Notice (§2, §9) -->
{#if exportModalFormat}
	<div class="modal modal-open z-50">
		<div class="modal-box max-w-md">
			<h3 class="font-bold text-base flex items-center gap-2">
				<span>📦</span> Export {exportModalFormat}
			</h3>
			<p class="py-3 text-xs text-base-content/70 leading-relaxed">
				The <strong>{exportModalFormat}</strong> exporter workflow is reserved for later delivery milestones (WP-13 / WP-14 / WP-15).
			</p>
			<p class="text-xs text-base-content/70 leading-relaxed">
				Full lossless facility layout data is operational right now using <strong>Download Blueprint JSON</strong>.
			</p>
			<div class="modal-action">
				<button
					type="button"
					class="btn btn-sm btn-outline"
					onclick={() => {
						if (currentSession) {
							import("./runtime.ts").then(m => m.downloadNativeDocument(currentSession!.doc));
						}
						exportModalFormat = null;
					}}
				>
					Download Blueprint JSON
				</button>
				<button
					type="button"
					class="btn btn-sm btn-primary"
					onclick={() => { exportModalFormat = null; }}
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- MODAL 2: Staged Revision Notice (§2, §9) -->
{#if revisionModalAction}
	<div class="modal modal-open z-50">
		<div class="modal-box max-w-md">
			<h3 class="font-bold text-base flex items-center gap-2">
				<span>📝</span> {revisionModalAction}
			</h3>
			<p class="py-3 text-xs text-base-content/70 leading-relaxed">
				Snapshot creation, proposal diffs, and engineering approval workflows are reserved for <strong>WP-12</strong>.
			</p>
			<div class="modal-action">
				<button
					type="button"
					class="btn btn-sm btn-primary"
					onclick={() => { revisionModalAction = null; }}
				>
					OK
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- MODAL 3: Dirty Work Discard Confirmation (§4, §7.1) -->
{#if dirtyPromptAction}
	<div class="modal modal-open z-50">
		<div class="modal-box max-w-md">
			<h3 class="font-bold text-base text-warning flex items-center gap-2">
				<span>⚠️</span> Unsaved Changes
			</h3>
			<p class="py-3 text-xs text-base-content/70 leading-relaxed">
				You have unsaved changes in the current facility layout. Would you like to save or download before proceeding?
			</p>
			<div class="modal-action flex-wrap gap-2">
				<button
					type="button"
					class="btn btn-sm btn-outline"
					onclick={() => {
						if (currentSession) {
							import("./runtime.ts").then(m => m.downloadNativeDocument(currentSession!.doc));
						}
					}}
				>
					Download JSON
				</button>
				<button
					type="button"
					class="btn btn-sm btn-error"
					onclick={() => {
						const act = dirtyPromptAction;
						dirtyPromptAction = null;
						act?.();
					}}
				>
					Discard Changes
				</button>
				<button
					type="button"
					class="btn btn-sm btn-ghost"
					onclick={() => { dirtyPromptAction = null; }}
				>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- MODAL 4: Keyboard Equipment Placement (§7.2, AC-058) -->
{#if keyboardPlacementDefId}
	{@const def = BUILTIN_DEFINITIONS[keyboardPlacementDefId]}
	<div class="modal modal-open z-50">
		<div class="modal-box max-w-sm">
			<h3 class="font-bold text-sm flex items-center gap-2">
				<span>⌨️</span> Place {def?.name ?? "Equipment"}
			</h3>
			<p class="text-xs text-base-content/60 py-1">
				Enter world coordinates (mm) for keyboard placement:
			</p>
			<div class="flex flex-col gap-2.5 my-2">
				<div class="form-control">
					<label for="kbd-x" class="label py-0.5 text-xs font-mono">X Coordinate (mm)</label>
					<input
						id="kbd-x"
						type="number"
						class="input input-bordered input-sm font-mono"
						bind:value={keyboardPlaceX}
					/>
				</div>
				<div class="form-control">
					<label for="kbd-y" class="label py-0.5 text-xs font-mono">Y Coordinate (mm)</label>
					<input
						id="kbd-y"
						type="number"
						class="input input-bordered input-sm font-mono"
						bind:value={keyboardPlaceY}
					/>
				</div>
			</div>
			<div class="modal-action">
				<button
					type="button"
					class="btn btn-sm btn-ghost"
					onclick={() => { keyboardPlacementDefId = null; }}
				>
					Cancel
				</button>
				<button
					type="button"
					class="btn btn-sm btn-primary"
					onclick={handleCommitKeyboardPlacement}
				>
					Place
				</button>
			</div>
		</div>
	</div>
{/if}
