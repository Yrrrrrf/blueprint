// ============================================================================
// Blueprint Command Reducer (§5.1 of Blueprint Specification)
// Pure reducer function with permission, lock, deletion, and duplication policies.
// ============================================================================

import type {
	Anchor,
	AnnotationEntity,
	Base,
	BlueprintDocument,
	DeviceDefinition,
	DeviceEntity,
	DimensionEntity,
	DocumentContent,
	Entity,
	Group,
	Id,
	Layer,
	OpeningEntity,
	Polygon,
	ProductionLine,
	Relation,
	ShapeEntity,
	Transform,
	Vec2,
	WallEntity,
	ZoneEntity,
} from "./types.ts";
import type {
	BlueprintCommand,
	DocumentDelta,
	ReducerEnvironment,
	ReducerResult,
	SelectionAlignCommand,
	SelectionDistributeCommand,
	SelectionDuplicateCommand,
	SelectionTransformCommand,
} from "./commands.ts";
import {
	GEOMETRY_EPSILON_MM,
	quantizeMm,
	quantizeTransform,
	quantizeVec2,
} from "./units.ts";
import {
	polygonBounds,
	validatePolygonTopology,
	validateWallOpeningConstraints,
	worldPoint,
} from "./geometry.ts";
import { getCatalogDefinition, resolveDeviceDefinition } from "./catalog.ts";
import { resolveAnchor } from "./anchors.ts";
import { runSpatialChecks } from "./constraints.ts";
import { PRESET_LAYER_ROLES } from "./validation.ts";

const PRESET_ROLES_SET = new Set<string>(PRESET_LAYER_ROLES);

// ----------------------------------------------------------------------------
// 1. Success Result Helpers (Avoids Duplication)
// ----------------------------------------------------------------------------

function makeSuccessResult(
	doc: BlueprintDocument,
	env: ReducerEnvironment,
	nextContent: DocumentContent,
	delta: DocumentDelta,
): ReducerResult {
	const nextDoc: BlueprintDocument = {
		...doc,
		revision: doc.revision + 1,
		updatedAt: env.clock(),
		content: nextContent,
	};
	return {
		success: true,
		document: nextDoc,
		delta,
		issues: runSpatialChecks(nextDoc),
	};
}

function updateSingleEntityResult(
	doc: BlueprintDocument,
	env: ReducerEnvironment,
	id: Id,
	nextEntity: Entity,
): ReducerResult {
	return makeSuccessResult(
		doc,
		env,
		{
			...doc.content,
			entities: {
				...doc.content.entities,
				[id]: nextEntity,
			},
		},
		{
			addedEntityIds: [],
			updatedEntityIds: [id],
			deletedEntityIds: [],
		},
	);
}

function updateLayersResult(
	doc: BlueprintDocument,
	env: ReducerEnvironment,
	nextLayers: readonly Layer[],
	changedLayerId: Id,
): ReducerResult {
	return makeSuccessResult(
		doc,
		env,
		{
			...doc.content,
			layers: nextLayers,
		},
		{
			addedEntityIds: [],
			updatedEntityIds: [],
			deletedEntityIds: [],
			changedLayers: [changedLayerId],
		},
	);
}

// ----------------------------------------------------------------------------
// 2. Lock & Visibility Hierarchy Helpers (§5.1, AC-017)
// ----------------------------------------------------------------------------

export function isEntityLockedOrHidden(
	doc: BlueprintDocument,
	entityId: Id,
): { locked: boolean; hidden: boolean; reason?: string } {
	const entity = doc.content.entities[entityId];
	if (!entity) {
		return { locked: false, hidden: false };
	}

	if (entity.locked) {
		return {
			locked: true,
			hidden: entity.hidden,
			reason: `Entity '${entityId}' is locked`,
		};
	}
	if (entity.hidden) {
		return {
			locked: false,
			hidden: true,
			reason: `Entity '${entityId}' is hidden`,
		};
	}

	const layerMap = new Map<Id, Layer>();
	for (const l of doc.content.layers) {
		layerMap.set(l.id, l);
	}

	let currentLayerId: Id | null = entity.layerId;
	const visited = new Set<Id>();

	while (currentLayerId && !visited.has(currentLayerId)) {
		visited.add(currentLayerId);
		const layer = layerMap.get(currentLayerId);
		if (!layer) break;

		if (layer.locked) {
			return {
				locked: true,
				hidden: !layer.visible,
				reason: `Layer '${layer.id}' is locked`,
			};
		}
		if (!layer.visible) {
			return {
				locked: false,
				hidden: true,
				reason: `Layer '${layer.id}' is hidden`,
			};
		}
		currentLayerId = layer.parentId;
	}

	return { locked: false, hidden: false };
}

function checkEntitiesUnlocked(
	doc: BlueprintDocument,
	entityIds: readonly Id[],
):
	| { ok: true }
	| { ok: false; code: string; message: string; entityIds: readonly Id[] } {
	for (const id of entityIds) {
		const entity = doc.content.entities[id];
		if (!entity) {
			return {
				ok: false,
				code: "ENTITY_NOT_FOUND",
				message: `Target entity '${id}' does not exist`,
				entityIds: [id],
			};
		}

		const status = isEntityLockedOrHidden(doc, id);
		if (status.locked || status.hidden) {
			return {
				ok: false,
				code: "LOCKED_ENTITY",
				message: status.reason ?? `Entity '${id}' is locked or hidden`,
				entityIds: [id],
			};
		}
	}
	return { ok: true };
}

// ----------------------------------------------------------------------------
// 3. Entity World Bounds Helper
// ----------------------------------------------------------------------------

export type Bounds = {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
	centerX: number;
	centerY: number;
};

export function boundsFromPoints(pts: readonly Vec2[]): Bounds {
	if (pts.length === 0) {
		return {
			minX: 0,
			minY: 0,
			maxX: 0,
			maxY: 0,
			width: 0,
			height: 0,
			centerX: 0,
			centerY: 0,
		};
	}
	let minX = pts[0].x;
	let maxX = pts[0].x;
	let minY = pts[0].y;
	let maxY = pts[0].y;
	for (let i = 1; i < pts.length; i++) {
		const p = pts[i];
		if (p.x < minX) minX = p.x;
		if (p.x > maxX) maxX = p.x;
		if (p.y < minY) minY = p.y;
		if (p.y > maxY) maxY = p.y;
	}
	return {
		minX,
		minY,
		maxX,
		maxY,
		width: maxX - minX,
		height: maxY - minY,
		centerX: (minX + maxX) / 2,
		centerY: (minY + maxY) / 2,
	};
}

export function rectBoundsInWorld(
	w: number,
	h: number,
	transform: Transform,
): Bounds {
	return boundsFromPoints([
		worldPoint({ x: 0, y: 0 }, transform),
		worldPoint({ x: w, y: 0 }, transform),
		worldPoint({ x: w, y: h }, transform),
		worldPoint({ x: 0, y: h }, transform),
	]);
}

