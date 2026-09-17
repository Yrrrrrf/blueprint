// ============================================================================
// Blueprint Constraints Worker & Scheduler Test Suite (§8.3, C-04)
// Comprehensive testing of off-thread constraints scheduling, queue-cap=1,
// generation invalidation, and cooperative chunked fallback.
// ============================================================================

import { assertEquals, assertNotEquals } from "@std/assert";
import {
	createBlankDocument,
	createNaveConflictsFixture,
	createNaveIndustrialFixture,
	runSpatialChecks,
} from "@sdk/core";
import {
	ConstraintsScheduler,
	type WorkerLike,
} from "../../src/blueprint/constraints-scheduler.ts";
import type {
	ConstraintsWorkerRequest,
	ConstraintsWorkerResponse,
} from "../../src/blueprint/constraints.worker.ts";
import { BlueprintSession } from "../../src/blueprint/session.ts";

const isVitest = typeof (globalThis as any).__vitest_worker__ !== "undefined";

class ControllableMockWorker implements WorkerLike {
	public postedMessages: ConstraintsWorkerRequest[] = [];
	public terminated = false;
	public onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
	public onerror: ((event: unknown) => void) | null = null;

	postMessage(message: unknown): void {
		this.postedMessages.push(message as ConstraintsWorkerRequest);
	}

	terminate(): void {
		this.terminated = true;
	}

	respondSuccess(
		jobId: string,
		doc: any,
		generation: number,
		revision: number,
	): void {
		const issues = runSpatialChecks(doc, { revision });
		this.onmessage?.({
			data: {
				documentId: doc.documentId,
				revision,
				generation,
				jobId,
				issues,
			} as ConstraintsWorkerResponse,
		} as MessageEvent);
	}

	respondError(
		jobId: string,
		doc: any,
		generation: number,
		revision: number,
		errorMessage: string,
	): void {
		this.onmessage?.({
			data: {
				documentId: doc.documentId,
				revision,
				generation,
				jobId,
				issues: [],
				error: errorMessage,
			} as ConstraintsWorkerResponse,
		} as MessageEvent);
	}
}

async function testWorkerFallbackEquivalent() {
	const cleanDoc = createNaveIndustrialFixture();
	const conflictDoc = createNaveConflictsFixture();

	const cleanExpected = runSpatialChecks(cleanDoc);
	const conflictExpected = runSpatialChecks(conflictDoc);

	let mockWorker: ControllableMockWorker | null = null;
	const scheduler = new ConstraintsScheduler({
		workerFactory: () => {
			mockWorker = new ControllableMockWorker();
			return mockWorker;
		},
	});

	scheduler.schedule(cleanDoc);
	assertEquals(mockWorker!.postedMessages.length, 1);
	const job1 = mockWorker!.postedMessages[0];
	mockWorker!.respondSuccess(
		job1.jobId,
		cleanDoc,
		job1.generation,
		job1.revision,
	);

	assertEquals(scheduler.getIssues(), cleanExpected);
	assertEquals(scheduler.isPending, false);
	assertEquals(
		scheduler.isOutdated(cleanDoc.revision, cleanDoc.documentId),
		false,
	);

	scheduler.schedule(conflictDoc);
	assertEquals(mockWorker!.postedMessages.length, 2);
	const job2 = mockWorker!.postedMessages[1];
	mockWorker!.respondSuccess(
		job2.jobId,
		conflictDoc,
		job2.generation,
		job2.revision,
	);

	assertEquals(scheduler.getIssues(), conflictExpected);
	scheduler.dispose();
}

async function testQueueCapOne() {
	let mockWorker: ControllableMockWorker | null = null;
	const scheduler = new ConstraintsScheduler({
		workerFactory: () => {
			mockWorker = new ControllableMockWorker();
			return mockWorker;
		},
	});

	const doc1 = createBlankDocument("Doc 1");
	doc1.revision = 1;
	const doc2 = createBlankDocument("Doc 2");
	doc2.revision = 2;
	const doc3 = createBlankDocument("Doc 3");
	doc3.revision = 3;
	const doc4 = createBlankDocument("Doc 4");
	doc4.revision = 4;

	scheduler.schedule(doc1);
	assertEquals(mockWorker!.postedMessages.length, 1);
	assertEquals(mockWorker!.postedMessages[0].revision, 1);

	scheduler.schedule(doc2);
	scheduler.schedule(doc3);
	scheduler.schedule(doc4);

	assertEquals(mockWorker!.postedMessages.length, 1);
	assertEquals(scheduler.isPending, true);

	const job1 = mockWorker!.postedMessages[0];
	mockWorker!.respondSuccess(job1.jobId, doc1, job1.generation, job1.revision);

	assertEquals(mockWorker!.postedMessages.length, 2);
	assertEquals(mockWorker!.postedMessages[1].revision, 4);

	scheduler.dispose();
}

