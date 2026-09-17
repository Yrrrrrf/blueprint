// ============================================================================
// Blueprint Snapping Engine (§6.5, AC-033, AC-034, AC-035)
// Grid steps (100, 500, 1000, 5000 mm), vertex/port/midpoint/alignment snapping,
// acquisition (8px) and release (12px) radii, 15° angle constraints, deterministic tie breaks.
// ============================================================================

import type {
	BlueprintDocument,
	Entity,
	Id,
	OpeningEntity,
	Transform,
	Vec2,
	WallEntity,
} from "@sdk/core";
import {
	getCatalogDefinition,
	normalizeAngleDeg,
	resolveDeviceDefinition,
	worldPoint,
} from "@sdk/core";
import { getScalePixelsPerMm } from "./camera.ts";
import type {
	Camera,
	SnapCandidate,
	SnapCandidateType,
	SnapGuide,
	SnapResult,
} from "./types.ts";

export const SNAP_ACQUIRE_RADIUS_PX = 8.0;
export const SNAP_RELEASE_RADIUS_PX = 12.0;
export const DEFAULT_GRID_STEP_MM = 1000;

export type SnapOptions = {
	worldPoint: Vec2;
	camera: Camera;
	doc: BlueprintDocument;
	excludeEntityIds?: readonly Id[];
	activeCandidate?: SnapCandidate | null;
	originPoint?: Vec2;
	shiftConstrained?: boolean;
	altDisabled?: boolean;
	snapStepMm?: number;
};

/**
 * Snaps an angle to the nearest increment (default 15°) (§6.5, AC-035).
 */
export function snapAngle(angleDeg: number, incrementDeg = 15): number {
	const norm = normalizeAngleDeg(angleDeg);
	const snapped = Math.round(norm / incrementDeg) * incrementDeg;
	return normalizeAngleDeg(snapped);
}

/**
 * Constrains a target point relative to an origin by 15° increments (§6.5).
 */
export function constrainPointToAngle(
	origin: Vec2,
	target: Vec2,
	incrementDeg = 15,
): { point: Vec2; angleDeg: number } {
	const dx = target.x - origin.x;
	const dy = target.y - origin.y;
	const dist = Math.hypot(dx, dy);
	if (dist < 1e-6) {
		return { point: origin, angleDeg: 0 };
	}
	const rawAngle = (Math.atan2(dy, dx) * 180) / Math.PI;
	const snappedAngle = snapAngle(rawAngle, incrementDeg);
	const rad = (snappedAngle * Math.PI) / 180;
	return {
		point: {
			x: origin.x + dist * Math.cos(rad),
			y: origin.y + dist * Math.sin(rad),
		},
		angleDeg: snappedAngle,
	};
}

function pushSnapCandidate(
	candidates: SnapCandidate[],
	type: "vertex" | "midpoint" | "port",
	point: Vec2,
	entityId: Id,
	featureId: string,
	referencePoint: Vec2,
	scale: number,
	rank: 1 | 2,
	label?: string,
) {
	const distancePx =
		Math.hypot(point.x - referencePoint.x, point.y - referencePoint.y) * scale;
	candidates.push({
		type,
		point,
		entityId,
		featureId,
		distancePx,
		rank,
		label,
	});
}

function collectVerticesAndMidpoints(
	candidates: SnapCandidate[],
	points: readonly Vec2[],
	transform: Transform,
	entityId: Id,
	featurePrefix: string,
	referencePoint: Vec2,
	scale: number,
	closed: boolean,
	vertexLabel: string,
	midpointLabel?: string,
) {
	for (let i = 0; i < points.length; i++) {
		const pt = worldPoint(points[i], transform);
		pushSnapCandidate(
			candidates,
			"vertex",
			pt,
			entityId,
			(points[i] as { id?: string }).id ?? `${featurePrefix}_v_${i}`,
			referencePoint,
			scale,
			1,
			vertexLabel,
		);
	}

	if (midpointLabel) {
		const count = closed ? points.length : points.length - 1;
		for (let i = 0; i < count; i++) {
			const next = (i + 1) % points.length;
			const mid = {
				x: (points[i].x + points[next].x) / 2,
				y: (points[i].y + points[next].y) / 2,
			};
			const pt = worldPoint(mid, transform);
			pushSnapCandidate(
				candidates,
				"midpoint",
				pt,
				entityId,
				`${featurePrefix}_mid_${i}`,
				referencePoint,
				scale,
				2,
				midpointLabel,
			);
		}
	}
}

