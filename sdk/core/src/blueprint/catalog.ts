// ============================================================================
// Blueprint Device Catalog & Parametric Generators (§8.1, AC-014)
// Built-in device definitions: CNC, Robot, Conveyor, Rack, and Sensor.
// ============================================================================

import type {
	DeviceDefinition,
	Id,
	Polygon,
	SymbolPart,
	Vec2,
} from "./types.ts";
import {
	createCirclePolygon,
	createRectPolygon,
	polygonBounds,
} from "./geometry.ts";
import { quantizeMm } from "./units.ts";

// ----------------------------------------------------------------------------
// Parametric Parameter Types
// ----------------------------------------------------------------------------

export type ConveyorParams = {
	lengthMm: number;
	widthMm: number;
	speedMps: number;
};

export type RackParams = {
	bays: number;
	levels: number;
	bayWidthMm: number;
	depthMm: number;
};

export const DEFAULT_CONVEYOR_PARAMS: ConveyorParams = {
	lengthMm: 6000,
	widthMm: 1000,
	speedMps: 0.5,
};

export const DEFAULT_RACK_PARAMS: RackParams = {
	bays: 4,
	levels: 3,
	bayWidthMm: 1000,
	depthMm: 1200,
};

// ----------------------------------------------------------------------------
// Pure Generators (§8.1, AC-014)
// ----------------------------------------------------------------------------

/**
 * Computes rack storage capacity in pallets (§8.1, AC-014).
 * capacity = bays × levels
 */
export function computeRackCapacity(bays: number, levels: number): number {
	const b = Math.max(1, Math.min(20, Math.round(bays)));
	const l = Math.max(1, Math.min(10, Math.round(levels)));
	return b * l;
}

/**
 * Pure generator for parametric pallet racks (§8.1, AC-014).
 * Regenerates symbol, footprint, clearance, and capacity from parameters.
 */
export function generateRackDefinition(
	params: Partial<RackParams> = {},
): DeviceDefinition {
	const bays = Math.max(
		1,
		Math.min(20, Math.round(params.bays ?? DEFAULT_RACK_PARAMS.bays)),
	);
	const levels = Math.max(
		1,
		Math.min(10, Math.round(params.levels ?? DEFAULT_RACK_PARAMS.levels)),
	);
	const bayWidth = 1000;
	const depth = 1200;
	const totalWidth = bays * bayWidth;

	// Footprint: rect (bays * 1000) × 1200
	const footprint: Polygon = createRectPolygon(
		0,
		0,
		totalWidth,
		depth,
		"rack_fp",
	);

	// Clearance: rect from (0, -1500), size (bays * 1000) × 2700 (depth 1200 + 1500 front aisle)
	const clearance: Polygon = createRectPolygon(
		0,
		-1500,
		totalWidth,
		2700,
		"rack_cl",
	);

	// Symbol parts: outer frame + upright dividers for each bay
	const symbol: SymbolPart[] = [
		{
			id: "rack_frame",
			geometry: {
				kind: "rect",
				width: totalWidth,
				height: depth,
				cornerRadius: 0,
			},
			transform: { x: 0, y: 0, rotationDeg: 0 },
			style: {
				fill: "#CBD5E1",
				stroke: "#334155",
				strokeWidthMm: 25,
				opacity: 1,
				dashMm: [],
			},
		},
	];

	for (let b = 1; b < bays; b++) {
		symbol.push({
			id: `rack_upright_${b}`,
			geometry: {
				kind: "rect",
				width: 50,
				height: depth,
				cornerRadius: 0,
			},
			transform: { x: b * bayWidth - 25, y: 0, rotationDeg: 0 },
			style: {
				fill: "#94A3B8",
				stroke: "#334155",
				strokeWidthMm: 15,
				opacity: 1,
				dashMm: [],
			},
		});
	}

	return {
		id: "def-rack-v1",
		version: 1,
		name: "Pallet Rack System",
		category: "rack",
		sizing: "rack",
		nominalWidthMm: totalWidth,
		nominalHeightMm: depth,
		footprint,
		clearance,
		ports: [],
		symbol,
		defaults: {
			bays,
			levels,
			bayWidthMm: bayWidth,
			depthMm: depth,
		},
	};
}

/**
 * Pure generator for parametric belt conveyors (§8.1, AC-014).
 * Regenerates symbol, ports, footprint, and clearance from parameters.
 */
