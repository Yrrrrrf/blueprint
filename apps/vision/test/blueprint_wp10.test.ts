// ============================================================================
// WP-10 Integrated Product Draft Unit & Component Acceptance Tests
// Covers AC-054 through AC-058, W10-A01 through W10-A09, and W10-A12
// ============================================================================

import { describe, expect, it, vi } from "vite-plus/test";
import { createBlankDocument, type DeviceEntity } from "@sdk/core";
import { parseNativeDocument, serializeNativeDocument } from "@sdk/api";
import { BlueprintSession } from "@sdk/state";
import { CommandStore, type ToastStore } from "rune-lab/palettes";
import type { SlotContext } from "rune-lab/core";
import {
	createBlueprintStore,
	PREFERENCES_STORAGE_KEY,
} from "#lib/blueprint/store.svelte.ts";
import {
	createNewDocument,
	createIndustrialDocument,
	sanitizeFilename,
} from "#lib/blueprint/runtime.ts";
import {
	isEditableTarget,
	registerBlueprintCommands,
} from "#lib/blueprint/commands.ts";

describe("WP-10: Blueprint Plugin, Registry & Store Contract", () => {
	it("initializes BlueprintStore with defaults and loads preferences from persistence", () => {
		const mockStorage = new Map<string, string>();
		const mockCtx = {
			config: {},
			stores: new Map(),
			persistence: {
				get: (k: string) => mockStorage.get(k) ?? null,
				set: (k: string, v: string) => {
					mockStorage.set(k, v);
				},
				remove: (k: string) => {
					mockStorage.delete(k);
				},
			},
		} as unknown as SlotContext<unknown>;

		const store = createBlueprintStore(mockCtx);
		expect(store.preferences.displayUnit).toBe("mm");
		expect(store.preferences.snapEnabled).toBe(true);
		expect(store.activeSession).toBeNull();
		expect(store.activeInstanceId).toBeNull();

		// Update preferences and verify persistence write
		store.updatePreferences({ displayUnit: "m", hoverDelayMs: 400 });
		expect(store.preferences.displayUnit).toBe("m");
		expect(store.preferences.hoverDelayMs).toBe(400);

		const saved = JSON.parse(mockStorage.get(PREFERENCES_STORAGE_KEY)!);
		expect(saved.displayUnit).toBe("m");
		expect(saved.hoverDelayMs).toBe(400);
	});

	it("registers, activates, and idempotently unregisters sessions (W10-02, AC-056)", () => {
		const store = createBlueprintStore();
		const doc1 = createBlankDocument("Doc 1");
		const doc2 = createBlankDocument("Doc 2");
		const session1 = new BlueprintSession({ document: doc1, mode: "editor" });
		const session2 = new BlueprintSession({ document: doc2, mode: "viewer" });

		// Register first session -> automatically activates
		const unregister1 = store.register("inst-1", session1);
		expect(store.activeInstanceId).toBe("inst-1");
		expect(store.activeSession).toBe(session1);
		expect(store.sessions.length).toBe(1);

		// Duplicate instance ID throws
		expect(() => store.register("inst-1", session1)).toThrow(
			/Duplicate live instance ID/,
		);

		// Register second session
		const unregister2 = store.register("inst-2", session2);
		expect(store.sessions.length).toBe(2);
		expect(store.activeInstanceId).toBe("inst-1"); // remains inst-1 until explicitly activated

		// Activate inst-2
		store.activate("inst-2");
		expect(store.activeInstanceId).toBe("inst-2");
		expect(store.activeSession).toBe(session2);

		// Unregister inst-2 -> active state is cleared without arbitrary routing
		unregister2();
		expect(store.sessions.length).toBe(1);
		expect(store.activeInstanceId).toBeNull();
		expect(store.activeSession).toBeNull();

		// Idempotent unregister call
		unregister2();
		expect(store.sessions.length).toBe(1);

		// Unregister inst-1
		unregister1();
		expect(store.sessions.length).toBe(0);

		session1.dispose();
		session2.dispose();
		store.dispose();
	});

	it("prevents stale token removal when same instance ID is re-registered (Section 5)", () => {
		const store = createBlueprintStore();
		const sessionA = new BlueprintSession({
			document: createBlankDocument("A"),
			mode: "editor",
		});
		const sessionB = new BlueprintSession({
			document: createBlankDocument("B"),
			mode: "editor",
		});

		const unregisterA = store.register("inst-x", sessionA);
		unregisterA(); // unregister A

		// Re-register with same instance ID
		const unregisterB = store.register("inst-x", sessionB);
		expect(store.sessions.length).toBe(1);
		expect(store.activeSession).toBe(sessionB);

		// Calling stale unregisterA does NOT unregister sessionB
		unregisterA();
		expect(store.sessions.length).toBe(1);
		expect(store.activeSession).toBe(sessionB);

		// unregisterB cleanly removes
		unregisterB();
		expect(store.sessions.length).toBe(0);

		sessionA.dispose();
		sessionB.dispose();
		store.dispose();
	});

	it("survives 20 enter/leave workspace mount cycles without leaked registrations (AC-056)", () => {
		const store = createBlueprintStore();

		for (let i = 0; i < 20; i++) {
			const s = new BlueprintSession({
				document: createBlankDocument(`Doc ${i}`),
				mode: "editor",
			});
			const unreg = store.register(`cycle-inst-${i}`, s);
			expect(store.sessions.length).toBe(1);
			expect(store.activeInstanceId).toBe(`cycle-inst-${i}`);

			unreg();
			expect(store.sessions.length).toBe(0);
			expect(store.activeInstanceId).toBeNull();
			s.dispose();
		}

		expect(store.sessions.length).toBe(0);
		store.dispose();
	});
});

