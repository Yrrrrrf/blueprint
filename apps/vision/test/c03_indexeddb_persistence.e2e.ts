// ============================================================================
// C-03: IndexedDB & Multi-Tab Persistence Playwright Test Suite
// Covers AC-041 through AC-046
// ============================================================================

import { expect, test, type Page } from "@playwright/test";

async function openPersistenceHarness(page: Page, dbName: string) {
	await page.goto(`/test/persistence?db=${dbName}`);
	await page.waitForFunction(
		() => (window as any).__persistenceHarness !== undefined,
	);
	await page.click("#btn-edit");
	expect(await page.locator("#is-dirty").innerText()).toBe("true");
}

async function triggerSaveAndAwaitClean(page: Page) {
	await page.click("#btn-save");
	await page.waitForFunction(() => {
		const el = document.getElementById("is-dirty");
		return el && el.innerText === "false";
	});
}

test.describe("C-03: IndexedDB & Multi-Tab Persistence", () => {
	test("AC-041 & AC-045: Durable save to real IndexedDB and recovery across reload", async ({
		page,
	}) => {
		const dbName = `idb_test_${Date.now()}`;
		await page.goto(`/test/persistence?db=${dbName}`);
		await page.waitForSelector("#durable-badge");

		expect(await page.locator("#durable-badge").innerText()).toContain(
			"DURABLE",
		);

		// Mutate document
		await page.click("#btn-edit");
		expect(await page.locator("#is-dirty").innerText()).toBe("true");

		// Save draft
		await triggerSaveAndAwaitClean(page);

		const docId = await page.locator("#doc-id").innerText();
		const savedRevision = await page.locator("#doc-revision").innerText();

		// Reload page and verify reconstructed content from real IndexedDB
		await page.goto(`/test/persistence?db=${dbName}&docId=${docId}`);
		await page.waitForSelector("#doc-id");

		expect(await page.locator("#doc-id").innerText()).toBe(docId);
		expect(await page.locator("#doc-revision").innerText()).toBe(savedRevision);
		expect(await page.locator("#is-dirty").innerText()).toBe("false");
	});

	test("AC-042: Save ordering: holding save N does not mark clean until N+1 saves", async ({
		page,
	}) => {
		const dbName = `idb_order_${Date.now()}`;
		await openPersistenceHarness(page, dbName);

		// Hold next save operation in repository gate
		await page.evaluate(() => {
			(window as any).__persistenceHarness.holdNextSave();
		});

		// Trigger save N (it will block on gate)
		page.click("#btn-save");
		await page.waitForTimeout(50);

		// Mutate document again to rev 3 (commit N+1)
		await page.click("#btn-edit");
		expect(await page.locator("#is-dirty").innerText()).toBe("true");

		// Release held save N
		await page.evaluate(() => {
			(window as any).__persistenceHarness.releaseHeldSave();
		});

		// After save N finishes, UI must STILL be dirty because rev 3 (N+1) is uncommitted!
		await page.waitForTimeout(50);
		expect(await page.locator("#is-dirty").innerText()).toBe("true");

		// Save N+1
		await triggerSaveAndAwaitClean(page);
	});

	test("AC-043: Multi-tab CAS conflict and Save as copy produces independent document", async ({
		context,
	}) => {
		const dbName = `idb_multitab_${Date.now()}`;

		// Page 1 initializes doc
		const page1 = await context.newPage();
		await page1.goto(`/test/persistence?db=${dbName}`);
		await page1.waitForSelector("#doc-id");
		const docId = await page1.locator("#doc-id").innerText();

		// Page 2 loads the same document
		const page2 = await context.newPage();
		await page2.goto(`/test/persistence?db=${dbName}&docId=${docId}`);
		await page2.waitForSelector("#doc-id");

		// Both pages mutate their local document
		await page1.click("#btn-edit");
		await page2.click("#btn-edit");

		// Page 1 saves first -> succeeds
		await page1.click("#btn-save");
		await page1.waitForFunction(() => {
			const el = document.getElementById("is-dirty");
			return el && el.innerText === "false";
		});
		expect(await page1.locator("#persistence-status").innerText()).toBe("idle");

		// Page 2 attempts to save with stale version -> conflict!
		await page2.click("#btn-save");
		await page2.waitForFunction(() => {
			const el = document.getElementById("persistence-status");
			return el && el.innerText === "conflict";
		});
		expect(await page2.locator("#persistence-status").innerText()).toBe(
			"conflict",
		);
		// Loser retains its dirty draft
		expect(await page2.locator("#is-dirty").innerText()).toBe("true");

		// Loser executes Save as copy
		await page2.click("#btn-save-as-copy");
		await page2.waitForFunction(() => {
			const el = document.getElementById("persistence-status");
			return el && el.innerText === "idle";
		});

		// New document ID allocated and clean
		const copyDocId = await page2.locator("#doc-id").innerText();
		expect(copyDocId).not.toBe(docId);
		expect(await page2.locator("#is-dirty").innerText()).toBe("false");

		await page1.close();
		await page2.close();
	});

	test("AC-044: Injected quota failure preserves dirty content and exposes error", async ({
		page,
	}) => {
		const dbName = `idb_quota_${Date.now()}`;
		await openPersistenceHarness(page, dbName);

		// Inject quota error once
		await page.evaluate(() => {
			(window as any).__persistenceHarness.injectQuotaErrorOnce();
		});

		// Attempt save
		await page.click("#btn-save");
		await page.waitForSelector("#error-message");

		// Error message visible, dirty state preserved
		expect(await page.locator("#error-message").innerText()).toContain("quota");
		expect(await page.locator("#is-dirty").innerText()).toBe("true");

		// Retry succeeds without quota failure
		await triggerSaveAndAwaitClean(page);
	});

	test("AC-046: Memory fallback mode displays explicit memory badge", async ({
		page,
	}) => {
		await page.goto("/test/persistence?memory=true");
		await page.waitForSelector("#durable-badge");

		// Badge displays MEMORY-ONLY
		expect(await page.locator("#durable-badge").innerText()).toContain(
			"MEMORY-ONLY",
		);
	});
});
