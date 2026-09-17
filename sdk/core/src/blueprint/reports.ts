// ============================================================================
// Blueprint Pure Reports Engine (§12.6 of Blueprint Specification)
// Generates typed equipment, power, zone, issue, and revision reports.
// Same data structure populates UI, exports, and verification assertions (AC-053).
// ============================================================================

import type {
	BlueprintDocument,
	DeviceDefinition,
	DeviceEntity,
	Id,
	Polygon,
	SpatialIssue,
	TelemetryValue,
	ZoneCategory,
	ZoneEntity,
} from "./types.ts";
import {
	multiPolygonArea,
	polygonArea,
	polygonBounds,
	polygonIntersection,
	polygonUnion,
	transformPolygon,
} from "./geometry.ts";

import { getCatalogDefinition, resolveDeviceDefinition } from "./catalog.ts";
import { runSpatialChecks } from "./constraints.ts";
import { MIN_POLYGON_AREA_MM2, quantizeMm } from "./units.ts";

export interface DeviceTelemetryReportData {
	values?: Readonly<Record<string, TelemetryValue>>;
	status?: "running" | "maintenance" | "offline" | "unknown";
	stale?: boolean;
	quality?: "good" | "bad" | "uncertain";
	observedAt?: string;
}

export type TelemetryDataLookup =
	| ReadonlyMap<Id, DeviceTelemetryReportData>
	| Record<Id, DeviceTelemetryReportData>;

function getTelemetryForDevice(
	lookup: TelemetryDataLookup | undefined,
	deviceId: Id,
): DeviceTelemetryReportData | undefined {
	if (!lookup) return undefined;
	if (lookup instanceof Map || typeof (lookup as any).get === "function") {
		return (lookup as Map<Id, DeviceTelemetryReportData>).get(deviceId);
	}
	return (lookup as Record<Id, DeviceTelemetryReportData>)[deviceId];
}

function resolveDeviceDef(
	doc: BlueprintDocument,
	device: DeviceEntity,
): DeviceDefinition | null {
	const def =
		doc.content.definitions[device.definitionId] ??
		getCatalogDefinition(device.definitionId);
	if (!def) return null;
	return resolveDeviceDefinition(def, device.parameters);
}

// ----------------------------------------------------------------------------
// 1. Power Consumption Report (§12.6, AC-053)
// ----------------------------------------------------------------------------

export interface PowerReportDeviceRow {
	deviceId: Id;
	name: string;
	assetKey: string;
	ratedPowerKw: number | null;
	livePowerKw: number | null;
	status: "fresh" | "stale" | "missing" | "bad";
	quality?: string;
	observedAt?: string;
}

export interface PowerReport {
	totalRatedPowerKw: number;
	totalLivePowerKw: number;
	deviceCount: number;
	measuredCount: number;
	staleCount: number;
	missingCount: number;
	badCount: number;
	devices: PowerReportDeviceRow[];
}

/**
 * Builds power consumption report (§12.6, AC-053).
 * - Sums rated power (kW).
 * - Sums live power (kW) from fresh good numeric samples only.
 * - Stale samples and devices with missing/bad data are explicitly counted in
 *   staleCount / missingCount / badCount and NOT summed into live power.
 */
