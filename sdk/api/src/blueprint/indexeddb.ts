/// <reference path="./idb.d.ts" />
// ============================================================================
// Blueprint IndexedDB Document Repository (§10.1 of Blueprint Specification)
// Durable browser storage adapter backed by IndexedDB database "blueprint".
// ============================================================================

import type { BlueprintDocument, DocumentContent, Id } from "@sdk/core";
import { computeContentHash, serializeCanonicalJson } from "@sdk/core";
import { MemoryDocumentRepository } from "./memory.ts";
import {
	buildProposalDocument,
	type DocumentRepository,
	type DocumentSummary,
	type SaveDraftResult,
	type SnapshotRecord,
	type SnapshotSummary,
	StorageQuotaError,
	StorageUnavailableError,
} from "./ports.ts";

interface StoredDocumentRecord {
	id: Id;
	envelope: Omit<BlueprintDocument, "content">;
	contentHash: string;
	storageVersion: number;
	approvedSnapshotId: Id | null;
}

interface StoredContentRecord {
	contentHash: string;
	canonicalJson: string;
	content: DocumentContent;
}

function wrapIdbError(err: unknown): Error {
	if (err && typeof err === "object" && "name" in err) {
		const name = String((err as { name: string }).name);
		if (name === "QuotaExceededError") {
			return new StorageQuotaError("IndexedDB storage quota exceeded", err);
		}
		if (
			name === "SecurityError" ||
			name === "NotAllowedError" ||
			name === "InvalidStateError"
		) {
			return new StorageUnavailableError(
				`IndexedDB storage unavailable: ${name}`,
				err,
			);
		}
	}
	return err instanceof Error ? err : new Error(String(err));
}

function hydrateDoc(
	envelope: unknown,
	content: DocumentContent,
): BlueprintDocument {
	return {
		...(JSON.parse(JSON.stringify(envelope)) as Omit<
			BlueprintDocument,
			"content"
		>),
		content: JSON.parse(JSON.stringify(content)) as DocumentContent,
	};
}

function fetchAndHydrateContent(
	contentsStore: IDBObjectStore,
	contentHash: string,
	envelope: unknown,
	resolve: (doc: BlueprintDocument | null) => void,
	reject: (err: unknown) => void,
) {
	const req = contentsStore.get(contentHash);
	req.onerror = () => reject(wrapIdbError(req.error));
	req.onsuccess = () => {
		const record = req.result as StoredContentRecord | undefined;
		if (!record) {
			resolve(null);
			return;
		}
		resolve(hydrateDoc(envelope, record.content));
	};
}

function prepareDocStorage(doc: BlueprintDocument) {
	const contentHash = computeContentHash(doc.content);
	const canonicalJson = serializeCanonicalJson(doc.content);
	const envelope = JSON.parse(JSON.stringify(doc)) as BlueprintDocument;
	delete (envelope as Partial<BlueprintDocument>).content;
	return {
		contentHash,
		canonicalJson,
		envelope,
		contentRecord: {
			contentHash,
			canonicalJson,
			content: JSON.parse(JSON.stringify(doc.content)) as DocumentContent,
		},
	};
}

function createIdbTx(
	db: IDBDatabase,
	storeNames: string[],
	mode: "readonly" | "readwrite",
	reject: (err: unknown) => void,
): IDBTransaction {
	const tx = db.transaction(storeNames, mode);
	tx.onerror = () => reject(wrapIdbError(tx.error));
	tx.onabort = () => reject(wrapIdbError(tx.error));
	return tx;
}

function putDocRecord(
	contentsStore: IDBObjectStore,
	docsStore: IDBObjectStore,
	prep: ReturnType<typeof prepareDocStorage>,
	docId: Id,
	storageVersion: number,
	approvedSnapshotId: Id | null,
): void {
	contentsStore.put(prep.contentRecord);
	docsStore.put({
		id: docId,
		envelope: prep.envelope,
		contentHash: prep.contentHash,
		storageVersion,
		approvedSnapshotId,
	});
}

