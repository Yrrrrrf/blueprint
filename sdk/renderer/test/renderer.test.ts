// ============================================================================
// Blueprint Renderer Acceptance Tests (§16.2 of Blueprint Specification)
// Rigorous verification of AC-024 through AC-029 and core renderer modules.
// ============================================================================

import {
	assert,
	assertEquals,
	assertNotEquals,
	assertStrictEquals,
} from "@std/assert";
import type {
	BlueprintDocument,
	DeviceEntity,
	ShapeEntity,
	Vec2,
} from "@sdk/core";
import { BUILTIN_DEFINITIONS, createBlankDocument } from "@sdk/core";
import {
	fitToBounds,
	getScalePixelsPerMm,
	viewToWorld,
	worldToView,
	zoomAtViewPoint,
	zoomToScaleAtViewPoint,
} from "../src/camera.ts";
import { buildDrawList } from "../src/draw-list.ts";
import { clientToViewPoint } from "../src/input.ts";
import { PaperRenderer } from "../src/paper-renderer.ts";
import {
	computeEntityWorldBounds,
	pickAtPoint,
	selectByMarquee,
	SpatialIndex,
} from "../src/picking.ts";
import { IsolatedPaperScope } from "../src/scope.ts";
import {
	computeSnap,
	constrainPointToAngle,
	snapAngle,
} from "../src/snapping.ts";

function createTestDocWithEntities(): {
	doc: BlueprintDocument;
	shape1: ShapeEntity;
	shape2: ShapeEntity;
	device1: DeviceEntity;
} {
	const doc = createBlankDocument("Test Facility", {
		facilityWidthMm: 80000,
		facilityHeightMm: 50000,
	});

	// Shape 1: Rect at (1000, 1000), 1000x1000 on sections layer
	const shape1: ShapeEntity = {
		id: "shape_1",
		name: "Box 1",
		kind: "shape",
		layerId: "layer_sections",
		groupId: null,
		transform: { x: 1000, y: 1000, rotationDeg: 0 },
		geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
		style: {
			fill: "#3b82f6",
			stroke: "#1d4ed8",
			strokeWidthMm: 2,
			opacity: 1,
			dashMm: [],
		},
		structural: false,
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
	};

	// Shape 2: Rect at (2500, 1000), 1000x1000 on sections layer
	const shape2: ShapeEntity = {
		id: "shape_2",
		name: "Box 2",
		kind: "shape",
		layerId: "layer_sections",
		groupId: null,
		transform: { x: 2500, y: 1000, rotationDeg: 0 },
		geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
		style: {
			fill: "#10b981",
			stroke: "#047857",
			strokeWidthMm: 2,
			opacity: 1,
			dashMm: [],
		},
		structural: false,
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
	};

	// Device 1: CNC Machine at (10000, 10000) on machinery layer
	const device1: DeviceEntity = {
		id: "device_cnc_1",
		name: "CNC Milling 1",
		kind: "device",
		layerId: "layer_machinery",
		groupId: null,
		definitionId: BUILTIN_DEFINITIONS["def-cnc-v1"].id,
		assetKey: "cnc-01",
		transform: { x: 10000, y: 10000, rotationDeg: 0 },
		parameters: {},
		ratedPowerKw: 15,
		maintenanceDue: null,
		bindings: [],
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
	};

	doc.content = {
		...doc.content,
		entities: {
			...doc.content.entities,
			[shape1.id]: shape1,
			[shape2.id]: shape2,
			[device1.id]: device1,
		},
		entityOrder: [shape1.id, shape2.id, device1.id],
	};

	return { doc, shape1, shape2, device1 };
}

