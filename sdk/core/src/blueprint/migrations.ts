// ============================================================================
// Blueprint Migrations (§4.4 of Blueprint Specification)
// Version validation and forward-compatibility gates
// ============================================================================

import { normalizeDocument } from "./canonical.ts";
import type { BlueprintDocument } from "./types.ts";
import { validateBlueprintDocument } from "./validation.ts";

/** Current supported canonical Blueprint schema version */
export const CURRENT_SCHEMA_VERSION = 1;

/**
 * Validates that a schema version matches the supported version (1).
 * Rejects future or unknown versions with an explicit error message (AC-005).
 */
export function validateSchemaVersion(version: unknown): number {
	if (typeof version !== "number" || !Number.isInteger(version)) {
		throw new Error(
			`Invalid schemaVersion: expected integer, received ${String(version)}`,
		);
	}
	if (version !== CURRENT_SCHEMA_VERSION) {
		throw new Error(
			`Unsupported schema version: ${version}. Expected version ${CURRENT_SCHEMA_VERSION}. No forward migration or Paper import fallback available.`,
		);
	}
	return version;
}

/**
 * Migration dispatcher.
 * Validates and normalizes schemaVersion 1 documents.
 * Rejects future or unknown schema versions with an explicit version error.
 * Never silently falls back to Paper.js raw JSON import.
 */
export function migrateDocument(rawJson: unknown): BlueprintDocument {
	if (!rawJson || typeof rawJson !== "object") {
		throw new Error("Invalid document: root must be an object");
	}

	const record = rawJson as Record<string, unknown>;
	const version = record.schemaVersion;

	// Validate version strictly
	validateSchemaVersion(version);

	// Validate full document invariants
	const result = validateBlueprintDocument(rawJson);
	if (!result.valid) {
		const firstIssues = result.issues
			.slice(0, 5)
			.map((i) => `[${i.code}] ${i.path}: ${i.message}`)
			.join("; ");
		throw new Error(
			`Document validation failed (${result.issues.length} issues): ${firstIssues}`,
		);
	}

	return normalizeDocument(rawJson as BlueprintDocument);
}
