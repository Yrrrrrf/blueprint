// ============================================================================
// Blueprint API Ports (§9.1, §10.1 of Blueprint Specification)
// Port interfaces for document persistence and telemetry feeds.
// ============================================================================

import type { BlueprintDocument, Id, IsoDate } from "@sdk/core";
import type {
	ConnectionState,
	TelemetryObserver,
	TelemetryQuality,
	TelemetrySample,
	TelemetrySource,
	TelemetryValue,
} from "./telemetry.ts";

export type {
	ConnectionState,
	TelemetryObserver,
	TelemetryQuality,
	TelemetrySample,
	TelemetrySource,
	TelemetryValue,
};

/**
 * Lightweight document metadata for listing collections.
 */
export interface DocumentSummary {
	id: Id;
	name: string;
	updatedAt: IsoDate;
	revision: number;
	description?: string;
	entityCount?: number;
	storageVersion?: number;
	approvedSnapshotId?: Id | null;
}

/**
 * Result of saveDraft operation (§10.1).
 */
export type SaveDraftResult =
	| { status: "saved"; storageVersion: number }
	| { status: "conflict"; currentStorageVersion: number };

/**
 * Immutable snapshot record stored in repository (§10.1, §10.3).
 */
export interface SnapshotRecord {
	id: Id;
	documentId: Id;
	contentHash: string;
	label: string;
	createdAt: IsoDate;
	revision: number;
	envelope: Omit<BlueprintDocument, "content">;
}

/**
 * Lightweight snapshot metadata for listing snapshots (§10.1, §10.3).
 */
export interface SnapshotSummary {
	id: Id;
	documentId: Id;
	label: string;
	createdAt: IsoDate;
	revision: number;
	contentHash: string;
	isApproved?: boolean;
}

/**
 * Storage error when quota is exceeded (§10.1, §13.4, AC-044).
 */
export class StorageQuotaError extends Error {
	public readonly code = "STORAGE_QUOTA" as const;
	constructor(
		message = "Storage quota exceeded",
		public override readonly cause?: unknown,
	) {
		super(message);
		this.name = "StorageQuotaError";
	}
}

/**
 * Storage error when storage is unavailable (§10.1, §13.4, AC-046).
 */
export class StorageUnavailableError extends Error {
	public readonly code = "STORAGE_UNAVAILABLE" as const;
	constructor(
		message = "Storage is unavailable",
		public override readonly cause?: unknown,
	) {
		super(message);
		this.name = "StorageUnavailableError";
	}
}

/**
 * Asynchronous document repository port (§10.1).
 */
export interface DocumentRepository {
	isDurable: boolean;
	list(): Promise<DocumentSummary[]>;
	load(id: Id): Promise<BlueprintDocument | null>;
	create(doc: BlueprintDocument): Promise<void>;
	saveDraft(
		doc: BlueprintDocument,
		expectedStorageVersion: number,
	): Promise<SaveDraftResult>;
	delete(id: Id): Promise<void>;
	listSnapshots(documentId: Id): Promise<SnapshotSummary[]>;
	createSnapshot(documentId: Id, label: string): Promise<SnapshotRecord>;
	loadSnapshot(snapshotId: Id): Promise<BlueprintDocument | null>;
	approveSnapshot(documentId: Id, snapshotId: Id): Promise<void>;
	forkProposal(
		baseDocumentId: Id,
		baseSnapshotId: Id,
	): Promise<BlueprintDocument>;
	save?(doc: BlueprintDocument): Promise<void>;
}

/**
 * Port contract for streaming telemetry subscriptions (backwards compatibility).
 */
export interface TelemetryPort {
	subscribe(
		assetKeys: string[],
		callback: (sample: TelemetrySample) => void,
	): () => void;
}

/**
 * Builds a fresh proposal document forked from a snapshot (§11, AC-067).
 */
export function buildProposalDocument(
	snapDoc: BlueprintDocument,
	proposalId: Id,
	baseDocumentId: Id,
	baseSnapshotId: Id,
	baseHash: string,
	now: string = new Date().toISOString(),
): BlueprintDocument {
	const proposalDoc: BlueprintDocument = {
		...JSON.parse(JSON.stringify(snapDoc)),
		documentId: proposalId,
		createdAt: now,
		updatedAt: now,
		revision: 1,
		content: {
			...JSON.parse(JSON.stringify(snapDoc.content)),
			metadata: {
				...snapDoc.content.metadata,
				proposalProvenance: {
					baseDocumentId,
					baseSnapshotId,
					baseContentHash: baseHash,
				},
				telemetryDisconnected: true,
			},
		},
	};

	for (const ent of Object.values(proposalDoc.content.entities)) {
		if (ent.kind === "device") {
			ent.bindings = [];
		}
	}

	return proposalDoc;
}