async function testOutOfOrderIgnored() {
	let mockWorker: ControllableMockWorker | null = null;
	const scheduler = new ConstraintsScheduler({
		workerFactory: () => {
			mockWorker = new ControllableMockWorker();
			return mockWorker;
		},
	});

	const doc = createBlankDocument();
	doc.revision = 1;
	scheduler.schedule(doc);
	const job1 = mockWorker!.postedMessages[0];

	const doc2 = { ...doc, revision: 2 };
	mockWorker!.respondSuccess(job1.jobId, doc, job1.generation, job1.revision);

	scheduler.schedule(doc2);
	const job2 = mockWorker!.postedMessages[1];

	mockWorker!.onmessage?.({
		data: {
			documentId: doc.documentId,
			revision: 1,
			generation: job1.generation,
			jobId: "stale_old_job_id",
			issues: [
				{
					id: "FAKE",
					code: "FAKE",
					severity: "error",
					message: "Stale",
				} as any,
			],
		},
	} as MessageEvent);

	assertEquals(
		scheduler.getIssues().some((i) => i.id === "FAKE"),
		false,
	);

	mockWorker!.respondSuccess(job2.jobId, doc2, job2.generation, job2.revision);
	assertEquals(scheduler.latestResult?.revision, 2);

	scheduler.dispose();
}

async function testDocSwitchInvalidation() {
	let mockWorker: ControllableMockWorker | null = null;
	const scheduler = new ConstraintsScheduler({
		workerFactory: () => {
			mockWorker = new ControllableMockWorker();
			return mockWorker;
		},
	});

	const docA = createBlankDocument("Doc A");
	scheduler.schedule(docA);
	const jobA = mockWorker!.postedMessages[0];
	assertEquals(jobA.generation, 1);

	scheduler.invalidateGeneration();
	assertEquals(scheduler.generation, 2);

	mockWorker!.respondSuccess(jobA.jobId, docA, jobA.generation, jobA.revision);

	assertEquals(scheduler.latestResult, null);
	assertEquals(scheduler.getIssues().length, 0);

	scheduler.dispose();
}

async function testDisposalBeforeResult() {
	let mockWorker: ControllableMockWorker | null = null;
	const scheduler = new ConstraintsScheduler({
		workerFactory: () => {
			mockWorker = new ControllableMockWorker();
			return mockWorker;
		},
	});

	const doc = createBlankDocument();
	scheduler.schedule(doc);
	assertEquals(mockWorker!.postedMessages.length, 1);

	scheduler.dispose();
	assertEquals(mockWorker!.terminated, true);
	assertEquals(scheduler.isDisposed, true);
}

async function testWorkerFailureCooperativeFallback() {
	let yieldCount = 0;
	const customYield = async () => {
		yieldCount++;
	};

	const scheduler = new ConstraintsScheduler({
		workerFactory: () => {
			throw new Error("Worker instantiation blocked in environment");
		},
		yieldFn: customYield,
	});

	const conflictDoc = createNaveConflictsFixture();
	const expected = runSpatialChecks(conflictDoc);

	scheduler.schedule(conflictDoc);

	const result = await scheduler.awaitChecks(conflictDoc.revision);
	assertEquals(result, expected);
	assertEquals(scheduler.status, "idle");
	assertEquals(yieldCount > 0, true);

	scheduler.dispose();
}

