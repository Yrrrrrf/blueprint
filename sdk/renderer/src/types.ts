// ============================================================================
// Blueprint Renderer Types (§6.2, §6.3, §6.4, §6.5 of Blueprint Specification)
// Pure contracts, camera, picking, snapping, and RendererPort interface.
// ============================================================================

import type {
	BlueprintDocument,
	Entity,
	Id,
	SpatialIssue,
	TelemetryValue,
	Vec2,
} from "@sdk/core";
import type { DocumentDelta } from "@sdk/core";

// ----------------------------------------------------------------------------
// 1. Camera & Coordinate Space (§6.3)
// ----------------------------------------------------------------------------

/**
 * Camera viewport specification in world coordinates.
 * scale: dimensionless multiplier in [0.01, 1000].
 * Actual scale s = 0.01 * scale CSS px/mm.
 */
export type Camera = {
	centerMm: Vec2;
	scale: number;
};

/**
 * Axis-aligned bounding box in world millimetres.
 */
export type WorldBounds = {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
};

// ----------------------------------------------------------------------------
// 2. Gesture Preview & Overlays (§6.2)
// ----------------------------------------------------------------------------

export type SnapGuideType = "point" | "line" | "angle";

export type SnapGuide = {
	type: SnapGuideType;
	points: readonly Vec2[];
	label?: string;
	angleDeg?: number;
};

export type MarqueeMode = "enclosed" | "crossing";

export type MarqueeRect = {
	from: Vec2;
	to: Vec2;
	mode: MarqueeMode;
};

/**
 * Transient preview overlay during user gestures (§6.2).
 */
export type GesturePreview = {
	entities?: readonly Entity[];
	guides?: readonly SnapGuide[];
	marquee?: MarqueeRect | null;
};

// ----------------------------------------------------------------------------
// 3. Picking & Selection (§6.4)
// ----------------------------------------------------------------------------

export type PickMode = "editor" | "viewer";

export type PickPolicy = {
	mode: PickMode;
	drillDown: boolean;
	visibleLayerFilter?: readonly Id[];
};

export type PickCategory =
	| "entity"
	| "handle"
	| "anchor"
	| "port"
	| "background";

export type PickResult = {
	entityId: Id;
	featureId?: Id;
	worldPoint: Vec2;
	category: PickCategory;
};

// ----------------------------------------------------------------------------
// 4. Snapping (§6.5)
// ----------------------------------------------------------------------------

export type SnapCandidateType =
	| "vertex"
	| "port"
	| "midpoint"
	| "guide"
	| "grid";

export type SnapCandidate = {
	type: SnapCandidateType;
	point: Vec2;
	entityId?: Id;
	featureId?: Id;
	distancePx: number;
	rank: number;
	label?: string;
};

export type SnapResult = {
	snappedPoint: Vec2;
	candidate: SnapCandidate | null;
	guides: readonly SnapGuide[];
};

// ----------------------------------------------------------------------------
// 5. Telemetry & Spatial Issues (§6.2, §9.1)
// ----------------------------------------------------------------------------

export type { TelemetryValue };

export type AssetTelemetry = {
	values: Readonly<Record<string, TelemetryValue>>;
	samples?: Readonly<Record<string, unknown>>;
	status?: "running" | "maintenance" | "offline" | "unknown";
	stale?: boolean;
};

export type { SpatialIssue };

// ----------------------------------------------------------------------------
// 6. Draw List Contracts (§12.1)
// ----------------------------------------------------------------------------

export type DrawPath = {
	kind: "path";
	d?: string;
	closed: boolean;
	fill: string | null;
	stroke: string | null;
	strokeWidthMm: number;
	opacity: number;
	dashMm?: readonly number[];
	entityId: Id;
	partId?: Id;
	layerId: Id;
	transform: { x: number; y: number; rotationDeg: number };
};

export type DrawText = {
	kind: "text";
	text: string;
	position: Vec2;
	fontSizeMm: number;
	color: string;
	fontFamily?: string;
	fontWeight?: "normal" | "bold";
	opacity: number;
	entityId: Id;
	partId?: Id;
	layerId: Id;
	transform: { x: number; y: number; rotationDeg: number };
};

export type DrawImage = {
	kind: "image";
	assetId: Id;
	rect: { x: number; y: number; width: number; height: number };
	opacity: number;
	entityId: Id;
	partId?: Id;
	layerId: Id;
	transform: { x: number; y: number; rotationDeg: number };
};

export type DrawPrimitive = DrawPath | DrawText | DrawImage;

export type DrawListScope =
	| "all_printable"
	| "visible_printable"
	| "selection"
	| "zone";

export type DrawListOptions = {
	scope?: DrawListScope;
	selectionIds?: readonly Id[];
	zoneId?: Id;
	includeHidden?: boolean;
	visibleLayerFilter?: readonly Id[];
};

export type DrawList = {
	items: readonly DrawPrimitive[];
	bounds: WorldBounds;
	facilityBounds: WorldBounds;
};

// ----------------------------------------------------------------------------
// 7. Scenegraph Handle & Renderer Port (§6.2)
// ----------------------------------------------------------------------------

export type RenderHandle = {
	entityId: Id;
	layerId: Id;
	paperItem?: unknown;
	bounds: WorldBounds;
};

/**
 * Standard Renderer Port contract (§6.2).
 * UI and State interact with canvas rendering exclusively through this interface.
 */
export interface RendererPort {
	setDocument(doc: BlueprintDocument): void;
	applyDelta(doc: BlueprintDocument, delta: DocumentDelta): void;
	setPreview(preview: GesturePreview | null): void;
	setSelection(ids: readonly Id[]): void;
	setTelemetry(values: ReadonlyMap<Id, AssetTelemetry>): void;
	setIssues(issues: readonly SpatialIssue[]): void;
	setCamera(camera: Camera): void;
	getCamera(): Camera;
	hitTest(viewPoint: Vec2, policy: PickPolicy): PickResult | null;
	fit(bounds?: WorldBounds): void;
	dispose(): void;
}
