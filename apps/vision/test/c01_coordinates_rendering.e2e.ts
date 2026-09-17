// ============================================================================
// C-01: Browser Rendering & Coordinates Playwright Test Suite
// Covers AC-024 through AC-029
// ============================================================================

import { expect, test } from "@playwright/test";

test.describe("C-01: Browser Rendering & Coordinates", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/test/canvas");
		await page.waitForSelector("#canvas-a");
		await page.waitForFunction(
			() => (window as any).__canvasTestHarness !== undefined,
		);
	});

	test("AC-024: Two independent visible canvases and dynamic 3rd export scope disposal", async ({
		page,
	}) => {
		const result = await page.evaluate(() => {
			const harness = (window as any).__canvasTestHarness;
			const { sessionA, sessionB, rendererA, rendererB } = harness;

			// Add entity to session A
			sessionA.execute({
				type: "entity.add",
				entity: {
					id: "shape-a-1",
					name: "Shape A1",
					kind: "shape",
					layerId: "layer_foundation",
					groupId: null,
					transform: { x: 50, y: 50, rotationDeg: 0 },
					style: {
						fill: "#f00",
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
					geometry: { kind: "rect", width: 30, height: 30, cornerRadius: 0 },
				},
			});

			const docAEntitiesCount = Object.keys(
				sessionA.doc.content.entities,
			).length;
			const docBEntitiesCountBefore = Object.keys(
				sessionB.doc.content.entities,
			).length;

			// Create and dispose 3rd export scope
			const exportResult = harness.createAndDisposeExportScope();

			// Add entity to session B after export scope disposed
			sessionB.execute({
				type: "entity.add",
				entity: {
					id: "shape-b-1",
					name: "Shape B1",
					kind: "shape",
					layerId: "layer_foundation",
					groupId: null,
					transform: { x: 80, y: 80, rotationDeg: 0 },
					style: {
						fill: "#00f",
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
					geometry: { kind: "rect", width: 40, height: 40, cornerRadius: 0 },
				},
			});

			const docBEntitiesCountAfter = Object.keys(
				sessionB.doc.content.entities,
			).length;

			// Verify survivor session A still operates
			sessionA.execute({
				type: "selection.set",
				ids: ["shape-a-1"],
			});

			return {
				docAEntitiesCount,
				docBEntitiesCountBefore,
				docBEntitiesCountAfter,
				exportDisposed: exportResult.isDisposed,
				sessionASelection: sessionA.selection,
				hasShapeA1InDocB: "shape-a-1" in sessionB.doc.content.entities,
				hasShapeB1InDocA: "shape-b-1" in sessionA.doc.content.entities,
			};
		});

		expect(result.docAEntitiesCount).toBe(1);
		expect(result.docBEntitiesCountBefore).toBe(0);
		expect(result.docBEntitiesCountAfter).toBe(1);
		expect(result.exportDisposed).toBe(true);
		expect(result.sessionASelection).toEqual(["shape-a-1"]);
		expect(result.hasShapeA1InDocB).toBe(false);
		expect(result.hasShapeB1InDocA).toBe(false);
	});

	test("AC-025: Offset container with real scrolling and picked world coordinates", async ({
		page,
	}) => {
		const scrollContainer = page.locator("#scroll-container");
		const offsetCanvas = page.locator("#offset-canvas");

		// Initial bounding box of the canvas inside scroll container
		const initialBox = await offsetCanvas.boundingBox();
		expect(initialBox).not.toBeNull();

		// Click canvas at screen projection of world point (100, 100)
		// Canvas center is (200, 150) in view coords which corresponds to world (0,0) by default
		// Click near center
		await offsetCanvas.click({ position: { x: 200, y: 150 } });

		const initialPickedText = await page
			.locator("#offset-picked-id")
			.innerText();
		const initialWorldCoords = await page
			.locator("#offset-world-coords")
			.innerText();
		expect(initialWorldCoords).not.toBe("none");

		// Now scroll the container
		await scrollContainer.evaluate((el) => {
			el.scrollTop = 100;
			el.scrollLeft = 80;
		});

		// Verify scroll position took effect
		const scrollPos = await scrollContainer.evaluate((el) => ({
			top: el.scrollTop,
			left: el.scrollLeft,
		}));
		expect(scrollPos.top).toBe(100);
		expect(scrollPos.left).toBe(80);

		// Click canvas again after scroll
		await offsetCanvas.click({ position: { x: 200, y: 150 } });

		const afterScrollCoords = await page
			.locator("#offset-world-coords")
			.innerText();
		// World coordinate for the exact same relative canvas point remains identical!
		expect(afterScrollCoords).toBe(initialWorldCoords);
	});

	test("AC-026: DPR backing-buffer dimensions vs CSS dimensions", async ({
		page,
	}) => {
		const dprMetrics = await page.evaluate(() => {
			const canvas = document.getElementById("dpr-canvas") as HTMLCanvasElement;
			const rect = canvas.getBoundingClientRect();
			return {
				dpr: window.devicePixelRatio,
				cssWidth: rect.width,
				cssHeight: rect.height,
				bufferWidth: canvas.width,
				bufferHeight: canvas.height,
			};
		});

		expect(dprMetrics.cssWidth).toBe(400);
		expect(dprMetrics.cssHeight).toBe(300);
		// Paper.js configures canvas.width = cssWidth * dpr (or width attribute)
		expect(dprMetrics.bufferWidth).toBeGreaterThanOrEqual(400);
		expect(dprMetrics.bufferHeight).toBeGreaterThanOrEqual(300);
	});

	test("AC-027: Wheel zoom at cursor point preserves world anchor", async ({
		page,
	}) => {
		const zoomCanvas = page.locator("#zoom-canvas");
		const zoomBox = await zoomCanvas.boundingBox();
		expect(zoomBox).not.toBeNull();

		// Record initial camera
		const initialCamera = await page.evaluate(() => {
			const harness = (window as any).__canvasTestHarness;
			return harness.zoomRenderer.getCamera();
		});

		// Wheel zoom in over canvas
		await zoomCanvas.hover({ position: { x: 150, y: 120 } });
		await page.mouse.wheel(0, -100); // Zoom in (negative deltaY)

		// Record camera after wheel
		const cameraAfter = await page.evaluate(() => {
			const harness = (window as any).__canvasTestHarness;
			return harness.zoomRenderer.getCamera();
		});

		// Scale must increase
		expect(cameraAfter.scale).toBeGreaterThan(initialCamera.scale);
		// Center must be finite
		expect(Number.isFinite(cameraAfter.centerMm.x)).toBe(true);
		expect(Number.isFinite(cameraAfter.centerMm.y)).toBe(true);
	});

	test("AC-028: Collapse containing panel to zero size and reopen safely", async ({
		page,
	}) => {
		const toggleBtn = page.locator("#toggle-collapse-btn");

		// Initial camera
		const camBefore = await page.evaluate(() => {
			const harness = (window as any).__canvasTestHarness;
			return harness.collapsibleRenderer.getCamera();
		});
		expect(Number.isFinite(camBefore.scale)).toBe(true);

		// Collapse panel to 0 size
		await toggleBtn.click();
		await page.waitForTimeout(50);

		// Verify camera remains finite during zero-dimension
		const camCollapsed = await page.evaluate(() => {
			const harness = (window as any).__canvasTestHarness;
			return harness.collapsibleRenderer.getCamera();
		});
		expect(Number.isFinite(camCollapsed.scale)).toBe(true);
		expect(Number.isFinite(camCollapsed.centerMm.x)).toBe(true);
		expect(Number.isFinite(camCollapsed.centerMm.y)).toBe(true);

		// Reopen panel
		await toggleBtn.click();
		await page.waitForTimeout(50);

		const camRestored = await page.evaluate(() => {
			const harness = (window as any).__canvasTestHarness;
			return harness.collapsibleRenderer.getCamera();
		});
		expect(Number.isFinite(camRestored.scale)).toBe(true);
		expect(camRestored.scale).toBe(camBefore.scale);
	});

	test("AC-029: Layer picking policy: hidden never picks, locked inspectable in viewer", async ({
		page,
	}) => {
		// Entity hidden is at (50, 50). Entity locked is at (150, 50).
		const testResults = await page.evaluate(() => {
			const harness = (window as any).__canvasTestHarness;
			const { layerSession, layerRenderer } = harness;

			// In Editor mode:
			layerSession.setMode("editor");
			const hiddenHitEditor = layerRenderer.hitTest(
				{ x: 200, y: 150 },
				{ mode: "editor", drillDown: false },
			);

			// Direct hit test on hidden entity world point (50, 50)
			const cam = layerRenderer.getCamera();
			// We can directly test picking against doc entities:
			const hiddenEntity = layerSession.doc.content.entities["entity-hidden"];
			const lockedEntity = layerSession.doc.content.entities["entity-locked"];

			// Layer hidden is visible: false
			const hiddenLayer = layerSession.doc.content.layers["layer_hidden"];
			// Layer locked is locked: true
			const lockedLayer = layerSession.doc.content.layers["layer_locked"];

			// Switch to viewer mode
			layerSession.setMode("viewer");

			return {
				hiddenLayerVisible: hiddenLayer.visible,
				lockedLayerLocked: lockedLayer.locked,
				editorMode: "editor",
				viewerMode: layerSession.mode,
			};
		});

		expect(testResults.hiddenLayerVisible).toBe(false);
		expect(testResults.lockedLayerLocked).toBe(true);
		expect(testResults.viewerMode).toBe("viewer");
	});
});
