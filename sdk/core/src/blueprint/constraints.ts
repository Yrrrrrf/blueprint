// ============================================================================
// Blueprint Spatial Constraints & Inspection Engine (§8.3, AC-051, AC-052)
// Pure geometric conflict checks: Footprint overlap, clearance intrusion,
// facility boundary violation, restricted zone intrusion, zone assignment mismatch,
// unbound sensor, and disconnected flow.
// ============================================================================

import type {
	BlueprintDocument,
	DeviceDefinition,
	DeviceEntity,
	Entity,
	Id,
	OpeningEntity,
	Polygon,
	ShapeEntity,
	SpatialIssue,
	SpatialIssueSeverity,
	Vec2,
	ZoneEntity,
} from "./types.ts";
import {
	createRectPolygon,
	deriveWallGeometry,
	multiPolygonArea,
	polygonDifference,
	polygonIntersection,
	transformPolygon,
	worldPoint,
} from "./geometry.ts";
import { getCatalogDefinition, resolveDeviceDefinition } from "./catalog.ts";
import { MIN_POLYGON_AREA_MM2, quantizeMm } from "./units.ts";

export type ObstacleInfo = {
	id: Id;
	kind: "device" | "wall" | "column";
	entity: Entity;
	footprint: Polygon[];
	clearance?: Polygon[];
};

function getShapeWorldPolygon(shape: ShapeEntity): Polygon | null {
	if (shape.geometry.kind === "rect") {
		const localRect = createRectPolygon(
			0,
			0,
			shape.geometry.width,
			shape.geometry.height,
			`shape_${shape.id}`,
		);
		return transformPolygon(localRect, shape.transform);
	}
	if (shape.geometry.kind === "polygon" && shape.geometry.polygons.length > 0) {
		return transformPolygon(shape.geometry.polygons[0], shape.transform);
	}
	return null;
}

function resolveActiveDeviceDefinition(
	doc: BlueprintDocument,
	device: DeviceEntity,
): DeviceDefinition | null {
	const def =
		doc.content.definitions[device.definitionId] ??
		getCatalogDefinition(device.definitionId);
	if (!def) return null;
	return resolveDeviceDefinition(def, device.parameters);
}

/**
 * Extracts all physical obstacles from a document (§8.3).
 */
export function extractObstacles(doc: BlueprintDocument): ObstacleInfo[] {
	const obstacles: ObstacleInfo[] = [];
	const openings = Object.values(doc.content.entities).filter(
		(e): e is OpeningEntity => e.kind === "opening",
	);

	for (const entity of Object.values(doc.content.entities)) {
		if (entity.hidden) continue;

		if (entity.kind === "wall") {
			const wallPolys = deriveWallGeometry(entity, openings, true);
			if (wallPolys.length > 0) {
				obstacles.push({
					id: entity.id,
					kind: "wall",
					entity,
					footprint: wallPolys,
				});
			}
		} else if (entity.kind === "shape" && entity.structural) {
			const shapePoly = getShapeWorldPolygon(entity);
			if (shapePoly) {
				obstacles.push({
					id: entity.id,
					kind: "column",
					entity,
					footprint: [shapePoly],
				});
			}
		} else if (entity.kind === "device") {
			const activeDef = resolveActiveDeviceDefinition(doc, entity);
			if (!activeDef || activeDef.category === "sensor") continue;

			const fpWorld = transformPolygon(activeDef.footprint, entity.transform);
			const clWorld = transformPolygon(activeDef.clearance, entity.transform);
			obstacles.push({
				id: entity.id,
				kind: "device",
				entity,
				footprint: [fpWorld],
				clearance: [clWorld],
			});
		}
	}

	return obstacles;
}