/**
 * Extracts snap candidates from visible document entities.
 * Includes visible locked foundations per §6.5.
 */
export function collectEntitySnapCandidates(
	doc: BlueprintDocument,
	excludeIds: Set<Id>,
	s: number,
	referencePoint: Vec2,
): SnapCandidate[] {
	const candidates: SnapCandidate[] = [];
	const layerMap = new Map(doc.content.layers.map((l) => [l.id, l]));

	for (const entityId of doc.content.entityOrder) {
		if (excludeIds.has(entityId)) continue;
		const entity = doc.content.entities[entityId];
		if (!entity || entity.hidden) continue;

		const layer = layerMap.get(entity.layerId);
		if (!layer || !layer.visible) continue;

		switch (entity.kind) {
			case "device": {
				const def =
					doc.content.definitions[entity.definitionId] ??
					getCatalogDefinition(entity.definitionId);
				if (!def) break;
				const activeDef = resolveDeviceDefinition(def, entity.parameters);

				// Ports (Rank 1)
				for (const port of activeDef.ports) {
					const pt = worldPoint(port.point, entity.transform);
					pushSnapCandidate(
						candidates,
						"port",
						pt,
						entity.id,
						port.id,
						referencePoint,
						s,
						1,
						`Port: ${port.id}`,
					);
				}

				collectVerticesAndMidpoints(
					candidates,
					activeDef.footprint.outer,
					entity.transform,
					entity.id,
					"dev",
					referencePoint,
					s,
					true,
					"Device Vertex",
					"Device Edge Midpoint",
				);
				break;
			}

			case "wall": {
				const wallPoints = entity.vertices.map((v) => ({
					...v.point,
					id: v.id,
				}));
				collectVerticesAndMidpoints(
					candidates,
					wallPoints,
					entity.transform,
					entity.id,
					"wall",
					referencePoint,
					s,
					entity.closed,
					"Wall Vertex",
					"Wall Midpoint",
				);
				break;
			}

			case "zone": {
				collectVerticesAndMidpoints(
					candidates,
					entity.polygon.outer,
					entity.transform,
					entity.id,
					"zone",
					referencePoint,
					s,
					true,
					"Zone Vertex",
				);
				break;
			}

			case "shape": {
				if (entity.geometry.kind === "rect") {
					const w = entity.geometry.width;
					const h = entity.geometry.height;
					const corners = [
						{ x: 0, y: 0 },
						{ x: w, y: 0 },
						{ x: w, y: h },
						{ x: 0, y: h },
					];
					for (let i = 0; i < corners.length; i++) {
						const pt = worldPoint(corners[i], entity.transform);
						pushSnapCandidate(
							candidates,
							"vertex",
							pt,
							entity.id,
							`corner_${i}`,
							referencePoint,
							s,
							1,
						);
					}
				}
				break;
			}
		}
	}

	return candidates;
}

/**
 * Computes snapped point and guide lines based on all snapping rules (§6.5).
 */
