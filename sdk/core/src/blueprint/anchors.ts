// ============================================================================
// Blueprint Anchors & Dimensions Engine (§7.3, AC-015)
// Anchor resolution, dimension value calculations, and baseline geometry.
// ============================================================================

import type {
	Anchor,
	BezierVertex,
	BlueprintDocument,
	DeviceEntity,
	DimensionEntity,
	Entity,
	Id,
	ShapeEntity,
	Vec2,
	WallEntity,
} from "./types.ts";
import { polygonBounds, worldPoint } from "./geometry.ts";
import { getCatalogDefinition, resolveDeviceDefinition } from "./catalog.ts";
import { GEOMETRY_EPSILON_MM, quantizeMm, quantizeVec2 } from "./units.ts";

/**
 * Resolves an Anchor (point or entity feature) to a world coordinate Vec2 (§7.3).
 */
export function resolveAnchor(doc: BlueprintDocument, anchor: Anchor): Vec2 {
	if (anchor.kind === "point") {
		return quantizeVec2(anchor.point);
	}

	const entity = doc.content.entities[anchor.entityId];
	if (!entity) {
		throw new Error(
			`Cannot resolve anchor: target entity '${anchor.entityId}' not found`,
		);
	}

	switch (anchor.feature) {
		case "origin":
			return worldPoint({ x: 0, y: 0 }, entity.transform);

		case "center":
			return resolveEntityCenter(doc, entity);

		case "port": {
			if (entity.kind !== "device") {
				throw new Error(
					`Cannot resolve port anchor: entity '${entity.id}' is of kind '${entity.kind}', expected 'device'`,
				);
			}
			const def =
				doc.content.definitions[entity.definitionId] ??
				getCatalogDefinition(entity.definitionId);
			if (!def) {
				throw new Error(
					`Definition '${entity.definitionId}' not found for device '${entity.id}'`,
				);
			}
			const activeDef = resolveDeviceDefinition(def, entity.parameters);
			const port = activeDef.ports.find((p) => p.id === anchor.featureId);
			if (!port) {
				throw new Error(
					`Port '${anchor.featureId}' not found on device '${entity.id}'`,
				);
			}
			return worldPoint(port.point, entity.transform);
		}

		case "vertex":
			return resolveEntityVertex(entity, anchor.featureId);
	}
}

function resolveDeviceCenter(
	doc: BlueprintDocument,
	entity: DeviceEntity,
): Vec2 {
	const def =
		doc.content.definitions[entity.definitionId] ??
		getCatalogDefinition(entity.definitionId);
	if (def) {
		const activeDef = resolveDeviceDefinition(def, entity.parameters);
		const bounds = polygonBounds(activeDef.footprint);
		const centerLocal: Vec2 = {
			x: bounds.minX + bounds.width / 2,
			y: bounds.minY + bounds.height / 2,
		};
		return worldPoint(centerLocal, entity.transform);
	}
	return worldPoint({ x: 0, y: 0 }, entity.transform);
}

function resolveShapeCenter(entity: ShapeEntity): Vec2 {
	const geom = entity.geometry;
	if (geom.kind === "rect" || geom.kind === "ellipse") {
		const centerLocal: Vec2 = {
			x: geom.width / 2,
			y: geom.height / 2,
		};
		return worldPoint(centerLocal, entity.transform);
	}
	if (geom.kind === "polygon" && geom.polygons.length > 0) {
		const bounds = polygonBounds(geom.polygons[0]);
		const centerLocal: Vec2 = {
			x: bounds.minX + bounds.width / 2,
			y: bounds.minY + bounds.height / 2,
		};
		return worldPoint(centerLocal, entity.transform);
	}
	if (geom.kind === "path" && geom.segments.length > 0) {
		const pts = geom.segments.map((s: BezierVertex) => s.point);
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const pt of pts) {
			if (pt.x < minX) minX = pt.x;
			if (pt.y < minY) minY = pt.y;
			if (pt.x > maxX) maxX = pt.x;
			if (pt.y > maxY) maxY = pt.y;
		}
		const centerLocal: Vec2 = {
			x: (minX + maxX) / 2,
			y: (minY + maxY) / 2,
		};
		return worldPoint(centerLocal, entity.transform);
	}
	return worldPoint({ x: 0, y: 0 }, entity.transform);
}

