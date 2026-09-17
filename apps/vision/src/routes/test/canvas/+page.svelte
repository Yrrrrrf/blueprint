<script lang="ts">
import { onDestroy, onMount } from "svelte";
import {
	createBlankDocument,
	type DeviceEntity,
	type ShapeEntity,
} from "@sdk/core";
import {
	clientToViewPoint,
	PaperRenderer,
	viewToWorld,
	zoomAtViewPoint,
} from "@sdk/renderer";
import { BlueprintSession } from "@sdk/state";

// ----------------------------------------------------------------------------
// AC-024: Two independent visible canvases + dynamic 3rd export scope
// ----------------------------------------------------------------------------
let canvasAEl: HTMLCanvasElement;
let canvasBEl: HTMLCanvasElement;
let rendererA: PaperRenderer;
let rendererB: PaperRenderer;
let sessionA: BlueprintSession;
let sessionB: BlueprintSession;

// ----------------------------------------------------------------------------
// AC-025: Offset scrolled container
// ----------------------------------------------------------------------------
let scrollContainerEl: HTMLDivElement;
let offsetCanvasEl: HTMLCanvasElement;
let offsetRenderer: PaperRenderer;
let offsetSession: BlueprintSession;
let offsetPicked: string | null = $state(null);
let offsetWorldCoords: { x: number; y: number } | null = $state(null);

// ----------------------------------------------------------------------------
// AC-026: DPR Canvas
// ----------------------------------------------------------------------------
let dprCanvasEl: HTMLCanvasElement;
let dprRenderer: PaperRenderer;
let dprSession: BlueprintSession;

// ----------------------------------------------------------------------------
// AC-027: Wheel Zoom Canvas
// ----------------------------------------------------------------------------
let zoomCanvasEl: HTMLCanvasElement;
let zoomRenderer: PaperRenderer;
let zoomSession: BlueprintSession;

// ----------------------------------------------------------------------------
// AC-028: Collapsible Panel Canvas
// ----------------------------------------------------------------------------
let collapsibleContainerEl: HTMLDivElement;
let collapsibleCanvasEl: HTMLCanvasElement;
let collapsibleRenderer: PaperRenderer;
let collapsibleSession: BlueprintSession;
let isPanelCollapsed = $state(false);

// ----------------------------------------------------------------------------
// AC-029: Layer Picking Canvas (Hidden vs Locked)
// ----------------------------------------------------------------------------
let layerCanvasEl: HTMLCanvasElement;
let layerRenderer: PaperRenderer;
let layerSession = $state<BlueprintSession | null>(null);
let layerPickedEntityId: string | null = $state(null);