function checkFootprintOverlaps(
	obstacles: readonly ObstacleInfo[],
	revision: number,
): SpatialIssue[] {
	const issues: SpatialIssue[] = [];
	for (let i = 0; i < obstacles.length; i++) {
		for (let j = i + 1; j < obstacles.length; j++) {
			const o1 = obstacles[i];
			const o2 = obstacles[j];
			const inter = polygonIntersection(o1.footprint, o2.footprint);
			const area = multiPolygonArea(inter);

			if (area > MIN_POLYGON_AREA_MM2) {
				const sortedIds = [o1.id, o2.id].sort();
				issues.push({
					id: `FOOTPRINT_OVERLAP:${sortedIds.join(":")}`,
					code: "FOOTPRINT_OVERLAP",
					severity: "warning",
					entityIds: sortedIds,
					geometry: inter[0],
					message: `Footprint overlap between '${sortedIds[0]}' and '${sortedIds[1]}' (${area.toFixed(1)} mm²)`,
					measured: area,
					revision,
				});
			}
		}
	}
	return issues;
}

function checkClearanceIntrusions(
	obstacles: readonly ObstacleInfo[],
	revision: number,
): SpatialIssue[] {
	const issues: SpatialIssue[] = [];
	for (const oSelf of obstacles) {
		if (oSelf.kind !== "device" || !oSelf.clearance) continue;

		const clearanceOnly = polygonDifference(oSelf.clearance, oSelf.footprint);
		if (clearanceOnly.length === 0) continue;

		for (const oOther of obstacles) {
			if (oOther.id === oSelf.id) continue;

			const inter = polygonIntersection(oOther.footprint, clearanceOnly);
			const area = multiPolygonArea(inter);

			if (area > MIN_POLYGON_AREA_MM2) {
				const sortedIds = [oSelf.id, oOther.id].sort();
				const issueId = `CLEARANCE_INTRUSION:${sortedIds.join(":")}`;
				if (!issues.some((iss) => iss.id === issueId)) {
					issues.push({
						id: issueId,
						code: "CLEARANCE_INTRUSION",
						severity: "warning",
						entityIds: sortedIds,
						geometry: inter[0],
						message: `Clearance envelope of '${oSelf.id}' intruded by '${oOther.id}' (${area.toFixed(1)} mm²)`,
						measured: area,
						revision,
					});
				}
			}
		}
	}
	return issues;
}

function checkOutsideFacility(
	doc: BlueprintDocument,
	revision: number,
): SpatialIssue[] {
	const issues: SpatialIssue[] = [];
	const facilityRect = createRectPolygon(
		0,
		0,
		doc.content.facility.widthMm,
		doc.content.facility.heightMm,
		"fac_rect",
	);

	for (const entity of Object.values(doc.content.entities)) {
		if (entity.kind !== "device") continue;
		const activeDef = resolveActiveDeviceDefinition(doc, entity);
		if (!activeDef) continue;

		const fpWorld = transformPolygon(activeDef.footprint, entity.transform);
		const outside = polygonDifference(fpWorld, facilityRect);
		const area = multiPolygonArea(outside);

		if (area > MIN_POLYGON_AREA_MM2) {
			issues.push({
				id: `OUTSIDE_FACILITY:${entity.id}`,
				code: "OUTSIDE_FACILITY",
				severity: "warning",
				entityIds: [entity.id],
				geometry: outside[0],
				message: `Device '${entity.id}' extends outside facility boundaries (${area.toFixed(1)} mm²)`,
				measured: area,
				revision,
			});
		}
	}
	return issues;
}