function checkUnlocked(
	doc: BlueprintDocument,
	ids: readonly Id[],
): ReducerResult | null {
	const check = checkEntitiesUnlocked(doc, ids);
	if (!check.ok) {
		return {
			success: false,
			error: {
				code: check.code,
				message: check.message,
				entityIds: check.entityIds,
			},
		};
	}
	return null;
}

function checkEmptyOrUnlocked(
	doc: BlueprintDocument,
	ids: readonly Id[],
): ReducerResult | null {
	if (ids.length === 0) {
		return { success: true, noChange: true, document: doc };
	}
	return checkUnlocked(doc, ids);
}

function getUnlockedEntity<T extends Entity = Entity>(
	doc: BlueprintDocument,
	id: Id,
	expectedKind?: T["kind"],
): { entity: T } | { errorResult: ReducerResult } {
	const err = checkUnlocked(doc, [id]);
	if (err) return { errorResult: err };
	const existing = doc.content.entities[id] as T;
	if (expectedKind && existing.kind !== expectedKind) {
		return {
			errorResult: {
				success: false,
				error: {
					code: "INVALID_COMMAND",
					message: `Entity '${id}' is not a ${expectedKind}`,
					entityIds: [id],
				},
			},
		};
	}
	return { entity: existing };
}

function getLayer(
	doc: BlueprintDocument,
	layerId: Id,
): { layer: Layer } | { errorResult: ReducerResult } {
	const layer = doc.content.layers.find((l) => l.id === layerId);
	if (!layer) {
		return {
			errorResult: {
				success: false,
				error: {
					code: "LAYER_NOT_FOUND",
					message: `Layer '${layerId}' not found`,
				},
			},
		};
	}
	return { layer };
}

function getSelectionEntityBounds(
	doc: BlueprintDocument,
	ids: readonly Id[],
): Array<{ id: Id; bounds: Bounds }> {
	return ids.map((id) => ({
		id,
		bounds: getEntityWorldBounds(doc, doc.content.entities[id]),
	}));
}

export function getEntityWorldBounds(
	doc: BlueprintDocument,
	entity: Entity,
): Bounds {
	switch (entity.kind) {
		case "device": {
			const def =
				doc.content.definitions[entity.definitionId] ??
				getCatalogDefinition(entity.definitionId);
			if (def) {
				const activeDef = resolveDeviceDefinition(def, entity.parameters);
				const b = polygonBounds(activeDef.footprint);
				return boundsFromPoints([
					worldPoint({ x: b.minX, y: b.minY }, entity.transform),
					worldPoint({ x: b.maxX, y: b.minY }, entity.transform),
					worldPoint({ x: b.maxX, y: b.maxY }, entity.transform),
					worldPoint({ x: b.minX, y: b.maxY }, entity.transform),
				]);
			}
			break;
		}
		case "shape": {
			if (entity.geometry.kind === "rect") {
				return rectBoundsInWorld(
					entity.geometry.width,
					entity.geometry.height,
					entity.transform,
				);
			}
			if (entity.geometry.kind === "ellipse") {
				const w = entity.geometry.width;
				const h = entity.geometry.height;
				const center = worldPoint({ x: w / 2, y: h / 2 }, entity.transform);
				return {
					minX: center.x - w / 2,
					minY: center.y - h / 2,
					maxX: center.x + w / 2,
					maxY: center.y + h / 2,
					width: w,
					height: h,
					centerX: center.x,
					centerY: center.y,
				};
			}
			if (
				entity.geometry.kind === "polygon" &&
				entity.geometry.polygons.length > 0
			) {
				const pts = entity.geometry.polygons[0].outer.map((v) =>
					worldPoint(v, entity.transform),
				);
				return boundsFromPoints(pts);
			}
			break;
		}
		case "wall": {
			const pts = entity.vertices.map((v) =>
				worldPoint(v.point, entity.transform),
			);
			return boundsFromPoints(pts);
		}
		case "zone": {
			const pts = entity.polygon.outer.map((v) =>
				worldPoint(v, entity.transform),
			);
			return boundsFromPoints(pts);
		}
		case "dimension": {
			const pa = resolveAnchor(doc, entity.a);
			const pb = resolveAnchor(doc, entity.b);
			return boundsFromPoints([pa, pb]);
		}
		case "annotation": {
			const p = resolveAnchor(doc, entity.anchor);
			return boundsFromPoints([p]);
		}
		case "reference": {
			return rectBoundsInWorld(
				entity.widthMm,
				entity.heightMm,
				entity.transform,
			);
		}
		default:
			break;
	}

	const origin = worldPoint({ x: 0, y: 0 }, entity.transform);
	return boundsFromPoints([origin]);
}

// ----------------------------------------------------------------------------
// 4. Deletion Cascade Helper (§5.1, AC-021)
// ----------------------------------------------------------------------------

function executeCascadeDeletion(
	doc: BlueprintDocument,
	targetIds: readonly Id[],
): {
	nextEntities: Record<Id, Entity>;
	nextEntityOrder: Id[];
	nextRelations: Relation[];
	nextGroups: Group[];
	deletedEntityIds: Id[];
	updatedEntityIds: Id[];
	changedRelations: Id[];
} {
	const allDeleted = new Set<Id>(targetIds);

	// 1. Cascade to child openings of deleted walls
	let addedMore = true;
	while (addedMore) {
		addedMore = false;
		for (const entity of Object.values(doc.content.entities)) {
			if (
				entity.kind === "opening" &&
				allDeleted.has(entity.wallId) &&
				!allDeleted.has(entity.id)
			) {
				allDeleted.add(entity.id);
				addedMore = true;
			}
		}
	}

	const nextEntities: Record<Id, Entity> = {};
	const updatedEntityIds: Id[] = [];

	// 2. Clone surviving entities and freeze anchors referencing deleted entities
	for (const [id, entity] of Object.entries(doc.content.entities)) {
		if (allDeleted.has(id)) continue;

		if (entity.kind === "dimension") {
			let changed = false;
			let anchorA = entity.a;
			let anchorB = entity.b;

			if (anchorA.kind === "entity" && allDeleted.has(anchorA.entityId)) {
				const resolvedPoint = resolveAnchor(doc, anchorA);
				anchorA = { kind: "point", point: resolvedPoint };
				changed = true;
			}
			if (anchorB.kind === "entity" && allDeleted.has(anchorB.entityId)) {
				const resolvedPoint = resolveAnchor(doc, anchorB);
				anchorB = { kind: "point", point: resolvedPoint };
				changed = true;
			}

			if (changed) {
				nextEntities[id] = {
					...entity,
					a: anchorA,
					b: anchorB,
				};
				updatedEntityIds.push(id);
			} else {
				nextEntities[id] = entity;
			}
		} else if (entity.kind === "annotation") {
			let anchor = entity.anchor;
			if (anchor.kind === "entity" && allDeleted.has(anchor.entityId)) {
				const resolvedPoint = resolveAnchor(doc, anchor);
				anchor = { kind: "point", point: resolvedPoint };
				nextEntities[id] = {
					...entity,
					anchor,
				};
				updatedEntityIds.push(id);
			} else {
				nextEntities[id] = entity;
			}
		} else {
			nextEntities[id] = entity;
		}
	}

	// 3. Remove from entityOrder
	const nextEntityOrder = doc.content.entityOrder.filter(
		(id) => !allDeleted.has(id),
	);

	// 4. Remove incident relations
	const nextRelations: Relation[] = [];
	const changedRelations: Id[] = [];
	for (const rel of doc.content.relations) {
		let remove = false;
		if (rel.kind === "memberOfLine" && allDeleted.has(rel.deviceId)) {
			remove = true;
		} else if (
			rel.kind === "observes" &&
			(allDeleted.has(rel.sensorId) || allDeleted.has(rel.assetId))
		) {
			remove = true;
		} else if (
			rel.kind === "flow" &&
			(allDeleted.has(rel.fromDeviceId) || allDeleted.has(rel.toDeviceId))
		) {
			remove = true;
		} else if (
			rel.kind === "assignedZone" &&
			(allDeleted.has(rel.deviceId) || allDeleted.has(rel.zoneId))
		) {
			remove = true;
		}

		if (remove) {
			changedRelations.push(rel.id);
		} else {
			nextRelations.push(rel);
		}
	}

	// 5. Clean up empty groups (§5.1)
	const remainingGroupMembers = new Set<Id>();
	for (const entity of Object.values(nextEntities)) {
		if (entity.groupId) {
			remainingGroupMembers.add(entity.groupId);
		}
	}
	const nextGroups = doc.content.groups.filter((g) =>
		remainingGroupMembers.has(g.id),
	);

	return {
		nextEntities,
		nextEntityOrder,
		nextRelations,
		nextGroups,
		deletedEntityIds: Array.from(allDeleted),
		updatedEntityIds,
		changedRelations,
	};
}