export function generateConveyorDefinition(
	params: Partial<ConveyorParams> = {},
): DeviceDefinition {
	const lengthMm = Math.max(
		1000,
		Math.min(
			30000,
			Math.round((params.lengthMm ?? DEFAULT_CONVEYOR_PARAMS.lengthMm) / 100) *
				100,
		),
	);
	const widthMm = Math.max(
		500,
		Math.min(
			3000,
			Math.round((params.widthMm ?? DEFAULT_CONVEYOR_PARAMS.widthMm) / 100) *
				100,
		),
	);
	const speedMps = Math.max(
		0,
		Math.min(5, params.speedMps ?? DEFAULT_CONVEYOR_PARAMS.speedMps),
	);

	// Footprint: rect lengthMm × widthMm
	const footprint: Polygon = createRectPolygon(
		0,
		0,
		lengthMm,
		widthMm,
		"conv_fp",
	);

	// Clearance: rect from (-500, -500), size (lengthMm + 1000) × (widthMm + 1000)
	const clearance: Polygon = createRectPolygon(
		-500,
		-500,
		lengthMm + 1000,
		widthMm + 1000,
		"conv_cl",
	);

	// Ports at end-centers (§8.1, AC-014)
	const halfW = widthMm / 2;
	const ports = [
		{
			id: "input",
			point: { x: 0, y: halfW },
			directionDeg: 180, // Facing left
		},
		{
			id: "output",
			point: { x: lengthMm, y: halfW },
			directionDeg: 0, // Facing right
		},
	];

	// Symbol parts: conveyor bed + roller lines
	const symbol: SymbolPart[] = [
		{
			id: "conv_bed",
			geometry: {
				kind: "rect",
				width: lengthMm,
				height: widthMm,
				cornerRadius: 50,
			},
			transform: { x: 0, y: 0, rotationDeg: 0 },
			style: {
				fill: "#CBD5E1",
				stroke: "#334155",
				strokeWidthMm: 25,
				opacity: 1,
				dashMm: [],
			},
		},
	];

	// Add roller divider lines every 500 mm
	const rollerCount = Math.floor(lengthMm / 500);
	for (let r = 1; r < rollerCount; r++) {
		symbol.push({
			id: `conv_roller_${r}`,
			geometry: {
				kind: "rect",
				width: 10,
				height: widthMm,
				cornerRadius: 0,
			},
			transform: { x: r * 500 - 5, y: 0, rotationDeg: 0 },
			style: {
				fill: "#94A3B8",
				stroke: "#334155",
				strokeWidthMm: 10,
				opacity: 1,
				dashMm: [],
			},
		});
	}

	return {
		id: "def-conveyor-v1",
		version: 1,
		name: "Modular Belt Conveyor",
		category: "conveyor",
		sizing: "conveyor",
		nominalWidthMm: lengthMm,
		nominalHeightMm: widthMm,
		footprint,
		clearance,
		ports,
		symbol,
		defaults: {
			lengthMm,
			widthMm,
			speedMps,
		},
	};
}

// ----------------------------------------------------------------------------
// 5 Built-in Definitions (§8.1)
// ----------------------------------------------------------------------------

/**
 * Built-in CNC Milling Center (`def-cnc-v1`):
 *   - Rigid; 12 kW rated
 *   - Footprint rect 4000×3000
 *   - Clearance envelope rect from (-1000,-1000), size 6000×5000
 *   - Symbol: enclosure, spindle, control panel
 */
export const CNC_DEFINITION: DeviceDefinition = {
	id: "def-cnc-v1",
	version: 1,
	name: "CNC Milling Center",
	category: "cnc",
	sizing: "rigid",
	nominalWidthMm: 4000,
	nominalHeightMm: 3000,
	footprint: createRectPolygon(0, 0, 4000, 3000, "cnc_fp"),
	clearance: createRectPolygon(-1000, -1000, 6000, 5000, "cnc_cl"),
	ports: [],
	symbol: [
		{
			id: "cnc_enclosure",
			geometry: {
				kind: "rect",
				width: 4000,
				height: 3000,
				cornerRadius: 50,
			},
			transform: { x: 0, y: 0, rotationDeg: 0 },
			style: {
				fill: "#CBD5E1",
				stroke: "#334155",
				strokeWidthMm: 25,
				opacity: 1,
				dashMm: [],
			},
		},
		{
			id: "cnc_spindle",
			geometry: {
				kind: "ellipse",
				width: 800,
				height: 800,
			},
			transform: { x: 1600, y: 1100, rotationDeg: 0 },
			style: {
				fill: "#94A3B8",
				stroke: "#334155",
				strokeWidthMm: 20,
				opacity: 1,
				dashMm: [],
			},
		},
		{
			id: "cnc_panel",
			geometry: {
				kind: "rect",
				width: 400,
				height: 800,
				cornerRadius: 10,
			},
			transform: { x: 3500, y: 300, rotationDeg: 0 },
			style: {
				fill: "#3B82F6",
				stroke: "#1D4ED8",
				strokeWidthMm: 15,
				opacity: 1,
				dashMm: [],
			},
		},
	],
	defaults: {},
};

/**
 * Built-in Articulated Industrial Robot (`def-robot-v1`):
 *   - Rigid; 5 kW rated
 *   - Footprint rect 3000×3000
 *   - Clearance envelope rect from (-1000,-1000), size 5000×5000
 *   - Ports at (0,1500) and (3000,1500)
 *   - Symbol: fence and articulated arm lines
 */
