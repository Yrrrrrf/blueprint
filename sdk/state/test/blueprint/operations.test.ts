// ============================================================================
// WP-09: Operations, Telemetry, and Spatial Checks Acceptance Tests
// Covers Acceptance Criteria AC-047 through AC-053 per §16.3 of Specification.
// ============================================================================

import { assertEquals, assertNotEquals } from "@std/assert";
import {
	buildPowerReport,
	buildZoneReport,
	computeContentHash,
	createBlankDocument,
	createNaveConflictsFixture,
	createNaveIndustrialFixture,
	DeviceEntity,
	runSpatialChecks,
} from "../../../core/src/mod.ts";
import {
	createSimulator,
	TelemetrySample,
	TelemetrySource,
} from "../../../api/src/mod.ts";
import { BlueprintSession } from "../../src/blueprint/session.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function addEntity(doc: any, entity: any): void {
	doc.content = {
		...doc.content,
		entities: {
			...doc.content.entities,
			[entity.id]: entity,
		},
	};
}

/**
 * AC-047: Same simulator seed/time in two runs yields byte-equivalent sample batches.
 * No Math.random or date dependency outside injected environment (§9.2, AC-047).
 */
export async function testAC047(): Promise<void> {
	const fixedClock = () => "2026-09-15T12:00:00.000Z";
	const seed = "blueprint-nave-v1";

	const sim1 = createSimulator({ seed, clock: fixedClock });
	const sim2 = createSimulator({ seed, clock: fixedClock });

	const batches1: TelemetrySample[][] = [];
	const batches2: TelemetrySample[][] = [];

	sim1.subscribe(["ROBOT-01", "CONVEYOR-01", "CNC-04"], {
		next: (batch) => batches1.push([...batch]),
		error: () => {},
		connection: () => {},
	});

	sim2.subscribe(["ROBOT-01", "CONVEYOR-01", "CNC-04"], {
		next: (batch) => batches2.push([...batch]),
		error: () => {},
		connection: () => {},
	});

	// Run 10 ticks on both simulators
	for (let i = 0; i < 10; i++) {
		sim1.tick();
		sim2.tick();
	}

	assertEquals(batches1.length, 10);
	assertEquals(batches2.length, 10);

	// Two runs with identical seed and clock produce byte-equivalent sample batches
	const json1 = JSON.stringify(batches1);
	const json2 = JSON.stringify(batches2);
	assertEquals(json1, json2, "Batches must be byte-equivalent across runs");

	// Confirm that differing seeds produce divergent batches
	const simDifferent = createSimulator({
		seed: "alternate-seed-42",
		clock: fixedClock,
	});
	const batchesDiff: TelemetrySample[][] = [];
	simDifferent.subscribe(["ROBOT-01", "CONVEYOR-01", "CNC-04"], {
		next: (batch) => batchesDiff.push([...batch]),
		error: () => {},
		connection: () => {},
	});
	for (let i = 0; i < 10; i++) {
		simDifferent.tick();
	}
	assertNotEquals(
		JSON.stringify(batchesDiff),
		json1,
		"Differing seeds must produce distinct readings",
	);
}

/**
 * AC-048: Duplicate/out-of-order sequence numbers ignored; malformed numeric values rejected;
 * bad quality visibly marked (§9.1, AC-048).
 */
