<script lang="ts">
import { getBlueprintStore } from "./context.ts";
import type { DisplayUnit } from "@sdk/core";

let store = getBlueprintStore();
let activeSession = $derived(store.activeSession);
let prefs = $derived(store.preferences);

let draftFacilityName = $state("");
let draftFacilityWidth = $state(60000);
let draftFacilityHeight = $state(40000);

$effect(() => {
	if (activeSession) {
		draftFacilityName = activeSession.doc.content.name;
		draftFacilityWidth = activeSession.doc.content.facility.widthMm;
		draftFacilityHeight = activeSession.doc.content.facility.heightMm;
	}
});

function handleUnitChange(e: Event) {
	const select = e.target as HTMLSelectElement;
	store.updatePreferences({ displayUnit: select.value as DisplayUnit });
}

function handleSnapChange(e: Event) {
	const input = e.target as HTMLInputElement;
	store.updatePreferences({ snapEnabled: input.checked });
}

function handleGridVisibleChange(e: Event) {
	const input = e.target as HTMLInputElement;
	store.updatePreferences({ gridVisible: input.checked });
}

function handleGridSpacingChange(e: Event) {
	const input = e.target as HTMLInputElement;
	const val = Number(input.value);
	if (val > 0 && !isNaN(val)) {
		store.updatePreferences({ gridMinorMm: val });
	}
}

function handleHoverDelayChange(e: Event) {
	const input = e.target as HTMLInputElement;
	const val = Number(input.value);
	if (val >= 0 && !isNaN(val)) {
		store.updatePreferences({ hoverDelayMs: val });
	}
}

function handleReducedMotionChange(e: Event) {
	const input = e.target as HTMLInputElement;
	store.updatePreferences({ reducedMotion: input.checked });
}

function commitFacilityRename() {
	if (!activeSession) return;
	const trimmed = draftFacilityName.trim();
	if (trimmed.length > 0 && trimmed !== activeSession.doc.content.name) {
		activeSession.execute({
			type: "document.rename",
			name: trimmed,
		});
	}
}

function commitFacilityResize() {
	if (!activeSession) return;
	const w = Number(draftFacilityWidth);
	const h = Number(draftFacilityHeight);
	if (w > 0 && h > 0 && !isNaN(w) && !isNaN(h)) {
		activeSession.execute({
			type: "document.settings",
			settings: {
				facility: { widthMm: w, heightMm: h },
			},
		});
	}
}
</script>