export const ROBOT_DEFINITION: DeviceDefinition = {
	id: "def-robot-v1",
	version: 1,
	name: "Articulated Industrial Robot",
	category: "robot",
	sizing: "rigid",
	nominalWidthMm: 3000,
	nominalHeightMm: 3000,
	footprint: createRectPolygon(0, 0, 3000, 3000, "robot_fp"),
	clearance: createRectPolygon(-1000, -1000, 5000, 5000, "robot_cl"),
	ports: [
		{
			id: "input",
			point: { x: 0, y: 1500 },
			directionDeg: 180,
		},
		{
			id: "output",
			point: { x: 3000, y: 1500 },
			directionDeg: 0,
		},
	],
	symbol: [
		{
			id: "robot_base",
			geometry: {
				kind: "rect",
				width: 3000,
				height: 3000,
				cornerRadius: 100,
			},
			transform: { x: 0, y: 0, rotationDeg: 0 },
			style: {
				fill: "#CBD5E1",
				stroke: "#334155",
				strokeWidthMm: 25,
				opacity: 1,
				dashMm: [],
			},
		},
		{
			id: "robot_center_turret",
			geometry: {
				kind: "ellipse",
				width: 1200,
				height: 1200,
			},
			transform: { x: 900, y: 900, rotationDeg: 0 },
			style: {
				fill: "#94A3B8",
				stroke: "#334155",
				strokeWidthMm: 20,
				opacity: 1,
				dashMm: [],
			},
		},
		{
			id: "robot_arm",
			geometry: {
				kind: "rect",
				width: 1400,
				height: 300,
				cornerRadius: 20,
			},
			transform: { x: 1500, y: 1350, rotationDeg: 0 },
			style: {
				fill: "#F59E0B",
				stroke: "#B45309",
				strokeWidthMm: 15,
				opacity: 1,
				dashMm: [],
			},
		},
	],
	defaults: {},
};

/**
 * Built-in Modular Belt Conveyor (`def-conveyor-v1` with default parameters).
 */
export const CONVEYOR_DEFINITION: DeviceDefinition =
	generateConveyorDefinition();

/**
 * Built-in Pallet Rack System (`def-rack-v1` with default parameters).
 */
export const RACK_DEFINITION: DeviceDefinition = generateRackDefinition();

/**
 * Built-in IoT Telemetry Sensor (`def-sensor-v1`):
 *   - Footprint circle diameter 200 mm
 *   - Clearance circle diameter 200 mm
 *   - Rigid, non-obstructive
 */
export const SENSOR_DEFINITION: DeviceDefinition = {
	id: "def-sensor-v1",
	version: 1,
	name: "IoT Telemetry Sensor",
	category: "sensor",
	sizing: "rigid",
	nominalWidthMm: 200,
	nominalHeightMm: 200,
	footprint: createCirclePolygon(100, 100, 100, 72, "sensor_fp"),
	clearance: createCirclePolygon(100, 100, 100, 72, "sensor_cl"),
	ports: [],
	symbol: [
		{
			id: "sensor_body",
			geometry: {
				kind: "ellipse",
				width: 200,
				height: 200,
			},
			transform: { x: 0, y: 0, rotationDeg: 0 },
			style: {
				fill: "#10B981",
				stroke: "#047857",
				strokeWidthMm: 20,
				opacity: 1,
				dashMm: [],
			},
		},
	],
	defaults: {},
};

// ----------------------------------------------------------------------------
// Catalog Registry Map (§8.1)
// ----------------------------------------------------------------------------

export const BUILTIN_DEFINITIONS: Readonly<Record<Id, DeviceDefinition>> = {
	"def-cnc-v1": CNC_DEFINITION,
	"def-robot-v1": ROBOT_DEFINITION,
	"def-conveyor-v1": CONVEYOR_DEFINITION,
	"def-rack-v1": RACK_DEFINITION,
	"def-sensor-v1": SENSOR_DEFINITION,
};

/**
 * Looks up a catalog definition by ID from the built-in catalog.
 */
export function getCatalogDefinition(id: Id): DeviceDefinition | undefined {
	return BUILTIN_DEFINITIONS[id];
}

/**
 * Resolves the active geometry for a device entity, taking into account
 * instance-specific parameters for parametric definitions (conveyors and racks).
 */
export function resolveDeviceDefinition(
	definition: DeviceDefinition,
	parameters?: Readonly<Record<string, number | string | boolean>>,
): DeviceDefinition {
	if (definition.sizing === "conveyor") {
		return generateConveyorDefinition(parameters as Partial<ConveyorParams>);
	}
	if (definition.sizing === "rack") {
		return generateRackDefinition(parameters as Partial<RackParams>);
	}
	return definition;
}
