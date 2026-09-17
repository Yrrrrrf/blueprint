<script lang="ts">
import type { BlueprintSession } from "@sdk/state";
import { BUILTIN_DEFINITIONS, type DeviceDefinition, type Entity, type Layer, type Vec2 } from "@sdk/core";

interface Props {
	session: BlueprintSession | null;
	activeTab?: "layers" | "catalog" | "assets";
	onTabChange?: (tab: "layers" | "catalog" | "assets") => void;
	onRequestKeyboardPlacement?: (defId: string) => void;
}

let {
	session,
	activeTab = "catalog",
	onTabChange,
	onRequestKeyboardPlacement,
}: Props = $props();

const presetRoles = new Set(["foundation", "sections", "machinery", "marks"]);
const definitions = Object.values(BUILTIN_DEFINITIONS);

function computeDefDimensions(def: DeviceDefinition): { width: number; height: number } {
	if (def.nominalWidthMm && def.nominalHeightMm) {
		return { width: def.nominalWidthMm, height: def.nominalHeightMm };
	}
	const xs = def.footprint.outer.map((p) => p.x);
	const ys = def.footprint.outer.map((p) => p.y);
	return {
		width: Math.max(...xs) - Math.min(...xs),
		height: Math.max(...ys) - Math.min(...ys),
	};
}

// Layers state
let newLayerName = $state("");

// Catalog state
let catalogSearch = $state("");
let catalogCategory = $state<string>("all");

// Assets state
let assetSearch = $state("");
let assetLayerFilter = $state<string>("all");

let currentLayers = $derived<readonly Layer[]>(session?.doc.content.layers ?? []);
let currentEntities = $derived<Record<string, Entity>>(session?.doc.content.entities ?? {});
let currentSelection = $derived<readonly string[]>(session?.selection ?? []);
let isViewer = $derived(session?.mode === "viewer");

// Filtered catalog definitions
let filteredDefinitions = $derived(
	definitions.filter((def) => {
		if (catalogCategory !== "all" && def.category !== catalogCategory) {
			return false;
		}
		if (catalogSearch.trim()) {
			const q = catalogSearch.toLowerCase();
			return (
				def.name.toLowerCase().includes(q) ||
				def.id.toLowerCase().includes(q) ||
				def.category.toLowerCase().includes(q)
			);
		}
		return true;
	}),
);

// Filtered asset entities
let filteredAssets = $derived(
	Object.values(currentEntities).filter((ent) => {
		if (assetLayerFilter !== "all" && ent.layerId !== assetLayerFilter) {
			return false;
		}
		if (assetSearch.trim()) {
			const q = assetSearch.toLowerCase();
			return (
				ent.name.toLowerCase().includes(q) ||
				ent.id.toLowerCase().includes(q) ||
				ent.kind.toLowerCase().includes(q)
			);
		}
		return true;
	}),
);

function switchTab(tab: "layers" | "catalog" | "assets") {
	onTabChange?.(tab);
}

// Layer operations
function toggleLayerVisibility(layerId: string, current: boolean) {
	session?.execute({
		type: "layer.update",
		id: layerId,
		patch: { visible: !current },
	});
}

function toggleLayerLock(layerId: string, current: boolean) {
	session?.execute({
		type: "layer.update",
		id: layerId,
		patch: { locked: !current },
	});
}

function handleAddLayer() {
	if (!session) return;
	const trimmed = newLayerName.trim();
	const layerTitle = trimmed.length > 0 ? trimmed : `Layer ${currentLayers.length + 1}`;
	newLayerName = "";
	session.execute({
		type: "layer.add",
		layer: { name: layerTitle, role: "custom" },
	});
}

function handleDeleteLayer(layerId: string, role: string) {
	if (presetRoles.has(role) || !session) return;
	session.execute({ type: "layer.delete", id: layerId, mode: "deleteContents" });
}

// Catalog operations
function chooseCatalogDevice(id: string) {
	if (!session || isViewer) return;
	session.setTool("device");
	session.interactionActor.send({
		type: "SET_CATALOG_DEFINITION",
		definitionId: id,
	});
}