// ----------------------------------------------------------------------------
// 5. Main Reducer Dispatcher (§5.1)
// ----------------------------------------------------------------------------

export function reduceCommand(
	doc: BlueprintDocument,
	cmd: BlueprintCommand,
	env: ReducerEnvironment,
): ReducerResult {
	// AC-016: Preview mode rejects all document-modifying commands
	if (env.mode === "preview") {
		return {
			success: false,
			error: {
				code: "READ_ONLY",
				message: "Document is in preview mode (read-only)",
			},
		};
	}

	switch (cmd.type) {
		// Document metadata & settings
		case "document.rename": {
			if (cmd.name === doc.content.name) {
				return { success: true, noChange: true, document: doc };
			}
			return makeSuccessResult(
				doc,
				env,
				{ ...doc.content, name: cmd.name },
				{
					addedEntityIds: [],
					updatedEntityIds: [],
					deletedEntityIds: [],
					settingsChanged: true,
				},
			);
		}

		case "document.describe": {
			if (cmd.description === doc.content.description) {
				return { success: true, noChange: true, document: doc };
			}
			return makeSuccessResult(
				doc,
				env,
				{ ...doc.content, description: cmd.description },
				{
					addedEntityIds: [],
					updatedEntityIds: [],
					deletedEntityIds: [],
					settingsChanged: true,
				},
			);
		}

		case "document.settings": {
			const s = cmd.settings;
			let changed = false;
			const nextContent = { ...doc.content };

			if (
				s.displayUnit !== undefined &&
				s.displayUnit !== nextContent.displayUnit
			) {
				nextContent.displayUnit = s.displayUnit;
				changed = true;
			}
			if (s.facility !== undefined) {
				if (
					s.facility.widthMm !== nextContent.facility.widthMm ||
					s.facility.heightMm !== nextContent.facility.heightMm
				) {
					nextContent.facility = { ...s.facility };
					changed = true;
				}
			}
			if (s.grid !== undefined) {
				nextContent.grid = { ...nextContent.grid, ...s.grid };
				changed = true;
			}
			if (s.metadata !== undefined) {
				nextContent.metadata = { ...s.metadata };
				changed = true;
			}

			if (!changed) {
				return { success: true, noChange: true, document: doc };
			}

			return makeSuccessResult(doc, env, nextContent, {
				addedEntityIds: [],
				updatedEntityIds: [],
				deletedEntityIds: [],
				settingsChanged: true,
			});
		}

		// Entity CRUD
		case "entity.add": {
			if (doc.content.entities[cmd.entity.id]) {
				return {
					success: false,
					error: {
						code: "DUPLICATE_ID",
						message: `Entity with ID '${cmd.entity.id}' already exists`,
						entityIds: [cmd.entity.id],
					},
				};
			}

			if (!doc.content.layers.some((l) => l.id === cmd.entity.layerId)) {
				return {
					success: false,
					error: {
						code: "LAYER_NOT_FOUND",
						message: `Layer '${cmd.entity.layerId}' not found for entity '${cmd.entity.id}'`,
						entityIds: [cmd.entity.id],
					},
				};
			}

			let nextDefinitions = doc.content.definitions;
			let changedDefinitions: Id[] | undefined;
			if (
				cmd.entity.kind === "device" &&
				!nextDefinitions[cmd.entity.definitionId]
			) {
				const catalogDef = getCatalogDefinition(cmd.entity.definitionId);
				if (catalogDef) {
					nextDefinitions = {
						...nextDefinitions,
						[cmd.entity.definitionId]: catalogDef,
					};
					changedDefinitions = [cmd.entity.definitionId];
				}
			}

			const nextEntities = {
				...doc.content.entities,
				[cmd.entity.id]: cmd.entity,
			};
			const nextEntityOrder = [...doc.content.entityOrder];
			if (
				cmd.index !== undefined &&
				cmd.index >= 0 &&
				cmd.index <= nextEntityOrder.length
			) {
				nextEntityOrder.splice(cmd.index, 0, cmd.entity.id);
			} else {
				nextEntityOrder.push(cmd.entity.id);
			}

			return makeSuccessResult(
				doc,
				env,
				{
					...doc.content,
					entities: nextEntities,
					entityOrder: nextEntityOrder,
					definitions: nextDefinitions,
				},
				{
					addedEntityIds: [cmd.entity.id],
					updatedEntityIds: [],
					deletedEntityIds: [],
					changedDefinitions,
				},
			);
		}

		case "entity.update": {
			const res = getUnlockedEntity(doc, cmd.id);
			if ("errorResult" in res) return res.errorResult;
			const existing = res.entity;
			const nextEntity = {
				...existing,
				...cmd.patch,
				id: existing.id,
				kind: existing.kind,
			} as Entity;

			return updateSingleEntityResult(doc, env, cmd.id, nextEntity);
		}

		case "entity.delete": {
			const err = checkUnlocked(doc, cmd.ids);
			if (err) return err;

			const cascade = executeCascadeDeletion(doc, cmd.ids);
			return makeSuccessResult(
				doc,
				env,
				{
					...doc.content,
					entities: cascade.nextEntities,
					entityOrder: cascade.nextEntityOrder,
					relations: cascade.nextRelations,
					groups: cascade.nextGroups,
				},
				{
					addedEntityIds: [],
					updatedEntityIds: cascade.updatedEntityIds,
					deletedEntityIds: cascade.deletedEntityIds,
					changedRelations: cascade.changedRelations,
				},
			);
		}

		// Selection transformations & manipulation
		case "selection.transform": {
			return handleSelectionTransform(doc, cmd, env);
		}

		case "selection.duplicate": {
			return handleSelectionDuplicate(doc, cmd, env);
		}

		case "selection.align": {
			return handleSelectionAlign(doc, cmd, env);
		}

		case "selection.distribute": {
			return handleSelectionDistribute(doc, cmd, env);
		}

		// Groups
		case "group.create": {
			const earlyResult = checkEmptyOrUnlocked(doc, cmd.ids);
			if (earlyResult) return earlyResult;

			const layerIds = new Set(
				cmd.ids.map((id) => doc.content.entities[id].layerId),
			);
			if (layerIds.size > 1) {
				return {
					success: false,
					error: {
						code: "GROUP_CROSS_LAYER",
						message: "Group members must all belong to the same layer",
						entityIds: cmd.ids,
					},
				};
			}

			const groupId = env.idFactory();
			const newGroup: Group = {
				id: groupId,
				name: cmd.name ?? "Group",
				parentId: null,
			};

			const nextEntities = { ...doc.content.entities };
			for (const id of cmd.ids) {
				nextEntities[id] = {
					...nextEntities[id],
					groupId,
				};
			}

			return makeSuccessResult(
				doc,
				env,
				{
					...doc.content,
					entities: nextEntities,
					groups: [...doc.content.groups, newGroup],
				},
				{
					addedEntityIds: [],
					updatedEntityIds: [...cmd.ids],
					deletedEntityIds: [],
				},
			);
		}

		case "group.dissolve": {
			const dissolveGroupIds = new Set(cmd.groupIds);
			const updatedIds: Id[] = [];
			const nextEntities = { ...doc.content.entities };

			for (const [id, entity] of Object.entries(nextEntities)) {
				if (entity.groupId && dissolveGroupIds.has(entity.groupId)) {
					nextEntities[id] = {
						...entity,
						groupId: null,
					};
					updatedIds.push(id);
				}
			}

			const nextGroups = doc.content.groups.filter(
				(g) => !dissolveGroupIds.has(g.id),
			);

			return makeSuccessResult(
				doc,
				env,
				{
					...doc.content,
					entities: nextEntities,
					groups: nextGroups,
				},
				{
					addedEntityIds: [],
					updatedEntityIds: updatedIds,
					deletedEntityIds: [],
				},
			);
		}

		// Layers
		case "layer.add": {
			const layerId = cmd.layer.id ?? env.idFactory();
			if (doc.content.layers.some((l) => l.id === layerId)) {
				return {
					success: false,
					error: {
						code: "DUPLICATE_ID",
						message: `Layer with ID '${layerId}' already exists`,
					},
				};
			}

			const newLayer: Layer = {
				id: layerId,
				name: cmd.layer.name,
				role: cmd.layer.role ?? "custom",
				parentId: cmd.layer.parentId ?? null,
				visible: cmd.layer.visible ?? true,
				locked: cmd.layer.locked ?? false,
				printable: cmd.layer.printable ?? true,
				opacity: cmd.layer.opacity ?? 1,
			};

			const nextLayers = [...doc.content.layers];
			if (
				cmd.index !== undefined &&
				cmd.index >= 0 &&
				cmd.index <= nextLayers.length
			) {
				nextLayers.splice(cmd.index, 0, newLayer);
			} else {
				nextLayers.push(newLayer);
			}

			return updateLayersResult(doc, env, nextLayers, layerId);
		}

		case "layer.update": {
			const layerRes = getLayer(doc, cmd.id);
			if ("errorResult" in layerRes) return layerRes.errorResult;
			const existing = layerRes.layer;

			const patchRole = (cmd.patch as Record<string, unknown>).role;
			if (
				patchRole !== undefined &&
				patchRole !== existing.role &&
				PRESET_ROLES_SET.has(existing.role)
			) {
				return {
					success: false,
					error: {
						code: "PRESET_LAYER_PROTECTED",
						message: `Cannot change role of preset layer '${existing.name}'`,
					},
				};
			}

			const nextLayers = doc.content.layers.map((l) => {
				if (l.id !== cmd.id) return l;
				return {
					...l,
					...cmd.patch,
					id: l.id,
					role: l.role,
				};
			});

			return updateLayersResult(doc, env, nextLayers, cmd.id);
		}

		case "layer.move": {
			const existingIndex = doc.content.layers.findIndex(
				(l) => l.id === cmd.id,
			);
			if (existingIndex === -1) {
				return {
					success: false,
					error: {
						code: "LAYER_NOT_FOUND",
						message: `Layer '${cmd.id}' not found`,
					},
				};
			}

			if (cmd.targetParentId === cmd.id) {
				return {
					success: false,
					error: {
						code: "HIERARCHY_CYCLE",
						message: "Layer cannot be its own parent",
					},
				};
			}

			const targetLayer = {
				...doc.content.layers[existingIndex],
				parentId: cmd.targetParentId,
			};
			const nextLayers = doc.content.layers.filter((l) => l.id !== cmd.id);
			const insertIdx = Math.max(
				0,
				Math.min(cmd.targetIndex, nextLayers.length),
			);
			nextLayers.splice(insertIdx, 0, targetLayer);

			return updateLayersResult(doc, env, nextLayers, cmd.id);
		}

		case "layer.delete": {
			const layerRes = getLayer(doc, cmd.id);
			if ("errorResult" in layerRes) return layerRes.errorResult;
			const existing = layerRes.layer;

			if (PRESET_ROLES_SET.has(existing.role)) {
				return {
					success: false,
					error: {
						code: "PRESET_LAYER_PROTECTED",
						message: `Preset layer '${existing.name}' (${existing.role}) cannot be deleted`,
					},
				};
			}

			const layerEntities = Object.values(doc.content.entities).filter(
				(e) => e.layerId === cmd.id,
			);

			const nextLayers = doc.content.layers
				.filter((l) => l.id !== cmd.id)
				.map((l) =>
					l.parentId === cmd.id ? { ...l, parentId: existing.parentId } : l,
				);

			if (cmd.mode === "moveContents") {
				if (!cmd.targetLayerId) {
					return {
						success: false,
						error: {
							code: "INVALID_COMMAND",
							message: "targetLayerId is required when mode is 'moveContents'",
						},
					};
				}
				if (!doc.content.layers.some((l) => l.id === cmd.targetLayerId)) {
					return {
						success: false,
						error: {
							code: "LAYER_NOT_FOUND",
							message: `Target layer '${cmd.targetLayerId}' not found`,
						},
					};
				}

				const nextEntities = { ...doc.content.entities };
				const updatedIds: Id[] = [];
				for (const e of layerEntities) {
					nextEntities[e.id] = { ...e, layerId: cmd.targetLayerId };
					updatedIds.push(e.id);
				}

				return makeSuccessResult(
					doc,
					env,
					{
						...doc.content,
						entities: nextEntities,
						layers: nextLayers,
					},
					{
						addedEntityIds: [],
						updatedEntityIds: updatedIds,
						deletedEntityIds: [],
						changedLayers: [cmd.id],
					},
				);
			}

			// Mode: deleteContents
			const cascade = executeCascadeDeletion(
				doc,
				layerEntities.map((e) => e.id),
			);

			return makeSuccessResult(
				doc,
				env,
				{
					...doc.content,
					entities: cascade.nextEntities,
					entityOrder: cascade.nextEntityOrder,
					relations: cascade.nextRelations,
					groups: cascade.nextGroups,
					layers: nextLayers,
				},
				{
					addedEntityIds: [],
					updatedEntityIds: cascade.updatedEntityIds,
					deletedEntityIds: cascade.deletedEntityIds,
					changedRelations: cascade.changedRelations,
					changedLayers: [cmd.id],
				},
			);
		}

		// Walls and Openings
		case "wall.setVertices": {
			const check = checkEntitiesUnlocked(doc, [cmd.id]);
			if (!check.ok) {
				return {
					success: false,
					error: {
						code: check.code,
						message: check.message,
						entityIds: check.entityIds,
					},
				};
			}

			const wall = doc.content.entities[cmd.id];
			if (wall.kind !== "wall") {
				return {
					success: false,
					error: {
						code: "INVALID_COMMAND",
						message: `Entity '${cmd.id}' is not a wall`,
						entityIds: [cmd.id],
					},
				};
			}

			const quantizedVertices = cmd.vertices.map((v) => ({
				id: v.id,
				point: quantizeVec2(v.point),
			}));

			const prospectiveWall: WallEntity = {
				...wall,
				vertices: quantizedVertices,
				closed: cmd.closed ?? wall.closed,
			};

			const openings = Object.values(doc.content.entities).filter(
				(e): e is OpeningEntity => e.kind === "opening" && e.wallId === wall.id,
			);
			const openingIssues = validateWallOpeningConstraints(
				prospectiveWall,
				openings,
			);
			if (openingIssues.length > 0) {
				return {
					success: false,
					error: {
						code: "OPENING_CONFLICT",
						message: openingIssues[0].message,
						entityIds: [wall.id],
					},
				};
			}

			return updateSingleEntityResult(doc, env, cmd.id, prospectiveWall);
		}

		case "opening.add": {
			const wall = doc.content.entities[cmd.opening.wallId];
			if (!wall || wall.kind !== "wall") {
				return {
					success: false,
					error: {
						code: "OPENING_CONFLICT",
						message: `Referenced wall '${cmd.opening.wallId}' does not exist or is not a wall`,
						entityIds: [cmd.opening.id],
					},
				};
			}

			const check = checkEntitiesUnlocked(doc, [wall.id]);
			if (!check.ok) {
				return {
					success: false,
					error: {
						code: check.code,
						message: check.message,
						entityIds: check.entityIds,
					},
				};
			}

			const existingOpenings = Object.values(doc.content.entities).filter(
				(e): e is OpeningEntity => e.kind === "opening" && e.wallId === wall.id,
			);
			const openingIssues = validateWallOpeningConstraints(wall, [
				...existingOpenings,
				cmd.opening,
			]);
			if (openingIssues.length > 0) {
				return {
					success: false,
					error: {
						code: "OPENING_CONFLICT",
						message: openingIssues[0].message,
						entityIds: [cmd.opening.id, wall.id],
					},
				};
			}

			return makeSuccessResult(
				doc,
				env,
				{
					...doc.content,
					entities: {
						...doc.content.entities,
						[cmd.opening.id]: cmd.opening,
					},
					entityOrder: [...doc.content.entityOrder, cmd.opening.id],
				},
				{
					addedEntityIds: [cmd.opening.id],
					updatedEntityIds: [],
					deletedEntityIds: [],
				},
			);
		}

		case "opening.update": {
			const res = getUnlockedEntity<OpeningEntity>(doc, cmd.id, "opening");
			if ("errorResult" in res) return res.errorResult;
			const existing = res.entity;

			const wall = doc.content.entities[existing.wallId];
			if (!wall || wall.kind !== "wall") {
				return {
					success: false,
					error: {
						code: "OPENING_CONFLICT",
						message: "Parent wall not found",
						entityIds: [cmd.id],
					},
				};
			}

			const prospectiveOpening: OpeningEntity = {
				...existing,
				...cmd.patch,
			};

			const otherOpenings = Object.values(doc.content.entities).filter(
				(e): e is OpeningEntity =>
					e.kind === "opening" && e.wallId === wall.id && e.id !== cmd.id,
			);
			const issues = validateWallOpeningConstraints(wall, [
				...otherOpenings,
				prospectiveOpening,
			]);
			if (issues.length > 0) {
				return {
					success: false,
					error: {
						code: "OPENING_CONFLICT",
						message: issues[0].message,
						entityIds: [cmd.id, wall.id],
					},
				};
			}

			return updateSingleEntityResult(doc, env, cmd.id, prospectiveOpening);
		}

		// Zones
		case "zone.setPolygon": {
			const res = getUnlockedEntity<ZoneEntity>(doc, cmd.id, "zone");
			if ("errorResult" in res) return res.errorResult;
			const existing = res.entity;

			const topologyIssues = validatePolygonTopology(
				cmd.polygon,
				`content.entities.${cmd.id}.polygon`,
			);
			if (topologyIssues.length > 0) {
				return {
					success: false,
					error: {
						code: topologyIssues[0].code,
						message: topologyIssues[0].message,
						entityIds: [cmd.id],
						path: topologyIssues[0].path,
					},
				};
			}

			const nextZone: ZoneEntity = {
				...existing,
				polygon: cmd.polygon,
			};

			return updateSingleEntityResult(doc, env, cmd.id, nextZone);
		}

		// Devices
		case "device.parameters": {
			const res = getUnlockedEntity<DeviceEntity>(doc, cmd.id, "device");
			if ("errorResult" in res) return res.errorResult;
			const existing = res.entity;

			let identical = true;
			const oldKeys = Object.keys(existing.parameters);
			const newKeys = Object.keys(cmd.parameters);
			if (oldKeys.length !== newKeys.length) {
				identical = false;
			} else {
				for (const k of newKeys) {
					if (existing.parameters[k] !== cmd.parameters[k]) {
						identical = false;
						break;
					}
				}
			}

			if (identical) {
				return { success: true, noChange: true, document: doc };
			}

			const nextDevice: DeviceEntity = {
				...existing,
				parameters: { ...cmd.parameters },
			};

			return updateSingleEntityResult(doc, env, cmd.id, nextDevice);
		}

		case "device.binding": {
			const res = getUnlockedEntity<DeviceEntity>(doc, cmd.id, "device");
			if ("errorResult" in res) return res.errorResult;
			const existing = res.entity;

			const nextDevice: DeviceEntity = {
				...existing,
				bindings: [...cmd.bindings],
			};

			return updateSingleEntityResult(doc, env, cmd.id, nextDevice);
		}

		case "device.upgradeDefinition": {
			const res = getUnlockedEntity<DeviceEntity>(doc, cmd.id, "device");
			if ("errorResult" in res) return res.errorResult;
			const existing = res.entity;

			const def =
				doc.content.definitions[cmd.definitionId] ??
				getCatalogDefinition(cmd.definitionId);
			if (!def) {
				return {
					success: false,
					error: {
						code: "DEFINITION_NOT_FOUND",
						message: `Definition '${cmd.definitionId}' not found in document or catalog`,
						entityIds: [cmd.id],
					},
				};
			}

			const nextDevice: DeviceEntity = {
				...existing,
				definitionId: cmd.definitionId,
				parameters: cmd.parameters
					? { ...cmd.parameters }
					: existing.parameters,
			};

			return updateSingleEntityResult(doc, env, cmd.id, nextDevice);
		}

		// Relations & Production Lines
		case "relation.add": {
			if (doc.content.relations.some((r) => r.id === cmd.relation.id)) {
				return {
					success: false,
					error: {
						code: "DUPLICATE_ID",
						message: `Relation '${cmd.relation.id}' already exists`,
					},
				};
			}

			return makeSuccessResult(
				doc,
				env,
				{
					...doc.content,
					relations: [...doc.content.relations, cmd.relation],
				},
				{
					addedEntityIds: [],
					updatedEntityIds: [],
					deletedEntityIds: [],
					changedRelations: [cmd.relation.id],
				},
			);
		}

		case "relation.delete": {
			const rel = doc.content.relations.find((r) => r.id === cmd.id);
			if (!rel) {
				return { success: true, noChange: true, document: doc };
			}

			return makeSuccessResult(
				doc,
				env,
				{
					...doc.content,
					relations: doc.content.relations.filter((r) => r.id !== cmd.id),
				},
				{
					addedEntityIds: [],
					updatedEntityIds: [],
					deletedEntityIds: [],
					changedRelations: [cmd.id],
				},
			);
		}

		case "line.add": {
			if (doc.content.lines.some((l) => l.id === cmd.line.id)) {
				return {
					success: false,
					error: {
						code: "DUPLICATE_ID",
						message: `Production line '${cmd.line.id}' already exists`,
					},
				};
			}

			return makeSuccessResult(
				doc,
				env,
				{
					...doc.content,
					lines: [...doc.content.lines, cmd.line],
				},
				{
					addedEntityIds: [],
					updatedEntityIds: [],
					deletedEntityIds: [],
					changedLines: [cmd.line.id],
				},
			);
		}

		case "line.update": {
			const existing = doc.content.lines.find((l) => l.id === cmd.id);
			if (!existing) {
				return {
					success: false,
					error: {
						code: "LINE_NOT_FOUND",
						message: `Production line '${cmd.id}' not found`,
					},
				};
			}

			const nextLines = doc.content.lines.map((l) =>
				l.id === cmd.id ? { ...l, ...cmd.patch, id: l.id } : l,
			);

			return makeSuccessResult(
				doc,
				env,
				{
					...doc.content,
					lines: nextLines,
				},
				{
					addedEntityIds: [],
					updatedEntityIds: [],
					deletedEntityIds: [],
					changedLines: [cmd.id],
				},
			);
		}

		case "line.delete": {
			const line = doc.content.lines.find((l) => l.id === cmd.id);
			if (!line) {
				return { success: true, noChange: true, document: doc };
			}

			const removedRelations: Id[] = [];
			const nextRelations = doc.content.relations.filter((r) => {
				if (r.kind === "memberOfLine" && r.lineId === cmd.id) {
					removedRelations.push(r.id);
					return false;
				}
				return true;
			});

			return makeSuccessResult(
				doc,
				env,
				{
					...doc.content,
					lines: doc.content.lines.filter((l) => l.id !== cmd.id),
					relations: nextRelations,
				},
				{
					addedEntityIds: [],
					updatedEntityIds: [],
					deletedEntityIds: [],
					changedLines: [cmd.id],
					changedRelations: removedRelations,
				},
			);
		}

		// Dimensions & Annotations
		case "dimension.setAnchors": {
			const res = getUnlockedEntity<DimensionEntity>(doc, cmd.id, "dimension");
			if ("errorResult" in res) return res.errorResult;
			const existing = res.entity;

			const nextDimension: DimensionEntity = {
				...existing,
				a: cmd.a,
				b: cmd.b,
			};

			return updateSingleEntityResult(doc, env, cmd.id, nextDimension);
		}

		case "annotation.update": {
			const res = getUnlockedEntity<AnnotationEntity>(
				doc,
				cmd.id,
				"annotation",
			);
			if ("errorResult" in res) return res.errorResult;
			const existing = res.entity;

			const nextAnnotation: AnnotationEntity = {
				...existing,
				...cmd.patch,
			};

			return updateSingleEntityResult(doc, env, cmd.id, nextAnnotation);
		}

		case "history.undo":
		case "history.redo": {
			return {
				success: false,
				error: {
					code: "HISTORY_COMMAND_REQUIRES_MANAGER",
					message: "Undo/redo commands must be executed via HistoryManager",
				},
			};
		}

		case "batch": {
			return handleBatchCommand(doc, cmd, env);
		}

		default: {
			return {
				success: false,
				error: {
					code: "UNKNOWN_COMMAND",
					message: `Unknown command type: ${(cmd as { type: string }).type}`,
				},
			};
		}
	}
}