export function computeSnap(options: SnapOptions): SnapResult {
	const {
		worldPoint: rawPt,
		camera,
		doc,
		excludeEntityIds = [],
		activeCandidate,
		originPoint,
		shiftConstrained = false,
		altDisabled = false,
		snapStepMm = DEFAULT_GRID_STEP_MM,
	} = options;

	// Alt temporarily disables all snapping (§6.5, AC-035)
	if (altDisabled) {
		return {
			snappedPoint: rawPt,
			candidate: null,
			guides: [],
		};
	}

	let targetPt = rawPt;
	const guides: SnapGuide[] = [];

	// Shift 15-degree angle constraint handling (§6.5, AC-035)
	// Constrained geometry is generated first, then compatible snap candidates are considered.
	let constraintAngle: number | null = null;
	if (shiftConstrained && originPoint) {
		const res = constrainPointToAngle(originPoint, rawPt, 15);
		targetPt = res.point;
		constraintAngle = res.angleDeg;
		guides.push({
			type: "angle",
			points: [originPoint, targetPt],
			angleDeg: constraintAngle,
			label: `${constraintAngle}°`,
		});
	}

	const s = getScalePixelsPerMm(camera.scale);
	const excludeSet = new Set(excludeEntityIds);

	// Collect geometry snap candidates
	const candidates = collectEntitySnapCandidates(doc, excludeSet, s, targetPt);

	// Grid candidate (Rank 4)
	const gridOrigin = doc.content.grid?.origin ?? { x: 0, y: 0 };
	const snappedGridX =
		Math.round((targetPt.x - gridOrigin.x) / snapStepMm) * snapStepMm +
		gridOrigin.x;
	const snappedGridY =
		Math.round((targetPt.y - gridOrigin.y) / snapStepMm) * snapStepMm +
		gridOrigin.y;
	const gridPt: Vec2 = { x: snappedGridX, y: snappedGridY };
	const gridDistPx =
		Math.hypot(gridPt.x - targetPt.x, gridPt.y - targetPt.y) * s;

	candidates.push({
		type: "grid",
		point: gridPt,
		distancePx: gridDistPx,
		rank: 4,
		label: `Grid ${snapStepMm} mm`,
	});

	// If activeCandidate is currently held, check release radius (12 px) (§6.5, AC-033)
	if (activeCandidate) {
		const currentDistPx =
			Math.hypot(
				activeCandidate.point.x - targetPt.x,
				activeCandidate.point.y - targetPt.y,
			) * s;

		if (currentDistPx <= SNAP_RELEASE_RADIUS_PX) {
			// Retain candidate unless a higher-priority rank candidate is within acquisition radius (8 px)
			const betterCandidates = candidates.filter(
				(c) =>
					c.rank < activeCandidate.rank &&
					c.distancePx <= SNAP_ACQUIRE_RADIUS_PX,
			);
			if (betterCandidates.length === 0) {
				return {
					snappedPoint: activeCandidate.point,
					candidate: {
						...activeCandidate,
						distancePx: currentDistPx,
					},
					guides: [
						...guides,
						{
							type: "point",
							points: [activeCandidate.point],
							label: activeCandidate.label,
						},
					],
				};
			}
		}
	}

	// Filter candidates within acquisition radius (8 px)
	const acquired = candidates.filter(
		(c) => c.distancePx <= SNAP_ACQUIRE_RADIUS_PX,
	);

	if (acquired.length === 0) {
		return {
			snappedPoint: targetPt,
			candidate: null,
			guides,
		};
	}

	// Deterministic tie breaks per §6.5:
	// 1. rank ascending
	// 2. screen distance ascending
	// 3. entity ID ascending
	// 4. feature ID ascending
	acquired.sort((a, b) => {
		if (a.rank !== b.rank) return a.rank - b.rank;
		if (Math.abs(a.distancePx - b.distancePx) > 1e-4) {
			return a.distancePx - b.distancePx;
		}
		const entCmp = (a.entityId ?? "").localeCompare(b.entityId ?? "");
		if (entCmp !== 0) return entCmp;
		return (a.featureId ?? "").localeCompare(b.featureId ?? "");
	});

	const winner = acquired[0];

	// Ensure no snap violates angle constraint if shift is active (§6.5)
	if (shiftConstrained && originPoint && constraintAngle !== null) {
		const dx = winner.point.x - originPoint.x;
		const dy = winner.point.y - originPoint.y;
		const candAngle = normalizeAngleDeg((Math.atan2(dy, dx) * 180) / Math.PI);
		const diff = Math.abs(candAngle - constraintAngle);
		if (diff > 2 && Math.abs(diff - 360) > 2) {
			// Incompatible with angle constraint: keep constrained point
			return {
				snappedPoint: targetPt,
				candidate: null,
				guides,
			};
		}
	}

	guides.push({
		type: "point",
		points: [winner.point],
		label: winner.label,
	});

	return {
		snappedPoint: winner.point,
		candidate: winner,
		guides,
	};
}