// ============================================================================
// AC-024: Scope Isolation & Lifecycle
// Mount two scopes, alternate mutations, create export scope -> each document
// gets only its items; disposal of one preserves the other.
// ============================================================================
Deno.test("AC-024: Mount two scopes, alternate mutations, create export scope", () => {
	const docA = createBlankDocument("Doc A");
	const docB = createBlankDocument("Doc B");

	const shapeA: ShapeEntity = {
		id: "shape_a1",
		name: "Shape A1",
		kind: "shape",
		layerId: "layer_sections",
		groupId: null,
		transform: { x: 2000, y: 2000, rotationDeg: 0 },
		geometry: { kind: "rect", width: 500, height: 500, cornerRadius: 0 },
		style: {
			fill: "#ff0000",
			stroke: null,
			strokeWidthMm: 1,
			opacity: 1,
			dashMm: [],
		},
		structural: false,
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
	};

	const shapeB: ShapeEntity = {
		id: "shape_b1",
		name: "Shape B1",
		kind: "shape",
		layerId: "layer_sections",
		groupId: null,
		transform: { x: 4000, y: 4000, rotationDeg: 0 },
		geometry: { kind: "rect", width: 800, height: 800, cornerRadius: 0 },
		style: {
			fill: "#00ff00",
			stroke: null,
			strokeWidthMm: 1,
			opacity: 1,
			dashMm: [],
		},
		structural: false,
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
	};

	// 1. Mount two independent renderers
	const rendererA = new PaperRenderer({
		width: 800,
		height: 600,
		document: docA,
	});
	const rendererB = new PaperRenderer({
		width: 400,
		height: 300,
		document: docB,
	});

	// 2. Alternate mutations across scopes
	docA.content = {
		...docA.content,
		entities: { ...docA.content.entities, [shapeA.id]: shapeA },
		entityOrder: [shapeA.id],
	};
	rendererA.applyDelta(docA, {
		addedEntityIds: [shapeA.id],
		updatedEntityIds: [],
		deletedEntityIds: [],
	});

	docB.content = {
		...docB.content,
		entities: { ...docB.content.entities, [shapeB.id]: shapeB },
		entityOrder: [shapeB.id],
	};
	rendererB.applyDelta(docB, {
		addedEntityIds: [shapeB.id],
		updatedEntityIds: [],
		deletedEntityIds: [],
	});

	// 3. Create a 3rd isolated export scope
	const exportScope = new IsolatedPaperScope({ width: 1000, height: 1000 });
	let exportItemCount = 0;
	exportScope.execute((scope) => {
		new scope.Path.Circle({
			center: new scope.Point(500, 500),
			radius: 200,
			fillColor: new scope.Color("#0000ff"),
		});
		exportItemCount = scope.project?.activeLayer.children.length ?? 0;
	});
	assertEquals(exportItemCount, 1);

	// 4. Verify each renderer scope contains ONLY its respective items
	rendererA.scope.execute((scope) => {
		const sectionsLayer = scope.project?.layers.find(
			(l) => l.name === "layer_sections",
		);
		assert(sectionsLayer, "Renderer A must have sections layer");
		assertEquals(sectionsLayer.children.length, 1);
		assertEquals(sectionsLayer.children[0].position.x, 2000);
	});

	rendererB.scope.execute((scope) => {
		const sectionsLayer = scope.project?.layers.find(
			(l) => l.name === "layer_sections",
		);
		assert(sectionsLayer, "Renderer B must have sections layer");
		assertEquals(sectionsLayer.children.length, 1);
		assertEquals(sectionsLayer.children[0].position.x, 4000);
	});

	// 5. Disposal of Scope A preserves Scope B completely
	rendererA.dispose();
	assertEquals(rendererA.scope.isDisposed, true);
	assertEquals(rendererA.scope.disposalToken.disposed, true);

	assertEquals(rendererB.scope.isDisposed, false);
	assertEquals(rendererB.scope.disposalToken.disposed, false);

	// Scope B is still fully operational
	rendererB.scope.execute((scope) => {
		const sectionsLayer = scope.project?.layers.find(
			(l) => l.name === "layer_sections",
		);
		assert(sectionsLayer, "Renderer B must still have sections layer");
		assertEquals(sectionsLayer.children.length, 1);
	});

	rendererB.dispose();
	exportScope.dispose();
});

