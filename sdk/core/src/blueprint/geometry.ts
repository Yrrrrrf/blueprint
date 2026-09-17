// ============================================================================
// Blueprint Pure Geometry Engine (§6.1, §4.1, AC-009..AC-013)
// Coordinate transforms, polygon set operations, wall/opening derivation,
// and topological polygon validation.
// ============================================================================

import polygonClipping from "polygon-clipping";
import type {
	Entity,
	Id,
	OpeningEntity,
	Polygon,
	Ring,
	RingVertex,
	Transform,
	ValidationIssue,
	Vec2,
	WallEntity,
} from "./types.ts";
import {
	GEOMETRY_EPSILON_MM,
	MIN_POLYGON_AREA_MM2,
	normalizeAngleDeg,
	quantizeMm,
	quantizeTransform,
	quantizeVec2,
} from "./units.ts";
import { signedShoelaceArea } from "./canonical.ts";
import {
	isRingSelfIntersecting,
	pointInRing,
	ringsIntersect,
	validatePolygonGeometry,
} from "./validation.ts";

// ----------------------------------------------------------------------------
// 1. Coordinate Transforms (AC-009, AC-013)
// ----------------------------------------------------------------------------

/**
 * Transforms a local coordinate into world coordinates (§6.1, AC-009).
 * Applies clockwise rotation in the Y-down coordinate system, then translation:
 *   worldX = local.x * cos(θ) - local.y * sin(θ) + tx
 *   worldY = local.x * sin(θ) + local.y * cos(θ) + ty
 */
export function worldPoint(local: Vec2, transform: Transform): Vec2 {
	const rad = transform.rotationDeg * (Math.PI / 180);
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const wx = local.x * cos - local.y * sin + transform.x;
	const wy = local.x * sin + local.y * cos + transform.y;
	return quantizeVec2({ x: wx, y: wy });
}

/**
 * Inverse transforms a world coordinate back to local coordinates (§6.1, AC-009).
 * Subtracts translation then rotates by -θ:
 *   dx = world.x - tx
 *   dy = world.y - ty
 *   localX = dx * cos(-θ) - dy * sin(-θ)
 *   localY = dx * sin(-θ) + dy * cos(-θ)
 */
export function localPoint(world: Vec2, transform: Transform): Vec2 {
	const dx = world.x - transform.x;
	const dy = world.y - transform.y;
	const rad = -transform.rotationDeg * (Math.PI / 180);
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);
	const lx = dx * cos - dy * sin;
	const ly = dx * sin + dy * cos;
	return quantizeVec2({ x: lx, y: ly });
}

/**
 * Rotates an entity around an arbitrary local center point by deltaDeg (§6.1, AC-013).
 * Preserves the world position of the center point and entity dimensions.
 */
export function rotateAround(
	transform: Transform,
	centerLocal: Vec2,
	deltaDeg: number,
): Transform {
	const currentCenterWorld = worldPoint(centerLocal, transform);
	const newRotationDeg = normalizeAngleDeg(transform.rotationDeg + deltaDeg);
	const rad = newRotationDeg * (Math.PI / 180);
	const cos = Math.cos(rad);
	const sin = Math.sin(rad);

	const rotatedCenterX = centerLocal.x * cos - centerLocal.y * sin;
	const rotatedCenterY = centerLocal.x * sin + centerLocal.y * cos;

	const newTx = currentCenterWorld.x - rotatedCenterX;
	const newTy = currentCenterWorld.y - rotatedCenterY;

	return quantizeTransform({
		x: newTx,
		y: newTy,
		rotationDeg: newRotationDeg,
	});
}

/**
 * Transforms an entire ring into world space using the given transform.
 */
export function transformRing(ring: Ring, transform: Transform): Ring {
	return ring.map((v) => ({
		id: v.id,
		...worldPoint(v, transform),
	}));
}

/**
 * Transforms an entire polygon into world space using the given transform.
 */
