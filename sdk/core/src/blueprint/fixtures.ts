// ============================================================================
// Blueprint Fixtures & Generators (§4.1, §4.2, §8.2, AC-001, AC-052)
// Standard blank document, preset layers, and deterministic factory fixtures.
// ============================================================================

import type {
	AnnotationEntity,
	BlueprintDocument,
	DeviceEntity,
	DimensionEntity,
	DisplayUnit,
	Entity,
	Id,
	IsoDate,
	Layer,
	OpeningEntity,
	ProductionLine,
	Relation,
	ShapeEntity,
	WallEntity,
	ZoneEntity,
} from "./types.ts";
import {
	BUILTIN_DEFINITIONS,
	CNC_DEFINITION,
	CONVEYOR_DEFINITION,
	RACK_DEFINITION,
	ROBOT_DEFINITION,
	SENSOR_DEFINITION,
} from "./catalog.ts";
import { createRectPolygon } from "./geometry.ts";

export type CreateBlankDocumentOptions = {
	documentId?: Id;
	createdAt?: IsoDate;
	updatedAt?: IsoDate;
	revision?: number;
	displayUnit?: DisplayUnit;
	facilityWidthMm?: number;
	facilityHeightMm?: number;
	gridMinorMm?: number;
	gridMajorEvery?: number;
};

/**
 * Creates the 4 standard preset layers (§4.2, §4.3 Rule 4, 5, §8.2).
 */
export function createStandardLayers(options?: {
	useSimpleIds?: boolean;
}): Layer[] {
	const prefix = options?.useSimpleIds ? "" : "layer_";
	return [
		{
			id: `${prefix}foundation`,
			name: "Foundation",
			role: "foundation",
			parentId: null,
			visible: true,
			locked: false,
			printable: true,
			opacity: 1,
		},
		{
			id: `${prefix}sections`,
			name: "Sections",
			role: "sections",
			parentId: null,
			visible: true,
			locked: false,
			printable: true,
			opacity: 1,
		},
		{
			id: `${prefix}machinery`,
			name: "Machinery",
			role: "machinery",
			parentId: null,
			visible: true,
			locked: false,
			printable: true,
			opacity: 1,
		},
		{
			id: `${prefix}marks`,
			name: "Marks",
			role: "marks",
			parentId: null,
			visible: true,
			locked: false,
			printable: true,
			opacity: 1,
		},
	];
}

/**
 * Generates a valid canonical v1 document with:
 * - 60,000 × 40,000 mm facility
 * - The 4 standard layers (foundation, sections, machinery, marks)
 * - Default grid (minor 1000 mm, major 10, visible true)
 * - Unit mm, default displayUnit m
 */
export function createBlankDocument(
	name = "Untitled Facility",
	options: CreateBlankDocumentOptions = {},
): BlueprintDocument {
	const now = "2026-09-15T00:00:00.000Z";

	return {
		format: "blueprint",
		schemaVersion: 1,
		documentId: options.documentId ?? "doc_blank_001",
		createdAt: options.createdAt ?? now,
		updatedAt: options.updatedAt ?? now,
		revision: options.revision ?? 1,
		content: {
			name,
			description: "",
			unit: "mm",
			displayUnit: options.displayUnit ?? "m",
			facility: {
				widthMm: options.facilityWidthMm ?? 60_000,
				heightMm: options.facilityHeightMm ?? 40_000,
			},
			layers: createStandardLayers(),
			entities: {},
			entityOrder: [],
			groups: [],
			definitions: {},
			assets: {},
			lines: [],
			relations: [],
			grid: {
				origin: { x: 0, y: 0 },
				minorMm: options.gridMinorMm ?? 1_000,
				majorEvery: options.gridMajorEvery ?? 10,
				visible: true,
			},
			metadata: {},
		},
	};
}

// ----------------------------------------------------------------------------
// Deterministic Factory Fixture: nave-industrial-v1 (§8.2)
// ----------------------------------------------------------------------------

export type NaveIndustrialFixtureOptions = {
	documentId?: Id;
	injectedClock?: IsoDate;
};