// ----------------------------------------------------------------------------
// 6. Handlers for Selection Transform, Duplicate, Align, Distribute, Batch
// ----------------------------------------------------------------------------

function handleSelectionTransform(
	doc: BlueprintDocument,
	cmd: SelectionTransformCommand,
	env: ReducerEnvironment,
): ReducerResult {
	const earlyResult = checkEmptyOrUnlocked(doc, cmd.ids);
	if (earlyResult) return earlyResult;

	const delta = cmd.delta ? quantizeVec2(cmd.delta) : { x: 0, y: 0 };
	const rotation = cmd.rotationDeg ?? 0;
	const isPureNoop =
		Math.abs(delta.x) < GEOMETRY_EPSILON_MM &&
		Math.abs(delta.y) < GEOMETRY_EPSILON_MM &&
		rotation === 0 &&
		!cmd.dimensions;

	if (isPureNoop) {
		return { success: true, noChange: true, document: doc };
	}

	let pivot = cmd.pivot;
	if (rotation !== 0 && !pivot) {
		const boundsList = cmd.ids.map((id) =>
			getEntityWorldBounds(doc, doc.content.entities[id]),
		);
		const minX = Math.min(...boundsList.map((b) => b.minX));
		const maxX = Math.max(...boundsList.map((b) => b.maxX));
		const minY = Math.min(...boundsList.map((b) => b.minY));
		const maxY = Math.max(...boundsList.map((b) => b.maxY));
		pivot = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
	}

	const nextEntities = { ...doc.content.entities };
	let anyChanged = false;

	for (const id of cmd.ids) {
		const entity = doc.content.entities[id];
		if (!entity) continue;
		if (entity.kind === "opening") continue;

		let nextTransform: Transform = { ...entity.transform };

		if (rotation !== 0 && pivot) {
			const rad = (rotation * Math.PI) / 180;
			const cos = Math.cos(rad);
			const sin = Math.sin(rad);
			const dx = entity.transform.x - pivot.x;
			const dy = entity.transform.y - pivot.y;
			const rotatedX = pivot.x + (dx * cos - dy * sin);
			const rotatedY = pivot.y + (dx * sin + dy * cos);
			nextTransform = quantizeTransform({
				x: rotatedX + delta.x,
				y: rotatedY + delta.y,
				rotationDeg: entity.transform.rotationDeg + rotation,
			});
		} else {
			nextTransform = quantizeTransform({
				x: entity.transform.x + delta.x,
				y: entity.transform.y + delta.y,
				rotationDeg: entity.transform.rotationDeg,
			});
		}

		let dimensionChanged = false;
		let nextEntity: Entity = { ...entity, transform: nextTransform };

		if (cmd.dimensions && cmd.dimensions[id]) {
			const dims = cmd.dimensions[id];
			if (entity.kind === "shape" && entity.geometry.kind === "rect") {
				const w =
					dims.width !== undefined
						? quantizeMm(dims.width)
						: entity.geometry.width;
				const h =
					dims.height !== undefined
						? quantizeMm(dims.height)
						: entity.geometry.height;
				if (w !== entity.geometry.width || h !== entity.geometry.height) {
					const shapeEntity: ShapeEntity = {
						...entity,
						transform: nextTransform,
						geometry: { ...entity.geometry, width: w, height: h },
					};
					nextEntity = shapeEntity;
					dimensionChanged = true;
				}
			}
		}

		if (
			nextTransform.x !== entity.transform.x ||
			nextTransform.y !== entity.transform.y ||
			nextTransform.rotationDeg !== entity.transform.rotationDeg ||
			dimensionChanged
		) {
			anyChanged = true;
			nextEntities[id] = nextEntity;
		}
	}

	if (!anyChanged) {
		return { success: true, noChange: true, document: doc };
	}

	return makeSuccessResult(
		doc,
		env,
		{
			...doc.content,
			entities: nextEntities,
		},
		{
			addedEntityIds: [],
			updatedEntityIds: [...cmd.ids],
			deletedEntityIds: [],
		},
	);
}

