<script lang="ts">
	import type { DeviceEntity, DimensionEntity, Entity, Id } from "@sdk/core";
	import { canResizeSelection, canRotateSelection } from "@sdk/state";
	import type { BlueprintSession } from "@sdk/state";

	interface Props {
		session: BlueprintSession;
		selectedIds?: readonly Id[];
	}

	let { session, selectedIds = [] }: Props = $props();

	// Resolve selected entities
	let selectedEntities = $derived.by(() => {
		const doc = session.doc;
		return selectedIds
			.map((id) => doc.content.entities[id])
			.filter((e): e is Entity => e !== undefined);
	});

	let singleEntity = $derived(
		selectedEntities.length === 1 ? selectedEntities[0] : null,
	);
	let resizePolicy = $derived(canResizeSelection(selectedEntities));
	let rotatePolicy = $derived(canRotateSelection(selectedEntities));

	// Local drafts for immediate local edit with Enter/blur commit and Escape revert (AC-040)
	let draftName = $state("");
	let draftX = $state(0);
	let draftY = $state(0);
	let draftRotation = $state(0);
	let draftLayerId = $state("");
	let draftFill = $state("");
	let draftStroke = $state("");

	// Parametric rack / conveyor drafts
	let draftBays = $state(4);
	let draftLevels = $state(3);
	let draftLengthMm = $state(6000);
	let draftWidthMm = $state(1000);
	let draftSpeedMps = $state(0.5);

	// Dimension / Annotation drafts
	let draftOffsetMm = $state(500);
	let draftText = $state("");

	function syncBaseDrafts(entity: Entity) {
		draftName = entity.name;
		draftX = entity.transform.x;
		draftY = entity.transform.y;
		draftRotation = entity.transform.rotationDeg;
		draftLayerId = entity.layerId;
		draftFill = entity.style.fill ?? "";
		draftStroke = entity.style.stroke ?? "";
	}

	// Sync local drafts when single entity changes
	$effect(() => {
		if (singleEntity) {
			syncBaseDrafts(singleEntity);

			if (singleEntity.kind === "device") {
				const dev = singleEntity as DeviceEntity;
				draftBays = Number(dev.parameters.bays ?? 4);
				draftLevels = Number(dev.parameters.levels ?? 3);
				draftLengthMm = Number(dev.parameters.lengthMm ?? 6000);
				draftWidthMm = Number(dev.parameters.widthMm ?? 1000);
				draftSpeedMps = Number(dev.parameters.speedMps ?? 0.5);
			} else if (singleEntity.kind === "dimension") {
				const dim = singleEntity as DimensionEntity;
				draftOffsetMm = dim.offsetMm;
			} else if (singleEntity.kind === "annotation") {
				draftText = (singleEntity as any).text ?? "";
			}
		}
	});

	function revertAll() {
		if (!singleEntity) return;
		syncBaseDrafts(singleEntity);
	}

	function handleTransformCommit() {
		if (!singleEntity) return;
		const numX = Number(draftX);
		const numY = Number(draftY);
		const numRot = Number(draftRotation);

		if (isNaN(numX) || isNaN(numY) || isNaN(numRot)) {
			revertAll();
			return;
		}

		const deltaX = numX - singleEntity.transform.x;
		const deltaY = numY - singleEntity.transform.y;

		if (deltaX !== 0 || deltaY !== 0) {
			session.execute({
				type: "selection.transform",
				ids: [singleEntity.id],
				delta: { x: deltaX, y: deltaY },
			});
		}

		if (numRot !== singleEntity.transform.rotationDeg) {
			session.execute({
				type: "selection.transform",
				ids: [singleEntity.id],
				rotationDeg: numRot,
				pivot: { x: numX, y: numY },
			});
		}
	}

	function handleNameCommit() {
		if (!singleEntity || !draftName.trim()) {
			revertAll();
			return;
		}
		session.execute({
			type: "entity.update",
			id: singleEntity.id,
			patch: { name: draftName.trim() },
		});
	}

	function handleLayerCommit(newLayerId: string) {
		if (!singleEntity) return;
		session.execute({
			type: "entity.update",
			id: singleEntity.id,
			patch: { layerId: newLayerId },
		});
	}

	function handleStyleCommit() {
		if (!singleEntity) return;
		session.execute({
			type: "entity.update",
			id: singleEntity.id,
			patch: {
				style: {
					...singleEntity.style,
					fill: draftFill.trim() ? draftFill.trim() : null,
					stroke: draftStroke.trim() ? draftStroke.trim() : null,
				},
			},
		});
	}

	function handleParametricCommit() {
		if (!singleEntity || singleEntity.kind !== "device") return;
		const dev = singleEntity as DeviceEntity;

		if (dev.definitionId === "def-rack-v1") {
			const bays = Math.max(1, Math.min(20, Math.floor(Number(draftBays))));
			const levels = Math.max(1, Math.min(10, Math.floor(Number(draftLevels))));
			if (isNaN(bays) || isNaN(levels)) {
				revertAll();
				return;
			}
			session.execute({
				type: "entity.update",
				id: dev.id,
				patch: {
					parameters: { ...dev.parameters, bays, levels },
				},
			});
		} else if (dev.definitionId === "def-conveyor-v1") {
			const lengthMm = Math.max(1000, Number(draftLengthMm));
			const widthMm = Math.max(500, Number(draftWidthMm));
			const speedMps = Math.max(0, Number(draftSpeedMps));
			if (isNaN(lengthMm) || isNaN(widthMm) || isNaN(speedMps)) {
				revertAll();
				return;
			}
			session.execute({
				type: "entity.update",
				id: dev.id,
				patch: {
					parameters: {
						...dev.parameters,
						lengthMm,
						widthMm,
						speedMps,
					},
				},
			});
		}
	}

	function handleKeyDown(e: KeyboardEvent, commitFn: () => void) {
		// Stop propagation to prevent canvas global shortcuts (e.g. Delete, arrows) while typing (AC-039)
		e.stopPropagation();

		if (e.key === "Enter") {
			e.preventDefault();
			commitFn();
			(e.target as HTMLElement)?.blur();
		} else if (e.key === "Escape") {
			e.preventDefault();
			revertAll();
			(e.target as HTMLElement)?.blur();
		}
	}