onMount(() => {
	// 1. Setup AC-024
	const docA = createBlankDocument();
	docA.content.name = "Doc A";
	sessionA = new BlueprintSession({ document: docA, mode: "editor" });
	rendererA = new PaperRenderer({
		canvas: canvasAEl,
		width: 400,
		height: 300,
		document: docA,
	});
	sessionA.attachRenderer(rendererA);

	const docB = createBlankDocument();
	docB.content.name = "Doc B";
	sessionB = new BlueprintSession({ document: docB, mode: "editor" });
	rendererB = new PaperRenderer({
		canvas: canvasBEl,
		width: 400,
		height: 300,
		document: docB,
	});
	sessionB.attachRenderer(rendererB);

	// 2. Setup AC-025 (offset container)
	const docOffset = createBlankDocument();
	docOffset.content.name = "Doc Offset";
	offsetSession = new BlueprintSession({ document: docOffset, mode: "editor" });
	const rectEntity: ShapeEntity = {
		id: "shape-offset-100",
		name: "Offset Rect",
		kind: "shape",
		layerId: "layer_foundation",
		groupId: null,
		transform: { x: 100, y: 100, rotationDeg: 0 },
		style: { fill: "#ff0000", stroke: "#000", strokeWidthMm: 2, opacity: 1, dashMm: [] },
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		structural: false,
		geometry: { kind: "rect", width: 50, height: 50, cornerRadius: 0 },
	};
	offsetSession.execute({ type: "entity.add", entity: rectEntity });
	offsetRenderer = new PaperRenderer({
		canvas: offsetCanvasEl,
		width: 400,
		height: 300,
		document: offsetSession.doc,
	});
	offsetSession.attachRenderer(offsetRenderer);

	// 3. Setup AC-026 (DPR)
	const docDpr = createBlankDocument();
	dprSession = new BlueprintSession({ document: docDpr, mode: "editor" });
	const dprEntity: ShapeEntity = {
		id: "dpr-shape-1",
		name: "DPR Shape",
		kind: "shape",
		layerId: "layer_foundation",
		groupId: null,
		transform: { x: 50, y: 50, rotationDeg: 0 },
		style: { fill: "#00ff00", stroke: "#000", strokeWidthMm: 1, opacity: 1, dashMm: [] },
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		structural: false,
		geometry: { kind: "rect", width: 40, height: 40, cornerRadius: 0 },
	};
	dprSession.execute({ type: "entity.add", entity: dprEntity });
	dprRenderer = new PaperRenderer({
		canvas: dprCanvasEl,
		width: 400,
		height: 300,
		document: dprSession.doc,
	});
	dprSession.attachRenderer(dprRenderer);

	// 4. Setup AC-027 (Wheel Zoom)
	const docZoom = createBlankDocument();
	zoomSession = new BlueprintSession({ document: docZoom, mode: "editor" });
	zoomRenderer = new PaperRenderer({
		canvas: zoomCanvasEl,
		width: 400,
		height: 300,
		document: docZoom,
	});
	zoomSession.attachRenderer(zoomRenderer);

	zoomCanvasEl.addEventListener("wheel", (e) => {
		e.preventDefault();
		const cam = zoomRenderer.getCamera();
		const viewPt = clientToViewPoint(e.clientX, e.clientY, zoomCanvasEl);
		const newCam = zoomAtViewPoint(
			cam,
			viewPt,
			{ x: zoomCanvasEl.clientWidth, y: zoomCanvasEl.clientHeight },
			e.deltaY,
		);
		zoomRenderer.setCamera(newCam);
	});

	// 5. Setup AC-028 (Collapsible)
	const docCollapse = createBlankDocument();
	collapsibleSession = new BlueprintSession({ document: docCollapse, mode: "editor" });
	collapsibleRenderer = new PaperRenderer({
		canvas: collapsibleCanvasEl,
		width: 400,
		height: 300,
		document: docCollapse,
	});
	collapsibleSession.attachRenderer(collapsibleRenderer);

	// 6. Setup AC-029 (Layer Picking)
	const docLayer = createBlankDocument();
	const ls = new BlueprintSession({ document: docLayer, mode: "editor" });
	ls.execute({
		type: "layer.add",
		layer: {
			id: "layer_hidden",
			name: "Hidden Layer",
			role: "marks",
			parentId: null,
			visible: false,
			locked: false,
			printable: true,
			opacity: 1,
		},
	});
	ls.execute({
		type: "layer.add",
		layer: {
			id: "layer_locked",
			name: "Locked Layer",
			role: "machinery",
			parentId: null,
			visible: true,
			locked: true,
			printable: true,
			opacity: 1,
		},
	});
	ls.execute({
		type: "entity.add",
		entity: {
			id: "entity-hidden",
			name: "Hidden Entity",
			kind: "shape",
			layerId: "layer_hidden",
			groupId: null,
			transform: { x: 50, y: 50, rotationDeg: 0 },
			style: { fill: "#f00", stroke: "#000", strokeWidthMm: 1, opacity: 1, dashMm: [] },
			hidden: false,
			locked: false,
			tags: [],
			metadata: {},
			structural: false,
			geometry: { kind: "rect", width: 40, height: 40, cornerRadius: 0 },
		},
	});
	ls.execute({
		type: "entity.add",
		entity: {
			id: "entity-locked",
			name: "Locked Entity",
			kind: "shape",
			layerId: "layer_locked",
			groupId: null,
			transform: { x: 150, y: 50, rotationDeg: 0 },
			style: { fill: "#0f0", stroke: "#000", strokeWidthMm: 1, opacity: 1, dashMm: [] },
			hidden: false,
			locked: false,
			tags: [],
			metadata: {},
			structural: false,
			geometry: { kind: "rect", width: 40, height: 40, cornerRadius: 0 },
		},
	});

	layerSession = ls;
	layerRenderer = new PaperRenderer({
		canvas: layerCanvasEl,
		width: 400,
		height: 300,
		document: ls.doc,
	});
	ls.attachRenderer(layerRenderer);

	// Expose test harness globally for Playwright evaluation
	(window as any).__canvasTestHarness = {
		sessionA,
		sessionB,
		rendererA,
		rendererB,
		offsetSession,
		offsetRenderer,
		dprSession,
		dprRenderer,
		zoomSession,
		zoomRenderer,
		collapsibleSession,
		collapsibleRenderer,
		layerSession: ls,
		layerRenderer,
		createAndDisposeExportScope: () => {
			const exportCanvas = document.createElement("canvas");
			exportCanvas.width = 200;
			exportCanvas.height = 200;
			const exportDoc = createBlankDocument();
			const exportRenderer = new PaperRenderer({
				canvas: exportCanvas,
				width: 200,
				height: 200,
				document: exportDoc,
			});
			const scopeId = exportRenderer.scope.execute((scope) => scope.project?.index ?? 0);
			exportRenderer.dispose();
			return { scopeId, isDisposed: true };
		},
		pickLayerCanvasAt: (viewPt: { x: number; y: number }) => {
			return layerRenderer.hitTest(viewPt, {
				mode: ls.mode,
				drillDown: false,
			});
		},
	};
});