export function buildPowerReport(
	doc: BlueprintDocument,
	telemetryLookup?: TelemetryDataLookup,
): PowerReport {
	let totalRatedPowerKw = 0;
	let totalLivePowerKw = 0;
	let measuredCount = 0;
	let staleCount = 0;
	let missingCount = 0;
	let badCount = 0;

	const devices: PowerReportDeviceRow[] = [];
	const deviceEntities = Object.values(doc.content.entities).filter(
		(e): e is DeviceEntity => e.kind === "device",
	);

	for (const device of deviceEntities) {
		const rated =
			typeof device.ratedPowerKw === "number" &&
			Number.isFinite(device.ratedPowerKw) &&
			device.ratedPowerKw >= 0
				? device.ratedPowerKw
				: null;

		if (rated !== null) {
			totalRatedPowerKw += rated;
		}

		const tel = getTelemetryForDevice(telemetryLookup, device.id);
		let status: "fresh" | "stale" | "missing" | "bad" = "missing";
		let livePowerKw: number | null = null;
		let quality: string | undefined = tel?.quality;
		const observedAt: string | undefined = tel?.observedAt;

		// Extract raw power value from telemetry values map
		const rawPower =
			tel?.values?.powerKw !== undefined
				? tel.values.powerKw
				: tel?.values?.power !== undefined
					? tel.values.power
					: null;

		if (tel?.stale) {
			// Sample is marked stale (§9.1, AC-049, AC-053)
			staleCount++;
			status = "stale";
			if (typeof rawPower === "number" && Number.isFinite(rawPower)) {
				livePowerKw = Math.round(rawPower * 100) / 100;
			}
			// Stale samples are NOT added to totalLivePowerKw (AC-053)
		} else if (tel?.quality === "bad" || tel?.quality === "uncertain") {
			badCount++;
			status = "bad";
			if (typeof rawPower === "number" && Number.isFinite(rawPower)) {
				livePowerKw = Math.round(rawPower * 100) / 100;
			}
		} else if (typeof rawPower === "number" && Number.isFinite(rawPower)) {
			// Fresh, good numeric sample
			measuredCount++;
			status = "fresh";
			livePowerKw = Math.round(rawPower * 100) / 100;
			totalLivePowerKw += livePowerKw;
		} else {
			missingCount++;
			status = "missing";
		}

		devices.push({
			deviceId: device.id,
			name: device.name,
			assetKey: device.assetKey,
			ratedPowerKw: rated,
			livePowerKw,
			status,
			quality,
			observedAt,
		});
	}

	return {
		totalRatedPowerKw: Math.round(totalRatedPowerKw * 100) / 100,
		totalLivePowerKw: Math.round(totalLivePowerKw * 100) / 100,
		deviceCount: deviceEntities.length,
		measuredCount,
		staleCount,
		missingCount,
		badCount,
		devices,
	};
}

// ----------------------------------------------------------------------------
// 2. Equipment Report (§12.6)
// ----------------------------------------------------------------------------

export interface EquipmentReportRow {
	entityId: Id;
	assetKey: string;
	name: string;
	category: string;
	definitionId: Id;
	zoneIds: readonly Id[];
	zoneNames: readonly string[];
	widthMm: number;
	heightMm: number;
	ratedPowerKw: number | null;
	livePowerKw: number | null;
	status: string;
	freshness: "fresh" | "stale" | "unavailable";
	observedAt: string | null;
	palletCapacity: number | null;
}

/**
 * Calculates pallet capacity for rack devices.
 */
function calculatePalletCapacity(
	def: DeviceDefinition | null,
	device: DeviceEntity,
): number | null {
	if (!def || def.category !== "rack") return null;
	const bays =
		typeof device.parameters?.bays === "number" ? device.parameters.bays : 4;
	const levels =
		typeof device.parameters?.levels === "number"
			? device.parameters.levels
			: 3;
	return bays * levels;
}

/**
 * Builds equipment inventory report (§12.6).
 */