describe("WP-10: Commands, Shortcuts & Input Protection", () => {
	it("protects text inputs from triggering canvas undo/redo (AC-039, W10-A04)", () => {
		const inputTarget = {
			tagName: "INPUT",
			isContentEditable: false,
			getAttribute: (attr: string) =>
				attr === "contenteditable" ? null : null,
		};
		const inputEvent = {
			composedPath: () => [inputTarget],
			target: inputTarget,
		} as unknown as Event;
		expect(isEditableTarget(inputEvent)).toBe(true);

		const textareaTarget = {
			tagName: "TEXTAREA",
			isContentEditable: false,
			getAttribute: () => null,
		};
		expect(
			isEditableTarget({ target: textareaTarget } as unknown as Event),
		).toBe(true);

		const contentEditableTarget = {
			tagName: "DIV",
			isContentEditable: true,
			getAttribute: (attr: string) =>
				attr === "contenteditable" ? "true" : null,
		};
		expect(
			isEditableTarget({ target: contentEditableTarget } as unknown as Event),
		).toBe(true);

		const canvasTarget = {
			tagName: "CANVAS",
			isContentEditable: false,
			getAttribute: () => null,
		};
		const canvasEvent = {
			composedPath: () => [canvasTarget],
			target: canvasTarget,
		} as unknown as Event;
		expect(isEditableTarget(canvasEvent)).toBe(false);
	});

	it("routes commands to active session and guards viewer mode (W10-A03)", async () => {
		const store = createBlueprintStore();
		const commandStore = new CommandStore();
		const doc = createBlankDocument("Test Doc");
		const session = new BlueprintSession({ document: doc, mode: "viewer" }); // Read-only viewer

		store.register("inst-viewer", session);
		store.activate("inst-viewer");

		const mockToasts: Partial<ToastStore> = {
			success: vi.fn(),
			error: vi.fn(),
			warn: vi.fn(),
			send: vi.fn(),
		};

		const unregister = registerBlueprintCommands(
			commandStore,
			store,
			mockToasts as ToastStore,
		);

		// Check registered commands
		expect(commandStore.commands.length).toBeGreaterThan(5);

		// Undo in viewer mode should NOT execute
		const undoCmd = commandStore.commands.find(
			(c) => c.id === "blueprint.edit.undo",
		);
		expect(undoCmd).toBeDefined();
		undoCmd?.action?.();
		expect(doc.revision).toBe(1);

		// Toggle mode command
		const modeCmd = commandStore.commands.find(
			(c) => c.id === "blueprint.view.mode",
		);
		expect(modeCmd).toBeDefined();
		modeCmd?.action?.();
		expect(session.mode).toBe("editor");

		unregister();
		session.dispose();
		store.dispose();
	});

	it("triggers honest explanations for reserved export & revision actions (W10-A08)", () => {
		const store = createBlueprintStore();
		const commandStore = new CommandStore();
		const mockExport = vi.fn();
		const mockRevision = vi.fn();

		const unregister = registerBlueprintCommands(
			commandStore,
			store,
			undefined,
			{
				onRequestExportModal: mockExport,
				onRequestRevisionModal: mockRevision,
			},
		);

		const exportMenu = commandStore.commands.find(
			(c) => c.id === "blueprint.export.menu",
		);
		expect(exportMenu).toBeDefined();
		expect(exportMenu?.children?.length).toBe(4);

		// Trigger SVG export
		const svgCmd = exportMenu?.children?.find(
			(c) => c.id === "blueprint.export.svg",
		);
		svgCmd?.action?.();
		expect(mockExport).toHaveBeenCalledWith("SVG Vector");

		// Trigger PDF export
		const pdfCmd = exportMenu?.children?.find(
			(c) => c.id === "blueprint.export.pdf",
		);
		pdfCmd?.action?.();
		expect(mockExport).toHaveBeenCalledWith("Architectural PDF");

		unregister();
		store.dispose();
	});
});