function handleSelectionDuplicate(
	doc: BlueprintDocument,
	cmd: SelectionDuplicateCommand,
	env: ReducerEnvironment,
): ReducerResult {
	const earlyResult = checkEmptyOrUnlocked(doc, cmd.ids);
	if (earlyResult) return earlyResult;

	const offset = cmd.offsetMm ?? { x: 1000, y: 1000 };
	const idMap = new Map<Id, Id>();

	const usedAssetKeys = new Set<string>();
	for (const e of Object.values(doc.content.entities)) {
		if (e.kind === "device") {
			usedAssetKeys.add(e.assetKey);
		}
	}

	const entitiesToDuplicate: Entity[] = [];
	const selectedSet = new Set(cmd.ids);
	for (const id of cmd.ids) {
		const e = doc.content.entities[id];
		if (e) entitiesToDuplicate.push(e);
	}
	for (const e of Object.values(doc.content.entities)) {
		if (
			e.kind === "opening" &&
			selectedSet.has(e.wallId) &&
			!selectedSet.has(e.id)
		) {
			entitiesToDuplicate.push(e);
		}
	}

	for (const e of entitiesToDuplicate) {
		idMap.set(e.id, env.idFactory());
	}

	const duplicatedEntities: Record<Id, Entity> = {};
	const addedEntityIds: Id[] = [];

	for (const original of entitiesToDuplicate) {
		const newId = idMap.get(original.id)!;
		addedEntityIds.push(newId);

		if (original.kind === "device") {
			const baseKey = original.assetKey.replace(/-copy-\d+$/, "");
			let counter = 1;
			let candidate = `${baseKey}-copy-${counter}`;
			while (usedAssetKeys.has(candidate)) {
				counter++;
				candidate = `${baseKey}-copy-${counter}`;
			}
			usedAssetKeys.add(candidate);

			const newDev: DeviceEntity = {
				...original,
				id: newId,
				assetKey: candidate,
				bindings: [],
				transform: quantizeTransform({
					...original.transform,
					x: original.transform.x + offset.x,
					y: original.transform.y + offset.y,
				}),
			};
			duplicatedEntities[newId] = newDev;
		} else if (original.kind === "opening") {
			const parentWallId = idMap.get(original.wallId) ?? original.wallId;
			const newOpening: OpeningEntity = {
				...original,
				id: newId,
				wallId: parentWallId,
			};
			duplicatedEntities[newId] = newOpening;
		} else if (original.kind === "wall") {
			const newWall: WallEntity = {
				...original,
				id: newId,
				transform: quantizeTransform({
					...original.transform,
					x: original.transform.x + offset.x,
					y: original.transform.y + offset.y,
				}),
			};
			duplicatedEntities[newId] = newWall;
		} else {
			duplicatedEntities[newId] = {
				...original,
				id: newId,
				transform: quantizeTransform({
					...original.transform,
					x: original.transform.x + offset.x,
					y: original.transform.y + offset.y,
				}),
			} as Entity;
		}
	}

	const clonedRelations: Relation[] = [];
	const clonedRelIds: Id[] = [];

	for (const rel of doc.content.relations) {
		if (rel.kind === "flow") {
			if (idMap.has(rel.fromDeviceId) && idMap.has(rel.toDeviceId)) {
				const relId = env.idFactory();
				clonedRelations.push({
					...rel,
					id: relId,
					fromDeviceId: idMap.get(rel.fromDeviceId)!,
					toDeviceId: idMap.get(rel.toDeviceId)!,
				});
				clonedRelIds.push(relId);
			}
		} else if (rel.kind === "assignedZone") {
			if (idMap.has(rel.deviceId) && idMap.has(rel.zoneId)) {
				const relId = env.idFactory();
				clonedRelations.push({
					...rel,
					id: relId,
					deviceId: idMap.get(rel.deviceId)!,
					zoneId: idMap.get(rel.zoneId)!,
				});
				clonedRelIds.push(relId);
			}
		} else if (rel.kind === "observes") {
			if (idMap.has(rel.sensorId) && idMap.has(rel.assetId)) {
				const relId = env.idFactory();
				clonedRelations.push({
					...rel,
					id: relId,
					sensorId: idMap.get(rel.sensorId)!,
					assetId: idMap.get(rel.assetId)!,
				});
				clonedRelIds.push(relId);
			}
		}
	}

	return makeSuccessResult(
		doc,
		env,
		{
			...doc.content,
			entities: {
				...doc.content.entities,
				...duplicatedEntities,
			},
			entityOrder: [...doc.content.entityOrder, ...addedEntityIds],
			relations: [...doc.content.relations, ...clonedRelations],
		},
		{
			addedEntityIds,
			updatedEntityIds: [],
			deletedEntityIds: [],
			changedRelations: clonedRelIds,
		},
	);
}

