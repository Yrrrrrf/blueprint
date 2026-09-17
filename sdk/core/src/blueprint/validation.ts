// ============================================================================
// Blueprint Validation Pipeline (§4.3 of Blueprint Specification)
// Strict document, entity, hierarchy, geometry, and referential validation
// ============================================================================

import * as v from "valibot";
import { computeSha256, signedShoelaceArea } from "./canonical.ts";
import { BlueprintDocumentSchema } from "./schemas.ts";
import type {
	Anchor,
	BlueprintDocument,
	DocumentContent,
	DocumentValidationOptions,
	Entity,
	Polygon,
	ValidationIssue,
	ValidationResult,
	Vec2,
} from "./types.ts";
import { GEOMETRY_EPSILON_MM, MIN_POLYGON_AREA_MM2 } from "./units.ts";

// ----------------------------------------------------------------------------
// Limits and Thresholds (§4.3 Rule 1)
// ----------------------------------------------------------------------------

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MiB
export const MAX_ENTITIES_COUNT = 10_000;
export const MAX_LAYERS_COUNT = 256;
export const MAX_GROUPS_COUNT = 1_000;
export const MAX_DEFINITIONS_COUNT = 500;
export const MAX_ASSETS_COUNT = 64;
export const MAX_BEZIER_VERTICES_COUNT = 250_000;
export const MAX_METADATA_DEPTH = 8;
export const MAX_TOTAL_METADATA_BYTES = 1024 * 1024; // 1 MiB
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MiB
export const MAX_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024; // 12 MiB
export const MAX_IMAGE_PIXELS = 16_000_000; // 16 megapixels

export const PRESET_LAYER_ROLES = [
	"foundation",
	"sections",
	"machinery",
	"marks",
] as const;

// ----------------------------------------------------------------------------
// Metadata Depth and Size Helpers
// ----------------------------------------------------------------------------

export function computeMetadataDepth(value: unknown, currentDepth = 0): number {
	if (value === null || typeof value !== "object") {
		return currentDepth;
	}
	let maxDepth = currentDepth + 1;
	if (Array.isArray(value)) {
		for (const item of value) {
			const d = computeMetadataDepth(item, currentDepth + 1);
			if (d > maxDepth) maxDepth = d;
		}
	} else {
		for (const key of Object.keys(value)) {
			const d = computeMetadataDepth(
				(value as Record<string, unknown>)[key],
				currentDepth + 1,
			);
			if (d > maxDepth) maxDepth = d;
		}
	}
	return maxDepth;
}

// ----------------------------------------------------------------------------
// 2D Polygon Geometry Invariants (§4.3 Rule 3, 6)
// ----------------------------------------------------------------------------

