<script lang="ts">
import type { BlueprintSession } from "@sdk/state";
import { downloadNativeDocument } from "../runtime.ts";
import { ThemeSelector } from "rune-lab/layout";
import { LanguageSelector } from "rune-lab/i18n";

interface Props {
	session: BlueprintSession | null;
	isSimulated?: boolean;
	onNewDocument?: () => void;
	onOpenFilePicker?: () => void;
	onOpenExample?: () => void;
	onOpenCommands?: () => void;
	onOpenSettings?: () => void;
	onRequestExportModal?: (format: string) => void;
}

let {
	session,
	isSimulated = false,
	onNewDocument,
	onOpenFilePicker,
	onOpenExample,
	onOpenCommands,
	onOpenSettings,
	onRequestExportModal,
}: Props = $props();

let isRenaming = $state(false);
let draftName = $state("");

$effect(() => {
	if (session) {
		draftName = session.doc.content.name;
	}
});

let docMode = $derived(session?.mode ?? "editor");
let docRevision = $derived(session?.doc.revision ?? 1);
let canUndo = $derived(session?.canUndo() ?? false);
let canRedo = $derived(session?.canRedo() ?? false);
let isDirty = $derived(session?.isDirty ?? false);
let isSaving = $derived(session?.isSaving ?? false);
let saveConflict = $derived(session?.saveConflict ?? false);

function commitRename() {
	if (!session) return;
	const trimmed = draftName.trim();
	if (trimmed.length > 0 && trimmed !== session.doc.content.name) {
		session.execute({
			type: "document.rename",
			name: trimmed,
		});
	}
	isRenaming = false;
}

function handleRenameKeyDown(e: KeyboardEvent) {
	if (e.key === "Enter") {
		commitRename();
	} else if (e.key === "Escape") {
		if (session) draftName = session.doc.content.name;
		isRenaming = false;
		e.stopPropagation();
	}
}

function toggleMode() {
	if (!session) return;
	session.setMode(docMode === "editor" ? "viewer" : "editor");
}

function handleSave() {
	session?.save();
}

function handleDownload() {
	if (session) {
		downloadNativeDocument(session.doc);
	}
}
</script>

<header
	class="h-13 bg-base-200/90 border-b border-base-300 px-3 flex items-center justify-between gap-2 shrink-0 select-none text-xs backdrop-blur"
	aria-label="Document Header"