</script>

<aside
	class="w-72 bg-base-100 border-l border-base-300 p-3.5 flex flex-col gap-3 text-xs select-none overflow-y-auto shrink-0 shadow-sm"
	aria-label="Entity Inspector"
>
	<div class="flex items-center justify-between pb-1 border-b border-base-300">
		<h2 class="font-semibold text-sm uppercase tracking-wider text-base-content/80">Inspector</h2>
		<span class="badge badge-sm badge-ghost font-mono">
			{selectedEntities.length} selected
		</span>
	</div>

	{#if selectedEntities.length === 0}
		<div class="py-8 text-center text-base-content/50">
			<p class="text-sm font-medium">No Selection</p>
			<p class="text-[11px] mt-1">Select an object on the canvas to inspect its properties.</p>
			<div class="mt-4 p-2 bg-base-200/50 rounded text-left font-mono text-[10px] space-y-1">
				<div>Facility: 60,000 × 40,000 mm</div>
				<div>Units: Millimetres (mm)</div>
				<div>Layers: {session.doc.content.layers.length} configured</div>
			</div>
		</div>
	{:else if selectedEntities.length > 1}
		<!-- Multi-selection view (§7.3, AC-031) -->
		<div class="flex flex-col gap-2.5">
			<div class="alert alert-warning py-2 px-3 text-[11px] shadow-sm">
				<span class="font-semibold">{resizePolicy.reason ?? "Resize objects individually"}</span>
			</div>

			<div class="card bg-base-200/60 p-2.5 rounded space-y-2">
				<div class="text-[11px] font-semibold text-base-content/70">Multi-Selection Summary</div>
				<div class="text-[11px] text-base-content/80">
					{selectedEntities.length} objects selected across
					{new Set(selectedEntities.map((e) => e.layerId)).size} layer(s).
				</div>
				<div class="flex gap-1.5 pt-1">
					<button
						type="button"
						class="btn btn-xs btn-outline flex-1"
						onclick={() => session.execute({ type: "selection.align", ids: selectedIds, alignment: "center" })}
					>
						Align H
					</button>
					<button
						type="button"
						class="btn btn-xs btn-outline flex-1"
						onclick={() => session.execute({ type: "selection.align", ids: selectedIds, alignment: "middle" })}
					>
						Align V
					</button>
				</div>
			</div>
		</div>
	{:else if singleEntity}
		<!-- Single entity numeric inspector (§7.3, AC-040) -->
		<div class="flex flex-col gap-3">
			<!-- Identity -->
			<div class="form-control gap-1">
				<label class="label py-0 font-medium text-base-content/70" for="prop-name">Name</label>
				<input
					id="prop-name"
					type="text"
					class="input input-sm input-bordered w-full font-mono text-xs"
					bind:value={draftName}
					onblur={handleNameCommit}
					onkeydown={(e) => handleKeyDown(e, handleNameCommit)}
				/>
			</div>

			<!-- Layer -->
			<div class="form-control gap-1">
				<label class="label py-0 font-medium text-base-content/70" for="prop-layer">Layer</label>
				<select
					id="prop-layer"
					class="select select-sm select-bordered w-full text-xs font-mono"
					bind:value={draftLayerId}
					onchange={() => handleLayerCommit(draftLayerId)}
				>
					{#each session.doc.content.layers as layer}
						<option value={layer.id}>{layer.name} ({layer.role})</option>
					{/each}
				</select>
			</div>

			<!-- Transform: X, Y, Rotation -->
			<div class="card bg-base-200/50 p-2.5 rounded space-y-2">
				<div class="text-[11px] font-semibold text-base-content/70 uppercase tracking-wide">Transform</div>
				<div class="grid grid-cols-2 gap-2">
					<div class="form-control">
						<label class="label py-0 text-[10px] text-base-content/60" for="prop-x">X (mm)</label>
						<input
							id="prop-x"
							type="number"
							class="input input-xs input-bordered font-mono"
							bind:value={draftX}
							onblur={handleTransformCommit}
							onkeydown={(e) => handleKeyDown(e, handleTransformCommit)}
						/>
					</div>
					<div class="form-control">
						<label class="label py-0 text-[10px] text-base-content/60" for="prop-y">Y (mm)</label>
						<input
							id="prop-y"
							type="number"
							class="input input-xs input-bordered font-mono"
							bind:value={draftY}
							onblur={handleTransformCommit}
							onkeydown={(e) => handleKeyDown(e, handleTransformCommit)}
						/>
					</div>
				</div>
				<div class="form-control">
					<label class="label py-0 text-[10px] text-base-content/60" for="prop-rot">Rotation (°)</label>
					<input
						id="prop-rot"
						type="number"
						class="input input-xs input-bordered font-mono"
						bind:value={draftRotation}
						onblur={handleTransformCommit}
						onkeydown={(e) => handleKeyDown(e, handleTransformCommit)}
					/>
				</div>
			</div>

			<!-- Device Specific Parameters -->
			{#if singleEntity.kind === "device"}
				{@const dev = singleEntity as DeviceEntity}
				<div class="card bg-base-200/50 p-2.5 rounded space-y-2">
					<div class="text-[11px] font-semibold text-base-content/70 uppercase tracking-wide">Device Specification</div>
					<div class="text-[11px] text-base-content/70">
						<span class="font-medium">Definition:</span> {dev.definitionId}
					</div>
					{#if dev.assetKey}
						<div class="text-[11px] text-base-content/70">
							<span class="font-medium">Asset Key:</span> <span class="font-mono">{dev.assetKey}</span>
						</div>
					{/if}

					{#if dev.definitionId === "def-cnc-v1" || dev.definitionId === "def-robot-v1"}
						<div class="text-[11px] text-info font-medium italic">
							Rigid equipment: dimensions fixed by catalog specification (AC-036).
						</div>
					{:else if dev.definitionId === "def-rack-v1"}
						<div class="grid grid-cols-2 gap-2 pt-1">
							<div class="form-control">
								<label class="label py-0 text-[10px]" for="prop-bays">Bays</label>
								<input
									id="prop-bays"
									type="number"
									min="1"
									max="20"
									class="input input-xs input-bordered font-mono"
									bind:value={draftBays}
									onblur={handleParametricCommit}
									onkeydown={(e) => handleKeyDown(e, handleParametricCommit)}
								/>
							</div>
							<div class="form-control">
								<label class="label py-0 text-[10px]" for="prop-levels">Levels</label>
								<input
									id="prop-levels"
									type="number"
									min="1"
									max="10"
									class="input input-xs input-bordered font-mono"
									bind:value={draftLevels}
									onblur={handleParametricCommit}
									onkeydown={(e) => handleKeyDown(e, handleParametricCommit)}
								/>
							</div>
						</div>
					{:else if dev.definitionId === "def-conveyor-v1"}
						<div class="space-y-1.5 pt-1">
							<div class="form-control">
								<label class="label py-0 text-[10px]" for="prop-length">Length (mm)</label>
								<input
									id="prop-length"
									type="number"
									step="100"
									class="input input-xs input-bordered font-mono"
									bind:value={draftLengthMm}
									onblur={handleParametricCommit}
									onkeydown={(e) => handleKeyDown(e, handleParametricCommit)}
								/>
							</div>
							<div class="form-control">
								<label class="label py-0 text-[10px]" for="prop-speed">Speed (m/s)</label>
								<input
									id="prop-speed"
									type="number"
									step="0.1"
									class="input input-xs input-bordered font-mono"
									bind:value={draftSpeedMps}
									onblur={handleParametricCommit}
									onkeydown={(e) => handleKeyDown(e, handleParametricCommit)}
								/>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Styling: Fill & Stroke -->
			<div class="card bg-base-200/50 p-2.5 rounded space-y-2">
				<div class="text-[11px] font-semibold text-base-content/70 uppercase tracking-wide">Style</div>
				<div class="grid grid-cols-2 gap-2">
					<div class="form-control">
						<label class="label py-0 text-[10px] text-base-content/60" for="prop-fill">Fill (#HEX)</label>
						<input
							id="prop-fill"
							type="text"
							placeholder="none"
							class="input input-xs input-bordered font-mono text-[11px]"
							bind:value={draftFill}
							onblur={handleStyleCommit}
							onkeydown={(e) => handleKeyDown(e, handleStyleCommit)}
						/>
					</div>
					<div class="form-control">
						<label class="label py-0 text-[10px] text-base-content/60" for="prop-stroke">Stroke (#HEX)</label>
						<input
							id="prop-stroke"
							type="text"
							placeholder="none"
							class="input input-xs input-bordered font-mono text-[11px]"
							bind:value={draftStroke}
							onblur={handleStyleCommit}
							onkeydown={(e) => handleKeyDown(e, handleStyleCommit)}
						/>
					</div>
				</div>
			</div>
		</div>
	{/if}
</aside>