function crossProduct(o: Vec2, a: Vec2, b: Vec2): number {
	return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function onSegment(
	p: Vec2,
	a: Vec2,
	b: Vec2,
	eps = GEOMETRY_EPSILON_MM,
): boolean {
	return (
		p.x >= Math.min(a.x, b.x) - eps &&
		p.x <= Math.max(a.x, b.x) + eps &&
		p.y >= Math.min(a.y, b.y) - eps &&
		p.y <= Math.max(a.y, b.y) + eps &&
		Math.abs(crossProduct(a, b, p)) < eps
	);
}

function segmentsIntersect(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
	const cp1 = crossProduct(a, b, c);
	const cp2 = crossProduct(a, b, d);
	const cp3 = crossProduct(c, d, a);
	const cp4 = crossProduct(c, d, b);

	// Proper cross intersection
	if (
		((cp1 > 1e-6 && cp2 < -1e-6) || (cp1 < -1e-6 && cp2 > 1e-6)) &&
		((cp3 > 1e-6 && cp4 < -1e-6) || (cp3 < -1e-6 && cp4 > 1e-6))
	) {
		return true;
	}

	// Collinear overlapping segments
	if (Math.abs(cp1) < 1e-6 && onSegment(c, a, b)) return true;
	if (Math.abs(cp2) < 1e-6 && onSegment(d, a, b)) return true;
	if (Math.abs(cp3) < 1e-6 && onSegment(a, c, d)) return true;
	if (Math.abs(cp4) < 1e-6 && onSegment(b, c, d)) return true;

	return false;
}

export function isRingSelfIntersecting(ring: readonly Vec2[]): boolean {
	const n = ring.length;
	if (n < 3) return false;
	for (let i = 0; i < n; i++) {
		const a = ring[i];
		const b = ring[(i + 1) % n];
		for (let j = i + 1; j < n; j++) {
			// Skip adjacent segments sharing an endpoint
			if (
				j === i ||
				j === (i + 1) % n ||
				(j + 1) % n === i ||
				(i === 0 && j === n - 1)
			) {
				continue;
			}
			const c = ring[j];
			const d = ring[(j + 1) % n];
			if (segmentsIntersect(a, b, c, d)) {
				return true;
			}
		}
	}
	return false;
}

export function pointInRing(p: Vec2, ring: readonly Vec2[]): number {
	const n = ring.length;
	let inside = false;
	for (let i = 0, j = n - 1; i < n; j = i++) {
		const a = ring[i];
		const b = ring[j];
		if (onSegment(p, a, b)) return 0; // On boundary
		if (
			a.y > p.y !== b.y > p.y &&
			p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
		) {
			inside = !inside;
		}
	}
	return inside ? 1 : -1;
}

export function ringsIntersect(
	r1: readonly Vec2[],
	r2: readonly Vec2[],
): boolean {
	for (let i = 0; i < r1.length; i++) {
		const a = r1[i];
		const b = r1[(i + 1) % r1.length];
		for (let j = 0; j < r2.length; j++) {
			const c = r2[j];
			const d = r2[(j + 1) % r2.length];
			if (segmentsIntersect(a, b, c, d)) {
				return true;
			}
		}
	}
	return false;
}

export function validatePolygonGeometry(
	polygon: Polygon,
	path: string,
	entityIds: string[],
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];

	// Outer ring checks
	if (polygon.outer.length < 3) {
		issues.push({
			code: "INVALID_POLYGON_RING",
			path: `${path}.outer`,
			message: "Outer ring must contain at least 3 vertices",
			entityIds,
		});
		return issues;
	}

	// Unique vertex IDs in outer ring
	const outerIds = new Set<string>();
	for (const v of polygon.outer) {
		if (outerIds.has(v.id)) {
			issues.push({
				code: "DUPLICATE_VERTEX_ID",
				path: `${path}.outer`,
				message: `Duplicate vertex ID '${v.id}' in polygon outer ring`,
				entityIds,
			});
		}
		outerIds.add(v.id);
	}

	const outerArea = signedShoelaceArea(polygon.outer);
	if (outerArea < MIN_POLYGON_AREA_MM2) {
		issues.push({
			code:
				outerArea <= 0 ? "INVALID_RING_ORIENTATION" : "DEGENERATE_POLYGON_AREA",
			path: `${path}.outer`,
			message: `Outer ring must have positive shoelace area >= 1 mm² in Y-down coordinates (got ${outerArea.toFixed(3)})`,
			entityIds,
		});
	}

	if (isRingSelfIntersecting(polygon.outer)) {
		issues.push({
			code: "SELF_INTERSECTING_POLYGON",
			path: `${path}.outer`,
			message: "Outer ring has self-intersecting segments",
			entityIds,
		});
	}

	// Hole checks
	const holeIds = new Set<string>();
	for (let hIdx = 0; hIdx < polygon.holes.length; hIdx++) {
		const hole = polygon.holes[hIdx];
		const holePath = `${path}.holes[${hIdx}]`;

		if (hole.length < 3) {
			issues.push({
				code: "INVALID_POLYGON_RING",
				path: holePath,
				message: `Hole ${hIdx} must contain at least 3 vertices`,
				entityIds,
			});
			continue;
		}

		// Hole vertex IDs uniqueness (cannot reuse outer or hole IDs)
		for (const v of hole) {
			if (outerIds.has(v.id) || holeIds.has(v.id)) {
				issues.push({
					code: "DUPLICATE_VERTEX_ID",
					path: holePath,
					message: `Duplicate vertex ID '${v.id}' in polygon hole`,
					entityIds,
				});
			}
			holeIds.add(v.id);
		}

		const holeArea = signedShoelaceArea(hole);
		if (holeArea > -MIN_POLYGON_AREA_MM2) {
			issues.push({
				code:
					holeArea >= 0
						? "INVALID_RING_ORIENTATION"
						: "DEGENERATE_POLYGON_AREA",
				path: holePath,
				message: `Hole ring must have negative shoelace area <= -1 mm² in Y-down coordinates (got ${holeArea.toFixed(3)})`,
				entityIds,
			});
		}

		if (isRingSelfIntersecting(hole)) {
			issues.push({
				code: "SELF_INTERSECTING_POLYGON",
				path: holePath,
				message: `Hole ring ${hIdx} has self-intersecting segments`,
				entityIds,
			});
		}

		// Hole must be inside outer ring
		const allInside = hole.every((pt) => pointInRing(pt, polygon.outer) >= 0);
		if (!allInside || ringsIntersect(hole, polygon.outer)) {
			issues.push({
				code: "HOLE_OUTSIDE_OUTER_RING",
				path: holePath,
				message: `Hole ring ${hIdx} lies outside or crosses the outer ring`,
				entityIds,
			});
		}
	}

	// Intersecting holes check
	for (let i = 0; i < polygon.holes.length; i++) {
		for (let j = i + 1; j < polygon.holes.length; j++) {
			const h1 = polygon.holes[i];
			const h2 = polygon.holes[j];
			if (
				ringsIntersect(h1, h2) ||
				h1.some((pt) => pointInRing(pt, h2) >= 0) ||
				h2.some((pt) => pointInRing(pt, h1) >= 0)
			) {
				issues.push({
					code: "INTERSECTING_HOLES",
					path: `${path}.holes`,
					message: `Holes ${i} and ${j} overlap or intersect`,
					entityIds,
				});
			}
		}
	}

	return issues;
}

// ----------------------------------------------------------------------------
// Early Document Size & Raw Text Checks (§4.3 Rule 1, AC-006)
// ----------------------------------------------------------------------------

/**
 * Validates raw UTF-8 document bytes or text before expensive parsing and geometry.
 * Rejects payloads > 20 MiB or metadata depth > 8 immediately.
 */
export function validateRawDocumentText(raw: string | Uint8Array): {
	valid: boolean;
	issues: ValidationIssue[];
	doc?: unknown;
} {
	const byteLength =
		typeof raw === "string"
			? new TextEncoder().encode(raw).length
			: raw.byteLength;

	if (byteLength > MAX_FILE_SIZE_BYTES) {
		return {
			valid: false,
			issues: [
				{
					code: "FILE_SIZE_LIMIT_EXCEEDED",
					path: "",
					message: `File size exceeds 20 MiB limit (received ${byteLength} bytes)`,
					entityIds: [],
				},
			],
		};
	}

	let doc: unknown;
	try {
		const str = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
		doc = JSON.parse(str);
	} catch (e) {
		return {
			valid: false,
			issues: [
				{
					code: "JSON_SYNTAX_ERROR",
					path: "",
					message: `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`,
					entityIds: [],
				},
			],
		};
	}

	// Verify schemaVersion before anything else (AC-005)
	const rawRecord = doc as Record<string, unknown> | null;
	if (
		rawRecord &&
		typeof rawRecord === "object" &&
		"schemaVersion" in rawRecord &&
		rawRecord.schemaVersion !== 1
	) {
		return {
			valid: false,
			issues: [
				{
					code: "UNSUPPORTED_SCHEMA_VERSION",
					path: "schemaVersion",
					message: `Unsupported schema version: ${rawRecord.schemaVersion}. Expected version 1.`,
					entityIds: [],
				},
			],
		};
	}

	// Early check metadata depth (AC-006)
	if (rawRecord && typeof rawRecord === "object") {
		const content = rawRecord.content as Record<string, unknown> | undefined;
		if (content?.metadata) {
			const depth = computeMetadataDepth(content.metadata);
			if (depth > MAX_METADATA_DEPTH) {
				return {
					valid: false,
					issues: [
						{
							code: "METADATA_DEPTH_EXCEEDED",
							path: "content.metadata",
							message: `Metadata nesting depth exceeds maximum of ${MAX_METADATA_DEPTH} (received ${depth})`,
							entityIds: [],
						},
					],
				};
			}
		}
	}

	return { valid: true, issues: [], doc };
}