function handleSelectionAlign(
	doc: BlueprintDocument,
	cmd: SelectionAlignCommand,
	env: ReducerEnvironment,
): ReducerResult {
	if (cmd.ids.length < 2) {
		return {
			success: false,
			error: {
				code: "ALIGN_MIN_ENTITIES",
				message: "Selection align requires at least 2 entities",
				entityIds: cmd.ids,
			},
		};
	}

	const err = checkUnlocked(doc, cmd.ids);
	if (err) return err;

	const boundsList = getSelectionEntityBounds(doc, cmd.ids);

	const globalMinX = Math.min(...boundsList.map((b) => b.bounds.minX));
	const globalMaxX = Math.max(...boundsList.map((b) => b.bounds.maxX));
	const globalMinY = Math.min(...boundsList.map((b) => b.bounds.minY));
	const globalMaxY = Math.max(...boundsList.map((b) => b.bounds.maxY));
	const globalCenterX = (globalMinX + globalMaxX) / 2;
	const globalCenterY = (globalMinY + globalMaxY) / 2;

	const nextEntities = { ...doc.content.entities };
	let anyMoved = false;

	for (const { id, bounds } of boundsList) {
		const entity = doc.content.entities[id];
		let dx = 0;
		let dy = 0;

		switch (cmd.alignment) {
			case "left":
				dx = globalMinX - bounds.minX;
				break;
			case "right":
				dx = globalMaxX - bounds.maxX;
				break;
			case "center":
				dx = globalCenterX - bounds.centerX;
				break;
			case "top":
				dy = globalMinY - bounds.minY;
				break;
			case "bottom":
				dy = globalMaxY - bounds.maxY;
				break;
			case "middle":
				dy = globalCenterY - bounds.centerY;
				break;
		}

		if (
			Math.abs(dx) > GEOMETRY_EPSILON_MM ||
			Math.abs(dy) > GEOMETRY_EPSILON_MM
		) {
			anyMoved = true;
			nextEntities[id] = {
				...entity,
				transform: quantizeTransform({
					...entity.transform,
					x: entity.transform.x + dx,
					y: entity.transform.y + dy,
				}),
			};
		}
	}

	if (!anyMoved) {
		return { success: true, noChange: true, document: doc };
	}

	return makeSuccessResult(
		doc,
		env,
		{
			...doc.content,
			entities: nextEntities,
		},
		{
			addedEntityIds: [],
			updatedEntityIds: [...cmd.ids],
			deletedEntityIds: [],
		},
	);
}