export function buildEquipmentReport(
	doc: BlueprintDocument,
	telemetryLookup?: TelemetryDataLookup,
): EquipmentReportRow[] {
	const rows: EquipmentReportRow[] = [];
	const deviceEntities = Object.values(doc.content.entities).filter(
		(e): e is DeviceEntity => e.kind === "device",
	);

	const zones = Object.values(doc.content.entities).filter(
		(e): e is ZoneEntity => e.kind === "zone",
	);

	for (const dev of deviceEntities) {
		const activeDef = resolveDeviceDef(doc, dev);
		const palletCap = calculatePalletCapacity(activeDef, dev);

		// Compute zone containment geometrically
		const matchedZoneIds: Id[] = [];
		const matchedZoneNames: string[] = [];

		if (activeDef) {
			const fpWorld = transformPolygon(activeDef.footprint, dev.transform);
			for (const zone of zones) {
				const zonePolyWorld = transformPolygon(zone.polygon, zone.transform);
				const inter = polygonIntersection([fpWorld], [zonePolyWorld]);
				if (multiPolygonArea(inter) > MIN_POLYGON_AREA_MM2) {
					matchedZoneIds.push(zone.id);
					matchedZoneNames.push(zone.name);
				}
			}
		}

		// Telemetry values
		const tel = getTelemetryForDevice(telemetryLookup, dev.id);
		let statusStr = "Unavailable";
		let freshness: "fresh" | "stale" | "unavailable" = "unavailable";
		let livePowerKw: number | null = null;
		let observedAt: string | null = null;

		if (tel) {
			if (tel.status) {
				statusStr = tel.status;
			}
			observedAt = tel.observedAt ?? null;
			freshness = tel.stale ? "stale" : "fresh";

			const rawPower =
				tel.values?.powerKw !== undefined
					? tel.values.powerKw
					: tel.values?.power;
			if (typeof rawPower === "number" && Number.isFinite(rawPower)) {
				livePowerKw = Math.round(rawPower * 100) / 100;
			}
		}

		let widthMm = 1000;
		let heightMm = 1000;
		if (activeDef) {
			const bounds = polygonBounds(activeDef.footprint);
			widthMm = quantizeMm(bounds.width);
			heightMm = quantizeMm(bounds.height);
		}

		rows.push({
			entityId: dev.id,
			assetKey: dev.assetKey,
			name: dev.name,
			category: activeDef?.category ?? "other",
			definitionId: dev.definitionId,
			zoneIds: matchedZoneIds,
			zoneNames: matchedZoneNames,
			widthMm,
			heightMm,
			ratedPowerKw: dev.ratedPowerKw ?? null,
			livePowerKw,
			status: statusStr,
			freshness,
			observedAt,
			palletCapacity: palletCap,
		});
	}

	return rows;
}

// ----------------------------------------------------------------------------
// 3. Zone and Area Report (§12.6)
// ----------------------------------------------------------------------------

export interface ZoneReportRow {
	zoneId: Id;
	name: string;
	category: ZoneCategory;
	restricted: boolean;
	zoneAreaM2: number;
	footprintAreaSumM2: number;
	occupiedUnionAreaM2: number;
	palletCapacity: number;
	deviceCount: number;
	assetCountsByCategory: Record<string, number>;
	totalRatedPowerKw: number;
	totalLivePowerKw: number;
	devices: {
		deviceId: Id;
		assetKey: string;
		overlappingMembership?: boolean;
	}[];
}

export interface ZoneReport {
	zones: ZoneReportRow[];
	globalTotals: {
		facilityAreaM2: number;
		totalZoneAreaM2: number;
		globalDeviceCount: number;
		globalPalletCapacity: number;
		globalFootprintAreaSumM2: number;
		globalOccupiedUnionAreaM2: number;
		globalRatedPowerKw: number;
		globalLivePowerKw: number;
	};
}

/**
 * Builds zone spatial and equipment aggregation report (§12.6).
 * - Devices in overlapping zones appear under each matching zone with overlapping note.
 * - Global totals count each device exactly once.
 */
