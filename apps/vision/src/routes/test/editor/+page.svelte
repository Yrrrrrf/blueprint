<script lang="ts">
import { onDestroy, onMount } from "svelte";
import {
	createBlankDocument,
	type DeviceEntity,
	type BlueprintDocument,
} from "@sdk/core";
import { parseNativeDocument, serializeNativeDocument } from "@sdk/api";
import { BlueprintSession } from "@sdk/state";
import { BlueprintEditor, BlueprintViewer } from "@sdk/ui";
import { downloadNativeDocument } from "../../../lib/blueprint/runtime.ts";

let session: BlueprintSession = $state(
	new BlueprintSession({
		document: createBlankDocument(),
		mode: "editor",
	}),
);

let docRevision = $state(0);
let docMode = $state<"editor" | "viewer">("editor");
let activeTool = $state("select");
let selection = $state<readonly string[]>([]);
let downloadedJson = $state<string | null>(null);
let fileInputEl: HTMLInputElement;

// Inspector draft tracking for AC-039 / AC-040
let inspectorDraftValue = $state("");
let inspectorOriginalValue = $state("");
let inspectorError = $state<string | null>(null);

$effect(() => {
	const s = session;
	docRevision = s.doc.revision;
	docMode = s.mode;
	activeTool = s.activeTool;
	selection = s.selection;

	return s.subscribe((updated) => {
		docRevision = updated.doc.revision;
		docMode = updated.mode;
		activeTool = updated.activeTool;
		selection = updated.selection;

		if (selection.length > 0) {
			const ent = updated.doc.content.entities[selection[0]];
			if (ent) {
				inspectorOriginalValue = ent.name;
				inspectorDraftValue = ent.name;
			}
		}
	});
});

onMount(() => {
	(window as any).__editorHarness = {
		getSession: () => session,
		setSession: (s: BlueprintSession) => { session = s; },
		createBlank: () => {
			const doc = createBlankDocument();
			session = new BlueprintSession({ document: doc, mode: "editor" });
		},
		addDevice: (x = 100, y = 100) => {
			const id = `dev-${Date.now()}`;
			const device: DeviceEntity = {
				id,
				name: "CNC Machine 01",
				kind: "device",
				layerId: "layer_machinery",
				groupId: null,
				definitionId: "cnc-mill",
				assetKey: "cnc-01",
				transform: { x, y, rotationDeg: 0 },
				style: { fill: "#4f46e5", stroke: "#000", strokeWidthMm: 1, opacity: 1, dashMm: [] },
				hidden: false,
				locked: false,
				tags: ["equipment"],
				metadata: {},
				parameters: {},
				ratedPowerKw: 15,
				maintenanceDue: null,
				bindings: [],
			};
			session.execute({ type: "entity.add", entity: device });
			session.setSelection([id]);
			return id;
		},
		getDownloadedJson: () => downloadedJson,
	};
});

onDestroy(() => {
	session?.dispose();
});

function handleAddDevice() {
	(window as any).__editorHarness.addDevice(150, 150);
}

function handleDownloadJson() {
	downloadedJson = serializeNativeDocument(session.doc);
	downloadNativeDocument(session.doc);
}

async function handleFileSelected(e: Event) {
	const input = e.target as HTMLInputElement;
	if (!input.files || input.files.length === 0) return;
	const file = input.files[0];
	const text = await file.text();
	const parsed = parseNativeDocument(text);
	if (parsed.valid && parsed.document) {
		session = new BlueprintSession({
			document: parsed.document,
			mode: "editor",
		});
	}
}

function handleInspectorCommit() {
	if (selection.length === 0) return;
	const entId = selection[0];
	if (!inspectorDraftValue || inspectorDraftValue.trim().length === 0) {
		inspectorError = "Name cannot be empty";
		return;
	}
	inspectorError = null;
	session.execute({
		type: "entity.update",
		id: entId,
		patch: { name: inspectorDraftValue },
	});
}

function handleInspectorKeyDown(e: KeyboardEvent) {
	if (e.key === "Escape") {
		// Revert draft and clear error (AC-040)
		inspectorDraftValue = inspectorOriginalValue;
		inspectorError = null;
		e.stopPropagation();
	} else if (e.key === "Enter") {
		handleInspectorCommit();
	}
}
</script>

<div class="flex flex-col h-screen w-screen overflow-hidden bg-base-100 text-base-content">
	<!-- Test Navigation & Metrics Header -->
	<header class="h-12 bg-base-200 border-b border-base-300 px-4 flex items-center justify-between text-xs shrink-0 select-none">
		<div class="flex items-center gap-3">
			<span class="font-bold text-sm tracking-wide text-primary">C-02 EDITOR HARNESS</span>
			<span id="doc-revision" class="badge badge-sm badge-neutral font-mono">rev:{docRevision}</span>
			<span id="doc-mode" class="badge badge-sm badge-outline font-mono">mode:{docMode}</span>
			<span id="active-tool" class="badge badge-sm badge-ghost font-mono">tool:{activeTool}</span>
			<span id="selection-count" class="badge badge-sm badge-info font-mono">selected:{selection.length}</span>
		</div>

		<div class="flex items-center gap-2">
			<button id="btn-add-device" type="button" class="btn btn-xs btn-primary" onclick={handleAddDevice}>
				Add Device
			</button>
			<button id="btn-switch-mode" type="button" class="btn btn-xs btn-outline" onclick={() => session.setMode(docMode === 'editor' ? 'viewer' : 'editor')}>
				{docMode === 'editor' ? 'Switch to Viewer' : 'Switch to Editor'}
			</button>
			<button id="btn-download-json" type="button" class="btn btn-xs btn-secondary" onclick={handleDownloadJson}>
				Download JSON
			</button>
			<label class="btn btn-xs btn-outline cursor-pointer">
				Upload JSON
				<input id="native-file-input" bind:this={fileInputEl} type="file" accept=".json,application/json" class="hidden" onchange={handleFileSelected} />
			</label>
		</div>
	</header>

	<!-- Main Editor or Viewer Body -->
	<div class="flex-1 flex overflow-hidden relative">
		{#if docMode === "editor"}
			<div class="flex-1 h-full">
				<BlueprintEditor {session} />
			</div>
		{:else}
			<div class="flex-1 h-full">
				<BlueprintViewer {session} doc={session.doc} />
			</div>
		{/if}

		<!-- Test Dedicated Inspector Box for text-undo isolation (AC-039, AC-040) -->
		<aside id="test-inspector" class="w-64 border-l border-base-300 bg-base-200/50 p-3 flex flex-col gap-3">
			<h3 class="font-bold text-xs">Test Inspector Inputs</h3>
			{#if selection.length > 0}
				<div class="form-control">
					<label for="inspector-name-input" class="label text-[10px] py-0.5">Entity Name</label>
					<input
						id="inspector-name-input"
						type="text"
						bind:value={inspectorDraftValue}
						onkeydown={handleInspectorKeyDown}
						class="input input-bordered input-xs font-mono"
					/>
					{#if inspectorError}
						<span id="inspector-error" class="text-error text-[10px] mt-1">{inspectorError}</span>
					{/if}
				</div>
				<button id="btn-commit-name" type="button" class="btn btn-xs btn-accent" onclick={handleInspectorCommit}>
					Commit Edit
				</button>
			{:else}
				<p class="text-xs opacity-50">Select an entity to inspect</p>
			{/if}
		</aside>
	</div>
</div>
