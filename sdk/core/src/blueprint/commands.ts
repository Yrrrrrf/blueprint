// ============================================================================
// Blueprint Commands & Environments (§5.1 of Blueprint Specification)
// Canonical command definitions, reducer environment, deltas, and results.
// ============================================================================

import type {
	Anchor,
	AnnotationEntity,
	Base,
	BlueprintDocument,
	DeviceDefinition,
	DisplayUnit,
	EmbeddedAsset,
	Entity,
	Group,
	Id,
	IsoDate,
	Json,
	Layer,
	OpeningEntity,
	Polygon,
	ProductionLine,
	Relation,
	SpatialIssue,
	TelemetryBinding,
	Vec2,
} from "./types.ts";

// ----------------------------------------------------------------------------
// 1. Reducer Environment & Delta Contracts
// ----------------------------------------------------------------------------

export type ReducerMode = "editor" | "preview";

export type ReducerEnvironment = {
	mode: ReducerMode;
	clock: () => IsoDate;
	idFactory: () => Id;
};

/**
 * Creates a standard reducer environment with fallback defaults.
 */
export function createReducerEnvironment(
	overrides?: Partial<ReducerEnvironment>,
): ReducerEnvironment {
	return {
		mode: overrides?.mode ?? "editor",
		clock: overrides?.clock ?? (() => new Date().toISOString()),
		idFactory:
			overrides?.idFactory ?? (() => `id_${crypto.randomUUID().slice(0, 8)}`),
	};
}

/**
 * Lists added/changed/removed entity IDs and changed collection keys (§6.2).
 */
export type DocumentDelta = {
	addedEntityIds: readonly Id[];
	updatedEntityIds: readonly Id[];
	deletedEntityIds: readonly Id[];
	changedLayers?: readonly Id[];
	changedDefinitions?: readonly Id[];
	changedAssets?: readonly Id[];
	changedLines?: readonly Id[];
	changedRelations?: readonly Id[];
	settingsChanged?: boolean;
};

// ----------------------------------------------------------------------------
// 2. Collection Changes & History Deltas (§5.2)
// ----------------------------------------------------------------------------

export type DocumentChanges = {
	entities?: Readonly<Record<Id, Entity | undefined>>;
	entityOrder?: readonly Id[];
	layers?: readonly Layer[];
	groups?: readonly Group[];
	definitions?: Readonly<Record<Id, DeviceDefinition | undefined>>;
	assets?: Readonly<Record<Id, EmbeddedAsset | undefined>>;
	lines?: readonly ProductionLine[];
	relations?: readonly Relation[];
	name?: string;
	description?: string;
	displayUnit?: DisplayUnit;
	facility?: { widthMm: number; heightMm: number };
	grid?: {
		origin: Vec2;
		minorMm: number;
		majorEvery: number;
		visible: boolean;
	};
	metadata?: Readonly<Record<string, Json>>;
};

export type HistoryEntry = {
	id: Id;
	label: string;
	beforeChanges: DocumentChanges;
	afterChanges: DocumentChanges;
	affectedIds: readonly Id[];
	timestamp: IsoDate;
	serializedBytes?: number;
};

// ----------------------------------------------------------------------------
// 3. Reducer Outcome Discriminated Union (§5.1)
// ----------------------------------------------------------------------------

export type ReducerError = {
	code: string;
	message: string;
	entityIds?: readonly Id[];
	path?: string;
};

export type ReducerSuccess = {
	success: true;
	noChange?: false;
	document: BlueprintDocument;
	delta: DocumentDelta;
	issues?: readonly SpatialIssue[];
};

export type ReducerNoChange = {
	success: true;
	noChange: true;
	document: BlueprintDocument;
	delta?: never;
	issues?: readonly SpatialIssue[];
};

export type ReducerFailure = {
	success: false;
	noChange?: false;
	error: ReducerError;
};

export type ReducerResult = ReducerSuccess | ReducerNoChange | ReducerFailure;

// ----------------------------------------------------------------------------
// 4. Command Payloads (§5.1 Table)
// ----------------------------------------------------------------------------

export type DocumentRenameCommand = {
	type: "document.rename";
	name: string;
};

export type DocumentDescribeCommand = {
	type: "document.describe";
	description: string;
};

export type DocumentSettingsCommand = {
	type: "document.settings";
	settings: {
		displayUnit?: DisplayUnit;
		facility?: { widthMm: number; heightMm: number };
		grid?: {
			origin?: Vec2;
			minorMm?: number;
			majorEvery?: number;
			visible?: boolean;
		};
		metadata?: Readonly<Record<string, Json>>;
	};
};

export type EntityAddCommand = {
	type: "entity.add";
	entity: Entity;
	index?: number;
};

export type EntityUpdateCommand = {
	type: "entity.update";
	id: Id;
	patch: Partial<Base> & Record<string, unknown>;
};

export type EntityDeleteCommand = {
	type: "entity.delete";
	ids: readonly Id[];
};

export type SelectionTransformCommand = {
	type: "selection.transform";
	ids: readonly Id[];
	delta?: Vec2;
	rotationDeg?: number;
	pivot?: Vec2;
	dimensions?: Readonly<Record<Id, { width?: number; height?: number }>>;
};

