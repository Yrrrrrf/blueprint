<script lang="ts">
import type { BlueprintSession } from "@sdk/state";

interface Props {
	session: BlueprintSession | null;
}

let { session }: Props = $props();

const tools = [
	{ id: "select", label: "Select", key: "V", icon: "↖", viewerSafe: false },
	{ id: "pan", label: "Pan View", key: "H", icon: "✋", viewerSafe: true },
	{ id: "wall", label: "Wall", key: "W", icon: "🧱", viewerSafe: false },
	{ id: "opening", label: "Opening", key: "O", icon: "🚪", viewerSafe: false },
	{ id: "zone", label: "Zone", key: "Z", icon: "⬡", viewerSafe: false },
	{ id: "device", label: "Device", key: "D", icon: "⚙", viewerSafe: false },
	{ id: "dimension", label: "Dimension", key: "M", icon: "↔", viewerSafe: false },
	{ id: "annotation", label: "Annotation", key: "A", icon: "✎", viewerSafe: false },
] as const;

let activeTool = $derived(session?.activeTool ?? "select");
let isViewer = $derived(session?.mode === "viewer");

function setTool(toolId: string) {
	if (!session) return;
	session.setTool(toolId);
}

function handleFit() {
	session?.renderer?.fit();
}

function zoomBy(factor: number) {
	const renderer = session?.renderer;
	if (!renderer) return;
	const current = renderer.getCamera();
	const nextScale = Math.max(0.005, Math.min(1000, current.scale * factor));
	renderer.setCamera({ ...current, scale: nextScale });
}

function handleZoomIn() {
	zoomBy(1.25);
}

function handleZoomOut() {
	zoomBy(0.8);
}
</script>

<div
	class="h-full w-full bg-base-200/90 border-r border-base-300 p-2 flex flex-col items-center justify-between select-none shadow-sm"
	role="toolbar"
	aria-label="Blueprint Canvas Tools"
>
	<!-- Top Tools Group -->
	<div class="flex flex-col items-center gap-1.5 w-full">
		{#each tools as tool}
			{@const isSelected = activeTool === tool.id}
			{@const isDisabled = isViewer && !tool.viewerSafe}
			<button
				type="button"
				class="btn btn-sm btn-square {isSelected ? 'btn-primary shadow-sm' : 'btn-ghost hover:bg-base-300/60'} {isDisabled ? 'opacity-30 cursor-not-allowed' : ''}"
				disabled={isDisabled}
				onclick={() => setTool(tool.id)}
				title="{tool.label} ({tool.key}){isDisabled ? ' - Disabled in Viewer mode' : ''}"
				aria-label="{tool.label} tool"
				aria-pressed={isSelected}
			>
				<span class="text-sm font-bold" aria-hidden="true">{tool.icon}</span>
			</button>
		{/each}
	</div>

	<!-- Bottom Viewport Controls Group -->
	<div class="flex flex-col items-center gap-1.5 w-full border-t border-base-300/60 pt-2">
		<button
			type="button"
			class="btn btn-xs btn-square btn-ghost hover:bg-base-300/60"
			onclick={handleZoomIn}
			title="Zoom In (+)"
			aria-label="Zoom In"
		>
			<span class="text-sm font-bold">+</span>
		</button>
		<button
			type="button"
			class="btn btn-xs btn-square btn-ghost hover:bg-base-300/60"
			onclick={handleZoomOut}
			title="Zoom Out (-)"
			aria-label="Zoom Out"
		>
			<span class="text-sm font-bold">−</span>
		</button>
		<button
			type="button"
			class="btn btn-xs btn-square btn-ghost hover:bg-base-300/60"
			onclick={handleFit}
			title="Fit Facility (Ctrl+0)"
			aria-label="Fit Facility"
		>
			<span class="text-xs font-mono font-bold">⊡</span>
		</button>
	</div>
</div>