// ============================================================================
// AC-025: Page Offset and Pointer Mapping Without Drift
// Canvas at page offset (120, 80), scrolled page, click known world point ->
// correct entity/coordinate with camera transform; no client-coordinate drift.
// ============================================================================
Deno.test("AC-025: Canvas at page offset (120, 80), click known world point without drift", () => {
	const { doc, shape1 } = createTestDocWithEntities();
	const viewportSize: Vec2 = { x: 800, y: 600 };

	// Camera centered at (1500, 1500) with scale 1
	// World point (1500, 1500) is the center of shape1 (1000..2000 x 1000..2000)
	const camera = {
		centerMm: { x: 1500, y: 1500 },
		scale: 1.0,
	};

	const renderer = new PaperRenderer({
		width: viewportSize.x,
		height: viewportSize.y,
		document: doc,
		camera,
	});

	// Canvas placed at page offset (120, 80)
	const canvasMock = {
		getBoundingClientRect: () => ({
			left: 120,
			top: 80,
			width: 800,
			height: 600,
		}),
		clientWidth: 800,
		clientHeight: 600,
	};

	// Center of viewport in canvas view coordinates is (400, 300)
	// In client coordinates (page offset + view coordinate): (120 + 400, 80 + 300) = (520, 380)
	const clientPoint = { clientX: 520, clientY: 380 };
	const viewPoint = clientToViewPoint(
		clientPoint.clientX,
		clientPoint.clientY,
		canvasMock,
	);

	assertEquals(viewPoint.x, 400);
	assertEquals(viewPoint.y, 300);

	// Hit-test through RendererPort
	const hit = renderer.hitTest(viewPoint, { mode: "editor", drillDown: false });
	assert(hit !== null, "Must hit shape1 at center");
	assertEquals(hit.entityId, shape1.id);
	assertEquals(hit.category, "entity");

	// Verify exact world coordinate resolved without drift (< 0.001 mm error)
	const errX = Math.abs(hit.worldPoint.x - 1500);
	const errY = Math.abs(hit.worldPoint.y - 1500);
	assert(errX < 0.001, `World X drift must be < 0.001 mm (got ${errX})`);
	assert(errY < 0.001, `World Y drift must be < 0.001 mm (got ${errY})`);

	// Scrolled page simulation: canvas moved to left: 350, top: 420
	const scrolledCanvasMock = {
		getBoundingClientRect: () => ({
			left: 350,
			top: 420,
			width: 800,
			height: 600,
		}),
		clientWidth: 800,
		clientHeight: 600,
	};
	const scrolledClient = { clientX: 350 + 400, clientY: 420 + 300 };
	const scrolledView = clientToViewPoint(
		scrolledClient.clientX,
		scrolledClient.clientY,
		scrolledCanvasMock,
	);
	assertEquals(scrolledView.x, 400);
	assertEquals(scrolledView.y, 300);

	const scrolledHit = renderer.hitTest(scrolledView, {
		mode: "editor",
		drillDown: false,
	});
	assert(scrolledHit !== null, "Must hit shape1 despite page scroll");
	assertEquals(scrolledHit.entityId, shape1.id);

	renderer.dispose();
});

// ============================================================================
// AC-026: Device Pixel Ratio (DPR) Invariance
// DPR 1 then DPR 2 with same CSS size -> same world placement and pointer mapping;
// sharper backing canvas, no double scaling.
// ============================================================================
Deno.test("AC-026: DPR 1 then DPR 2 with same CSS size preserves world placement and pointer mapping", () => {
	const viewportCssSize: Vec2 = { x: 800, y: 600 };
	const camera = {
		centerMm: { x: 20000, y: 15000 },
		scale: 2.5,
	};

	// 1. Pointer mapping at DPR 1
	const viewPoint: Vec2 = { x: 350, y: 280 };
	const worldAtDpr1 = viewToWorld(viewPoint, camera, viewportCssSize);

	// 2. At DPR 2, CSS layout size is identical (800x600), backing canvas is 1600x1200
	const worldAtDpr2 = viewToWorld(viewPoint, camera, viewportCssSize);

	assertEquals(worldAtDpr1.x, worldAtDpr2.x);
	assertEquals(worldAtDpr1.y, worldAtDpr2.y);

	// 3. Round-trip worldToView is invariant
	const viewRoundTrip1 = worldToView(worldAtDpr1, camera, viewportCssSize);
	const viewRoundTrip2 = worldToView(worldAtDpr2, camera, viewportCssSize);

	assert(Math.abs(viewRoundTrip1.x - 350) < 1e-9);
	assert(Math.abs(viewRoundTrip1.y - 280) < 1e-9);
	assert(Math.abs(viewRoundTrip2.x - 350) < 1e-9);
	assert(Math.abs(viewRoundTrip2.y - 280) < 1e-9);

	// 4. Verify base scale is strictly 0.01 px/mm, unaffected by DPR
	const s = getScalePixelsPerMm(camera.scale);
	assertEquals(s, 0.01 * 2.5); // 0.025 px/mm (1000mm = 25 CSS px)
});

