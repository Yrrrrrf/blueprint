<script lang="ts">
import type { BlueprintSession } from "@sdk/state";
import {
	runSpatialChecks,
	type DeviceEntity,
	type DimensionEntity,
	type Entity,
	type Id,
	type SpatialIssue,
	type ZoneEntity,
} from "@sdk/core";
import { isEditableTarget } from "../commands.ts";

interface Props {
	session: BlueprintSession | null;
	activeTab?: "inspector" | "operations" | "issues";
	isSimulated?: boolean;
	onTabChange?: (tab: "inspector" | "operations" | "issues") => void;
	onBindSimulator?: () => void;
	onUnbindSimulator?: () => void;
}

let {
	session,
	activeTab = "inspector",
	isSimulated = false,
	onTabChange,
	onBindSimulator,
	onUnbindSimulator,
}: Props = $props();

let isViewer = $derived(session?.mode === "viewer");
let selectedIds = $derived<readonly Id[]>(session?.selection ?? []);
let doc = $derived(session?.doc);

// Selected entities
const selectedEntities = $derived.by<Entity[]>(() => {
	if (!doc || !selectedIds.length) return [];
	const list: Entity[] = [];
	for (const id of selectedIds) {
		const ent = doc.content.entities[id];
		if (ent) list.push(ent);
	}
	return list;
});

let singleEntity = $derived<Entity | null>(
	selectedEntities.length === 1 ? selectedEntities[0] : null,
);

let draftError = $state<string | null>(null);
let draftFill = $state("");
let draftStroke = $state("");
let draftLayerId = $state("");
let draftRotation = $state(0);
let draftY = $state(0);
let draftX = $state(0);
let draftName = $state("");

let draftSpeedMps = $state(0.5);
let draftWidthMm = $state(1000);
let draftLengthMm = $state(6000);
let draftLevels = $state(3);
let draftBays = $state(4);

function syncDraftsFromEntity(ent: Entity) {
	draftName = ent.name;
	draftX = Math.round(ent.transform.x);
	draftY = Math.round(ent.transform.y);
	draftRotation = Math.round(ent.transform.rotationDeg);
	draftLayerId = ent.layerId;
	draftFill = ent.style.fill ?? "";
	draftStroke = ent.style.stroke ?? "";
	draftError = null;

	if (ent.kind === "device") {
		const params = (ent as DeviceEntity).parameters;
		draftSpeedMps = Number(params.speedMps ?? 0.5);
		draftWidthMm = Number(params.widthMm ?? 1000);
		draftLengthMm = Number(params.lengthMm ?? 6000);
		draftLevels = Number(params.levels ?? 3);
		draftBays = Number(params.bays ?? 4);
	}
}

$effect(() => {
	if (singleEntity) {
		syncDraftsFromEntity(singleEntity);
	}
});

function handleCommitName() {
	if (!singleEntity || !session || isViewer) return;
	const trimmed = draftName.trim();
	if (trimmed.length === 0) {
		draftError = "Entity name cannot be empty";
		return;
	}
	draftError = null;
	if (trimmed !== singleEntity.name) {
		session.execute({
			type: "entity.update",
			id: singleEntity.id,
			patch: { name: trimmed },
		});
	}
}

function handleCommitTransform() {
	if (!singleEntity || !session || isViewer) return;
	const nx = Number(draftX);
	const ny = Number(draftY);
	const nr = Number(draftRotation);

	if (isNaN(nx) || isNaN(ny) || isNaN(nr)) {
		syncDraftsFromEntity(singleEntity);
		return;
	}

	const dx = nx - singleEntity.transform.x;
	const dy = ny - singleEntity.transform.y;

	if (dx !== 0 || dy !== 0) {
		session.execute({
			type: "selection.transform",
			ids: [singleEntity.id],
			delta: { x: dx, y: dy },
		});
	}

	if (nr !== singleEntity.transform.rotationDeg) {
		session.execute({
			type: "entity.update",
			id: singleEntity.id,
			patch: {
				transform: {
					...singleEntity.transform,
					rotationDeg: nr,
				},
			},
		});
	}
}

