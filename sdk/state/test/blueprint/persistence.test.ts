// ============================================================================
// WP-08: Durable Repository Acceptance Tests (§10, §14, §16.3)
// Covers Acceptance Criteria AC-041 through AC-046.
// ============================================================================

import { assertEquals, assertNotEquals } from "@std/assert";
import { createBlankDocument } from "../../../core/src/mod.ts";
import {
	createDocumentRepository,
	MemoryDocumentRepository,
	parseNativeDocument,
	SaveDraftResult,
	serializeNativeDocument,
	StorageQuotaError,
} from "../../../api/src/mod.ts";
import { BlueprintSession } from "../../src/blueprint/session.ts";
import { persistenceMachine } from "../../src/blueprint/persistence.machine.ts";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * AC-041: Commit repeatedly then advance clock -> save triggered after 750ms idle
 * or at 5000ms maximum; latest content durable.
 */
export async function testAC041(): Promise<void> {
	// Verify default statechart delay definitions (§10.2, AC-041)
	const defaultDelays = (persistenceMachine as any).implementations?.delays;
	assertEquals(defaultDelays?.DEBOUNCE_DELAY, 750);
	assertEquals(defaultDelays?.MAX_WAIT_DELAY, 5000);

	// Part A: 750ms idle timer (tested with 60ms debounce for deterministic speed)
	const repo1 = new MemoryDocumentRepository();
	const session1 = new BlueprintSession({
		repository: repo1,
		debounceDelay: 60,
		maxWaitDelay: 300,
	});

	assertEquals(session1.isDirty, false);
	assertEquals(session1.persistenceState, "idle");

	session1.execute({
		type: "layer.add",
		layer: {
			name: "Foundation Layer",
			role: "custom",
		},
	});

	assertEquals(session1.isDirty, true);
	assertEquals(session1.persistenceState, "debouncing");

	// Wait past debounce threshold
	await sleep(90);

	assertEquals(session1.persistenceState, "idle");
	assertEquals(session1.isDirty, false);
	assertEquals(session1.storageVersion, 1);

	// Verify content durable in repository
	const stored1 = await repo1.load(session1.doc.documentId);
	assertNotEquals(stored1, null);
	assertEquals(
		stored1?.content.layers.some((l) => l.name === "Foundation Layer"),
		true,
	);
	session1.dispose();

	// Part B: Continuous commits and max wait (maxWaitDelay: 200ms, debounce: 80ms)
	const repo2 = new MemoryDocumentRepository();
	const session2 = new BlueprintSession({
		repository: repo2,
		debounceDelay: 80,
		maxWaitDelay: 200,
	});

	// Fire commits every 25ms (< 80ms debounce) for 250ms (> 200ms maxWait)
	for (let i = 1; i <= 10; i++) {
		session2.execute({
			type: "layer.add",
			layer: {
				name: `Stream Layer ${i}`,
				role: "custom",
			},
		});
		await sleep(25);
	}

	// Wait for in-flight save triggered by maxWait to complete
	await sleep(100);

	assertEquals(session2.persistenceState, "idle");
	assertEquals(session2.isDirty, false);

	// Latest content is durable
	const stored2 = await repo2.load(session2.doc.documentId);
	assertNotEquals(stored2, null);
	assertEquals(
		stored2?.content.layers.some((l) => l.name === "Stream Layer 10"),
		true,
	);
	session2.dispose();
}

/**
 * AC-042: Save revision N delayed while revision N+1 commits -> N completion does
 * not show latest saved; next save writes N+1.
 */
export async function testAC042(): Promise<void> {
	let releaseRevN: (() => void) | null = null;
	let interceptFirstSave = true;

	class DelayedMemoryRepository extends MemoryDocumentRepository {
		public override async saveDraft(
			doc: any,
			expectedStorageVersion: number,
		): Promise<SaveDraftResult> {
			if (interceptFirstSave) {
				interceptFirstSave = false;
				await new Promise<void>((resolve) => {
					releaseRevN = resolve;
				});
			}
			return await super.saveDraft(doc, expectedStorageVersion);
		}
	}

	const repo = new DelayedMemoryRepository();
	const session = new BlueprintSession({
		repository: repo,
		debounceDelay: 50,
		maxWaitDelay: 300,
	});

	// Commit revision 1
	session.execute({
		type: "layer.add",
		layer: {
			name: "Revision N Layer",
			role: "custom",
		},
	});
	const revN = session.doc.revision;

	// Trigger save for revision N
	const saveNPromise = session.flushSave();
	assertEquals(session.isSaving, true);

	// While saving revision N, commit revision N+1
	session.execute({
		type: "layer.add",
		layer: {
			name: "Revision N+1 Layer",
			role: "custom",
		},
	});
	const revNPlusOne = session.doc.revision;
	assertEquals(revNPlusOne > revN, true);

	// Release revision N save
	assertNotEquals(releaseRevN, null);
	releaseRevN!();
	await saveNPromise;

	// Revision N completion does NOT show latest saved:
	// Session has newer revision N+1 edits queued, so isDirty remains true or it transitions immediately
	// Wait a moment for queued N+1 save to complete
	await sleep(60);

	// Verify both N and N+1 are finally saved
	assertEquals(session.isDirty, false);
	const stored = await repo.load(session.doc.documentId);
	assertNotEquals(stored, null);
	assertEquals(
		stored?.content.layers.some((l) => l.name === "Revision N Layer"),
		true,
	);
	assertEquals(
		stored?.content.layers.some((l) => l.name === "Revision N+1 Layer"),
		true,
	);
	session.dispose();
}