export function transformPolygon(poly: Polygon, transform: Transform): Polygon {
	return {
		outer: transformRing(poly.outer, transform),
		holes: poly.holes.map((h) => transformRing(h, transform)),
	};
}

// ----------------------------------------------------------------------------
// 2. Polygon Set Operations via polygon-clipping (§6.1, AC-010, AC-012)
// ----------------------------------------------------------------------------

type ClippingCoord = [number, number];
type ClippingRing = ClippingCoord[];
type ClippingPolygon = ClippingRing[];
type ClippingMultiPolygon = ClippingPolygon[];

/**
 * Converts a Blueprint Polygon to the polygon-clipping library format.
 */
export function blueprintPolygonToClipping(poly: Polygon): ClippingPolygon {
	const convertRing = (ring: Ring): ClippingRing => {
		if (ring.length === 0) return [];
		const coords: ClippingRing = ring.map((v) => [v.x, v.y]);
		// polygon-clipping requires closed rings (first coord repeated at end)
		coords.push([ring[0].x, ring[0].y]);
		return coords;
	};

	return [convertRing(poly.outer), ...poly.holes.map(convertRing)];
}

/**
 * Converts a polygon-clipping polygon back to Blueprint Polygon format.
 * Assigns deterministic vertex IDs and normalizes ring orientations (positive outer, negative holes).
 */
export function clippingToBlueprintPolygon(
	poly: ClippingPolygon,
	idPrefix = "v",
): Polygon {
	const convertRing = (
		clippingRing: ClippingRing,
		isHole: boolean,
		ringIdx: number,
	): Ring => {
		let pts = clippingRing.slice();
		// Strip duplicate closing point if present
		if (
			pts.length > 1 &&
			pts[pts.length - 1][0] === pts[0][0] &&
			pts[pts.length - 1][1] === pts[0][1]
		) {
			pts = pts.slice(0, -1);
		}

		let ringVertices: RingVertex[] = pts.map(([x, y], idx) => ({
			id: `${idPrefix}_r${ringIdx}_${idx}`,
			x: quantizeMm(x),
			y: quantizeMm(y),
		}));

		// Normalise ring orientation in Y-down:
		// Outer ring must be positive area (clockwise), holes must be negative area (counter-clockwise)
		const area = signedShoelaceArea(ringVertices);
		if (!isHole && area < 0) {
			ringVertices = ringVertices.reverse();
		} else if (isHole && area > 0) {
			ringVertices = ringVertices.reverse();
		}

		return ringVertices;
	};

	const outer = convertRing(poly[0], false, 0);
	const holes = poly.slice(1).map((h, idx) => convertRing(h, true, idx + 1));

	return { outer, holes };
}

/**
 * Converts multiple Blueprint polygons to polygon-clipping MultiPolygon.
 */
export function blueprintPolygonsToClipping(
	polys: readonly Polygon[],
): ClippingMultiPolygon {
	return polys.map(blueprintPolygonToClipping);
}

/**
 * Converts a polygon-clipping MultiPolygon to an array of Blueprint Polygons.
 */
export function clippingToBlueprintPolygons(
	multiPoly: ClippingMultiPolygon,
	idPrefix = "v",
): Polygon[] {
	return multiPoly.map((poly, idx) =>
		clippingToBlueprintPolygon(poly, `${idPrefix}_p${idx}`),
	);
}

/**
 * Creates a rectangle polygon in Blueprint format.
 * In Y-down coordinates, clockwise order from top-left:
 *   (x, y) -> (x + width, y) -> (x + width, y + height) -> (x, y + height)
 */