export type SelectionDuplicateCommand = {
	type: "selection.duplicate";
	ids: readonly Id[];
	offsetMm?: Vec2;
};

export type SelectionAlignCommand = {
	type: "selection.align";
	ids: readonly Id[];
	alignment: "left" | "right" | "center" | "top" | "bottom" | "middle";
};

export type SelectionDistributeCommand = {
	type: "selection.distribute";
	ids: readonly Id[];
	axis: "horizontal" | "vertical";
};

export type GroupCreateCommand = {
	type: "group.create";
	ids: readonly Id[];
	name?: string;
};

export type GroupDissolveCommand = {
	type: "group.dissolve";
	groupIds: readonly Id[];
};

export type LayerAddCommand = {
	type: "layer.add";
	layer: Partial<Layer> & { name: string; id?: Id };
	index?: number;
};

export type LayerUpdateCommand = {
	type: "layer.update";
	id: Id;
	patch: Partial<Omit<Layer, "id" | "role">> & {
		name?: string;
		visible?: boolean;
		locked?: boolean;
		printable?: boolean;
		opacity?: number;
		parentId?: Id | null;
	};
};

export type LayerMoveCommand = {
	type: "layer.move";
	id: Id;
	targetParentId: Id | null;
	targetIndex: number;
};

export type LayerDeleteCommand = {
	type: "layer.delete";
	id: Id;
	mode: "deleteContents" | "moveContents";
	targetLayerId?: Id;
};

export type WallSetVerticesCommand = {
	type: "wall.setVertices";
	id: Id;
	vertices: readonly { id: Id; point: Vec2 }[];
	closed?: boolean;
};

export type OpeningAddCommand = {
	type: "opening.add";
	opening: OpeningEntity;
};

export type OpeningUpdateCommand = {
	type: "opening.update";
	id: Id;
	patch: Partial<
		Pick<
			OpeningEntity,
			| "offsetMm"
			| "widthMm"
			| "openingType"
			| "hinge"
			| "swing"
			| "segmentStartId"
			| "segmentEndId"
		>
	>;
};

export type ZoneSetPolygonCommand = {
	type: "zone.setPolygon";
	id: Id;
	polygon: Polygon;
};

export type DeviceParametersCommand = {
	type: "device.parameters";
	id: Id;
	parameters: Readonly<Record<string, number | string | boolean>>;
};

export type DeviceBindingCommand = {
	type: "device.binding";
	id: Id;
	bindings: readonly TelemetryBinding[];
};

export type DeviceUpgradeDefinitionCommand = {
	type: "device.upgradeDefinition";
	id: Id;
	definitionId: Id;
	parameters?: Readonly<Record<string, number | string | boolean>>;
};

export type RelationAddCommand = {
	type: "relation.add";
	relation: Relation;
};

export type RelationDeleteCommand = {
	type: "relation.delete";
	id: Id;
};

export type LineAddCommand = {
	type: "line.add";
	line: ProductionLine;
};

export type LineUpdateCommand = {
	type: "line.update";
	id: Id;
	patch: Partial<Omit<ProductionLine, "id">>;
};

export type LineDeleteCommand = {
	type: "line.delete";
	id: Id;
};

export type DimensionSetAnchorsCommand = {
	type: "dimension.setAnchors";
	id: Id;
	a: Anchor;
	b: Anchor;
};

export type AnnotationUpdateCommand = {
	type: "annotation.update";
	id: Id;
	patch: Partial<
		Pick<
			AnnotationEntity,
			"text" | "anchor" | "offsetMm" | "textHeightMm" | "annotationType"
		>
	>;
};

export type HistoryUndoCommand = {
	type: "history.undo";
};

export type HistoryRedoCommand = {
	type: "history.redo";
};

export type BatchCommand = {
	type: "batch";
	label?: string;
	commands: readonly BlueprintCommand[];
};

/**
 * Complete discriminated union of all Blueprint commands (§5.1).
 */
export type BlueprintCommand =
	| DocumentRenameCommand
	| DocumentDescribeCommand
	| DocumentSettingsCommand
	| EntityAddCommand
	| EntityUpdateCommand
	| EntityDeleteCommand
	| SelectionTransformCommand
	| SelectionDuplicateCommand
	| SelectionAlignCommand
	| SelectionDistributeCommand
	| GroupCreateCommand
	| GroupDissolveCommand
	| LayerAddCommand
	| LayerUpdateCommand
	| LayerMoveCommand
	| LayerDeleteCommand
	| WallSetVerticesCommand
	| OpeningAddCommand
	| OpeningUpdateCommand
	| ZoneSetPolygonCommand
	| DeviceParametersCommand
	| DeviceBindingCommand
	| DeviceUpgradeDefinitionCommand
	| RelationAddCommand
	| RelationDeleteCommand
	| LineAddCommand
	| LineUpdateCommand
	| LineDeleteCommand
	| DimensionSetAnchorsCommand
	| AnnotationUpdateCommand
	| HistoryUndoCommand
	| HistoryRedoCommand
	| BatchCommand;