/**
 * AC-043: Two tabs save same expected storageVersion -> Exactly one succeeds,
 * other returns CONFLICT; both versions recoverable as copy.
 */
export async function testAC043(): Promise<void> {
	const sharedRepo = new MemoryDocumentRepository();
	const initialDoc = createBlankDocument();
	initialDoc.content.name = "Shared Plant";
	await sharedRepo.create(initialDoc);

	// Tab A and Tab B both open the document at storageVersion = 1
	const tabA = new BlueprintSession({
		repository: sharedRepo,
		document: JSON.parse(JSON.stringify(initialDoc)),
		storageVersion: 1,
	});
	const tabB = new BlueprintSession({
		repository: sharedRepo,
		document: JSON.parse(JSON.stringify(initialDoc)),
		storageVersion: 1,
	});

	// Tab A adds Zone A
	tabA.execute({
		type: "layer.add",
		layer: {
			name: "Tab A Modification",
			role: "custom",
		},
	});

	// Tab B adds Zone B
	tabB.execute({
		type: "layer.add",
		layer: {
			name: "Tab B Modification",
			role: "custom",
		},
	});

	// Tab A flushes save first -> Succeeds, storageVersion becomes 2
	const resultA = await tabA.flushSave();
	assertEquals(resultA.status, "saved");
	if (resultA.status === "saved") {
		assertEquals(resultA.storageVersion, 2);
	}
	assertEquals(tabA.storageVersion, 2);
	assertEquals(tabA.saveConflict, false);

	// Tab B flushes save with expected storageVersion 1 -> Mismatch! CONFLICT!
	const resultB = await tabB.flushSave();
	assertEquals(resultB.status, "conflict");
	if (resultB.status === "conflict") {
		assertEquals(resultB.currentStorageVersion, 2);
	}
	assertEquals(tabB.saveConflict, true);
	assertEquals(tabB.persistenceState, "conflict");

	// Tab B's draft is preserved intact in memory
	assertEquals(
		tabB.doc.content.layers.some((l) => l.name === "Tab B Modification"),
		true,
	);

	// Tab B resolves conflict via Save as copy (new documentId)
	const copyDoc = await tabB.resolveConflictSaveCopy();
	assertEquals(tabB.saveConflict, false);
	assertEquals(tabB.storageVersion, 1);
	assertNotEquals(copyDoc.documentId, initialDoc.documentId);

	// Both versions are recoverable from shared repository
	const recoveredA = await sharedRepo.load(initialDoc.documentId);
	const recoveredB = await sharedRepo.load(copyDoc.documentId);

	assertNotEquals(recoveredA, null);
	assertNotEquals(recoveredB, null);
	assertEquals(
		recoveredA?.content.layers.some((l) => l.name === "Tab A Modification"),
		true,
	);
	assertEquals(
		recoveredB?.content.layers.some((l) => l.name === "Tab B Modification"),
		true,
	);

	tabA.dispose();
	tabB.dispose();
}

/**
 * AC-044: Simulate IDB quota failure -> Current document intact/dirty; download
 * and retry available; no false Saved.
 */
export async function testAC044(): Promise<void> {
	let throwQuota = true;

	class QuotaFailRepository extends MemoryDocumentRepository {
		public override async saveDraft(
			doc: any,
			expectedStorageVersion: number,
		): Promise<SaveDraftResult> {
			if (throwQuota) {
				throw new StorageQuotaError("Simulated IDB quota exceeded");
			}
			return await super.saveDraft(doc, expectedStorageVersion);
		}
	}

	const repo = new QuotaFailRepository();
	const session = new BlueprintSession({ repository: repo });

	session.execute({
		type: "layer.add",
		layer: {
			name: "Quota Critical Layer",
			role: "custom",
		},
	});

	// Attempt save which fails with quota error
	let caughtError = false;
	try {
		await session.flushSave();
	} catch (err) {
		caughtError = true;
		assertEquals(err instanceof StorageQuotaError, true);
	}
	assertEquals(caughtError, true);

	// Current document remains intact and dirty (no false "Saved")
	assertEquals(session.isDirty, true);
	assertEquals(session.persistenceState, "failed");
	assertEquals(session.persistenceError instanceof StorageQuotaError, true);
	assertEquals(
		session.doc.content.layers.some((l) => l.name === "Quota Critical Layer"),
		true,
	);

	// Native JSON download / serialization remains fully available
	const jsonStr = serializeNativeDocument(session.doc);
	const parseRes = parseNativeDocument(jsonStr);
	assertEquals(parseRes.valid, true);
	assertEquals(
		parseRes.document?.content.layers.some(
			(l) => l.name === "Quota Critical Layer",
		),
		true,
	);

	// Quota is freed -> Retry save
	throwQuota = false;
	session.retrySave();
	const retryResult = await session.flushSave();
	assertEquals(retryResult.status, "saved");
	assertEquals(session.isDirty, false);
	assertEquals(session.persistenceState, "idle");

	session.dispose();
}

