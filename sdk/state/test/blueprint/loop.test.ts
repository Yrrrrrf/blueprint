// ============================================================================
// WP-06: First Complete Loop Integration Test (§15, §18 of Blueprint Specification)
// Verifies: blank doc -> place CNC -> move +5m -> rotate 90° -> save to memory repo
// -> serialize canonical JSON -> re-open in new session -> 100% fidelity assertion
// -> switch to viewer -> tick simulator -> inspect device & telemetry -> verify READ_ONLY
// ============================================================================

import { assertEquals, assertNotEquals } from "@std/assert";
import type { DeviceEntity } from "../../../core/src/mod.ts";
import { createBlankDocument } from "../../../core/src/mod.ts";
import { PaperRenderer } from "../../../renderer/src/mod.ts";
import {
	createSimulator,
	MemoryDocumentRepository,
	parseNativeDocument,
	serializeNativeDocument,
} from "../../../api/src/mod.ts";
import { BlueprintSession } from "../../src/blueprint/mod.ts";

const isVitest = typeof (globalThis as any).__vitest_worker__ !== "undefined";

async function runLoopTest() {
	// 1. Initialize session with blank document
	const blankDoc = createBlankDocument();
	const repo = new MemoryDocumentRepository();
	const simulator = createSimulator({ seed: "blueprint-nave-v1" });

	const session = new BlueprintSession({
		document: blankDoc,
		repository: repo,
		telemetryPort: simulator,
	});

	// Attach PaperRenderer to verify scenegraph synchronizer
	const renderer = new PaperRenderer({
		width: 800,
		height: 600,
		document: session.doc,
	});
	session.attachRenderer(renderer);

	assertEquals(session.mode, "editor");
	assertEquals(Object.keys(session.doc.content.entities).length, 0);

	// 2. Place device (def-cnc-v1 at (10000, 10000))
	const cncEntity: DeviceEntity = {
		id: "dev-cnc-01",
		name: "CNC Milling Station 1",
		kind: "device",
		layerId: "layer_machinery",
		groupId: null,
		definitionId: "def-cnc-v1",
		assetKey: "cnc-01",
		transform: { x: 10000, y: 10000, rotationDeg: 0 },
		style: {
			fill: null,
			stroke: null,
			strokeWidthMm: 1,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: ["machining", "cnc"],
		metadata: { cell: "A1", spindleSpeedRpm: 12000, feedRateMpm: 15 },
		parameters: {},
		ratedPowerKw: 15,
		maintenanceDue: null,
		bindings: [
			{
				field: "loadPct",
				sourceId: "simulator",
				channel: "cnc-01.loadPct",
			},
			{
				field: "temperatureC",
				sourceId: "simulator",
				channel: "cnc-01.temperatureC",
			},
			{
				field: "status",
				sourceId: "simulator",
				channel: "cnc-01.status",
			},
		],
	};

	const addRes = session.execute({ type: "entity.add", entity: cncEntity });
	assertEquals(addRes.success, true);
	assertEquals(session.doc.content.entities["dev-cnc-01"]?.transform.x, 10000);
	assertEquals(session.doc.content.entities["dev-cnc-01"]?.transform.y, 10000);

	// 3. Move device by (5000, 5000) -> new position (15000, 15000)
	session.setSelection(["dev-cnc-01"]);
	const moveRes = session.execute({
		type: "selection.transform",
		ids: ["dev-cnc-01"],
		delta: { x: 5000, y: 5000 },
	});
	assertEquals(moveRes.success, true);
	assertEquals(session.doc.content.entities["dev-cnc-01"]?.transform.x, 15000);
	assertEquals(session.doc.content.entities["dev-cnc-01"]?.transform.y, 15000);
	assertEquals(
		session.doc.content.entities["dev-cnc-01"]?.transform.rotationDeg,
		0,
	);

	// 4. Rotate device by 90° around its origin
	const rotRes = session.execute({
		type: "selection.transform",
		ids: ["dev-cnc-01"],
		rotationDeg: 90,
		pivot: { x: 15000, y: 15000 },
	});
	assertEquals(rotRes.success, true);
	assertEquals(session.doc.content.entities["dev-cnc-01"]?.transform.x, 15000);
	assertEquals(session.doc.content.entities["dev-cnc-01"]?.transform.y, 15000);
	assertEquals(
		session.doc.content.entities["dev-cnc-01"]?.transform.rotationDeg,
		90,
	);

	// 5. Save document to MemoryDocumentRepository and serialize to native JSON
	await session.save();

	const jsonStr = serializeNativeDocument(session.doc);
	assertEquals(typeof jsonStr, "string");
	assertEquals(jsonStr.endsWith("\n"), true);

	const parseResult = parseNativeDocument(jsonStr);
	assertEquals(parseResult.valid, true);
	assertNotEquals(parseResult.document, undefined);

	// 6. Create a second session and load the saved document
	const session2 = new BlueprintSession({ repository: repo });
	const loadSuccess = await session2.load(session.doc.documentId);
	assertEquals(loadSuccess, true);

	// 7. Assert 100% fidelity on all IDs, transforms, parameters, definitions
	const doc2 = session2.doc;
	assertEquals(doc2.documentId, session.doc.documentId);
	assertEquals(doc2.revision, session.doc.revision);

	const loadedCnc = doc2.content.entities["dev-cnc-01"] as DeviceEntity;
	assertNotEquals(loadedCnc, undefined);
	assertEquals(loadedCnc.id, "dev-cnc-01");
	assertEquals(loadedCnc.name, "CNC Milling Station 1");
	assertEquals(loadedCnc.definitionId, "def-cnc-v1");
	assertEquals(loadedCnc.assetKey, "cnc-01");
	assertEquals(loadedCnc.transform.x, 15000);
	assertEquals(loadedCnc.transform.y, 15000);
	assertEquals(loadedCnc.transform.rotationDeg, 90);
	assertEquals(loadedCnc.parameters, {});
	assertEquals(loadedCnc.ratedPowerKw, 15);
	assertEquals(loadedCnc.bindings.length, 3);
	assertEquals(loadedCnc.metadata.cell, "A1");
	assertEquals(loadedCnc.metadata.spindleSpeedRpm, 12000);
	assertEquals(loadedCnc.metadata.feedRateMpm, 15);

	// 8. Switch second session to viewer mode
	session2.setMode("viewer");
	assertEquals(session2.mode, "viewer");

	// 9. Tick telemetry simulator and assert device receives updated telemetry readings
	session2.setTelemetryPort(simulator);
	simulator.tick();

	const telemetry = session2.getTelemetry("dev-cnc-01");
	assertNotEquals(telemetry, undefined);
	assertEquals(telemetry?.status, "running");
	assertEquals(typeof telemetry?.values.loadPct, "number");
	assertEquals(typeof telemetry?.values.temperatureC, "number");
	assertEquals(typeof telemetry?.values.vibrationMmS, "number");
	assertEquals(typeof telemetry?.values.rpm, "number");
	assertEquals(typeof telemetry?.values.powerKw, "number");

	// 10. Assert inspecting device in viewer mode returns entity and telemetry
	session2.setSelection(["dev-cnc-01"]);
	const inspected = session2.getInspectedDevice("dev-cnc-01");
	assertNotEquals(inspected, null);
	assertEquals(inspected?.entity.id, "dev-cnc-01");
	assertEquals(inspected?.entity.assetKey, "cnc-01");
	assertEquals(inspected?.telemetry?.status, "running");
	assertEquals(inspected?.telemetry?.values.loadPct, telemetry?.values.loadPct);

	// 11. Assert attempting any mutation in viewer mode returns READ_ONLY and leaves doc untouched
	// Mutation A: entity.add
	const forbiddenAdd = session2.execute({
		type: "entity.add",
		entity: { ...cncEntity, id: "dev-forbidden" },
	});
	assertEquals(forbiddenAdd.success, false);
	if (!forbiddenAdd.success) {
		assertEquals(forbiddenAdd.error.code, "READ_ONLY");
	}

	// Mutation B: selection.transform
	const forbiddenMove = session2.execute({
		type: "selection.transform",
		ids: ["dev-cnc-01"],
		delta: { x: 2000, y: 2000 },
	});
	assertEquals(forbiddenMove.success, false);
	if (!forbiddenMove.success) {
		assertEquals(forbiddenMove.error.code, "READ_ONLY");
	}

	// Mutation C: history.undo
	const forbiddenUndo = session2.undo();
	assertEquals(forbiddenUndo.success, false);
	if (!forbiddenUndo.success) {
		assertEquals(forbiddenUndo.error.code, "READ_ONLY");
	}

	// Mutation D: history.redo
	const forbiddenRedo = session2.redo();
	assertEquals(forbiddenRedo.success, false);
	if (!forbiddenRedo.success) {
		assertEquals(forbiddenRedo.error.code, "READ_ONLY");
	}

	// Assert doc was completely untouched by forbidden mutations
	assertEquals(session2.doc.content.entities["dev-forbidden"], undefined);
	assertEquals(session2.doc.content.entities["dev-cnc-01"]?.transform.x, 15000);
	assertEquals(session2.doc.content.entities["dev-cnc-01"]?.transform.y, 15000);
	assertEquals(
		session2.doc.content.entities["dev-cnc-01"]?.transform.rotationDeg,
		90,
	);

	// Cleanup
	session.dispose();
	session2.dispose();
	renderer.dispose();
}

if (isVitest) {
	const { describe, it } = await import("vite-plus/test");
	describe("WP-06: First complete loop", () => {
		it("executes the complete vertical slice loop", async () => {
			await runLoopTest();
		});
	});
} else if (typeof Deno !== "undefined" && typeof Deno.test === "function") {
	Deno.test("WP-06: First complete loop", async () => {
		await runLoopTest();
	});
}