export function createRectPolygon(
	x: number,
	y: number,
	width: number,
	height: number,
	idPrefix = "v_rect",
): Polygon {
	return {
		outer: [
			{ id: `${idPrefix}_0`, x: quantizeMm(x), y: quantizeMm(y) },
			{ id: `${idPrefix}_1`, x: quantizeMm(x + width), y: quantizeMm(y) },
			{
				id: `${idPrefix}_2`,
				x: quantizeMm(x + width),
				y: quantizeMm(y + height),
			},
			{ id: `${idPrefix}_3`, x: quantizeMm(x), y: quantizeMm(y + height) },
		],
		holes: [],
	};
}

/**
 * Creates a regular polygon approximating a circle in Blueprint format.
 * Clockwise vertices in Y-down coordinates.
 */
export function createCirclePolygon(
	centerX: number,
	centerY: number,
	radius: number,
	segments = 72,
	idPrefix = "v_circle",
): Polygon {
	const vertices: RingVertex[] = [];
	for (let i = 0; i < segments; i++) {
		const angleRad = (i / segments) * 2 * Math.PI;
		vertices.push({
			id: `${idPrefix}_${i}`,
			x: quantizeMm(centerX + radius * Math.cos(angleRad)),
			y: quantizeMm(centerY + radius * Math.sin(angleRad)),
		});
	}
	return { outer: vertices, holes: [] };
}

function toClippingMulti(
	p: Polygon | readonly Polygon[],
): ClippingMultiPolygon {
	const list = Array.isArray(p) ? (p as readonly Polygon[]) : [p as Polygon];
	return blueprintPolygonsToClipping(list);
}

/**
 * Performs boolean union of polygons.
 */
export function polygonUnion(
	p1: Polygon | readonly Polygon[],
	p2: Polygon | readonly Polygon[],
	idPrefix = "v_union",
): Polygon[] {
	const result = polygonClipping.union(
		toClippingMulti(p1),
		toClippingMulti(p2),
	);
	return clippingToBlueprintPolygons(result, idPrefix);
}

/**
 * Performs boolean intersection of polygons.
 */
export function polygonIntersection(
	p1: Polygon | readonly Polygon[],
	p2: Polygon | readonly Polygon[],
	idPrefix = "v_inter",
): Polygon[] {
	const result = polygonClipping.intersection(
		toClippingMulti(p1),
		toClippingMulti(p2),
	);
	return clippingToBlueprintPolygons(result, idPrefix);
}

/**
 * Performs boolean difference: subject minus clip.
 */
export function polygonDifference(
	subject: Polygon | readonly Polygon[],
	clip: Polygon | readonly Polygon[],
	idPrefix = "v_diff",
): Polygon[] {
	const result = polygonClipping.difference(
		toClippingMulti(subject),
		toClippingMulti(clip),
	);
	return clippingToBlueprintPolygons(result, idPrefix);
}

/**
 * Computes the net area of a polygon (outer area minus hole areas).
 */
export function polygonArea(poly: Polygon): number {
	const outerArea = Math.abs(signedShoelaceArea(poly.outer));
	const holeArea = poly.holes.reduce(
		(sum, h) => sum + Math.abs(signedShoelaceArea(h)),
		0,
	);
	return quantizeMm(Math.max(0, outerArea - holeArea));
}

/**
 * Computes the total net area of a collection of polygons.
 */
export function multiPolygonArea(polys: readonly Polygon[]): number {
	return quantizeMm(polys.reduce((sum, p) => sum + polygonArea(p), 0));
}

/**
 * Computes the axis-aligned bounding box of a polygon.
 */
export function polygonBounds(poly: Polygon): {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
} {
	if (poly.outer.length === 0) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
	}
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const v of poly.outer) {
		if (v.x < minX) minX = v.x;
		if (v.y < minY) minY = v.y;
		if (v.x > maxX) maxX = v.x;
		if (v.y > maxY) maxY = v.y;
	}
	return {
		minX: quantizeMm(minX),
		minY: quantizeMm(minY),
		maxX: quantizeMm(maxX),
		maxY: quantizeMm(maxY),
		width: quantizeMm(maxX - minX),
		height: quantizeMm(maxY - minY),
	};
}

