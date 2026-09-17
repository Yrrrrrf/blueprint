// ============================================================================
// Blueprint PaperRenderer Implementation (§6.2, §6.3, §6.4, §6.5)
// Complete implementation of RendererPort with PaperScope isolation,
// layer synchronization, delta updates, picking, snapping, and overlays.
// ============================================================================

import paper from "paper";
import type {
	BlueprintDocument,
	DeviceDefinition,
	DeviceEntity,
	Entity,
	Id,
	OpeningEntity,
	ShapeEntity,
	SpatialIssue,
	Transform,
	Vec2,
	WallEntity,
	ZoneEntity,
} from "@sdk/core";
import {
	createBlankDocument,
	deriveWallGeometry,
	findWallOpenings,
	getCatalogDefinition,
	polygonBounds,
	resolveDeviceDefinition,
	transformPolygon,
} from "@sdk/core";
import type { DocumentDelta } from "@sdk/core";

import {
	createDefaultCamera,
	fitToBounds,
	getScalePixelsPerMm,
} from "./camera.ts";
import {
	computeSelectionBounds,
	renderMarqueeOverlay,
	renderSelectionOverlay,
	renderSnapGuidesOverlay,
	renderSpatialIssuesOverlay,
} from "./overlays.ts";
import {
	computeEntityWorldBounds,
	pickAtPoint,
	SpatialIndex,
} from "./picking.ts";
import { IsolatedPaperScope } from "./scope.ts";
import {
	applyItemStyle,
	createGeometryItem,
	createPolygonItem,
	renderDeviceGroup,
	updateDeviceTelemetryStatus,
} from "./symbols.ts";
import type {
	AssetTelemetry,
	Camera,
	GesturePreview,
	PickPolicy,
	PickResult,
	RendererPort,
	RenderHandle,
	WorldBounds,
} from "./types.ts";
import type { CanvasElementLike } from "./scope.ts";

export type PaperRendererOptions = {
	canvas?: CanvasElementLike | unknown;
	width?: number;
	height?: number;
	document?: BlueprintDocument;
	camera?: Camera;
};

export class PaperRenderer implements RendererPort {
	private readonly _scopeWrapper: IsolatedPaperScope;
	private _doc: BlueprintDocument;
	private _camera: Camera;
	private _viewportSize: Vec2;
	private readonly _spatialIndex = new SpatialIndex();
	private readonly _handles = new Map<Id, RenderHandle>();
	private readonly _layerItems = new Map<Id, paper.Layer>();
	private _overlayLayer: paper.Layer | null = null;

	private _selectionIds: readonly Id[] = [];
	private _preview: GesturePreview | null = null;
	private _telemetry = new Map<Id, AssetTelemetry>();
	private _issues: readonly SpatialIssue[] = [];

	constructor(options: PaperRendererOptions = {}) {
		const target = options.canvas ?? {
			width: options.width ?? 800,
			height: options.height ?? 600,
		};

		this._scopeWrapper = new IsolatedPaperScope(target);
		this._viewportSize = {
			x: options.width ?? 800,
			y: options.height ?? 600,
		};
		this._doc = options.document ?? createBlankDocument();
		this._camera =
			options.camera ?? createDefaultCamera(this._doc.content.facility);

		this._scopeWrapper.execute((scope) => {
			if (scope.view) {
				scope.view.autoUpdate = false;
				scope.view.viewSize = new scope.Size(
					this._viewportSize.x,
					this._viewportSize.y,
				);
			}
		});

		this.setDocument(this._doc);
	}

	get scope(): IsolatedPaperScope {
		return this._scopeWrapper;
	}

	get viewportSize(): Vec2 {
		return { ...this._viewportSize };
	}

	setViewportSize(size: Vec2): void {
		if (size.x <= 0 || size.y <= 0) {
			// Zero dimension guard (§6.3, AC-028)
			return;
		}
		this._viewportSize = { x: size.x, y: size.y };
		this._scopeWrapper.execute((scope) => {
			if (scope.view) {
				scope.view.viewSize = new scope.Size(size.x, size.y);
				this._syncCameraToView(scope);
			}
		});
	}

	setDocument(doc: BlueprintDocument): void {
		this._doc = doc;
		this._spatialIndex.build(doc);

		this._scopeWrapper.execute((scope) => {
			if (!scope.project) return;

			// Clear all existing project layers and items
			scope.project.clear();
			this._handles.clear();
			this._layerItems.clear();

			// 1. Create document layers in specified order (§6.2)
			for (const docLayer of doc.content.layers) {
				const layer = new scope.Layer();
				layer.name = docLayer.id;
				layer.visible = docLayer.visible;
				layer.opacity = docLayer.opacity ?? 1.0;
				layer.locked = docLayer.locked;
				this._layerItems.set(docLayer.id, layer);
			}

			// 2. Build entities into layers
			for (const entityId of doc.content.entityOrder) {
				const entity = doc.content.entities[entityId];
				if (!entity) continue;
				this._renderEntityToLayer(scope, entity, doc);
			}

			// 3. Create dedicated top overlay layer (§6.2)
			this._overlayLayer = new scope.Layer();
			this._overlayLayer.name = "layer_overlays";

			this._rebuildOverlays(scope);
			this._syncCameraToView(scope);
		});
	}