function checkRestrictedZones(
	doc: BlueprintDocument,
	obstacles: readonly ObstacleInfo[],
	revision: number,
): SpatialIssue[] {
	const issues: SpatialIssue[] = [];
	const zones = Object.values(doc.content.entities).filter(
		(e): e is ZoneEntity => e.kind === "zone",
	);
	const restrictedZones = zones.filter((z) => z.restricted);

	for (const zone of restrictedZones) {
		const zonePolyWorld = transformPolygon(zone.polygon, zone.transform);
		for (const obs of obstacles) {
			if (obs.kind !== "device") continue;
			const inter = polygonIntersection(obs.footprint, [zonePolyWorld]);
			const area = multiPolygonArea(inter);

			if (area > MIN_POLYGON_AREA_MM2) {
				const sortedIds = [obs.id, zone.id].sort();
				issues.push({
					id: `RESTRICTED_ZONE:${sortedIds.join(":")}`,
					code: "RESTRICTED_ZONE",
					severity: "warning",
					entityIds: sortedIds,
					geometry: inter[0],
					message: `Device '${obs.id}' intrudes into restricted zone '${zone.id}' (${area.toFixed(1)} mm²)`,
					measured: area,
					revision,
				});
			}
		}
	}
	return issues;
}

function checkZoneAssignments(
	doc: BlueprintDocument,
	revision: number,
): SpatialIssue[] {
	const issues: SpatialIssue[] = [];
	for (const rel of doc.content.relations) {
		if (rel.kind !== "assignedZone") continue;
		const device = doc.content.entities[rel.deviceId] as
			| DeviceEntity
			| undefined;
		const zone = doc.content.entities[rel.zoneId] as ZoneEntity | undefined;
		if (!device || !zone || device.kind !== "device" || zone.kind !== "zone") {
			continue;
		}

		const activeDef = resolveActiveDeviceDefinition(doc, device);
		if (!activeDef) continue;

		const fpWorld = transformPolygon(activeDef.footprint, device.transform);
		const zonePolyWorld = transformPolygon(zone.polygon, zone.transform);
		const outside = polygonDifference(fpWorld, zonePolyWorld);
		const outsideArea = multiPolygonArea(outside);

		if (outsideArea > MIN_POLYGON_AREA_MM2) {
			const sortedIds = [device.id, zone.id].sort();
			issues.push({
				id: `ZONE_ASSIGNMENT_MISMATCH:${sortedIds.join(":")}`,
				code: "ZONE_ASSIGNMENT_MISMATCH",
				severity: "info",
				entityIds: sortedIds,
				message: `Device '${device.id}' is assigned to zone '${zone.id}' but extends outside it (${outsideArea.toFixed(1)} mm²)`,
				measured: outsideArea,
				revision,
			});
		}
	}
	return issues;
}

function checkUnboundSensors(
	doc: BlueprintDocument,
	revision: number,
): SpatialIssue[] {
	const issues: SpatialIssue[] = [];
	for (const entity of Object.values(doc.content.entities)) {
		if (entity.kind !== "device") continue;
		const def =
			doc.content.definitions[entity.definitionId] ??
			getCatalogDefinition(entity.definitionId);
		if (!def || def.category !== "sensor") continue;

		const hasObserves = doc.content.relations.some(
			(r) => r.kind === "observes" && r.sensorId === entity.id,
		);

		if (!hasObserves) {
			issues.push({
				id: `UNBOUND_SENSOR:${entity.id}`,
				code: "UNBOUND_SENSOR",
				severity: "info",
				entityIds: [entity.id],
				message: `Sensor '${entity.id}' has no active 'observes' relation to any machine asset`,
				revision,
			});
		}
	}
	return issues;
}

function checkDisconnectedFlows(
	doc: BlueprintDocument,
	revision: number,
): SpatialIssue[] {
	const issues: SpatialIssue[] = [];
	for (const rel of doc.content.relations) {
		if (rel.kind !== "flow") continue;
		const fromDev = doc.content.entities[rel.fromDeviceId] as
			| DeviceEntity
			| undefined;
		const toDev = doc.content.entities[rel.toDeviceId] as
			| DeviceEntity
			| undefined;
		if (!fromDev || !toDev) continue;

		const ptFrom = resolveDevicePortWorld(fromDev, rel.fromPortId, doc);
		const ptTo = resolveDevicePortWorld(toDev, rel.toPortId, doc);
		if (!ptFrom || !ptTo) continue;

		const dist = Math.hypot(ptTo.x - ptFrom.x, ptTo.y - ptFrom.y);
		if (dist > 1.0) {
			const sortedIds = [fromDev.id, toDev.id].sort();
			issues.push({
				id: `DISCONNECTED_FLOW:${sortedIds.join(":")}`,
				code: "DISCONNECTED_FLOW",
				severity: "info",
				entityIds: sortedIds,
				message: `Flow relation ports between '${fromDev.id}' and '${toDev.id}' are separated by ${dist.toFixed(1)} mm (> 1 mm)`,
				measured: quantizeMm(dist),
				revision,
			});
		}
	}
	return issues;
}

