// ============================================================================
// Blueprint Pointer & Event Routing Engine (§6.4, AC-025)
// DOM Pointer Events entry, client-to-view mapping without offset drift,
// 3px drag threshold, wheel normalization, and multi-touch gesture tracking.
// ============================================================================

import type { Vec2 } from "@sdk/core";
import { normalizeWheelDelta } from "./camera.ts";

export const POINTER_MOVE_THRESHOLD_PX = 3.0;

export type CanvasBoundingSource = {
	getBoundingClientRect: () => {
		left: number;
		top: number;
		width: number;
		height: number;
	};
	clientWidth?: number;
	clientHeight?: number;
};

/**
 * Converts a browser client pointer coordinate (clientX, clientY) to
 * canvas-local view coordinates in CSS pixels (§6.3, §6.4, AC-025).
 * Compensates for canvas page offset, margins, and page scroll without drift.
 */
export function clientToViewPoint(
	clientX: number,
	clientY: number,
	canvas: CanvasBoundingSource,
): Vec2 {
	const rect = canvas.getBoundingClientRect();
	const rawX = clientX - rect.left;
	const rawY = clientY - rect.top;

	// Adjust for CSS scaling if CSS logical layout size differs from bounding box
	const scaleX =
		canvas.clientWidth && rect.width > 0 ? canvas.clientWidth / rect.width : 1;
	const scaleY =
		canvas.clientHeight && rect.height > 0
			? canvas.clientHeight / rect.height
			: 1;

	return {
		x: rawX * scaleX,
		y: rawY * scaleY,
	};
}

/**
 * Tests whether pointer travel from an initial point has crossed the 3px drag threshold (§6.4).
 */
export function hasCrossedDragThreshold(
	startPoint: Vec2,
	currentPoint: Vec2,
	thresholdPx = POINTER_MOVE_THRESHOLD_PX,
): boolean {
	const dx = currentPoint.x - startPoint.x;
	const dy = currentPoint.y - startPoint.y;
	return Math.hypot(dx, dy) >= thresholdPx;
}

/**
 * Computes centroid and distance for two active touch pointers (§6.4).
 */
export function computeTouchCentroid(
	p1: Vec2,
	p2: Vec2,
): { centroid: Vec2; distance: number } {
	return {
		centroid: {
			x: (p1.x + p2.x) / 2,
			y: (p1.y + p2.y) / 2,
		},
		distance: Math.hypot(p2.x - p1.x, p2.y - p1.y),
	};
}

export { normalizeWheelDelta };
