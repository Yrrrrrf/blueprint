// ============================================================================
// Blueprint DOM-Free Draw-List Representation (§12.1 of Blueprint Specification)
// Canonical representation shared by Paper renderer, SVG, PDF, raster, PPTX.
// Completely pure: no DOM, no Canvas, no Paper.js imports.
// ============================================================================

import type {
	BezierVertex,
	BlueprintDocument,
	DeviceDefinition,
	DimensionEntity,
	Entity,
	Geometry,
	Id,
	OpeningEntity,
	Polygon,
	Ring,
	ShapeEntity,
	Style,
	SymbolPart,
	Vec2,
	WallEntity,
	ZoneEntity,
} from "@sdk/core";
import {
	deriveWallGeometry,
	computeDimensionGeometry,
	getCatalogDefinition,
	polygonBounds,
	resolveDeviceDefinition,
	worldPoint,
} from "@sdk/core";
import type {
	DrawImage,
	DrawList,
	DrawListOptions,
	DrawPath,
	DrawPrimitive,
	DrawText,
	WorldBounds,
} from "./types.ts";

// ----------------------------------------------------------------------------
// 1. Path Data Builders (DOM-free SVG Path Strings)
// ----------------------------------------------------------------------------

export function ringToPathD(ring: Ring): string {
	if (ring.length === 0) return "";
	let d = `M ${ring[0].x} ${ring[0].y}`;
	for (let i = 1; i < ring.length; i++) {
		d += ` L ${ring[i].x} ${ring[i].y}`;
	}
	d += " Z";
	return d;
}

export function polygonToPathD(poly: Polygon): string {
	let d = ringToPathD(poly.outer);
	for (const hole of poly.holes) {
		d += ` ${ringToPathD(hole)}`;
	}
	return d;
}

export function rectToPathD(
	width: number,
	height: number,
	cornerRadius = 0,
): string {
	const r = Math.max(0, Math.min(cornerRadius, width / 2, height / 2));
	if (r === 0) {
		return `M 0 0 L ${width} 0 L ${width} ${height} L 0 ${height} Z`;
	}
	return (
		`M ${r} 0 ` +
		`L ${width - r} 0 ` +
		`A ${r} ${r} 0 0 1 ${width} ${r} ` +
		`L ${width} ${height - r} ` +
		`A ${r} ${r} 0 0 1 ${width - r} ${height} ` +
		`L ${r} ${height} ` +
		`A ${r} ${r} 0 0 1 0 ${height - r} ` +
		`L 0 ${r} ` +
		`A ${r} ${r} 0 0 1 ${r} 0 Z`
	);
}

export function ellipseToPathD(width: number, height: number): string {
	const rx = width / 2;
	const ry = height / 2;
	const cx = rx;
	const cy = ry;
	return (
		`M ${cx - rx} ${cy} ` +
		`A ${rx} ${ry} 0 1 0 ${cx + rx} ${cy} ` +
		`A ${rx} ${ry} 0 1 0 ${cx - rx} ${cy} Z`
	);
}

