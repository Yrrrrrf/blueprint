<script lang="ts">
	import { zoomPercent } from "@sdk/state";
	import type { BlueprintSession } from "@sdk/state";

	interface Props {
		session: BlueprintSession;
		cursorWorld?: { x: number; y: number } | null;
		snapEnabled?: boolean;
		onToggleSnap?: () => void;
	}

	let {
		session,
		cursorWorld = null,
		snapEnabled = true,
		onToggleSnap,
	}: Props = $props();

	let scale = $derived(session.renderer?.getCamera().scale ?? 1.0);
	let currentZoom = $derived(zoomPercent(scale));
	let mode = $derived(session.mode);
	let activeTool = $derived(session.activeTool);
	let selectionCount = $derived(session.selection.length);

	function toggleMode() {
		session.setMode(mode === "editor" ? "viewer" : "editor");
	}
</script>

<footer
	class="h-7 bg-base-200 border-t border-base-300 px-3 flex items-center justify-between text-[11px] select-none text-base-content/70 shrink-0 font-mono"
	role="status"
	aria-label="Blueprint Status Bar"
>
	<!-- Left section: Mode, Tool, Selection -->
	<div class="flex items-center gap-3">
		<button
			type="button"
			class="badge badge-sm {mode === 'editor' ? 'badge-primary' : 'badge-secondary'} font-semibold cursor-pointer"
			onclick={toggleMode}
			title="Click to toggle mode"
		>
			{mode.toUpperCase()}
		</button>

		<span class="capitalize">Tool: <strong class="text-base-content">{activeTool}</strong></span>

		{#if selectionCount > 0}
			<span class="text-base-content/80">
				({selectionCount} selected)
			</span>
		{/if}
	</div>

	<!-- Center section: Cursor Coordinates -->
	<div class="flex items-center gap-2">
		{#if cursorWorld}
			<span>
				X: <strong class="text-base-content">{Math.round(cursorWorld.x).toLocaleString()} mm</strong>,
				Y: <strong class="text-base-content">{Math.round(cursorWorld.y).toLocaleString()} mm</strong>
			</span>
		{:else}
			<span class="text-base-content/40">Canvas Area</span>
		{/if}
	</div>

	<!-- Right section: Snapping & Zoom -->
	<div class="flex items-center gap-3">
		<button
			type="button"
			class="btn btn-ghost btn-xs text-[10px] px-1.5 h-5 min-h-0 {snapEnabled ? 'text-primary font-semibold' : 'text-base-content/40'}"
			onclick={onToggleSnap}
			title="Toggle Snapping"
		>
			SNAP: {snapEnabled ? "ON" : "OFF"}
		</button>

		<span>Zoom: <strong class="text-base-content">{currentZoom}%</strong></span>
	</div>
</footer>
