// ============================================================================
// Blueprint Native Document Serialization & Deserialization (§4.3, §4.4)
// Canonical JSON export and strict schema/referential validation parser.
// ============================================================================

import type { BlueprintDocument, ValidationIssue } from "@sdk/core";
import {
	serializeCanonicalJson,
	validateBlueprintDocument,
	validateRawDocumentText,
} from "@sdk/core";

export type ParseDocumentResult<T = BlueprintDocument> = {
	valid: boolean;
	issues: readonly ValidationIssue[];
	document?: T;
};

/**
 * Serializes a Blueprint document to canonical JSON string with LF newline (§4.4).
 */
export function serializeNativeDocument(doc: BlueprintDocument): string {
	return serializeCanonicalJson(doc);
}

/**
 * Parses and strictly validates a native Blueprint JSON document (§4.3).
 * Validates 20 MiB file size cap, v1 schema, and referential integrity.
 */
export function parseNativeDocument(
	jsonStr: string,
): ParseDocumentResult<BlueprintDocument> {
	// 1. Check raw byte size and parse JSON syntax
	const rawResult = validateRawDocumentText(jsonStr);
	if (!rawResult.valid) {
		return {
			valid: false,
			issues: rawResult.issues,
		};
	}

	// 2. Strict validation pipeline (schema, referential integrity, geometry)
	const parsed = rawResult.doc;
	const validationResult = validateBlueprintDocument(parsed);
	if (!validationResult.valid) {
		return {
			valid: false,
			issues: validationResult.issues,
		};
	}

	return {
		valid: true,
		issues: [],
		document: parsed as BlueprintDocument,
	};
}