function resolveWallCenter(entity: WallEntity): Vec2 {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const v of entity.vertices) {
		const wp = worldPoint(v.point, entity.transform);
		if (wp.x < minX) minX = wp.x;
		if (wp.y < minY) minY = wp.y;
		if (wp.x > maxX) maxX = wp.x;
		if (wp.y > maxY) maxY = wp.y;
	}
	return quantizeVec2({
		x: (minX + maxX) / 2,
		y: (minY + maxY) / 2,
	});
}

/**
 * Resolves the center coordinate of an entity in world space.
 */
function resolveEntityCenter(doc: BlueprintDocument, entity: Entity): Vec2 {
	switch (entity.kind) {
		case "device":
			return resolveDeviceCenter(doc, entity);
		case "shape":
			return resolveShapeCenter(entity);
		case "wall":
			return resolveWallCenter(entity);
		case "zone": {
			const bounds = polygonBounds(entity.polygon);
			return worldPoint(
				{
					x: bounds.minX + bounds.width / 2,
					y: bounds.minY + bounds.height / 2,
				},
				entity.transform,
			);
		}
		case "reference":
			return worldPoint(
				{ x: entity.widthMm / 2, y: entity.heightMm / 2 },
				entity.transform,
			);
		default:
			return worldPoint({ x: 0, y: 0 }, entity.transform);
	}
}

/**
 * Resolves a specific named vertex on an entity in world space.
 */
function resolveEntityVertex(entity: Entity, vertexId: Id | null): Vec2 {
	if (!vertexId) {
		throw new Error(
			`Cannot resolve vertex anchor without featureId on entity '${entity.id}'`,
		);
	}

	if (entity.kind === "wall") {
		const v = entity.vertices.find((item) => item.id === vertexId);
		if (!v) {
			throw new Error(`Vertex '${vertexId}' not found on wall '${entity.id}'`);
		}
		return worldPoint(v.point, entity.transform);
	}

	if (entity.kind === "zone") {
		const v =
			entity.polygon.outer.find((item) => item.id === vertexId) ??
			entity.polygon.holes
				.flatMap((h) => h)
				.find((item) => item.id === vertexId);
		if (!v) {
			throw new Error(`Vertex '${vertexId}' not found on zone '${entity.id}'`);
		}
		return worldPoint(v, entity.transform);
	}

	if (entity.kind === "shape" && entity.geometry.kind === "polygon") {
		for (const p of entity.geometry.polygons) {
			const v =
				p.outer.find((item) => item.id === vertexId) ??
				p.holes.flatMap((h) => h).find((item) => item.id === vertexId);
			if (v) return worldPoint(v, entity.transform);
		}
		throw new Error(
			`Vertex '${vertexId}' not found on polygon shape '${entity.id}'`,
		);
	}

	if (entity.kind === "shape" && entity.geometry.kind === "path") {
		const v = entity.geometry.segments.find((s) => s.id === vertexId);
		if (!v) {
			throw new Error(
				`Vertex '${vertexId}' not found on path shape '${entity.id}'`,
			);
		}
		return worldPoint(v.point, entity.transform);
	}

	throw new Error(
		`Entity '${entity.id}' of kind '${entity.kind}' does not support vertex anchors`,
	);
}

// ----------------------------------------------------------------------------
// Dimension Calculations (§7.3, AC-015)
// ----------------------------------------------------------------------------

/**
 * Computes the measured dimension length in mm (§7.3, AC-015):
 *   - "aligned": Euclidean distance
 *   - "horizontal": Absolute X difference
 *   - "vertical": Absolute Y difference
 */
export function computeDimensionValue(
	doc: BlueprintDocument,
	dimension: DimensionEntity,
): number {
	const a = resolveAnchor(doc, dimension.a);
	const b = resolveAnchor(doc, dimension.b);

	switch (dimension.axis) {
		case "aligned":
			return quantizeMm(Math.hypot(b.x - a.x, b.y - a.y));
		case "horizontal":
			return quantizeMm(Math.abs(b.x - a.x));
		case "vertical":
			return quantizeMm(Math.abs(b.y - a.y));
	}
}

