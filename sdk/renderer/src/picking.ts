// ============================================================================
// Blueprint Spatial Indexing & Picking Engine (§6.4, AC-028, AC-029)
// RBush broad-phase search expanded by 8/s mm, precise geometric testing,
// front-to-back ordering, editor vs viewer policy, and marquee selection.
// ============================================================================

// @ts-ignore rbush untyped import
import RBush from "rbush";
import type {
	BlueprintDocument,
	DeviceDefinition,
	DeviceEntity,
	Entity,
	Id,
	Layer,
	OpeningEntity,
	Polygon,
	Ring,
	ShapeEntity,
	Vec2,
	WallEntity,
	ZoneEntity,
} from "@sdk/core";
import {
	deriveWallGeometry,
	findWallOpenings,
	getCatalogDefinition,
	localPoint,
	pointInRing,
	polygonBounds,
	resolveDeviceDefinition,
	transformPolygon,
	worldPoint,
} from "@sdk/core";
import { getScalePixelsPerMm, viewToWorld } from "./camera.ts";
import type {
	Camera,
	PickCategory,
	PickPolicy,
	PickResult,
	WorldBounds,
} from "./types.ts";

export type SpatialIndexItem = {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	entityId: Id;
	layerId: Id;
	category: PickCategory;
	featureId?: Id;
	bounds: WorldBounds;
};

/**
 * Tests whether a point lies inside or on the boundary of a polygon with holes.
 */
export function isPointInPolygon(pt: Vec2, poly: Polygon): boolean {
	if (pointInRing(pt, poly.outer) < 0) {
		return false;
	}
	for (const hole of poly.holes) {
		if (pointInRing(pt, hole) > 0) {
			return false;
		}
	}
	return true;
}

/**
 * Computes axis-aligned bounding box of an array of 2D points.
 */
function pointsToBounds(points: readonly Vec2[]): WorldBounds {
	if (points.length === 0) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
	}
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const p of points) {
		if (p.x < minX) minX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.x > maxX) maxX = p.x;
		if (p.y > maxY) maxY = p.y;
	}
	return {
		minX,
		minY,
		maxX,
		maxY,
		width: maxX - minX,
		height: maxY - minY,
	};
}

/**
 * Computes exact world bounds for any Blueprint entity.
 */
export function computeEntityWorldBounds(
	entity: Entity,
	doc: BlueprintDocument,
): WorldBounds {
	switch (entity.kind) {
		case "shape": {
			const g = entity.geometry;
			switch (g.kind) {
				case "rect": {
					const pts: Vec2[] = [
						worldPoint({ x: 0, y: 0 }, entity.transform),
						worldPoint({ x: g.width, y: 0 }, entity.transform),
						worldPoint({ x: g.width, y: g.height }, entity.transform),
						worldPoint({ x: 0, y: g.height }, entity.transform),
					];
					return pointsToBounds(pts);
				}
				case "ellipse": {
					const pts: Vec2[] = [
						worldPoint({ x: 0, y: 0 }, entity.transform),
						worldPoint({ x: g.width, y: 0 }, entity.transform),
						worldPoint({ x: g.width, y: g.height }, entity.transform),
						worldPoint({ x: 0, y: g.height }, entity.transform),
					];
					return pointsToBounds(pts);
				}
				case "polygon": {
					const pts: Vec2[] = [];
					for (const p of g.polygons) {
						for (const v of p.outer) {
							pts.push(worldPoint(v, entity.transform));
						}
					}
					return pointsToBounds(pts);
				}
				case "path": {
					const pts = g.segments.map((s) =>
						worldPoint(s.point, entity.transform),
					);
					return pointsToBounds(pts);
				}
			}
			break;
		}
		case "device": {
			const def =
				doc.content.definitions[entity.definitionId] ??
				getCatalogDefinition(entity.definitionId);
			if (def) {
				const activeDef = resolveDeviceDefinition(def, entity.parameters);
				const worldPoly = transformPolygon(
					activeDef.footprint,
					entity.transform,
				);
				const b = polygonBounds(worldPoly);
				return {
					minX: b.minX,
					minY: b.minY,
					maxX: b.maxX,
					maxY: b.maxY,
					width: b.width,
					height: b.height,
				};
			}
			return {
				minX: entity.transform.x,
				minY: entity.transform.y,
				maxX: entity.transform.x + 1000,
				maxY: entity.transform.y + 1000,
				width: 1000,
				height: 1000,
			};
		}
		case "zone": {
			const worldPoly = transformPolygon(entity.polygon, entity.transform);
			const b = polygonBounds(worldPoly);
			return {
				minX: b.minX,
				minY: b.minY,
				maxX: b.maxX,
				maxY: b.maxY,
				width: b.width,
				height: b.height,
			};
		}
		case "wall": {
			const pts = entity.vertices.map((v) =>
				worldPoint(v.point, entity.transform),
			);
			const b = pointsToBounds(pts);
			const pad = entity.thicknessMm / 2;
			return {
				minX: b.minX - pad,
				minY: b.minY - pad,
				maxX: b.maxX + pad,
				maxY: b.maxY + pad,
				width: b.width + entity.thicknessMm,
				height: b.height + entity.thicknessMm,
			};
		}
		case "opening": {
			const pts: Vec2[] = [
				worldPoint({ x: 0, y: 0 }, entity.transform),
				worldPoint({ x: entity.widthMm, y: 300 }, entity.transform),
			];
			return pointsToBounds(pts);
		}
		case "dimension":
		case "annotation": {
			return {
				minX: entity.transform.x - 200,
				minY: entity.transform.y - 200,
				maxX: entity.transform.x + 200,
				maxY: entity.transform.y + 200,
				width: 400,
				height: 400,
			};
		}
		case "reference": {
			const pts: Vec2[] = [
				worldPoint({ x: 0, y: 0 }, entity.transform),
				worldPoint({ x: entity.widthMm, y: entity.heightMm }, entity.transform),
			];
			return pointsToBounds(pts);
		}
	}
}

