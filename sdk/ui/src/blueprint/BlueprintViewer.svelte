<script lang="ts">
	import { onDestroy } from "svelte";
	import type { Camera } from "@sdk/renderer";
	import { BlueprintSession } from "@sdk/state";
	import type { DeviceEntity, Id } from "@sdk/core";
	import type { AssetTelemetry } from "@sdk/renderer";
	import BlueprintCanvas from "./BlueprintCanvas.svelte";
	import type { BlueprintViewerProps } from "./props.ts";

	let props: BlueprintViewerProps = $props();

	let internalSession: BlueprintSession | null = null;
	function getSession(): BlueprintSession {
		if (props.session) {
			if (props.session.mode !== "viewer") {
				props.session.setMode("viewer");
			}
			return props.session;
		}
		if (!internalSession) {
			internalSession = new BlueprintSession({
				document: props.doc,
				mode: "viewer",
				telemetryPort: props.telemetrySource,
			});
		}
		return internalSession;
	}

	const session = $derived(getSession());

	let inspectedDevice = $state<{
		entity: DeviceEntity;
		telemetry?: AssetTelemetry;
	} | null>(null);

	let selectedId = $state<Id | null>(null);

	$effect(() => {
		selectedId = props.selectedAssetId ?? null;
	});

	$effect(() => {
		const s = session;
		return s.subscribe((updated) => {
			const targetId =
				updated.hover ??
				(updated.selection.length > 0 ? updated.selection[0] : null);
			if (targetId) {
				const info = updated.getInspectedDevice(targetId);
				if (info) {
					inspectedDevice = info;
				}
			} else {
				inspectedDevice = null;
			}
		});
	});

	onDestroy(() => {
		if (!props.session) {
			internalSession?.dispose();
		}
	});

	function handleSelection(ids: readonly Id[]) {
		if (props.inspectable === false) return;
		selectedId = ids.length > 0 ? ids[0] : null;
		if (selectedId) {
			const info = session.getInspectedDevice(selectedId);
			if (info) {
				inspectedDevice = info;
				props.onSelectAsset?.({
					documentId: session.doc.documentId,
					entityId: selectedId,
					assetKey: info.entity.assetKey,
				});
			}
		}
	}
</script>

<div class="flex flex-col w-full h-full bg-base-100 text-base-content relative {props.class ?? ''}">
	<!-- Read-Only Banner -->
	<header class="flex items-center justify-between px-3 py-1.5 border-b border-base-300 bg-base-200 text-xs">
		<div class="flex items-center gap-2">
			<span class="badge badge-info badge-sm">VIEWER MODE</span>
			<span class="font-medium">{session.doc.content.name}</span>
			<span class="text-base-content/60">Rev {session.doc.revision}</span>
		</div>
		<div class="flex items-center gap-2">
			{#if props.telemetrySource}
				<span class="badge badge-success badge-xs">Telemetry Connected</span>
			{:else}
				<span class="badge badge-ghost badge-xs">No Telemetry</span>
			{/if}
			<button
				type="button"
				class="btn btn-xs btn-outline btn-primary ml-2"
				onclick={() => session.setMode("editor")}
			>
				Switch to Editor
			</button>
		</div>
	</header>

	<!-- Canvas Center -->
	<main class="flex-1 relative overflow-hidden">
		<BlueprintCanvas
			{session}
			onSelect={handleSelection}
			onCameraChange={props.onViewportChange}
		/>

		<!-- Inspected Device Floating Card -->
		{#if inspectedDevice}
			<div class="absolute top-4 right-4 z-20 w-80 p-4 rounded-box shadow-xl bg-base-100/95 backdrop-blur border border-base-300 transition-all">
				<div class="flex items-center justify-between mb-2">
					<h3 class="font-bold text-sm truncate">{inspectedDevice.entity.name}</h3>
					<span
						class="badge badge-sm uppercase font-mono {inspectedDevice.telemetry?.status === 'running'
							? 'badge-success'
							: inspectedDevice.telemetry?.status === 'maintenance'
								? 'badge-warning'
								: inspectedDevice.telemetry?.status === 'offline'
									? 'badge-error'
									: 'badge-ghost'}"
					>
						{inspectedDevice.telemetry?.status ?? "unknown"}
					</span>
				</div>

				<div class="text-xs text-base-content/70 space-y-1 mb-3">
					<div>Asset Key: <code class="text-xs bg-base-200 px-1 rounded">{inspectedDevice.entity.assetKey}</code></div>
					<div>Definition: <span class="font-mono text-xs">{inspectedDevice.entity.definitionId}</span></div>
				</div>

				{#if inspectedDevice.telemetry && Object.keys(inspectedDevice.telemetry.values).length > 0}
					<div class="divider my-1"></div>
					<div class="grid grid-cols-2 gap-2 text-xs">
						{#if inspectedDevice.telemetry.values.loadPct !== undefined}
							<div class="bg-base-200/60 p-2 rounded">
								<span class="text-base-content/60 block text-[10px]">Load</span>
								<strong class="text-sm">{inspectedDevice.telemetry.values.loadPct}%</strong>
							</div>
						{/if}
						{#if inspectedDevice.telemetry.values.temperatureC !== undefined}
							<div class="bg-base-200/60 p-2 rounded">
								<span class="text-base-content/60 block text-[10px]">Temperature</span>
								<strong class="text-sm">{inspectedDevice.telemetry.values.temperatureC} °C</strong>
							</div>
						{/if}
						{#if inspectedDevice.telemetry.values.vibrationMmS !== undefined}
							<div class="bg-base-200/60 p-2 rounded">
								<span class="text-base-content/60 block text-[10px]">Vibration</span>
								<strong class="text-sm">{inspectedDevice.telemetry.values.vibrationMmS} mm/s</strong>
							</div>
						{/if}
						{#if inspectedDevice.telemetry.values.rpm !== undefined}
							<div class="bg-base-200/60 p-2 rounded">
								<span class="text-base-content/60 block text-[10px]">Speed</span>
								<strong class="text-sm">{inspectedDevice.telemetry.values.rpm} RPM</strong>
							</div>
						{/if}
						{#if inspectedDevice.telemetry.values.powerKw !== undefined}
							<div class="bg-base-200/60 p-2 rounded col-span-2">
								<span class="text-base-content/60 block text-[10px]">Power</span>
								<strong class="text-sm">{inspectedDevice.telemetry.values.powerKw} kW</strong>
							</div>
						{/if}
					</div>
				{:else}
					<div class="text-xs text-base-content/50 italic text-center py-2">
						No telemetry readings received
					</div>
				{/if}
			</div>
		{/if}
	</main>
</div>