export function buildZoneReport(
	doc: BlueprintDocument,
	telemetryLookup?: TelemetryDataLookup,
): ZoneReport {
	const zones = Object.values(doc.content.entities).filter(
		(e): e is ZoneEntity => e.kind === "zone",
	);
	const devices = Object.values(doc.content.entities).filter(
		(e): e is DeviceEntity => e.kind === "device",
	);

	// Pre-resolve device footprints and definitions
	const resolvedDevices = devices.map((dev) => {
		const activeDef = resolveDeviceDef(doc, dev);
		const fpWorld = activeDef
			? transformPolygon(activeDef.footprint, dev.transform)
			: null;
		const palletCap = calculatePalletCapacity(activeDef, dev) ?? 0;
		const ratedKw =
			typeof dev.ratedPowerKw === "number" && Number.isFinite(dev.ratedPowerKw)
				? dev.ratedPowerKw
				: 0;

		const tel = getTelemetryForDevice(telemetryLookup, dev.id);
		let liveKw = 0;
		if (tel && !tel.stale && tel.quality !== "bad") {
			const rawPower = tel.values?.powerKw ?? tel.values?.power;
			if (typeof rawPower === "number" && Number.isFinite(rawPower)) {
				liveKw = rawPower;
			}
		}

		return {
			device: dev,
			activeDef,
			fpWorld,
			palletCap,
			ratedKw,
			liveKw,
			category: activeDef?.category ?? "other",
		};
	});

	// Track zone memberships per device
	const deviceZoneMap = new Map<Id, string[]>();
	for (const rd of resolvedDevices) {
		if (!rd.fpWorld) continue;
		const matchingZones: string[] = [];
		for (const z of zones) {
			const zWorld = transformPolygon(z.polygon, z.transform);
			const inter = polygonIntersection([rd.fpWorld], [zWorld]);
			if (multiPolygonArea(inter) > MIN_POLYGON_AREA_MM2) {
				matchingZones.push(z.id);
			}
		}
		deviceZoneMap.set(rd.device.id, matchingZones);
	}

	let totalZoneAreaM2 = 0;
	const zoneRows: ZoneReportRow[] = [];

	for (const z of zones) {
		const zWorld = transformPolygon(z.polygon, z.transform);
		const zAreaMm2 = polygonArea(zWorld);
		const zoneAreaM2 = Math.round((zAreaMm2 / 1_000_000) * 100) / 100;
		totalZoneAreaM2 += zoneAreaM2;

		const zoneDevices: ZoneReportRow["devices"] = [];
		const assetCounts: Record<string, number> = {};
		let footprintSumMm2 = 0;
		let zonePalletCap = 0;
		let zoneRatedKw = 0;
		let zoneLiveKw = 0;
		const footprintPolysInZone: Polygon[] = [];

		for (const rd of resolvedDevices) {
			const matching = deviceZoneMap.get(rd.device.id) ?? [];
			if (matching.includes(z.id)) {
				const isOverlapping = matching.length > 1;
				zoneDevices.push({
					deviceId: rd.device.id,
					assetKey: rd.device.assetKey,
					overlappingMembership: isOverlapping ? true : undefined,
				});

				assetCounts[rd.category] = (assetCounts[rd.category] ?? 0) + 1;
				zonePalletCap += rd.palletCap;
				zoneRatedKw += rd.ratedKw;
				zoneLiveKw += rd.liveKw;

				if (rd.fpWorld) {
					const inter = polygonIntersection([rd.fpWorld], [zWorld]);
					const interArea = multiPolygonArea(inter);
					footprintSumMm2 += interArea;
					footprintPolysInZone.push(...inter);
				}
			}
		}

		// Compute occupied union area within zone
		let occupiedUnionAreaM2 = 0;
		if (footprintPolysInZone.length > 0) {
			let unionPolys = [footprintPolysInZone[0]];
			for (let i = 1; i < footprintPolysInZone.length; i++) {
				unionPolys = polygonUnion(unionPolys, [footprintPolysInZone[i]]);
			}
			occupiedUnionAreaM2 =
				Math.round((multiPolygonArea(unionPolys) / 1_000_000) * 100) / 100;
		}

		zoneRows.push({
			zoneId: z.id,
			name: z.name,
			category: z.category,
			restricted: z.restricted,
			zoneAreaM2,
			footprintAreaSumM2: Math.round((footprintSumMm2 / 1_000_000) * 100) / 100,
			occupiedUnionAreaM2,
			palletCapacity: zonePalletCap,
			deviceCount: zoneDevices.length,
			assetCountsByCategory: assetCounts,
			totalRatedPowerKw: Math.round(zoneRatedKw * 100) / 100,
			totalLivePowerKw: Math.round(zoneLiveKw * 100) / 100,
			devices: zoneDevices,
		});
	}

	// Global totals (each device counted once)
	const facilityAreaM2 =
		Math.round(
			((doc.content.facility.widthMm * doc.content.facility.heightMm) /
				1_000_000) *
				100,
		) / 100;

	let globalPalletCapacity = 0;
	let globalRatedKw = 0;
	let globalLiveKw = 0;
	let globalFootprintSumMm2 = 0;
	const allFootprintPolys: Polygon[] = [];

	for (const rd of resolvedDevices) {
		globalPalletCapacity += rd.palletCap;
		globalRatedKw += rd.ratedKw;
		globalLiveKw += rd.liveKw;
		if (rd.fpWorld) {
			const fpArea = polygonArea(rd.fpWorld);
			globalFootprintSumMm2 += fpArea;
			allFootprintPolys.push(rd.fpWorld);
		}
	}

	let globalOccupiedUnionM2 = 0;
	if (allFootprintPolys.length > 0) {
		let unionAll = [allFootprintPolys[0]];
		for (let i = 1; i < allFootprintPolys.length; i++) {
			unionAll = polygonUnion(unionAll, [allFootprintPolys[i]]);
		}
		globalOccupiedUnionM2 =
			Math.round((multiPolygonArea(unionAll) / 1_000_000) * 100) / 100;
	}

	return {
		zones: zoneRows,
		globalTotals: {
			facilityAreaM2,
			totalZoneAreaM2: Math.round(totalZoneAreaM2 * 100) / 100,
			globalDeviceCount: devices.length,
			globalPalletCapacity,
			globalFootprintAreaSumM2:
				Math.round((globalFootprintSumMm2 / 1_000_000) * 100) / 100,
			globalOccupiedUnionAreaM2: globalOccupiedUnionM2,
			globalRatedPowerKw: Math.round(globalRatedKw * 100) / 100,
			globalLivePowerKw: Math.round(globalLiveKw * 100) / 100,
		},
	};
}