export async function testAC048(): Promise<void> {
	const doc = createBlankDocument();
	const testDev: DeviceEntity = {
		id: "device-test",
		name: "Test CNC Machine",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["equipment"],
		metadata: {},
		transform: { x: 10000, y: 10000, rotationDeg: 0 },
		style: {
			fill: "#CBD5E1",
			stroke: "#334155",
			strokeWidthMm: 20,
			opacity: 1,
			dashMm: [],
		},
		definitionId: "def-cnc-v1",
		assetKey: "CNC-TEST",
		parameters: {},
		ratedPowerKw: 15,
		maintenanceDue: null,
		bindings: [
			{ field: "powerKw", sourceId: "test-src", channel: "CNC-TEST:power" },
			{ field: "loadPct", sourceId: "test-src", channel: "CNC-TEST:load" },
			{ field: "rpm", sourceId: "test-src", channel: "CNC-TEST:rpm" },
			{ field: "status", sourceId: "test-src", channel: "CNC-TEST:status" },
		],
	};
	addEntity(doc, testDev);

	let emitCallback: ((batch: readonly TelemetrySample[]) => void) | null = null;
	const mockSource: TelemetrySource = {
		id: "test-src",
		subscribe: (_channels, observer) => {
			emitCallback = observer.next;
			observer.connection("connected");
			return () => {
				emitCallback = null;
			};
		},
	};

	let currentTime = 100000;
	const session = new BlueprintSession({
		document: doc,
		telemetrySource: mockSource,
		clockMs: () => currentTime,
	});

	await sleep(10);
	assertEquals(session.telemetryState, "connected");

	// 1. Send valid sequence 1
	emitCallback!([
		{
			sourceId: "test-src",
			channel: "CNC-TEST:power",
			value: 12.5,
			observedAt: new Date(currentTime).toISOString(),
			sequence: 1,
			quality: "good",
		},
	]);

	let tel = session.getTelemetry("device-test");
	assertEquals(tel?.values.powerKw, 12.5);

	// 2. Duplicate sequence 1 is ignored (AC-048)
	emitCallback!([
		{
			sourceId: "test-src",
			channel: "CNC-TEST:power",
			value: 99.9,
			observedAt: new Date(currentTime).toISOString(),
			sequence: 1,
			quality: "good",
		},
	]);

	tel = session.getTelemetry("device-test");
	assertEquals(
		tel?.values.powerKw,
		12.5,
		"Duplicate sequence must be discarded",
	);

	// 3. Out-of-order older sequence 0 is ignored (AC-048)
	emitCallback!([
		{
			sourceId: "test-src",
			channel: "CNC-TEST:power",
			value: 0.1,
			observedAt: new Date(currentTime).toISOString(),
			sequence: 0,
			quality: "good",
		},
	]);

	tel = session.getTelemetry("device-test");
	assertEquals(tel?.values.powerKw, 12.5, "Older sequence must be discarded");

	// 4. Malformed numeric values rejected: NaN, negative sequence, negative power, load > 100
	emitCallback!([
		{
			sourceId: "test-src",
			channel: "CNC-TEST:power",
			value: Number.NaN,
			observedAt: new Date(currentTime).toISOString(),
			sequence: 2,
			quality: "good",
		},
		{
			sourceId: "test-src",
			channel: "CNC-TEST:power",
			value: -50, // negative power rejected
			observedAt: new Date(currentTime).toISOString(),
			sequence: 3,
			quality: "good",
		},
		{
			sourceId: "test-src",
			channel: "CNC-TEST:load",
			value: 150, // load > 100 rejected
			observedAt: new Date(currentTime).toISOString(),
			sequence: 4,
			quality: "good",
		},
	]);

	tel = session.getTelemetry("device-test");
	assertEquals(tel?.values.powerKw, 12.5, "NaN and negative power rejected");
	assertEquals(tel?.values.loadPct, undefined, "Load > 100 rejected");

	// 5. Bad quality is visibly marked (AC-048)
	emitCallback!([
		{
			sourceId: "test-src",
			channel: "CNC-TEST:power",
			value: 14.0,
			observedAt: new Date(currentTime).toISOString(),
			sequence: 5,
			quality: "bad",
		},
	]);

	tel = session.getTelemetry("device-test");
	assertEquals((tel as any)?.quality, "bad", "Bad quality visibly marked");
	const powerReport = session.getPowerReport();
	assertEquals(powerReport.badCount, 1, "Bad quality counted in power report");
	assertEquals(
		powerReport.totalLivePowerKw,
		0,
		"Bad quality not counted in live power sum",
	);

	session.dispose();
}

/**
 * AC-049: Last good sample then advance clock > 5000 ms -> last value retained as Stale;
 * no zero substitution; document hash unchanged (§9.1, AC-049).
 */
