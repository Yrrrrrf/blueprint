// ============================================================================
// Blueprint Symbol Scenegraph & Catalog Device Rendering (§6.2, §8.1)
// Renders device catalog symbols with applyMatrix = false, per-instance status rings,
// and port handles. Paper items are strictly isolated to the active PaperScope.
// ============================================================================

import paper from "paper";
import type {
	DeviceDefinition,
	DeviceEntity,
	Geometry,
	Id,
	Polygon,
	Ring,
	Style,
	SymbolPart,
} from "@sdk/core";
import { polygonBounds, resolveDeviceDefinition } from "@sdk/core";
import type { AssetTelemetry } from "./types.ts";

/**
 * Creates a Paper.js Path from a Ring polygon vertex array.
 */
function createRingPath(scope: paper.PaperScope, ring: Ring): paper.Path {
	const path = new scope.Path({ insert: false });
	for (const v of ring) {
		path.add(new scope.Point(v.x, v.y));
	}
	path.closed = true;
	return path;
}

/**
 * Creates a Paper.js Path/CompoundPath from a pure Polygon definition.
 */
export function createPolygonItem(
	scope: paper.PaperScope,
	poly: Polygon,
): paper.Item {
	if (poly.holes.length === 0) {
		return createRingPath(scope, poly.outer);
	}
	const outerPath = createRingPath(scope, poly.outer);
	const holePaths = poly.holes.map((h) => createRingPath(scope, h));
	const compound = new scope.CompoundPath({
		children: [outerPath, ...holePaths],
		insert: false,
	});
	return compound;
}

/**
 * Creates a Paper.js Item from a domain Geometry.
 */
export function createGeometryItem(
	scope: paper.PaperScope,
	geometry: Geometry,
): paper.Item {
	switch (geometry.kind) {
		case "rect": {
			const rect = new scope.Rectangle(
				new scope.Point(0, 0),
				new scope.Size(geometry.width, geometry.height),
			);
			if (geometry.cornerRadius > 0) {
				const r = Math.min(
					geometry.cornerRadius,
					geometry.width / 2,
					geometry.height / 2,
				);
				return new scope.Path.Rectangle(rect, new scope.Size(r, r));
			}
			return new scope.Path.Rectangle(rect);
		}
		case "ellipse": {
			const rect = new scope.Rectangle(
				new scope.Point(0, 0),
				new scope.Size(geometry.width, geometry.height),
			);
			return new scope.Path.Ellipse(rect);
		}
		case "polygon": {
			if (geometry.polygons.length === 1) {
				return createPolygonItem(scope, geometry.polygons[0]);
			}
			const children = geometry.polygons.map((p) =>
				createPolygonItem(scope, p),
			);
			return new scope.Group({ children, insert: false });
		}
		case "path": {
			const path = new scope.Path({ insert: false });
			for (const seg of geometry.segments) {
				path.add(
					new scope.Segment(
						new scope.Point(seg.point.x, seg.point.y),
						new scope.Point(seg.handleIn.x, seg.handleIn.y),
						new scope.Point(seg.handleOut.x, seg.handleOut.y),
					),
				);
			}
			path.closed = geometry.closed;
			return path;
		}
	}
}

/**
 * Applies a Blueprint domain Style to a Paper Item.
 */
export function applyItemStyle(item: paper.Item, style: Style): void {
	if (style.fill) {
		item.fillColor = new paper.Color(style.fill);
	} else {
		item.fillColor = null;
	}
	if (style.stroke) {
		item.strokeColor = new paper.Color(style.stroke);
		item.strokeWidth = Math.max(0.5, style.strokeWidthMm);
	} else {
		item.strokeColor = null;
	}
	item.opacity = style.opacity;
	if (style.dashMm && style.dashMm.length > 0) {
		item.dashArray = [...style.dashMm];
	}
}

/**
 * Renders an individual symbol part into a Paper Item with applyMatrix = false (§6.2).
 */