function handleDragStart(e: DragEvent, id: string) {
	if (!e.dataTransfer || isViewer) return;
	e.dataTransfer.setData("application/x-blueprint-definition", id);
	e.dataTransfer.effectAllowed = "copy";
}

// Asset operations
function selectAsset(id: string) {
	if (!session) return;
	session.setSelection([id]);
}
</script>

<aside
	class="h-full w-full bg-base-100 border-r border-base-300 flex flex-col text-xs select-none shadow-sm overflow-hidden"
	aria-label="Navigation & Library"
>
	<!-- Tab Bar -->
	<div class="tabs tabs-boxed bg-base-200/80 p-1 m-2 rounded-lg shrink-0" role="tablist">
		<button
			type="button"
			role="tab"
			class="tab tab-xs flex-1 {activeTab === 'catalog' ? 'tab-active font-bold' : ''}"
			aria-selected={activeTab === 'catalog'}
			onclick={() => switchTab('catalog')}
		>
			Catalog
		</button>
		<button
			type="button"
			role="tab"
			class="tab tab-xs flex-1 {activeTab === 'layers' ? 'tab-active font-bold' : ''}"
			aria-selected={activeTab === 'layers'}
			onclick={() => switchTab('layers')}
		>
			Layers ({currentLayers.length})
		</button>
		<button
			type="button"
			role="tab"
			class="tab tab-xs flex-1 {activeTab === 'assets' ? 'tab-active font-bold' : ''}"
			aria-selected={activeTab === 'assets'}
			onclick={() => switchTab('assets')}
		>
			Assets ({Object.keys(currentEntities).length})
		</button>
	</div>

	<!-- TAB 1: CATALOG -->
	{#if activeTab === "catalog"}
		<div class="flex-1 flex flex-col p-2 gap-2 overflow-y-auto">
			<div class="flex items-center gap-1.5">
				<input
					type="text"
					placeholder="Search catalog…"
					class="input input-bordered input-xs flex-1"
					bind:value={catalogSearch}
				/>
				<select
					class="select select-bordered select-xs font-mono"
					bind:value={catalogCategory}
				>
					<option value="all">All</option>
					<option value="machining">Machining</option>
					<option value="robotics">Robotics</option>
					<option value="transport">Transport</option>
					<option value="storage">Storage</option>
					<option value="sensors">Sensors</option>
				</select>
			</div>

			<ul class="flex flex-col gap-2 pt-1 list-none p-0 m-0">
				{#each filteredDefinitions as def}
					{@const dim = computeDefDimensions(def)}

					<li
						class="card bg-base-200/60 p-2.5 rounded-lg border border-base-300 hover:border-primary/60 transition-colors cursor-grab active:cursor-grabbing flex flex-col gap-1.5"
						draggable={!isViewer}
						ondragstart={(e) => handleDragStart(e, def.id)}
					>
						<div class="flex items-start justify-between gap-1">
							<span class="font-bold text-[11px] text-base-content leading-tight">
								{def.name}
							</span>
							<span class="badge badge-xs badge-neutral text-[9px] uppercase font-mono">
								{def.category}
							</span>
						</div>

						<div class="text-[10px] text-base-content/60 font-mono">
							{dim.width} × {dim.height} mm ({def.sizing})
						</div>

						<div class="flex items-center justify-between pt-1 gap-1">
							<span class="text-[9px] text-base-content/40 font-mono truncate max-w-[90px]">
								{def.id}
							</span>

							<div class="flex items-center gap-1">
								<button
									type="button"
									class="btn btn-xs btn-outline btn-primary"
									disabled={isViewer}
									onclick={() => chooseCatalogDevice(def.id)}
									title="Place equipment by canvas click"
								>
									Place
								</button>
								<button
									type="button"
									class="btn btn-xs btn-ghost text-[10px] px-1.5"
									disabled={isViewer}
									onclick={() => onRequestKeyboardPlacement?.(def.id)}
									title="Place numerically by keyboard coordinates"
								>
									⌨ X,Y
								</button>
							</div>
						</div>
					</li>
				{/each}
			</ul>

			{#if filteredDefinitions.length === 0}
				<p class="text-center text-xs text-base-content/40 py-6">
					No equipment matched "{catalogSearch}"
				</p>
			{/if}
		</div>

	<!-- TAB 2: LAYERS -->
	{:else if activeTab === "layers"}
		<div class="flex-1 flex flex-col p-2 gap-2 overflow-y-auto">
			<!-- Add Layer Input -->
			{#if !isViewer}
				<div class="join w-full">
					<input
						type="text"
						placeholder="New layer name…"
						class="input input-xs input-bordered join-item flex-1"
						bind:value={newLayerName}
						onkeydown={(e) => {
							if (e.key === "Enter") handleAddLayer();
						}}
					/>
					<button
						type="button"
						class="btn btn-xs btn-primary join-item"
						onclick={handleAddLayer}
					>
						Add
					</button>
				</div>
			{/if}

			<!-- Layers List -->
			<div class="flex flex-col gap-1.5 pt-1">
				{#each currentLayers as layer}
					{@const isPreset = presetRoles.has(layer.role)}
					<div class="card bg-base-200/50 p-2 rounded-lg border border-base-300 flex flex-col gap-1.5">
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
									class="btn btn-xs btn-square btn-ghost {layer.visible ? 'text-base-content' : 'text-base-content/30'}"
									onclick={() => toggleLayerVisibility(layer.id, layer.visible)}
									title={layer.visible ? "Hide Layer" : "Show Layer"}
									aria-label={layer.visible ? "Hide Layer" : "Show Layer"}
								>
									{layer.visible ? "👁" : "🕶"}
								</button>

								<!-- Lock Toggle -->
								<button
									type="button"
									class="btn btn-xs btn-square btn-ghost {layer.locked ? 'text-warning font-bold' : 'text-base-content/40'}"
									disabled={isViewer}
									onclick={() => toggleLayerLock(layer.id, layer.locked)}
									title={layer.locked ? "Unlock Layer" : "Lock Layer"}
									aria-label={layer.locked ? "Unlock Layer" : "Lock Layer"}
								>
									{layer.locked ? "🔒" : "🔓"}
								</button>

								<!-- Delete Button (Custom Only) -->
								{#if !isPreset && !isViewer}
									<button
										type="button"
										class="btn btn-xs btn-square btn-ghost text-error"
										onclick={() => handleDeleteLayer(layer.id, layer.role)}
										title="Delete Layer"
										aria-label="Delete Layer"
									>
										✕
									</button>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>

	<!-- TAB 3: ASSETS -->
	{:else if activeTab === "assets"}
		<div class="flex-1 flex flex-col p-2 gap-2 overflow-y-auto">
			<div class="flex items-center gap-1.5">
				<input
					type="text"
					placeholder="Search assets…"
					class="input input-bordered input-xs flex-1"
					bind:value={assetSearch}
				/>
				<select
					class="select select-bordered select-xs font-mono"
					bind:value={assetLayerFilter}
				>
					<option value="all">All Layers</option>
					{#each currentLayers as layer}
						<option value={layer.id}>{layer.name}</option>
					{/each}
				</select>
			</div>

			<ul class="flex flex-col gap-1 pt-1 list-none p-0 m-0">
				{#each filteredAssets as ent}
					{@const isSelected = currentSelection.includes(ent.id)}
					<li>
						<button
							type="button"
							class="w-full text-left p-2 rounded-lg border transition-all {isSelected ? 'bg-primary/10 border-primary text-primary font-bold' : 'bg-base-200/40 border-base-300 hover:border-base-content/30'}"
							onclick={() => selectAsset(ent.id)}
						>
							<div class="flex items-center justify-between">
								<span class="truncate text-[11px]">{ent.name}</span>
								<span class="badge badge-xs badge-ghost text-[9px] uppercase font-mono">
									{ent.kind}
								</span>
							</div>
							<div class="flex items-center justify-between text-[10px] text-base-content/50 font-mono mt-0.5">
								<span>({Math.round(ent.transform.x)}, {Math.round(ent.transform.y)})</span>
								<span>{ent.layerId}</span>
							</div>
						</button>
					</li>
				{/each}
			</ul>

			{#if filteredAssets.length === 0}
				<p class="text-center text-xs text-base-content/40 py-6">
					No assets found
				</p>
			{/if}
		</div>
	{/if}
</aside>