/**
 * Spatial Index wrapper around RBush for Blueprint entities.
 */
export class SpatialIndex {
	private readonly _tree = new RBush<SpatialIndexItem>();
	private readonly _itemsByEntityId = new Map<Id, SpatialIndexItem>();

	clear(): void {
		this._tree.clear();
		this._itemsByEntityId.clear();
	}

	build(doc: BlueprintDocument): void {
		this.clear();
		const items: SpatialIndexItem[] = [];

		for (const entityId of doc.content.entityOrder) {
			const entity = doc.content.entities[entityId];
			if (!entity) continue;

			const bounds = computeEntityWorldBounds(entity, doc);
			const item: SpatialIndexItem = {
				minX: bounds.minX,
				minY: bounds.minY,
				maxX: bounds.maxX,
				maxY: bounds.maxY,
				entityId: entity.id,
				layerId: entity.layerId,
				category: "entity",
				bounds,
			};
			items.push(item);
			this._itemsByEntityId.set(entity.id, item);
		}

		this._tree.load(items);
	}

	updateEntity(entity: Entity, doc: BlueprintDocument): void {
		const existing = this._itemsByEntityId.get(entity.id);
		if (existing) {
			this._tree.remove(existing);
			this._itemsByEntityId.delete(entity.id);
		}
		const bounds = computeEntityWorldBounds(entity, doc);
		const item: SpatialIndexItem = {
			minX: bounds.minX,
			minY: bounds.minY,
			maxX: bounds.maxX,
			maxY: bounds.maxY,
			entityId: entity.id,
			layerId: entity.layerId,
			category: "entity",
			bounds,
		};
		this._tree.insert(item);
		this._itemsByEntityId.set(entity.id, item);
	}

	removeEntity(entityId: Id): void {
		const existing = this._itemsByEntityId.get(entityId);
		if (existing) {
			this._tree.remove(existing);
			this._itemsByEntityId.delete(entityId);
		}
	}

	search(bbox: {
		minX: number;
		minY: number;
		maxX: number;
		maxY: number;
	}): SpatialIndexItem[] {
		return this._tree.search(bbox);
	}

	getItem(entityId: Id): SpatialIndexItem | undefined {
		return this._itemsByEntityId.get(entityId);
	}
}

function hitTestEntityBounds(
	entity: Entity,
	doc: BlueprintDocument,
	worldP: Vec2,
	toleranceMm: number,
): PickResult | null {
	const b = computeEntityWorldBounds(entity, doc);
	if (
		worldP.x >= b.minX - toleranceMm &&
		worldP.x <= b.maxX + toleranceMm &&
		worldP.y >= b.minY - toleranceMm &&
		worldP.y <= b.maxY + toleranceMm
	) {
		return {
			entityId: entity.id,
			worldPoint: worldP,
			category: "entity",
		};
	}
	return null;
}