	applyDelta(doc: BlueprintDocument, delta: DocumentDelta): void {
		this._doc = doc;

		this._scopeWrapper.execute((scope) => {
			if (!scope.project) return;

			// 1. Handle deleted entities
			for (const id of delta.deletedEntityIds) {
				this._spatialIndex.removeEntity(id);
				const handle = this._handles.get(id);
				if (handle?.paperItem) {
					(handle.paperItem as paper.Item).remove();
				}
				this._handles.delete(id);
			}

			// 2. Handle updated entities
			for (const id of delta.updatedEntityIds) {
				const entity = doc.content.entities[id];
				if (!entity) continue;

				this._spatialIndex.updateEntity(entity, doc);
				const existingHandle = this._handles.get(id);

				if (existingHandle?.paperItem) {
					const item = existingHandle.paperItem as paper.Item;
					// Update transform in place when safe (§6.2)
					item.applyMatrix = false;
					item.position = new scope.Point(
						entity.transform.x,
						entity.transform.y,
					);
					item.rotation = entity.transform.rotationDeg;
					existingHandle.bounds = computeEntityWorldBounds(entity, doc);
				} else {
					this._renderEntityToLayer(scope, entity, doc);
				}
			}

			// 3. Handle added entities
			for (const id of delta.addedEntityIds) {
				const entity = doc.content.entities[id];
				if (!entity) continue;
				this._spatialIndex.updateEntity(entity, doc);
				this._renderEntityToLayer(scope, entity, doc);
			}

			// 4. Synchronize layer changes
			if (delta.changedLayers) {
				const layerMap = new Map(doc.content.layers.map((l) => [l.id, l]));
				for (const layerId of delta.changedLayers) {
					const docLayer = layerMap.get(layerId);
					const paperLayer = this._layerItems.get(layerId);
					if (docLayer && paperLayer) {
						paperLayer.visible = docLayer.visible;
						paperLayer.opacity = docLayer.opacity ?? 1.0;
						paperLayer.locked = docLayer.locked;
					}
				}
			}

			this._rebuildOverlays(scope);
			if (scope.view) {
				scope.view.update();
			}
		});
	}

	setPreview(preview: GesturePreview | null): void {
		this._preview = preview;
		this._scopeWrapper.execute((scope) => {
			this._rebuildOverlays(scope);
			if (scope.view) {
				scope.view.update();
			}
		});
	}

	setSelection(ids: readonly Id[]): void {
		this._selectionIds = ids;
		this._scopeWrapper.execute((scope) => {
			this._rebuildOverlays(scope);
			if (scope.view) {
				scope.view.update();
			}
		});
	}

	setTelemetry(values: ReadonlyMap<Id, AssetTelemetry>): void {
		for (const [id, tel] of values.entries()) {
			this._telemetry.set(id, tel);
		}

		this._scopeWrapper.execute((scope) => {
			for (const [id, tel] of values.entries()) {
				const handle = this._handles.get(id);
				if (handle?.paperItem && (handle.paperItem as paper.Group).children) {
					updateDeviceTelemetryStatus(
						handle.paperItem as paper.Group,
						tel.status,
					);
				}
			}
			if (scope.view) {
				scope.view.update();
			}
		});
	}

	setIssues(issues: readonly SpatialIssue[]): void {
		this._issues = issues;
		this._scopeWrapper.execute((scope) => {
			this._rebuildOverlays(scope);
			if (scope.view) {
				scope.view.update();
			}
		});
	}

	setCamera(camera: Camera): void {
		const scale = Math.min(1000, Math.max(0.01, camera.scale));
		this._camera = {
			scale,
			centerMm: { x: camera.centerMm.x, y: camera.centerMm.y },
		};
		this._scopeWrapper.execute((scope) => {
			this._syncCameraToView(scope);
		});
	}

	getCamera(): Camera {
		return {
			scale: this._camera.scale,
			centerMm: { ...this._camera.centerMm },
		};
	}

	hitTest(viewPoint: Vec2, policy: PickPolicy): PickResult | null {
		return pickAtPoint(
			viewPoint,
			this._camera,
			this._viewportSize,
			this._doc,
			this._spatialIndex,
			policy,
		);
	}

