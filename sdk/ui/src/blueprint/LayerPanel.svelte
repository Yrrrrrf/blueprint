<script lang="ts">
	import type { BlueprintSession } from "@sdk/state";

	interface Props {
		session: BlueprintSession;
	}

	let { session }: Props = $props();

	const presetRoles = new Set(["foundation", "sections", "machinery", "marks"]);

	let newLayerName = $state("");

	function toggleVisibility(layerId: string, current: boolean) {
		session.execute({
			type: "layer.update",
			id: layerId,
			patch: { visible: !current },
		});
	}

	function toggleLock(layerId: string, current: boolean) {
		session.execute({
			type: "layer.update",
			id: layerId,
			patch: { locked: !current },
		});
	}

	function handleOpacityChange(layerId: string, opacity: number) {
		session.execute({
			type: "layer.update",
			id: layerId,
			patch: { opacity },
		});
	}

	function handleAddLayer() {
		const name = newLayerName.trim() || `Layer ${session.doc.content.layers.length + 1}`;
		session.execute({
			type: "layer.add",
			layer: {
				name,
				role: "custom",
			},
		});
		newLayerName = "";
	}

	function handleDeleteLayer(layerId: string, role: string) {
		if (presetRoles.has(role)) return; // Protected (§5.1, WP-04)
		session.execute({
			type: "layer.delete",
			id: layerId,
			mode: "deleteContents",
		});
	}
</script>

<div
	class="w-64 bg-base-100 border-r border-base-300 p-3 flex flex-col gap-2.5 text-xs select-none overflow-y-auto shrink-0 shadow-sm"
	aria-label="Layer Management"
>
	<div class="flex items-center justify-between pb-1 border-b border-base-300">
		<h2 class="font-semibold text-sm uppercase tracking-wider text-base-content/80">Layers</h2>
		<span class="badge badge-sm badge-ghost font-mono">{session.doc.content.layers.length}</span>
	</div>

	<!-- Add layer input -->
	<div class="join w-full">
		<input
			type="text"
			placeholder="New layer name..."
			class="input input-xs input-bordered join-item flex-1"
			bind:value={newLayerName}
			onkeydown={(e) => {
				e.stopPropagation();
				if (e.key === "Enter") handleAddLayer();
			}}
		/>
		<button
			type="button"
			class="btn btn-xs btn-primary join-item"
			onclick={handleAddLayer}
			aria-label="Add layer"
		>
			Add
		</button>
	</div>

	<!-- Layer List -->
	<div class="flex flex-col gap-1.5 pt-1">
		{#each session.doc.content.layers as layer}
			{@const isPreset = presetRoles.has(layer.role)}
			<div class="card bg-base-200/50 p-2 rounded flex flex-col gap-1.5 border border-base-300/50 hover:border-base-300 transition-colors">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-1.5 overflow-hidden">
						<span class="font-semibold truncate text-[11px]">{layer.name}</span>
						<span class="badge badge-xs {isPreset ? 'badge-neutral' : 'badge-primary'} font-mono text-[9px]">
							{layer.role}
						</span>
					</div>

					<div class="flex items-center gap-1">
						<!-- Visibility Toggle -->
						<button
							type="button"
							class="btn btn-ghost btn-xs btn-square {layer.visible ? 'text-primary' : 'text-base-content/30'}"
							onclick={() => toggleVisibility(layer.id, layer.visible)}
							title={layer.visible ? "Hide Layer" : "Show Layer"}
							aria-label="Toggle visibility for {layer.name}"
						>
							{layer.visible ? "👁" : "🕶"}
						</button>

						<!-- Lock Toggle -->
						<button
							type="button"
							class="btn btn-ghost btn-xs btn-square {layer.locked ? 'text-error' : 'text-base-content/30'}"
							onclick={() => toggleLock(layer.id, layer.locked)}
							title={layer.locked ? "Unlock Layer" : "Lock Layer"}
							aria-label="Toggle lock for {layer.name}"
						>
							{layer.locked ? "🔒" : "🔓"}
						</button>

						<!-- Delete (only for custom layers) -->
						{#if !isPreset}
							<button
								type="button"
								class="btn btn-ghost btn-xs btn-square text-error hover:bg-error/10"
								onclick={() => handleDeleteLayer(layer.id, layer.role)}
								title="Delete Custom Layer"
								aria-label="Delete {layer.name}"
							>
								✕
							</button>
						{/if}
					</div>
				</div>

				<!-- Opacity Slider -->
				<div class="flex items-center gap-2 pt-0.5">
					<span class="text-[9px] text-base-content/50 w-8">Opacity</span>
					<input
						type="range"
						min="0"
						max="1"
						step="0.05"
						class="range range-xs range-primary flex-1"
						value={layer.opacity}
						oninput={(e) => handleOpacityChange(layer.id, Number((e.target as HTMLInputElement).value))}
					/>
					<span class="text-[9px] font-mono text-base-content/70 w-6 text-right">
						{Math.round(layer.opacity * 100)}%
					</span>
				</div>
			</div>
		{/each}
	</div>
</div>