// ----------------------------------------------------------------------------
// 3. Wall & Opening Geometry Derivation (§6.1, AC-010, AC-011)
// ----------------------------------------------------------------------------

export type WallSegment = {
	index: number;
	startId: Id;
	endId: Id;
	start: Vec2;
	end: Vec2;
	length: number;
	tangent: Vec2;
	normal: Vec2;
};

/**
 * Decomposes a wall entity into its straight segments with tangent and unit normal.
 */
export function getWallSegments(
	wall: WallEntity,
	inWorld = false,
): WallSegment[] {
	const rawVerts = wall.vertices;
	if (rawVerts.length < 2) return [];

	const verts = inWorld
		? rawVerts.map((v) => ({
				id: v.id,
				point: worldPoint(v.point, wall.transform),
			}))
		: rawVerts;

	const count = wall.closed ? verts.length : verts.length - 1;
	const segments: WallSegment[] = [];

	for (let i = 0; i < count; i++) {
		const start = verts[i];
		const end = verts[(i + 1) % verts.length];
		const dx = end.point.x - start.point.x;
		const dy = end.point.y - start.point.y;
		const len = Math.hypot(dx, dy);

		if (len < GEOMETRY_EPSILON_MM) {
			continue;
		}

		const tx = dx / len;
		const ty = dy / len;
		// Unit normal in Y-down coordinates: (-ty, tx)
		const nx = -ty;
		const ny = tx;

		segments.push({
			index: i,
			startId: start.id,
			endId: end.id,
			start: start.point,
			end: end.point,
			length: len,
			tangent: { x: tx, y: ty },
			normal: { x: nx, y: ny },
		});
	}

	return segments;
}

/**
 * Derives the opening cut rectangle for an opening on a wall (§6.1).
 * Extends full wall thickness plus 1 mm on each side along the normal,
 * and spans [offsetMm, offsetMm + widthMm] along the referenced segment.
 */
export function deriveOpeningCutGeometry(
	wall: WallEntity,
	opening: OpeningEntity,
	inWorld = false,
): Polygon {
	const segments = getWallSegments(wall, inWorld);
	const segment = segments.find(
		(s) =>
			s.startId === opening.segmentStartId && s.endId === opening.segmentEndId,
	);

	if (!segment) {
		throw new Error(
			`Opening ${opening.id} references invalid wall segment ${opening.segmentStartId}->${opening.segmentEndId}`,
		);
	}

	const halfThickness = wall.thicknessMm / 2;
	// Cut through full wall thickness plus 1 mm on each side
	const cutDist = halfThickness + 1.0;

	const startAlong = opening.offsetMm;
	const endAlong = opening.offsetMm + opening.widthMm;

	const t = segment.tangent;
	const n = segment.normal;

	// Centerline start and end of opening
	const oStartX = segment.start.x + t.x * startAlong;
	const oStartY = segment.start.y + t.y * startAlong;
	const oEndX = segment.start.x + t.x * endAlong;
	const oEndY = segment.start.y + t.y * endAlong;

	// 4 corners of the cut polygon
	const c0: Vec2 = {
		x: oStartX - n.x * cutDist,
		y: oStartY - n.y * cutDist,
	};
	const c1: Vec2 = {
		x: oEndX - n.x * cutDist,
		y: oEndY - n.y * cutDist,
	};
	const c2: Vec2 = {
		x: oEndX + n.x * cutDist,
		y: oEndY + n.y * cutDist,
	};
	const c3: Vec2 = {
		x: oStartX + n.x * cutDist,
		y: oStartY + n.y * cutDist,
	};

	return {
		outer: [
			{ id: `cut_${opening.id}_0`, ...quantizeVec2(c0) },
			{ id: `cut_${opening.id}_1`, ...quantizeVec2(c1) },
			{ id: `cut_${opening.id}_2`, ...quantizeVec2(c2) },
			{ id: `cut_${opening.id}_3`, ...quantizeVec2(c3) },
		],
		holes: [],
	};
}

