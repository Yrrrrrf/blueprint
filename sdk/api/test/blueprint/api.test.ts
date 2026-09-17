// ============================================================================
// Blueprint API Modules Test Suite (§9.2, §10.1, §4.3, §4.4)
// Unit tests for MemoryDocumentRepository, TelemetrySimulator, and files parser.
// ============================================================================

import { assertEquals, assertNotEquals } from "@std/assert";
import { createBlankDocument } from "@sdk/core";
import {
	ChannelSequenceTracker,
	checkFreshness,
	createDocumentRepository,
	createSimulator,
	MemoryDocumentRepository,
	parseNativeDocument,
	serializeNativeDocument,
	TelemetrySimulator,
	validateTelemetrySample,
	WebSocketTelemetrySource,
} from "../../src/mod.ts";
import type { TelemetrySample } from "../../src/mod.ts";

Deno.test("MemoryDocumentRepository - save, load, list, delete", async () => {
	const repo = new MemoryDocumentRepository();
	const doc = createBlankDocument();
	doc.content.name = "Test Plant";

	await repo.save(doc);

	const loaded = await repo.load(doc.documentId);
	assertNotEquals(loaded, null);
	assertEquals(loaded?.documentId, doc.documentId);
	assertEquals(loaded?.content.name, "Test Plant");

	const list = await repo.list();
	assertEquals(list.length, 1);
	assertEquals(list[0].id, doc.documentId);
	assertEquals(list[0].name, "Test Plant");

	await repo.delete(doc.documentId);

	const afterDelete = await repo.load(doc.documentId);
	assertEquals(afterDelete, null);
});

Deno.test("MemoryDocumentRepository - saveDraft compare-and-swap", async () => {
	const repo = new MemoryDocumentRepository();
	assertEquals(repo.isDurable, false);

	const doc = createBlankDocument();
	doc.content.name = "CAS Plant";

	// Initial create
	await repo.create(doc);
	assertEquals(repo.getStorageVersion(doc.documentId), 1);

	// CAS match -> success and increment
	const res1 = await repo.saveDraft(doc, 1);
	assertEquals(res1.status, "saved");
	if (res1.status === "saved") {
		assertEquals(res1.storageVersion, 2);
	}

	// CAS mismatch -> conflict
	const res2 = await repo.saveDraft(doc, 1);
	assertEquals(res2.status, "conflict");
	if (res2.status === "conflict") {
		assertEquals(res2.currentStorageVersion, 2);
	}
});

Deno.test("MemoryDocumentRepository - snapshots, limit, approval and proposal fork", async () => {
	const repo = new MemoryDocumentRepository();
	const doc = createBlankDocument();
	await repo.create(doc);

	// Create snapshot
	const snap1 = await repo.createSnapshot(doc.documentId, "Baseline Snapshot");
	assertEquals(snap1.label, "Baseline Snapshot");
	assertEquals(snap1.documentId, doc.documentId);

	// List snapshots
	const snapshots = await repo.listSnapshots(doc.documentId);
	assertEquals(snapshots.length, 1);
	assertEquals(snapshots[0].isApproved, false);

	// Approve snapshot
	await repo.approveSnapshot(doc.documentId, snap1.id);
	const snapshotsAfterApproval = await repo.listSnapshots(doc.documentId);
	assertEquals(snapshotsAfterApproval[0].isApproved, true);

	// Fork proposal
	const proposal = await repo.forkProposal(doc.documentId, snap1.id);
	assertEquals(proposal.documentId !== doc.documentId, true);
	const provenance = proposal.content.metadata.proposalProvenance as any;
	assertEquals(provenance.baseDocumentId, doc.documentId);
	assertEquals(provenance.baseSnapshotId, snap1.id);

	// Test 20 snapshot limit
	for (let i = 2; i <= 20; i++) {
		await repo.createSnapshot(doc.documentId, `Snapshot ${i}`);
	}
	let limitExceeded = false;
	try {
		await repo.createSnapshot(doc.documentId, "Snapshot 21");
	} catch (_e) {
		limitExceeded = true;
	}
	assertEquals(limitExceeded, true);
});