function handleSelectionDistribute(
	doc: BlueprintDocument,
	cmd: SelectionDistributeCommand,
	env: ReducerEnvironment,
): ReducerResult {
	if (cmd.ids.length < 3) {
		return {
			success: false,
			error: {
				code: "DISTRIBUTE_MIN_ENTITIES",
				message: "Selection distribute requires at least 3 entities",
				entityIds: cmd.ids,
			},
		};
	}

	const err = checkUnlocked(doc, cmd.ids);
	if (err) return err;

	const boundsList = getSelectionEntityBounds(doc, cmd.ids);

	if (cmd.axis === "horizontal") {
		boundsList.sort((a, b) => a.bounds.centerX - b.bounds.centerX);
	} else {
		boundsList.sort((a, b) => a.bounds.centerY - b.bounds.centerY);
	}

	const first = boundsList[0];
	const last = boundsList[boundsList.length - 1];
	const count = boundsList.length;

	const nextEntities = { ...doc.content.entities };
	let anyMoved = false;

	if (cmd.axis === "horizontal") {
		const totalSpan = last.bounds.centerX - first.bounds.centerX;
		const step = totalSpan / (count - 1);

		for (let i = 0; i < count; i++) {
			const targetCenter = first.bounds.centerX + i * step;
			const dx = targetCenter - boundsList[i].bounds.centerX;
			if (Math.abs(dx) > GEOMETRY_EPSILON_MM) {
				anyMoved = true;
				const entity = doc.content.entities[boundsList[i].id];
				nextEntities[entity.id] = {
					...entity,
					transform: quantizeTransform({
						...entity.transform,
						x: entity.transform.x + dx,
					}),
				};
			}
		}
	} else {
		const totalSpan = last.bounds.centerY - first.bounds.centerY;
		const step = totalSpan / (count - 1);

		for (let i = 0; i < count; i++) {
			const targetCenter = first.bounds.centerY + i * step;
			const dy = targetCenter - boundsList[i].bounds.centerY;
			if (Math.abs(dy) > GEOMETRY_EPSILON_MM) {
				anyMoved = true;
				const entity = doc.content.entities[boundsList[i].id];
				nextEntities[entity.id] = {
					...entity,
					transform: quantizeTransform({
						...entity.transform,
						y: entity.transform.y + dy,
					}),
				};
			}
		}
	}

	if (!anyMoved) {
		return { success: true, noChange: true, document: doc };
	}

	return makeSuccessResult(
		doc,
		env,
		{
			...doc.content,
			entities: nextEntities,
		},
		{
			addedEntityIds: [],
			updatedEntityIds: [...cmd.ids],
			deletedEntityIds: [],
		},
	);
}

