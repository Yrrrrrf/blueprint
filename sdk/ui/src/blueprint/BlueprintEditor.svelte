<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import type { Camera } from "@sdk/renderer";
	import { BlueprintSession } from "@sdk/state";
	import BlueprintCanvas from "./BlueprintCanvas.svelte";
	import Toolbar from "./Toolbar.svelte";
	import Inspector from "./Inspector.svelte";
	import LayerPanel from "./LayerPanel.svelte";
	import CatalogPanel from "./CatalogPanel.svelte";
	import StatusBar from "./StatusBar.svelte";
	import type { BlueprintEditorProps } from "./props.ts";

	let props: BlueprintEditorProps = $props();

	let internalSession: BlueprintSession | null = null;
	function getSession(): BlueprintSession {
		if (props.session) return props.session;
		if (!internalSession) {
			internalSession = new BlueprintSession({
				document: props.initialDoc,
				mode: "editor",
				repository: props.repository,
				telemetryPort: props.telemetryPort,
			});
		}
		return internalSession;
	}

	const session = $derived(getSession());

	let currentRevision = $state(0);
	let currentTool = $state("select");
	let selectedIds = $state<readonly string[]>([]);
	let leftTab = $state<"layers" | "catalog" | null>("catalog");
	let cursorWorld = $state<{ x: number; y: number } | null>(null);
	let snapEnabled = $state(true);
	let isSaving = $state(false);

	$effect(() => {
		const s = session;
		currentRevision = s.doc.revision;
		currentTool = s.activeTool;
		selectedIds = s.selection;

		return s.subscribe((updated) => {
			currentRevision = updated.doc.revision;
			currentTool = updated.activeTool;
			selectedIds = updated.selection;
		});
	});

	function handleGlobalKeyDown(e: KeyboardEvent) {
		// Never intercept shortcuts inside text fields (AC-039, §7.4)
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			(e.target as HTMLElement).isContentEditable
		) {
			return;
		}

		session.keyDown({
			key: e.key,
			shiftKey: e.shiftKey,
			altKey: e.altKey,
			ctrlKey: e.ctrlKey,
			metaKey: e.metaKey,
		});
	}

	function handleGlobalKeyUp(e: KeyboardEvent) {
		if (
			e.target instanceof HTMLInputElement ||
			e.target instanceof HTMLTextAreaElement ||
			(e.target as HTMLElement).isContentEditable
		) {
			return;
		}

		session.keyUp({ key: e.key });
	}

	onMount(() => {
		window.addEventListener("keydown", handleGlobalKeyDown);
		window.addEventListener("keyup", handleGlobalKeyUp);
	});

	onDestroy(() => {
		window.removeEventListener("keydown", handleGlobalKeyDown);
		window.removeEventListener("keyup", handleGlobalKeyUp);
		if (!props.session) {
			internalSession?.dispose();
		}
	});

	async function handleSave() {
		if (!session.repository || isSaving) return;
		isSaving = true;
		try {
			await session.save();
		} finally {
			isSaving = false;
		}
	}
</script>

<div class="flex flex-col w-full h-full bg-base-100 text-base-content overflow-hidden {props.class ?? ''}">
	<!-- Top Navigation Bar -->
	<header class="h-10 bg-base-200 border-b border-base-300 px-3 flex items-center justify-between text-xs select-none shrink-0 shadow-sm">
		<div class="flex items-center gap-2">
			<span class="font-bold text-sm tracking-wide text-primary">BLUEPRINT</span>
			<span class="text-base-content/40">|</span>
			<span class="font-medium text-base-content/90 truncate max-w-[200px]">{session.doc.content.name}</span>
			<span class="badge badge-sm badge-ghost font-mono text-[10px]">r{currentRevision}</span>
		</div>

		<!-- Left drawer toggle tabs -->
		<div class="join">
			<button
				type="button"
				class="btn btn-xs join-item {leftTab === 'catalog' ? 'btn-active btn-neutral' : 'btn-ghost'}"
				onclick={() => { leftTab = leftTab === 'catalog' ? null : 'catalog'; }}
				aria-label="Toggle equipment catalog"
			>
				Catalog
			</button>
			<button
				type="button"
				class="btn btn-xs join-item {leftTab === 'layers' ? 'btn-active btn-neutral' : 'btn-ghost'}"
				onclick={() => { leftTab = leftTab === 'layers' ? null : 'layers'; }}
				aria-label="Toggle layers panel"
			>
				Layers
			</button>
		</div>

		<!-- Actions: Save, Mode Switch -->
		<div class="flex items-center gap-2">
			{#if session.repository}
				<button
					type="button"
					class="btn btn-xs btn-outline {isSaving ? 'loading' : ''}"
					onclick={handleSave}
					disabled={isSaving}
					title="Save Draft (Ctrl+S)"
				>
					Save
				</button>
			{/if}

			<button
				type="button"
				class="btn btn-xs btn-primary"
				onclick={() => session.setMode("viewer")}
				title="Switch to Viewer (Read-Only)"
			>
				Preview
			</button>
		</div>
	</header>

	<!-- Main Workspace Area -->
	<div class="flex-1 flex overflow-hidden relative">
		<!-- Left Strip: Toolbar -->
		<Toolbar
			{session}
			activeTool={currentTool}
			onToolChange={(t) => { currentTool = t; }}
		/>

		<!-- Collapsible Left Drawer: Catalog or Layers -->
		{#if leftTab === "catalog"}
			<CatalogPanel {session} />
		{:else if leftTab === "layers"}
			<LayerPanel {session} />
		{/if}

		<!-- Center Canvas -->
		<main class="flex-1 relative overflow-hidden bg-base-300/20">
			<BlueprintCanvas
				{session}
				onCursorMove={(pt) => { cursorWorld = pt; }}
				onCameraChange={props.onCameraChange}
			/>
		</main>

		<!-- Right Sidebar: Inspector -->
		<Inspector
			{session}
			{selectedIds}
		/>
	</div>

	<!-- Bottom Status Bar -->
	<StatusBar
		{session}
		{cursorWorld}
		{snapEnabled}
		onToggleSnap={() => { snapEnabled = !snapEnabled; }}
	/>
</div>