<div class="flex flex-col gap-6 p-4 max-w-xl text-sm" role="form" aria-label="Blueprint Settings">
	<div>
		<h3 class="text-base font-bold text-base-content flex items-center gap-2">
			<span>📐</span> Blueprint Workspace Settings
		</h3>
		<p class="text-xs text-base-content/60 mt-1">
			Configure local editor display preferences and active facility parameters.
		</p>
	</div>

	<!-- Personal / View Preferences -->
	<section class="card bg-base-200/50 p-4 border border-base-300 rounded-xl flex flex-col gap-3">
		<h4 class="font-semibold text-xs uppercase tracking-wider text-base-content/80">
			Display Preferences
		</h4>

		<div class="form-control">
			<label for="pref-display-unit" class="label py-1">
				<span class="label-text text-xs font-medium">Display Units</span>
				<span class="label-text-alt text-[10px] text-base-content/50">Canonical data stays mm</span>
			</label>
			<select
				id="pref-display-unit"
				class="select select-bordered select-sm w-full font-mono text-xs"
				value={prefs.displayUnit}
				onchange={handleUnitChange}
			>
				<option value="mm">Millimetres (mm)</option>
				<option value="cm">Centimetres (cm)</option>
				<option value="m">Metres (m)</option>
				<option value="in">Inches (in)</option>
				<option value="ft">Feet (ft)</option>
			</select>
		</div>

		<div class="form-control">
			<label class="label cursor-pointer py-1">
				<span class="label-text text-xs">Snap to Grid & Objects</span>
				<input
					type="checkbox"
					class="toggle toggle-primary toggle-sm"
					checked={prefs.snapEnabled}
					onchange={handleSnapChange}
				/>
			</label>
		</div>

		<div class="form-control">
			<label class="label cursor-pointer py-1">
				<span class="label-text text-xs">Show Facility Grid</span>
				<input
					type="checkbox"
					class="toggle toggle-sm"
					checked={prefs.gridVisible}
					onchange={handleGridVisibleChange}
				/>
			</label>
		</div>

		<div class="form-control">
			<label for="pref-grid-minor" class="label py-1">
				<span class="label-text text-xs font-medium">Grid Minor Interval (mm)</span>
			</label>
			<input
				id="pref-grid-minor"
				type="number"
				class="input input-bordered input-sm font-mono text-xs"
				min="100"
				max="10000"
				step="100"
				value={prefs.gridMinorMm}
				onchange={handleGridSpacingChange}
			/>
		</div>

		<div class="form-control">
			<label for="pref-hover-delay" class="label py-1">
				<span class="label-text text-xs font-medium">Telemetry Hover Card Delay (ms)</span>
			</label>
			<input
				id="pref-hover-delay"
				type="number"
				class="input input-bordered input-sm font-mono text-xs"
				min="50"
				max="2000"
				step="50"
				value={prefs.hoverDelayMs}
				onchange={handleHoverDelayChange}
			/>
		</div>

		<div class="form-control">
			<label class="label cursor-pointer py-1">
				<span class="label-text text-xs">Reduce Animation</span>
				<input
					type="checkbox"
					class="toggle toggle-sm"
					checked={prefs.reducedMotion}
					onchange={handleReducedMotionChange}
				/>
			</label>
		</div>
	</section>

	<!-- Document / Facility Dimensions (If Active Session) -->
	{#if activeSession}
		<section class="card bg-base-200/50 p-4 border border-base-300 rounded-xl flex flex-col gap-3">
			<div class="flex items-center justify-between">
				<h4 class="font-semibold text-xs uppercase tracking-wider text-base-content/80">
					Active Facility Geometry
				</h4>
				<span class="badge badge-xs badge-neutral font-mono">
					rev:{activeSession.doc.revision}
				</span>
			</div>

			<div class="form-control">
				<label for="doc-facility-name" class="label py-1">
					<span class="label-text text-xs font-medium">Facility Name</span>
				</label>
				<div class="join w-full">
					<input
						id="doc-facility-name"
						type="text"
						class="input input-bordered input-sm join-item flex-1 text-xs"
						bind:value={draftFacilityName}
						onkeydown={(e) => {
							if (e.key === "Enter") commitFacilityRename();
						}}
					/>
					<button
						type="button"
						class="btn btn-sm btn-primary join-item"
						onclick={commitFacilityRename}
					>
						Update
					</button>
				</div>
			</div>

			<div class="grid grid-cols-2 gap-3">
				<div class="form-control">
					<label for="doc-facility-width" class="label py-1">
						<span class="label-text text-xs font-medium">Width (mm)</span>
					</label>
					<input
						id="doc-facility-width"
						type="number"
						class="input input-bordered input-sm font-mono text-xs"
						min="1000"
						max="500000"
						step="1000"
						bind:value={draftFacilityWidth}
						onchange={commitFacilityResize}
					/>
				</div>

				<div class="form-control">
					<label for="doc-facility-height" class="label py-1">
						<span class="label-text text-xs font-medium">Height (mm)</span>
					</label>
					<input
						id="doc-facility-height"
						type="number"
						class="input input-bordered input-sm font-mono text-xs"
						min="1000"
						max="500000"
						step="1000"
						bind:value={draftFacilityHeight}
						onchange={commitFacilityResize}
					/>
				</div>
			</div>
		</section>
	{/if}
</div>