function openDocsSnapshotsTx(
	db: IDBDatabase,
	mode: "readonly" | "readwrite",
	reject: (err: unknown) => void,
) {
	const tx = createIdbTx(db, ["documents", "snapshots"], mode, reject);
	return {
		tx,
		docsStore: tx.objectStore("documents"),
		snapshotsStore: tx.objectStore("snapshots"),
	};
}

function openDocsContentsTx(
	db: IDBDatabase,
	mode: "readonly" | "readwrite",
	reject: (err: unknown) => void,
) {
	const tx = createIdbTx(db, ["documents", "contents"], mode, reject);
	return {
		tx,
		docsStore: tx.objectStore("documents"),
		contentsStore: tx.objectStore("contents"),
	};
}

function querySnapshotRecord(
	snapshotsStore: IDBObjectStore,
	snapshotId: Id,
	onSuccess: (snap: SnapshotRecord | undefined) => void,
	reject: (err: unknown) => void,
): void {
	const getSnapReq = snapshotsStore.get(snapshotId);
	getSnapReq.onerror = () => reject(wrapIdbError(getSnapReq.error));
	getSnapReq.onsuccess = () =>
		onSuccess(getSnapReq.result as SnapshotRecord | undefined);
}

export class IdbDocumentRepository implements DocumentRepository {
	public readonly isDurable = true;
	private _db: IDBDatabase | null = null;
	private readonly _factory?: IDBFactory;
	private readonly _dbName: string;

	constructor(factory?: IDBFactory, dbName = "blueprint") {
		this._factory = factory;
		this._dbName = dbName;
	}

	public get dbName(): string {
		return this._dbName;
	}

	private async _getDb(): Promise<IDBDatabase> {
		if (this._db) return this._db;

		const idb =
			this._factory ??
			(typeof indexedDB !== "undefined" ? indexedDB : undefined);
		if (!idb) {
			throw new StorageUnavailableError(
				"IndexedDB is not available in the current environment",
			);
		}

		try {
			this._db = await new Promise<IDBDatabase>((resolve, reject) => {
				let req: IDBOpenDBRequest;
				try {
					req = idb.open(this._dbName, 1);
				} catch (e) {
					reject(wrapIdbError(e));
					return;
				}

				req.onupgradeneeded = () => {
					const db = req.result;
					if (!db.objectStoreNames.contains("documents")) {
						db.createObjectStore("documents", { keyPath: "id" });
					}
					if (!db.objectStoreNames.contains("contents")) {
						db.createObjectStore("contents", { keyPath: "contentHash" });
					}
					if (!db.objectStoreNames.contains("snapshots")) {
						db.createObjectStore("snapshots", { keyPath: "id" });
					}
					if (!db.objectStoreNames.contains("assets")) {
						db.createObjectStore("assets", { keyPath: "sha256" });
					}
					if (!db.objectStoreNames.contains("preferences")) {
						db.createObjectStore("preferences", { keyPath: "key" });
					}
				};

				req.onsuccess = () => resolve(req.result);
				req.onerror = () => reject(wrapIdbError(req.error));
			});
			return this._db;
		} catch (err) {
			throw wrapIdbError(err);
		}
	}

	private async _withDocsContentsTx<T>(
		mode: "readonly" | "readwrite",
		fn: (
			docsStore: IDBObjectStore,
			contentsStore: IDBObjectStore,
			resolve: (val: T) => void,
			reject: (err: unknown) => void,
			tx: IDBTransaction,
		) => void,
	): Promise<T> {
		const db = await this._getDb();
		return new Promise<T>((resolve, reject) => {
			try {
				const { tx, docsStore, contentsStore } = openDocsContentsTx(
					db,
					mode,
					reject,
				);
				fn(docsStore, contentsStore, resolve, reject, tx);
			} catch (err) {
				reject(wrapIdbError(err));
			}
		});
	}

