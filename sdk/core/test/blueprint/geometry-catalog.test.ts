// ============================================================================
// Blueprint Geometry, Anchors, and Catalog Acceptance Tests (WP-03)
// Covers AC-009 through AC-015 and factory fixture verification.
// ============================================================================

import { assertEquals, assertThrows } from "@std/assert";
import {
	BUILTIN_DEFINITIONS,
	CNC_DEFINITION,
	computeDimensionGeometry,
	computeDimensionValue,
	computeRackCapacity,
	createBlankDocument,
	createNaveConflictsFixture,
	createNaveIndustrialFixture,
	createRectPolygon,
	deriveOpeningCutGeometry,
	deriveWallGeometry,
	generateConveyorDefinition,
	generateRackDefinition,
	localPoint,
	moveWall,
	multiPolygonArea,
	polygonArea,
	polygonBounds,
	resolveAnchor,
	rotateAround,
	runSpatialChecks,
	shrinkWallSegment,
	validateBlueprintDocument,
	validatePolygonTopology,
	validateWallOpeningConstraints,
	worldPoint,
	type DimensionEntity,
	type OpeningEntity,
	type Polygon,
	type WallEntity,
	type ZoneEntity,
} from "../../src/blueprint/mod.ts";

// ----------------------------------------------------------------------------
// AC-009: Coordinate Transforms & Round-Trip Inverse
// ----------------------------------------------------------------------------

Deno.test("AC-009: worldPoint applies clockwise rotation in Y-down then translation; localPoint recovers original", () => {
	// Given: Local (1000, 0), transform x=2000, y=3000, rotation=90 deg
	const local = { x: 1000, y: 0 };
	const transform = { x: 2000, y: 3000, rotationDeg: 90 };

	// When: Transforming to world coordinates
	const world = worldPoint(local, transform);

	// Then: World coordinate is (2000, 4000) within 0.001 mm
	assertEquals(
		Math.abs(world.x - 2000) < 0.001,
		true,
		`Expected world.x ~ 2000, got ${world.x}`,
	);
	assertEquals(
		Math.abs(world.y - 4000) < 0.001,
		true,
		`Expected world.y ~ 4000, got ${world.y}`,
	);

	// And: Inverse conversion recovers original local coordinate within 0.001 mm
	const recovered = localPoint(world, transform);
	assertEquals(
		Math.abs(recovered.x - 1000) < 0.001,
		true,
		`Expected recovered.x ~ 1000, got ${recovered.x}`,
	);
	assertEquals(
		Math.abs(recovered.y - 0) < 0.001,
		true,
		`Expected recovered.y ~ 0, got ${recovered.y}`,
	);
});

// ----------------------------------------------------------------------------
// AC-010: Wall Geometry Derivation with Opening Cut
// ----------------------------------------------------------------------------

Deno.test("AC-010: 10000 mm horizontal wall thickness 300, opening offset 2000 width 1000 removes full wall thickness on interval 2000..3000", () => {
	const wall: WallEntity = {
		id: "wall-test-01",
		name: "Test Wall",
		kind: "wall",
		layerId: "sections",
		groupId: null,
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: "#64748B",
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		thicknessMm: 300,
		closed: false,
		vertices: [
			{ id: "v1", point: { x: 0, y: 0 } },
			{ id: "v2", point: { x: 10000, y: 0 } },
		],
	};

	const opening: OpeningEntity = {
		id: "op-test-01",
		name: "Test Door",
		kind: "opening",
		layerId: "sections",
		groupId: null,
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: "#64748B",
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		wallId: "wall-test-01",
		segmentStartId: "v1",
		segmentEndId: "v2",
		offsetMm: 2000,
		widthMm: 1000,
		openingType: "door",
		hinge: "start",
		swing: "left",
	};

	// Derive wall geometry with cut opening
	const derivedPolys = deriveWallGeometry(wall, [opening]);

	// Wall is split into two disjoint polygons on either side of the opening
	assertEquals(
		derivedPolys.length,
		2,
		"Wall should be divided into 2 polygons by the opening cut",
	);

	const b1 = polygonBounds(derivedPolys[0]);
	const b2 = polygonBounds(derivedPolys[1]);

	// Sort pieces by X coordinate
	const [left, right] = b1.minX < b2.minX ? [b1, b2] : [b2, b1];

	// Left segment covers [0..2000] along X, full thickness 300 [-150..150]
	assertEquals(left.minX, 0);
	assertEquals(left.maxX, 2000);
	assertEquals(left.height, 300);

	// Right segment covers [3000..10000] along X, full thickness 300 [-150..150]
	assertEquals(right.minX, 3000);
	assertEquals(right.maxX, 10000);
	assertEquals(right.height, 300);

	// Interval 2000..3000 is completely cut through full thickness
	const totalArea = multiPolygonArea(derivedPolys);
	// (2000 * 300) + (7000 * 300) = 2,700,000 mm²
	assertEquals(totalArea, 2_700_000);

	// Wall and opening remain separate semantic entities
	assertEquals(wall.kind, "wall");
	assertEquals(opening.kind, "opening");
	assertEquals(opening.wallId, wall.id);
});