onDestroy(() => {
	rendererA?.dispose();
	rendererB?.dispose();
	offsetRenderer?.dispose();
	dprRenderer?.dispose();
	zoomRenderer?.dispose();
	collapsibleRenderer?.dispose();
	layerRenderer?.dispose();
});

function handleOffsetCanvasPointerDown(e: PointerEvent) {
	const viewPt = clientToViewPoint(e.clientX, e.clientY, offsetCanvasEl);
	const cam = offsetRenderer.getCamera();
	const worldPt = viewToWorld(viewPt, cam, {
		x: offsetCanvasEl.clientWidth,
		y: offsetCanvasEl.clientHeight,
	});
	offsetWorldCoords = worldPt;
	const picked = offsetRenderer.hitTest(viewPt, { mode: "editor", drillDown: false });
	offsetPicked = picked ? picked.entityId : null;
}

function toggleCollapse() {
	isPanelCollapsed = !isPanelCollapsed;
	if (isPanelCollapsed) {
		collapsibleRenderer.setViewportSize({ x: 0, y: 0 });
	} else {
		collapsibleRenderer.setViewportSize({ x: 400, y: 300 });
	}
}

function setLayerSessionMode(mode: "editor" | "viewer") {
	if (layerSession) {
		layerSession.setMode(mode);
	}
}
</script>

