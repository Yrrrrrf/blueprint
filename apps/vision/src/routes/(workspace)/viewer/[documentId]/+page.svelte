<script lang="ts">
import { page } from "$app/state";
import { onMount } from "svelte";
import type { BlueprintDocument } from "@sdk/core";
import { getDocumentRepository, readDocumentFromFileInput } from "#lib/blueprint/runtime.ts";
import BlueprintHost from "#lib/blueprint/BlueprintHost.svelte";

let documentId = $derived(page.params.documentId);
let loadedDoc = $state<BlueprintDocument | null>(null);
let notFound = $state(false);
let isLoading = $state(true);
let fileInputEl = $state<HTMLInputElement | null>(null);

let loadGeneration = 0;

$effect(() => {
	const currentId = documentId;
	const currentGen = ++loadGeneration;
	isLoading = true;
	notFound = false;
	loadedDoc = null;

	if (!currentId) {
		isLoading = false;
		notFound = true;
		return;
	}

	const repo = getDocumentRepository();
	repo.load(currentId).then((doc) => {
		if (currentGen !== loadGeneration) return; // Stale generation
		if (doc) {
			loadedDoc = doc;
			notFound = false;
		} else {
			notFound = true;
		}
		isLoading = false;
	}).catch(() => {
		if (currentGen !== loadGeneration) return;
		notFound = true;
		isLoading = false;
	});
});

function handleOpenFile() {
	fileInputEl?.click();
}

async function handleFileSelected(e: Event) {
	try {
		const result = await readDocumentFromFileInput(e);
		if (!result) return;
		loadedDoc = result.doc;
		notFound = false;
	} catch (err) {
		alert(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`);
	}
}
</script>

<svelte:head>
	<title>{loadedDoc ? `${loadedDoc.content.name} — Viewer` : 'Blueprint Viewer'}</title>
</svelte:head>

<input
	bind:this={fileInputEl}
	type="file"
	accept=".json,application/json"
	class="hidden"
	onchange={handleFileSelected}
/>

{#if isLoading}
	<div class="flex flex-col items-center justify-center h-screen w-screen bg-base-100 gap-3">
		<span class="loading loading-spinner loading-lg text-primary"></span>
		<p class="text-xs font-mono text-base-content/60">Loading local document {documentId}…</p>
	</div>
{:else if notFound || !loadedDoc}
	<div class="flex flex-col items-center justify-center h-screen w-screen bg-base-100 p-6 text-center">
		<div class="card bg-base-200 border border-base-300 p-8 max-w-lg rounded-2xl shadow-xl flex flex-col items-center gap-4">
			<span class="text-4xl">🔍</span>
			<h2 class="text-lg font-bold">Document Not Found</h2>
			<div class="badge badge-error font-mono text-xs">{documentId}</div>

			<p class="text-xs text-base-content/70 leading-relaxed">
				No local record matches this identifier.
			</p>
			<div class="alert alert-info text-xs text-left p-3">
				<span>
					<strong>Note on Storage Scope:</strong> Document IDs refer exclusively to this browser's local IndexedDB storage. Viewer URLs are not a remote cloud sharing service and cannot access layouts stored on other devices.
				</span>
			</div>

			<div class="flex flex-wrap gap-2 justify-center mt-2">
				<button type="button" class="btn btn-sm btn-primary" onclick={handleOpenFile}>
					Open Native Blueprint File…
				</button>
				<a href="/" class="btn btn-sm btn-outline">
					Return to Workspace
				</a>
			</div>
		</div>
	</div>
{:else}
	<BlueprintHost initialDoc={loadedDoc} readOnly={true} />
{/if}