export type DimensionGeometry = {
	aWorld: Vec2;
	bWorld: Vec2;
	valueMm: number;
	baselineStart: Vec2;
	baselineEnd: Vec2;
	normal: Vec2;
	extensionAStart: Vec2;
	extensionAEnd: Vec2;
	extensionBStart: Vec2;
	extensionBEnd: Vec2;
	labelPosition: Vec2;
	labelAngleDeg: number;
};

/**
 * Computes the complete 2D projection geometry for a dimension entity per §7.3:
 *   - Ordered measured axis vector d
 *   - Normalized normal n = (-d.y, d.x) / |d|
 *   - Baseline at anchor projection + n * offsetMm
 *   - Horizontal uses d=(1,0); vertical uses d=(0,1); aligned uses b-a
 *   - Coincident anchors display zero and use normal (0,1)
 */
export function computeDimensionGeometry(
	doc: BlueprintDocument,
	dimension: DimensionEntity,
): DimensionGeometry {
	const a = resolveAnchor(doc, dimension.a);
	const b = resolveAnchor(doc, dimension.b);
	const valueMm = computeDimensionValue(doc, dimension);
	const offsetMm = dimension.offsetMm;

	let baselineStart: Vec2;
	let baselineEnd: Vec2;
	let normal: Vec2;
	let labelAngleDeg = 0;

	if (dimension.axis === "horizontal") {
		// Horizontal: d = (1, 0), normal = (0, 1)
		normal = { x: 0, y: 1 };
		const yBaseline = Math.min(a.y, b.y) + offsetMm;
		baselineStart = { x: a.x, y: yBaseline };
		baselineEnd = { x: b.x, y: yBaseline };
		labelAngleDeg = 0;
	} else if (dimension.axis === "vertical") {
		// Vertical: d = (0, 1), normal = (-1, 0)
		normal = { x: -1, y: 0 };
		const xBaseline = Math.min(a.x, b.x) + offsetMm;
		baselineStart = { x: xBaseline, y: a.y };
		baselineEnd = { x: xBaseline, y: b.y };
		labelAngleDeg = 90;
	} else {
		// Aligned: d = b - a
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const dist = Math.hypot(dx, dy);

		if (dist < GEOMETRY_EPSILON_MM) {
			// Coincident anchors: use horizontal normal (0,1) per §7.3
			normal = { x: 0, y: 1 };
			baselineStart = { x: a.x, y: a.y + offsetMm };
			baselineEnd = { x: b.x, y: b.y + offsetMm };
		} else {
			const tx = dx / dist;
			const ty = dy / dist;
			normal = { x: -ty, y: tx };
			baselineStart = {
				x: a.x + normal.x * offsetMm,
				y: a.y + normal.y * offsetMm,
			};
			baselineEnd = {
				x: b.x + normal.x * offsetMm,
				y: b.y + normal.y * offsetMm,
			};
			// Compute label rotation angle in degrees
			labelAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
			// Keep text readable: normalize so angle is in [-90, 90]
			if (labelAngleDeg > 90) labelAngleDeg -= 180;
			if (labelAngleDeg < -90) labelAngleDeg += 180;
		}
	}

	const labelPosition: Vec2 = {
		x: (baselineStart.x + baselineEnd.x) / 2,
		y: (baselineStart.y + baselineEnd.y) / 2,
	};

	return {
		aWorld: quantizeVec2(a),
		bWorld: quantizeVec2(b),
		valueMm,
		baselineStart: quantizeVec2(baselineStart),
		baselineEnd: quantizeVec2(baselineEnd),
		normal,
		extensionAStart: quantizeVec2(a),
		extensionAEnd: quantizeVec2(baselineStart),
		extensionBStart: quantizeVec2(b),
		extensionBEnd: quantizeVec2(baselineEnd),
		labelPosition: quantizeVec2(labelPosition),
		labelAngleDeg: Math.round(labelAngleDeg * 1000) / 1000,
	};
}

/**
 * Freezes an anchor to an absolute world point coordinate (§7.3).
 * Used when referenced parent geometry or vertices are deleted.
 */
export function freezeAnchor(doc: BlueprintDocument, anchor: Anchor): Anchor {
	if (anchor.kind === "point") {
		return { kind: "point", point: quantizeVec2(anchor.point) };
	}
	const pt = resolveAnchor(doc, anchor);
	return {
		kind: "point",
		point: quantizeVec2(pt),
	};
}
