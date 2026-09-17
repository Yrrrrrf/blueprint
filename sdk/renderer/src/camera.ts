// ============================================================================
// Blueprint Camera & Coordinate Mapping (§6.3, AC-025, AC-027, AC-028)
// Base scale 0.01 CSS px/mm, cursor-anchored zoom, pan, fit, and zero-dimension guards.
// ============================================================================

import type { Vec2 } from "@sdk/core";
import type { Camera, WorldBounds } from "./types.ts";

export const MIN_CAMERA_SCALE = 0.01;
export const MAX_CAMERA_SCALE = 1000.0;
export const BASE_SCALE_PX_PER_MM = 0.01; // 0.01 CSS px/mm = 10 CSS px / 1000 mm (1m)

/**
 * Computes pixels per millimetre for a camera scale.
 */
export function getScalePixelsPerMm(scale: number): number {
	const clamped = Math.min(MAX_CAMERA_SCALE, Math.max(MIN_CAMERA_SCALE, scale));
	return BASE_SCALE_PX_PER_MM * clamped;
}

/**
 * Transforms a world millimetre point to CSS canvas view coordinates (§6.3).
 * view = viewportCenter + (world - cameraCenter) * s
 */
export function worldToView(
	worldPoint: Vec2,
	camera: Camera,
	viewportSize: Vec2,
): Vec2 {
	const s = getScalePixelsPerMm(camera.scale);
	const halfW = viewportSize.x / 2;
	const halfH = viewportSize.y / 2;
	return {
		x: halfW + (worldPoint.x - camera.centerMm.x) * s,
		y: halfH + (worldPoint.y - camera.centerMm.y) * s,
	};
}

/**
 * Transforms a CSS canvas view coordinate to world millimetres (§6.3).
 * world = cameraCenter + (view - viewportCenter) / s
 */
export function viewToWorld(
	viewPoint: Vec2,
	camera: Camera,
	viewportSize: Vec2,
): Vec2 {
	const s = getScalePixelsPerMm(camera.scale);
	const halfW = viewportSize.x / 2;
	const halfH = viewportSize.y / 2;
	return {
		x: camera.centerMm.x + (viewPoint.x - halfW) / s,
		y: camera.centerMm.y + (viewPoint.y - halfH) / s,
	};
}

/**
 * Normalizes wheel delta to CSS pixels based on deltaMode (§6.3).
 * deltaMode 0: pixels
 * deltaMode 1: lines (16 CSS px per line)
 * deltaMode 2: pages (viewport height)
 */
export function normalizeWheelDelta(
	deltaY: number,
	deltaMode: number,
	viewportHeight: number,
): number {
	if (deltaMode === 1) {
		return deltaY * 16;
	}
	if (deltaMode === 2) {
		return deltaY * (viewportHeight > 0 ? viewportHeight : 800);
	}
	return deltaY;
}

/**
 * Cursor-anchored wheel zoom (§6.3, AC-027).
 * The world point under the cursor remains fixed while scale updates.
 * Multiplier: exp(-deltaPx * 0.0015), clamped to [0.01, 1000].
 */
export function zoomAtViewPoint(
	camera: Camera,
	viewPoint: Vec2,
	viewportSize: Vec2,
	deltaPx: number,
): Camera {
	if (viewportSize.x <= 0 || viewportSize.y <= 0) {
		// Zero-size viewport guard (§6.3, AC-028)
		return camera;
	}

	const factor = Math.exp(-deltaPx * 0.0015);
	const newScale = Math.min(
		MAX_CAMERA_SCALE,
		Math.max(MIN_CAMERA_SCALE, camera.scale * factor),
	);

	if (Math.abs(newScale - camera.scale) < 1e-9) {
		return camera;
	}

	// World point under cursor before zoom
	const worldUnderCursor = viewToWorld(viewPoint, camera, viewportSize);

	// Compute new center such that worldUnderCursor stays under viewPoint
	const newS = getScalePixelsPerMm(newScale);
	const halfW = viewportSize.x / 2;
	const halfH = viewportSize.y / 2;

	return {
		scale: newScale,
		centerMm: {
			x: worldUnderCursor.x - (viewPoint.x - halfW) / newS,
			y: worldUnderCursor.y - (viewPoint.y - halfH) / newS,
		},
	};
}

/**
 * Directly zooms the camera to a target scale while anchoring a given view point (§6.3, AC-027).
 */
export function zoomToScaleAtViewPoint(
	camera: Camera,
	targetScale: number,
	viewPoint: Vec2,
	viewportSize: Vec2,
): Camera {
	if (viewportSize.x <= 0 || viewportSize.y <= 0) {
		return camera;
	}
	const clampedScale = Math.min(
		MAX_CAMERA_SCALE,
		Math.max(MIN_CAMERA_SCALE, targetScale),
	);
	const worldUnderCursor = viewToWorld(viewPoint, camera, viewportSize);
	const newS = getScalePixelsPerMm(clampedScale);
	const halfW = viewportSize.x / 2;
	const halfH = viewportSize.y / 2;

	return {
		scale: clampedScale,
		centerMm: {
			x: worldUnderCursor.x - (viewPoint.x - halfW) / newS,
			y: worldUnderCursor.y - (viewPoint.y - halfH) / newS,
		},
	};
}

/**
 * Pans the camera by a view delta in CSS pixels (§6.3).
 * Panning moves the view, so camera center moves opposite to drag delta.
 */
export function panCamera(camera: Camera, deltaViewPx: Vec2): Camera {
	const s = getScalePixelsPerMm(camera.scale);
	return {
		scale: camera.scale,
		centerMm: {
			x: camera.centerMm.x - deltaViewPx.x / s,
			y: camera.centerMm.y - deltaViewPx.y / s,
		},
	};
}

/**
 * Fits camera to bounding box with 32 CSS px margin per side (§6.3, AC-028).
 * Preserves aspect ratio. Zero dimensions return current camera safely.
 */
export function fitToBounds(
	bounds: WorldBounds,
	viewportSize: Vec2,
	paddingPx = 32,
	currentCamera?: Camera,
): Camera {
	if (viewportSize.x <= 0 || viewportSize.y <= 0) {
		// Zero dimension guard: do not produce NaN/Infinity (§6.3, AC-028)
		return (
			currentCamera ?? {
				scale: 1,
				centerMm: {
					x: (bounds.minX + bounds.maxX) / 2,
					y: (bounds.minY + bounds.maxY) / 2,
				},
			}
		);
	}

	const availW = Math.max(1, viewportSize.x - 2 * paddingPx);
	const availH = Math.max(1, viewportSize.y - 2 * paddingPx);
	const boundsW = Math.max(1, bounds.width);
	const boundsH = Math.max(1, bounds.height);

	const sX = availW / boundsW;
	const sY = availH / boundsH;
	const s = Math.min(sX, sY);

	const scale = Math.min(
		MAX_CAMERA_SCALE,
		Math.max(MIN_CAMERA_SCALE, s / BASE_SCALE_PX_PER_MM),
	);

	return {
		scale,
		centerMm: {
			x: (bounds.minX + bounds.maxX) / 2,
			y: (bounds.minY + bounds.maxY) / 2,
		},
	};
}

/**
 * Creates default initial camera centered on facility (§6.3).
 */
export function createDefaultCamera(facility?: {
	widthMm: number;
	heightMm: number;
}): Camera {
	const w = facility?.widthMm ?? 80000;
	const h = facility?.heightMm ?? 50000;
	return {
		scale: 1,
		centerMm: {
			x: w / 2,
			y: h / 2,
		},
	};
}
