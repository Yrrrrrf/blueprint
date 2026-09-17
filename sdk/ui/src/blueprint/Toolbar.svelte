<script lang="ts">
	import type { BlueprintSession } from "@sdk/state";

	interface Props {
		session: BlueprintSession;
		activeTool?: string;
		onToolChange?: (tool: string) => void;
	}

	let { session, activeTool = "select", onToolChange }: Props = $props();

	const tools = [
		{ id: "select", label: "Select", shortcut: "V", icon: "↖" },
		{ id: "pan", label: "Pan", shortcut: "H", icon: "✋" },
		{ id: "wall", label: "Wall", shortcut: "W", icon: "🧱" },
		{ id: "opening", label: "Opening", shortcut: "O", icon: "🚪" },
		{ id: "zone", label: "Zone", shortcut: "Z", icon: "⬡" },
		{ id: "device", label: "Device", shortcut: "D", icon: "⚙" },
		{ id: "dimension", label: "Dimension", shortcut: "M", icon: "↔" },
		{ id: "annotation", label: "Annotation", shortcut: "A", icon: "✎" },
	];

	function selectTool(id: string) {
		session.setTool(id);
		onToolChange?.(id);
	}

	function handleUndo() {
		session.undo();
	}

	function handleRedo() {
		session.redo();
	}

	function handleFit() {
		session.renderer?.fit();
	}

	function handleZoomIn() {
		if (!session.renderer) return;
		const cam = session.renderer.getCamera();
		session.renderer.setCamera({
			...cam,
			scale: Math.min(1000, cam.scale * 1.2),
		});
	}

	function handleZoomOut() {
		if (!session.renderer) return;
		const cam = session.renderer.getCamera();
		session.renderer.setCamera({
			...cam,
			scale: Math.max(0.01, cam.scale / 1.2),
		});
	}
</script>

<div
	class="flex flex-col items-center gap-1.5 p-2 bg-base-100 border-r border-base-300 w-14 shrink-0 select-none shadow-sm"
	role="toolbar"
	aria-label="Blueprint editing tools"
>
	<!-- Primary Tools -->
	{#each tools as tool}
		<button
			type="button"
			class="btn btn-sm btn-square {activeTool === tool.id ? 'btn-primary shadow-sm' : 'btn-ghost hover:bg-base-200'}"
			onclick={() => selectTool(tool.id)}
			title="{tool.label} ({tool.shortcut})"
			aria-label="{tool.label} tool"
			aria-pressed={activeTool === tool.id}
		>
			<span class="text-base" aria-hidden="true">{tool.icon}</span>
		</button>
	{/each}

	<div class="divider my-1 w-full opacity-40"></div>

	<!-- History Actions -->
	<button
		type="button"
		class="btn btn-sm btn-square btn-ghost hover:bg-base-200 disabled:opacity-30"
		onclick={handleUndo}
		disabled={!session.canUndo()}
		title="Undo (Ctrl+Z)"
		aria-label="Undo"
	>
		<span class="text-sm font-bold" aria-hidden="true">↶</span>
	</button>

	<button
		type="button"
		class="btn btn-sm btn-square btn-ghost hover:bg-base-200 disabled:opacity-30"
		onclick={handleRedo}
		disabled={!session.canRedo()}
		title="Redo (Ctrl+Shift+Z)"
		aria-label="Redo"
	>
		<span class="text-sm font-bold" aria-hidden="true">↷</span>
	</button>

	<div class="divider my-1 w-full opacity-40"></div>

	<!-- View Actions -->
	<button
		type="button"
		class="btn btn-sm btn-square btn-ghost hover:bg-base-200"
		onclick={handleFit}
		title="Fit to Viewport (F)"
		aria-label="Fit View"
	>
		<span class="text-xs font-semibold" aria-hidden="true">FIT</span>
	</button>

	<button
		type="button"
		class="btn btn-sm btn-square btn-ghost hover:bg-base-200"
		onclick={handleZoomIn}
		title="Zoom In (+)"
		aria-label="Zoom In"
	>
		<span class="text-base font-bold" aria-hidden="true">+</span>
	</button>

	<button
		type="button"
		class="btn btn-sm btn-square btn-ghost hover:bg-base-200"
		onclick={handleZoomOut}
		title="Zoom Out (-)"
		aria-label="Zoom Out"
	>
		<span class="text-base font-bold" aria-hidden="true">−</span>
	</button>
</div>