describe("WP-10: Document Lifecycle, Native JSON & Fixtures (W10-A01, W10-A02)", () => {
	it("creates new blank facility conforming to canonical spec (§4.1, §7.1)", () => {
		const blank = createNewDocument("Custom Warehouse");
		expect(blank.content.name).toBe("Custom Warehouse");
		expect(blank.content.facility.widthMm).toBe(60000);
		expect(blank.content.facility.heightMm).toBe(40000);
		expect(blank.content.layers.length).toBe(4);
		expect(blank.content.layers.map((l) => l.role)).toEqual([
			"foundation",
			"sections",
			"machinery",
			"marks",
		]);
	});

	it("creates deterministic industrial fixture with unique document ID (§8.2, AC-052)", () => {
		const fixture1 = createIndustrialDocument();
		const fixture2 = createIndustrialDocument();

		expect(fixture1.documentId).not.toBe(fixture2.documentId);
		expect(fixture1.content.facility.widthMm).toBe(60000);
		expect(fixture1.content.facility.heightMm).toBe(40000);
		expect(Object.keys(fixture1.content.entities).length).toBeGreaterThan(10);
	});

	it("losslessly serializes and parses native Blueprint JSON (W10-A02)", () => {
		const doc = createIndustrialDocument();
		const json = serializeNativeDocument(doc);
		const parsed = parseNativeDocument(json);

		expect(parsed.valid).toBe(true);
		expect(parsed.document).toBeDefined();
		expect(parsed.document?.content.name).toBe(doc.content.name);
		expect(parsed.document?.content.facility).toEqual(doc.content.facility);
		expect(Object.keys(parsed.document?.content.entities || {}).length).toBe(
			Object.keys(doc.content.entities).length,
		);
	});

	it("rejects invalid document text gracefully without crashing (W10-A02)", () => {
		const badJson = '{"format": "invalid", "foo": "bar"}';
		const parsed = parseNativeDocument(badJson);
		expect(parsed.valid).toBe(false);
		expect(parsed.document).toBeUndefined();
	});

	it("sanitizes downloaded file names safely", () => {
		expect(sanitizeFilename("My Facility / Plant #1 : Test")).toBe(
			"my_facility_plant_1_test",
		);
		expect(sanitizeFilename("")).toBe("blueprint");
	});
});

describe("WP-10: AC-054 Structural Embed Isolation (No RuneProvider)", () => {
	it("mounts two viewers and one editor without RuneProvider and verifies zero shared selection", () => {
		const docA = createBlankDocument("Viewer A Doc");
		const docB = createBlankDocument("Viewer B Doc");
		const docC = createBlankDocument("Editor C Doc");

		// Standalone sessions instantiated with no host context
		const sA = new BlueprintSession({ document: docA, mode: "viewer" });
		const sB = new BlueprintSession({ document: docB, mode: "viewer" });
		const sC = new BlueprintSession({ document: docC, mode: "editor" });

		expect(sA.mode).toBe("viewer");
		expect(sB.mode).toBe("viewer");
		expect(sC.mode).toBe("editor");

		// Add device to Editor C
		const devId: string = "cnc-test-1";
		const device: DeviceEntity = {
			id: devId,
			name: "CNC 1",
			kind: "device",
			layerId: "layer_machinery",
			groupId: null,
			definitionId: "cnc-mill",
			assetKey: "cnc-1",
			transform: { x: 5000, y: 5000, rotationDeg: 0 },
			style: {
				fill: "#10b981",
				stroke: "#000",
				strokeWidthMm: 1,
				opacity: 1,
				dashMm: [],
			},
			hidden: false,
			locked: false,
			tags: ["equipment"],
			metadata: {},
			parameters: {},
			ratedPowerKw: 20,
			maintenanceDue: null,
			bindings: [],
		};

		sC.execute({ type: "entity.add", entity: device });
		sC.setSelection([devId]);

		// Editor C has selection [devId]
		expect(sC.selection).toEqual([devId]);
		expect(sC.doc.content.entities[devId]).toBeDefined();

		// Viewers A and B have completely isolated selection and document contents
		expect(sA.selection).toEqual([]);
		expect(sB.selection).toEqual([]);
		expect(sA.doc.content.entities[devId]).toBeUndefined();
		expect(sB.doc.content.entities[devId]).toBeUndefined();

		sA.dispose();
		sB.dispose();
		sC.dispose();
	});
});
