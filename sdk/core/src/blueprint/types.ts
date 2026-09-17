// ============================================================================
// Blueprint Core Domain Types
// Normative TypeScript Contract (§4.2 of Blueprint Specification)
// ============================================================================

export type Id = string;

/** Valid UTC ISO-8601 instant ending in Z (e.g., "2026-09-15T00:00:00.000Z") */
export type IsoDate = string;

/** Strict JSON value excluding undefined, NaN, Infinity, dates, functions, and class instances */
export type Json =
	| null
	| boolean
	| number
	| string
	| Json[]
	| { [key: string]: Json };

/** 2D point / vector in millimetres (top-left origin, +X right, +Y down) */
export type Vec2 = {
	x: number;
	y: number;
};

/** Transform with translation and clockwise rotation in degrees */
export type Transform = {
	x: number;
	y: number;
	rotationDeg: number;
};

/** Vertex within a polygon ring with stable ID */
export type RingVertex = Vec2 & {
	id: Id;
};

/** Stable vertex IDs; implicitly closed (array length >= 3) */
export type Ring = readonly RingVertex[];

/** Polygon with outer boundary and optional interior holes */
export type Polygon = {
	outer: Ring;
	holes: readonly Ring[];
};

/** Discriminated union of supported primitive geometries */
export type Geometry =
	| { kind: "rect"; width: number; height: number; cornerRadius: number }
	| { kind: "ellipse"; width: number; height: number }
	| { kind: "polygon"; polygons: readonly Polygon[] }
	| { kind: "path"; closed: boolean; segments: readonly BezierVertex[] };

/** Bezier cubic vertex with handles relative to point */
export type BezierVertex = {
	id: Id;
	point: Vec2;
	handleIn: Vec2;
	handleOut: Vec2;
};

/** Visual presentation style. Colors: #RRGGBB only; opacity supplies alpha */
export type Style = {
	fill: string | null;
	stroke: string | null;
	strokeWidthMm: number;
	opacity: number;
	dashMm: readonly number[];
};

/** Layer roles including 4 mandatory preset roles and custom user layers */
export type LayerRole =
	| "foundation"
	| "sections"
	| "machinery"
	| "marks"
	| "custom";

/** Layer definition with hierarchy and visibility/lock properties */
export type Layer = {
	id: Id;
	name: string;
	role: LayerRole;
	parentId: Id | null;
	visible: boolean;
	locked: boolean;
	printable: boolean;
	opacity: number;
};

/** Common properties shared by all document entities */
export type Base = {
	id: Id;
	name: string;
	layerId: Id;
	groupId: Id | null;
	transform: Transform;
	style: Style;
	hidden: boolean;
	locked: boolean;
	tags: readonly string[];
	metadata: Readonly<Record<string, Json>>;
};

/** Pure geometric shape entity (rect, ellipse, polygon, path) */
export type ShapeEntity = Base & {
	kind: "shape";
	geometry: Geometry;
	structural: boolean;
};

/** Structural wall entity defined by sequential vertex polyline */
export type WallEntity = Base & {
	kind: "wall";
	vertices: readonly { id: Id; point: Vec2 }[];
	thicknessMm: number;
	closed: boolean;
};

/** Door, dock, or passage opening hosted on a wall segment */
export type OpeningEntity = Base & {
	kind: "opening";
	wallId: Id;
	segmentStartId: Id;
	segmentEndId: Id;
	offsetMm: number;
	widthMm: number;
	openingType: "door" | "dock" | "passage";
	hinge: "start" | "end";
	swing: "left" | "right";
};

/** Functional zone with boundary polygon */
export type ZoneEntity = Base & {
	kind: "zone";
	polygon: Polygon;
	category:
		| "storage"
		| "production"
		| "hazard"
		| "transit"
		| "quality"
		| "custom";
	restricted: boolean;
};

/** Telemetry scalar/status value (§9.1) */
export type TelemetryValue =
	| number
	| "running"
	| "maintenance"
	| "offline"
	| "unknown";

/** Telemetry field bindings mapping sensor channels to entity properties */
export type TelemetryBinding = {
	field:
		| "status"
		| "loadPct"
		| "temperatureC"
		| "vibrationMmS"
		| "powerKw"
		| "rpm"
		| "speedMps";
	sourceId: string;
	channel: string;
};

/** Parametric equipment or sensor device instance */
export type DeviceEntity = Base & {
	kind: "device";
	definitionId: Id;
	assetKey: string;
	parameters: Readonly<Record<string, number | string | boolean>>;
	ratedPowerKw: number | null;
	maintenanceDue: IsoDate | null;
	bindings: readonly TelemetryBinding[];
};

/** Anchor point definition for dimensions and annotations */
export type Anchor =
	| { kind: "point"; point: Vec2 }
	| {
			kind: "entity";
			entityId: Id;
			feature: "origin" | "center" | "port" | "vertex";
			featureId: Id | null;
	  };

/** Linear dimension line measuring distance between two anchors */
export type DimensionEntity = Base & {
	kind: "dimension";
	a: Anchor;
	b: Anchor;
	axis: "aligned" | "horizontal" | "vertical";
	offsetMm: number;
	displayUnit: "document" | "mm" | "cm" | "m";
	precision: 0 | 1 | 2 | 3;
};

