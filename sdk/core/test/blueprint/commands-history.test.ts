// ============================================================================
// Blueprint Commands & History Acceptance Tests (§16.1, AC-016..AC-023)
// ============================================================================

import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import {
	createBlankDocument,
	createReducerEnvironment,
	createStandardLayers,
	HistoryManager,
	measureEntryBytes,
	reduceCommand,
	resolveAnchor,
	type BlueprintDocument,
	type DeviceEntity,
	type DimensionEntity,
	type Entity,
	type OpeningEntity,
	type ReducerEnvironment,
	type Relation,
	type ShapeEntity,
	type WallEntity,
} from "../../src/blueprint/mod.ts";

function createTestEnvironment(
	overrides?: Partial<ReducerEnvironment>,
): ReducerEnvironment {
	let counter = 0;
	let timeMs = 1773532800000; // 2026-03-15T00:00:00.000Z
	return {
		mode: overrides?.mode ?? "editor",
		clock:
			overrides?.clock ??
			(() => {
				timeMs += 1000;
				return new Date(timeMs).toISOString();
			}),
		idFactory:
			overrides?.idFactory ??
			(() => {
				counter++;
				return `id_${counter.toString().padStart(4, "0")}`;
			}),
	};
}

function insertEntities(
	doc: BlueprintDocument,
	...entities: Entity[]
): BlueprintDocument {
	const nextEntities = { ...doc.content.entities };
	const nextOrder = [...doc.content.entityOrder];
	for (const e of entities) {
		nextEntities[e.id] = e;
		if (!nextOrder.includes(e.id)) {
			nextOrder.push(e.id);
		}
	}
	doc.content = {
		...doc.content,
		entities: nextEntities,
		entityOrder: nextOrder,
	};
	return doc;
}

// ----------------------------------------------------------------------------
// AC-016: Preview mode rejects all document mutations with READ_ONLY
// ----------------------------------------------------------------------------

Deno.test("AC-016: Preview mode rejects all document mutations with READ_ONLY; doc and history remain identical", () => {
	const doc = createBlankDocument("Test Facility");
	const previewEnv = createTestEnvironment({ mode: "preview" });
	const manager = new HistoryManager(doc, previewEnv);

	// 1. Attempt entity.add
	const addCmd = {
		type: "entity.add" as const,
		entity: {
			id: "shape-1",
			name: "Shape 1",
			kind: "shape" as const,
			layerId: "foundation",
			groupId: null,
			transform: { x: 100, y: 100, rotationDeg: 0 },
			style: {
				fill: null,
				stroke: "#334155",
				strokeWidthMm: 25,
				opacity: 1,
				dashMm: [],
			},
			hidden: false,
			locked: false,
			tags: [],
			metadata: {},
			geometry: {
				kind: "rect" as const,
				width: 1000,
				height: 1000,
				cornerRadius: 0,
			},
			structural: false,
		},
	};

	const addRes = manager.execute(addCmd);
	assertEquals(addRes.success, false);
	if (!addRes.success) {
		assertEquals(addRes.error.code, "READ_ONLY");
	}

	// 2. Attempt selection.transform
	const moveRes = manager.execute({
		type: "selection.transform",
		ids: ["shape-1"],
		delta: { x: 100, y: 100 },
	});
	assertEquals(moveRes.success, false);
	if (!moveRes.success) {
		assertEquals(moveRes.error.code, "READ_ONLY");
	}

	// 3. Attempt entity.delete
	const delRes = manager.execute({
		type: "entity.delete",
		ids: ["shape-1"],
	});
	assertEquals(delRes.success, false);
	if (!delRes.success) {
		assertEquals(delRes.error.code, "READ_ONLY");
	}

	// 4. Attempt undo / redo
	const undoRes = manager.undo();
	assertEquals(undoRes.success, false);
	if (!undoRes.success) {
		assertEquals(undoRes.error.code, "READ_ONLY");
	}

	// Pure reduceCommand verification
	const directRes = reduceCommand(doc, addCmd, previewEnv);
	assertEquals(directRes.success, false);
	if (!directRes.success) {
		assertEquals(directRes.error.code, "READ_ONLY");
	}

	// Verify document and history remain completely identical
	assertEquals(manager.getDocument(), doc);
	assertEquals(manager.getUndoStack().length, 0);
	assertEquals(manager.getRedoStack().length, 0);
	assertEquals(manager.canUndo(), false);
	assertEquals(manager.canRedo(), false);
});

// ----------------------------------------------------------------------------
// AC-017: Multi-selection containing one locked entity rejects entire mutation
// ----------------------------------------------------------------------------

