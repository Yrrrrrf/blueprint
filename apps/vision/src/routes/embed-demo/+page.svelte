<script lang="ts">
import { onDestroy, onMount } from "svelte";
import {
	createBlankDocument,
	createNaveIndustrialFixture,
	type BlueprintDocument,
	type DeviceEntity,
} from "@sdk/core";
import { BlueprintSession } from "@sdk/state";
import { BlueprintEditor, BlueprintViewer } from "@sdk/ui";

// Document 1 for Viewer A
const doc1: BlueprintDocument = createBlankDocument("Facility A — Packaging Line", {
	documentId: "doc-embed-viewer-a",
	facilityWidthMm: 40000,
	facilityHeightMm: 30000,
});

// Document 2 for Viewer B
const doc2: BlueprintDocument = createNaveIndustrialFixture({
	documentId: "doc-embed-viewer-b",
});

// Document 3 for Standalone Editor C
const doc3: BlueprintDocument = createBlankDocument("Facility C — CNC Cell", {
	documentId: "doc-embed-editor-c",
	facilityWidthMm: 50000,
	facilityHeightMm: 35000,
});

// Create 3 isolated in-memory sessions (no RuneProvider ancestor)
const sessionA = new BlueprintSession({
	document: doc1,
	mode: "viewer",
});

const sessionB = new BlueprintSession({
	document: doc2,
	mode: "viewer",
});

const sessionC = new BlueprintSession({
	document: doc3,
	mode: "editor",
});

let selectionA = $state<readonly string[]>([]);
let selectionB = $state<readonly string[]>([]);
let selectionC = $state<readonly string[]>([]);
let revisionC = $state(doc3.revision);

let unsubA: (() => void) | null = null;
let unsubB: (() => void) | null = null;
let unsubC: (() => void) | null = null;

onMount(() => {
	unsubA = sessionA.subscribe((s) => { selectionA = s.selection; });
	unsubB = sessionB.subscribe((s) => { selectionB = s.selection; });
	unsubC = sessionC.subscribe((s) => {
		selectionC = s.selection;
		revisionC = s.doc.revision;
	});

	// Expose harness on window for automated AC-054 testing
	(window as any).__embedHarness = {
		sessionA,
		sessionB,
		sessionC,
		getSelections: () => ({ a: selectionA, b: selectionB, c: selectionC }),
		hasRuneProvider: () => {
			// Returns false because this route is outside (workspace)
			return false;
		},
		addDeviceToEditor: (x = 5000, y = 5000) => {
			const id = `dev-embed-${Date.now()}`;
			const device: DeviceEntity = {
				id,
				name: "Embedded Machine",
				kind: "device",
				layerId: "layer_machinery",
				groupId: null,
				definitionId: "cnc-mill",
				assetKey: `cnc-${id}`,
				transform: { x, y, rotationDeg: 0 },
				style: { fill: "#10b981", stroke: "#000", strokeWidthMm: 1, opacity: 1, dashMm: [] },
				hidden: false,
				locked: false,
				tags: ["equipment"],
				metadata: {},
				parameters: {},
				ratedPowerKw: 25,
				maintenanceDue: null,
				bindings: [],
			};
			sessionC.execute({ type: "entity.add", entity: device });
			sessionC.setSelection([id]);
			return id;
		},
	};
});

onDestroy(() => {
	unsubA?.();
	unsubB?.();
	unsubC?.();
	sessionA.dispose();
	sessionB.dispose();
	sessionC.dispose();
});

function handleAddDeviceC() {
	(window as any).__embedHarness.addDeviceToEditor(15000, 15000);
}
</script>

<svelte:head>
	<title>AC-054: Embedded Standalone Harness (No RuneProvider)</title>
</svelte:head>

<div class="flex flex-col h-screen w-screen overflow-hidden bg-base-100 text-base-content font-sans">
	<!-- Top Navigation / Test Header -->
	<header class="h-14 bg-base-200 border-b border-base-300 px-4 flex items-center justify-between shrink-0 select-none text-xs">
		<div class="flex items-center gap-3">
			<span class="font-bold text-sm tracking-wide text-primary">AC-054 EMBED HARNESS</span>
			<span id="badge-rune-provider" class="badge badge-sm badge-success font-mono">
				RuneProvider: None (Isolated)
			</span>
			<span class="text-base-content/60 text-[11px]">
				Two Viewers & One Standalone Editor mounting without host context
			</span>
		</div>

		<div class="flex items-center gap-3">
			<button
				id="btn-add-device-c"
				type="button"
				class="btn btn-xs btn-primary font-bold"
				onclick={handleAddDeviceC}
			>
				+ Add Device to Editor C
			</button>
			<a href="/" class="btn btn-xs btn-outline">
				Back to Workspace
			</a>
		</div>
	</header>

	<!-- Main Tri-Panel Grid -->
	<div class="flex-1 grid grid-cols-1 md:grid-cols-3 gap-2 p-2 overflow-hidden bg-base-300/40">
		<!-- Panel 1: Viewer A -->
		<div id="embed-viewer-a-container" class="flex flex-col rounded-xl overflow-hidden border border-base-300 bg-base-100 shadow-sm">
			<div class="h-9 bg-base-200 px-3 flex items-center justify-between border-b border-base-300 shrink-0">
				<div class="flex items-center gap-2">
					<span class="badge badge-xs badge-info font-bold uppercase">Viewer A</span>
					<span class="font-semibold text-xs truncate max-w-[140px]">{doc1.content.name}</span>
				</div>
				<span id="selection-count-a" class="badge badge-xs badge-ghost font-mono text-[10px]">
					sel:{selectionA.length}
				</span>
			</div>
			<div class="flex-1 relative overflow-hidden">
				<BlueprintViewer session={sessionA} doc={sessionA.doc} />
			</div>
		</div>

		<!-- Panel 2: Viewer B -->
		<div id="embed-viewer-b-container" class="flex flex-col rounded-xl overflow-hidden border border-base-300 bg-base-100 shadow-sm">
			<div class="h-9 bg-base-200 px-3 flex items-center justify-between border-b border-base-300 shrink-0">
				<div class="flex items-center gap-2">
					<span class="badge badge-xs badge-info font-bold uppercase">Viewer B</span>
					<span class="font-semibold text-xs truncate max-w-[140px]">{doc2.content.name}</span>
				</div>
				<span id="selection-count-b" class="badge badge-xs badge-ghost font-mono text-[10px]">
					sel:{selectionB.length}
				</span>
			</div>
			<div class="flex-1 relative overflow-hidden">
				<BlueprintViewer session={sessionB} doc={sessionB.doc} />
			</div>
		</div>

		<!-- Panel 3: Editor C -->
		<div id="embed-editor-c-container" class="flex flex-col rounded-xl overflow-hidden border border-base-300 bg-base-100 shadow-sm">
			<div class="h-9 bg-base-200 px-3 flex items-center justify-between border-b border-base-300 shrink-0">
				<div class="flex items-center gap-2">
					<span class="badge badge-xs badge-primary font-bold uppercase">Editor C</span>
					<span class="font-semibold text-xs truncate max-w-[120px]">{doc3.content.name}</span>
					<span id="revision-c" class="badge badge-xs badge-neutral font-mono text-[9px]">rev:{revisionC}</span>
				</div>
				<span id="selection-count-c" class="badge badge-xs badge-ghost font-mono text-[10px]">
					sel:{selectionC.length}
				</span>
			</div>
			<div class="flex-1 relative overflow-hidden">
				<BlueprintEditor session={sessionC} />
			</div>
		</div>
	</div>
</div>
