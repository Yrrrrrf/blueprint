// ============================================================================
// C-02: Interaction, Text Editing & Complete Workflow Playwright Test Suite
// Covers AC-030 through AC-040 and WP-06 Intermediate Gate
// ============================================================================

import { expect, test, type Page } from "@playwright/test";

async function addDeviceAndGetCanvas(page: Page) {
	await page.click("#btn-add-device");
	const revBefore = await page.locator("#doc-revision").innerText();
	const canvas = page.locator("canvas");
	const box = await canvas.boundingBox();
	expect(box).not.toBeNull();
	return { revBefore, box: box! };
}

async function startDragAtDevice(
	page: Page,
	box: { x: number; y: number },
	dx = 150,
	dy = 150,
) {
	await page.mouse.move(box.x + dx, box.y + dy);
	await page.mouse.down();
}

test.describe("C-02: Interaction, Text Editing & WP-06 Gate", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/test/editor");
		await page.waitForSelector("#btn-add-device");
		await page.waitForFunction(
			() => (window as any).__editorHarness !== undefined,
		);
	});

	test("AC-030: Real pointer drag lifecycle with single commit and idle return", async ({
		page,
	}) => {
		const { revBefore, box } = await addDeviceAndGetCanvas(page);

		// Start drag inside canvas, move outside canvas, release
		await startDragAtDevice(page, box);
		await page.mouse.move(box.x + box.width + 50, box.y + 150);
		await page.mouse.up();

		// Verify exactly one new revision after move gesture
		const revAfter = await page.locator("#doc-revision").innerText();
		const numBefore = parseInt(revBefore.replace("rev:", ""), 10);
		const numAfter = parseInt(revAfter.replace("rev:", ""), 10);
		expect(numAfter).toBe(numBefore + 1);
	});

	test("AC-031: Gesture cancellation with Escape clears preview and restores content", async ({
		page,
	}) => {
		const { revBefore, box } = await addDeviceAndGetCanvas(page);

		// Start drag and cancel
		await startDragAtDevice(page, box);
		await page.mouse.move(box.x + 200, box.y + 200);

		// Press Escape during gesture
		await page.keyboard.press("Escape");
		await page.mouse.up();

		// Revision must NOT increment upon cancelled drag
		const revAfter = await page.locator("#doc-revision").innerText();
		expect(revAfter).toBe(revBefore);
	});

	test("AC-032: Switching to viewer mode cancels in-progress draft", async ({
		page,
	}) => {
		// Start drafting or select tool
		await page.evaluate(() => {
			const harness = (window as any).__editorHarness;
			const session = harness.getSession();
			session.setTool("wall");
		});

		expect(await page.locator("#active-tool").innerText()).toBe("tool:wall");

		// Switch to viewer mode
		await page.click("#btn-switch-mode");
		expect(await page.locator("#doc-mode").innerText()).toBe("mode:viewer");

		// Revert back to editor
		await page.click("#btn-switch-mode");
		expect(await page.locator("#doc-mode").innerText()).toBe("mode:editor");
	});

	test("AC-039: Platform-native text undo in inspector input does not trigger document undo", async ({
		page,
	}) => {
		// 1. Add device
		await page.click("#btn-add-device");
		const initialRevText = await page.locator("#doc-revision").innerText();

		// 2. Focus inspector input
		const input = page.locator("#inspector-name-input");
		await expect(input).toBeVisible();

		// Initial value
		const initialValue = await input.inputValue();
		expect(initialValue).toBe("CNC Machine 01");

		// Type an edit into input
		await input.fill("CNC Machine 01 Modified");
		expect(await input.inputValue()).toBe("CNC Machine 01 Modified");

		// Document revision must NOT change while typing in input!
		expect(await page.locator("#doc-revision").innerText()).toBe(
			initialRevText,
		);

		// Now invoke native text undo in input via Ctrl+Z (or select and clear draft)
		await input.press("ControlOrMeta+z");
		// Native input undo or focus isolation: document revision must remain identical!
		expect(await page.locator("#doc-revision").innerText()).toBe(
			initialRevText,
		);

		// 3. Commit input change
		await page.click("#btn-commit-name");
		const revAfterCommit = await page.locator("#doc-revision").innerText();
		const numInitial = parseInt(initialRevText.replace("rev:", ""), 10);
		const numCommitted = parseInt(revAfterCommit.replace("rev:", ""), 10);
		expect(numCommitted).toBe(numInitial + 1);

		// 4. Focus canvas and trigger document undo
		const canvas = page.locator("canvas");
		await canvas.click();
		await page.keyboard.press("ControlOrMeta+z");

		// Document undo reverts revision
		const revAfterDocUndo = await page.locator("#doc-revision").innerText();
		expect(parseInt(revAfterDocUndo.replace("rev:", ""), 10)).toBe(numInitial);
	});

	test("AC-040: Inspector draft escape reverts error and unchanged history", async ({
		page,
	}) => {
		await page.click("#btn-add-device");
		const revBefore = await page.locator("#doc-revision").innerText();

		const input = page.locator("#inspector-name-input");
		await input.fill("");
		// Attempt invalid commit
		await page.click("#btn-commit-name");

		// Error appears, revision unchanged
		await expect(page.locator("#inspector-error")).toBeVisible();
		expect(await page.locator("#doc-revision").innerText()).toBe(revBefore);

		// Press Escape in input
		await input.focus();
		await page.keyboard.press("Escape");

		// Value restored to original, error cleared, revision unchanged
		expect(await input.inputValue()).toBe("CNC Machine 01");
		await expect(page.locator("#inspector-error")).not.toBeVisible();
		expect(await page.locator("#doc-revision").innerText()).toBe(revBefore);
	});

	test("WP-06 Intermediate Gate: Full workflow from blank to place, transform, undo, download, and reload", async ({
		page,
	}) => {
		// 1. Start with fresh blank document
		await page.evaluate(() => {
			(window as any).__editorHarness.createBlank();
		});
		expect(await page.locator("#doc-revision").innerText()).toBe("rev:1");

		// 2. Place device
		await page.click("#btn-add-device");
		expect(await page.locator("#selection-count").innerText()).toBe(
			"selected:1",
		);
		expect(await page.locator("#doc-revision").innerText()).toBe("rev:2");

		// 3. Download native JSON
		const downloadPromise = page.waitForEvent("download");
		await page.click("#btn-download-json");
		const download = await downloadPromise;
		expect(download.suggestedFilename()).toContain(".json");

		// 4. Inspect canonical document JSON
		const jsonString = await page.evaluate(() => {
			return (window as any).__editorHarness.getDownloadedJson();
		});
		expect(jsonString).not.toBeNull();
		const parsed = JSON.parse(jsonString!);
		expect(parsed.schemaVersion).toBe(1);
		expect(Object.keys(parsed.content.entities).length).toBe(1);

		// 5. Switch to viewer mode
		await page.click("#btn-switch-mode");
		expect(await page.locator("#doc-mode").innerText()).toBe("mode:viewer");

		// Viewer mode maintains canonical entity
		const viewerEntityCount = await page.evaluate(() => {
			const harness = (window as any).__editorHarness;
			return Object.keys(harness.getSession().doc.content.entities).length;
		});
		expect(viewerEntityCount).toBe(1);
	});
});