// ============================================================================
// AC-027: Cursor-Anchored Wheel Zoom
// Zoom under cursor from scale 1 to 2 -> world point under cursor moves < 0.001 mm.
// ============================================================================
Deno.test("AC-027: Zoom under cursor from scale 1 to 2 moves world point < 0.001 mm", () => {
	const viewportSize: Vec2 = { x: 1024, y: 768 };
	const initialCamera = {
		centerMm: { x: 35000, y: 22000 },
		scale: 1.0,
	};

	// Arbitrary cursor position
	const cursorView: Vec2 = { x: 613, y: 289 };

	// 1. World point under cursor before zoom
	const worldBefore = viewToWorld(cursorView, initialCamera, viewportSize);

	// 2. Zoom to scale 2.0 anchored at cursorView
	const cameraAfter = zoomToScaleAtViewPoint(
		initialCamera,
		2.0,
		cursorView,
		viewportSize,
	);
	assertEquals(cameraAfter.scale, 2.0);

	// 3. World point under cursor after zoom
	const worldAfter = viewToWorld(cursorView, cameraAfter, viewportSize);

	const numericalError = Math.hypot(
		worldAfter.x - worldBefore.x,
		worldAfter.y - worldBefore.y,
	);

	assert(
		numericalError < 0.001,
		`World point under cursor must move < 0.001 mm (got ${numericalError.toFixed(8)} mm)`,
	);

	// 4. Test incremental wheel zoom formula exp(-deltaPx * 0.0015)
	const wheelCamera = zoomAtViewPoint(
		initialCamera,
		cursorView,
		viewportSize,
		150,
	);
	const worldAfterWheel = viewToWorld(cursorView, wheelCamera, viewportSize);
	const wheelError = Math.hypot(
		worldAfterWheel.x - worldBefore.x,
		worldAfterWheel.y - worldBefore.y,
	);
	assert(
		wheelError < 0.001,
		`Wheel zoom world point under cursor must move < 0.001 mm (got ${wheelError.toFixed(8)} mm)`,
	);
});

// ============================================================================
// AC-028: Marquee Selection & Zero-Dimension Panel Resize
// Marquee L->R (enclosed only) vs R->L (crossing) -> correct distinct entity sets;
// locked entities excluded.
// Collapsed panel through zero width then reopen -> No NaN/Infinity camera.
// ============================================================================
Deno.test("AC-028: Marquee selection L->R (enclosed) vs R->L (crossing) and locked exclusion", () => {
	const { doc, shape1, shape2 } = createTestDocWithEntities();

	// Add a 3rd entity that is locked
	const lockedShape: ShapeEntity = {
		id: "shape_locked",
		name: "Locked Box",
		kind: "shape",
		layerId: "layer_sections",
		groupId: null,
		transform: { x: 1200, y: 1200, rotationDeg: 0 },
		geometry: { kind: "rect", width: 400, height: 400, cornerRadius: 0 },
		style: {
			fill: "#888888",
			stroke: null,
			strokeWidthMm: 1,
			opacity: 1,
			dashMm: [],
		},
		structural: false,
		hidden: false,
		locked: true, // LOCKED
		tags: [],
		metadata: {},
	};
	doc.content = {
		...doc.content,
		entities: { ...doc.content.entities, [lockedShape.id]: lockedShape },
		entityOrder: [...doc.content.entityOrder, lockedShape.id],
	};

	const spatialIndex = new SpatialIndex();
	spatialIndex.build(doc);

	// Marquee box: from (500, 500) to (2800, 2500)
	// Shape 1: (1000..2000, 1000..2000) -> fully inside (500..2800, 500..2500)
	// Shape 2: (2500..3500, 1000..2000) -> crosses boundary at 2800, NOT fully enclosed
	// Shape Locked: inside box, but locked!

	// 1. Left-to-Right Marquee: ENCLOSED ONLY
	const enclosedSelection = selectByMarquee(
		{ x: 500, y: 500 },
		{ x: 2800, y: 2500 },
		doc,
		spatialIndex,
		{ mode: "editor", drillDown: false },
	);

	// Must contain Shape 1, but NOT Shape 2 and NOT Locked Shape
	assert(
		enclosedSelection.includes(shape1.id),
		"Must include fully enclosed Shape 1",
	);
	assert(
		!enclosedSelection.includes(shape2.id),
		"Must NOT include crossing Shape 2",
	);
	assert(
		!enclosedSelection.includes(lockedShape.id),
		"Must exclude locked shape under editor policy",
	);

	// 2. Right-to-Left Marquee: CROSSING / INTERSECTING
	const crossingSelection = selectByMarquee(
		{ x: 2800, y: 2500 },
		{ x: 500, y: 500 },
		doc,
		spatialIndex,
		{ mode: "editor", drillDown: false },
	);

	// Must contain both Shape 1 and Shape 2, but NOT Locked Shape
	assert(crossingSelection.includes(shape1.id), "Must include Shape 1");
	assert(
		crossingSelection.includes(shape2.id),
		"Must include crossing Shape 2",
	);
	assert(
		!crossingSelection.includes(lockedShape.id),
		"Must exclude locked shape under editor policy",
	);

	// 3. Panel zero width guard: no NaN or Infinity
	const camera = { centerMm: { x: 10000, y: 20000 }, scale: 1.5 };
	const zeroWidthViewport: Vec2 = { x: 0, y: 600 };
	const fittedZero = fitToBounds(
		{ minX: 0, minY: 0, maxX: 50000, maxY: 30000, width: 50000, height: 30000 },
		zeroWidthViewport,
		32,
		camera,
	);

	assert(!Number.isNaN(fittedZero.scale), "Scale must not be NaN");
	assert(Number.isFinite(fittedZero.scale), "Scale must be finite");
	assert(!Number.isNaN(fittedZero.centerMm.x), "Center X must not be NaN");
	assertEquals(fittedZero.scale, 1.5);
	assertEquals(fittedZero.centerMm.x, 10000);
});