Deno.test("AC-017: Multi-selection includes one locked entity -> Entire mutation rejected; no unlocked member moves", () => {
	const doc = createBlankDocument("Test Facility");
	const env = createTestEnvironment();

	const shape1: ShapeEntity = {
		id: "shape-unlocked-1",
		name: "Shape Unlocked 1",
		kind: "shape",
		layerId: "foundation",
		groupId: null,
		transform: { x: 1000, y: 1000, rotationDeg: 0 },
		style: {
			fill: null,
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
		structural: false,
	};

	const shape2: ShapeEntity = {
		id: "shape-locked-2",
		name: "Shape Locked 2",
		kind: "shape",
		layerId: "foundation",
		groupId: null,
		transform: { x: 3000, y: 3000, rotationDeg: 0 },
		style: {
			fill: null,
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: true, // LOCKED ENTITY
		tags: [],
		metadata: {},
		geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
		structural: false,
	};

	const shape3: ShapeEntity = {
		id: "shape-unlocked-3",
		name: "Shape Unlocked 3",
		kind: "shape",
		layerId: "foundation",
		groupId: null,
		transform: { x: 5000, y: 5000, rotationDeg: 0 },
		style: {
			fill: null,
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
		structural: false,
	};

	insertEntities(doc, shape1, shape2, shape3);

	const manager = new HistoryManager(doc, env);

	// Attempt multi-selection transform targeting [shape1, shape2, shape3]
	const transformRes = manager.execute({
		type: "selection.transform",
		ids: [shape1.id, shape2.id, shape3.id],
		delta: { x: 500, y: 500 },
	});

	assertEquals(transformRes.success, false);
	if (!transformRes.success) {
		assertEquals(transformRes.error.code, "LOCKED_ENTITY");
		assertEquals(transformRes.error.entityIds, [shape2.id]);
	}

	// Verify NO unlocked member moved
	const currentDoc = manager.getDocument();
	assertEquals(currentDoc.content.entities[shape1.id].transform.x, 1000);
	assertEquals(currentDoc.content.entities[shape1.id].transform.y, 1000);
	assertEquals(currentDoc.content.entities[shape2.id].transform.x, 3000);
	assertEquals(currentDoc.content.entities[shape3.id].transform.x, 5000);
	assertEquals(currentDoc.revision, 1);
	assertEquals(manager.getUndoStack().length, 0);

	// Also verify entity on locked layer cascades lock
	const lockedLayerDoc = createBlankDocument("Layer Lock Test");
	lockedLayerDoc.content = {
		...lockedLayerDoc.content,
		layers: [
			...lockedLayerDoc.content.layers,
			{
				id: "custom-locked-layer",
				name: "Locked Layer",
				role: "custom",
				parentId: null,
				visible: true,
				locked: true, // LOCKED LAYER
				printable: true,
				opacity: 1,
			},
		],
	};
	const shapeOnLockedLayer: ShapeEntity = {
		...shape1,
		id: "shape-on-locked-layer",
		layerId: "custom-locked-layer",
		locked: false, // Entity itself not locked, but layer is locked
	};
	insertEntities(lockedLayerDoc, shape1, shapeOnLockedLayer);

	const layerManager = new HistoryManager(lockedLayerDoc, env);
	const layerTransformRes = layerManager.execute({
		type: "selection.transform",
		ids: [shape1.id, shapeOnLockedLayer.id],
		delta: { x: 200, y: 200 },
	});
	assertEquals(layerTransformRes.success, false);
	if (!layerTransformRes.success) {
		assertEquals(layerTransformRes.error.code, "LOCKED_ENTITY");
	}
	assertEquals(
		layerManager.getDocument().content.entities[shape1.id].transform.x,
		1000,
	);
});

// ----------------------------------------------------------------------------
// AC-018: 100 pointer preview moves then commit
// ----------------------------------------------------------------------------

Deno.test("AC-018: 100 pointer preview moves then commit -> exactly one revision increment and one undo entry", () => {
	const doc = createBlankDocument("Test Facility");
	const env = createTestEnvironment();

	const shape: ShapeEntity = {
		id: "shape-1",
		name: "Shape 1",
		kind: "shape",
		layerId: "foundation",
		groupId: null,
		transform: { x: 1000, y: 1000, rotationDeg: 0 },
		style: {
			fill: null,
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
		structural: false,
	};
	insertEntities(doc, shape);

	const manager = new HistoryManager(doc, env);
	const initialRev = doc.revision;

	// Simulate 100 pointer preview moves
	for (let i = 1; i <= 100; i++) {
		const previewDoc: BlueprintDocument = {
			...doc,
			content: {
				...doc.content,
				entities: {
					...doc.content.entities,
					[shape.id]: {
						...shape,
						transform: { x: 1000 + i * 10, y: 1000 + i * 10, rotationDeg: 0 },
					},
				},
			},
		};
		manager.preview(previewDoc);

		// During preview, committed document revision and history stack remain unchanged
		assertEquals(manager.getCommittedDocument().revision, initialRev);
		assertEquals(manager.getUndoStack().length, 0);
	}

	// Pointerup -> single commit
	const commitRes = manager.execute({
		type: "selection.transform",
		ids: [shape.id],
		delta: { x: 1000, y: 1000 },
	});

	assertEquals(commitRes.success, true);
	// Exactly one document revision increment
	assertEquals(manager.getDocument().revision, initialRev + 1);
	// Exactly one undo entry
	assertEquals(manager.getUndoStack().length, 1);
	assertEquals(manager.getRedoStack().length, 0);
	assertEquals(
		manager.getDocument().content.entities[shape.id].transform.x,
		2000,
	);
	assertEquals(
		manager.getDocument().content.entities[shape.id].transform.y,
		2000,
	);
});

// ----------------------------------------------------------------------------
// AC-019: Gesture returns to initial quantized position
// ----------------------------------------------------------------------------

Deno.test("AC-019: Gesture returns to initial quantized position -> { noChange: true }; no doc/history/timestamp change", () => {
	const doc = createBlankDocument("Test Facility");
	const env = createTestEnvironment();

	const shape: ShapeEntity = {
		id: "shape-1",
		name: "Shape 1",
		kind: "shape",
		layerId: "foundation",
		groupId: null,
		transform: { x: 1000, y: 2000, rotationDeg: 0 },
		style: {
			fill: null,
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
		structural: false,
	};
	insertEntities(doc, shape);

	const manager = new HistoryManager(doc, env);
	const initialRev = doc.revision;
	const initialUpdatedAt = doc.updatedAt;

	// Net-zero delta ({ x: 0, y: 0 })
	const resZero = manager.execute({
		type: "selection.transform",
		ids: [shape.id],
		delta: { x: 0, y: 0 },
	});

	assertEquals(resZero.success, true);
	assertEquals(resZero.noChange, true);
	assertEquals(manager.getDocument().revision, initialRev);
	assertEquals(manager.getDocument().updatedAt, initialUpdatedAt);
	assertEquals(manager.getUndoStack().length, 0);

	// Delta below quantization threshold (0.0001 mm < 0.001 mm epsilon)
	const resSubEpsilon = manager.execute({
		type: "selection.transform",
		ids: [shape.id],
		delta: { x: 0.0001, y: -0.0002 },
	});

	assertEquals(resSubEpsilon.success, true);
	assertEquals(resSubEpsilon.noChange, true);
	assertEquals(manager.getDocument().revision, initialRev);
	assertEquals(manager.getDocument().updatedAt, initialUpdatedAt);
	assertEquals(manager.getUndoStack().length, 0);
});

// ----------------------------------------------------------------------------
// AC-020: Commit A, B; undo B; commit C -> redo empty; undo C restores A; revision monotonic
// ----------------------------------------------------------------------------

Deno.test("AC-020: Commit A, B; undo B; commit C -> redo empty; undo C restores A; revision remains monotonic", () => {
	const doc = createBlankDocument("Initial");
	const env = createTestEnvironment();
	const manager = new HistoryManager(doc, env);

	const rev0 = doc.revision; // 1

	// 1. Commit A
	const resA = manager.execute({
		type: "document.rename",
		name: "Doc A",
	});
	assertEquals(resA.success, true);
	const revA = manager.getDocument().revision;
	assertEquals(revA, rev0 + 1); // 2
	assertEquals(manager.getDocument().content.name, "Doc A");
	assertEquals(manager.getUndoStack().length, 1);
	assertEquals(manager.getRedoStack().length, 0);

	// 2. Commit B
	const resB = manager.execute({
		type: "document.describe",
		description: "Description B",
	});
	assertEquals(resB.success, true);
	const revB = manager.getDocument().revision;
	assertEquals(revB, revA + 1); // 3
	assertEquals(manager.getDocument().content.description, "Description B");
	assertEquals(manager.getUndoStack().length, 2);

	// 3. Undo B
	const resUndoB = manager.undo();
	assertEquals(resUndoB.success, true);
	const revUndoB = manager.getDocument().revision;
	assertEquals(revUndoB, revB + 1); // 4 (strictly monotonic!)
	assertEquals(manager.getDocument().content.description, ""); // restored to before B
	assertEquals(manager.getDocument().content.name, "Doc A");
	assertEquals(manager.getUndoStack().length, 1);
	assertEquals(manager.getRedoStack().length, 1);

	// 4. Commit C
	const resC = manager.execute({
		type: "document.rename",
		name: "Doc C",
	});
	assertEquals(resC.success, true);
	const revC = manager.getDocument().revision;
	assertEquals(revC, revUndoB + 1); // 5 (strictly monotonic!)
	assertEquals(manager.getDocument().content.name, "Doc C");
	// Redo stack is cleared after new commit!
	assertEquals(manager.getRedoStack().length, 0);
	assertEquals(manager.getUndoStack().length, 2);

	// 5. Undo C
	const resUndoC = manager.undo();
	assertEquals(resUndoC.success, true);
	const revUndoC = manager.getDocument().revision;
	assertEquals(revUndoC, revC + 1); // 6 (strictly monotonic!)
	// Content after undo C restores state after A!
	assertEquals(manager.getDocument().content.name, "Doc A");
	assertEquals(manager.getDocument().content.description, "");
	assertEquals(manager.getRedoStack().length, 1);

	// Monotonic revision check: 1 -> 2 -> 3 -> 4 -> 5 -> 6
	assertEquals(
		[rev0, revA, revB, revUndoB, revC, revUndoC],
		[1, 2, 3, 4, 5, 6],
	);
});

// ----------------------------------------------------------------------------
// AC-021: Delete wall with opening and anchored dimension
// ----------------------------------------------------------------------------

Deno.test("AC-021: Delete wall with opening and anchored dimension -> opening deleted, dimension anchor frozen; undo restores all IDs/relations", () => {
	const doc = createBlankDocument("Wall Deletion Test");
	const env = createTestEnvironment();

	// Create wall entity
	const wall: WallEntity = {
		id: "wall-01",
		name: "Wall 1",
		kind: "wall",
		layerId: "sections",
		groupId: null,
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: "#64748B",
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: ["wall"],
		metadata: {},
		thicknessMm: 300,
		closed: false,
		vertices: [
			{ id: "wv1", point: { x: 1000, y: 1000 } },
			{ id: "wv2", point: { x: 9000, y: 1000 } },
		],
	};

	// Create opening entity hosted on wall-01
	const opening: OpeningEntity = {
		id: "opening-01",
		name: "Door 1",
		kind: "opening",
		layerId: "sections",
		groupId: null,
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: null,
			stroke: "#38BDF8",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: ["door"],
		metadata: {},
		wallId: wall.id,
		segmentStartId: "wv1",
		segmentEndId: "wv2",
		offsetMm: 2000,
		widthMm: 1000,
		openingType: "door",
		hinge: "start",
		swing: "left",
	};

	// Create dimension entity anchored to wall-01 center
	const preResolvedWallCenter = resolveAnchor(
		{ ...doc, content: { ...doc.content, entities: { [wall.id]: wall } } },
		{ kind: "entity", entityId: wall.id, feature: "center", featureId: null },
	);

	const dimension: DimensionEntity = {
		id: "dim-01",
		name: "Dimension 1",
		kind: "dimension",
		layerId: "marks",
		groupId: null,
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: null,
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		a: {
			kind: "entity",
			entityId: wall.id,
			feature: "center",
			featureId: null,
		},
		b: { kind: "point", point: { x: 0, y: 0 } },
		axis: "aligned",
		offsetMm: 500,
		displayUnit: "document",
		precision: 2,
	};

	insertEntities(doc, wall, opening, dimension);

	const manager = new HistoryManager(doc, env);

	// Execute deletion of wall-01
	const delRes = manager.execute({
		type: "entity.delete",
		ids: [wall.id],
	});

	assertEquals(delRes.success, true);
	const postDeleteDoc = manager.getDocument();

	// 1. Wall deleted
	assertEquals(postDeleteDoc.content.entities[wall.id], undefined);

	// 2. Child opening automatically deleted (§5.1, AC-021)
	assertEquals(postDeleteDoc.content.entities[opening.id], undefined);
	assertEquals(postDeleteDoc.content.entityOrder.includes(opening.id), false);

	// 3. Dimension anchor referencing wall converted to frozen fixed world point (§5.1, AC-021)
	const updatedDim = postDeleteDoc.content.entities[
		dimension.id
	] as DimensionEntity;
	assertNotEquals(updatedDim, undefined);
	assertEquals(updatedDim.a.kind, "point");
	if (updatedDim.a.kind === "point") {
		assertEquals(updatedDim.a.point.x, preResolvedWallCenter.x);
		assertEquals(updatedDim.a.point.y, preResolvedWallCenter.y);
	}

	// 4. Single undo restores all IDs, relations, and entity anchors (§5.1, AC-021)
	const undoRes = manager.undo();
	assertEquals(undoRes.success, true);
	const restoredDoc = manager.getDocument();

	// Wall restored
	assertNotEquals(restoredDoc.content.entities[wall.id], undefined);
	assertEquals(restoredDoc.content.entities[wall.id].id, wall.id);

	// Child opening restored with identical ID and properties
	assertNotEquals(restoredDoc.content.entities[opening.id], undefined);
	assertEquals(restoredDoc.content.entities[opening.id].id, opening.id);
	assertEquals(
		(restoredDoc.content.entities[opening.id] as OpeningEntity).wallId,
		wall.id,
	);

	// Dimension entity anchor restored
	const restoredDim = restoredDoc.content.entities[
		dimension.id
	] as DimensionEntity;
	assertEquals(restoredDim.a.kind, "entity");
	if (restoredDim.a.kind === "entity") {
		assertEquals(restoredDim.a.entityId, wall.id);
		assertEquals(restoredDim.a.feature, "center");
	}
});

// ----------------------------------------------------------------------------
// AC-022: Duplicate two connected devices
// ----------------------------------------------------------------------------

Deno.test("AC-022: Duplicate two connected devices -> new IDs, unique assetKey (-copy-1), internal cloned relation, cleared live bindings", () => {
	const doc = createBlankDocument("Duplication Test");
	const env = createTestEnvironment();

	const device1: DeviceEntity = {
		id: "device-cnc-01",
		name: "CNC Machine 1",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		transform: { x: 10000, y: 10000, rotationDeg: 0 },
		style: {
			fill: "#3B82F6",
			stroke: "#1D4ED8",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: ["cnc"],
		metadata: {},
		definitionId: "def-cnc-standard",
		assetKey: "CNC-01",
		parameters: {},
		ratedPowerKw: 15,
		maintenanceDue: null,
		bindings: [{ field: "powerKw", sourceId: "telemetry-1", channel: "p1" }],
	};

	const device2: DeviceEntity = {
		id: "device-robot-01",
		name: "Robot 1",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		transform: { x: 16000, y: 10000, rotationDeg: 0 },
		style: {
			fill: "#10B981",
			stroke: "#047857",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: ["robot"],
		metadata: {},
		definitionId: "def-robot-arm",
		assetKey: "ROBOT-01",
		parameters: {},
		ratedPowerKw: 8,
		maintenanceDue: null,
		bindings: [{ field: "loadPct", sourceId: "telemetry-2", channel: "l1" }],
	};

	// Unselected device to verify external relations are NOT cloned
	const device3: DeviceEntity = {
		id: "device-unselected-03",
		name: "Conveyor",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		transform: { x: 25000, y: 10000, rotationDeg: 0 },
		style: {
			fill: "#64748B",
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: ["conveyor"],
		metadata: {},
		definitionId: "def-conveyor",
		assetKey: "CONV-01",
		parameters: {},
		ratedPowerKw: 5,
		maintenanceDue: null,
		bindings: [],
	};

	// Relation between device1 and device2 (both selected)
	const internalRel: Relation = {
		id: "rel-flow-1-2",
		kind: "flow",
		fromDeviceId: device1.id,
		fromPortId: "p_out",
		toDeviceId: device2.id,
		toPortId: "p_in",
	};

	// Relation between device2 and device3 (one selected, one external)
	const externalRel: Relation = {
		id: "rel-flow-2-3",
		kind: "flow",
		fromDeviceId: device2.id,
		fromPortId: "p_out",
		toDeviceId: device3.id,
		toPortId: "p_in",
	};

	insertEntities(doc, device1, device2, device3);
	doc.content = {
		...doc.content,
		relations: [internalRel, externalRel],
	};

	const manager = new HistoryManager(doc, env);

	// Duplicate the two connected devices
	const dupRes = manager.execute({
		type: "selection.duplicate",
		ids: [device1.id, device2.id],
		offsetMm: { x: 1000, y: 1000 },
	});

	assertEquals(dupRes.success, true);
	if (!dupRes.success || dupRes.noChange) {
		throw new Error("Duplication failed");
	}

	const newDoc = manager.getDocument();

	// 1. Originals remain completely unchanged
	const orig1 = newDoc.content.entities[device1.id] as DeviceEntity;
	const orig2 = newDoc.content.entities[device2.id] as DeviceEntity;
	assertEquals(orig1.assetKey, "CNC-01");
	assertEquals(orig1.bindings.length, 1);
	assertEquals(orig1.transform.x, 10000);
	assertEquals(orig2.assetKey, "ROBOT-01");
	assertEquals(orig2.bindings.length, 1);
	assertEquals(orig2.transform.x, 16000);

	// 2. New IDs and unique assetKey with suffix -copy-1
	const addedIds = dupRes.delta.addedEntityIds;
	assertEquals(addedIds.length, 2);

	const dup1 = newDoc.content.entities[addedIds[0]] as DeviceEntity;
	const dup2 = newDoc.content.entities[addedIds[1]] as DeviceEntity;

	assertEquals(dup1.assetKey, "CNC-01-copy-1");
	assertEquals(dup2.assetKey, "ROBOT-01-copy-1");

	// 3. Telemetry bindings are CLEARED (§5.1, AC-022)
	assertEquals(dup1.bindings, []);
	assertEquals(dup2.bindings, []);

	// 4. Transforms are offset by +1000 mm X/Y
	assertEquals(dup1.transform.x, 11000);
	assertEquals(dup1.transform.y, 11000);
	assertEquals(dup2.transform.x, 17000);
	assertEquals(dup2.transform.y, 11000);

	// 5. Internal relation is cloned connecting the two new IDs
	const clonedRels = newDoc.content.relations.filter(
		(r) => r.id !== internalRel.id && r.id !== externalRel.id,
	);
	assertEquals(clonedRels.length, 1);
	const clonedFlow = clonedRels[0];
	assertEquals(clonedFlow.kind, "flow");
	if (clonedFlow.kind === "flow") {
		assertEquals(clonedFlow.fromDeviceId, dup1.id);
		assertEquals(clonedFlow.toDeviceId, dup2.id);
	}

	// 6. External relation is NOT cloned because device3 was not duplicated
	const relsWithDevice3 = newDoc.content.relations.filter(
		(r) => r.kind === "flow" && r.toDeviceId === device3.id,
	);
	assertEquals(relsWithDevice3.length, 1); // only the original externalRel
});

// ----------------------------------------------------------------------------
// AC-023: Add >100 history entries / exceed byte cap
// ----------------------------------------------------------------------------

Deno.test("AC-023: Add >100 history entries / exceed byte cap -> oldest whole entries evicted within bounds; most recent undo correct", () => {
	const doc = createBlankDocument("Cap Test");
	const env = createTestEnvironment();
	const manager = new HistoryManager(doc, env, { maxEntries: 100 });

	// 1. Add 105 history entries
	for (let i = 1; i <= 105; i++) {
		const res = manager.execute({
			type: "document.rename",
			name: `Facility Step ${i}`,
		});
		assertEquals(res.success, true);
	}

	// Undo stack strictly bounded to 100 entries (oldest 5 evicted)
	assertEquals(manager.getUndoStack().length, 100);
	assertEquals(manager.getDocument().content.name, "Facility Step 105");

	// Most recent undo correctly restores step 104
	const undoRes = manager.undo();
	assertEquals(undoRes.success, true);
	assertEquals(manager.getDocument().content.name, "Facility Step 104");
	assertEquals(manager.getUndoStack().length, 99);
	assertEquals(manager.getRedoStack().length, 1);

	// Redo restores step 105
	const redoRes = manager.redo();
	assertEquals(redoRes.success, true);
	assertEquals(manager.getDocument().content.name, "Facility Step 105");

	// 2. Byte limit eviction test with small byte cap
	const smallByteManager = new HistoryManager(doc, env, { maxBytes: 8000 });
	for (let i = 1; i <= 30; i++) {
		smallByteManager.execute({
			type: "document.rename",
			name: `Long Name Facility Step ${i} With Extra Padding Text ${"A".repeat(50)}`,
		});
	}

	// Total serialized bytes must remain <= 8000
	const totalBytes = smallByteManager.getTotalBytes();
	assertEquals(totalBytes <= 8000, true);
	// Most recent undo works cleanly
	const smallUndoRes = smallByteManager.undo();
	assertEquals(smallUndoRes.success, true);

	// 3. Individual entry > maxBytes rejected before commit with HISTORY_LIMIT (§5.2, AC-023)
	const strictManager = new HistoryManager(doc, env, { maxBytes: 1000 });
	const hugeCommand = {
		type: "document.describe" as const,
		description: "X".repeat(2000), // Produces an entry well above 1000 bytes
	};
	const hugeRes = strictManager.execute(hugeCommand);
	assertEquals(hugeRes.success, false);
	if (!hugeRes.success) {
		assertEquals(hugeRes.error.code, "HISTORY_LIMIT");
	}
	// Document remains untouched
	assertEquals(strictManager.getDocument().content.description, "");
	assertEquals(strictManager.getUndoStack().length, 0);
});

// ----------------------------------------------------------------------------
// Additional Command Reducer & Hierarchy Acceptance Tests
// ----------------------------------------------------------------------------

Deno.test("Commands: Preset layer deletion and role change are protected", () => {
	const doc = createBlankDocument("Layer Protection Test");
	const env = createTestEnvironment();
	const manager = new HistoryManager(doc, env);

	const sectionsLayer = doc.content.layers.find((l) => l.role === "sections")!;
	const foundationLayer = doc.content.layers.find(
		(l) => l.role === "foundation",
	)!;

	// Attempt to delete preset layer 'sections'
	const delPresetRes = manager.execute({
		type: "layer.delete",
		id: sectionsLayer.id,
		mode: "deleteContents",
	});
	assertEquals(delPresetRes.success, false);
	if (!delPresetRes.success) {
		assertEquals(delPresetRes.error.code, "PRESET_LAYER_PROTECTED");
	}

	// Attempt to change role of preset layer 'foundation'
	const roleChangeRes = manager.execute({
		type: "layer.update",
		id: foundationLayer.id,
		patch: { role: "custom" } as any,
	});
	assertEquals(roleChangeRes.success, false);
	if (!roleChangeRes.success) {
		assertEquals(roleChangeRes.error.code, "PRESET_LAYER_PROTECTED");
	}
});

Deno.test("Commands: Layer deletion with moveContents moves child entities to target layer", () => {
	const doc = createBlankDocument("Layer Move Contents Test");
	const env = createTestEnvironment();

	// Add custom layer 1 and custom layer 2
	doc.content = {
		...doc.content,
		layers: [
			...doc.content.layers,
			{
				id: "layer-source",
				name: "Source Layer",
				role: "custom",
				parentId: null,
				visible: true,
				locked: false,
				printable: true,
				opacity: 1,
			},
			{
				id: "layer-target",
				name: "Target Layer",
				role: "custom",
				parentId: null,
				visible: true,
				locked: false,
				printable: true,
				opacity: 1,
			},
		],
	};

	const shape: ShapeEntity = {
		id: "shape-on-source",
		name: "Shape on Source",
		kind: "shape",
		layerId: "layer-source",
		groupId: null,
		transform: { x: 100, y: 100, rotationDeg: 0 },
		style: {
			fill: null,
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		geometry: { kind: "rect", width: 500, height: 500, cornerRadius: 0 },
		structural: false,
	};
	insertEntities(doc, shape);

	const manager = new HistoryManager(doc, env);

	const delRes = manager.execute({
		type: "layer.delete",
		id: "layer-source",
		mode: "moveContents",
		targetLayerId: "layer-target",
	});

	assertEquals(delRes.success, true);
	const newDoc = manager.getDocument();

	// Layer deleted
	assertEquals(
		newDoc.content.layers.some((l) => l.id === "layer-source"),
		false,
	);
	// Entity moved to target layer
	assertEquals(newDoc.content.entities[shape.id].layerId, "layer-target");
});

Deno.test("Commands: Selection align and distribute", () => {
	const doc = createBlankDocument("Align Distribute Test");
	const env = createTestEnvironment();

	const s1: ShapeEntity = {
		id: "s1",
		name: "S1",
		kind: "shape",
		layerId: "foundation",
		groupId: null,
		transform: { x: 1000, y: 1000, rotationDeg: 0 },
		style: {
			fill: null,
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
		structural: false,
	};

	const s2: ShapeEntity = {
		id: "s2",
		name: "S2",
		kind: "shape",
		layerId: "foundation",
		groupId: null,
		transform: { x: 3000, y: 2000, rotationDeg: 0 },
		style: {
			fill: null,
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
		structural: false,
	};

	const s3: ShapeEntity = {
		id: "s3",
		name: "S3",
		kind: "shape",
		layerId: "foundation",
		groupId: null,
		transform: { x: 8000, y: 4000, rotationDeg: 0 },
		style: {
			fill: null,
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
		structural: false,
	};

	insertEntities(doc, s1, s2, s3);

	const manager = new HistoryManager(doc, env);

	// 1. Align left with 3 entities -> all align to minX (1000)
	const alignRes = manager.execute({
		type: "selection.align",
		ids: [s1.id, s2.id, s3.id],
		alignment: "left",
	});
	assertEquals(alignRes.success, true);
	const alignedDoc = manager.getDocument();
	assertEquals(alignedDoc.content.entities[s1.id].transform.x, 1000);
	assertEquals(alignedDoc.content.entities[s2.id].transform.x, 1000);
	assertEquals(alignedDoc.content.entities[s3.id].transform.x, 1000);

	// 1b. Two-entity alignment (C-06.1): align s2 and s3 to right
	// s2 width 1000, x 1000 -> right = 2000; s3 width 1000, x 1000 -> move s3 to x 3000
	const doc2 = createBlankDocument("Align 2 Test");
	const e1: ShapeEntity = {
		...s1,
		id: "e1",
		transform: { x: 1000, y: 1000, rotationDeg: 0 },
	};
	const e2: ShapeEntity = {
		...s2,
		id: "e2",
		transform: { x: 3000, y: 1000, rotationDeg: 0 },
	};
	insertEntities(doc2, e1, e2);
	const manager2 = new HistoryManager(doc2, env);

	const align2Res = manager2.execute({
		type: "selection.align",
		ids: [e1.id, e2.id],
		alignment: "left",
	});
	assertEquals(align2Res.success, true);
	const alignedDoc2 = manager2.getDocument();
	assertEquals(alignedDoc2.content.entities[e1.id].transform.x, 1000);
	assertEquals(alignedDoc2.content.entities[e2.id].transform.x, 1000);

	// 1c. Alignment with fewer than 2 entities rejects with ALIGN_MIN_ENTITIES (C-06.1)
	const invalidAlign = manager2.execute({
		type: "selection.align",
		ids: [e1.id],
		alignment: "left",
	});
	assertEquals(invalidAlign.success, false);
	if (!invalidAlign.success) {
		assertEquals(invalidAlign.error.code, "ALIGN_MIN_ENTITIES");
	}

	// 2. Distribute vertical -> distributes evenly between min and max center Y
	const distRes = manager.execute({
		type: "selection.distribute",
		ids: [s1.id, s2.id, s3.id],
		axis: "vertical",
	});
	assertEquals(distRes.success, true);
	const distDoc = manager.getDocument();
	// s1 center Y was 1500 (y: 1000), s3 center Y was 4500 (y: 4000)
	// span = 3000, step = 1500. s2 target center Y is 1500 + 1500 = 3000 -> y = 2500
	assertEquals(distDoc.content.entities[s2.id].transform.y, 2500);

	// 3. Distribute with fewer than 3 entities rejects with DISTRIBUTE_MIN_ENTITIES (C-06.1)
	const invalidDist = manager.execute({
		type: "selection.distribute",
		ids: [s1.id, s2.id],
		axis: "horizontal",
	});
	assertEquals(invalidDist.success, false);
	if (!invalidDist.success) {
		assertEquals(invalidDist.error.code, "DISTRIBUTE_MIN_ENTITIES");
	}
});

Deno.test("Commands: Group creation and dissolution", () => {
	const doc = createBlankDocument("Group Test");
	const env = createTestEnvironment();

	const s1: ShapeEntity = {
		id: "g-s1",
		name: "GS1",
		kind: "shape",
		layerId: "foundation",
		groupId: null,
		transform: { x: 1000, y: 1000, rotationDeg: 0 },
		style: {
			fill: null,
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
		structural: false,
	};
	const s2: ShapeEntity = {
		id: "g-s2",
		name: "GS2",
		kind: "shape",
		layerId: "foundation",
		groupId: null,
		transform: { x: 3000, y: 1000, rotationDeg: 0 },
		style: {
			fill: null,
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
		structural: false,
	};

	insertEntities(doc, s1, s2);

	const manager = new HistoryManager(doc, env);

	// Create group
	const createGroupRes = manager.execute({
		type: "group.create",
		ids: [s1.id, s2.id],
		name: "Test Group",
	});
	assertEquals(createGroupRes.success, true);
	const groupedDoc = manager.getDocument();
	assertEquals(groupedDoc.content.groups.length, 1);
	const groupId = groupedDoc.content.groups[0].id;
	assertEquals(groupedDoc.content.entities[s1.id].groupId, groupId);
	assertEquals(groupedDoc.content.entities[s2.id].groupId, groupId);

	// Dissolve group
	const dissolveRes = manager.execute({
		type: "group.dissolve",
		groupIds: [groupId],
	});
	assertEquals(dissolveRes.success, true);
	const dissolvedDoc = manager.getDocument();
	assertEquals(dissolvedDoc.content.groups.length, 0);
	assertEquals(dissolvedDoc.content.entities[s1.id].groupId, null);
	assertEquals(dissolvedDoc.content.entities[s2.id].groupId, null);
});

Deno.test("Commands: Batch command executes atomically and commits once", () => {
	const doc = createBlankDocument("Batch Test");
	const env = createTestEnvironment();
	const manager = new HistoryManager(doc, env);
	const initialRev = doc.revision;

	const batchRes = manager.execute({
		type: "batch",
		label: "Batch Rename and Describe",
		commands: [
			{ type: "document.rename", name: "Batch Facility" },
			{ type: "document.describe", description: "Batch Description" },
		],
	});

	assertEquals(batchRes.success, true);
	// Single revision increment for entire batch
	assertEquals(manager.getDocument().revision, initialRev + 1);
	assertEquals(manager.getDocument().content.name, "Batch Facility");
	assertEquals(manager.getDocument().content.description, "Batch Description");
	assertEquals(manager.getUndoStack().length, 1);

	// Single undo restores both changes
	const undoRes = manager.undo();
	assertEquals(undoRes.success, true);
	assertEquals(manager.getDocument().content.name, "Batch Test");
	assertEquals(manager.getDocument().content.description, "");
});
