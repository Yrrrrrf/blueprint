<script lang="ts">
import type { BlueprintSession } from "@sdk/state";
import { zoomPercent } from "@sdk/state";

interface Props {
	session: BlueprintSession | null;
	cursorWorld?: { x: number; y: number } | null;
	snapEnabled?: boolean;
	displayUnit?: string;
	isSimulated?: boolean;
	onToggleSnap?: () => void;
}

let {
	session,
	cursorWorld = null,
	snapEnabled = true,
	displayUnit = "mm",
	isSimulated = false,
	onToggleSnap,
}: Props = $props();

let mode = $derived(session?.mode ?? "editor");
let activeTool = $derived(session?.activeTool ?? "select");
let selectionCount = $derived(session?.selection.length ?? 0);
let scale = $derived(session?.renderer?.getCamera().scale ?? 1.0);
let currentZoom = $derived(zoomPercent(scale));
let isDirty = $derived(session?.isDirty ?? false);
let isSaving = $derived(session?.isSaving ?? false);
let saveConflict = $derived(session?.saveConflict ?? false);
</script>

<footer
	class="h-7 bg-base-200 border-t border-base-300 px-3 flex items-center justify-between text-[11px] select-none text-base-content/70 shrink-0 font-mono"
	role="status"
	aria-label="Blueprint Application Status Bar"
>
	<!-- Left: Mode, Tool, Selection -->
	<div class="flex items-center gap-3">
		<span class="badge badge-xs {mode === 'editor' ? 'badge-primary' : 'badge-secondary'} font-bold uppercase">
			{mode}
		</span>

		<span>Tool: <strong class="text-base-content capitalize">{activeTool}</strong></span>

		{#if selectionCount > 0}
			<span class="text-base-content">
				({selectionCount} selected)
			</span>
		{/if}
	</div>

	<!-- Center: Cursor World Coordinates -->
	<div class="flex items-center gap-2">
		{#if cursorWorld}
			<span>
				X: <strong class="text-base-content font-bold">{Math.round(cursorWorld.x).toLocaleString()} {displayUnit}</strong>,
				Y: <strong class="text-base-content font-bold">{Math.round(cursorWorld.y).toLocaleString()} {displayUnit}</strong>
			</span>
		{:else}
			<span class="opacity-40">Facility Canvas</span>
		{/if}
	</div>

	<!-- Right: Snapping, Units, Zoom, Storage & Simulator -->
	<div class="flex items-center gap-3">
		{#if isSimulated}
			<span class="badge badge-xs badge-accent text-[9px] uppercase font-mono">
				SIM ON
			</span>
		{/if}

		<button
			type="button"
			class="btn btn-ghost btn-xs text-[10px] px-1.5 h-5 min-h-0 {snapEnabled ? 'text-primary font-bold' : 'text-base-content/40'}"
			onclick={onToggleSnap}
			title="Toggle Snap to Grid"
		>
			SNAP: {snapEnabled ? "ON" : "OFF"}
		</button>

		<span>Units: <strong class="text-base-content">{displayUnit}</strong></span>
		<span>Zoom: <strong class="text-base-content">{currentZoom}%</strong></span>

		<!-- Storage status indicator -->
		{#if saveConflict}
			<span class="text-error font-bold" title="CAS version conflict in storage">Conflict</span>
		{:else if isSaving}
			<span class="text-info animate-pulse">Saving…</span>
		{:else if isDirty}
			<span class="text-warning" title="Draft has unsaved changes">Unsaved</span>
		{:else}
			<span class="text-success" title="Draft stored durably">Saved</span>
		{/if}
	</div>
</footer>