function cubicSegmentD(prev: BezierVertex, curr: BezierVertex): string {
	const cp1x = prev.point.x + prev.handleOut.x;
	const cp1y = prev.point.y + prev.handleOut.y;
	const cp2x = curr.point.x + curr.handleIn.x;
	const cp2y = curr.point.y + curr.handleIn.y;
	return ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${curr.point.x} ${curr.point.y}`;
}

export function bezierSegmentsToPathD(
	segments: readonly BezierVertex[],
	closed: boolean,
): string {
	if (segments.length === 0) return "";
	let d = `M ${segments[0].point.x} ${segments[0].point.y}`;
	for (let i = 1; i < segments.length; i++) {
		d += cubicSegmentD(segments[i - 1], segments[i]);
	}
	if (closed && segments.length > 1) {
		d += `${cubicSegmentD(segments[segments.length - 1], segments[0])} Z`;
	}
	return d;
}

export function geometryToPathD(geometry: Geometry): string {
	switch (geometry.kind) {
		case "rect":
			return rectToPathD(
				geometry.width,
				geometry.height,
				geometry.cornerRadius,
			);
		case "ellipse":
			return ellipseToPathD(geometry.width, geometry.height);
		case "polygon":
			return geometry.polygons.map(polygonToPathD).join(" ");
		case "path":
			return bezierSegmentsToPathD(geometry.segments, geometry.closed);
	}
}

// ----------------------------------------------------------------------------
// 2. Entity Draw Primitive Generators
// ----------------------------------------------------------------------------

function shapeToPrimitives(
	entity: ShapeEntity,
	layerOpacity: number,
): DrawPrimitive[] {
	const effectiveOpacity = entity.style.opacity * layerOpacity;
	return [
		{
			kind: "path",
			d: geometryToPathD(entity.geometry),
			closed: true,
			fill: entity.style.fill,
			stroke: entity.style.stroke,
			strokeWidthMm: entity.style.strokeWidthMm,
			opacity: effectiveOpacity,
			dashMm: entity.style.dashMm,
			entityId: entity.id,
			layerId: entity.layerId,
			transform: entity.transform,
		},
	];
}

function wallToPrimitives(
	wall: WallEntity,
	openings: readonly OpeningEntity[],
	layerOpacity: number,
): DrawPrimitive[] {
	const effectiveOpacity = wall.style.opacity * layerOpacity;
	const wallPolygons = deriveWallGeometry(wall, openings, false);

	const primitives: DrawPrimitive[] = [];
	for (let i = 0; i < wallPolygons.length; i++) {
		primitives.push({
			kind: "path",
			d: polygonToPathD(wallPolygons[i]),
			closed: true,
			fill: wall.style.fill ?? "#333333",
			stroke: wall.style.stroke ?? "#111111",
			strokeWidthMm:
				wall.style.strokeWidthMm > 0 ? wall.style.strokeWidthMm : 1,
			opacity: effectiveOpacity,
			dashMm: wall.style.dashMm,
			entityId: wall.id,
			partId: `wall_poly_${i}`,
			layerId: wall.layerId,
			transform: wall.transform,
		});
	}
	return primitives;
}

function openingToPrimitives(
	opening: OpeningEntity,
	wall: WallEntity | undefined,
	layerOpacity: number,
): DrawPrimitive[] {
	const effectiveOpacity = opening.style.opacity * layerOpacity;
	const primitives: DrawPrimitive[] = [];

	if (opening.openingType === "door") {
		// Draw door leaf line and swing arc
		const w = opening.widthMm;
		const swingSign = opening.swing === "left" ? -1 : 1;
		const leafD = `M 0 0 L 0 ${swingSign * w}`;
		const arcD = `M ${w} 0 A ${w} ${w} 0 0 ${opening.swing === "left" ? 0 : 1} 0 ${swingSign * w}`;

		primitives.push(
			{
				kind: "path",
				d: leafD,
				closed: false,
				fill: null,
				stroke: opening.style.stroke ?? "#3b82f6",
				strokeWidthMm: Math.max(1, opening.style.strokeWidthMm),
				opacity: effectiveOpacity,
				entityId: opening.id,
				partId: "leaf",
				layerId: opening.layerId,
				transform: opening.transform,
			},
			{
				kind: "path",
				d: arcD,
				closed: false,
				fill: null,
				stroke: opening.style.stroke ?? "#3b82f6",
				strokeWidthMm: 1,
				opacity: effectiveOpacity * 0.7,
				dashMm: [20, 10],
				entityId: opening.id,
				partId: "arc",
				layerId: opening.layerId,
				transform: opening.transform,
			},
		);
	} else {
		// Passage / Dock rectangular outline
		const h = wall?.thicknessMm ?? 300;
		primitives.push({
			kind: "path",
			d: rectToPathD(opening.widthMm, h),
			closed: true,
			fill: opening.style.fill ?? "#f8fafc",
			stroke: opening.style.stroke ?? "#64748b",
			strokeWidthMm: 1,
			opacity: effectiveOpacity,
			dashMm: opening.openingType === "dock" ? [10, 10] : undefined,
			entityId: opening.id,
			layerId: opening.layerId,
			transform: opening.transform,
		});
	}

	return primitives;
}

function zoneToPrimitives(
	zone: ZoneEntity,
	layerOpacity: number,
): DrawPrimitive[] {
	const effectiveOpacity = zone.style.opacity * layerOpacity;
	const categoryColors: Record<string, { fill: string; stroke: string }> = {
		storage: { fill: "#3b82f61a", stroke: "#3b82f6" },
		production: { fill: "#10b9811a", stroke: "#10b981" },
		hazard: { fill: "#ef44441a", stroke: "#ef4444" },
		transit: { fill: "#f59e0b1a", stroke: "#f59e0b" },
		quality: { fill: "#8b5cf61a", stroke: "#8b5cf6" },
		custom: { fill: "#6b72801a", stroke: "#6b7280" },
	};
	const colors = categoryColors[zone.category] ?? categoryColors.custom;

	return [
		{
			kind: "path",
			d: polygonToPathD(zone.polygon),
			closed: true,
			fill: zone.style.fill ?? colors.fill,
			stroke: zone.style.stroke ?? colors.stroke,
			strokeWidthMm: Math.max(1, zone.style.strokeWidthMm),
			opacity: effectiveOpacity,
			dashMm: zone.restricted ? [20, 10] : zone.style.dashMm,
			entityId: zone.id,
			layerId: zone.layerId,
			transform: zone.transform,
		},
	];
}

function symbolPartToPrimitive(
	part: SymbolPart,
	entityId: Id,
	layerId: Id,
	baseTransform: { x: number; y: number; rotationDeg: number },
	layerOpacity: number,
): DrawPrimitive {
	return {
		kind: "path",
		d: geometryToPathD(part.geometry),
		closed: true,
		fill: part.style.fill,
		stroke: part.style.stroke,
		strokeWidthMm: part.style.strokeWidthMm,
		opacity: part.style.opacity * layerOpacity,
		dashMm: part.style.dashMm,
		entityId,
		partId: part.id,
		layerId,
		transform: {
			x: baseTransform.x + part.transform.x,
			y: baseTransform.y + part.transform.y,
			rotationDeg: baseTransform.rotationDeg + part.transform.rotationDeg,
		},
	};
}

function deviceToPrimitives(
	entity: Entity & { kind: "device" },
	doc: BlueprintDocument,
	layerOpacity: number,
): DrawPrimitive[] {
	const rawDef =
		doc.content.definitions[entity.definitionId] ??
		getCatalogDefinition(entity.definitionId);
	if (!rawDef) {
		return [];
	}
	const def = resolveDeviceDefinition(rawDef, entity.parameters);
	const primitives: DrawPrimitive[] = [];

	// Symbol parts
	for (const part of def.symbol) {
		primitives.push(
			symbolPartToPrimitive(
				part,
				entity.id,
				entity.layerId,
				entity.transform,
				layerOpacity,
			),
		);
	}

	return primitives;
}

function dimensionToPrimitives(
	entity: DimensionEntity,
	doc: BlueprintDocument,
	layerOpacity: number,
): DrawPrimitive[] {
	try {
		const geom = computeDimensionGeometry(doc, entity);
		const effectiveOpacity = entity.style.opacity * layerOpacity;
		const color = entity.style.stroke ?? "#2563eb";
		const primitives: DrawPrimitive[] = [];

		// Baseline
		primitives.push({
			kind: "path",
			d: `M ${geom.baselineStart.x} ${geom.baselineStart.y} L ${geom.baselineEnd.x} ${geom.baselineEnd.y}`,
			closed: false,
			fill: null,
			stroke: color,
			strokeWidthMm: Math.max(1, entity.style.strokeWidthMm),
			opacity: effectiveOpacity,
			entityId: entity.id,
			partId: "baseline",
			layerId: entity.layerId,
			transform: { x: 0, y: 0, rotationDeg: 0 },
		});

		// Extension line A
		primitives.push({
			kind: "path",
			d: `M ${geom.extensionAStart.x} ${geom.extensionAStart.y} L ${geom.extensionAEnd.x} ${geom.extensionAEnd.y}`,
			closed: false,
			fill: null,
			stroke: color,
			strokeWidthMm: 1,
			opacity: effectiveOpacity * 0.7,
			entityId: entity.id,
			partId: "extA",
			layerId: entity.layerId,
			transform: { x: 0, y: 0, rotationDeg: 0 },
		});

		// Extension line B
		primitives.push({
			kind: "path",
			d: `M ${geom.extensionBStart.x} ${geom.extensionBStart.y} L ${geom.extensionBEnd.x} ${geom.extensionBEnd.y}`,
			closed: false,
			fill: null,
			stroke: color,
			strokeWidthMm: 1,
			opacity: effectiveOpacity * 0.7,
			entityId: entity.id,
			partId: "extB",
			layerId: entity.layerId,
			transform: { x: 0, y: 0, rotationDeg: 0 },
		});

		// Text label
		const unitStr = entity.displayUnit === "m" ? "m" : "mm";
		const valStr =
			entity.displayUnit === "m"
				? `${(geom.valueMm / 1000).toFixed(entity.precision)} m`
				: `${Math.round(geom.valueMm)} mm`;

		primitives.push({
			kind: "text",
			text: valStr,
			position: geom.labelPosition,
			fontSizeMm: 250,
			color,
			fontWeight: "bold",
			opacity: effectiveOpacity,
			entityId: entity.id,
			partId: "label",
			layerId: entity.layerId,
			transform: { x: 0, y: 0, rotationDeg: geom.labelAngleDeg },
		});

		return primitives;
	} catch {
		return [];
	}
}

// ----------------------------------------------------------------------------
// 3. Build Draw List (§12.1)
// ----------------------------------------------------------------------------

/**
 * Builds a DOM-free draw list representing visible/printable document entities (§12.1).
 */
export function buildDrawList(
	doc: BlueprintDocument,
	options: DrawListOptions = {},
): DrawList {
	const scope = options.scope ?? "visible_printable";
	const visibleLayerFilter = options.visibleLayerFilter
		? new Set(options.visibleLayerFilter)
		: null;
	const selectionIds = options.selectionIds
		? new Set(options.selectionIds)
		: null;

	const layerMap = new Map(doc.content.layers.map((l) => [l.id, l]));
	const openingsByWall = new Map<Id, OpeningEntity[]>();

	// Index openings by parent wall
	for (const entity of Object.values(doc.content.entities)) {
		if (entity.kind === "opening") {
			const existing = openingsByWall.get(entity.wallId) ?? [];
			existing.push(entity);
			openingsByWall.set(entity.wallId, existing);
		}
	}

	const primitives: DrawPrimitive[] = [];

	// Render layers in defined order (back to front)
	for (const layer of doc.content.layers) {
		if (visibleLayerFilter && !visibleLayerFilter.has(layer.id)) {
			continue;
		}

		// Visibility check
		if (scope === "visible_printable" && !layer.visible) {
			if (!options.includeHidden) continue;
		}
		if (scope === "all_printable" && !layer.printable) {
			continue;
		}

		const layerOpacity = layer.opacity ?? 1.0;

		// Entities on this layer
		for (const entityId of doc.content.entityOrder) {
			const entity = doc.content.entities[entityId];
			if (!entity || entity.layerId !== layer.id) continue;

			if (
				scope === "selection" &&
				selectionIds &&
				!selectionIds.has(entity.id)
			) {
				continue;
			}
			if (
				scope === "visible_printable" &&
				entity.hidden &&
				!options.includeHidden
			) {
				continue;
			}

			switch (entity.kind) {
				case "shape":
					primitives.push(...shapeToPrimitives(entity, layerOpacity));
					break;
				case "wall":
					primitives.push(
						...wallToPrimitives(
							entity,
							openingsByWall.get(entity.id) ?? [],
							layerOpacity,
						),
					);
					break;
				case "opening": {
					const parentWall = doc.content.entities[entity.wallId] as
						| WallEntity
						| undefined;
					primitives.push(
						...openingToPrimitives(entity, parentWall, layerOpacity),
					);
					break;
				}
				case "zone":
					primitives.push(...zoneToPrimitives(entity, layerOpacity));
					break;
				case "device":
					primitives.push(...deviceToPrimitives(entity, doc, layerOpacity));
					break;
				case "dimension":
					primitives.push(...dimensionToPrimitives(entity, doc, layerOpacity));
					break;
				case "reference":
					primitives.push({
						kind: "image",
						assetId: entity.assetId,
						rect: {
							x: 0,
							y: 0,
							width: entity.widthMm,
							height: entity.heightMm,
						},
						opacity: entity.opacity * layerOpacity,
						entityId: entity.id,
						layerId: entity.layerId,
						transform: entity.transform,
					});
					break;
				case "annotation":
					primitives.push({
						kind: "text",
						text: entity.text,
						position: { x: entity.offsetMm.x, y: entity.offsetMm.y },
						fontSizeMm: entity.textHeightMm ?? 200,
						color: entity.style.stroke ?? "#1e293b",
						opacity: entity.style.opacity * layerOpacity,
						entityId: entity.id,
						layerId: entity.layerId,
						transform: entity.transform,
					});
					break;
			}
		}
	}

	const facilityW = doc.content.facility.widthMm;
	const facilityH = doc.content.facility.heightMm;
	const facilityBounds: WorldBounds = {
		minX: 0,
		minY: 0,
		maxX: facilityW,
		maxY: facilityH,
		width: facilityW,
		height: facilityH,
	};

	return {
		items: primitives,
		bounds: facilityBounds,
		facilityBounds,
	};
}