	fit(bounds?: WorldBounds): void {
		const targetBounds = bounds ?? {
			minX: 0,
			minY: 0,
			maxX: this._doc.content.facility.widthMm,
			maxY: this._doc.content.facility.heightMm,
			width: this._doc.content.facility.widthMm,
			height: this._doc.content.facility.heightMm,
		};

		const newCamera = fitToBounds(
			targetBounds,
			this._viewportSize,
			32,
			this._camera,
		);
		this.setCamera(newCamera);
	}

	dispose(): void {
		this._scopeWrapper.dispose();
		this._handles.clear();
		this._layerItems.clear();
		this._overlayLayer = null;
		this._spatialIndex.clear();
		this._telemetry.clear();
	}

	// ----------------------------------------------------------------------------
	// Internal Scenegraph Helpers
	// ----------------------------------------------------------------------------

	private _syncCameraToView(scope: paper.PaperScope): void {
		if (!scope.view) return;
		const s = getScalePixelsPerMm(this._camera.scale);
		scope.view.zoom = s;
		scope.view.center = new scope.Point(
			this._camera.centerMm.x,
			this._camera.centerMm.y,
		);
		scope.view.update();
	}

	private _setupEntityTransform(
		scope: paper.PaperScope,
		item: paper.Item,
		transform: Transform,
		style?: any,
	): void {
		item.applyMatrix = false;
		if (style) {
			applyItemStyle(item, style);
		}
		item.pivot = new scope.Point(0, 0);
		item.position = new scope.Point(transform.x, transform.y);
		item.rotation = transform.rotationDeg;
	}

	private _renderEntityToLayer(
		scope: paper.PaperScope,
		entity: Entity,
		doc: BlueprintDocument,
	): void {
		const paperLayer = this._layerItems.get(entity.layerId);
		if (!paperLayer) return;

		paperLayer.activate();
		let item: paper.Item | null = null;

		switch (entity.kind) {
			case "shape": {
				item = createGeometryItem(scope, entity.geometry);
				this._setupEntityTransform(scope, item, entity.transform, entity.style);
				break;
			}
			case "device": {
				const rawDef =
					doc.content.definitions[entity.definitionId] ??
					getCatalogDefinition(entity.definitionId);
				if (rawDef) {
					const tel = this._telemetry.get(entity.id);
					item = renderDeviceGroup(scope, entity, rawDef, tel);
				}
				break;
			}
			case "zone": {
				item = createPolygonItem(scope, entity.polygon);
				this._setupEntityTransform(scope, item, entity.transform, entity.style);
				break;
			}
			case "wall": {
				const openings = findWallOpenings(doc.content.entities, entity.id);
				const wallPolys = deriveWallGeometry(entity, openings, false);
				if (wallPolys.length > 0) {
					const paths = wallPolys.map((p) => createPolygonItem(scope, p));
					item = new scope.CompoundPath({ children: paths, insert: false });
					this._setupEntityTransform(
						scope,
						item,
						entity.transform,
						entity.style,
					);
				}
				break;
			}
			default:
				break;
		}

		if (item) {
			paperLayer.addChild(item);
			const bounds = computeEntityWorldBounds(entity, doc);
			this._handles.set(entity.id, {
				entityId: entity.id,
				layerId: entity.layerId,
				paperItem: item,
				bounds,
			});
		}
	}

	private _rebuildOverlays(scope: paper.PaperScope): void {
		if (!this._overlayLayer) return;
		this._overlayLayer.activate();
		this._overlayLayer.removeChildren();

		// 1. Selection overlay
		if (this._selectionIds.length > 0) {
			const selBounds = computeSelectionBounds(this._selectionIds, this._doc);
			if (selBounds) {
				const selItem = renderSelectionOverlay(
					scope,
					selBounds,
					this._camera,
					this._viewportSize,
				);
				this._overlayLayer.addChild(selItem);
			}
		}

		// 2. Gesture preview guides and marquee
		if (this._preview) {
			if (this._preview.guides && this._preview.guides.length > 0) {
				const guidesItem = renderSnapGuidesOverlay(
					scope,
					this._preview.guides,
					this._camera,
				);
				this._overlayLayer.addChild(guidesItem);
			}
			if (this._preview.marquee) {
				const marqueeItem = renderMarqueeOverlay(scope, this._preview.marquee);
				this._overlayLayer.addChild(marqueeItem);
			}
		}

		// 3. Spatial issues
		if (this._issues.length > 0) {
			const issuesItem = renderSpatialIssuesOverlay(
				scope,
				this._issues,
				this._doc,
			);
			this._overlayLayer.addChild(issuesItem);
		}
	}
}