Deno.test("createDocumentRepository - factory fallback", () => {
	const repo = createDocumentRepository();
	assertEquals(repo.isDurable, false);
});

Deno.test("TelemetrySimulator - deterministic generation and subscriber", () => {
	const sim1 = createSimulator({ seed: "test-seed-1" });
	const sim2 = createSimulator({ seed: "test-seed-1" });

	const readings1 = sim1.computeReadings("cnc-01", 10);
	const readings2 = sim2.computeReadings("cnc-01", 10);

	assertEquals(readings1.status, readings2.status);
	assertEquals(readings1.samples.length, readings2.samples.length);
	assertEquals(readings1.samples[0].value, readings2.samples[0].value);

	// Test subscriber notification
	const received: TelemetrySample[] = [];
	const unsubscribe = sim1.subscribe(["cnc-01"], (sample) => {
		received.push(sample);
	});

	sim1.tick();
	assertEquals(received.length > 0, true);
	unsubscribe();

	const countBefore = received.length;
	sim1.tick();
	assertEquals(received.length, countBefore);
});

Deno.test("TelemetrySimulator - offline state omits numeric parameters", () => {
	const sim = new TelemetrySimulator();
	// Tick 51 is within 50..54 (offline phase)
	const { status, samples } = sim.computeReadings("robot-01", 51);
	assertEquals(status, "offline");
	assertEquals(samples.length, 1);
	assertEquals(samples[0].field, "status");
	assertEquals(samples[0].value, "offline");
});

Deno.test("files - serialize and parse native document round-trip", () => {
	const doc = createBlankDocument();
	const serialized = serializeNativeDocument(doc);
	assertEquals(typeof serialized, "string");
	assertEquals(serialized.endsWith("\n"), true);

	const parsed = parseNativeDocument(serialized);
	assertEquals(parsed.valid, true);
	assertEquals(parsed.document?.documentId, doc.documentId);
	assertEquals(parsed.document?.schemaVersion, 1);
});

Deno.test("files - parse rejects corrupted / invalid json", () => {
	const result = parseNativeDocument("invalid json content");
	assertEquals(result.valid, false);
	assertEquals(result.issues[0].code, "JSON_SYNTAX_ERROR");
});

Deno.test("telemetry - validateTelemetrySample strict rules", () => {
	const now = 1700000000000;
	const valid = validateTelemetrySample(
		{
			sourceId: "sim-1",
			channel: "CNC-04:power",
			value: 12.5,
			observedAt: new Date(now).toISOString(),
			sequence: 1,
			quality: "good",
		},
		{ nowMs: now },
	);
	assertEquals(valid.valid, true);
	assertEquals(valid.sample?.value, 12.5);
	assertEquals(valid.sample?.quality, "good");

	// Nonfinite rejected
	const nonfinite = validateTelemetrySample({
		sourceId: "sim-1",
		channel: "CNC-04:power",
		value: Number.NaN,
		observedAt: new Date(now).toISOString(),
		sequence: 2,
	});
	assertEquals(nonfinite.valid, false);

	// Negative sequence rejected
	const negSeq = validateTelemetrySample({
		sourceId: "sim-1",
		channel: "CNC-04:power",
		value: 5,
		observedAt: new Date(now).toISOString(),
		sequence: -1,
	});
	assertEquals(negSeq.valid, false);

	// Negative power rejected
	const negPower = validateTelemetrySample({
		sourceId: "sim-1",
		channel: "CNC-04:power",
		value: -5,
		observedAt: new Date(now).toISOString(),
		sequence: 3,
	});
	assertEquals(negPower.valid, false);

	// Load outside [0, 100] rejected
	const loadHigh = validateTelemetrySample({
		sourceId: "sim-1",
		channel: "CNC-04:load",
		value: 105,
		observedAt: new Date(now).toISOString(),
		sequence: 4,
	});
	assertEquals(loadHigh.valid, false);

	// Clock skew > 60s marked uncertain
	const skewed = validateTelemetrySample(
		{
			sourceId: "sim-1",
			channel: "CNC-04:power",
			value: 10,
			observedAt: new Date(now + 65000).toISOString(),
			sequence: 5,
		},
		{ nowMs: now },
	);
	assertEquals(skewed.valid, true);
	assertEquals(skewed.sample?.quality, "uncertain");
});

