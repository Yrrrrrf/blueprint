// ============================================================================
// Blueprint Canvas Overlays Engine (§6.2, §6.5)
// Selection bounding box, transform handles, snap guide lines, hover rings,
// issue badges, and marquee rectangle overlays. Excluded from native persistence.
// ============================================================================

import paper from "paper";
import type { BlueprintDocument, Id, SpatialIssue, Vec2 } from "@sdk/core";
import { getScalePixelsPerMm, worldToView } from "./camera.ts";
import { computeEntityWorldBounds } from "./picking.ts";
import type { Camera, MarqueeRect, SnapGuide, WorldBounds } from "./types.ts";

export type OverlayHandleType =
	| "nw"
	| "n"
	| "ne"
	| "e"
	| "se"
	| "s"
	| "sw"
	| "w"
	| "rot"
	| "pivot";

export type SelectionHandle = {
	type: OverlayHandleType;
	worldPoint: Vec2;
	viewPoint: Vec2;
	cursor: string;
};

/**
 * Computes aggregated bounding box in world space for selected entity IDs.
 */
export function computeSelectionBounds(
	selectedIds: readonly Id[],
	doc: BlueprintDocument,
): WorldBounds | null {
	if (selectedIds.length === 0) return null;

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	let count = 0;

	for (const id of selectedIds) {
		const entity = doc.content.entities[id];
		if (!entity) continue;
		const b = computeEntityWorldBounds(entity, doc);
		if (b.minX < minX) minX = b.minX;
		if (b.minY < minY) minY = b.minY;
		if (b.maxX > maxX) maxX = b.maxX;
		if (b.maxY > maxY) maxY = b.maxY;
		count++;
	}

	if (count === 0) return null;

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
 * Calculates transform handles for a selection bounding box.
 */
export function getSelectionHandles(
	bounds: WorldBounds,
	camera: Camera,
	viewportSize: Vec2,
): SelectionHandle[] {
	const corners: { type: OverlayHandleType; pt: Vec2; cursor: string }[] = [
		{
			type: "nw",
			pt: { x: bounds.minX, y: bounds.minY },
			cursor: "nwse-resize",
		},
		{
			type: "n",
			pt: { x: (bounds.minX + bounds.maxX) / 2, y: bounds.minY },
			cursor: "ns-resize",
		},
		{
			type: "ne",
			pt: { x: bounds.maxX, y: bounds.minY },
			cursor: "nesw-resize",
		},
		{
			type: "e",
			pt: { x: bounds.maxX, y: (bounds.minY + bounds.maxY) / 2 },
			cursor: "ew-resize",
		},
		{
			type: "se",
			pt: { x: bounds.maxX, y: bounds.maxY },
			cursor: "nwse-resize",
		},
		{
			type: "s",
			pt: { x: (bounds.minX + bounds.maxX) / 2, y: bounds.maxY },
			cursor: "ns-resize",
		},
		{
			type: "sw",
			pt: { x: bounds.minX, y: bounds.maxY },
			cursor: "nesw-resize",
		},
		{
			type: "w",
			pt: { x: bounds.minX, y: (bounds.minY + bounds.maxY) / 2 },
			cursor: "ew-resize",
		},
	];

	const s = getScalePixelsPerMm(camera.scale);
	const rotOffsetMm = 30 / s; // 30 CSS px above top edge
	const rotPt: Vec2 = {
		x: (bounds.minX + bounds.maxX) / 2,
		y: bounds.minY - rotOffsetMm,
	};

	const handles: SelectionHandle[] = corners.map((c) => ({
		type: c.type,
		worldPoint: c.pt,
		viewPoint: worldToView(c.pt, camera, viewportSize),
		cursor: c.cursor,
	}));

	handles.push({
		type: "rot",
		worldPoint: rotPt,
		viewPoint: worldToView(rotPt, camera, viewportSize),
		cursor: "grab",
	});

	const pivotPt: Vec2 = {
		x: (bounds.minX + bounds.maxX) / 2,
		y: (bounds.minY + bounds.maxY) / 2,
	};
	handles.push({
		type: "pivot",
		worldPoint: pivotPt,
		viewPoint: worldToView(pivotPt, camera, viewportSize),
		cursor: "crosshair",
	});

	return handles;
}

/**
 * Renders selection bounding box and handles into a Paper Group (§6.2).
 */
export function renderSelectionOverlay(
	scope: paper.PaperScope,
	bounds: WorldBounds,
	camera: Camera,
	viewportSize: Vec2,
): paper.Group {
	const group = new scope.Group({ insert: false });
	group.name = "overlay_selection";

	// Bounding box rectangle
	const rect = new scope.Path.Rectangle({
		from: new scope.Point(bounds.minX, bounds.minY),
		to: new scope.Point(bounds.maxX, bounds.maxY),
		strokeColor: new paper.Color("#2563eb"),
		strokeWidth: 1.5,
		fillColor: new paper.Color(0.15, 0.4, 0.95, 0.05),
		insert: false,
	});
	group.addChild(rect);

	const handles = getSelectionHandles(bounds, camera, viewportSize);
	const s = getScalePixelsPerMm(camera.scale);
	const handleRadiusMm = 4 / s; // 8px diameter

	for (const h of handles) {
		const circle = new scope.Path.Circle({
			center: new scope.Point(h.worldPoint.x, h.worldPoint.y),
			radius: handleRadiusMm,
			fillColor: new paper.Color(h.type === "rot" ? "#10b981" : "#ffffff"),
			strokeColor: new paper.Color("#2563eb"),
			strokeWidth: 1.5,
			insert: false,
		});
		circle.data = {
			category: "handle",
			handleType: h.type,
		};
		group.addChild(circle);
	}

	return group;
}

/**
 * Renders snap guides into a Paper Group (§6.5).
 */
export function renderSnapGuidesOverlay(
	scope: paper.PaperScope,
	guides: readonly SnapGuide[],
	camera: Camera,
): paper.Group {
	const group = new scope.Group({ insert: false });
	group.name = "overlay_snap_guides";
	const s = getScalePixelsPerMm(camera.scale);

	for (const guide of guides) {
		if (guide.type === "point" && guide.points.length > 0) {
			const pt = guide.points[0];
			const crosshair = new scope.Path({ insert: false });
			const r = 6 / s;
			crosshair.strokeColor = new paper.Color("#ef4444");
			crosshair.strokeWidth = 1.5;
			crosshair.moveTo(new scope.Point(pt.x - r, pt.y));
			crosshair.lineTo(new scope.Point(pt.x + r, pt.y));
			crosshair.moveTo(new scope.Point(pt.x, pt.y - r));
			crosshair.lineTo(new scope.Point(pt.x, pt.y + r));
			group.addChild(crosshair);
		} else if (
			(guide.type === "line" || guide.type === "angle") &&
			guide.points.length >= 2
		) {
			const isAngle = guide.type === "angle";
			const line = new scope.Path.Line({
				from: new scope.Point(guide.points[0].x, guide.points[0].y),
				to: new scope.Point(guide.points[1].x, guide.points[1].y),
				strokeColor: new paper.Color(isAngle ? "#10b981" : "#3b82f6"),
				strokeWidth: isAngle ? 1.5 : 1,
				dashArray: isAngle ? [80, 40] : [100, 50],
				insert: false,
			});
			group.addChild(line);
		}
	}

	return group;
}

/**
 * Renders marquee rectangle overlay (§6.4, AC-028).
 * Enclosed (L->R): solid border #3b82f6.
 * Crossing (R->L): dashed border #10b981.
 */
export function renderMarqueeOverlay(
	scope: paper.PaperScope,
	marquee: MarqueeRect,
): paper.Path.Rectangle {
	const minX = Math.min(marquee.from.x, marquee.to.x);
	const minY = Math.min(marquee.from.y, marquee.to.y);
	const maxX = Math.max(marquee.from.x, marquee.to.x);
	const maxY = Math.max(marquee.from.y, marquee.to.y);

	const isEnclosed = marquee.mode === "enclosed";
	const rect = new scope.Path.Rectangle({
		from: new scope.Point(minX, minY),
		to: new scope.Point(maxX, maxY),
		strokeColor: new paper.Color(isEnclosed ? "#3b82f6" : "#10b981"),
		strokeWidth: 1.5,
		dashArray: isEnclosed ? undefined : [100, 50],
		fillColor: new paper.Color(
			isEnclosed ? "rgba(59, 130, 246, 0.1)" : "rgba(16, 185, 129, 0.1)",
		),
		insert: false,
	});
	rect.name = "overlay_marquee";
	return rect;
}

/**
 * Renders spatial issue markers/badges overlay (§6.2, §8.3).
 */
export function renderSpatialIssuesOverlay(
	scope: paper.PaperScope,
	issues: readonly SpatialIssue[],
	doc: BlueprintDocument,
): paper.Group {
	const group = new scope.Group({ insert: false });
	group.name = "overlay_spatial_issues";

	for (const issue of issues) {
		for (const entId of issue.entityIds) {
			const entity = doc.content.entities[entId];
			if (!entity) continue;
			const b = computeEntityWorldBounds(entity, doc);

			// Indicator circle at top-right of entity
			const color = issue.severity === "error" ? "#ef4444" : "#f59e0b";
			const badge = new scope.Path.Circle({
				center: new scope.Point(b.maxX, b.minY),
				radius: 200, // 200 mm badge
				fillColor: new paper.Color(color),
				strokeColor: new paper.Color("#ffffff"),
				strokeWidth: 2,
				insert: false,
			});
			badge.data = {
				category: "handle",
				issueId: issue.id,
				entityId: entId,
			};
			group.addChild(badge);
		}
	}

	return group;
}
