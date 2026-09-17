// ============================================================================
// Blueprint In-Memory Document Repository (§10.1 of Blueprint Specification)
// Ephemeral repository implementation for tests, embeds, and memory sessions.
// ============================================================================

import type { BlueprintDocument, DocumentContent, Id } from "@sdk/core";
import { computeContentHash, serializeCanonicalJson } from "@sdk/core";
import {
	buildProposalDocument,
	type DocumentRepository,
	type DocumentSummary,
	type SaveDraftResult,
	type SnapshotRecord,
	type SnapshotSummary,
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

export class MemoryDocumentRepository implements DocumentRepository {
	public readonly isDurable = false;

	private readonly _documents = new Map<Id, StoredDocumentRecord>();
	private readonly _contents = new Map<string, StoredContentRecord>();
	private readonly _snapshots = new Map<Id, SnapshotRecord>();

	public async list(): Promise<DocumentSummary[]> {
		const summaries: DocumentSummary[] = [];
		for (const docRecord of this._documents.values()) {
			const contentRecord = this._contents.get(docRecord.contentHash);
			summaries.push({
				id: docRecord.id,
				name: contentRecord?.content.name ?? "Untitled",
				updatedAt: docRecord.envelope.updatedAt,
				revision: docRecord.envelope.revision,
				description: contentRecord?.content.description,
				entityCount: contentRecord
					? Object.keys(contentRecord.content.entities).length
					: 0,
				storageVersion: docRecord.storageVersion,
				approvedSnapshotId: docRecord.approvedSnapshotId,
			});
		}
		return summaries;
	}

	public async load(id: Id): Promise<BlueprintDocument | null> {
		const docRecord = this._documents.get(id);
		if (!docRecord) return null;

		const contentRecord = this._contents.get(docRecord.contentHash);
		if (!contentRecord) return null;

		return {
			...(JSON.parse(JSON.stringify(docRecord.envelope)) as Omit<
				BlueprintDocument,
				"content"
			>),
			content: JSON.parse(
				JSON.stringify(contentRecord.content),
			) as DocumentContent,
		};
	}

	private _storeDocument(
		doc: BlueprintDocument,
		storageVersion: number,
		approvedSnapshotId: Id | null,
	): void {
		const contentHash = computeContentHash(doc.content);
		const canonicalJson = serializeCanonicalJson(doc.content);

		this._contents.set(contentHash, {
			contentHash,
			canonicalJson,
			content: JSON.parse(JSON.stringify(doc.content)) as DocumentContent,
		});

		const envelope = JSON.parse(JSON.stringify(doc)) as BlueprintDocument;
		delete (envelope as Partial<BlueprintDocument>).content;

		this._documents.set(doc.documentId, {
			id: doc.documentId,
			envelope,
			contentHash,
			storageVersion,
			approvedSnapshotId,
		});
	}

	public async create(doc: BlueprintDocument): Promise<void> {
		this._storeDocument(doc, 1, null);
	}

	public async saveDraft(
		doc: BlueprintDocument,
		expectedStorageVersion: number,
	): Promise<SaveDraftResult> {
		const existing = this._documents.get(doc.documentId);
		if (!existing) {
			if (expectedStorageVersion === 0 || expectedStorageVersion === 1) {
				await this.create(doc);
				return { status: "saved", storageVersion: 1 };
			}
			return { status: "conflict", currentStorageVersion: 0 };
		}

		if (existing.storageVersion !== expectedStorageVersion) {
			return {
				status: "conflict",
				currentStorageVersion: existing.storageVersion,
			};
		}

		const nextVersion = existing.storageVersion + 1;
		this._storeDocument(doc, nextVersion, existing.approvedSnapshotId);
		return { status: "saved", storageVersion: nextVersion };
	}

	public async delete(id: Id): Promise<void> {
		this._documents.delete(id);
		for (const [snapId, snap] of this._snapshots.entries()) {
			if (snap.documentId === id) {
				this._snapshots.delete(snapId);
			}
		}
	}

	public async listSnapshots(documentId: Id): Promise<SnapshotSummary[]> {
		const docRecord = this._documents.get(documentId);
		const summaries: SnapshotSummary[] = [];

		for (const snap of this._snapshots.values()) {
			if (snap.documentId === documentId) {
				summaries.push({
					id: snap.id,
					documentId: snap.documentId,
					label: snap.label,
					createdAt: snap.createdAt,
					revision: snap.revision,
					contentHash: snap.contentHash,
					isApproved: docRecord
						? docRecord.approvedSnapshotId === snap.id
						: false,
				});
			}
		}

		return summaries.sort(
			(a, b) =>
				new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
		);
	}

	public async createSnapshot(
		documentId: Id,
		label: string,
	): Promise<SnapshotRecord> {
		const docRecord = this._documents.get(documentId);
		if (!docRecord) {
			throw new Error(`Document not found: ${documentId}`);
		}

		let count = 0;
		for (const s of this._snapshots.values()) {
			if (s.documentId === documentId) count++;
		}
		if (count >= 20) {
			throw new Error(
				"Maximum snapshot limit (20) reached. Delete a non-approved snapshot first.",
			);
		}

		const snapId = crypto.randomUUID();
		const snapshot: SnapshotRecord = {
			id: snapId,
			documentId,
			contentHash: docRecord.contentHash,
			label: label || `Revision ${docRecord.envelope.revision}`,
			createdAt: new Date().toISOString(),
			revision: docRecord.envelope.revision,
			envelope: JSON.parse(JSON.stringify(docRecord.envelope)),
		};

		this._snapshots.set(snapId, snapshot);
		return snapshot;
	}

	public async loadSnapshot(snapshotId: Id): Promise<BlueprintDocument | null> {
		const snap = this._snapshots.get(snapshotId);
		if (!snap) return null;

		const contentRecord = this._contents.get(snap.contentHash);
		if (!contentRecord) return null;

		return {
			...(JSON.parse(JSON.stringify(snap.envelope)) as Omit<
				BlueprintDocument,
				"content"
			>),
			content: JSON.parse(
				JSON.stringify(contentRecord.content),
			) as DocumentContent,
		};
	}

	public async approveSnapshot(documentId: Id, snapshotId: Id): Promise<void> {
		const docRecord = this._documents.get(documentId);
		if (!docRecord) {
			throw new Error(`Document not found: ${documentId}`);
		}
		const snap = this._snapshots.get(snapshotId);
		if (!snap || snap.documentId !== documentId) {
			throw new Error(
				`Snapshot ${snapshotId} does not belong to document ${documentId}`,
			);
		}

		docRecord.approvedSnapshotId = snapshotId;
	}

	public async forkProposal(
		baseDocumentId: Id,
		baseSnapshotId: Id,
	): Promise<BlueprintDocument> {
		const baseDoc = await this.load(baseDocumentId);
		if (!baseDoc) {
			throw new Error(`Base document not found: ${baseDocumentId}`);
		}

		const snap = this._snapshots.get(baseSnapshotId);
		if (!snap || snap.documentId !== baseDocumentId) {
			throw new Error(`Base snapshot not found: ${baseSnapshotId}`);
		}

		const baseContent = await this.loadSnapshot(baseSnapshotId);
		if (!baseContent) {
			throw new Error(`Snapshot content not found: ${baseSnapshotId}`);
		}

		const proposalId = crypto.randomUUID();
		const proposalDoc = buildProposalDocument(
			baseContent,
			proposalId,
			baseDocumentId,
			baseSnapshotId,
			snap.contentHash,
		);

		await this.create(proposalDoc);
		return proposalDoc;
	}

	public async save(doc: BlueprintDocument): Promise<void> {
		const existing = this._documents.get(doc.documentId);
		if (!existing) {
			await this.create(doc);
		} else {
			await this.saveDraft(doc, existing.storageVersion);
		}
	}

	public getStorageVersion(id: Id): number {
		return this._documents.get(id)?.storageVersion ?? 0;
	}

	public clear(): void {
		this._documents.clear();
		this._contents.clear();
		this._snapshots.clear();
	}
}