function handleCommitParametric() {
	if (!singleEntity || !session || isViewer || singleEntity.kind !== "device") return;
	session.execute({
		type: "device.parameters",
		id: singleEntity.id,
		parameters: {
			bays: draftBays,
			levels: draftLevels,
			lengthMm: draftLengthMm,
			widthMm: draftWidthMm,
			speedMps: draftSpeedMps,
		},
	});
}

function handleInputKeyDown(e: KeyboardEvent, commitFn: () => void) {
	if (e.key === "Enter") {
		commitFn();
	} else if (e.key === "Escape") {
		if (singleEntity) syncDraftsFromEntity(singleEntity);
		e.stopPropagation();
	}
}

// Multi-selection actions
function handleAlign(alignment: "left" | "center" | "right" | "top" | "middle" | "bottom") {
	if (!session || selectedIds.length < 2 || isViewer) return;
	session.execute({
		type: "selection.align",
		ids: [...selectedIds],
		alignment,
	});
}

function handleDistribute(axis: "horizontal" | "vertical") {
	if (!session || selectedIds.length < 3 || isViewer) return;
	session.execute({
		type: "selection.distribute",
		ids: [...selectedIds],
		axis,
	});
}

function handleDeleteSelected() {
	if (!session || selectedIds.length === 0 || isViewer) return;
	session.execute({
		type: "entity.delete",
		ids: [...selectedIds],
	});
}

// Telemetry & Operations resolution
let inspectedDeviceTelemetry = $derived.by(() => {
	if (!session || !singleEntity || singleEntity.kind !== "device") return null;
	const info = session.getInspectedDevice(singleEntity.id);
	return info;
});

// Power totals
let facilityPower = $derived.by(() => {
	if (!doc) return { ratedKw: 0, liveKw: 0, count: 0 };
	let ratedKw = 0;
	let liveKw = 0;
	let count = 0;

	for (const ent of Object.values(doc.content.entities)) {
		if (ent.kind === "device") {
			const dev = ent as DeviceEntity;
			count++;
			if (dev.ratedPowerKw) ratedKw += dev.ratedPowerKw;
			if (session) {
				const info = session.getInspectedDevice(dev.id);
				if (info?.telemetry?.values?.activePowerKw) {
					liveKw += Number(info.telemetry.values.activePowerKw);
				} else if (dev.ratedPowerKw) {
					liveKw += dev.ratedPowerKw * 0.7; // default estimated
				}
			}
		}
	}
	return { ratedKw: Math.round(ratedKw * 10) / 10, liveKw: Math.round(liveKw * 10) / 10, count };
});

// Issues resolution
let currentIssues = $derived.by<SpatialIssue[]>(() => {
	if (!doc) return [];
	if (session) {
		return session.getSpatialIssues();
	}
	return runSpatialChecks(doc);
});

let areIssuesOutdated = $derived(session?.areSpatialIssuesOutdated ?? false);

function focusIssueEntity(entityId: Id) {
	if (!session) return;
	session.setSelection([entityId]);
}
</script>

<aside
	class="h-full w-full bg-base-100 border-l border-base-300 flex flex-col text-xs select-none shadow-sm overflow-hidden"
	aria-label="Detail Inspector"
