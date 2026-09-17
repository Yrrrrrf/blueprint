<script lang="ts">
import { onDestroy, onMount } from "svelte";
import { page } from "$app/state";
import {
	createBlankDocument,
	type BlueprintDocument,
	type ShapeEntity,
} from "@sdk/core";
import {
	createDocumentRepository,
	IdbDocumentRepository,
	MemoryDocumentRepository,
	StorageQuotaError,
	StorageUnavailableError,
	type DocumentRepository,
	type SaveDraftResult,
} from "@sdk/api";
import { BlueprintSession } from "@sdk/state";

let dbName = $state(page.url.searchParams.get("db") ?? `blueprint_test_${Date.now()}`);
let forceMemory = $state(page.url.searchParams.get("memory") === "true");

let repo: DocumentRepository;
let session: BlueprintSession | null = $state(null);

let docId = $state<string>("");
let docRevision = $state(0);
let storageVersion = $state(1);
let isDirty = $state(false);
let persistenceStatus = $state("idle");
let isDurable = $state(false);
let lastError = $state<string | null>(null);

// Injected failure flags for AC-042 / AC-044
let holdSaveGate: { promise: Promise<void>; resolve: () => void } | null = null;
let shouldFailQuota = false;
let shouldFailUnavailable = false;

class InterceptingRepository implements DocumentRepository {
	public readonly isDurable: boolean;
	private readonly inner: DocumentRepository;
	constructor(inner: DocumentRepository) {
		this.inner = inner;
		this.isDurable = inner.isDurable;
	}

	load(id: string) { return this.inner.load(id); }
	save(doc: BlueprintDocument) { return this.inner.save ? this.inner.save(doc) : Promise.resolve(); }
	create(doc: BlueprintDocument) { return this.inner.create(doc); }
	list() { return this.inner.list(); }
	delete(id: string) { return this.inner.delete(id); }
	listSnapshots(docId: string) { return this.inner.listSnapshots(docId); }
	createSnapshot(docId: string, label: string) { return this.inner.createSnapshot(docId, label); }
	loadSnapshot(snapshotId: string) { return this.inner.loadSnapshot(snapshotId); }
	approveSnapshot(docId: string, snapId: string) { return this.inner.approveSnapshot(docId, snapId); }
	forkProposal(docId: string, snapId: string) { return this.inner.forkProposal(docId, snapId); }

	async saveDraft(doc: BlueprintDocument, expectedStorageVersion: number): Promise<SaveDraftResult> {
		if (shouldFailQuota) {
			shouldFailQuota = false;
			throw new StorageQuotaError("Injected quota exceeded");
		}
		if (shouldFailUnavailable) {
			shouldFailUnavailable = false;
			throw new StorageUnavailableError("Injected storage unavailable");
		}
		if (holdSaveGate) {
			await holdSaveGate.promise;
		}
		return this.inner.saveDraft(doc, expectedStorageVersion);
	}
}

async function init() {
	const baseRepo = createDocumentRepository({
		dbName,
		forceMemory,
	});
	repo = new InterceptingRepository(baseRepo);
	isDurable = repo.isDurable;

	// Check if docId was passed
	const targetDocId = page.url.searchParams.get("docId");
	let doc: BlueprintDocument | null = null;
	if (targetDocId) {
		doc = await repo.load(targetDocId);
	}

	if (!doc) {
		doc = createBlankDocument();
		await repo.create(doc);
	}

	docId = doc.documentId;
	session = new BlueprintSession({
		document: doc,
		mode: "editor",
		repository: repo,
	});

	updateState();
	session.subscribe(() => updateState());

	(window as any).__persistenceHarness = {
		getSession: () => session,
		getRepo: () => repo,
		getInnerRepo: () => baseRepo,
		holdNextSave: () => {
			let resolveFn!: () => void;
			const p = new Promise<void>((res) => { resolveFn = res; });
			holdSaveGate = { promise: p, resolve: resolveFn };
		},
		releaseHeldSave: () => {
			holdSaveGate?.resolve();
			holdSaveGate = null;
		},
		injectQuotaErrorOnce: () => {
			shouldFailQuota = true;
		},
		injectUnavailableErrorOnce: () => {
			shouldFailUnavailable = true;
		},
		getStoredDocument: async (id: string) => {
			return baseRepo.load(id);
		},
	};
}