// ----------------------------------------------------------------------------
// AC-011: Moving Wall Carries Openings; Shrinking Segment Rejects Atomically
// ----------------------------------------------------------------------------

Deno.test("AC-011: Moving wall +500 X carries openings; shrinking segment below opening end rejects atomically", () => {
	const wall: WallEntity = {
		id: "wall-ac011",
		name: "Move/Shrink Wall",
		kind: "wall",
		layerId: "sections",
		groupId: null,
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: "#64748B",
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		thicknessMm: 300,
		closed: false,
		vertices: [
			{ id: "v1", point: { x: 0, y: 0 } },
			{ id: "v2", point: { x: 10000, y: 0 } },
		],
	};

	const opening: OpeningEntity = {
		id: "op-ac011",
		name: "Carried Door",
		kind: "opening",
		layerId: "sections",
		groupId: null,
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: "#64748B",
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		wallId: "wall-ac011",
		segmentStartId: "v1",
		segmentEndId: "v2",
		offsetMm: 2000,
		widthMm: 1000,
		openingType: "door",
		hinge: "start",
		swing: "left",
	};

	// 1. Moving wall +500 X carries openings
	const { wall: movedWall, openings: movedOpenings } = moveWall(
		wall,
		{ x: 500, y: 0 },
		[opening],
	);
	assertEquals(movedWall.transform.x, 500);
	assertEquals(movedOpenings[0].offsetMm, 2000);

	// Opening world cut geometry moves with the wall by +500 X
	const cutInWorld = deriveOpeningCutGeometry(
		movedWall,
		movedOpenings[0],
		true,
	);
	const cutBounds = polygonBounds(cutInWorld);
	assertEquals(cutBounds.minX, 2500); // 500 + 2000 = 2500
	assertEquals(cutBounds.maxX, 3500); // 500 + 3000 = 3500

	// 2. Shrinking segment below opening end (offset 2000 + width 1000 = 3000)
	// Shrinking segment to 2500 mm (< 3000 mm) must reject atomically with OPENING_CONFLICT
	assertThrows(
		() => shrinkWallSegment(wall, 0, 2500, [opening]),
		Error,
		"OPENING_CONFLICT",
	);

	// Constraint validation function also rejects
	const invalidWall: WallEntity = {
		...wall,
		vertices: [
			{ id: "v1", point: { x: 0, y: 0 } },
			{ id: "v2", point: { x: 2500, y: 0 } },
		],
	};
	const issues = validateWallOpeningConstraints(invalidWall, [opening]);
	assertEquals(issues.length > 0, true);
	assertEquals(issues[0].code, "OPENING_CONFLICT");

	// 3. Valid shrink to 3500 mm (above opening end 3000 mm) succeeds
	const { wall: validShrunk } = shrinkWallSegment(wall, 0, 3500, [opening]);
	assertEquals(validShrunk.vertices[1].point.x, 3500);
});

// ----------------------------------------------------------------------------
// AC-012: Reject Invalid Polygon (Bow-Tie and Overlapping Holes) Without Guessing
// ----------------------------------------------------------------------------

