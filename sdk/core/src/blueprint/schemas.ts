// ============================================================================
// Blueprint Valibot Schemas (§4.2 of Blueprint Specification)
// Strict runtime schema validation using Valibot v1
// ============================================================================

import * as v from "valibot";
import type { Json } from "./types.ts";
import { MAX_COORDINATE_MAGNITUDE_MM } from "./units.ts";

// ----------------------------------------------------------------------------
// Primitive & Scalar Schemas
// ----------------------------------------------------------------------------

/** ID schema: nonempty ASCII [A-Za-z][A-Za-z0-9_-]{0,127} */
export const IdSchema = v.pipe(
	v.string(),
	v.regex(
		/^[A-Za-z][A-Za-z0-9_-]{0,127}$/,
		"Invalid ID format: must start with ASCII letter and contain only [A-Za-z0-9_-] (max 128 chars)",
	),
);

/** ISO Date schema: valid UTC ISO-8601 instant ending in Z */
export const IsoDateSchema = v.pipe(
	v.string(),
	v.regex(
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
		"Invalid ISO date: must be valid UTC ending in Z",
	),
	v.check((val) => !isNaN(Date.parse(val)), "Invalid ISO date value"),
);

/** Recursive JSON schema excluding undefined, NaN, Infinity, dates, functions */
export const JsonSchema: v.GenericSchema<Json> = v.lazy(() =>
	v.union([
		v.null(),
		v.boolean(),
		v.pipe(v.number(), v.finite()),
		v.string(),
		v.array(JsonSchema),
		v.record(v.string(), JsonSchema),
	]),
);

/** Arbitrary metadata record */
export const MetadataSchema = v.record(v.string(), JsonSchema);

/** Finite coordinate bounded to [-10000000, 10000000] mm */
export const CoordinateSchema = v.pipe(
	v.number(),
	v.finite("Coordinate must be finite"),
	v.minValue(
		-MAX_COORDINATE_MAGNITUDE_MM,
		`Coordinate cannot be less than -${MAX_COORDINATE_MAGNITUDE_MM} mm`,
	),
	v.maxValue(
		MAX_COORDINATE_MAGNITUDE_MM,
		`Coordinate cannot exceed ${MAX_COORDINATE_MAGNITUDE_MM} mm`,
	),
);

/** Strictly positive dimension (>= 0.001 mm) */
export const PositiveNumberSchema = v.pipe(
	v.number(),
	v.finite("Value must be finite"),
	v.minValue(0.001, "Dimension must be strictly positive (>= 0.001 mm)"),
);

/** Non-negative number (>= 0) */
export const NonNegativeNumberSchema = v.pipe(
	v.number(),
	v.finite("Value must be finite"),
	v.minValue(0, "Value cannot be negative"),
);

/** Opacity in range [0, 1] */
export const OpacitySchema = v.pipe(
	v.number(),
	v.finite("Opacity must be finite"),
	v.minValue(0, "Opacity cannot be less than 0"),
	v.maxValue(1, "Opacity cannot be greater than 1"),
);

/** Clockwise angle in degrees, normalized to [0, 360) */
export const AngleSchema = v.pipe(
	v.number(),
	v.finite("Angle must be finite"),
	v.minValue(0, "Angle must be >= 0"),
	v.check((deg) => deg < 360, "Angle must be < 360 degrees"),
);

