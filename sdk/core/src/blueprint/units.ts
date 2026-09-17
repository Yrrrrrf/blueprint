// ============================================================================
// Blueprint Units, Coordinate Rules, and Display Conversions (§4.1)
// ============================================================================

import type {
	BlueprintDocument,
	DisplayUnit,
	Transform,
	Vec2,
} from "./types.ts";

/** Geometric equality epsilon: 0.001 mm */
export const GEOMETRY_EPSILON_MM = 0.001;

/** Angle equality epsilon: 0.000001 degrees */
export const ANGLE_EPSILON_DEG = 0.000001;

/** Meaningful overlap area threshold: 1 mm² */
export const MIN_POLYGON_AREA_MM2 = 1.0;

/** Maximum coordinate magnitude per axis: 10,000,000 mm */
export const MAX_COORDINATE_MAGNITUDE_MM = 10_000_000;

/** Default facility bounds [x, y, width, height] */
export const DEFAULT_FACILITY = {
	x: 0,
	y: 0,
	widthMm: 60_000,
	heightMm: 40_000,
} as const;

/**
 * Normalizes negative zero (-0) to 0.
 */
export function normalizeZero(n: number): number {
	return Object.is(n, -0) || n === 0 ? 0 : n;
}

/**
 * Quantizes a length or coordinate to 0.001 mm and normalizes -0.
 */
export function quantizeMm(value: number): number {
	if (!Number.isFinite(value)) {
		throw new TypeError(`Cannot quantize non-finite number: ${value}`);
	}
	const rounded = Math.round(value * 1_000) / 1_000;
	return normalizeZero(rounded);
}

/**
 * Normalizes an angle into [0, 360) clockwise degrees and quantizes to 0.000001 deg.
 */
export function normalizeAngleDeg(deg: number): number {
	if (!Number.isFinite(deg)) {
		throw new TypeError(`Cannot normalize non-finite angle: ${deg}`);
	}
	let normalized = deg % 360;
	if (normalized < 0) {
		normalized += 360;
	}
	const rounded = Math.round(normalized * 1_000_000) / 1_000_000;
	return rounded >= 360 || rounded === 0 ? 0 : normalizeZero(rounded);
}

/**
 * Quantizes a 2D point to 0.001 mm precision.
 */
export function quantizeVec2(point: Vec2): Vec2 {
	return {
		x: quantizeMm(point.x),
		y: quantizeMm(point.y),
	};
}

/**
 * Quantizes a transform (position to 0.001 mm, angle to 0.000001 deg).
 */
export function quantizeTransform(transform: Transform): Transform {
	return {
		x: quantizeMm(transform.x),
		y: quantizeMm(transform.y),
		rotationDeg: normalizeAngleDeg(transform.rotationDeg),
	};
}

/**
 * Converts a millimetre value to the target display unit.
 */
export function convertFromMm(mm: number, unit: DisplayUnit): number {
	switch (unit) {
		case "m":
			return mm / 1_000;
		case "cm":
			return mm / 10;
		case "mm":
			return mm;
	}
}

/**
 * Converts a value from a display unit back to millimetres.
 */
export function convertToMm(value: number, unit: DisplayUnit): number {
	switch (unit) {
		case "m":
			return value * 1_000;
		case "cm":
			return value * 10;
		case "mm":
			return value;
	}
}

/**
 * Formats a millimetre length for presentation according to the display unit.
 *
 * Defaults:
 * - "m": 2 decimal places (e.g., 4000 mm -> "4.00 m")
 * - "cm": 1 decimal place (e.g., 4000 mm -> "400.0 cm")
 * - "mm": 0 decimal places (e.g., 4000 mm -> "4000 mm")
 */
export function formatDisplayLength(
	mm: number,
	unit: DisplayUnit,
	precision?: number,
): string {
	const converted = convertFromMm(mm, unit);
	switch (unit) {
		case "m": {
			const dec = precision ?? 2;
			return `${converted.toFixed(dec)} m`;
		}
		case "cm": {
			const dec = precision ?? 1;
			return `${converted.toFixed(dec)} cm`;
		}
		case "mm": {
			if (precision !== undefined) {
				return `${converted.toFixed(precision)} mm`;
			}
			return `${Math.round(converted).toString()} mm`;
		}
	}
}

/**
 * Returns a new document with an updated display unit.
 * The underlying stored geometry is strictly identical and never mutated.
 */
export function setDisplayUnit(
	doc: BlueprintDocument,
	newUnit: DisplayUnit,
): BlueprintDocument {
	if (doc.content.displayUnit === newUnit) {
		return doc;
	}
	return {
		...doc,
		content: {
			...doc.content,
			displayUnit: newUnit,
		},
	};
}
