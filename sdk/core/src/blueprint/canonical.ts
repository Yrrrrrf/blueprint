// ============================================================================
// Blueprint Canonical Serialization, Hashing, and Export (§4.4)
// ============================================================================

import type {
	BlueprintDocument,
	DocumentContent,
	Geometry,
	Polygon,
	Ring,
	Transform,
	Vec2,
} from "./types.ts";
import {
	normalizeAngleDeg,
	normalizeZero,
	quantizeMm,
	quantizeTransform,
	quantizeVec2,
} from "./units.ts";

// ----------------------------------------------------------------------------
// Pure TypeScript SHA-256 Implementation (Zero Dependencies)
// ----------------------------------------------------------------------------

const SHA256_K = [
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
	0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
	0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
	0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
	0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
	0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
	0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
	0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
	0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
	0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
	0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/**
 * Computes the SHA-256 hash of a string or byte array in hex format.
 */
export function computeSha256(input: string | Uint8Array): string {
	const bytes =
		typeof input === "string" ? new TextEncoder().encode(input) : input;
	let H0 = 0x6a09e667;
	let H1 = 0xbb67ae85;
	let H2 = 0x3c6ef372;
	let H3 = 0xa54ff53a;
	let H4 = 0x510e527f;
	let H5 = 0x9b05688c;
	let H6 = 0x1f83d9ab;
	let H7 = 0x5be0cd19;

	const l = bytes.length;
	const bitLen = l * 8;
	const rem = (l + 9) % 64;
	const padLen = rem === 0 ? 0 : 64 - rem;
	const totalLen = l + 1 + padLen + 8;
	const buf = new Uint8Array(totalLen);
	buf.set(bytes);
	buf[l] = 0x80;
	const view = new DataView(buf.buffer);
	view.setBigUint64(totalLen - 8, BigInt(bitLen), false);

	const W = new Int32Array(64);
	const rotr = (n: number, b: number) => (n >>> b) | (n << (32 - b));

	for (let i = 0; i < totalLen; i += 64) {
		for (let t = 0; t < 16; t++) {
			W[t] = view.getInt32(i + t * 4, false);
		}
		for (let t = 16; t < 64; t++) {
			const s0 = rotr(W[t - 15], 7) ^ rotr(W[t - 15], 18) ^ (W[t - 15] >>> 3);
			const s1 = rotr(W[t - 2], 17) ^ rotr(W[t - 2], 19) ^ (W[t - 2] >>> 10);
			W[t] = (((W[t - 16] + s0) | 0) + ((W[t - 7] + s1) | 0)) | 0;
		}
		let a = H0;
		let b = H1;
		let c = H2;
		let d = H3;
		let e = H4;
		let f = H5;
		let g = H6;
		let h = H7;
		for (let t = 0; t < 64; t++) {
			const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
			const ch = (e & f) ^ (~e & g);
			const temp1 = (h + S1 + ch + SHA256_K[t] + W[t]) | 0;
			const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
			const maj = (a & b) ^ (a & c) ^ (b & c);
			const temp2 = (S0 + maj) | 0;

			h = g;
			g = f;
			f = e;
			e = (d + temp1) | 0;
			d = c;
			c = b;
			b = a;
			a = (temp1 + temp2) | 0;
		}
		H0 = (H0 + a) | 0;
		H1 = (H1 + b) | 0;
		H2 = (H2 + c) | 0;
		H3 = (H3 + d) | 0;
		H4 = (H4 + e) | 0;
		H5 = (H5 + f) | 0;
		H6 = (H6 + g) | 0;
		H7 = (H7 + h) | 0;
	}

	const out = new Uint8Array(32);
	const outView = new DataView(out.buffer);
	outView.setInt32(0, H0, false);
	outView.setInt32(4, H1, false);
	outView.setInt32(8, H2, false);
	outView.setInt32(12, H3, false);
	outView.setInt32(16, H4, false);
	outView.setInt32(20, H5, false);
	outView.setInt32(24, H6, false);
	outView.setInt32(28, H7, false);

	return Array.from(out)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// ----------------------------------------------------------------------------
// Canonical JSON Serialization
// ----------------------------------------------------------------------------

function serializeCanonicalValue(val: unknown): string {
	if (val === null) {
		return "null";
	}
	if (typeof val === "boolean") {
		return val ? "true" : "false";
	}
	if (typeof val === "number") {
		if (!Number.isFinite(val)) {
			throw new TypeError(`Cannot serialize non-finite number: ${val}`);
		}
		const normalized = normalizeZero(val);
		return String(normalized);
	}
	if (typeof val === "string") {
		return JSON.stringify(val);
	}
	if (Array.isArray(val)) {
		const items = val.map(serializeCanonicalValue);
		return `[${items.join(",")}]`;
	}
	if (typeof val === "object") {
		const obj = val as Record<string, unknown>;
		const keys = Object.keys(obj).sort();
		const entries = keys.map(
			(k) => `${JSON.stringify(k)}:${serializeCanonicalValue(obj[k])}`,
		);
		return `{${entries.join(",")}}`;
	}
	throw new TypeError(`Cannot serialize unsupported value type: ${typeof val}`);
}

/**
 * Serializes any JavaScript value to canonical JSON:
 * - Recursively sorts object keys lexicographically.
 * - Preserves array ordering.
 * - Normalizes -0 to 0.
 * - Emits UTF-8 with trailing newline (LF '\n').
 */
export function serializeCanonicalJson(value: unknown): string {
	return `${serializeCanonicalValue(value)}\n`;
}

/**
 * Computes the SHA-256 content hash of canonical DocumentContent.
 * Excludes envelope timestamps, document ID, and revision monotonically.
 */
export function computeContentHash(content: DocumentContent): string {
	const canonicalJson = serializeCanonicalJson(content);
	return computeSha256(canonicalJson);
}

// ----------------------------------------------------------------------------
// Polygon Normalization & Shoelace Area in Y-Down
// ----------------------------------------------------------------------------

/**
 * Computes the signed shoelace area of a ring in Y-down coordinate space.
 * Outer rings: positive (> 0)
 * Holes: negative (< 0)
 */
export function signedShoelaceArea(ring: readonly Vec2[]): number {
	const n = ring.length;
	if (n < 3) return 0;
	let sum = 0;
	for (let i = 0; i < n; i++) {
		const cur = ring[i];
		const next = ring[(i + 1) % n];
		sum += cur.x * next.y - next.x * cur.y;
	}
	return sum / 2;
}

/**
 * Normalizes a single polygon ring:
 * - Quantizes vertex coordinates to 0.001 mm.
 * - Removes consecutive duplicate vertices within 0.001 mm.
 * - Ensures correct orientation (positive area if isOuter, negative if hole).
 * - Preserves stable vertex IDs.
 */
export function normalizeRing(ring: Ring, isOuter: boolean): Ring {
	if (ring.length === 0) return ring;

	// 1. Quantize coordinates
	const quantized = ring.map((v) => ({
		id: v.id,
		x: quantizeMm(v.x),
		y: quantizeMm(v.y),
	}));

	// 2. Remove consecutive duplicate vertices within epsilon
	const deduped: typeof quantized = [];
	for (let i = 0; i < quantized.length; i++) {
		const prev = deduped[deduped.length - 1];
		const cur = quantized[i];
		if (!prev || Math.hypot(cur.x - prev.x, cur.y - prev.y) >= 0.001) {
			deduped.push(cur);
		}
	}
	// Check last against first
	if (deduped.length > 1) {
		const first = deduped[0];
		const last = deduped[deduped.length - 1];
		if (Math.hypot(last.x - first.x, last.y - first.y) < 0.001) {
			deduped.pop();
		}
	}

	// 3. Orient according to Y-down shoelace
	const area = signedShoelaceArea(deduped);
	if (isOuter && area < 0) {
		// Reverse outer ring to make area positive
		return [...deduped].reverse();
	}
	if (!isOuter && area > 0) {
		// Reverse hole ring to make area negative
		return [...deduped].reverse();
	}
	return deduped;
}

/**
 * Normalizes a polygon (outer ring positive, holes negative).
 */
export function normalizePolygon(poly: Polygon): Polygon {
	return {
		outer: normalizeRing(poly.outer, true),
		holes: poly.holes.map((h) => normalizeRing(h, false)),
	};
}

/**
 * Normalizes a geometry union.
 */
export function normalizeGeometry(geom: Geometry): Geometry {
	switch (geom.kind) {
		case "rect":
			return {
				kind: "rect",
				width: quantizeMm(geom.width),
				height: quantizeMm(geom.height),
				cornerRadius: quantizeMm(geom.cornerRadius),
			};
		case "ellipse":
			return {
				kind: "ellipse",
				width: quantizeMm(geom.width),
				height: quantizeMm(geom.height),
			};
		case "polygon":
			return {
				kind: "polygon",
				polygons: geom.polygons.map(normalizePolygon),
			};
		case "path":
			return {
				kind: "path",
				closed: geom.closed,
				segments: geom.segments.map((seg) => ({
					id: seg.id,
					point: quantizeVec2(seg.point),
					handleIn: quantizeVec2(seg.handleIn),
					handleOut: quantizeVec2(seg.handleOut),
				})),
			};
	}
}

/**
 * Recursively normalizes all numerical precision and ring orientations in a document.
 */
export function normalizeDocument(doc: BlueprintDocument): BlueprintDocument {
	const c = doc.content;

	const normalizedEntities: Record<string, (typeof c.entities)[string]> = {};
	for (const [id, entity] of Object.entries(c.entities)) {
		const base = {
			...entity,
			transform: quantizeTransform(entity.transform),
			style: {
				...entity.style,
				strokeWidthMm: quantizeMm(entity.style.strokeWidthMm),
				opacity: quantizeMm(entity.style.opacity),
				dashMm: entity.style.dashMm.map(quantizeMm),
			},
		};

		switch (entity.kind) {
			case "shape":
				normalizedEntities[id] = {
					...base,
					kind: "shape",
					geometry: normalizeGeometry(entity.geometry),
					structural: entity.structural,
				};
				break;
			case "wall":
				normalizedEntities[id] = {
					...base,
					kind: "wall",
					thicknessMm: quantizeMm(entity.thicknessMm),
					closed: entity.closed,
					vertices: entity.vertices.map((v) => ({
						id: v.id,
						point: quantizeVec2(v.point),
					})),
				};
				break;
			case "opening":
				normalizedEntities[id] = {
					...base,
					kind: "opening",
					transform: { x: 0, y: 0, rotationDeg: 0 },
					wallId: entity.wallId,
					segmentStartId: entity.segmentStartId,
					segmentEndId: entity.segmentEndId,
					offsetMm: quantizeMm(entity.offsetMm),
					widthMm: quantizeMm(entity.widthMm),
					openingType: entity.openingType,
					hinge: entity.hinge,
					swing: entity.swing,
				};
				break;
			case "zone":
				normalizedEntities[id] = {
					...base,
					kind: "zone",
					polygon: normalizePolygon(entity.polygon),
					category: entity.category,
					restricted: entity.restricted,
				};
				break;
			case "device":
				normalizedEntities[id] = {
					...base,
					kind: "device",
					definitionId: entity.definitionId,
					assetKey: entity.assetKey,
					parameters: { ...entity.parameters },
					ratedPowerKw:
						entity.ratedPowerKw !== null
							? quantizeMm(entity.ratedPowerKw)
							: null,
					maintenanceDue: entity.maintenanceDue,
					bindings: entity.bindings.map((b) => ({ ...b })),
				};
				break;
			case "dimension":
				normalizedEntities[id] = {
					...base,
					kind: "dimension",
					transform: { x: 0, y: 0, rotationDeg: 0 },
					a:
						entity.a.kind === "point"
							? { kind: "point", point: quantizeVec2(entity.a.point) }
							: { ...entity.a },
					b:
						entity.b.kind === "point"
							? { kind: "point", point: quantizeVec2(entity.b.point) }
							: { ...entity.b },
					axis: entity.axis,
					offsetMm: quantizeMm(entity.offsetMm),
					displayUnit: entity.displayUnit,
					precision: entity.precision,
				};
				break;
			case "annotation":
				normalizedEntities[id] = {
					...base,
					kind: "annotation",
					transform: { x: 0, y: 0, rotationDeg: 0 },
					anchor:
						entity.anchor.kind === "point"
							? {
									kind: "point",
									point: quantizeVec2(entity.anchor.point),
								}
							: { ...entity.anchor },
					offsetMm: quantizeVec2(entity.offsetMm),
					text: entity.text,
					annotationType: entity.annotationType,
					textHeightMm: quantizeMm(entity.textHeightMm),
				};
				break;
			case "reference":
				normalizedEntities[id] = {
					...base,
					kind: "reference",
					assetId: entity.assetId,
					widthMm: quantizeMm(entity.widthMm),
					heightMm: quantizeMm(entity.heightMm),
					opacity: quantizeMm(entity.opacity),
				};
				break;
		}
	}

	const normalizedDefinitions: Record<string, (typeof c.definitions)[string]> =
		{};
	for (const [id, def] of Object.entries(c.definitions)) {
		normalizedDefinitions[id] = {
			...def,
			nominalWidthMm: quantizeMm(def.nominalWidthMm),
			nominalHeightMm: quantizeMm(def.nominalHeightMm),
			footprint: normalizePolygon(def.footprint),
			clearance: normalizePolygon(def.clearance),
			ports: def.ports.map((p) => ({
				id: p.id,
				point: quantizeVec2(p.point),
				directionDeg: normalizeAngleDeg(p.directionDeg),
			})),
			symbol: def.symbol.map((s) => ({
				id: s.id,
				geometry: normalizeGeometry(s.geometry),
				transform: quantizeTransform(s.transform),
				style: {
					...s.style,
					strokeWidthMm: quantizeMm(s.style.strokeWidthMm),
					opacity: quantizeMm(s.style.opacity),
					dashMm: s.style.dashMm.map(quantizeMm),
				},
			})),
		};
	}

	return {
		format: "blueprint",
		schemaVersion: 1,
		documentId: doc.documentId,
		createdAt: doc.createdAt,
		updatedAt: doc.updatedAt,
		revision: doc.revision,
		content: {
			name: c.name,
			description: c.description,
			unit: "mm",
			displayUnit: c.displayUnit,
			facility: {
				widthMm: quantizeMm(c.facility.widthMm),
				heightMm: quantizeMm(c.facility.heightMm),
			},
			layers: c.layers.map((l) => ({
				...l,
				opacity: quantizeMm(l.opacity),
			})),
			entities: normalizedEntities,
			entityOrder: [...c.entityOrder],
			groups: c.groups.map((g) => ({ ...g })),
			definitions: normalizedDefinitions,
			assets: { ...c.assets },
			lines: c.lines.map((ln) => ({ ...ln })),
			relations: c.relations.map((r) => ({ ...r })),
			grid: {
				origin: quantizeVec2(c.grid.origin),
				minorMm: quantizeMm(c.grid.minorMm),
				majorEvery: c.grid.majorEvery,
				visible: c.grid.visible,
			},
			metadata: { ...c.metadata },
		},
	};
}

// ----------------------------------------------------------------------------
// Export Preparation Helper (AC-008)
// ----------------------------------------------------------------------------

/**
 * Creates a clean copy of the document for native download / export.
 * - Strips runtime session fields (e.g. telemetry samples, selection, viewport, history).
 * - Garbage-collects unused definitions and embedded assets.
 * - Does not mutate the input document.
 */
export function prepareExportDocument(
	doc: BlueprintDocument,
	_runtimeSession?: unknown,
): BlueprintDocument {
	const normalized = normalizeDocument(doc);
	const content = normalized.content;

	// 1. Identify used definitions
	const usedDefIds = new Set<string>();
	for (const entity of Object.values(content.entities)) {
		if (entity.kind === "device") {
			usedDefIds.add(entity.definitionId);
		}
	}

	// 2. Identify used assets
	const usedAssetIds = new Set<string>();
	for (const entity of Object.values(content.entities)) {
		if (entity.kind === "reference") {
			usedAssetIds.add(entity.assetId);
		}
	}
	for (const relation of content.relations) {
		if (relation.kind === "observes") {
			// If assetId refers to embedded asset, keep it
			if (content.assets[relation.assetId]) {
				usedAssetIds.add(relation.assetId);
			}
		}
	}

	// 3. Filter definitions and assets
	const cleanDefinitions: Record<string, (typeof content.definitions)[string]> =
		{};
	for (const [id, def] of Object.entries(content.definitions)) {
		if (usedDefIds.has(id)) {
			cleanDefinitions[id] = def;
		}
	}

	const cleanAssets: Record<string, (typeof content.assets)[string]> = {};
	for (const [id, asset] of Object.entries(content.assets)) {
		if (usedAssetIds.has(id)) {
			cleanAssets[id] = asset;
		}
	}

	// Return strictly clean BlueprintDocument envelope
	return {
		format: "blueprint",
		schemaVersion: 1,
		documentId: normalized.documentId,
		createdAt: normalized.createdAt,
		updatedAt: normalized.updatedAt,
		revision: normalized.revision,
		content: {
			name: content.name,
			description: content.description,
			unit: "mm",
			displayUnit: content.displayUnit,
			facility: { ...content.facility },
			layers: content.layers.map((l) => ({ ...l })),
			entities: { ...content.entities },
			entityOrder: [...content.entityOrder],
			groups: content.groups.map((g) => ({ ...g })),
			definitions: cleanDefinitions,
			assets: cleanAssets,
			lines: content.lines.map((l) => ({ ...l })),
			relations: content.relations.map((r) => ({ ...r })),
			grid: {
				origin: { ...content.grid.origin },
				minorMm: content.grid.minorMm,
				majorEvery: content.grid.majorEvery,
				visible: content.grid.visible,
			},
			metadata: { ...content.metadata },
		},
	};
}