async function testFailureNotFalseClean() {
	const scheduler = new ConstraintsScheduler({
		workerFactory: () => {
			throw new Error("Worker blocked");
		},
		yieldFn: () => {
			throw new Error("Yield failure simulation");
		},
	});

	const doc = createNaveConflictsFixture();
	scheduler.schedule(doc);

	let caught = false;
	try {
		await scheduler.awaitChecks(doc.revision);
	} catch {
		caught = true;
	}
	assertEquals(caught, true);
	assertEquals(scheduler.status, "error");
	assertNotEquals(scheduler.lastError, null);
	assertEquals(scheduler.latestResult, null);

	scheduler.dispose();
}

async function testSessionUiContract() {
	let mockWorker: ControllableMockWorker | null = null;
	const customScheduler = new ConstraintsScheduler({
		workerFactory: () => {
			mockWorker = new ControllableMockWorker();
			return mockWorker;
		},
	});

	const doc = createBlankDocument();
	const session = new BlueprintSession({
		document: doc,
		constraintsScheduler: customScheduler,
	});

	assertEquals(session.isSpatialCheckPending, true);

	const job1 = mockWorker!.postedMessages[0];
	mockWorker!.respondSuccess(job1.jobId, doc, job1.generation, job1.revision);

	assertEquals(session.isSpatialCheckPending, false);
	assertEquals(session.areSpatialIssuesOutdated, false);

	session.execute({
		type: "entity.add",
		entity: {
			id: "s-1",
			name: "S1",
			kind: "shape",
			layerId: "layer_foundation",
			groupId: null,
			transform: { x: 1000, y: 1000, rotationDeg: 0 },
			style: {
				fill: "#fff",
				stroke: "#000",
				strokeWidthMm: 1,
				opacity: 1,
				dashMm: [],
			},
			hidden: false,
			locked: false,
			tags: [],
			metadata: {},
			structural: false,
			geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
		},
	});

	assertEquals(session.isSpatialCheckPending, true);
	assertEquals(session.areSpatialIssuesOutdated, true);

	const job2 = mockWorker!.postedMessages[1];
	mockWorker!.respondSuccess(
		job2.jobId,
		session.doc,
		job2.generation,
		job2.revision,
	);

	assertEquals(session.isSpatialCheckPending, false);
	assertEquals(session.areSpatialIssuesOutdated, false);

	session.dispose();
}

if (isVitest) {
	const { describe, it } = await import("vite-plus/test");
	describe("C-04: Constraints worker and scheduler tests", () => {
		it("Worker / fallback return equivalent issues on clean & conflict fixtures", async () => {
			await testWorkerFallbackEquivalent();
		});
		it("Queue cap = 1 (rapid changes retain only single latest pending job)", async () => {
			await testQueueCapOne();
		});
		it("Result B arrives before Result A (stale job A is ignored)", async () => {
			await testOutOfOrderIgnored();
		});
		it("Switching documents while job runs invalidates generation", async () => {
			await testDocSwitchInvalidation();
		});
		it("Disposal before result cleans up and terminates worker", async () => {
			await testDisposalBeforeResult();
		});
		it("Startup failure or worker failure invokes cooperative main-thread fallback", async () => {
			await testWorkerFailureCooperativeFallback();
		});
		it("Failure cannot produce a false clean state", async () => {
			await testFailureNotFalseClean();
		});
		it("Pending / latest-result UI contract in BlueprintSession", async () => {
			await testSessionUiContract();
		});
	});
} else {
	Deno.test(
		"C-04: Worker / fallback return equivalent issues on clean & conflict fixtures",
		testWorkerFallbackEquivalent,
	);
	Deno.test(
		"C-04: Queue cap = 1 (rapid changes retain only single latest pending job)",
		testQueueCapOne,
	);
	Deno.test(
		"C-04: Result B arrives before Result A (stale job A is ignored)",
		testOutOfOrderIgnored,
	);
	Deno.test(
		"C-04: Switching documents while job runs invalidates generation",
		testDocSwitchInvalidation,
	);
	Deno.test(
		"C-04: Disposal before result cleans up and terminates worker",
		testDisposalBeforeResult,
	);
	Deno.test(
		"C-04: Startup failure or worker failure invokes cooperative main-thread fallback",
		testWorkerFailureCooperativeFallback,
	);
	Deno.test(
		"C-04: Failure cannot produce a false clean state",
		testFailureNotFalseClean,
	);
	Deno.test(
		"C-04: Pending / latest-result UI contract in BlueprintSession",
		testSessionUiContract,
	);
}