// ----------------------------------------------------------------------------
// Valibot Issue Mapping Helper
// ----------------------------------------------------------------------------

type ValibotIssue = NonNullable<
	ReturnType<typeof v.safeParse>["issues"]
>[number];

function mapValibotIssue(issue: ValibotIssue): ValidationIssue {
	const path = issue.path
		? issue.path
				.map((p: { key: unknown }) =>
					typeof p.key === "number" ? `[${p.key}]` : `.${String(p.key)}`,
				)
				.join("")
				.replace(/^\./, "")
		: "";

	let code = "SCHEMA_VALIDATION_ERROR";
	if (issue.expected === "never") {
		code = "UNKNOWN_FIELD";
	} else if (
		path.endsWith(".x") ||
		path.endsWith(".y") ||
		path.includes(".transform.") ||
		issue.message?.toLowerCase().includes("coordinate") ||
		issue.type === "finite"
	) {
		code = "INVALID_COORDINATE";
	} else if (
		issue.message?.toLowerCase().includes("positive") ||
		issue.message?.toLowerCase().includes("dimension")
	) {
		code = "NON_POSITIVE_DIMENSION";
	} else if (issue.message?.toLowerCase().includes("angle")) {
		code = "INVALID_ANGLE";
	} else if (
		issue.message?.toLowerCase().includes("id format") ||
		issue.message?.toLowerCase().includes("invalid id") ||
		path.endsWith(".id") ||
		path === "documentId"
	) {
		code = "INVALID_ID_FORMAT";
	} else if (issue.message?.toLowerCase().includes("iso date")) {
		code = "INVALID_ISO_DATE";
	}

	const entityIds: string[] = [];
	const match = path.match(/^content\.entities\.([^.[\]]+)/);
	if (match) {
		entityIds.push(match[1]);
	}

	return {
		code,
		path,
		message: issue.message ?? "Schema validation failed",
		entityIds,
	};
}

// ----------------------------------------------------------------------------
// Full Document Validation (§4.3)
// ----------------------------------------------------------------------------

/**
 * Validates a Blueprint document across all structural, numerical, referential,
 * and geometric invariants.
 */