Deno.test("AC-012: Zone bow-tie and overlapping holes reject invalid polygon without guessing repaired topology", () => {
	// 1. Bow-tie polygon (self-intersecting hourglass)
	const bowtiePolygon: Polygon = {
		outer: [
			{ id: "v0", x: 0, y: 0 },
			{ id: "v1", x: 1000, y: 1000 },
			{ id: "v2", x: 0, y: 1000 },
			{ id: "v3", x: 1000, y: 0 },
		],
		holes: [],
	};

	const bowtieIssues = validatePolygonTopology(bowtiePolygon, "test.bowtie");
	assertEquals(
		bowtieIssues.some((i) => i.code === "SELF_INTERSECTING_POLYGON"),
		true,
		"Expected SELF_INTERSECTING_POLYGON for bow-tie outer ring",
	);

	// 2. Polygon with overlapping holes
	const overlappingHolesPolygon: Polygon = {
		outer: [
			{ id: "o0", x: 0, y: 0 },
			{ id: "o1", x: 10000, y: 0 },
			{ id: "o2", x: 10000, y: 10000 },
			{ id: "o3", x: 0, y: 10000 },
		],
		holes: [
			// Hole 1: 2000..6000 (counter-clockwise in Y-down for negative area)
			[
				{ id: "h1_0", x: 2000, y: 2000 },
				{ id: "h1_1", x: 2000, y: 6000 },
				{ id: "h1_2", x: 6000, y: 6000 },
				{ id: "h1_3", x: 6000, y: 2000 },
			],
			// Hole 2: 4000..8000 (overlaps Hole 1 on [4000..6000, 4000..6000])
			[
				{ id: "h2_0", x: 4000, y: 4000 },
				{ id: "h2_1", x: 4000, y: 8000 },
				{ id: "h2_2", x: 8000, y: 8000 },
				{ id: "h2_3", x: 8000, y: 4000 },
			],
		],
	};

	const holeIssues = validatePolygonTopology(
		overlappingHolesPolygon,
		"test.holes",
	);
	assertEquals(
		holeIssues.some((i) => i.code === "INTERSECTING_HOLES"),
		true,
		"Expected INTERSECTING_HOLES for overlapping interior holes",
	);
});

// ----------------------------------------------------------------------------
// AC-013: CNC Center-Preserving Rotation
// ----------------------------------------------------------------------------

Deno.test("AC-013: CNC rotate 90 degrees around footprint center preserves center and 4000x3000 dimensions", () => {
	// Given CNC definition and instance transform
	const cncDef = CNC_DEFINITION;
	assertEquals(cncDef.nominalWidthMm, 4000);
	assertEquals(cncDef.nominalHeightMm, 3000);

	const initialTransform = { x: 36000, y: 18000, rotationDeg: 0 };
	const footprintCenterLocal = { x: 2000, y: 1500 };

	const worldCenterBefore = worldPoint(footprintCenterLocal, initialTransform);
	assertEquals(worldCenterBefore.x, 38000);
	assertEquals(worldCenterBefore.y, 19500);

	// When rotating 90 degrees around the footprint center
	const rotatedTransform = rotateAround(
		initialTransform,
		footprintCenterLocal,
		90,
	);

	// Then: world center point is unchanged
	const worldCenterAfter = worldPoint(footprintCenterLocal, rotatedTransform);
	assertEquals(worldCenterAfter.x, 38000);
	assertEquals(worldCenterAfter.y, 19500);

	// And: width/height specification remains 4000x3000
	assertEquals(cncDef.nominalWidthMm, 4000);
	assertEquals(cncDef.nominalHeightMm, 3000);
	assertEquals(rotatedTransform.rotationDeg, 90);
});

// ----------------------------------------------------------------------------
// AC-014: Parametric Rack and Conveyor Generators
// ----------------------------------------------------------------------------

Deno.test("AC-014: Rack bays=6, levels=4 yields width 6000, capacity 24; conveyor length=12000 yields port end x=12000", () => {
	// 1. Parametric rack with bays=6, levels=4
	const rackDef = generateRackDefinition({ bays: 6, levels: 4 });
	assertEquals(rackDef.nominalWidthMm, 6000);
	assertEquals(computeRackCapacity(6, 4), 24);

	const rackBounds = polygonBounds(rackDef.footprint);
	assertEquals(rackBounds.width, 6000);
	assertEquals(rackBounds.height, 1200);

	// 2. Parametric conveyor with length=12000
	const conveyorDef = generateConveyorDefinition({ lengthMm: 12000 });
	assertEquals(conveyorDef.nominalWidthMm, 12000);

	const outPort = conveyorDef.ports.find((p) => p.id === "output");
	assertEquals(outPort !== undefined, true);
	assertEquals(outPort!.point.x, 12000);

	const convBounds = polygonBounds(conveyorDef.footprint);
	assertEquals(convBounds.width, 12000);
});

// ----------------------------------------------------------------------------
// AC-015: Dimension Value Calculations from Anchors
// ----------------------------------------------------------------------------