export function renderSymbolPart(
	scope: paper.PaperScope,
	part: SymbolPart,
	entityId: Id,
): paper.Item {
	const item = createGeometryItem(scope, part.geometry);
	item.applyMatrix = false;
	applyItemStyle(item, part.style);

	item.pivot = new scope.Point(0, 0);
	item.position = new scope.Point(part.transform.x, part.transform.y);
	item.rotation = part.transform.rotationDeg;
	item.data = { entityId, partId: part.id, category: "entity" };

	return item;
}

/**
 * Renders a full device entity symbol into a Paper.js Group (§6.2, §8.1).
 * applyMatrix = false preserves physical rotation and world transforms.
 */
export function renderDeviceGroup(
	scope: paper.PaperScope,
	device: DeviceEntity,
	baseDefinition: DeviceDefinition,
	telemetry?: AssetTelemetry,
): paper.Group {
	const def = resolveDeviceDefinition(baseDefinition, device.parameters);
	const children: paper.Item[] = [];

	// 1. Footprint polygon (background reference)
	const footprintItem = createPolygonItem(scope, def.footprint);
	footprintItem.applyMatrix = false;
	footprintItem.fillColor = new paper.Color(0.95, 0.95, 0.97, 0.5);
	footprintItem.strokeColor = new paper.Color(0.7, 0.7, 0.75);
	footprintItem.strokeWidth = 1;
	footprintItem.data = {
		entityId: device.id,
		featureId: "footprint",
		category: "entity",
	};
	children.push(footprintItem);

	// 2. Symbol parts
	for (const part of def.symbol) {
		const partItem = renderSymbolPart(scope, part, device.id);
		children.push(partItem);
	}

	// 3. Port handles
	for (const port of def.ports) {
		const portCircle = new scope.Path.Circle({
			center: new scope.Point(port.point.x, port.point.y),
			radius: 60, // 60 mm port radius
			fillColor: new paper.Color("#3b82f6"),
			strokeColor: new paper.Color("#1d4ed8"),
			strokeWidth: 2,
			insert: false,
		});
		portCircle.applyMatrix = false;
		portCircle.data = {
			entityId: device.id,
			featureId: port.id,
			category: "port",
		};
		children.push(portCircle);
	}

	// 4. Per-instance status ring / indicator (§6.2)
	// Kept separate per instance so one machine's status does not recolor all symbol instances
	const bounds = polygonBounds(def.footprint);
	const statusColor = getStatusColor(telemetry?.status);
	const statusRing = new scope.Path.Circle({
		center: new scope.Point(
			bounds.minX + bounds.width / 2,
			bounds.minY + bounds.height / 2,
		),
		radius: Math.min(bounds.width, bounds.height) / 4,
		strokeColor: new paper.Color(statusColor),
		strokeWidth: 4,
		fillColor: null,
		insert: false,
	});
	statusRing.name = "status_ring";
	statusRing.applyMatrix = false;
	statusRing.data = {
		entityId: device.id,
		featureId: "status",
		category: "entity",
	};
	children.push(statusRing);

	// 5. Root Group with applyMatrix = false (§6.2)
	const group = new scope.Group({
		children,
		insert: false,
	});
	group.name = `device_${device.id}`;
	group.applyMatrix = false;
	group.pivot = new scope.Point(0, 0);
	group.position = new scope.Point(device.transform.x, device.transform.y);
	group.rotation = device.transform.rotationDeg;
	group.data = {
		entityId: device.id,
		category: "entity",
		definitionId: device.definitionId,
	};

	return group;
}

/**
 * Updates an existing device group's status ring without rebuilding the entire scenegraph (§6.2).
 */
export function updateDeviceTelemetryStatus(
	group: paper.Group,
	status?: "running" | "maintenance" | "offline" | "unknown",
): void {
	const ring = group.children.find((c) => c.name === "status_ring");
	if (ring) {
		ring.strokeColor = new paper.Color(getStatusColor(status));
	}
}

function getStatusColor(
	status?: "running" | "maintenance" | "offline" | "unknown",
): string {
	switch (status) {
		case "running":
			return "#22c55e"; // green
		case "maintenance":
			return "#eab308"; // yellow
		case "offline":
			return "#ef4444"; // red
		default:
			return "#94a3b8"; // slate gray
	}
}