>
	<!-- Tab Bar -->
	<div class="tabs tabs-boxed bg-base-200/80 p-1 m-2 rounded-lg shrink-0" role="tablist">
		<button
			type="button"
			role="tab"
			class="tab tab-xs flex-1 {activeTab === 'inspector' ? 'tab-active font-bold' : ''}"
			aria-selected={activeTab === 'inspector'}
			onclick={() => onTabChange?.('inspector')}
		>
			Inspector
		</button>
		<button
			type="button"
			role="tab"
			class="tab tab-xs flex-1 {activeTab === 'operations' ? 'tab-active font-bold' : ''}"
			aria-selected={activeTab === 'operations'}
			onclick={() => onTabChange?.('operations')}
		>
			Operations
		</button>
		<button
			type="button"
			role="tab"
			class="tab tab-xs flex-1 {activeTab === 'issues' ? 'tab-active font-bold' : ''}"
			aria-selected={activeTab === 'issues'}
			onclick={() => onTabChange?.('issues')}
		>
			Issues ({currentIssues.length})
		</button>
	</div>

	<!-- TAB 1: INSPECTOR -->
	{#if activeTab === "inspector"}
		<div class="flex-1 flex flex-col p-3 gap-3 overflow-y-auto">
			{#if singleEntity}
				<!-- Single Entity Properties -->
				<div class="flex items-center justify-between pb-1 border-b border-base-300">
					<div>
						<h3 class="font-bold text-xs uppercase tracking-wider text-base-content/80">
							{singleEntity.kind} Entity
						</h3>
						<span class="text-[10px] text-base-content/50 font-mono">{singleEntity.id}</span>
					</div>
					<span class="badge badge-xs badge-neutral font-mono uppercase text-[9px]">
						{singleEntity.layerId}
					</span>
				</div>

				<!-- Name Field -->
				<div class="form-control">
					<label for="inspector-name" class="label py-0.5">
						<span class="label-text text-[11px] font-medium">Name</span>
					</label>
					<input
						id="inspector-name"
						type="text"
						class="input input-bordered input-xs {draftError ? 'input-error' : ''}"
						disabled={isViewer || singleEntity.locked}
						bind:value={draftName}
						onblur={handleCommitName}
						onkeydown={(e) => handleInputKeyDown(e, handleCommitName)}
					/>
					{#if draftError}
						<span class="text-error text-[10px] mt-0.5">{draftError}</span>
					{/if}
				</div>

				<!-- Coordinates & Rotation -->
				<div class="card bg-base-200/50 p-2.5 rounded-lg border border-base-300 flex flex-col gap-2">
					<h4 class="font-semibold text-[10px] uppercase text-base-content/70">Transform</h4>
					<div class="grid grid-cols-3 gap-2 font-mono">
						<div class="form-control">
							<label for="inspector-x" class="label py-0 text-[10px] text-base-content/60">X (mm)</label>
							<input
								id="inspector-x"
								type="number"
								class="input input-bordered input-xs"
								disabled={isViewer || singleEntity.locked}
								bind:value={draftX}
								onblur={handleCommitTransform}
								onkeydown={(e) => handleInputKeyDown(e, handleCommitTransform)}
							/>
						</div>
						<div class="form-control">
							<label for="inspector-y" class="label py-0 text-[10px] text-base-content/60">Y (mm)</label>
							<input
								id="inspector-y"
								type="number"
								class="input input-bordered input-xs"
								disabled={isViewer || singleEntity.locked}
								bind:value={draftY}
								onblur={handleCommitTransform}
								onkeydown={(e) => handleInputKeyDown(e, handleCommitTransform)}
							/>
						</div>
						<div class="form-control">
							<label for="inspector-rot" class="label py-0 text-[10px] text-base-content/60">Rot (°)</label>
							<input
								id="inspector-rot"
								type="number"
								class="input input-bordered input-xs"
								disabled={isViewer || singleEntity.locked}
								bind:value={draftRotation}
								onblur={handleCommitTransform}
								onkeydown={(e) => handleInputKeyDown(e, handleCommitTransform)}
							/>
						</div>
					</div>
				</div>

				<!-- Parametric Rack / Conveyor Options (If Device) -->
				{#if singleEntity.kind === "device"}
					{@const dev = singleEntity as DeviceEntity}
					<div class="card bg-base-200/50 p-2.5 rounded-lg border border-base-300 flex flex-col gap-2">
						<h4 class="font-semibold text-[10px] uppercase text-base-content/70">
							Equipment Parameters ({dev.definitionId})
						</h4>
						{#if dev.definitionId === "pallet-rack"}
							<div class="grid grid-cols-2 gap-2 font-mono">
								<div class="form-control">
									<label for="param-bays" class="label py-0 text-[10px]">Bays</label>
									<input
										id="param-bays"
										type="number"
										min="1"
										max="20"
										class="input input-bordered input-xs"
										disabled={isViewer || singleEntity.locked}
										bind:value={draftBays}
										onchange={handleCommitParametric}
									/>
								</div>
								<div class="form-control">
									<label for="param-levels" class="label py-0 text-[10px]">Levels</label>
									<input
										id="param-levels"
										type="number"
										min="1"
										max="10"
										class="input input-bordered input-xs"
										disabled={isViewer || singleEntity.locked}
										bind:value={draftLevels}
										onchange={handleCommitParametric}
									/>
								</div>
							</div>
						{:else if dev.definitionId === "roller-conveyor"}
							<div class="grid grid-cols-2 gap-2 font-mono">
								<div class="form-control">
									<label for="param-len" class="label py-0 text-[10px]">Length (mm)</label>
									<input
										id="param-len"
										type="number"
										step="500"
										class="input input-bordered input-xs"
										disabled={isViewer || singleEntity.locked}
										bind:value={draftLengthMm}
										onchange={handleCommitParametric}
									/>
								</div>
								<div class="form-control">
									<label for="param-spd" class="label py-0 text-[10px]">Speed (m/s)</label>
									<input
										id="param-spd"
										type="number"
										step="0.1"
										class="input input-bordered input-xs"
										disabled={isViewer || singleEntity.locked}
										bind:value={draftSpeedMps}
										onchange={handleCommitParametric}
									/>
								</div>
							</div>
						{/if}

						<div class="text-[10px] text-base-content/60 font-mono mt-1">
							Rated: {dev.ratedPowerKw ?? 0} kW · Asset Key: {dev.assetKey}
						</div>
					</div>
				{/if}

			{:else if selectedEntities.length > 1}
				<!-- Multiple Entities Selected -->
				<div class="flex items-center justify-between pb-1 border-b border-base-300">
					<h3 class="font-bold text-xs uppercase tracking-wider text-base-content/80">
						Multiple Selection
					</h3>
					<span class="badge badge-sm badge-info font-mono text-[10px]">
						{selectedEntities.length} entities
					</span>
				</div>

				<div class="flex flex-col gap-2">
					<h4 class="font-semibold text-[10px] uppercase text-base-content/70">Alignment</h4>
					<div class="grid grid-cols-3 gap-1.5">
						<button type="button" class="btn btn-xs btn-outline" disabled={isViewer} onclick={() => handleAlign('left')}>Left</button>
						<button type="button" class="btn btn-xs btn-outline" disabled={isViewer} onclick={() => handleAlign('center')}>Center</button>
						<button type="button" class="btn btn-xs btn-outline" disabled={isViewer} onclick={() => handleAlign('right')}>Right</button>
						<button type="button" class="btn btn-xs btn-outline" disabled={isViewer} onclick={() => handleAlign('top')}>Top</button>
						<button type="button" class="btn btn-xs btn-outline" disabled={isViewer} onclick={() => handleAlign('middle')}>Middle</button>
						<button type="button" class="btn btn-xs btn-outline" disabled={isViewer} onclick={() => handleAlign('bottom')}>Bottom</button>
					</div>

					<h4 class="font-semibold text-[10px] uppercase text-base-content/70 mt-2">Distribution</h4>
					<div class="grid grid-cols-2 gap-1.5">
						<button
							type="button"
							class="btn btn-xs btn-outline"
							disabled={isViewer || selectedEntities.length < 3}
							onclick={() => handleDistribute('horizontal')}
							title="Requires at least 3 entities"
						>
							Horizontal
						</button>
						<button
							type="button"
							class="btn btn-xs btn-outline"
							disabled={isViewer || selectedEntities.length < 3}
							onclick={() => handleDistribute('vertical')}
							title="Requires at least 3 entities"
						>
							Vertical
						</button>
					</div>

					<button
						type="button"
						class="btn btn-xs btn-error btn-outline mt-3"
						disabled={isViewer}
						onclick={handleDeleteSelected}
					>
						Delete All Selected
					</button>
				</div>

			{:else}
				<!-- Empty State: Facility Summary -->
				<div class="flex flex-col gap-3">
					<div class="text-center py-4 border-b border-base-300/50">
						<span class="text-2xl opacity-40">📐</span>
						<p class="text-xs text-base-content/60 mt-1">Select an entity on canvas to inspect</p>
					</div>

					{#if doc}
						<div class="card bg-base-200/50 p-3 rounded-lg border border-base-300 flex flex-col gap-1.5">
							<h4 class="font-semibold text-[10px] uppercase tracking-wider text-base-content/70">
								Facility Overview
							</h4>
							<div class="flex justify-between text-[11px] font-mono">
								<span>Dimensions:</span>
								<strong>{doc.content.facility.widthMm} × {doc.content.facility.heightMm} mm</strong>
							</div>
							<div class="flex justify-between text-[11px] font-mono">
								<span>Area:</span>
								<strong>{Math.round((doc.content.facility.widthMm * doc.content.facility.heightMm) / 1000000)} m²</strong>
							</div>
							<div class="flex justify-between text-[11px] font-mono">
								<span>Total Entities:</span>
								<strong>{Object.keys(doc.content.entities).length}</strong>
							</div>
							<div class="flex justify-between text-[11px] font-mono">
								<span>Layers:</span>
								<strong>{doc.content.layers.length}</strong>
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

	<!-- TAB 2: OPERATIONS -->
	{:else if activeTab === "operations"}
		<div class="flex-1 flex flex-col p-3 gap-3 overflow-y-auto">
			<!-- Telemetry Simulator Status Banner -->
			<div class="card {isSimulated ? 'bg-accent/10 border-accent/40' : 'bg-base-200/50 border-base-300'} p-2.5 rounded-lg border flex flex-col gap-1">
				<div class="flex items-center justify-between">
					<span class="font-bold text-[11px] {isSimulated ? 'text-accent' : 'text-base-content'}">
						{isSimulated ? "⚡ Telemetry Simulator Active" : "No Live Source"}
					</span>
					<span class="badge badge-xs {isSimulated ? 'badge-accent' : 'badge-ghost'} font-mono text-[9px]">
						{isSimulated ? "FNV-1a Sim" : "Offline"}
					</span>
				</div>
				<p class="text-[10px] text-base-content/60 leading-tight">
					{isSimulated
						? "Streaming deterministic telemetry readings for factory machines."
						: "Connect the built-in deterministic simulator to observe real-time telemetry."}
				</p>
				<div class="pt-1 flex gap-2">
					{#if !isSimulated}
						<button type="button" class="btn btn-xs btn-accent btn-outline" onclick={onBindSimulator}>
							Connect Simulator
						</button>
					{:else}
						<button type="button" class="btn btn-xs btn-ghost text-error" onclick={onUnbindSimulator}>
							Disconnect
						</button>
					{/if}
				</div>
			</div>

			<!-- Inspected Device Telemetry -->
			{#if singleEntity && singleEntity.kind === "device"}
				{@const dev = singleEntity as DeviceEntity}
				{@const tel = inspectedDeviceTelemetry?.telemetry}
				<div class="card bg-base-200/50 p-2.5 rounded-lg border border-base-300 flex flex-col gap-2">
					<div class="flex items-center justify-between">
						<span class="font-bold text-xs">{dev.name}</span>
						<span class="badge badge-xs {tel?.status === 'running' ? 'badge-success' : tel?.status === 'maintenance' ? 'badge-warning' : 'badge-error'} font-mono uppercase text-[9px]">
							{tel?.status ?? "unknown"}
						</span>
					</div>

					<div class="text-[10px] text-base-content/60 font-mono">
						Asset: {dev.assetKey} · Due: {dev.maintenanceDue ?? "None"}
					</div>

					<!-- Metrics Table -->
					<div class="overflow-x-auto pt-1">
						<table class="table table-xs font-mono">
							<thead>
								<tr class="text-[9px] opacity-60">
									<th>Metric</th>
									<th>Value</th>
									<th>Quality</th>
								</tr>
							</thead>
							<tbody>
								{#if tel?.values}
									{#each Object.entries(tel.values) as [k, val]}
										<tr>
											<td class="capitalize">{k}</td>
											<td><strong>{val}</strong></td>
											<td><span class="badge badge-xs badge-success text-[8px]">good</span></td>
										</tr>
									{/each}
								{:else}
									<tr>
										<td colspan="3" class="text-center opacity-40 py-2">
											No metrics received yet
										</td>
									</tr>
								{/if}
							</tbody>
						</table>
					</div>
				</div>
			{/if}

			<!-- Facility-wide Power Summary -->
			<div class="card bg-base-200/50 p-2.5 rounded-lg border border-base-300 flex flex-col gap-2">
				<h4 class="font-semibold text-[10px] uppercase text-base-content/70">
					Power & Equipment Totals
				</h4>
				<div class="grid grid-cols-2 gap-2 text-[11px] font-mono">
					<div class="p-2 bg-base-100 rounded border border-base-300/60">
						<div class="text-[9px] text-base-content/50 uppercase">Total Rated</div>
						<div class="font-bold text-base text-primary">{facilityPower.ratedKw} kW</div>
					</div>
					<div class="p-2 bg-base-100 rounded border border-base-300/60">
						<div class="text-[9px] text-base-content/50 uppercase">Live Estimate</div>
						<div class="font-bold text-base text-accent">{facilityPower.liveKw} kW</div>
					</div>
				</div>
				<div class="text-[10px] text-base-content/60 font-mono">
					Tracking {facilityPower.count} machinery assets across facility
				</div>
			</div>
		</div>

	<!-- TAB 3: ISSUES -->
	{:else if activeTab === "issues"}
		<div class="flex-1 flex flex-col p-3 gap-2 overflow-y-auto">
			<div class="flex items-center justify-between pb-1 border-b border-base-300">
				<h3 class="font-bold text-xs uppercase tracking-wider text-base-content/80">
					Design Rule Checks
				</h3>
				<span class="badge badge-sm {areIssuesOutdated ? 'badge-warning' : 'badge-neutral'} font-mono text-[9px]">
					{areIssuesOutdated ? 'Checking…' : 'Current'}
				</span>
			</div>

			<div class="flex flex-col gap-2 pt-1" role="list">
				{#each currentIssues as issue}
					<div
						class="card bg-base-200/60 p-2 rounded-lg border {issue.severity === 'error' ? 'border-error/60 bg-error/5' : issue.severity === 'warning' ? 'border-warning/60 bg-warning/5' : 'border-info/60'} flex flex-col gap-1 text-[11px]"
						role="listitem"
					>
						<div class="flex items-center justify-between gap-1">
							<span class="badge badge-xs {issue.severity === 'error' ? 'badge-error' : issue.severity === 'warning' ? 'badge-warning' : 'badge-info'} font-mono uppercase text-[9px]">
								{issue.severity}
							</span>
							<span class="text-[9px] font-mono text-base-content/50">{issue.code}</span>
						</div>

						<p class="text-base-content text-[11px] leading-tight mt-0.5">
							{issue.message}
						</p>

						{#if issue.entityIds && issue.entityIds.length > 0}
							<div class="flex items-center justify-between pt-1 gap-1">
								<span class="text-[9px] font-mono text-base-content/40 truncate max-w-[120px]">
									{issue.entityIds.join(", ")}
								</span>
								<button
									type="button"
									class="btn btn-xs btn-outline btn-ghost text-[10px] py-0 px-1.5 h-5 min-h-0"
									onclick={() => focusIssueEntity(issue.entityIds[0])}
								>
									Focus
								</button>
							</div>
						{/if}
					</div>
				{/each}

				{#if currentIssues.length === 0}
					<div class="text-center py-8">
						<span class="text-2xl text-success">✓</span>
						<p class="font-semibold text-xs text-success mt-1">0 issues detected</p>
						<p class="text-[10px] text-base-content/50 mt-0.5">Facility satisfies all clearance and containment rules.</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</aside>