/** Hex color string (#RRGGBB) */
export const ColorSchema = v.pipe(
	v.string(),
	v.regex(/^#[0-9A-Fa-f]{6}$/, "Color must be in hex format (#RRGGBB)"),
);

// ----------------------------------------------------------------------------
// Geometry & Style Schemas
// ----------------------------------------------------------------------------

export const Vec2Schema = v.strictObject({
	x: CoordinateSchema,
	y: CoordinateSchema,
});

export const TransformSchema = v.strictObject({
	x: CoordinateSchema,
	y: CoordinateSchema,
	rotationDeg: AngleSchema,
});

export const IdentityTransformSchema = v.pipe(
	TransformSchema,
	v.check(
		(t) => t.x === 0 && t.y === 0 && t.rotationDeg === 0,
		"Transform must be identity (x: 0, y: 0, rotationDeg: 0)",
	),
);

export const RingVertexSchema = v.strictObject({
	x: CoordinateSchema,
	y: CoordinateSchema,
	id: IdSchema,
});

export const RingSchema = v.pipe(
	v.array(RingVertexSchema),
	v.minLength(3, "A ring must have at least 3 vertices"),
);

export const PolygonSchema = v.strictObject({
	outer: RingSchema,
	holes: v.array(RingSchema),
});

export const BezierVertexSchema = v.strictObject({
	id: IdSchema,
	point: Vec2Schema,
	handleIn: Vec2Schema,
	handleOut: Vec2Schema,
});

export const RectGeometrySchema = v.strictObject({
	kind: v.literal("rect"),
	width: PositiveNumberSchema,
	height: PositiveNumberSchema,
	cornerRadius: NonNegativeNumberSchema,
});

export const EllipseGeometrySchema = v.strictObject({
	kind: v.literal("ellipse"),
	width: PositiveNumberSchema,
	height: PositiveNumberSchema,
});

export const PolygonGeometrySchema = v.strictObject({
	kind: v.literal("polygon"),
	polygons: v.array(PolygonSchema),
});

export const PathGeometrySchema = v.strictObject({
	kind: v.literal("path"),
	closed: v.boolean(),
	segments: v.array(BezierVertexSchema),
});

export const GeometrySchema = v.variant("kind", [
	RectGeometrySchema,
	EllipseGeometrySchema,
	PolygonGeometrySchema,
	PathGeometrySchema,
]);

export const StyleSchema = v.strictObject({
	fill: v.nullable(ColorSchema),
	stroke: v.nullable(ColorSchema),
	strokeWidthMm: NonNegativeNumberSchema,
	opacity: OpacitySchema,
	dashMm: v.array(NonNegativeNumberSchema),
});

// ----------------------------------------------------------------------------
// Layer & Group Schemas
// ----------------------------------------------------------------------------

export const LayerRoleSchema = v.picklist([
	"foundation",
	"sections",
	"machinery",
	"marks",
	"custom",
]);

export const LayerSchema = v.strictObject({
	id: IdSchema,
	name: v.string(),
	role: LayerRoleSchema,
	parentId: v.nullable(IdSchema),
	visible: v.boolean(),
	locked: v.boolean(),
	printable: v.boolean(),
	opacity: OpacitySchema,
});

export const GroupSchema = v.strictObject({
	id: IdSchema,
	name: v.string(),
	parentId: v.nullable(IdSchema),
});

// ----------------------------------------------------------------------------
// Anchor & Relations Schemas
// ----------------------------------------------------------------------------

export const PointAnchorSchema = v.strictObject({
	kind: v.literal("point"),
	point: Vec2Schema,
});

export const EntityAnchorSchema = v.strictObject({
	kind: v.literal("entity"),
	entityId: IdSchema,
	feature: v.picklist(["origin", "center", "port", "vertex"]),
	featureId: v.nullable(IdSchema),
});

export const AnchorSchema = v.variant("kind", [
	PointAnchorSchema,
	EntityAnchorSchema,
]);

export const MemberOfLineRelationSchema = v.strictObject({
	id: IdSchema,
	kind: v.literal("memberOfLine"),
	deviceId: IdSchema,
	lineId: IdSchema,
});

export const ObservesRelationSchema = v.strictObject({
	id: IdSchema,
	kind: v.literal("observes"),
	sensorId: IdSchema,
	assetId: IdSchema,
});

export const FlowRelationSchema = v.strictObject({
	id: IdSchema,
	kind: v.literal("flow"),
	fromDeviceId: IdSchema,
	fromPortId: IdSchema,
	toDeviceId: IdSchema,
	toPortId: IdSchema,
});

export const AssignedZoneRelationSchema = v.strictObject({
	id: IdSchema,
	kind: v.literal("assignedZone"),
	deviceId: IdSchema,
	zoneId: IdSchema,
});

export const RelationSchema = v.variant("kind", [
	MemberOfLineRelationSchema,
	ObservesRelationSchema,
	FlowRelationSchema,
	AssignedZoneRelationSchema,
]);

export const ProductionLineSchema = v.strictObject({
	id: IdSchema,
	name: v.string(),
	color: ColorSchema,
});

export const TelemetryBindingSchema = v.strictObject({
	field: v.picklist([
		"status",
		"loadPct",
		"temperatureC",
		"vibrationMmS",
		"powerKw",
		"rpm",
		"speedMps",
	]),
	sourceId: v.string(),
	channel: v.string(),
});

// ----------------------------------------------------------------------------
// Symbol & Device Definition Schemas
// ----------------------------------------------------------------------------

export const SymbolPartSchema = v.strictObject({
	id: IdSchema,
	geometry: GeometrySchema,
	transform: TransformSchema,
	style: StyleSchema,
});

export const DeviceDefinitionSchema = v.strictObject({
	id: IdSchema,
	version: v.pipe(v.number(), v.integer(), v.minValue(1)),
	name: v.string(),
	category: v.picklist([
		"cnc",
		"robot",
		"conveyor",
		"rack",
		"sensor",
		"custom",
	]),
	nominalWidthMm: PositiveNumberSchema,
	nominalHeightMm: PositiveNumberSchema,
	sizing: v.picklist(["rigid", "conveyor", "rack"]),
	footprint: PolygonSchema,
	clearance: PolygonSchema,
	ports: v.array(
		v.strictObject({
			id: IdSchema,
			point: Vec2Schema,
			directionDeg: AngleSchema,
		}),
	),
	symbol: v.array(SymbolPartSchema),
	defaults: v.record(
		v.string(),
		v.union([v.number(), v.string(), v.boolean()]),
	),
});

export const EmbeddedAssetSchema = v.strictObject({
	id: IdSchema,
	mime: v.picklist(["image/png", "image/jpeg", "image/webp"]),
	sha256: v.pipe(
		v.string(),
		v.regex(/^[0-9a-fA-F]{64}$/, "SHA-256 must be a 64-character hex string"),
	),
	widthPx: v.pipe(v.number(), v.integer(), v.minValue(1)),
	heightPx: v.pipe(v.number(), v.integer(), v.minValue(1)),
	base64: v.string(),
});

// ----------------------------------------------------------------------------
// Entity Schemas
// ----------------------------------------------------------------------------

const baseEntries = {
	id: IdSchema,
	name: v.string(),
	layerId: IdSchema,
	groupId: v.nullable(IdSchema),
	transform: TransformSchema,
	style: StyleSchema,
	hidden: v.boolean(),
	locked: v.boolean(),
	tags: v.array(v.string()),
	metadata: MetadataSchema,
};

export const ShapeEntitySchema = v.strictObject({
	...baseEntries,
	kind: v.literal("shape"),
	geometry: GeometrySchema,
	structural: v.boolean(),
});

export const WallEntitySchema = v.strictObject({
	...baseEntries,
	kind: v.literal("wall"),
	vertices: v.pipe(
		v.array(
			v.strictObject({
				id: IdSchema,
				point: Vec2Schema,
			}),
		),
		v.minLength(2, "Wall must have at least 2 vertices"),
	),
	thicknessMm: PositiveNumberSchema,
	closed: v.boolean(),
});

export const OpeningEntitySchema = v.strictObject({
	...baseEntries,
	transform: IdentityTransformSchema,
	kind: v.literal("opening"),
	wallId: IdSchema,
	segmentStartId: IdSchema,
	segmentEndId: IdSchema,
	offsetMm: NonNegativeNumberSchema,
	widthMm: PositiveNumberSchema,
	openingType: v.picklist(["door", "dock", "passage"]),
	hinge: v.picklist(["start", "end"]),
	swing: v.picklist(["left", "right"]),
});

export const ZoneEntitySchema = v.strictObject({
	...baseEntries,
	kind: v.literal("zone"),
	polygon: PolygonSchema,
	category: v.picklist([
		"storage",
		"production",
		"hazard",
		"transit",
		"quality",
		"custom",
	]),
	restricted: v.boolean(),
});

export const DeviceEntitySchema = v.strictObject({
	...baseEntries,
	kind: v.literal("device"),
	definitionId: IdSchema,
	assetKey: v.string(),
	parameters: v.record(
		v.string(),
		v.union([v.number(), v.string(), v.boolean()]),
	),
	ratedPowerKw: v.nullable(NonNegativeNumberSchema),
	maintenanceDue: v.nullable(IsoDateSchema),
	bindings: v.array(TelemetryBindingSchema),
});

export const DimensionEntitySchema = v.strictObject({
	...baseEntries,
	transform: IdentityTransformSchema,
	kind: v.literal("dimension"),
	a: AnchorSchema,
	b: AnchorSchema,
	axis: v.picklist(["aligned", "horizontal", "vertical"]),
	offsetMm: CoordinateSchema,
	displayUnit: v.picklist(["document", "mm", "cm", "m"]),
	precision: v.picklist([0, 1, 2, 3]),
});

export const AnnotationEntitySchema = v.strictObject({
	...baseEntries,
	transform: IdentityTransformSchema,
	kind: v.literal("annotation"),
	anchor: AnchorSchema,
	offsetMm: Vec2Schema,
	text: v.string(),
	annotationType: v.picklist([
		"label",
		"warning",
		"inspection",
		"maintenance",
		"evacuation",
	]),
	textHeightMm: PositiveNumberSchema,
});

export const ReferenceEntitySchema = v.strictObject({
	...baseEntries,
	kind: v.literal("reference"),
	assetId: IdSchema,
	widthMm: PositiveNumberSchema,
	heightMm: PositiveNumberSchema,
	opacity: OpacitySchema,
});

export const EntitySchema = v.variant("kind", [
	ShapeEntitySchema,
	WallEntitySchema,
	OpeningEntitySchema,
	ZoneEntitySchema,
	DeviceEntitySchema,
	DimensionEntitySchema,
	AnnotationEntitySchema,
	ReferenceEntitySchema,
]);

// ----------------------------------------------------------------------------
// Document Content & Envelope Schemas
// ----------------------------------------------------------------------------

export const GridSchema = v.strictObject({
	origin: Vec2Schema,
	minorMm: PositiveNumberSchema,
	majorEvery: v.pipe(v.number(), v.integer(), v.minValue(1)),
	visible: v.boolean(),
});

export const FacilitySchema = v.strictObject({
	widthMm: PositiveNumberSchema,
	heightMm: PositiveNumberSchema,
});

export const DocumentContentSchema = v.strictObject({
	name: v.string(),
	description: v.string(),
	unit: v.literal("mm"),
	displayUnit: v.picklist(["mm", "cm", "m"]),
	facility: FacilitySchema,
	layers: v.array(LayerSchema),
	entities: v.record(IdSchema, EntitySchema),
	entityOrder: v.array(IdSchema),
	groups: v.array(GroupSchema),
	definitions: v.record(IdSchema, DeviceDefinitionSchema),
	assets: v.record(IdSchema, EmbeddedAssetSchema),
	lines: v.array(ProductionLineSchema),
	relations: v.array(RelationSchema),
	grid: GridSchema,
	metadata: MetadataSchema,
});

export const BlueprintDocumentSchema = v.strictObject({
	format: v.literal("blueprint"),
	schemaVersion: v.literal(1),
	documentId: IdSchema,
	createdAt: IsoDateSchema,
	updatedAt: IsoDateSchema,
	revision: v.pipe(v.number(), v.integer(), v.minValue(0)),
	content: DocumentContentSchema,
});