// ----------------------------------------------------------------------------
// 4. Issue and Revision Reports (§12.6)
// ----------------------------------------------------------------------------

export interface IssueReportRow {
	id: string;
	code: string;
	severity: string;
	entityIds: readonly string[];
	message: string;
	measured?: number;
}

export function buildIssueReport(
	doc: BlueprintDocument,
	providedIssues?: readonly SpatialIssue[],
): IssueReportRow[] {
	const issues = providedIssues ?? runSpatialChecks(doc);
	return issues.map((iss) => ({
		id: iss.id,
		code: iss.code,
		severity: iss.severity,
		entityIds: iss.entityIds,
		message: iss.message,
		measured: iss.measured,
	}));
}

export interface RevisionReport {
	documentId: Id;
	name: string;
	revision: number;
	createdAt: string;
	updatedAt: string;
	facilityWidthMm: number;
	facilityHeightMm: number;
	layerCount: number;
	entityCount: number;
	entityCountsByKind: Record<string, number>;
	definitionCount: number;
	relationCount: number;
}

export function buildRevisionReport(doc: BlueprintDocument): RevisionReport {
	const kindCounts: Record<string, number> = {};
	for (const entity of Object.values(doc.content.entities)) {
		kindCounts[entity.kind] = (kindCounts[entity.kind] ?? 0) + 1;
	}

	return {
		documentId: doc.documentId,
		name: doc.content.name,
		revision: doc.revision,
		createdAt:
			typeof doc.content.metadata.createdAt === "string"
				? doc.content.metadata.createdAt
				: doc.updatedAt,
		updatedAt: doc.updatedAt,
		facilityWidthMm: doc.content.facility.widthMm,
		facilityHeightMm: doc.content.facility.heightMm,
		layerCount: doc.content.layers.length,
		entityCount: Object.keys(doc.content.entities).length,
		entityCountsByKind: kindCounts,
		definitionCount: Object.keys(doc.content.definitions).length,
		relationCount: doc.content.relations.length,
	};
}