/**
 * Creates the deterministic factory fixture `nave-industrial-v1` per §8.2:
 *   - Facility 60,000 × 40,000 mm
 *   - Injected clock "2026-09-15T00:00:00.000Z"
 *   - 4 preset layer IDs: foundation, sections, machinery, marks
 *   - Perimeter wall with 3 openings (2 dock, 1 entry)
 *   - 9 structural column rects
 *   - 5 zones (storage, production, quality, transit, hazard)
 *   - 6 devices (rack-a, rack-b, robot, conveyor, cnc, sensor)
 *   - 2 dimensions and 2 annotations
 *   - Production line `line-assembly` and relationships
 *   - Telemetry simulator bindings
 *   - Validates with 0 validation issues
 */
export function createNaveIndustrialFixture(
	options: NaveIndustrialFixtureOptions = {},
): BlueprintDocument {
	const timestamp = options.injectedClock ?? "2026-09-15T00:00:00.000Z";
	const documentId = options.documentId ?? "doc-nave-industrial-v1";

	const layers: Layer[] = [
		{
			id: "foundation",
			name: "Foundation",
			role: "foundation",
			parentId: null,
			visible: true,
			locked: false,
			printable: true,
			opacity: 1,
		},
		{
			id: "sections",
			name: "Sections",
			role: "sections",
			parentId: null,
			visible: true,
			locked: false,
			printable: true,
			opacity: 1,
		},
		{
			id: "machinery",
			name: "Machinery",
			role: "machinery",
			parentId: null,
			visible: true,
			locked: false,
			printable: true,
			opacity: 1,
		},
		{
			id: "marks",
			name: "Marks",
			role: "marks",
			parentId: null,
			visible: true,
			locked: false,
			printable: true,
			opacity: 1,
		},
	];

	const entities: Record<Id, Entity> = {};

	// 1. Perimeter wall (closed centerline v1..v4, thickness 300)
	const wallPerimeter: WallEntity = {
		id: "wall-perimeter",
		name: "Perimeter Wall",
		kind: "wall",
		layerId: "sections",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["structure", "wall", "perimeter"],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: "#64748B",
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		thicknessMm: 300,
		closed: true,
		vertices: [
			{ id: "v1", point: { x: 150, y: 150 } },
			{ id: "v2", point: { x: 59850, y: 150 } },
			{ id: "v3", point: { x: 59850, y: 39850 } },
			{ id: "v4", point: { x: 150, y: 39850 } },
		],
	};
	entities[wallPerimeter.id] = wallPerimeter;

	// 2. Openings
	const openingDockA: OpeningEntity = {
		id: "opening-dock-a",
		name: "Loading Dock A",
		kind: "opening",
		layerId: "sections",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["opening", "dock"],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: "#64748B",
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		wallId: "wall-perimeter",
		segmentStartId: "v1",
		segmentEndId: "v2",
		offsetMm: 7850,
		widthMm: 4000,
		openingType: "dock",
		hinge: "start",
		swing: "left",
	};
	entities[openingDockA.id] = openingDockA;

	const openingDockB: OpeningEntity = {
		id: "opening-dock-b",
		name: "Loading Dock B",
		kind: "opening",
		layerId: "sections",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["opening", "dock"],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: "#64748B",
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		wallId: "wall-perimeter",
		segmentStartId: "v1",
		segmentEndId: "v2",
		offsetMm: 17850,
		widthMm: 4000,
		openingType: "dock",
		hinge: "start",
		swing: "left",
	};
	entities[openingDockB.id] = openingDockB;

	const openingEntry: OpeningEntity = {
		id: "opening-entry",
		name: "Staff Entry Door",
		kind: "opening",
		layerId: "sections",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["opening", "door"],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: "#64748B",
			stroke: "#334155",
			strokeWidthMm: 25,
			opacity: 1,
			dashMm: [],
		},
		wallId: "wall-perimeter",
		segmentStartId: "v2",
		segmentEndId: "v3",
		offsetMm: 4850,
		widthMm: 1200,
		openingType: "door",
		hinge: "start",
		swing: "left",
	};
	entities[openingEntry.id] = openingEntry;

	// 3. Structural Columns (Nine 400×400 centered at X 10000/30000/50000, Y 10000/20000/30000)
	const colXs = [10000, 30000, 50000];
	const colYs = [10000, 20000, 30000];
	for (let r = 0; r < 3; r++) {
		for (let c = 0; c < 3; c++) {
			const id = `column-r${r + 1}-c${c + 1}`;
			const cx = colXs[c];
			const cy = colYs[r];
			const column: ShapeEntity = {
				id,
				name: `Structural Column ${r + 1}-${c + 1}`,
				kind: "shape",
				layerId: "sections",
				groupId: null,
				hidden: false,
				locked: false,
				tags: ["structure", "column"],
				metadata: {},
				transform: { x: cx - 200, y: cy - 200, rotationDeg: 0 },
				style: {
					fill: "#64748B",
					stroke: "#334155",
					strokeWidthMm: 25,
					opacity: 1,
					dashMm: [],
				},
				structural: true,
				geometry: {
					kind: "rect",
					width: 400,
					height: 400,
					cornerRadius: 0,
				},
			};
			entities[id] = column;
		}
	}

	// 4. Zones (storage, production, quality, transit, hazard)
	const zoneStorage: ZoneEntity = {
		id: "zone-storage",
		name: "Storage Zone",
		kind: "zone",
		layerId: "foundation",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["zone", "storage"],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: "#F59E0B",
			stroke: "#D97706",
			strokeWidthMm: 25,
			opacity: 0.25,
			dashMm: [],
		},
		category: "storage",
		restricted: false,
		polygon: createRectPolygon(1000, 1000, 23000, 15000, "z_storage"),
	};
	entities[zoneStorage.id] = zoneStorage;

	const zoneProduction: ZoneEntity = {
		id: "zone-production",
		name: "Production Zone",
		kind: "zone",
		layerId: "foundation",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["zone", "production"],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: "#3B82F6",
			stroke: "#2563EB",
			strokeWidthMm: 25,
			opacity: 0.25,
			dashMm: [],
		},
		category: "production",
		restricted: false,
		polygon: createRectPolygon(26000, 1000, 32000, 25000, "z_prod"),
	};
	entities[zoneProduction.id] = zoneProduction;

	const zoneQuality: ZoneEntity = {
		id: "zone-quality",
		name: "Quality Control Zone",
		kind: "zone",
		layerId: "foundation",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["zone", "quality"],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: "#8B5CF6",
			stroke: "#7C3AED",
			strokeWidthMm: 25,
			opacity: 0.25,
			dashMm: [],
		},
		category: "quality",
		restricted: false,
		polygon: createRectPolygon(1000, 24000, 23000, 14000, "z_qual"),
	};
	entities[zoneQuality.id] = zoneQuality;

	const zoneTransit: ZoneEntity = {
		id: "zone-transit",
		name: "Transit Corridor",
		kind: "zone",
		layerId: "foundation",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["zone", "transit"],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: "#10B981",
			stroke: "#059669",
			strokeWidthMm: 25,
			opacity: 0.25,
			dashMm: [],
		},
		category: "transit",
		restricted: false,
		polygon: createRectPolygon(1000, 17000, 23000, 6000, "z_trans"),
	};
	entities[zoneTransit.id] = zoneTransit;

	const zoneHazard: ZoneEntity = {
		id: "zone-hazard",
		name: "Hazard Area",
		kind: "zone",
		layerId: "foundation",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["zone", "hazard", "restricted"],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: {
			fill: "#EF4444",
			stroke: "#DC2626",
			strokeWidthMm: 25,
			opacity: 0.3,
			dashMm: [],
		},
		category: "hazard",
		restricted: true,
		polygon: createRectPolygon(44000, 28000, 14000, 10000, "z_haz"),
	};
	entities[zoneHazard.id] = zoneHazard;

	// 5. Devices
	const deviceStyle = {
		fill: "#CBD5E1",
		stroke: "#334155",
		strokeWidthMm: 25,
		opacity: 1,
		dashMm: [],
	};

	const deviceRackA: DeviceEntity = {
		id: "device-rack-a",
		name: "Pallet Rack A",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["equipment", "rack"],
		metadata: {},
		transform: { x: 4000, y: 5000, rotationDeg: 0 },
		style: deviceStyle,
		definitionId: "def-rack-v1",
		assetKey: "RACK-01",
		parameters: { bays: 4, levels: 3, bayWidthMm: 1000, depthMm: 1200 },
		ratedPowerKw: null,
		maintenanceDue: null,
		bindings: [],
	};
	entities[deviceRackA.id] = deviceRackA;

	const deviceRackB: DeviceEntity = {
		id: "device-rack-b",
		name: "Pallet Rack B",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["equipment", "rack"],
		metadata: {},
		transform: { x: 14000, y: 5000, rotationDeg: 0 },
		style: deviceStyle,
		definitionId: "def-rack-v1",
		assetKey: "RACK-02",
		parameters: { bays: 4, levels: 3, bayWidthMm: 1000, depthMm: 1200 },
		ratedPowerKw: null,
		maintenanceDue: null,
		bindings: [],
	};
	entities[deviceRackB.id] = deviceRackB;

	const deviceRobot: DeviceEntity = {
		id: "device-robot",
		name: "Assembly Robot",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["equipment", "robot"],
		metadata: {},
		transform: { x: 34000, y: 5000, rotationDeg: 0 },
		style: deviceStyle,
		definitionId: "def-robot-v1",
		assetKey: "ROBOT-01",
		parameters: {},
		ratedPowerKw: 5,
		maintenanceDue: null,
		bindings: [
			{ field: "status", sourceId: "sim-robot", channel: "ROBOT-01:status" },
			{ field: "loadPct", sourceId: "sim-robot", channel: "ROBOT-01:load" },
			{ field: "powerKw", sourceId: "sim-robot", channel: "ROBOT-01:power" },
		],
	};
	entities[deviceRobot.id] = deviceRobot;

	const deviceConveyor: DeviceEntity = {
		id: "device-conveyor",
		name: "Main Conveyor",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["equipment", "conveyor"],
		metadata: {},
		transform: { x: 41000, y: 6000, rotationDeg: 0 },
		style: deviceStyle,
		definitionId: "def-conveyor-v1",
		assetKey: "CONVEYOR-01",
		parameters: { lengthMm: 6000, widthMm: 1000, speedMps: 0.5 },
		ratedPowerKw: null,
		maintenanceDue: null,
		bindings: [
			{
				field: "status",
				sourceId: "sim-conveyor",
				channel: "CONVEYOR-01:status",
			},
			{
				field: "speedMps",
				sourceId: "sim-conveyor",
				channel: "CONVEYOR-01:speed",
			},
		],
	};
	entities[deviceConveyor.id] = deviceConveyor;

	const deviceCnc: DeviceEntity = {
		id: "device-cnc",
		name: "CNC Center #4",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["equipment", "cnc"],
		metadata: {},
		transform: { x: 36000, y: 18000, rotationDeg: 0 },
		style: deviceStyle,
		definitionId: "def-cnc-v1",
		assetKey: "CNC-04",
		parameters: {},
		ratedPowerKw: 12,
		maintenanceDue: null,
		bindings: [
			{ field: "status", sourceId: "sim-cnc", channel: "CNC-04:status" },
			{ field: "loadPct", sourceId: "sim-cnc", channel: "CNC-04:load" },
			{
				field: "temperatureC",
				sourceId: "sim-cnc",
				channel: "CNC-04:temperature",
			},
			{
				field: "vibrationMmS",
				sourceId: "sim-cnc",
				channel: "CNC-04:vibration",
			},
			{ field: "powerKw", sourceId: "sim-cnc", channel: "CNC-04:power" },
			{ field: "rpm", sourceId: "sim-cnc", channel: "CNC-04:rpm" },
		],
	};
	entities[deviceCnc.id] = deviceCnc;

	const deviceSensor: DeviceEntity = {
		id: "device-sensor",
		name: "Vibration Sensor",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["equipment", "sensor"],
		metadata: {},
		transform: { x: 37500, y: 19500, rotationDeg: 0 },
		style: {
			fill: "#10B981",
			stroke: "#047857",
			strokeWidthMm: 20,
			opacity: 1,
			dashMm: [],
		},
		definitionId: "def-sensor-v1",
		assetKey: "SENSOR-04",
		parameters: {},
		ratedPowerKw: null,
		maintenanceDue: null,
		bindings: [
			{
				field: "temperatureC",
				sourceId: "sim-sensor",
				channel: "SENSOR-04:temperature",
			},
			{
				field: "vibrationMmS",
				sourceId: "sim-sensor",
				channel: "SENSOR-04:vibration",
			},
		],
	};
	entities[deviceSensor.id] = deviceSensor;

	// 6. Dimensions
	const dimStyle = {
		fill: null,
		stroke: "#0F172A",
		strokeWidthMm: 15,
		opacity: 1,
		dashMm: [],
	};

	const dimensionWidth: DimensionEntity = {
		id: "dimension-width",
		name: "Facility Width",
		kind: "dimension",
		layerId: "marks",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["dimension", "annotation"],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: dimStyle,
		a: { kind: "point", point: { x: 0, y: 0 } },
		b: { kind: "point", point: { x: 60000, y: 0 } },
		axis: "horizontal",
		offsetMm: -1500,
		displayUnit: "document",
		precision: 2,
	};
	entities[dimensionWidth.id] = dimensionWidth;

	const dimensionHeight: DimensionEntity = {
		id: "dimension-height",
		name: "Facility Height",
		kind: "dimension",
		layerId: "marks",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["dimension", "annotation"],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: dimStyle,
		a: { kind: "point", point: { x: 0, y: 0 } },
		b: { kind: "point", point: { x: 0, y: 40000 } },
		axis: "vertical",
		offsetMm: 1500,
		displayUnit: "document",
		precision: 2,
	};
	entities[dimensionHeight.id] = dimensionHeight;

	// 7. Annotations
	const annotStyle = {
		fill: null,
		stroke: "#0F172A",
		strokeWidthMm: 15,
		opacity: 1,
		dashMm: [],
	};

	const markEntry: AnnotationEntity = {
		id: "mark-entry",
		name: "Staff Entry Mark",
		kind: "annotation",
		layerId: "marks",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["annotation", "label"],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: annotStyle,
		anchor: { kind: "point", point: { x: 56500, y: 4200 } },
		offsetMm: { x: 0, y: 0 },
		text: "Staff entry",
		annotationType: "label",
		textHeightMm: 300,
	};
	entities[markEntry.id] = markEntry;

	const markInspection: AnnotationEntity = {
		id: "mark-inspection",
		name: "CNC Inspection Mark",
		kind: "annotation",
		layerId: "marks",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["annotation", "inspection"],
		metadata: {},
		transform: { x: 0, y: 0, rotationDeg: 0 },
		style: annotStyle,
		anchor: {
			kind: "entity",
			entityId: "device-cnc",
			feature: "center",
			featureId: null,
		},
		offsetMm: { x: 0, y: 0 },
		text: "Inspect spindle",
		annotationType: "inspection",
		textHeightMm: 250,
	};
	entities[markInspection.id] = markInspection;

	// 8. Production Lines & Relations
	const lines: ProductionLine[] = [
		{
			id: "line-assembly",
			name: "Assembly Line",
			color: "#3B82F6",
		},
	];

	const relations: Relation[] = [
		// Line memberships
		{
			id: "rel-line-robot",
			kind: "memberOfLine",
			deviceId: "device-robot",
			lineId: "line-assembly",
		},
		{
			id: "rel-line-conveyor",
			kind: "memberOfLine",
			deviceId: "device-conveyor",
			lineId: "line-assembly",
		},
		{
			id: "rel-line-cnc",
			kind: "memberOfLine",
			deviceId: "device-cnc",
			lineId: "line-assembly",
		},
		// Flow relation robot -> conveyor
		{
			id: "rel-flow-robot-conveyor",
			kind: "flow",
			fromDeviceId: "device-robot",
			fromPortId: "output",
			toDeviceId: "device-conveyor",
			toPortId: "input",
		},
		// Observes relation sensor -> CNC
		{
			id: "rel-observes-sensor-cnc",
			kind: "observes",
			sensorId: "device-sensor",
			assetId: "device-cnc",
		},
		// Assigned zones
		{
			id: "rel-zone-rack-a",
			kind: "assignedZone",
			deviceId: "device-rack-a",
			zoneId: "zone-storage",
		},
		{
			id: "rel-zone-rack-b",
			kind: "assignedZone",
			deviceId: "device-rack-b",
			zoneId: "zone-storage",
		},
		{
			id: "rel-zone-robot",
			kind: "assignedZone",
			deviceId: "device-robot",
			zoneId: "zone-production",
		},
		{
			id: "rel-zone-conveyor",
			kind: "assignedZone",
			deviceId: "device-conveyor",
			zoneId: "zone-production",
		},
		{
			id: "rel-zone-cnc",
			kind: "assignedZone",
			deviceId: "device-cnc",
			zoneId: "zone-production",
		},
		{
			id: "rel-zone-sensor",
			kind: "assignedZone",
			deviceId: "device-sensor",
			zoneId: "zone-production",
		},
	];

	const entityOrder = Object.keys(entities);

	return {
		format: "blueprint",
		schemaVersion: 1,
		documentId,
		createdAt: timestamp,
		updatedAt: timestamp,
		revision: 1,
		content: {
			name: "Nave Industrial Facility",
			description: "Deterministic factory fixture nave-industrial-v1",
			unit: "mm",
			displayUnit: "m",
			facility: {
				widthMm: 60000,
				heightMm: 40000,
			},
			layers,
			entities,
			entityOrder,
			groups: [],
			definitions: { ...BUILTIN_DEFINITIONS },
			assets: {},
			lines,
			relations,
			grid: {
				origin: { x: 0, y: 0 },
				minorMm: 1000,
				majorEvery: 10,
				visible: true,
			},
			metadata: {
				fixture: "nave-industrial-v1",
			},
		},
	};
}