Deno.test("AC-015: Dimension anchors (0,0) and (3000,4000) calculate aligned 5000, horizontal 3000, and vertical 4000 mm", () => {
	const doc = createBlankDocument();

	const baseDim = {
		id: "dim-test",
		name: "Test Dimension",
		kind: "dimension" as const,
		layerId: "layer_marks",
		groupId: null,
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: null,
			stroke: "#0F172A",
			strokeWidthMm: 15,
			opacity: 1,
			dashMm: [],
		},
		a: { kind: "point" as const, point: { x: 0, y: 0 } },
		b: { kind: "point" as const, point: { x: 3000, y: 4000 } },
		offsetMm: 500,
		displayUnit: "document" as const,
		precision: 2 as const,
	};

	// 1. Aligned dimension (hypot: sqrt(3000^2 + 4000^2) = 5000 mm)
	const alignedDim: DimensionEntity = { ...baseDim, axis: "aligned" };
	assertEquals(computeDimensionValue(doc, alignedDim), 5000);

	// 2. Horizontal dimension (|3000 - 0| = 3000 mm)
	const horizDim: DimensionEntity = { ...baseDim, axis: "horizontal" };
	assertEquals(computeDimensionValue(doc, horizDim), 3000);

	// 3. Vertical dimension (|4000 - 0| = 4000 mm)
	const vertDim: DimensionEntity = { ...baseDim, axis: "vertical" };
	assertEquals(computeDimensionValue(doc, vertDim), 4000);

	// Complete 2D geometry projection check
	const geom = computeDimensionGeometry(doc, alignedDim);
	assertEquals(geom.valueMm, 5000);
	assertEquals(geom.aWorld.x, 0);
	assertEquals(geom.aWorld.y, 0);
	assertEquals(geom.bWorld.x, 3000);
	assertEquals(geom.bWorld.y, 4000);
});

// ----------------------------------------------------------------------------
// Deterministic Factory Fixtures Verification (§8.2, AC-052)
// ----------------------------------------------------------------------------

Deno.test("Factory Fixtures: nave-industrial-v1 passes validation with 0 issues; clean spatial checks report no physical conflicts", () => {
	const doc = createNaveIndustrialFixture();

	// 1. Canonical document validation passes with 0 issues
	const validation = validateBlueprintDocument(doc);
	assertEquals(
		validation.valid,
		true,
		`Expected valid fixture, got issues: ${JSON.stringify(validation.issues)}`,
	);
	assertEquals(validation.issues.length, 0);

	// 2. Facility dimensions and layer presets
	assertEquals(doc.content.facility.widthMm, 60000);
	assertEquals(doc.content.facility.heightMm, 40000);
	assertEquals(doc.content.layers.length, 4);

	// 3. Spatial checks on clean fixture: no physical overlap, clearance intrusion, or restricted zone issues
	const issues = runSpatialChecks(doc);
	const physicalIssues = issues.filter(
		(i) =>
			i.code === "FOOTPRINT_OVERLAP" ||
			i.code === "CLEARANCE_INTRUSION" ||
			i.code === "RESTRICTED_ZONE" ||
			i.code === "OUTSIDE_FACILITY",
	);
	assertEquals(
		physicalIssues.length,
		0,
		`Expected 0 physical conflict issues on clean fixture, got: ${JSON.stringify(physicalIssues)}`,
	);

	// Exactly 1 info issue: disconnected flow between robot and conveyor separated by 4000 mm
	const flowIssues = issues.filter((i) => i.code === "DISCONNECTED_FLOW");
	assertEquals(flowIssues.length, 1);
	assertEquals(flowIssues[0].severity, "info");
});

Deno.test("Conflict Fixture: nave-conflicts-v1 produces deterministic FOOTPRINT_OVERLAP, RESTRICTED_ZONE, and OUTSIDE_FACILITY issues", () => {
	const conflictDoc = createNaveConflictsFixture();
	const issues = runSpatialChecks(conflictDoc);

	// 1. Rack B overlaps Rack A
	const overlapIssue = issues.find(
		(i) =>
			i.code === "FOOTPRINT_OVERLAP" && i.entityIds.includes("device-rack-b"),
	);
	assertEquals(
		overlapIssue !== undefined,
		true,
		"Expected FOOTPRINT_OVERLAP on rack B",
	);
	assertEquals(overlapIssue!.severity, "warning");

	// 2. Extra rack intrudes into restricted hazard zone
	const hazardIssue = issues.find(
		(i) =>
			i.code === "RESTRICTED_ZONE" &&
			i.entityIds.includes("device-rack-hazard"),
	);
	assertEquals(
		hazardIssue !== undefined,
		true,
		"Expected RESTRICTED_ZONE on device-rack-hazard",
	);
	assertEquals(hazardIssue!.severity, "warning");

	// 3. CNC moved outside facility boundaries
	const outsideIssue = issues.find(
		(i) => i.code === "OUTSIDE_FACILITY" && i.entityIds.includes("device-cnc"),
	);
	assertEquals(
		outsideIssue !== undefined,
		true,
		"Expected OUTSIDE_FACILITY on device-cnc",
	);
	assertEquals(outsideIssue!.severity, "warning");
});