/**
 * Validates opening constraints on a wall (§6.1, AC-011).
 * Requires:
 *   - 0 <= offsetMm
 *   - offsetMm + widthMm <= segmentLength
 *   - widthMm >= 100 mm
 *   - separation between adjacent openings on the same segment >= 1 mm
 */
export function validateWallOpeningConstraints(
	wall: WallEntity,
	openings: readonly OpeningEntity[],
	inWorld = false,
): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const segments = getWallSegments(wall, inWorld);
	const segmentMap = new Map<string, WallSegment>();
	for (const s of segments) {
		segmentMap.set(`${s.startId}->${s.endId}`, s);
	}

	// Group openings by segment
	const openingsBySegment = new Map<string, OpeningEntity[]>();
	for (const op of openings) {
		if (op.wallId !== wall.id) continue;
		const segKey = `${op.segmentStartId}->${op.segmentEndId}`;
		const segment = segmentMap.get(segKey);
		if (!segment) {
			issues.push({
				code: "OPENING_CONFLICT",
				path: `content.entities.${op.id}.segmentStartId`,
				message: `Opening '${op.id}' references non-existent wall segment '${segKey}'`,
				entityIds: [op.id, wall.id],
			});
			continue;
		}

		if (op.offsetMm < 0) {
			issues.push({
				code: "OPENING_CONFLICT",
				path: `content.entities.${op.id}.offsetMm`,
				message: `Opening '${op.id}' offset ${op.offsetMm} mm must be >= 0`,
				entityIds: [op.id, wall.id],
			});
		}

		if (op.widthMm < 100) {
			issues.push({
				code: "OPENING_CONFLICT",
				path: `content.entities.${op.id}.widthMm`,
				message: `Opening '${op.id}' width ${op.widthMm} mm must be >= 100 mm`,
				entityIds: [op.id, wall.id],
			});
		}

		if (op.offsetMm + op.widthMm > segment.length + GEOMETRY_EPSILON_MM) {
			issues.push({
				code: "OPENING_CONFLICT",
				path: `content.entities.${op.id}.offsetMm`,
				message: `Opening '${op.id}' extends beyond segment end (${op.offsetMm + op.widthMm} mm > ${segment.length.toFixed(3)} mm)`,
				entityIds: [op.id, wall.id],
			});
		}

		const list = openingsBySegment.get(segKey) ?? [];
		list.push(op);
		openingsBySegment.set(segKey, list);
	}

	// Check 1 mm separation between openings on the same segment
	for (const [segKey, segOpenings] of openingsBySegment) {
		segOpenings.sort((a, b) => a.offsetMm - b.offsetMm);
		for (let i = 0; i < segOpenings.length - 1; i++) {
			const op1 = segOpenings[i];
			const op2 = segOpenings[i + 1];
			const end1 = op1.offsetMm + op1.widthMm;
			const start2 = op2.offsetMm;
			if (start2 < end1 + 1.0 - GEOMETRY_EPSILON_MM) {
				issues.push({
					code: "OPENING_CONFLICT",
					path: `content.entities.${op2.id}.offsetMm`,
					message: `Openings '${op1.id}' and '${op2.id}' on segment '${segKey}' violate minimum 1 mm separation`,
					entityIds: [op1.id, op2.id, wall.id],
				});
			}
		}
	}

	return issues;
}

/**
 * Derives full wall geometry per §6.1 (AC-010):
 *   - Half-thickness offsets along unit normal for each segment
 *   - Butt caps at open endpoints
 *   - Bevel polygons joining offsets at shared vertices
 *   - Reject 180-degree reversal at shared vertices
 *   - Union segment polygons and bevels with polygon-clipping
 *   - Subtract opening rectangles (thickness + 1 mm each side)
 */