<div class="p-6 max-w-6xl mx-auto space-y-8 bg-base-100 text-base-content min-h-screen">
	<h1 class="text-xl font-bold font-mono">C-01 Browser Rendering & Coordinates Test Harness</h1>

	<!-- Section AC-024 -->
	<section id="section-ac024" class="p-4 border border-base-300 rounded-lg">
		<h2 class="text-sm font-semibold mb-2">AC-024: Dual Paper Scopes & Export Disposal</h2>
		<div class="flex gap-4">
			<div>
				<span class="text-xs font-mono">Scope A</span>
				<canvas id="canvas-a" bind:this={canvasAEl} class="border border-base-content/20 block" width="400" height="300"></canvas>
			</div>
			<div>
				<span class="text-xs font-mono">Scope B</span>
				<canvas id="canvas-b" bind:this={canvasBEl} class="border border-base-content/20 block" width="400" height="300"></canvas>
			</div>
		</div>
	</section>

	<!-- Section AC-025 -->
	<section id="section-ac025" class="p-4 border border-base-300 rounded-lg">
		<h2 class="text-sm font-semibold mb-2">AC-025: Offset Container & Real Scrolling</h2>
		<p class="text-xs text-base-content/60 mb-2">
			Picked: <span id="offset-picked-id" class="font-mono font-bold">{offsetPicked ?? "none"}</span> | 
			World: <span id="offset-world-coords" class="font-mono">{offsetWorldCoords ? `${offsetWorldCoords.x.toFixed(1)},${offsetWorldCoords.y.toFixed(1)}` : "none"}</span>
		</p>
		<div
			id="scroll-container"
			bind:this={scrollContainerEl}
			class="overflow-auto border border-primary/30 p-8"
			style="width: 500px; height: 350px;"
		>
			<div style="width: 1200px; height: 1000px; padding-top: 150px; padding-left: 200px;">
				<canvas
					id="offset-canvas"
					bind:this={offsetCanvasEl}
					onpointerdown={handleOffsetCanvasPointerDown}
					class="border border-base-content/40 block"
					width="400"
					height="300"
				></canvas>
			</div>
		</div>
	</section>

	<!-- Section AC-026 -->
	<section id="section-ac026" class="p-4 border border-base-300 rounded-lg">
		<h2 class="text-sm font-semibold mb-2">AC-026: DPR Backing Buffer Dimensions</h2>
		<canvas id="dpr-canvas" bind:this={dprCanvasEl} class="border border-base-content/20 block" width="400" height="300" style="width: 400px; height: 300px;"></canvas>
	</section>

	<!-- Section AC-027 -->
	<section id="section-ac027" class="p-4 border border-base-300 rounded-lg">
		<h2 class="text-sm font-semibold mb-2">AC-027: Wheel Zoom Cursor Anchor</h2>
		<canvas id="zoom-canvas" bind:this={zoomCanvasEl} class="border border-base-content/20 block" width="400" height="300"></canvas>
	</section>

	<!-- Section AC-028 -->
	<section id="section-ac028" class="p-4 border border-base-300 rounded-lg">
		<h2 class="text-sm font-semibold mb-2">AC-028: Collapsible Panel Zero-Size Guard</h2>
		<button id="toggle-collapse-btn" type="button" class="btn btn-sm btn-outline mb-2" onclick={toggleCollapse}>
			{isPanelCollapsed ? "Expand Panel" : "Collapse Panel"}
		</button>
		<div
			id="collapsible-panel"
			bind:this={collapsibleContainerEl}
			style={isPanelCollapsed ? "width: 0px; height: 0px; overflow: hidden;" : "width: 400px; height: 300px;"}
		>
			<canvas id="collapsible-canvas" bind:this={collapsibleCanvasEl} class="border border-base-content/20 block" width="400" height="300"></canvas>
		</div>
	</section>

	<!-- Section AC-029 -->
	<section id="section-ac029" class="p-4 border border-base-300 rounded-lg">
		<h2 class="text-sm font-semibold mb-2">AC-029: Layer Visibility & Lock Picking Policy</h2>
		<div class="flex gap-2 mb-2">
			<button id="set-editor-mode-btn" type="button" class="btn btn-xs btn-outline" onclick={() => setLayerSessionMode("editor")}>Editor Mode</button>
			<button id="set-viewer-mode-btn" type="button" class="btn btn-xs btn-outline" onclick={() => setLayerSessionMode("viewer")}>Viewer Mode</button>
			<span id="layer-mode-indicator" class="badge badge-sm font-mono">{layerSession?.mode ?? "editor"}</span>
		</div>
		<canvas id="layer-canvas" bind:this={layerCanvasEl} class="border border-base-content/20 block" width="400" height="300"></canvas>
	</section>
</div>