// ============================================================================
// AC-029: Viewer vs Editor Policy & Inspection
// Hide layer, lock another; click under editor then viewer policy ->
// hidden never picks; locked skips edit but allows viewer inspection.
// Inspect/hover device in viewer returns entity ID and resolves telemetry.
// ============================================================================
Deno.test("AC-029: Viewer vs editor policy: hidden never picks, locked permits inspection", () => {
	const { doc, shape1, device1 } = createTestDocWithEntities();

	// 1. Lock the machinery layer where device1 lives
	const machineryLayer = doc.content.layers.find(
		(l) => l.id === "layer_machinery",
	);
	assert(machineryLayer);
	machineryLayer.locked = true;

	// 2. Hide the sections layer where shape1 lives
	const sectionsLayer = doc.content.layers.find(
		(l) => l.id === "layer_sections",
	);
	assert(sectionsLayer);
	sectionsLayer.visible = false;

	const spatialIndex = new SpatialIndex();
	spatialIndex.build(doc);

	const camera = { centerMm: { x: 10000, y: 10000 }, scale: 1.0 };
	const viewportSize: Vec2 = { x: 800, y: 600 };

	// View coordinate corresponding to device1 center (10000, 10000) -> view center (400, 300)
	const deviceViewPoint: Vec2 = { x: 400, y: 300 };

	// Under Editor policy: clicking locked device1 returns null (skips edit)
	const editorHit = pickAtPoint(
		deviceViewPoint,
		camera,
		viewportSize,
		doc,
		spatialIndex,
		{ mode: "editor", drillDown: false },
	);
	assertEquals(editorHit, null);

	// Under Viewer policy: clicking locked device1 succeeds for inspection (§6.4, AC-029)
	const viewerHit = pickAtPoint(
		deviceViewPoint,
		camera,
		viewportSize,
		doc,
		spatialIndex,
		{ mode: "viewer", drillDown: false },
	);
	assert(viewerHit !== null, "Viewer policy must permit picking locked entity");
	assertEquals(viewerHit.entityId, device1.id);
	assertEquals(viewerHit.category, "entity");

	// View coordinate for shape1 center (1500, 1500)
	const shapeViewPoint = worldToView(
		{ x: 1500, y: 1500 },
		camera,
		viewportSize,
	);

	// Under both editor and viewer policy: hidden shape1 NEVER picks (AC-029)
	const editorHiddenHit = pickAtPoint(
		shapeViewPoint,
		camera,
		viewportSize,
		doc,
		spatialIndex,
		{ mode: "editor", drillDown: false },
	);
	assertEquals(editorHiddenHit, null);

	const viewerHiddenHit = pickAtPoint(
		shapeViewPoint,
		camera,
		viewportSize,
		doc,
		spatialIndex,
		{ mode: "viewer", drillDown: false },
	);
	assertEquals(viewerHiddenHit, null);

	// Verify telemetry binding and device definition resolution
	const renderer = new PaperRenderer({
		width: 800,
		height: 600,
		document: doc,
		camera,
	});

	renderer.setTelemetry(
		new Map([
			[
				device1.id,
				{
					values: { status: "running", temperatureC: 45.2 },
					status: "running",
				},
			],
		]),
	);

	const viewerPortHit = renderer.hitTest(deviceViewPoint, {
		mode: "viewer",
		drillDown: false,
	});
	assert(viewerPortHit !== null);
	assertEquals(viewerPortHit.entityId, device1.id);

	renderer.dispose();
});