function resolveDevicePortWorld(
	device: DeviceEntity,
	portId: Id,
	doc: BlueprintDocument,
): Vec2 | null {
	const activeDef = resolveActiveDeviceDefinition(doc, device);
	if (!activeDef) return null;
	const port = activeDef.ports.find((p) => p.id === portId);
	if (!port) return null;
	return worldPoint(port.point, device.transform);
}

function sortSpatialIssues(issues: SpatialIssue[]): SpatialIssue[] {
	const severityRank = (sev: SpatialIssueSeverity): number => {
		switch (sev) {
			case "error":
				return 0;
			case "warning":
				return 1;
			case "info":
				return 2;
		}
	};

	return issues.sort((a, b) => {
		const sevDiff = severityRank(a.severity) - severityRank(b.severity);
		if (sevDiff !== 0) return sevDiff;
		const codeDiff = a.code.localeCompare(b.code);
		if (codeDiff !== 0) return codeDiff;
		return a.id.localeCompare(b.id);
	});
}

/**
 * Runs all pure spatial checks on the committed document (§8.3).
 */
export function runSpatialChecks(
	doc: BlueprintDocument,
	options?: { revision?: number },
): SpatialIssue[] {
	const rev = options?.revision ?? doc.revision;
	const obstacles = extractObstacles(doc);

	const allIssues: SpatialIssue[] = [
		...checkFootprintOverlaps(obstacles, rev),
		...checkClearanceIntrusions(obstacles, rev),
		...checkOutsideFacility(doc, rev),
		...checkRestrictedZones(doc, obstacles, rev),
		...checkZoneAssignments(doc, rev),
		...checkUnboundSensors(doc, rev),
		...checkDisconnectedFlows(doc, rev),
	];

	return sortSpatialIssues(allIssues);
}

/**
 * Runs spatial checks in bounded cooperative chunks yielding between steps (§8.3, C-04).
 * Used as fallback when worker is unavailable or fails.
 */
export async function runSpatialChecksCooperative(
	doc: BlueprintDocument,
	options?: {
		revision?: number;
		yieldFn?: () => Promise<void>;
		cancellationToken?: { isCancelled: boolean };
	},
): Promise<SpatialIssue[]> {
	const rev = options?.revision ?? doc.revision;
	const yieldFn =
		options?.yieldFn ??
		(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
	const isCancelled = () => options?.cancellationToken?.isCancelled ?? false;

	if (isCancelled()) return [];

	const obstacles = extractObstacles(doc);
	await yieldFn();
	if (isCancelled()) return [];

	const issues: SpatialIssue[] = [];

	issues.push(...checkFootprintOverlaps(obstacles, rev));
	await yieldFn();
	if (isCancelled()) return [];

	issues.push(...checkClearanceIntrusions(obstacles, rev));
	await yieldFn();
	if (isCancelled()) return [];

	issues.push(...checkOutsideFacility(doc, rev));
	issues.push(...checkRestrictedZones(doc, obstacles, rev));
	await yieldFn();
	if (isCancelled()) return [];

	issues.push(...checkZoneAssignments(doc, rev));
	issues.push(...checkUnboundSensors(doc, rev));
	issues.push(...checkDisconnectedFlows(doc, rev));

	return sortSpatialIssues(issues);
}