export function validateBlueprintDocument(
	input: unknown,
	options: DocumentValidationOptions = {},
): ValidationResult {
	const issues: ValidationIssue[] = [];

	if (!input || typeof input !== "object") {
		return {
			valid: false,
			issues: [
				{
					code: "INVALID_DOCUMENT",
					path: "",
					message: "Document must be an object",
					entityIds: [],
				},
			],
		};
	}

	const docRecord = input as Record<string, unknown>;

	// Check format
	if (docRecord.format !== "blueprint") {
		issues.push({
			code: "INVALID_FORMAT",
			path: "format",
			message: 'Document format must be "blueprint"',
			entityIds: [],
		});
	}

	// Check schemaVersion (AC-005)
	if (docRecord.schemaVersion !== 1) {
		issues.push({
			code: "UNSUPPORTED_SCHEMA_VERSION",
			path: "schemaVersion",
			message: `Unsupported schema version: ${docRecord.schemaVersion}. Expected version 1.`,
			entityIds: [],
		});
		return {
			valid: false,
			issues: issues.sort(
				(a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code),
			),
		};
	}

	// Run Valibot strict schema validation
	const parseResult = v.safeParse(BlueprintDocumentSchema, input);
	if (!parseResult.success) {
		for (const issue of parseResult.issues) {
			issues.push(mapValibotIssue(issue));
		}
	}

	const doc = input as BlueprintDocument;
	const content = doc.content as DocumentContent | undefined;
	if (!content) {
		return {
			valid: false,
			issues: issues.sort(
				(a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code),
			),
		};
	}

	// --------------------------------------------------------------------------
	// 1. Check Metadata Depths and Total Size
	// --------------------------------------------------------------------------
	let totalMetadataBytes = 0;
	if (content.metadata) {
		const d = computeMetadataDepth(content.metadata);
		if (d > MAX_METADATA_DEPTH) {
			issues.push({
				code: "METADATA_DEPTH_EXCEEDED",
				path: "content.metadata",
				message: `Metadata nesting depth exceeds maximum of ${MAX_METADATA_DEPTH} (received ${d})`,
				entityIds: [],
			});
		}
		totalMetadataBytes += JSON.stringify(content.metadata).length;
	}

	if (content.entities) {
		for (const [eId, entity] of Object.entries(content.entities)) {
			if (entity.metadata) {
				const d = computeMetadataDepth(entity.metadata);
				if (d > MAX_METADATA_DEPTH) {
					issues.push({
						code: "METADATA_DEPTH_EXCEEDED",
						path: `content.entities.${eId}.metadata`,
						message: `Entity metadata nesting depth exceeds maximum of ${MAX_METADATA_DEPTH} (received ${d})`,
						entityIds: [eId],
					});
				}
				totalMetadataBytes += JSON.stringify(entity.metadata).length;
			}
		}
	}

	if (totalMetadataBytes > MAX_TOTAL_METADATA_BYTES) {
		issues.push({
			code: "METADATA_SIZE_EXCEEDED",
			path: "content.metadata",
			message: `Total metadata size exceeds 1 MiB limit (received ${totalMetadataBytes} bytes)`,
			entityIds: [],
		});
	}

	// --------------------------------------------------------------------------
	// 2. Collection Size Limits
	// --------------------------------------------------------------------------
	const entityCount = Object.keys(content.entities ?? {}).length;
	if (entityCount > MAX_ENTITIES_COUNT) {
		issues.push({
			code: "MAX_ENTITIES_EXCEEDED",
			path: "content.entities",
			message: `Maximum entity count of ${MAX_ENTITIES_COUNT} exceeded (received ${entityCount})`,
			entityIds: [],
		});
	}

	const layerCount = content.layers?.length ?? 0;
	if (layerCount > MAX_LAYERS_COUNT) {
		issues.push({
			code: "MAX_LAYERS_EXCEEDED",
			path: "content.layers",
			message: `Maximum layer count of ${MAX_LAYERS_COUNT} exceeded (received ${layerCount})`,
			entityIds: [],
		});
	}

	const groupCount = content.groups?.length ?? 0;
	if (groupCount > MAX_GROUPS_COUNT) {
		issues.push({
			code: "MAX_GROUPS_EXCEEDED",
			path: "content.groups",
			message: `Maximum group count of ${MAX_GROUPS_COUNT} exceeded (received ${groupCount})`,
			entityIds: [],
		});
	}

	const defCount = Object.keys(content.definitions ?? {}).length;
	if (defCount > MAX_DEFINITIONS_COUNT) {
		issues.push({
			code: "MAX_DEFINITIONS_EXCEEDED",
			path: "content.definitions",
			message: `Maximum definitions count of ${MAX_DEFINITIONS_COUNT} exceeded (received ${defCount})`,
			entityIds: [],
		});
	}

	const assetCount = Object.keys(content.assets ?? {}).length;
	if (assetCount > MAX_ASSETS_COUNT) {
		issues.push({
			code: "MAX_ASSETS_EXCEEDED",
			path: "content.assets",
			message: `Maximum assets count of ${MAX_ASSETS_COUNT} exceeded (received ${assetCount})`,
			entityIds: [],
		});
	}

	// --------------------------------------------------------------------------
	// 3. Map Key Consistency & Unique IDs (§4.3 Rule 4, AC-003)
	// --------------------------------------------------------------------------
	const allEntityIds = new Set<string>();
	if (content.entities) {
		for (const [key, entity] of Object.entries(content.entities)) {
			if (entity.id !== key) {
				issues.push({
					code: "MAP_KEY_MISMATCH",
					path: `content.entities.${key}`,
					message: `Map key '${key}' does not match entity id '${entity.id}'`,
					entityIds: [entity.id],
				});
			}
			if (allEntityIds.has(entity.id)) {
				issues.push({
					code: "DUPLICATE_ID",
					path: `content.entities.${key}`,
					message: `Duplicate entity ID '${entity.id}' detected`,
					entityIds: [entity.id],
				});
			}
			allEntityIds.add(entity.id);
		}
	}

	if (content.definitions) {
		const seenDefs = new Set<string>();
		for (const [key, def] of Object.entries(content.definitions)) {
			if (def.id !== key) {
				issues.push({
					code: "MAP_KEY_MISMATCH",
					path: `content.definitions.${key}`,
					message: `Map key '${key}' does not match definition id '${def.id}'`,
					entityIds: [],
				});
			}
			if (seenDefs.has(def.id)) {
				issues.push({
					code: "DUPLICATE_ID",
					path: `content.definitions.${key}`,
					message: `Duplicate definition ID '${def.id}' detected`,
					entityIds: [],
				});
			}
			seenDefs.add(def.id);
		}
	}

	if (content.assets) {
		const seenAssets = new Set<string>();
		for (const [key, asset] of Object.entries(content.assets)) {
			if (asset.id !== key) {
				issues.push({
					code: "MAP_KEY_MISMATCH",
					path: `content.assets.${key}`,
					message: `Map key '${key}' does not match asset id '${asset.id}'`,
					entityIds: [],
				});
			}
			if (seenAssets.has(asset.id)) {
				issues.push({
					code: "DUPLICATE_ID",
					path: `content.assets.${key}`,
					message: `Duplicate asset ID '${asset.id}' detected`,
					entityIds: [],
				});
			}
			seenAssets.add(asset.id);
		}
	}

	// Check layer IDs uniqueness
	const layerMap = new Map<string, (typeof content.layers)[number]>();
	if (content.layers) {
		for (let i = 0; i < content.layers.length; i++) {
			const layer = content.layers[i];
			if (layerMap.has(layer.id)) {
				issues.push({
					code: "DUPLICATE_ID",
					path: `content.layers[${i}].id`,
					message: `Duplicate layer ID '${layer.id}' detected`,
					entityIds: [],
				});
			}
			layerMap.set(layer.id, layer);
		}
	}

	// Check group IDs uniqueness
	const groupMap = new Map<string, (typeof content.groups)[number]>();
	if (content.groups) {
		for (let i = 0; i < content.groups.length; i++) {
			const group = content.groups[i];
			if (groupMap.has(group.id)) {
				issues.push({
					code: "DUPLICATE_ID",
					path: `content.groups[${i}].id`,
					message: `Duplicate group ID '${group.id}' detected`,
					entityIds: [],
				});
			}
			groupMap.set(group.id, group);
		}
	}

	// --------------------------------------------------------------------------
	// 4. Hierarchy Checks: Preset Layers, Cycles, Max Depth, Single Layer (§4.3 Rule 5)
	// --------------------------------------------------------------------------
	// 4.1 Preset layers
	const presentRoles = new Set(content.layers?.map((l) => l.role) ?? []);
	for (const role of PRESET_LAYER_ROLES) {
		if (!presentRoles.has(role)) {
			issues.push({
				code: "MISSING_PRESET_LAYER",
				path: "content.layers",
				message: `Required preset layer with role '${role}' is missing`,
				entityIds: [],
			});
		}
	}

	// 4.2 Layer hierarchy cycles and depth
	if (content.layers) {
		for (let i = 0; i < content.layers.length; i++) {
			const layer = content.layers[i];
			if (layer.parentId !== null) {
				if (!layerMap.has(layer.parentId)) {
					issues.push({
						code: "DANGLING_LAYER_PARENT",
						path: `content.layers[${i}].parentId`,
						message: `Layer '${layer.id}' references nonexistent parent layer '${layer.parentId}'`,
						entityIds: [],
					});
					continue;
				}

				// Cycle & depth check
				let curr: string | null = layer.parentId;
				const visited = new Set<string>([layer.id]);
				let depth = 1;
				while (curr !== null) {
					if (visited.has(curr)) {
						issues.push({
							code: "HIERARCHY_CYCLE",
							path: `content.layers[${i}].parentId`,
							message: `Layer hierarchy cycle detected at layer '${layer.id}'`,
							entityIds: [],
						});
						break;
					}
					visited.add(curr);
					depth++;
					if (depth > 8) {
						issues.push({
							code: "HIERARCHY_DEPTH_EXCEEDED",
							path: `content.layers[${i}].parentId`,
							message: `Layer hierarchy depth exceeds limit of 8 at layer '${layer.id}'`,
							entityIds: [],
						});
						break;
					}
					const parentLayer = layerMap.get(curr);
					curr = parentLayer?.parentId ?? null;
				}
			}
		}
	}

	// 4.3 Group hierarchy cycles and depth
	if (content.groups) {
		for (let i = 0; i < content.groups.length; i++) {
			const group = content.groups[i];
			if (group.parentId !== null) {
				if (!groupMap.has(group.parentId)) {
					issues.push({
						code: "DANGLING_GROUP_PARENT",
						path: `content.groups[${i}].parentId`,
						message: `Group '${group.id}' references nonexistent parent group '${group.parentId}'`,
						entityIds: [],
					});
					continue;
				}

				let curr: string | null = group.parentId;
				const visited = new Set<string>([group.id]);
				let depth = 1;
				while (curr !== null) {
					if (visited.has(curr)) {
						issues.push({
							code: "HIERARCHY_CYCLE",
							path: `content.groups[${i}].parentId`,
							message: `Group hierarchy cycle detected at group '${group.id}'`,
							entityIds: [],
						});
						break;
					}
					visited.add(curr);
					depth++;
					if (depth > 8) {
						issues.push({
							code: "HIERARCHY_DEPTH_EXCEEDED",
							path: `content.groups[${i}].parentId`,
							message: `Group hierarchy depth exceeds limit of 8 at group '${group.id}'`,
							entityIds: [],
						});
						break;
					}
					const parentGroup = groupMap.get(curr);
					curr = parentGroup?.parentId ?? null;
				}
			}
		}
	}

	// 4.4 Groups may span only one layer
	if (content.groups && content.entities) {
		for (let i = 0; i < content.groups.length; i++) {
			const group = content.groups[i];
			const groupLayerIds = new Set<string>();
			for (const entity of Object.values(content.entities)) {
				if (entity.groupId === group.id) {
					groupLayerIds.add(entity.layerId);
				}
			}
			if (groupLayerIds.size > 1) {
				issues.push({
					code: "GROUP_SPAN_MULTIPLE_LAYERS",
					path: `content.groups[${i}]`,
					message: `Group '${group.id}' spans multiple layers (${Array.from(groupLayerIds).join(", ")})`,
					entityIds: [],
				});
			}
		}
	}

	// --------------------------------------------------------------------------
	// 5. EntityOrder Check: Exact Permutation (§4.3 Rule 5)
	// --------------------------------------------------------------------------
	if (content.entityOrder && content.entities) {
		const orderSet = new Set(content.entityOrder);
		const entityKeySet = new Set(Object.keys(content.entities));

		if (
			content.entityOrder.length !== entityKeySet.size ||
			orderSet.size !== entityKeySet.size
		) {
			issues.push({
				code: "INVALID_ENTITY_ORDER",
				path: "content.entityOrder",
				message: `entityOrder length (${content.entityOrder.length}) does not match entities count (${entityKeySet.size}) or contains duplicates`,
				entityIds: [],
			});
		} else {
			for (const id of content.entityOrder) {
				if (!entityKeySet.has(id)) {
					issues.push({
						code: "INVALID_ENTITY_ORDER",
						path: "content.entityOrder",
						message: `entityOrder contains ID '${id}' which is not in entities`,
						entityIds: [id],
					});
					break;
				}
			}
		}
	}

	// --------------------------------------------------------------------------
	// 6. Referential Integrity & Entity Invariants (§4.3 Rule 5, 6)
	// --------------------------------------------------------------------------
	const wallMap = new Map<string, Extract<Entity, { kind: "wall" }>>();
	const openingsByWallSegment = new Map<
		string,
		Array<{ id: string; offsetMm: number; widthMm: number }>
	>();

	let totalBezierVertices = 0;

	if (content.entities) {
		for (const [eId, entity] of Object.entries(content.entities)) {
			// Layer reference
			if (!layerMap.has(entity.layerId)) {
				issues.push({
					code: "DANGLING_LAYER",
					path: `content.entities.${eId}.layerId`,
					message: `Entity '${eId}' references nonexistent layer '${entity.layerId}'`,
					entityIds: [eId],
				});
			}

			// Group reference
			if (entity.groupId !== null && !groupMap.has(entity.groupId)) {
				issues.push({
					code: "DANGLING_GROUP",
					path: `content.entities.${eId}.groupId`,
					message: `Entity '${eId}' references nonexistent group '${entity.groupId}'`,
					entityIds: [eId],
				});
			}

			// Kind-specific validation
			switch (entity.kind) {
				case "shape": {
					if (entity.geometry.kind === "polygon") {
						for (const poly of entity.geometry.polygons) {
							const polyIssues = validatePolygonGeometry(
								poly,
								`content.entities.${eId}.geometry`,
								[eId],
							);
							issues.push(...polyIssues);
						}
					} else if (entity.geometry.kind === "path") {
						totalBezierVertices += entity.geometry.segments.length;
					}
					break;
				}

				case "wall": {
					wallMap.set(eId, entity);
					// Unique vertices in wall
					const seenVertexIds = new Set<string>();
					for (let vIdx = 0; vIdx < entity.vertices.length; vIdx++) {
						const v = entity.vertices[vIdx];
						if (seenVertexIds.has(v.id)) {
							issues.push({
								code: "DUPLICATE_VERTEX_ID",
								path: `content.entities.${eId}.vertices[${vIdx}].id`,
								message: `Duplicate vertex ID '${v.id}' in wall '${eId}'`,
								entityIds: [eId],
							});
						}
						seenVertexIds.add(v.id);
					}

					// Non-zero segments
					for (let i = 0; i < entity.vertices.length - 1; i++) {
						const v1 = entity.vertices[i].point;
						const v2 = entity.vertices[i + 1].point;
						const dist = Math.hypot(v2.x - v1.x, v2.y - v1.y);
						if (dist < GEOMETRY_EPSILON_MM) {
							issues.push({
								code: "DEGENERATE_WALL_SEGMENT",
								path: `content.entities.${eId}.vertices[${i}]`,
								message: `Wall '${eId}' has degenerate segment of length ${dist.toFixed(4)} mm`,
								entityIds: [eId],
							});
						}
					}
					break;
				}

				case "opening": {
					// Transform MUST be identity
					if (
						entity.transform.x !== 0 ||
						entity.transform.y !== 0 ||
						entity.transform.rotationDeg !== 0
					) {
						issues.push({
							code: "INVALID_TRANSFORM",
							path: `content.entities.${eId}.transform`,
							message:
								"Opening transform MUST be identity (x: 0, y: 0, rotationDeg: 0)",
							entityIds: [eId],
						});
					}

					// Wall reference
					const targetWall = content.entities[entity.wallId];
					if (!targetWall || targetWall.kind !== "wall") {
						issues.push({
							code: "DANGLING_WALL",
							path: `content.entities.${eId}.wallId`,
							message: `Opening '${eId}' references nonexistent wall '${entity.wallId}'`,
							entityIds: [eId],
						});
					} else {
						// Segment start / end consecutive check
						const wallVerts = targetWall.vertices;
						const startIdx = wallVerts.findIndex(
							(v) => v.id === entity.segmentStartId,
						);
						const endIdx = wallVerts.findIndex(
							(v) => v.id === entity.segmentEndId,
						);

						let isConsecutive = false;
						if (startIdx !== -1 && endIdx !== -1) {
							if (
								endIdx === startIdx + 1 ||
								(targetWall.closed &&
									startIdx === wallVerts.length - 1 &&
									endIdx === 0)
							) {
								isConsecutive = true;
							}
						}

						if (!isConsecutive) {
							issues.push({
								code: "INVALID_WALL_SEGMENT",
								path: `content.entities.${eId}.segmentStartId`,
								message: `Segment '${entity.segmentStartId}' -> '${entity.segmentEndId}' are not consecutive vertices on wall '${entity.wallId}'`,
								entityIds: [eId],
							});
						} else {
							// Length and offset bounds
							const p1 = wallVerts[startIdx].point;
							const p2 = wallVerts[endIdx].point;
							const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
							if (
								entity.offsetMm < 0 ||
								entity.offsetMm + entity.widthMm > segLen + GEOMETRY_EPSILON_MM
							) {
								issues.push({
									code: "INVALID_OPENING_OFFSET",
									path: `content.entities.${eId}.offsetMm`,
									message: `Opening bounds [${entity.offsetMm}, ${entity.offsetMm + entity.widthMm}] exceed wall segment length ${segLen.toFixed(3)} mm`,
									entityIds: [eId],
								});
							}

							// Record for overlapping openings check
							const segKey = `${entity.wallId}:${entity.segmentStartId}:${entity.segmentEndId}`;
							const list = openingsByWallSegment.get(segKey) ?? [];
							list.push({
								id: eId,
								offsetMm: entity.offsetMm,
								widthMm: entity.widthMm,
							});
							openingsByWallSegment.set(segKey, list);
						}
					}
					break;
				}

				case "zone": {
					const polyIssues = validatePolygonGeometry(
						entity.polygon,
						`content.entities.${eId}.polygon`,
						[eId],
					);
					issues.push(...polyIssues);
					break;
				}

				case "device": {
					const def = content.definitions?.[entity.definitionId];
					if (!def) {
						issues.push({
							code: "DANGLING_DEFINITION",
							path: `content.entities.${eId}.definitionId`,
							message: `Device '${eId}' references nonexistent definition '${entity.definitionId}'`,
							entityIds: [eId],
						});
					} else if (def.sizing === "rigid") {
						// Rigid definitions reject parameter keys not in defaults
						const defaultKeys = new Set(Object.keys(def.defaults));
						for (const paramKey of Object.keys(entity.parameters)) {
							if (!defaultKeys.has(paramKey)) {
								issues.push({
									code: "INVALID_DEVICE_PARAMETER",
									path: `content.entities.${eId}.parameters.${paramKey}`,
									message: `Rigid device '${eId}' provides unknown parameter '${paramKey}' not present in definition defaults`,
									entityIds: [eId],
								});
							}
						}
					}
					break;
				}

				case "dimension": {
					if (
						entity.transform.x !== 0 ||
						entity.transform.y !== 0 ||
						entity.transform.rotationDeg !== 0
					) {
						issues.push({
							code: "INVALID_TRANSFORM",
							path: `content.entities.${eId}.transform`,
							message:
								"Dimension transform MUST be identity (x: 0, y: 0, rotationDeg: 0)",
							entityIds: [eId],
						});
					}
					validateAnchor(
						entity.a,
						`content.entities.${eId}.a`,
						eId,
						content,
						issues,
					);
					validateAnchor(
						entity.b,
						`content.entities.${eId}.b`,
						eId,
						content,
						issues,
					);
					break;
				}

				case "annotation": {
					if (
						entity.transform.x !== 0 ||
						entity.transform.y !== 0 ||
						entity.transform.rotationDeg !== 0
					) {
						issues.push({
							code: "INVALID_TRANSFORM",
							path: `content.entities.${eId}.transform`,
							message:
								"Annotation transform MUST be identity (x: 0, y: 0, rotationDeg: 0)",
							entityIds: [eId],
						});
					}
					validateAnchor(
						entity.anchor,
						`content.entities.${eId}.anchor`,
						eId,
						content,
						issues,
					);
					break;
				}

				case "reference": {
					if (!content.assets?.[entity.assetId]) {
						issues.push({
							code: "DANGLING_ASSET",
							path: `content.entities.${eId}.assetId`,
							message: `Reference '${eId}' references nonexistent asset '${entity.assetId}'`,
							entityIds: [eId],
						});
					}
					break;
				}
			}
		}
	}

	// --------------------------------------------------------------------------
	// 7. Check Overlapping Openings on Same Wall Segment (§4.3 Rule 6)
	// --------------------------------------------------------------------------
	for (const [, openings] of openingsByWallSegment) {
		if (openings.length > 1) {
			openings.sort((a, b) => a.offsetMm - b.offsetMm);
			for (let i = 0; i < openings.length - 1; i++) {
				const cur = openings[i];
				const next = openings[i + 1];
				if (cur.offsetMm + cur.widthMm > next.offsetMm + GEOMETRY_EPSILON_MM) {
					issues.push({
						code: "OVERLAPPING_OPENINGS",
						path: `content.entities.${next.id}`,
						message: `Openings '${cur.id}' and '${next.id}' overlap on the same wall segment`,
						entityIds: [cur.id, next.id],
					});
				}
			}
		}
	}

	// --------------------------------------------------------------------------
	// 8. Device Definitions Geometries & Port Checks
	// --------------------------------------------------------------------------
	if (content.definitions) {
		for (const [defId, def] of Object.entries(content.definitions)) {
			const fpIssues = validatePolygonGeometry(
				def.footprint,
				`content.definitions.${defId}.footprint`,
				[],
			);
			issues.push(...fpIssues);

			const clIssues = validatePolygonGeometry(
				def.clearance,
				`content.definitions.${defId}.clearance`,
				[],
			);
			issues.push(...clIssues);

			for (const part of def.symbol) {
				if (part.geometry.kind === "path") {
					totalBezierVertices += part.geometry.segments.length;
				}
			}
		}
	}

	// Check total Bezier vertices cap
	if (totalBezierVertices > MAX_BEZIER_VERTICES_COUNT) {
		issues.push({
			code: "MAX_BEZIER_VERTICES_EXCEEDED",
			path: "content.entities",
			message: `Total Bezier vertices (${totalBezierVertices}) exceeds cap of ${MAX_BEZIER_VERTICES_COUNT}`,
			entityIds: [],
		});
	}

	function validateDeviceRelationEndpoint(
		deviceId: string,
		relPath: string,
		entities: Record<string, Entity> | undefined,
		issues: ValidationIssue[],
	): void {
		const dev = entities?.[deviceId];
		if (!dev || dev.kind !== "device") {
			issues.push({
				code: "DANGLING_RELATION_ENDPOINT",
				path: `${relPath}.deviceId`,
				message: `Relation references invalid device '${deviceId}'`,
				entityIds: [deviceId],
			});
		}
	}

	// --------------------------------------------------------------------------
	// 9. Relations Endpoint Referential Integrity (§4.3 Rule 5)
	// --------------------------------------------------------------------------
	if (content.relations) {
		const lineMap = new Map(content.lines?.map((l) => [l.id, l]) ?? []);
		for (let i = 0; i < content.relations.length; i++) {
			const rel = content.relations[i];
			const relPath = `content.relations[${i}]`;
			switch (rel.kind) {
				case "memberOfLine": {
					validateDeviceRelationEndpoint(
						rel.deviceId,
						relPath,
						content.entities,
						issues,
					);
					if (!lineMap.has(rel.lineId)) {
						issues.push({
							code: "DANGLING_RELATION_ENDPOINT",
							path: `${relPath}.lineId`,
							message: `Relation references invalid line '${rel.lineId}'`,
							entityIds: [],
						});
					}
					break;
				}
				case "observes": {
					if (!content.entities?.[rel.sensorId]) {
						issues.push({
							code: "DANGLING_RELATION_ENDPOINT",
							path: `${relPath}.sensorId`,
							message: `Relation references invalid sensor '${rel.sensorId}'`,
							entityIds: [rel.sensorId],
						});
					}
					if (!content.entities?.[rel.assetId]) {
						issues.push({
							code: "DANGLING_RELATION_ENDPOINT",
							path: `${relPath}.assetId`,
							message: `Relation references invalid asset '${rel.assetId}'`,
							entityIds: [rel.assetId],
						});
					}
					break;
				}
				case "flow": {
					const fromDev = content.entities?.[rel.fromDeviceId];
					if (!fromDev || fromDev.kind !== "device") {
						issues.push({
							code: "DANGLING_RELATION_ENDPOINT",
							path: `${relPath}.fromDeviceId`,
							message: `Flow relation references invalid source device '${rel.fromDeviceId}'`,
							entityIds: [rel.fromDeviceId],
						});
					} else {
						const fromDef = content.definitions?.[fromDev.definitionId];
						if (
							fromDef &&
							!fromDef.ports.some((p) => p.id === rel.fromPortId)
						) {
							issues.push({
								code: "DANGLING_PORT_REFERENCE",
								path: `${relPath}.fromPortId`,
								message: `Port '${rel.fromPortId}' not found on source device definition '${fromDev.definitionId}'`,
								entityIds: [rel.fromDeviceId],
							});
						}
					}

					const toDev = content.entities?.[rel.toDeviceId];
					if (!toDev || toDev.kind !== "device") {
						issues.push({
							code: "DANGLING_RELATION_ENDPOINT",
							path: `${relPath}.toDeviceId`,
							message: `Flow relation references invalid target device '${rel.toDeviceId}'`,
							entityIds: [rel.toDeviceId],
						});
					} else {
						const toDef = content.definitions?.[toDev.definitionId];
						if (toDef && !toDef.ports.some((p) => p.id === rel.toPortId)) {
							issues.push({
								code: "DANGLING_PORT_REFERENCE",
								path: `${relPath}.toPortId`,
								message: `Port '${rel.toPortId}' not found on target device definition '${toDev.definitionId}'`,
								entityIds: [rel.toDeviceId],
							});
						}
					}
					break;
				}
				case "assignedZone": {
					validateDeviceRelationEndpoint(
						rel.deviceId,
						relPath,
						content.entities,
						issues,
					);
					const zone = content.entities?.[rel.zoneId];
					if (!zone || zone.kind !== "zone") {
						issues.push({
							code: "DANGLING_RELATION_ENDPOINT",
							path: `${relPath}.zoneId`,
							message: `Relation references invalid zone '${rel.zoneId}'`,
							entityIds: [rel.zoneId],
						});
					}
					break;
				}
			}
		}
	}

	// --------------------------------------------------------------------------
	// 10. Embedded Assets Verification (§4.3 Rule 7)
	// --------------------------------------------------------------------------
	if (content.assets && !options.skipAssetDecoding) {
		let totalAssetBytes = 0;
		for (const [assetId, asset] of Object.entries(content.assets)) {
			const assetPath = `content.assets.${assetId}`;

			// Dimension limits: <= 16 megapixels
			const pixels = asset.widthPx * asset.heightPx;
			if (pixels > MAX_IMAGE_PIXELS) {
				issues.push({
					code: "ASSET_DIMENSIONS_EXCEEDED",
					path: `${assetPath}.widthPx`,
					message: `Asset '${assetId}' dimensions (${asset.widthPx}x${asset.heightPx} = ${pixels} px) exceed 16 megapixel limit`,
					entityIds: [],
				});
			}

			// Decode base64 to bytes
			let decodedBytes: Uint8Array;
			try {
				const binaryStr = atob(asset.base64);
				decodedBytes = new Uint8Array(binaryStr.length);
				for (let i = 0; i < binaryStr.length; i++) {
					decodedBytes[i] = binaryStr.charCodeAt(i);
				}
			} catch (e) {
				issues.push({
					code: "INVALID_ASSET_BASE64",
					path: `${assetPath}.base64`,
					message: `Failed to decode base64 for asset '${assetId}': ${e instanceof Error ? e.message : String(e)}`,
					entityIds: [],
				});
				continue;
			}

			totalAssetBytes += decodedBytes.byteLength;

			// Per-asset byte limit (8 MiB)
			if (decodedBytes.byteLength > MAX_IMAGE_BYTES) {
				issues.push({
					code: "ASSET_SIZE_EXCEEDED",
					path: `${assetPath}.base64`,
					message: `Asset '${assetId}' size (${decodedBytes.byteLength} bytes) exceeds 8 MiB limit`,
					entityIds: [],
				});
			}

			// SHA-256 hash match
			const actualSha256 = computeSha256(decodedBytes);
			if (actualSha256.toLowerCase() !== asset.sha256.toLowerCase()) {
				issues.push({
					code: "ASSET_HASH_MISMATCH",
					path: `${assetPath}.sha256`,
					message: `Asset '${assetId}' SHA-256 mismatch: declared ${asset.sha256}, computed ${actualSha256}`,
					entityIds: [],
				});
			}
		}

		if (totalAssetBytes > MAX_TOTAL_IMAGE_BYTES) {
			issues.push({
				code: "TOTAL_ASSETS_SIZE_EXCEEDED",
				path: "content.assets",
				message: `Total asset bytes (${totalAssetBytes}) exceeds 12 MiB limit`,
				entityIds: [],
			});
		}
	}

	// --------------------------------------------------------------------------
	// Sort by path, then code (§4.3)
	// --------------------------------------------------------------------------
	issues.sort(
		(a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code),
	);

	return {
		valid: issues.length === 0,
		issues,
	};
}