function handleBatchCommand(
	doc: BlueprintDocument,
	cmd: { type: "batch"; commands: readonly BlueprintCommand[] },
	env: ReducerEnvironment,
): ReducerResult {
	if (cmd.commands.length === 0) {
		return { success: true, noChange: true, document: doc };
	}

	let currentDoc = doc;
	const accumulatedAdded = new Set<Id>();
	const accumulatedUpdated = new Set<Id>();
	const accumulatedDeleted = new Set<Id>();
	const accumulatedLayers = new Set<Id>();
	const accumulatedRelations = new Set<Id>();
	const accumulatedLines = new Set<Id>();
	let settingsChanged = false;
	let anyChangeOccurred = false;

	for (const subCmd of cmd.commands) {
		const res = reduceCommand(currentDoc, subCmd, env);
		if (!res.success) {
			return res;
		}
		if (!res.noChange) {
			anyChangeOccurred = true;
			currentDoc = res.document;
			for (const id of res.delta.addedEntityIds) accumulatedAdded.add(id);
			for (const id of res.delta.updatedEntityIds) accumulatedUpdated.add(id);
			for (const id of res.delta.deletedEntityIds) accumulatedDeleted.add(id);
			if (res.delta.changedLayers) {
				for (const id of res.delta.changedLayers) accumulatedLayers.add(id);
			}
			if (res.delta.changedRelations) {
				for (const id of res.delta.changedRelations)
					accumulatedRelations.add(id);
			}
			if (res.delta.changedLines) {
				for (const id of res.delta.changedLines) accumulatedLines.add(id);
			}
			if (res.delta.settingsChanged) settingsChanged = true;
		}
	}

	if (!anyChangeOccurred) {
		return { success: true, noChange: true, document: doc };
	}

	for (const id of accumulatedDeleted) {
		accumulatedAdded.delete(id);
		accumulatedUpdated.delete(id);
	}

	return makeSuccessResult(doc, env, currentDoc.content, {
		addedEntityIds: Array.from(accumulatedAdded),
		updatedEntityIds: Array.from(accumulatedUpdated),
		deletedEntityIds: Array.from(accumulatedDeleted),
		changedLayers: Array.from(accumulatedLayers),
		changedRelations: Array.from(accumulatedRelations),
		changedLines: Array.from(accumulatedLines),
		settingsChanged,
	});
}