export async function testAC049(): Promise<void> {
	const doc = createBlankDocument();
	const testDev: DeviceEntity = {
		id: "device-stale-test",
		name: "Stale CNC Device",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["equipment"],
		metadata: {},
		transform: { x: 20000, y: 15000, rotationDeg: 0 },
		style: {
			fill: "#CBD5E1",
			stroke: "#334155",
			strokeWidthMm: 20,
			opacity: 1,
			dashMm: [],
		},
		definitionId: "def-cnc-v1",
		assetKey: "CNC-STALE",
		parameters: {},
		ratedPowerKw: 25,
		maintenanceDue: null,
		bindings: [
			{ field: "powerKw", sourceId: "src-stale", channel: "CNC-STALE:power" },
			{ field: "status", sourceId: "src-stale", channel: "CNC-STALE:status" },
		],
	};
	addEntity(doc, testDev);

	let emitCallback: ((batch: readonly TelemetrySample[]) => void) | null = null;
	const mockSource: TelemetrySource = {
		id: "src-stale",
		subscribe: (_channels, observer) => {
			emitCallback = observer.next;
			observer.connection("connected");
			return () => {
				emitCallback = null;
			};
		},
	};

	let simulatedClockMs = 500000;
	const session = new BlueprintSession({
		document: doc,
		telemetrySource: mockSource,
		clockMs: () => simulatedClockMs,
	});

	const initialContentHash = computeContentHash(session.doc.content);

	// 1. Emit last good sample at simulatedClockMs
	emitCallback!([
		{
			sourceId: "src-stale",
			channel: "CNC-STALE:power",
			value: 18.75,
			observedAt: new Date(simulatedClockMs).toISOString(),
			sequence: 1,
			quality: "good",
		},
		{
			sourceId: "src-stale",
			channel: "CNC-STALE:status",
			value: "running",
			observedAt: new Date(simulatedClockMs).toISOString(),
			sequence: 1,
			quality: "good",
		},
	]);

	let tel = session.getTelemetry("device-stale-test");
	assertEquals(tel?.stale, false);
	assertEquals(tel?.values.powerKw, 18.75);
	assertEquals(tel?.status, "running");

	// 2. Advance clock by > 5000 ms (e.g. 5001 ms)
	simulatedClockMs += 5001;
	session.checkFreshness(simulatedClockMs);

	tel = session.getTelemetry("device-stale-test");
	// Freshness expired to stale (§9.1, AC-049)
	assertEquals(tel?.stale, true, "Telemetry must be marked stale");

	// Last value is retained with Stale, NO zero substitution (§9.1, AC-049)
	assertEquals(
		tel?.values.powerKw,
		18.75,
		"Last known value must be retained, not substituted with zero",
	);

	// Document content hash remains completely unchanged (§9.1, AC-049)
	const afterStaleContentHash = computeContentHash(session.doc.content);
	assertEquals(
		afterStaleContentHash,
		initialContentHash,
		"Document content hash must remain identical",
	);

	session.dispose();
}

/**
 * AC-050: Rebind/unmount with queued old-source callback -> old values/callbacks ignored;
 * exactly one cleanup per subscription (§9.1, AC-050).
 */