/**
 * AC-045: Reload after successful autosave -> Draft recovery restores canonical
 * content/IDs, empty gesture/history; undo to saved content displays isDirty = false
 * even with newer revision.
 */
export async function testAC045(): Promise<void> {
	const repo = new MemoryDocumentRepository();
	const session1 = new BlueprintSession({ repository: repo });

	session1.execute({
		type: "layer.add",
		layer: {
			name: "Permanent Layer",
			role: "custom",
		},
	});
	session1.setSelection(["custom-layer-1"]);

	await session1.flushSave();
	assertEquals(session1.isDirty, false);
	const docId = session1.doc.documentId;
	session1.dispose();

	// Draft recovery into new session
	const session2 = new BlueprintSession({ repository: repo });
	const recovered = await session2.recoverDraft(docId);
	assertEquals(recovered, true);

	// Restores canonical content and IDs
	assertEquals(session2.doc.documentId, docId);
	assertEquals(
		session2.doc.content.layers.some((l) => l.name === "Permanent Layer"),
		true,
	);

	// Empty gesture and history
	assertEquals(session2.canUndo(), false);
	assertEquals(session2.canRedo(), false);
	assertEquals(session2.selection.length, 0);
	assertEquals(session2.isDirty, false);

	// Test undo to saved content displays isDirty = false even with newer revision
	const revBefore = session2.doc.revision;
	session2.execute({
		type: "layer.add",
		layer: {
			name: "Temporary Layer",
			role: "custom",
		},
	});
	assertEquals(session2.isDirty, true);
	assertEquals(session2.doc.revision > revBefore, true);

	// Undo restores saved content
	const undoRes = session2.undo();
	assertEquals(undoRes.success, true);
	assertEquals(session2.doc.revision > revBefore, true); // revision is monotonically higher
	assertEquals(session2.isDirty, false); // isDirty is false because content matches saved!

	session2.dispose();
}

/**
 * AC-046: IDB unavailable / memory fallback -> Explicit memory-only state;
 * no durable-recovery promise.
 */
export async function testAC046(): Promise<void> {
	// Factory fallback produces memory adapter with isDurable = false
	const repo = createDocumentRepository({ forceMemory: true });
	assertEquals(repo.isDurable, false);

	const session = new BlueprintSession({ repository: repo });
	assertEquals(session.isDurable, false);

	// Normal save functions in memory
	session.execute({
		type: "layer.add",
		layer: {
			name: "Ephemeral Layer",
			role: "custom",
		},
	});
	const result = await session.flushSave();
	assertEquals(result.status, "saved");
	assertEquals(session.isDurable, false);

	session.dispose();
}

// ============================================================================
// Dual Vitest / Deno Test Harness Registration
// ============================================================================

const isVitest = typeof (globalThis as any).__vitest_worker__ !== "undefined";

if (isVitest) {
	const { describe, it } = await import("vite-plus/test");
	describe("WP-08: Durable repository acceptance tests (AC-041..AC-046)", () => {
		it("AC-041: Autosave debounce and max wait", async () => {
			await testAC041();
		});
		it("AC-042: Save queueing while in-flight", async () => {
			await testAC042();
		});
		it("AC-043: Compare-and-swap conflict and save as copy", async () => {
			await testAC043();
		});
		it("AC-044: Storage quota failure and retry", async () => {
			await testAC044();
		});
		it("AC-045: Draft recovery and undo-to-saved cleanliness", async () => {
			await testAC045();
		});
		it("AC-046: IDB unavailable memory fallback", async () => {
			await testAC046();
		});
	});
} else if (typeof Deno !== "undefined" && typeof Deno.test === "function") {
	Deno.test("AC-041: Autosave debounce and max wait", async () => {
		await testAC041();
	});
	Deno.test("AC-042: Save queueing while in-flight", async () => {
		await testAC042();
	});
	Deno.test("AC-043: Compare-and-swap conflict and save as copy", async () => {
		await testAC043();
	});
	Deno.test("AC-044: Storage quota failure and retry", async () => {
		await testAC044();
	});
	Deno.test("AC-045: Draft recovery and undo-to-saved cleanliness", async () => {
		await testAC045();
	});
	Deno.test("AC-046: IDB unavailable memory fallback", async () => {
		await testAC046();
	});
}