/**
 * Tests whether a world coordinate precisely hits an entity.
 */
export function preciseEntityHitTest(
	worldP: Vec2,
	entity: Entity,
	doc: BlueprintDocument,
	toleranceMm: number,
): PickResult | null {
	switch (entity.kind) {
		case "device": {
			const def =
				doc.content.definitions[entity.definitionId] ??
				getCatalogDefinition(entity.definitionId);
			if (!def) return null;
			const activeDef = resolveDeviceDefinition(def, entity.parameters);

			// 1. Check ports first (category 'port')
			for (const port of activeDef.ports) {
				const portW = worldPoint(port.point, entity.transform);
				const dist = Math.hypot(worldP.x - portW.x, worldP.y - portW.y);
				if (dist <= 60 + toleranceMm) {
					return {
						entityId: entity.id,
						featureId: port.id,
						worldPoint: worldP,
						category: "port",
					};
				}
			}

			// 2. Check footprint polygon
			const localP = localPoint(worldP, entity.transform);
			if (isPointInPolygon(localP, activeDef.footprint)) {
				return {
					entityId: entity.id,
					worldPoint: worldP,
					category: "entity",
				};
			}
			return null;
		}

		case "zone": {
			const localP = localPoint(worldP, entity.transform);
			if (isPointInPolygon(localP, entity.polygon)) {
				return {
					entityId: entity.id,
					worldPoint: worldP,
					category: "entity",
				};
			}
			return null;
		}

		case "shape": {
			const localP = localPoint(worldP, entity.transform);
			const g = entity.geometry;
			switch (g.kind) {
				case "rect":
					if (
						localP.x >= -toleranceMm &&
						localP.x <= g.width + toleranceMm &&
						localP.y >= -toleranceMm &&
						localP.y <= g.height + toleranceMm
					) {
						return {
							entityId: entity.id,
							worldPoint: worldP,
							category: "entity",
						};
					}
					return null;
				case "ellipse": {
					const rx = g.width / 2;
					const ry = g.height / 2;
					const dx = localP.x - rx;
					const dy = localP.y - ry;
					if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.05) {
						return {
							entityId: entity.id,
							worldPoint: worldP,
							category: "entity",
						};
					}
					return null;
				}
				case "polygon": {
					for (const p of g.polygons) {
						if (isPointInPolygon(localP, p)) {
							return {
								entityId: entity.id,
								worldPoint: worldP,
								category: "entity",
							};
						}
					}
					return null;
				}
				case "path":
					return hitTestEntityBounds(entity, doc, worldP, toleranceMm);
			}
			return null;
		}

		case "wall": {
			const openings = findWallOpenings(doc.content.entities, entity.id);
			const wallPolys = deriveWallGeometry(entity, openings, true);
			for (const poly of wallPolys) {
				if (isPointInPolygon(worldP, poly)) {
					return {
						entityId: entity.id,
						worldPoint: worldP,
						category: "entity",
					};
				}
			}
			return null;
		}

		case "opening":
		case "dimension":
		case "annotation":
		case "reference":
			return hitTestEntityBounds(entity, doc, worldP, toleranceMm);
	}
}

function isEntityCandidatePickable(
	entity: Entity,
	layerMap: Map<Id, Layer>,
	policy: PickPolicy,
): boolean {
	const layer = layerMap.get(entity.layerId);
	if (!layer) return false;
	if (!layer.visible || entity.hidden) return false;
	if (
		policy.visibleLayerFilter &&
		!policy.visibleLayerFilter.includes(layer.id)
	) {
		return false;
	}
	if (policy.mode === "editor" && (layer.locked || entity.locked)) {
		return false;
	}
	return true;
}

/**
 * Performs picking at a view coordinate according to PickPolicy (§6.4, AC-029).
 */