>
	<!-- Left Section: Branding & Document Title / Revision / Status -->
	<div class="flex items-center gap-2.5 min-w-0">
		<span class="text-lg leading-none select-none" aria-hidden="true">📐</span>

		<!-- Document Name (Inline Edit) -->
		{#if isRenaming}
			<input
				type="text"
				class="input input-bordered input-xs font-semibold max-w-[200px]"
				bind:value={draftName}
				onblur={commitRename}
				onkeydown={handleRenameKeyDown}
			/>
		{:else}
			<button
				type="button"
				class="font-semibold text-sm text-base-content hover:text-primary transition-colors truncate max-w-[220px] text-left cursor-pointer"
				onclick={() => { if (session && docMode === "editor") isRenaming = true; }}
				title="Click to rename facility"
			>
				{session ? session.doc.content.name : "No Document"}
			</button>
		{/if}

		<!-- Revision & Status Badges -->
		{#if session}
			<span class="badge badge-sm badge-neutral font-mono text-[10px]">
				rev:{docRevision}
			</span>

			{#if saveConflict}
				<span class="badge badge-sm badge-error text-[10px] font-bold">
					Conflict!
				</span>
			{:else if isSaving}
				<span class="badge badge-sm badge-info text-[10px] animate-pulse">
					Saving…
				</span>
			{:else if isDirty}
				<span class="badge badge-sm badge-warning text-[10px]" title="Unsaved changes in draft">
					Draft (Unsaved)
				</span>
			{:else}
				<span class="badge badge-sm badge-success text-[10px] text-success-content" title="Durable in storage">
					Saved
				</span>
			{/if}

			{#if isSimulated}
				<span class="badge badge-sm badge-accent text-[10px] uppercase font-mono" title="Simulated live telemetry">
					Simulated Data
				</span>
			{/if}
		{/if}
	</div>

	<!-- Center Section: Mode Switch & History -->
	<div class="flex items-center gap-2">
		<!-- Editor / Viewer Switch -->
		<div class="join">
			<button
				type="button"
				class="btn btn-xs join-item {docMode === 'editor' ? 'btn-primary font-bold' : 'btn-ghost'}"
				onclick={() => session?.setMode('editor')}
				aria-pressed={docMode === "editor"}
			>
				Editor
			</button>
			<button
				type="button"
				class="btn btn-xs join-item {docMode === 'viewer' ? 'btn-primary font-bold' : 'btn-ghost'}"
				onclick={() => session?.setMode('viewer')}
				aria-pressed={docMode === "viewer"}
			>
				Viewer
			</button>
		</div>

		<div class="divider divider-horizontal my-1 mx-0.5 opacity-30"></div>

		<!-- Undo / Redo -->
		<button
			type="button"
			class="btn btn-xs btn-ghost btn-square"
			disabled={!canUndo || docMode === "viewer"}
			onclick={() => session?.undo()}
			title="Undo (Ctrl+Z)"
			aria-label="Undo"
		>
			<span class="text-sm font-bold">↶</span>
		</button>
		<button
			type="button"
			class="btn btn-xs btn-ghost btn-square"
			disabled={!canRedo || docMode === "viewer"}
			onclick={() => session?.redo()}
			title="Redo (Ctrl+Shift+Z)"
			aria-label="Redo"
		>
			<span class="text-sm font-bold">↷</span>
		</button>
	</div>

	<!-- Right Section: Menus & Triggers -->
	<div class="flex items-center gap-1.5">
		<!-- File Menu Dropdown -->
		<div class="dropdown dropdown-end">
			<button tabindex="0" type="button" class="btn btn-xs btn-ghost">
				File ▾
			</button>
			<ul class="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-box w-52 text-xs z-50 border border-base-300">
				<li><button type="button" onclick={onNewDocument}>📄 New Facility</button></li>
				<li><button type="button" onclick={onOpenExample}>🏭 Open Industrial Example</button></li>
				<li><button type="button" onclick={onOpenFilePicker}>📂 Open Native File (.json)</button></li>
				<li class="divider my-1"></li>
				<li><button type="button" onclick={handleSave} disabled={docMode === "viewer"}>💾 Save Draft (Ctrl+S)</button></li>
				<li><button type="button" onclick={handleDownload}>⬇ Download Blueprint JSON</button></li>
			</ul>
		</div>

		<!-- Export Menu Dropdown (Reserved for WP-13..15) -->
		<div class="dropdown dropdown-end">
			<button tabindex="0" type="button" class="btn btn-xs btn-ghost">
				Export ▾
			</button>
			<ul class="dropdown-content menu p-2 shadow-lg bg-base-100 rounded-box w-52 text-xs z-50 border border-base-300">
				<li><button type="button" onclick={() => onRequestExportModal?.("SVG Vector")}>Vector SVG (WP-13)</button></li>
				<li><button type="button" onclick={() => onRequestExportModal?.("PNG Image")}>Raster PNG (WP-13)</button></li>
				<li><button type="button" onclick={() => onRequestExportModal?.("Architectural PDF")}>Architectural PDF (WP-14)</button></li>
				<li><button type="button" onclick={() => onRequestExportModal?.("PowerPoint Deck")}>Presentation PPTX (WP-15)</button></li>
			</ul>
		</div>

		<div class="divider divider-horizontal my-1 mx-0.5 opacity-30"></div>

		<!-- Command Palette Button -->
		<button
			type="button"
			class="btn btn-xs btn-outline btn-ghost gap-1"
			onclick={onOpenCommands}
			title="Open Command Palette (Ctrl+Space)"
		>
			<span class="text-xs">⌘K</span>
		</button>

		<!-- Settings Button -->
		<button
			type="button"
			class="btn btn-xs btn-ghost btn-square"
			onclick={onOpenSettings}
			title="Open Settings"
			aria-label="Settings"
		>
			⚙
		</button>

		<!-- Theme / Language Dropdowns -->
		<div class="hidden sm:flex items-center gap-1 scale-90 origin-right">
			<ThemeSelector />
		</div>
	</div>
</header>