	public async list(): Promise<DocumentSummary[]> {
		return this._withDocsContentsTx(
			"readonly",
			(docsStore, contentsStore, resolve, _reject, tx) => {
				const docsReq = docsStore.getAll();
				const contentsReq = contentsStore.getAll();

				tx.oncomplete = () => {
					const docs = (docsReq.result ?? []) as StoredDocumentRecord[];
					const contentsList = (contentsReq.result ??
						[]) as StoredContentRecord[];
					const contentMap = new Map<string, StoredContentRecord>();
					for (const c of contentsList) {
						contentMap.set(c.contentHash, c);
					}

					const summaries: DocumentSummary[] = docs.map((d) => {
						const content = contentMap.get(d.contentHash);
						return {
							id: d.id,
							name: content?.content.name ?? "Untitled",
							updatedAt: d.envelope.updatedAt,
							revision: d.envelope.revision,
							description: content?.content.description,
							entityCount: content
								? Object.keys(content.content.entities).length
								: 0,
							storageVersion: d.storageVersion,
							approvedSnapshotId: d.approvedSnapshotId,
						};
					});
					resolve(summaries);
				};
			},
		);
	}

	public async load(id: Id): Promise<BlueprintDocument | null> {
		return this._withDocsContentsTx(
			"readonly",
			(docsStore, contentsStore, resolve, reject) => {
				const getDocReq = docsStore.get(id);
				getDocReq.onerror = () => reject(wrapIdbError(getDocReq.error));
				getDocReq.onsuccess = () => {
					const docRecord = getDocReq.result as
						| StoredDocumentRecord
						| undefined;
					if (!docRecord) {
						resolve(null);
						return;
					}

					fetchAndHydrateContent(
						contentsStore,
						docRecord.contentHash,
						docRecord.envelope,
						resolve,
						reject,
					);
				};
			},
		);
	}

	public async create(doc: BlueprintDocument): Promise<void> {
		const prep = prepareDocStorage(doc);
		return this._withDocsContentsTx(
			"readwrite",
			(docsStore, contentsStore, resolve, _reject, tx) => {
				putDocRecord(contentsStore, docsStore, prep, doc.documentId, 1, null);
				tx.oncomplete = () => resolve();
			},
		);
	}

	public async saveDraft(
		doc: BlueprintDocument,
		expectedStorageVersion: number,
	): Promise<SaveDraftResult> {
		const prep = prepareDocStorage(doc);
		return this._withDocsContentsTx(
			"readwrite",
			(docsStore, contentsStore, resolve, reject, tx) => {
				const getReq = docsStore.get(doc.documentId);
				getReq.onerror = () => reject(wrapIdbError(getReq.error));
				getReq.onsuccess = () => {
					const existing = getReq.result as StoredDocumentRecord | undefined;
					if (!existing) {
						if (expectedStorageVersion === 0 || expectedStorageVersion === 1) {
							putDocRecord(
								contentsStore,
								docsStore,
								prep,
								doc.documentId,
								1,
								null,
							);
							tx.oncomplete = () =>
								resolve({ status: "saved", storageVersion: 1 });
						} else {
							resolve({ status: "conflict", currentStorageVersion: 0 });
						}
						return;
					}

					if (existing.storageVersion !== expectedStorageVersion) {
						resolve({
							status: "conflict",
							currentStorageVersion: existing.storageVersion,
						});
						return;
					}

					const nextVersion = existing.storageVersion + 1;
					putDocRecord(
						contentsStore,
						docsStore,
						prep,
						doc.documentId,
						nextVersion,
						existing.approvedSnapshotId ?? null,
					);

					tx.oncomplete = () =>
						resolve({ status: "saved", storageVersion: nextVersion });
				};
			},
		);
	}