/** Textual callout or warning annotation attached to an anchor */
export type AnnotationEntity = Base & {
	kind: "annotation";
	anchor: Anchor;
	offsetMm: Vec2;
	text: string;
	annotationType:
		| "label"
		| "warning"
		| "inspection"
		| "maintenance"
		| "evacuation";
	textHeightMm: number;
};

/** Background reference drawing or calibration image */
export type ReferenceEntity = Base & {
	kind: "reference";
	assetId: Id;
	widthMm: number;
	heightMm: number;
	opacity: number;
};

/** Discriminated union of all 8 entity kinds */
export type Entity =
	| ShapeEntity
	| WallEntity
	| OpeningEntity
	| ZoneEntity
	| DeviceEntity
	| DimensionEntity
	| AnnotationEntity
	| ReferenceEntity;

/** Entity group hierarchy node (no saved transform) */
export type Group = {
	id: Id;
	name: string;
	parentId: Id | null;
};

/** Semantic relationship between entities */
export type Relation =
	| { id: Id; kind: "memberOfLine"; deviceId: Id; lineId: Id }
	| { id: Id; kind: "observes"; sensorId: Id; assetId: Id }
	| {
			id: Id;
			kind: "flow";
			fromDeviceId: Id;
			fromPortId: Id;
			toDeviceId: Id;
			toPortId: Id;
	  }
	| { id: Id; kind: "assignedZone"; deviceId: Id; zoneId: Id };

/** Named production line grouping */
export type ProductionLine = {
	id: Id;
	name: string;
	color: string;
};

/** Part of a device symbol */
export type SymbolPart = {
	id: Id;
	geometry: Geometry;
	transform: Transform;
	style: Style;
};

/** Parametric definition of a device catalog entry */
export type DeviceDefinition = {
	id: Id;
	version: number;
	name: string;
	category: "cnc" | "robot" | "conveyor" | "rack" | "sensor" | "custom";
	nominalWidthMm: number;
	nominalHeightMm: number;
	sizing: "rigid" | "conveyor" | "rack";
	footprint: Polygon;
	clearance: Polygon;
	ports: readonly { id: Id; point: Vec2; directionDeg: number }[];
	symbol: readonly SymbolPart[];
	defaults: Readonly<Record<string, number | string | boolean>>;
};

/** Embedded raster asset in base64 */
export type EmbeddedAsset = {
	id: Id;
	mime: "image/png" | "image/jpeg" | "image/webp";
	sha256: string;
	widthPx: number;
	heightPx: number;
	base64: string;
};

/** Canonical content of a Blueprint document */
export type DocumentContent = {
	name: string;
	description: string;
	unit: "mm";
	displayUnit: "mm" | "cm" | "m";
	facility: { widthMm: number; heightMm: number };
	layers: readonly Layer[];
	entities: Readonly<Record<Id, Entity>>;
	entityOrder: readonly Id[];
	groups: readonly Group[];
	definitions: Readonly<Record<Id, DeviceDefinition>>;
	assets: Readonly<Record<Id, EmbeddedAsset>>;
	lines: readonly ProductionLine[];
	relations: readonly Relation[];
	grid: { origin: Vec2; minorMm: number; majorEvery: number; visible: boolean };
	metadata: Readonly<Record<string, Json>>;
};

/** Top-level Blueprint envelope */
export type BlueprintDocument = {
	format: "blueprint";
	schemaVersion: 1;
	documentId: Id;
	createdAt: IsoDate;
	updatedAt: IsoDate;
	revision: number;
	content: DocumentContent;
};

// ============================================================================
// Auxiliary Domain & Validation Types
// ============================================================================

export type DisplayUnit = "mm" | "cm" | "m";
export type Unit = "mm";
export type EntityKind = Entity["kind"];
export type GeometryKind = Geometry["kind"];
export type OpeningType = OpeningEntity["openingType"];
export type ZoneCategory = ZoneEntity["category"];
export type DeviceCategory = DeviceDefinition["category"];
export type DeviceSizing = DeviceDefinition["sizing"];
export type TelemetryField = TelemetryBinding["field"];
export type DimensionAxis = DimensionEntity["axis"];
export type AnnotationType = AnnotationEntity["annotationType"];
export type RelationKind = Relation["kind"];
export type AssetMime = EmbeddedAsset["mime"];

/** Structured validation issue (§4.3) */
export type ValidationIssue = {
	code: string;
	path: string;
	message: string;
	entityIds: string[];
};

/** Validation result containing validation status and sorted issues */
export type ValidationResult = {
	valid: boolean;
	issues: readonly ValidationIssue[];
};

/** Options for document validation */
export type DocumentValidationOptions = {
	skipAssetDecoding?: boolean;
};

// ============================================================================
// Spatial Conflict & Inspection Types (§8.3)
// ============================================================================

export type SpatialIssueSeverity = "warning" | "info" | "error";

export type SpatialIssueCode =
	| "FOOTPRINT_OVERLAP"
	| "CLEARANCE_INTRUSION"
	| "OUTSIDE_FACILITY"
	| "RESTRICTED_ZONE"
	| "ZONE_ASSIGNMENT_MISMATCH"
	| "UNBOUND_SENSOR"
	| "DISCONNECTED_FLOW"
	| "STALE_TELEMETRY";

/** Spatial analysis issue reported on committed or preview geometry (§8.3) */
export type SpatialIssue = {
	id: string;
	code: SpatialIssueCode;
	severity: SpatialIssueSeverity;
	entityIds: readonly Id[];
	geometry?: Polygon;
	message: string;
	measured?: number;
	revision?: number;
};