export async function testAC050(): Promise<void> {
	const doc = createBlankDocument();
	const testDev: DeviceEntity = {
		id: "device-rebind-test",
		name: "Rebind Test Device",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["equipment"],
		metadata: {},
		transform: { x: 5000, y: 5000, rotationDeg: 0 },
		style: {
			fill: "#CBD5E1",
			stroke: "#334155",
			strokeWidthMm: 20,
			opacity: 1,
			dashMm: [],
		},
		definitionId: "def-cnc-v1",
		assetKey: "CNC-REBIND",
		parameters: {},
		ratedPowerKw: 10,
		maintenanceDue: null,
		bindings: [
			{ field: "powerKw", sourceId: "src-a", channel: "CNC-REBIND:power" },
		],
	};
	addEntity(doc, testDev);

	let sourceACleanupCount = 0;
	let sourceACallback: any = null;
	const sourceA: TelemetrySource = {
		id: "src-a",
		subscribe: (_channels, observer) => {
			sourceACallback = observer.next;
			observer.connection("connected");
			return () => {
				sourceACleanupCount++;
				sourceACallback = null;
			};
		},
	};

	let sourceBCleanupCount = 0;
	let sourceBCallback: any = null;
	const sourceB: TelemetrySource = {
		id: "src-b",
		subscribe: (_channels, observer) => {
			sourceBCallback = observer.next;
			observer.connection("connected");
			return () => {
				sourceBCleanupCount++;
				sourceBCallback = null;
			};
		},
	};

	const session = new BlueprintSession({
		document: doc,
		telemetrySource: sourceA,
	});

	// Capture the callback handle from Source A before rebind
	const queuedOldCallback: any = sourceACallback;
	assertNotEquals(queuedOldCallback, null);

	// Rebind to source B
	session.setTelemetrySource(sourceB);

	// Exactly one cleanup called for Source A (§9.1, AC-050)
	assertEquals(
		sourceACleanupCount,
		1,
		"Source A must receive exactly one cleanup call",
	);

	// Attempt late callback from Source A with value 999
	queuedOldCallback([
		{
			sourceId: "src-a",
			channel: "CNC-REBIND:power",
			value: 999,
			observedAt: new Date().toISOString(),
			sequence: 10,
			quality: "good",
		},
	]);

	let tel = session.getTelemetry("device-rebind-test");
	assertNotEquals(
		tel?.values.powerKw,
		999,
		"Late sample from disposed generation must be ignored (AC-050)",
	);

	// New source B emits valid sample 42
	sourceBCallback!([
		{
			sourceId: "src-b",
			channel: "CNC-REBIND:power",
			value: 42,
			observedAt: new Date().toISOString(),
			sequence: 1,
			quality: "good",
		},
	]);

	tel = session.getTelemetry("device-rebind-test");
	assertEquals(tel?.values.powerKw, 42, "New source sample must be accepted");

	// Dispose session (unmount)
	session.dispose();
	assertEquals(
		sourceBCleanupCount,
		1,
		"Source B must receive exactly one cleanup call upon session disposal",
	);
	assertEquals(sourceACleanupCount, 1, "Source A cleanup count must remain 1");
}

/**
 * AC-051: Device rect (0,0,4000,3000) and another at (4000,0) yields no FOOTPRINT_OVERLAP;
 * moving second to x=3999 yields overlap (§8.3, AC-051).
 */
export async function testAC051(): Promise<void> {
	const doc = createBlankDocument();

	// Device 1 at (0, 0)
	const dev1: DeviceEntity = {
		id: "device-1",
		name: "CNC 1",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["equipment"],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: "#CBD5E1",
			stroke: "#334155",
			strokeWidthMm: 20,
			opacity: 1,
			dashMm: [],
		},
		definitionId: "def-cnc-v1", // 4000x3000 mm
		assetKey: "CNC-01",
		parameters: {},
		ratedPowerKw: 10,
		maintenanceDue: null,
		bindings: [],
	};

	// Device 2 at (4000, 0) - touching edges with 0 intersection area
	const dev2: DeviceEntity = {
		id: "device-2",
		name: "CNC 2",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["equipment"],
		metadata: {},
		transform: { x: 4000, y: 0, rotationDeg: 0 },
		style: dev1.style,
		definitionId: "def-cnc-v1",
		assetKey: "CNC-02",
		parameters: {},
		ratedPowerKw: 10,
		maintenanceDue: null,
		bindings: [],
	};

	addEntity(doc, dev1);
	addEntity(doc, dev2);

	// Edge contact yields no FOOTPRINT_OVERLAP (AC-051)
	let issues = runSpatialChecks(doc);
	const overlaps1 = issues.filter((i) => i.code === "FOOTPRINT_OVERLAP");
	assertEquals(
		overlaps1.length,
		0,
		"Touching edges with area 0 must yield no FOOTPRINT_OVERLAP",
	);

	// Move second device to x=3999 (1 mm penetration over 3000 mm height = 3000 mm² > 1 mm²)
	addEntity(doc, {
		...dev2,
		transform: { x: 3999, y: 0, rotationDeg: 0 },
	});

	issues = runSpatialChecks(doc);
	const overlaps2 = issues.filter((i) => i.code === "FOOTPRINT_OVERLAP");
	assertEquals(
		overlaps2.length,
		1,
		"Overlap area > 1 mm² must produce FOOTPRINT_OVERLAP",
	);
	assertEquals(overlaps2[0].measured, 3000);
	assertEquals(overlaps2[0].entityIds, ["device-1", "device-2"]);
}

/**
 * AC-052: Clean fixture has no physical/restricted issues; conflict fixture yields expected
 * overlap/hazard/outside codes (§8.3, AC-052).
 */