export function deriveWallGeometry(
	wall: WallEntity,
	openings: readonly OpeningEntity[] = [],
	inWorld = false,
): Polygon[] {
	const segments = getWallSegments(wall, inWorld);
	if (segments.length === 0) return [];

	const halfThickness = wall.thicknessMm / 2;
	const clippingPolygons: ClippingPolygon[] = [];

	// 1. Generate segment rectangles
	for (const seg of segments) {
		const s = seg.start;
		const e = seg.end;
		const n = seg.normal;

		// 4 corners of segment rectangle:
		// Clockwise in Y-down: (s - h*n) -> (e - h*n) -> (e + h*n) -> (s + h*n)
		const p0: ClippingCoord = [
			s.x - n.x * halfThickness,
			s.y - n.y * halfThickness,
		];
		const p1: ClippingCoord = [
			e.x - n.x * halfThickness,
			e.y - n.y * halfThickness,
		];
		const p2: ClippingCoord = [
			e.x + n.x * halfThickness,
			e.y + n.y * halfThickness,
		];
		const p3: ClippingCoord = [
			s.x + n.x * halfThickness,
			s.y + n.y * halfThickness,
		];

		clippingPolygons.push([[p0, p1, p2, p3, p0]]);
	}

	// 2. Bevels at shared vertices
	const numVerts = wall.vertices.length;
	const maxShared = wall.closed ? numVerts : numVerts - 2;

	for (let i = 0; i <= maxShared; i++) {
		const segIn =
			segments[i === 0 && wall.closed ? segments.length - 1 : i - 1];
		const segOut = segments[i];

		if (!segIn || !segOut) continue;

		// Check 180-degree reversal:
		// Dot product of tangents near -1 means path doubles back on itself
		const dot =
			segIn.tangent.x * segOut.tangent.x + segIn.tangent.y * segOut.tangent.y;
		if (dot < -0.9999) {
			throw new Error(
				`Wall '${wall.id}' contains a 180-degree reversal at shared vertex '${segIn.endId}'`,
			);
		}

		// Vertex position
		const v = segIn.end;
		const nIn = segIn.normal;
		const nOut = segOut.normal;

		// Wedge on positive normal side
		const pInPos: ClippingCoord = [
			v.x + nIn.x * halfThickness,
			v.y + nIn.y * halfThickness,
		];
		const pOutPos: ClippingCoord = [
			v.x + nOut.x * halfThickness,
			v.y + nOut.y * halfThickness,
		];
		const vCoord: ClippingCoord = [v.x, v.y];

		clippingPolygons.push([[vCoord, pInPos, pOutPos, vCoord]]);

		// Wedge on negative normal side
		const pInNeg: ClippingCoord = [
			v.x - nIn.x * halfThickness,
			v.y - nIn.y * halfThickness,
		];
		const pOutNeg: ClippingCoord = [
			v.x - nOut.x * halfThickness,
			v.y - nOut.y * halfThickness,
		];

		clippingPolygons.push([[vCoord, pInNeg, pOutNeg, vCoord]]);
	}

	// 3. Union all segment rectangles and bevel triangles
	let unionedResult: ClippingMultiPolygon = [];
	if (clippingPolygons.length === 1) {
		unionedResult = clippingPolygons;
	} else if (clippingPolygons.length > 1) {
		unionedResult = polygonClipping.union(
			clippingPolygons[0],
			...clippingPolygons.slice(1),
		);
	}

	// 4. Subtract opening rectangles
	const relevantOpenings = openings.filter((op) => op.wallId === wall.id);
	if (relevantOpenings.length > 0 && unionedResult.length > 0) {
		const cutPolys: ClippingPolygon[] = [];
		for (const op of relevantOpenings) {
			const cut = deriveOpeningCutGeometry(wall, op, inWorld);
			cutPolys.push(blueprintPolygonToClipping(cut));
		}

		const unionedCuts =
			cutPolys.length === 1
				? cutPolys
				: polygonClipping.union(cutPolys[0], ...cutPolys.slice(1));

		unionedResult = polygonClipping.difference(unionedResult, unionedCuts);
	}

	return clippingToBlueprintPolygons(unionedResult, `wall_${wall.id}`);
}

