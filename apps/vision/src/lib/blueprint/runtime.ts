// ============================================================================
// Blueprint Runtime & Document Lifecycle Adapter (§4.1, §4.2, §7.1, §8.2)
// Provides document loading, industrial example loader, dirty-work handling,
// native JSON download, and telemetry simulator integration.
// ============================================================================

import {
	createBlankDocument,
	createNaveIndustrialFixture,
	type BlueprintDocument,
	type CreateBlankDocumentOptions,
} from "@sdk/core";
import {
	createDocumentRepository,
	parseNativeDocument,
	serializeNativeDocument,
	TelemetrySimulator,
	type DocumentRepository,
} from "@sdk/api";
import type { BlueprintSession } from "@sdk/state";

let _sharedRepository: DocumentRepository | null = null;

/**
 * Returns a shared DocumentRepository instance with automatic memory fallback.
 */
export function getDocumentRepository(): DocumentRepository {
	if (!_sharedRepository) {
		_sharedRepository = createDocumentRepository();
	}
	return _sharedRepository;
}

/**
 * Creates a brand-new canonical Blueprint blank document (§4.1, §7.1).
 */
export function createNewDocument(
	name = "Untitled Facility",
	options?: CreateBlankDocumentOptions,
): BlueprintDocument {
	return createBlankDocument(name, {
		documentId: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
		...options,
	});
}

let _industrialCounter = 0;

/**
 * Creates a new editable instance of the deterministic industrial fixture (§8.2, AC-052).
 * Each call generates a fresh document ID so fixture data is never overwritten.
 */
export function createIndustrialDocument(): BlueprintDocument {
	const freshId = `doc-industrial-${Date.now()}-${++_industrialCounter}`;
	return createNaveIndustrialFixture({
		documentId: freshId,
	});
}

/**
 * Sanitizes a filename for native document download.
 */
export function sanitizeFilename(name: string): string {
	const cleaned = name.replace(/[^a-zA-Z0-9_\-\.]/g, "_").replace(/_+/g, "_");
	return (cleaned || "blueprint").toLowerCase();
}

/**
 * Serializes and triggers browser download of a native Blueprint JSON document (§7.1, AC-058).
 */
export function downloadNativeDocument(doc: BlueprintDocument): void {
	const json = serializeNativeDocument(doc);
	const filename = `${sanitizeFilename(doc.content.name || "blueprint")}.blueprint.json`;
	const blob = new Blob([json], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

/**
 * Asynchronously reads and validates a native Blueprint document from a browser File.
 */
export async function loadNativeDocumentFromFile(
	file: File,
): Promise<BlueprintDocument> {
	const text = await file.text();
	const parsed = parseNativeDocument(text);
	if (!parsed.valid || !parsed.document) {
		const errMsg = parsed.issues?.[0]?.message || "Invalid Blueprint document";
		throw new Error(errMsg);
	}
	return parsed.document;
}

/**
 * Processes a file input change event to load a native Blueprint document.
 */
export async function readDocumentFromFileInput(
	e: Event,
): Promise<{ doc: BlueprintDocument; filename: string } | null> {
	const input = e.target as HTMLInputElement;
	const file = input.files?.[0];
	if (!file) return null;
	try {
		const doc = await loadNativeDocumentFromFile(file);
		return { doc, filename: file.name };
	} finally {
		input.value = "";
	}
}

/**
 * Checks if a session has unsaved changes that require confirmation before discarding.
 */
export function isSessionDirty(session: BlueprintSession | null): boolean {
	if (!session) return false;
	return session.isDirty;
}

/**
 * Creates a fresh deterministic telemetry simulator for industrial equipment (§9.2).
 */
export function createIndustrialSimulator(): TelemetrySimulator {
	return new TelemetrySimulator({
		seed: "nave-industrial-sim-v1",
		tickMs: 1000,
	});
}