export async function testAC052(): Promise<void> {
	// 1. Clean nave industrial fixture
	const clean = createNaveIndustrialFixture();
	const cleanIssues = runSpatialChecks(clean);

	const physicalCodes = new Set([
		"FOOTPRINT_OVERLAP",
		"CLEARANCE_INTRUSION",
		"RESTRICTED_ZONE",
		"OUTSIDE_FACILITY",
	]);

	const cleanPhysicalIssues = cleanIssues.filter((i) =>
		physicalCodes.has(i.code),
	);
	assertEquals(
		cleanPhysicalIssues.length,
		0,
		"Clean fixture must produce 0 physical/restricted issues",
	);

	// 2. Deterministic conflict fixture nave-conflicts-v1
	const conflicts = createNaveConflictsFixture();
	const confIssues = runSpatialChecks(conflicts);

	const confCodes = confIssues.map((i) => i.code);
	assertEquals(
		confCodes.includes("FOOTPRINT_OVERLAP"),
		true,
		"Must yield FOOTPRINT_OVERLAP",
	);
	assertEquals(
		confCodes.includes("RESTRICTED_ZONE"),
		true,
		"Must yield RESTRICTED_ZONE",
	);
	assertEquals(
		confCodes.includes("OUTSIDE_FACILITY"),
		true,
		"Must yield OUTSIDE_FACILITY",
	);

	// Check deterministic issue IDs per §8.3
	const overlapIssue = confIssues.find(
		(i) => i.id === "FOOTPRINT_OVERLAP:device-rack-a:device-rack-b",
	);
	assertNotEquals(
		overlapIssue,
		undefined,
		"Expected FOOTPRINT_OVERLAP between rack A and rack B",
	);

	const restrictedIssue = confIssues.find(
		(i) => i.id === "RESTRICTED_ZONE:device-rack-hazard:zone-hazard",
	);
	assertNotEquals(
		restrictedIssue,
		undefined,
		"Expected RESTRICTED_ZONE for rack in hazard zone",
	);

	const outsideIssue = confIssues.find(
		(i) => i.id === "OUTSIDE_FACILITY:device-cnc",
	);
	assertNotEquals(
		outsideIssue,
		undefined,
		"Expected OUTSIDE_FACILITY for CNC extending beyond facility boundary",
	);
}

/**
 * AC-053: Sum live/rated power with missing/stale sample -> separate totals and missing/stale counts;
 * stale not counted in live power (§12.6, AC-053).
 */