Deno.test("telemetry - ChannelSequenceTracker per-channel and generation reset", () => {
	const tracker = new ChannelSequenceTracker();
	assertEquals(tracker.accept("ch1", 1), true);
	assertEquals(tracker.accept("ch1", 2), true);
	// Duplicate or older sequence rejected
	assertEquals(tracker.accept("ch1", 2), false);
	assertEquals(tracker.accept("ch1", 1), false);

	// Independent channels
	assertEquals(tracker.accept("ch2", 1), true);

	// Generation reset allows sequence restart
	tracker.resetGeneration();
	assertEquals(tracker.generation, 1);
	assertEquals(tracker.accept("ch1", 1), true);
});

Deno.test("telemetry - checkFreshness 5000ms window", () => {
	const t0 = 10000;
	assertEquals(checkFreshness(t0, t0 + 2000).status, "fresh");
	assertEquals(checkFreshness(t0, t0 + 5000).status, "fresh");
	assertEquals(checkFreshness(t0, t0 + 5001).status, "stale");
	assertEquals(checkFreshness(t0, t0 + 10000).isFresh, false);
});

Deno.test("websocket - WebSocketTelemetrySource subscription, batching, and cleanup", async () => {
	let sentMessages: string[] = [];
	let socketClosed = false;

	class MockWebSocket {
		public readyState = 1; // OPEN
		public onopen: (() => void) | null = null;
		public onclose: (() => void) | null = null;
		public onerror: ((err: any) => void) | null = null;
		public onmessage: ((event: { data: string }) => void) | null = null;

		constructor() {
			setTimeout(() => this.onopen?.(), 1);
		}

		send(data: string) {
			sentMessages.push(data);
		}

		close() {
			socketClosed = true;
			this.readyState = 3;
			this.onclose?.();
		}
	}

	let activeMockSocket: MockWebSocket | null = null;
	const source = new WebSocketTelemetrySource({
		url: "ws://localhost:9999/telemetry",
		batchIntervalMs: 20,
		webSocketFactory: () => {
			activeMockSocket = new MockWebSocket();
			return activeMockSocket as any;
		},
	});

	const batches: TelemetrySample[][] = [];
	let connectionState = "";

	const unsubscribe = source.subscribe(["CNC-04:power"], {
		next: (b) => batches.push([...b]),
		error: () => {},
		connection: (st) => {
			connectionState = st;
		},
	});

	await new Promise((r) => setTimeout(r, 10));
	assertEquals(connectionState, "connected");
	assertEquals(sentMessages.length > 0, true);

	// Simulate incoming server message
	const now = new Date().toISOString();
	(activeMockSocket as any)?.onmessage?.({
		data: JSON.stringify([
			{
				sourceId: "ws",
				channel: "CNC-04:power",
				value: 42,
				observedAt: now,
				sequence: 1,
				quality: "good",
			},
			{
				sourceId: "ws",
				channel: "UNSUBSCRIBED:channel",
				value: 100,
				observedAt: now,
				sequence: 1,
				quality: "good",
			},
		]),
	});

	// Wait for batch interval flush
	await new Promise((r) => setTimeout(r, 40));
	assertEquals(batches.length, 1);
	assertEquals(batches[0].length, 1);
	assertEquals(batches[0][0].channel, "CNC-04:power");
	assertEquals(batches[0][0].value, 42);

	// Unsubscribe triggers cleanup
	unsubscribe();
	assertEquals(socketClosed, true);
	assertEquals(source.connectionState, "disconnected");
});