	public async delete(id: Id): Promise<void> {
		const db = await this._getDb();
		return new Promise<void>((resolve, reject) => {
			try {
				const { tx, docsStore, snapshotsStore } = openDocsSnapshotsTx(
					db,
					"readwrite",
					reject,
				);

				docsStore.delete(id);

				const snapCursorReq = snapshotsStore.openCursor();
				snapCursorReq.onsuccess = () => {
					const cursor = snapCursorReq.result;
					if (cursor) {
						const record = cursor.value as SnapshotRecord;
						if (record.documentId === id) {
							cursor.delete();
						}
						cursor.continue();
					}
				};

				tx.oncomplete = () => resolve();
			} catch (err) {
				reject(wrapIdbError(err));
			}
		});
	}

	public async listSnapshots(documentId: Id): Promise<SnapshotSummary[]> {
		const db = await this._getDb();
		return new Promise<SnapshotSummary[]>((resolve, reject) => {
			try {
				const tx = createIdbTx(
					db,
					["documents", "snapshots"],
					"readonly",
					reject,
				);
				const docsStore = tx.objectStore("documents");
				const snapshotsStore = tx.objectStore("snapshots");

				const getDocReq = docsStore.get(documentId);
				const snapsReq = snapshotsStore.getAll();

				tx.oncomplete = () => {
					const docRecord = getDocReq.result as
						| StoredDocumentRecord
						| undefined;
					const allSnaps = (snapsReq.result ?? []) as SnapshotRecord[];
					const filtered = allSnaps
						.filter((s) => s.documentId === documentId)
						.map((s) => ({
							id: s.id,
							documentId: s.documentId,
							label: s.label,
							createdAt: s.createdAt,
							revision: s.revision,
							contentHash: s.contentHash,
							isApproved: docRecord
								? docRecord.approvedSnapshotId === s.id
								: false,
						}))
						.sort(
							(a, b) =>
								new Date(a.createdAt).getTime() -
								new Date(b.createdAt).getTime(),
						);
					resolve(filtered);
				};
			} catch (err) {
				reject(wrapIdbError(err));
			}
		});
	}

	public async createSnapshot(
		documentId: Id,
		label: string,
	): Promise<SnapshotRecord> {
		const doc = await this.load(documentId);
		if (!doc) {
			throw new Error(`Document not found: ${documentId}`);
		}

		const existing = await this.listSnapshots(documentId);
		if (existing.length >= 20) {
			throw new Error(
				"Maximum snapshot limit (20) reached. Delete a non-approved snapshot first.",
			);
		}

		const prep = prepareDocStorage(doc);
		const snapId = crypto.randomUUID();
		const now = new Date().toISOString();

		const snapshot: SnapshotRecord = {
			id: snapId,
			documentId,
			contentHash: prep.contentHash,
			label: label || `Revision ${doc.revision}`,
			createdAt: now,
			revision: doc.revision,
			envelope: prep.envelope,
		};

		const db = await this._getDb();
		return new Promise<SnapshotRecord>((resolve, reject) => {
			try {
				const tx = createIdbTx(
					db,
					["snapshots", "contents"],
					"readwrite",
					reject,
				);
				const snapshotsStore = tx.objectStore("snapshots");
				const contentsStore = tx.objectStore("contents");

				contentsStore.put(prep.contentRecord);
				snapshotsStore.put(snapshot);
				tx.oncomplete = () => resolve(snapshot);
			} catch (err) {
				reject(wrapIdbError(err));
			}
		});
	}

	public async loadSnapshot(snapshotId: Id): Promise<BlueprintDocument | null> {
		const db = await this._getDb();
		return new Promise<BlueprintDocument | null>((resolve, reject) => {
			try {
				const tx = createIdbTx(
					db,
					["snapshots", "contents"],
					"readonly",
					reject,
				);
				const snapshotsStore = tx.objectStore("snapshots");
				const contentsStore = tx.objectStore("contents");

				querySnapshotRecord(
					snapshotsStore,
					snapshotId,
					(snap) => {
						if (!snap) {
							resolve(null);
							return;
						}

						fetchAndHydrateContent(
							contentsStore,
							snap.contentHash,
							snap.envelope,
							resolve,
							reject,
						);
					},
					reject,
				);
			} catch (err) {
				reject(wrapIdbError(err));
			}
		});
	}