// ----------------------------------------------------------------------------
// Anchor Validation Helper
// ----------------------------------------------------------------------------

function validateFeatureInVertexList(
	featureId: string | null,
	vertexIds: readonly string[],
	path: string,
	targetDesc: string,
	entityId: string,
	issues: ValidationIssue[],
): void {
	if (!featureId || !vertexIds.includes(featureId)) {
		issues.push({
			code: "DANGLING_ANCHOR_FEATURE",
			path: `${path}.featureId`,
			message: `Vertex ID '${featureId}' not found on ${targetDesc}`,
			entityIds: [entityId],
		});
	}
}

function validateAnchor(
	anchor: Anchor,
	path: string,
	entityId: string,
	content: DocumentContent,
	issues: ValidationIssue[],
): void {
	if (anchor.kind === "point") return;

	const target = content.entities?.[anchor.entityId];
	if (!target) {
		issues.push({
			code: "DANGLING_ANCHOR_ENTITY",
			path: `${path}.entityId`,
			message: `Anchor references nonexistent entity '${anchor.entityId}'`,
			entityIds: [entityId],
		});
		return;
	}

	switch (anchor.feature) {
		case "origin":
		case "center":
			if (anchor.featureId !== null) {
				issues.push({
					code: "INVALID_ANCHOR_FEATURE",
					path: `${path}.featureId`,
					message: `Anchor feature '${anchor.feature}' must have featureId null`,
					entityIds: [entityId],
				});
			}
			break;

		case "port": {
			if (target.kind !== "device") {
				issues.push({
					code: "INVALID_ANCHOR_FEATURE",
					path: `${path}.feature`,
					message: `Port anchor can only target device entities (target is '${target.kind}')`,
					entityIds: [entityId],
				});
			} else {
				const def = content.definitions?.[target.definitionId];
				if (def && !def.ports.some((p) => p.id === anchor.featureId)) {
					issues.push({
						code: "DANGLING_ANCHOR_FEATURE",
						path: `${path}.featureId`,
						message: `Port '${anchor.featureId}' not found on device definition '${target.definitionId}'`,
						entityIds: [entityId],
					});
				}
			}
			break;
		}

		case "vertex": {
			if (target.kind === "wall") {
				validateFeatureInVertexList(
					anchor.featureId,
					target.vertices.map((v) => v.id),
					path,
					`wall '${target.id}'`,
					entityId,
					issues,
				);
			} else if (target.kind === "shape") {
				if (target.geometry.kind === "rect") {
					const validCorners = [
						"top-left",
						"top-right",
						"bottom-right",
						"bottom-left",
					];
					if (!anchor.featureId || !validCorners.includes(anchor.featureId)) {
						issues.push({
							code: "DANGLING_ANCHOR_FEATURE",
							path: `${path}.featureId`,
							message: `Rect vertex featureId must be one of: ${validCorners.join(", ")}`,
							entityIds: [entityId],
						});
					}
				} else if (target.geometry.kind === "polygon") {
					validateFeatureInVertexList(
						anchor.featureId,
						target.geometry.polygons.flatMap((p) => [
							...p.outer.map((v) => v.id),
							...p.holes.flatMap((h) => h.map((v) => v.id)),
						]),
						path,
						`shape polygon '${target.id}'`,
						entityId,
						issues,
					);
				} else if (target.geometry.kind === "path") {
					if (
						!target.geometry.segments.some((s) => s.id === anchor.featureId)
					) {
						issues.push({
							code: "DANGLING_ANCHOR_FEATURE",
							path: `${path}.featureId`,
							message: `Segment ID '${anchor.featureId}' not found on path '${target.id}'`,
							entityIds: [entityId],
						});
					}
				}
			} else if (target.kind === "zone") {
				validateFeatureInVertexList(
					anchor.featureId,
					[
						...target.polygon.outer.map((v) => v.id),
						...target.polygon.holes.flatMap((h) => h.map((v) => v.id)),
					],
					path,
					`zone '${target.id}'`,
					entityId,
					issues,
				);
			} else {
				issues.push({
					code: "INVALID_ANCHOR_FEATURE",
					path: `${path}.feature`,
					message: `Target entity '${target.id}' (kind '${target.kind}') does not support vertex anchors`,
					entityIds: [entityId],
				});
			}
			break;
		}
	}
}