function updateState() {
	if (!session) return;
	docRevision = session.doc.revision;
	isDirty = session.isDirty;
	storageVersion = session.storageVersion;
	persistenceStatus = session.persistenceState;
}

onMount(() => {
	init();
});

onDestroy(() => {
	session?.dispose();
	if (repo instanceof InterceptingRepository && (repo as any).inner.close) {
		(repo as any).inner.close();
	}
});

function handleEdit() {
	if (!session) return;
	session.execute({
		type: "entity.add",
		entity: {
			id: `shape-${Date.now()}`,
			name: `Box ${Date.now()}`,
			kind: "shape",
			layerId: "layer_foundation",
			groupId: null,
			transform: { x: Math.random() * 200, y: Math.random() * 200, rotationDeg: 0 },
			style: { fill: "#3b82f6", stroke: "#000", strokeWidthMm: 1, opacity: 1, dashMm: [] },
			hidden: false,
			locked: false,
			tags: [],
			metadata: {},
			structural: false,
			geometry: { kind: "rect", width: 50, height: 50, cornerRadius: 0 },
		},
	});
}

async function handleSave() {
	if (!session) return;
	lastError = null;
	try {
		await session.save();
	} catch (e: any) {
		lastError = e?.message ?? String(e);
	}
}

async function handleSaveAsCopy() {
	if (!session) return;
	lastError = null;
	try {
		await session.resolveConflictSaveCopy();
	} catch (e: any) {
		lastError = e?.message ?? String(e);
	}
}

async function handleReload() {
	if (!session) return;
	lastError = null;
	try {
		await session.resolveConflictReload();
	} catch (e: any) {
		lastError = e?.message ?? String(e);
	}
}

function handleUndo() {
	session?.undo();
}

function handleRedo() {
	session?.redo();
}
</script>

<div class="p-8 max-w-4xl mx-auto space-y-6 bg-base-100 text-base-content min-h-screen">
	<header class="border-b border-base-300 pb-4">
		<h1 class="text-xl font-bold font-mono">C-03 IndexedDB Multi-Tab Persistence Test Harness</h1>
		<div class="flex items-center gap-2 mt-2 text-xs font-mono">
			<span>DB: <code class="bg-base-200 px-1 rounded">{dbName}</code></span>
			<span id="durable-badge" class="badge badge-sm {isDurable ? 'badge-success' : 'badge-warning'}">
				{isDurable ? "DURABLE (IndexedDB)" : "MEMORY-ONLY"}
			</span>
		</div>
	</header>

	<div class="grid grid-cols-2 gap-4 p-4 bg-base-200 rounded-lg text-xs font-mono">
		<div>
			<div>Doc ID: <span id="doc-id" class="font-bold">{docId}</span></div>
			<div>Doc Revision: <span id="doc-revision" class="font-bold">{docRevision}</span></div>
			<div>Storage Version: <span id="storage-version" class="font-bold">{storageVersion}</span></div>
		</div>
		<div>
			<div>Is Dirty: <span id="is-dirty" class="font-bold {isDirty ? 'text-warning' : 'text-success'}">{isDirty ? "true" : "false"}</span></div>
			<div>Persistence Status: <span id="persistence-status" class="badge badge-sm font-bold">{persistenceStatus}</span></div>
			{#if lastError}
				<div class="text-error mt-1">Error: <span id="error-message">{lastError}</span></div>
			{/if}
		</div>
	</div>

	<div class="flex flex-wrap gap-2">
		<button id="btn-edit" type="button" class="btn btn-sm btn-primary" onclick={handleEdit}>
			Mutate (Add Entity)
		</button>
		<button id="btn-save" type="button" class="btn btn-sm btn-secondary" onclick={handleSave}>
			Save Draft
		</button>
		<button id="btn-save-as-copy" type="button" class="btn btn-sm btn-outline btn-accent" onclick={handleSaveAsCopy}>
			Save As Copy
		</button>
		<button id="btn-reload" type="button" class="btn btn-sm btn-outline" onclick={handleReload}>
			Reload Stored
		</button>
		<button id="btn-undo" type="button" class="btn btn-sm btn-ghost" onclick={handleUndo}>
			Undo
		</button>
		<button id="btn-redo" type="button" class="btn btn-sm btn-ghost" onclick={handleRedo}>
			Redo
		</button>
	</div>
</div>