// ----------------------------------------------------------------------------
// Conflict Factory Fixture: nave-conflicts-v1 (§8.2, AC-052)
// ----------------------------------------------------------------------------

export type NaveConflictsFixtureOptions = {
	documentId?: Id;
	injectedClock?: IsoDate;
};

/**
 * Creates the deterministic conflict fixture `nave-conflicts-v1` per §8.2:
 * Derived from nave-industrial-v1 by:
 *   1. Moving rack B to (6000, 5000) -> FOOTPRINT_OVERLAP with rack A
 *   2. Placing an additional rack in hazard zone -> RESTRICTED_ZONE
 *   3. Moving CNC partly outside the facility (x=58000) -> OUTSIDE_FACILITY
 */
export function createNaveConflictsFixture(
	options: NaveConflictsFixtureOptions = {},
): BlueprintDocument {
	const base = createNaveIndustrialFixture({
		documentId: options.documentId ?? "doc-nave-conflicts-v1",
		injectedClock: options.injectedClock,
	});

	const entities = { ...base.content.entities };

	// 1. Move rack B to (6000, 5000) to cause FOOTPRINT_OVERLAP and CLEARANCE_INTRUSION with rack A
	const rackB = entities["device-rack-b"] as DeviceEntity;
	entities["device-rack-b"] = {
		...rackB,
		transform: { x: 6000, y: 5000, rotationDeg: 0 },
	};

	// 2. Place an additional rack in the restricted hazard zone (44000..58000, 28000..38000)
	const extraRack: DeviceEntity = {
		id: "device-rack-hazard",
		name: "Hazard Area Rack",
		kind: "device",
		layerId: "machinery",
		groupId: null,
		hidden: false,
		locked: false,
		tags: ["equipment", "rack", "conflict"],
		metadata: {},
		transform: { x: 46000, y: 32000, rotationDeg: 0 },
		style: rackB.style,
		definitionId: "def-rack-v1",
		assetKey: "RACK-HAZARD",
		parameters: { bays: 4, levels: 3, bayWidthMm: 1000, depthMm: 1200 },
		ratedPowerKw: null,
		maintenanceDue: null,
		bindings: [],
	};
	entities[extraRack.id] = extraRack;

	// 3. Move CNC partly outside facility (facility width 60000; CNC width 4000 placed at x=58000 -> extends to 62000)
	const cnc = entities["device-cnc"] as DeviceEntity;
	entities["device-cnc"] = {
		...cnc,
		transform: { x: 58000, y: 18000, rotationDeg: 0 },
	};

	const entityOrder = Object.keys(entities);

	return {
		...base,
		documentId: options.documentId ?? "doc-nave-conflicts-v1",
		content: {
			...base.content,
			name: "Nave Industrial (Conflicts)",
			description: "Deterministic conflict fixture nave-conflicts-v1",
			entities,
			entityOrder,
			metadata: {
				fixture: "nave-conflicts-v1",
			},
		},
	};
}