/**
 * Moves a wall rigidly and updates its openings accordingly (AC-011).
 * Since openings store offsets along segments, translating the wall carries its openings.
 */
export function moveWall(
	wall: WallEntity,
	delta: Vec2,
	openings: readonly OpeningEntity[],
): { wall: WallEntity; openings: OpeningEntity[] } {
	const movedWall: WallEntity = {
		...wall,
		transform: {
			...wall.transform,
			x: quantizeMm(wall.transform.x + delta.x),
			y: quantizeMm(wall.transform.y + delta.y),
		},
	};

	// Openings remain on the same segments with identical relative offsets
	const wallOpenings = openings.filter((o) => o.wallId === wall.id);
	return { wall: movedWall, openings: wallOpenings.map((o) => ({ ...o })) };
}

/**
 * Shrinks a wall segment atomically (§6.1, AC-011).
 * If shrinking makes any hosted opening exceed the segment length,
 * rejects atomically with an OPENING_CONFLICT error.
 */
export function shrinkWallSegment(
	wall: WallEntity,
	segmentIndex: number,
	newLength: number,
	openings: readonly OpeningEntity[],
): { wall: WallEntity } {
	const segments = getWallSegments(wall, false);
	if (segmentIndex < 0 || segmentIndex >= segments.length) {
		throw new Error(
			`Invalid segment index ${segmentIndex} for wall with ${segments.length} segments`,
		);
	}

	const seg = segments[segmentIndex];
	const hostedOpenings = openings.filter(
		(o) =>
			o.wallId === wall.id &&
			o.segmentStartId === seg.startId &&
			o.segmentEndId === seg.endId,
	);

	// Check if any opening exceeds new length
	for (const op of hostedOpenings) {
		if (op.offsetMm + op.widthMm > newLength + GEOMETRY_EPSILON_MM) {
			const err = new Error(
				`OPENING_CONFLICT: Shrinking segment to ${newLength} mm violates opening '${op.id}' end at ${op.offsetMm + op.widthMm} mm`,
			);
			(err as unknown as { code: string }).code = "OPENING_CONFLICT";
			throw err;
		}
	}

	// Compute new end point
	const newEndX = seg.start.x + seg.tangent.x * newLength;
	const newEndY = seg.start.y + seg.tangent.y * newLength;

	const endVertexIndex = wall.vertices.findIndex((v) => v.id === seg.endId);
	const newVertices = wall.vertices.map((v, idx) =>
		idx === endVertexIndex
			? { ...v, point: quantizeVec2({ x: newEndX, y: newEndY }) }
			: v,
	);

	return {
		wall: {
			...wall,
			vertices: newVertices,
		},
	};
}

// ----------------------------------------------------------------------------
// 4. Topological Polygon Validation (§4.3, AC-012)
// ----------------------------------------------------------------------------

/**
 * Validates polygon topology strictly rejecting self-intersections (bow-ties)
 * and overlapping holes without guessing repaired topology (§4.3, AC-012).
 */
export function validatePolygonTopology(
	polygon: Polygon,
	path = "polygon",
	entityIds: string[] = [],
): ValidationIssue[] {
	return validatePolygonGeometry(polygon, path, entityIds);
}

/**
 * Finds all openings belonging to a specific wall in a document.
 */
export function findWallOpenings(
	entities: Record<Id, Entity>,
	wallId: Id,
): OpeningEntity[] {
	const res: OpeningEntity[] = [];
	for (const e of Object.values(entities)) {
		if (e.kind === "opening" && e.wallId === wallId) {
			res.push(e);
		}
	}
	return res;
}