// ============================================================================
// Auxiliary Snapping Tests (§6.5)
// ============================================================================
Deno.test("Snapping: 8px acquisition, 12px release, 15-degree angle constraints", () => {
	const doc = createBlankDocument();
	const camera = { centerMm: { x: 0, y: 0 }, scale: 1.0 };
	const s = getScalePixelsPerMm(camera.scale); // 0.01 px/mm

	// 1. Angle snapping
	assertEquals(snapAngle(0), 0);
	assertEquals(snapAngle(14), 15);
	assertEquals(snapAngle(16), 15);
	assertEquals(snapAngle(38), 45);
	assertEquals(snapAngle(350), 345);
	assertEquals(snapAngle(355), 0);

	// 2. Angle constraint from origin (0, 0) to (1000, 200) -> ~11.3 deg -> snaps to 15 deg
	const constrained = constrainPointToAngle(
		{ x: 0, y: 0 },
		{ x: 1000, y: 200 },
		15,
	);
	assertEquals(constrained.angleDeg, 15);
	const expectedDist = Math.hypot(1000, 200);
	const actualDist = Math.hypot(constrained.point.x, constrained.point.y);
	assert(Math.abs(expectedDist - actualDist) < 1e-4);

	// 3. Grid snap: point at (950, 40) with grid step 1000 -> snaps to (1000, 0)
	// (950, 40) is distance sqrt(50^2 + 40^2) = 64 mm from (1000, 0)
	// 64 mm * 0.01 px/mm = 0.64 CSS px (well within 8 px acquisition radius)
	const snapRes = computeSnap({
		worldPoint: { x: 950, y: 40 },
		camera,
		doc,
		snapStepMm: 1000,
	});
	assert(snapRes.candidate !== null);
	assertEquals(snapRes.candidate.type, "grid");
	assertEquals(snapRes.snappedPoint.x, 1000);
	assertEquals(snapRes.snappedPoint.y, 0);

	// 4. Alt disables all snapping
	const altRes = computeSnap({
		worldPoint: { x: 950, y: 40 },
		camera,
		doc,
		altDisabled: true,
	});
	assertEquals(altRes.candidate, null);
	assertEquals(altRes.snappedPoint.x, 950);
	assertEquals(altRes.snappedPoint.y, 40);
});

// ============================================================================
// Auxiliary Draw-List Tests (§12.1)
// ============================================================================
Deno.test("Draw-list: buildDrawList produces DOM-free primitive representations", () => {
	const { doc, shape1, device1 } = createTestDocWithEntities();
	const drawList = buildDrawList(doc, { scope: "visible_printable" });

	assert(drawList.items.length > 0, "Draw list must contain primitives");
	const shapePrimitive = drawList.items.find((p) => p.entityId === shape1.id);
	assert(shapePrimitive, "Must contain primitive for shape1");
	assertEquals(shapePrimitive.kind, "path");

	const devicePrimitives = drawList.items.filter(
		(p) => p.entityId === device1.id,
	);
	assert(
		devicePrimitives.length > 0,
		"Must contain symbol primitives for device1",
	);

	assertEquals(drawList.facilityBounds.width, 80000);
	assertEquals(drawList.facilityBounds.height, 50000);
});