export function pickAtPoint(
	viewPoint: Vec2,
	camera: Camera,
	viewportSize: Vec2,
	doc: BlueprintDocument,
	spatialIndex: SpatialIndex,
	policy: PickPolicy,
): PickResult | null {
	const worldP = viewToWorld(viewPoint, camera, viewportSize);
	const s = getScalePixelsPerMm(camera.scale);
	const tolMm = 8 / s; // 8 CSS px expansion (§6.4)

	// Broad-phase RBush search
	const candidates = spatialIndex.search({
		minX: worldP.x - tolMm,
		minY: worldP.y - tolMm,
		maxX: worldP.x + tolMm,
		maxY: worldP.y + tolMm,
	});

	if (candidates.length === 0) {
		return null;
	}

	// Layer order lookup: higher index = higher z-index (front)
	const layerIndexMap = new Map<Id, number>();
	doc.content.layers.forEach((l, idx) => {
		layerIndexMap.set(l.id, idx);
	});

	// Entity order lookup: higher index = rendered later (front)
	const entityOrderMap = new Map<Id, number>();
	doc.content.entityOrder.forEach((id, idx) => {
		entityOrderMap.set(id, idx);
	});

	const layerMap = new Map(doc.content.layers.map((l) => [l.id, l]));
	const groupMap = new Map(doc.content.groups.map((g) => [g.id, g]));

	// Sort front-to-back: highest layer first, then highest entityOrder first
	candidates.sort((a, b) => {
		const lA = layerIndexMap.get(a.layerId) ?? 0;
		const lB = layerIndexMap.get(b.layerId) ?? 0;
		if (lA !== lB) return lB - lA;
		const eA = entityOrderMap.get(a.entityId) ?? 0;
		const eB = entityOrderMap.get(b.entityId) ?? 0;
		return eB - eA;
	});

	for (const cand of candidates) {
		const entity = doc.content.entities[cand.entityId];
		if (!entity) continue;
		if (!isEntityCandidatePickable(entity, layerMap, policy)) {
			continue;
		}

		// 3. Narrow-phase precise geometry check
		const hit = preciseEntityHitTest(worldP, entity, doc, tolMm);
		if (hit) {
			// Group drill-down logic (§6.4)
			// Group click selects the outermost group; Alt+click (drillDown=true) drills down to entity
			if (!policy.drillDown && entity.groupId) {
				let outermostGroupId = entity.groupId;
				let current = groupMap.get(entity.groupId);
				while (current?.parentId) {
					outermostGroupId = current.parentId;
					current = groupMap.get(current.parentId);
				}
				return {
					...hit,
					entityId: outermostGroupId,
					featureId: entity.id,
				};
			}

			return hit;
		}
	}

	return null;
}

/**
 * Performs marquee selection (§6.4, AC-028).
 * Left-to-right (from.x <= to.x): selects fully enclosed entities.
 * Right-to-left (from.x > to.x): selects crossing/intersecting entities.
 * Excludes hidden/locked entities under editor policy.
 */
export function selectByMarquee(
	fromWorld: Vec2,
	toWorld: Vec2,
	doc: BlueprintDocument,
	spatialIndex: SpatialIndex,
	policy: PickPolicy,
): Id[] {
	const minX = Math.min(fromWorld.x, toWorld.x);
	const maxX = Math.max(fromWorld.x, toWorld.x);
	const minY = Math.min(fromWorld.y, toWorld.y);
	const maxY = Math.max(fromWorld.y, toWorld.y);

	const isEnclosedOnly = toWorld.x >= fromWorld.x; // Left-to-Right

	const candidates = spatialIndex.search({ minX, minY, maxX, maxY });
	const layerMap = new Map(doc.content.layers.map((l) => [l.id, l]));
	const selectedIds: Id[] = [];

	for (const cand of candidates) {
		const entity = doc.content.entities[cand.entityId];
		if (!entity) continue;
		if (!isEntityCandidatePickable(entity, layerMap, policy)) {
			continue;
		}

		if (isEnclosedOnly) {
			// Must be fully enclosed within marquee box
			if (
				cand.minX >= minX &&
				cand.maxX <= maxX &&
				cand.minY >= minY &&
				cand.maxY <= maxY
			) {
				if (!selectedIds.includes(entity.id)) {
					selectedIds.push(entity.id);
				}
			}
		} else {
			// Crossing / intersecting: any overlap with box
			if (
				cand.minX <= maxX &&
				cand.maxX >= minX &&
				cand.minY <= maxY &&
				cand.maxY >= minY
			) {
				if (!selectedIds.includes(entity.id)) {
					selectedIds.push(entity.id);
				}
			}
		}
	}

	return selectedIds;
}
