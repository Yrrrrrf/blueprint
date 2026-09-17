// ============================================================================
// Blueprint Global Commands & Shortcuts Registry (§5, §9, AC-039, AC-058)
// Integrates with Rune Lab CommandStore and ShortcutStore.
// Protects native text inputs and routes to active Blueprint session.
// ============================================================================

import type { Command, CommandStore, ToastStore } from "rune-lab/palettes";
import type { BlueprintStore } from "./types.ts";
import { downloadNativeDocument } from "./runtime.ts";

/**
 * Checks whether the active keyboard/pointer event originates inside an editable text element.
 * Protects native text undo/redo, copy/paste, and selection behavior (AC-039, W10-A04).
 */
export function isEditableTarget(e?: Event | KeyboardEvent | null): boolean {
	if (!e) {
		if (typeof document !== "undefined" && document.activeElement) {
			const el = document.activeElement;
			const tag = (el as any).tagName;
			return (
				tag === "INPUT" ||
				tag === "TEXTAREA" ||
				(typeof HTMLInputElement !== "undefined" &&
					el instanceof HTMLInputElement) ||
				(typeof HTMLTextAreaElement !== "undefined" &&
					el instanceof HTMLTextAreaElement) ||
				(el as HTMLElement).isContentEditable ||
				el.getAttribute("contenteditable") === "true"
			);
		}
		return false;
	}

	const target = (e.composedPath ? e.composedPath()[0] : e.target) as any;
	if (!target) return false;

	const tag = target.tagName;
	return (
		tag === "INPUT" ||
		tag === "TEXTAREA" ||
		(typeof HTMLInputElement !== "undefined" &&
			target instanceof HTMLInputElement) ||
		(typeof HTMLTextAreaElement !== "undefined" &&
			target instanceof HTMLTextAreaElement) ||
		target.isContentEditable === true ||
		target.getAttribute?.("contenteditable") === "true"
	);
}

export interface CommandCallbacks {
	onNewDocument?: () => void;
	onOpenFilePicker?: () => void;
	onOpenExample?: () => void;
	onRequestExportModal?: (format: string) => void;
	onRequestRevisionModal?: (action: string) => void;
}

/**
 * Creates and registers the full set of Blueprint commands in Rune Lab's CommandStore.
 * Returns an unregister cleanup function.
 */
export function registerBlueprintCommands(
	commandStore: CommandStore,
	blueprintStore: BlueprintStore,
	toasts?: ToastStore,
	callbacks?: CommandCallbacks,
): () => void {
	const cmds: Command[] = [
		// File Commands
		{
			id: "blueprint.file.new",
			label: "New Facility Document",
			category: "File",
			action: () => {
				callbacks?.onNewDocument?.();
			},
		},
		{
			id: "blueprint.file.open",
			label: "Open Native Blueprint File…",
			category: "File",
			action: () => {
				callbacks?.onOpenFilePicker?.();
			},
		},
		{
			id: "blueprint.file.open-example",
			label: "Open Industrial Facility Example",
			category: "File",
			action: () => {
				callbacks?.onOpenExample?.();
			},
		},
		{
			id: "blueprint.file.save",
			label: "Save Document",
			category: "File",
			action: async () => {
				const session = blueprintStore.activeSession;
				if (!session) {
					toasts?.warn("No active Blueprint document to save");
					return;
				}
				if (session.mode === "viewer") {
					toasts?.send(
						"Document is currently in read-only Viewer mode",
						"info",
					);
					return;
				}
				try {
					await session.save();
					toasts?.success("Document draft saved successfully");
				} catch (err) {
					toasts?.error(
						`Save failed: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			},
		},
		{
			id: "blueprint.file.download",
			label: "Download Blueprint JSON",
			category: "File",
			action: () => {
				const session = blueprintStore.activeSession;
				if (!session) {
					toasts?.warn("No active Blueprint document to download");
					return;
				}
				downloadNativeDocument(session.doc);
				toasts?.success("Blueprint JSON downloaded");
			},
		},

		// Edit Commands
		{
			id: "blueprint.edit.undo",
			label: "Undo",
			category: "Edit",
			action: () => {
				const session = blueprintStore.activeSession;
				if (!session || session.mode === "viewer" || !session.canUndo()) return;
				session.undo();
			},
		},
		{
			id: "blueprint.edit.redo",
			label: "Redo",
			category: "Edit",
			action: () => {
				const session = blueprintStore.activeSession;
				if (!session || session.mode === "viewer" || !session.canRedo()) return;
				session.redo();
			},
		},
		{
			id: "blueprint.edit.delete",
			label: "Delete Selected",
			category: "Edit",
			action: () => {
				const session = blueprintStore.activeSession;
				if (
					!session ||
					session.mode === "viewer" ||
					session.selection.length === 0
				)
					return;
				session.execute({
					type: "entity.delete",
					ids: [...session.selection],
				});
			},
		},
		{
			id: "blueprint.edit.duplicate",
			label: "Duplicate Selected",
			category: "Edit",
			action: () => {
				const session = blueprintStore.activeSession;
				if (
					!session ||
					session.mode === "viewer" ||
					session.selection.length === 0
				)
					return;
				session.execute({
					type: "selection.duplicate",
					ids: [...session.selection],
					offsetMm: { x: 500, y: 500 },
				});
			},
		},

		// View Commands
		{
			id: "blueprint.view.fit",
			label: "Fit Facility in Viewport",
			category: "View",
			action: () => {
				const session = blueprintStore.activeSession;
				session?.renderer?.fit();
			},
		},
		{
			id: "blueprint.view.mode",
			label: "Toggle Editor / Viewer Mode",
			category: "View",
			action: () => {
				const session = blueprintStore.activeSession;
				if (!session) return;
				session.setMode(session.mode === "editor" ? "viewer" : "editor");
			},
		},

		// Staged Exports (Honest notification, no fake success - §2, §9)
		{
			id: "blueprint.export.menu",
			label: "Export As…",
			category: "File",
			children: [
				{
					id: "blueprint.export.svg",
					label: "Export SVG Vector (Reserved for WP-13)",
					action: () => {
						callbacks?.onRequestExportModal?.("SVG Vector");
					},
				},
				{
					id: "blueprint.export.png",
					label: "Export PNG Image (Reserved for WP-13)",
					action: () => {
						callbacks?.onRequestExportModal?.("PNG Image");
					},
				},
				{
					id: "blueprint.export.pdf",
					label: "Export Architectural PDF (Reserved for WP-14)",
					action: () => {
						callbacks?.onRequestExportModal?.("Architectural PDF");
					},
				},
				{
					id: "blueprint.export.pptx",
					label: "Export PowerPoint Deck (Reserved for WP-15)",
					action: () => {
						callbacks?.onRequestExportModal?.("PowerPoint Deck");
					},
				},
			],
		},

		// Staged Revisions (Reserved for WP-12)
		{
			id: "blueprint.revision.menu",
			label: "Revisions & Approvals…",
			category: "Revisions",
			children: [
				{
					id: "blueprint.revision.create",
					label: "Create Approval Proposal (Reserved for WP-12)",
					action: () => {
						callbacks?.onRequestRevisionModal?.("Create Proposal");
					},
				},
				{
					id: "blueprint.revision.compare",
					label: "Compare Snapshot Diffs (Reserved for WP-12)",
					action: () => {
						callbacks?.onRequestRevisionModal?.("Compare Diffs");
					},
				},
			],
		},
	];

	for (const cmd of cmds) {
		commandStore.register(cmd);
	}

	return () => {
		for (const cmd of cmds) {
			commandStore.unregister(cmd.id);
		}
	};
}