export async function testAC053(): Promise<void> {
	const doc = createBlankDocument();

	const dev1: DeviceEntity = {
		id: "dev-1",
		name: "Active CNC",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["equipment"],
		metadata: {},
		transform: { x: 5000, y: 5000, rotationDeg: 0 },
		style: {
			fill: "#CBD5E1",
			stroke: "#334155",
			strokeWidthMm: 20,
			opacity: 1,
			dashMm: [],
		},
		definitionId: "def-cnc-v1",
		assetKey: "CNC-ACTIVE",
		parameters: {},
		ratedPowerKw: 15.0,
		maintenanceDue: null,
		bindings: [
			{ field: "powerKw", sourceId: "sim", channel: "CNC-ACTIVE:power" },
		],
	};

	const dev2: DeviceEntity = {
		id: "dev-2",
		name: "Stale Robot",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["equipment"],
		metadata: {},
		transform: { x: 15000, y: 5000, rotationDeg: 0 },
		style: dev1.style,
		definitionId: "def-robot-v1",
		assetKey: "ROBOT-STALE",
		parameters: {},
		ratedPowerKw: 8.0,
		maintenanceDue: null,
		bindings: [
			{ field: "powerKw", sourceId: "sim", channel: "ROBOT-STALE:power" },
		],
	};

	const dev3: DeviceEntity = {
		id: "dev-3",
		name: "Missing Conveyor",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["equipment"],
		metadata: {},
		transform: { x: 25000, y: 5000, rotationDeg: 0 },
		style: dev1.style,
		definitionId: "def-conveyor-v1",
		assetKey: "CONVEYOR-MISSING",
		parameters: {},
		ratedPowerKw: 5.0,
		maintenanceDue: null,
		bindings: [], // No telemetry bindings
	};

	addEntity(doc, dev1);
	addEntity(doc, dev2);
	addEntity(doc, dev3);

	const telemetryLookup = new Map([
		// Dev 1 has fresh good reading (12.0 kW)
		[
			"dev-1",
			{
				values: { powerKw: 12.0 },
				status: "running" as const,
				stale: false,
				quality: "good" as const,
			},
		],
		// Dev 2 has stale reading (7.5 kW)
		[
			"dev-2",
			{
				values: { powerKw: 7.5 },
				status: "running" as const,
				stale: true, // marked stale
				quality: "good" as const,
			},
		],
		// Dev 3 has no telemetry (missing)
	]);

	const report = buildPowerReport(doc, telemetryLookup);

	// Total rated power = 15.0 + 8.0 + 5.0 = 28.0 kW
	assertEquals(report.totalRatedPowerKw, 28.0);

	// Total live power includes ONLY the fresh good reading = 12.0 kW (AC-053)
	assertEquals(
		report.totalLivePowerKw,
		12.0,
		"Stale samples must not be counted in totalLivePowerKw",
	);

	// Separate counts (§12.6, AC-053)
	assertEquals(report.measuredCount, 1, "Exactly 1 measured device");
	assertEquals(report.staleCount, 1, "Exactly 1 stale device");
	assertEquals(report.missingCount, 1, "Exactly 1 missing device");
	assertEquals(report.deviceCount, 3, "Total 3 devices");

	// Dev 2 row preserves last known value with stale status
	const dev2Row = report.devices.find((d) => d.deviceId === "dev-2");
	assertEquals(dev2Row?.status, "stale");
	assertEquals(dev2Row?.livePowerKw, 7.5);

	// Zone report also aggregates correctly
	const zoneReport = buildZoneReport(doc, telemetryLookup);
	assertEquals(zoneReport.globalTotals.globalRatedPowerKw, 28.0);
	assertEquals(zoneReport.globalTotals.globalLivePowerKw, 12.0);
	assertEquals(zoneReport.globalTotals.globalDeviceCount, 3);
}

// ============================================================================
// Dual Vitest / Deno Test Harness Registration
// ============================================================================

const isVitest = typeof (globalThis as any).__vitest_worker__ !== "undefined";

if (isVitest) {
	const { describe, it } = await import("vite-plus/test");
	describe("WP-09: Operations and checks acceptance tests (AC-047..AC-053)", () => {
		it("AC-047: Deterministic simulator batch equivalence across runs", async () => {
			await testAC047();
		});
		it("AC-048: Telemetry validation, sequence tracking and bad quality marking", async () => {
			await testAC048();
		});
		it("AC-049: Freshness expiration to stale, retention of last value, hash unchanged", async () => {
			await testAC049();
		});
		it("AC-050: Rebind and unmount generation token handling and cleanup", async () => {
			await testAC050();
		});
		it("AC-051: Touching edges zero area vs 1 mm penetration footprint overlap", async () => {
			await testAC051();
		});
		it("AC-052: Clean fixture 0 physical issues vs conflict fixture deterministic issues", async () => {
			await testAC052();
		});
		it("AC-053: Power report sum live/rated power with missing and stale samples", async () => {
			await testAC053();
		});
	});
} else if (typeof Deno !== "undefined" && typeof Deno.test === "function") {
	Deno.test("AC-047: Deterministic simulator batch equivalence across runs", async () => {
		await testAC047();
	});
	Deno.test("AC-048: Telemetry validation, sequence tracking and bad quality marking", async () => {
		await testAC048();
	});
	Deno.test("AC-049: Freshness expiration to stale, retention of last value, hash unchanged", async () => {
		await testAC049();
	});
	Deno.test("AC-050: Rebind and unmount generation token handling and cleanup", async () => {
		await testAC050();
	});
	Deno.test("AC-051: Touching edges zero area vs 1 mm penetration footprint overlap", async () => {
		await testAC051();
	});
	Deno.test("AC-052: Clean fixture 0 physical issues vs conflict fixture deterministic issues", async () => {
		await testAC052();
	});
	Deno.test("AC-053: Power report sum live/rated power with missing and stale samples", async () => {
		await testAC053();
	});
}
