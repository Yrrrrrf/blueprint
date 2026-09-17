<script lang="ts">
	import type { DeviceDefinition, Vec2 } from "@sdk/core";
	import { BUILTIN_DEFINITIONS } from "@sdk/core";
	import type { BlueprintSession } from "@sdk/state";

	interface Props {
		session: BlueprintSession;
		onSelectDefinition?: (defId: string) => void;
	}

	let { session, onSelectDefinition }: Props = $props();

	const definitions = Object.values(BUILTIN_DEFINITIONS);

	function chooseDevice(id: string) {
		session.setTool("device");
		session.interactionActor.send({
			type: "SET_CATALOG_DEFINITION",
			definitionId: id,
		});
		onSelectDefinition?.(id);
	}

	function handleDragStart(e: DragEvent, id: string) {
		if (!e.dataTransfer) return;
		e.dataTransfer.setData("application/x-blueprint-definition", id);
		e.dataTransfer.effectAllowed = "copy";
	}
</script>

<div
	class="w-64 bg-base-100 border-r border-base-300 p-3 flex flex-col gap-2.5 text-xs select-none overflow-y-auto shrink-0 shadow-sm"
	aria-label="Equipment Catalog"
>
	<div class="flex items-center justify-between pb-1 border-b border-base-300">
		<h2 class="font-semibold text-sm uppercase tracking-wider text-base-content/80">Catalog</h2>
		<span class="badge badge-sm badge-ghost font-mono">{definitions.length} items</span>
	</div>

	<p class="text-[11px] text-base-content/60">
		Select an equipment template or drag it directly onto the canvas to place it.
	</p>

	<div class="flex flex-col gap-2 pt-1" role="list">
		{#each definitions as def}
			{@const outer = def.footprint.outer}
			{@const minX = Math.min(...outer.map((p: Vec2) => p.x))}
			{@const maxX = Math.max(...outer.map((p: Vec2) => p.x))}
			{@const minY = Math.min(...outer.map((p: Vec2) => p.y))}
			{@const maxY = Math.max(...outer.map((p: Vec2) => p.y))}
			{@const width = maxX - minX}
			{@const height = maxY - minY}

			<div
				class="card bg-base-200/50 p-2.5 rounded border border-base-300/60 hover:border-primary/50 transition-colors cursor-grab active:cursor-grabbing flex flex-col gap-1.5"
				draggable="true"
				role="listitem"
				aria-label={def.name}
				ondragstart={(e) => handleDragStart(e, def.id)}
			>
				<div class="flex items-start justify-between gap-1">
					<div class="font-semibold text-[11px] text-base-content/90 leading-tight">
						{def.name}
					</div>
					<span class="badge badge-xs badge-neutral text-[9px] uppercase font-mono">
						{def.category}
					</span>
				</div>

				<div class="text-[10px] text-base-content/60 font-mono">
					{width} × {height} mm ({def.sizing})
				</div>

				<div class="flex items-center justify-between pt-1">
					<span class="text-[9px] text-base-content/40 font-mono truncate max-w-[120px]">
						{def.id}
					</span>
					<button
						type="button"
						class="btn btn-xs btn-outline btn-primary"
						onclick={() => chooseDevice(def.id)}
					>
						Place (D)
					</button>
				</div>
			</div>
		{/each}
	</div>
</div>