	public async approveSnapshot(documentId: Id, snapshotId: Id): Promise<void> {
		const db = await this._getDb();
		return new Promise<void>((resolve, reject) => {
			try {
				const { tx, docsStore, snapshotsStore } = openDocsSnapshotsTx(
					db,
					"readwrite",
					reject,
				);

				querySnapshotRecord(
					snapshotsStore,
					snapshotId,
					(snap) => {
						if (!snap || snap.documentId !== documentId) {
							reject(
								new Error(
									`Snapshot ${snapshotId} does not belong to document ${documentId}`,
								),
							);
							return;
						}

						const getDocReq = docsStore.get(documentId);
						getDocReq.onerror = () => reject(wrapIdbError(getDocReq.error));
						getDocReq.onsuccess = () => {
							const docRecord = getDocReq.result as
								| StoredDocumentRecord
								| undefined;
							if (!docRecord) {
								reject(new Error(`Document not found: ${documentId}`));
								return;
							}

							docRecord.approvedSnapshotId = snapshotId;
							docsStore.put(docRecord);
							tx.oncomplete = () => resolve();
						};
					},
					reject,
				);
			} catch (err) {
				reject(wrapIdbError(err));
			}
		});
	}

	public async forkProposal(
		baseDocumentId: Id,
		baseSnapshotId: Id,
	): Promise<BlueprintDocument> {
		const baseDoc = await this.load(baseDocumentId);
		if (!baseDoc) {
			throw new Error(`Base document not found: ${baseDocumentId}`);
		}

		const snapDoc = await this.loadSnapshot(baseSnapshotId);
		if (!snapDoc) {
			throw new Error(`Base snapshot not found: ${baseSnapshotId}`);
		}

		const baseHash = computeContentHash(snapDoc.content);
		const proposalId = crypto.randomUUID();
		const proposalDoc = buildProposalDocument(
			snapDoc,
			proposalId,
			baseDocumentId,
			baseSnapshotId,
			baseHash,
		);

		await this.create(proposalDoc);
		return proposalDoc;
	}

	public async save(doc: BlueprintDocument): Promise<void> {
		const existing = await this.load(doc.documentId);
		if (!existing) {
			await this.create(doc);
		} else {
			const db = await this._getDb();
			const version = await new Promise<number>((resolve) => {
				const tx = db.transaction(["documents"], "readonly");
				const req = tx.objectStore("documents").get(doc.documentId);
				req.onsuccess = () => {
					resolve(
						(req.result as StoredDocumentRecord | undefined)?.storageVersion ??
							1,
					);
				};
				req.onerror = () => resolve(1);
			});
			await this.saveDraft(doc, version);
		}
	}

	public close(): void {
		if (this._db) {
			this._db.close();
			this._db = null;
		}
	}
}

/**
 * Factory creating appropriate DocumentRepository instance (§10.1, AC-046).
 * Uses IdbDocumentRepository in browser environments with IndexedDB.
 * Falls back to MemoryDocumentRepository with isDurable = false if unavailable.
 */
export function createDocumentRepository(options?: {
	idbFactory?: IDBFactory;
	dbName?: string;
	forceMemory?: boolean;
}): DocumentRepository {
	if (options?.forceMemory) {
		return new MemoryDocumentRepository();
	}

	const idb =
		options?.idbFactory ??
		(typeof indexedDB !== "undefined" ? indexedDB : undefined);
	if (idb) {
		return new IdbDocumentRepository(idb, options?.dbName);
	}

	return new MemoryDocumentRepository();
}
