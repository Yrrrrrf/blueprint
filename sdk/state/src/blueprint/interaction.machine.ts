// ============================================================================
// Blueprint Interaction Machine (§7.1, §7.2, §7.3 of Blueprint Specification)
// Pure XState v5 statechart orchestrating editor and preview modes,
// tools, gestures, drafting workflows, and pointer/touch transitions.
// ============================================================================

import { enqueueActions, setup } from "xstate";
import { isRingSelfIntersecting } from "@sdk/core";

export interface InteractionMachineContext {
	mode: "editor" | "preview";
	tool: string;
	lastEditorTool: string;
	selectedIds: readonly string[];
	hoveredId: string | null;
	activeHandle: string | null;
	startPoint: { x: number; y: number } | null;
	currentPoint: { x: number; y: number } | null;
	startWorldPoint: { x: number; y: number } | null;
	currentWorldPoint: { x: number; y: number } | null;
	dragDelta: { x: number; y: number };
	draftVertices: readonly { x: number; y: number }[];
	draftWallId: string | null;
	draftOffsetMm: number | null;
	activeCatalogDefinitionId: string | null;
	ghostRotationDeg: number;
	dimensionAnchors: readonly { x: number; y: number }[];
	editingEntityId: string | null;
	editingVertexId: string | null;
	pinchStart: { distance: number; center: { x: number; y: number } } | null;
	isAltDown: boolean;
	isShiftDown: boolean;
	isSpaceDown: boolean;
	lastErrorMessage: string | null;
}

export interface InteractionMachineInput {
	initialMode?: "editor" | "preview";
	initialTool?: string;
	initialSelection?: readonly string[];
}

export interface PointerDownPayload {
	point: { x: number; y: number };
	worldPoint: { x: number; y: number };
	hitEntityId?: string | null;
	hitHandle?: string | null;
	button?: number;
	shiftKey?: boolean;
	altKey?: boolean;
	ctrlKey?: boolean;
	metaKey?: boolean;
}

export type InteractionMachineEvent =
	| { type: "SET_MODE"; mode: "editor" | "preview" }
	| { type: "START" }
	| { type: "STOP" }
	| { type: "SET_TOOL"; tool: string }
	| { type: "SELECT"; ids: readonly string[]; toggle?: boolean }
	| { type: "CLEAR_SELECTION" }
	| { type: "HOVER"; id: string | null }
	| ({ type: "POINTER_DOWN" } & PointerDownPayload)
	| {
			type: "POINTER_MOVE";
			point: { x: number; y: number };
			worldPoint: { x: number; y: number };
			shiftKey?: boolean;
			altKey?: boolean;
	  }
	| {
			type: "POINTER_UP";
			point?: { x: number; y: number };
			worldPoint?: { x: number; y: number };
	  }
	| { type: "POINTER_CANCEL" }
	| {
			type: "DOUBLE_CLICK";
			point: { x: number; y: number };
			worldPoint: { x: number; y: number };
			hitEntityId?: string | null;
	  }
	| {
			type: "KEY_DOWN";
			key: string;
			shiftKey?: boolean;
			altKey?: boolean;
			ctrlKey?: boolean;
			metaKey?: boolean;
	  }
	| { type: "KEY_UP"; key: string }
	| { type: "TOUCH_START"; touches: readonly { x: number; y: number }[] }
	| { type: "TOUCH_MOVE"; touches: readonly { x: number; y: number }[] }
	| { type: "TOUCH_END"; touches: readonly { x: number; y: number }[] }
	| { type: "SET_CATALOG_DEFINITION"; definitionId: string }
	| { type: "ROTATE_GHOST"; deltaDeg?: number }
	| { type: "COMMIT_DRAFT" }
	| { type: "CANCEL" }
	| { type: "DOCUMENT_REPLACED" }
	| { type: "SET_ERROR"; message: string };

export type InteractionEmittedEvent =
	| { type: "SELECTION_CHANGED"; selectedIds: readonly string[] }
	| { type: "TOOL_CHANGED"; tool: string }
	| { type: "MODE_CHANGED"; mode: "editor" | "preview" }
	| {
			type: "TRANSACTION_START";
			operation: string;
			entityIds: readonly string[];
	  }
	| { type: "PREVIEW_UPDATE"; preview: any }
	| { type: "COMMIT_COMMAND"; command: any }
	| { type: "CANCEL_GESTURE" }
	| { type: "CAMERA_PAN"; delta: { x: number; y: number } }
	| {
			type: "CAMERA_PINCH";
			zoomFactor: number;
			center: { x: number; y: number };
	  }
	| {
			type: "NOTIFICATION";
			message: string;
			severity?: "info" | "warning" | "error";
	  }
	| { type: "RELEASE_CAPTURE" };

export type InteractionEvent = InteractionMachineEvent;

export const interactionMachine = setup({
	types: {
		context: {} as InteractionMachineContext,
		events: {} as InteractionMachineEvent,
		input: {} as InteractionMachineInput,
		emitted: {} as InteractionEmittedEvent,
	},
}).createMachine({
	id: "blueprintInteraction",
	initial: "editor",
	context: ({ input }) => ({
		mode: input.initialMode ?? "editor",
		tool: input.initialTool ?? "select",
		lastEditorTool: input.initialTool ?? "select",
		selectedIds: input.initialSelection ?? [],
		hoveredId: null,
		activeHandle: null,
		startPoint: null,
		currentPoint: null,
		startWorldPoint: null,
		currentWorldPoint: null,
		dragDelta: { x: 0, y: 0 },
		draftVertices: [],
		draftWallId: null,
		draftOffsetMm: null,
		activeCatalogDefinitionId: "def-cnc-v1",
		ghostRotationDeg: 0,
		dimensionAnchors: [],
		editingEntityId: null,
		editingVertexId: null,
		pinchStart: null,
		isAltDown: false,
		isShiftDown: false,
		isSpaceDown: false,
		lastErrorMessage: null,
	}),
	on: {
		SET_MODE: [
			{
				guard: ({ event }) => event.mode === "preview",
				target: ".preview.idle",
				actions: enqueueActions(({ context, enqueue }) => {
					enqueue.assign({
						lastEditorTool: context.tool,
						mode: "preview",
						selectedIds: [],
						activeHandle: null,
						draftVertices: [],
						dimensionAnchors: [],
						editingEntityId: null,
					});
					enqueue.emit({ type: "CANCEL_GESTURE" });
					enqueue.emit({ type: "MODE_CHANGED", mode: "preview" });
					enqueue.emit({ type: "SELECTION_CHANGED", selectedIds: [] });
				}),
			},
			{
				guard: ({ event }) => event.mode === "editor",
				target: ".editor.idle",
				actions: enqueueActions(({ context, enqueue }) => {
					enqueue.assign({
						tool: context.lastEditorTool || "select",
						mode: "editor",
						draftVertices: [],
						dimensionAnchors: [],
						editingEntityId: null,
					});
					enqueue.emit({ type: "MODE_CHANGED", mode: "editor" });
					enqueue.emit({
						type: "TOOL_CHANGED",
						tool: context.lastEditorTool || "select",
					});
				}),
			},
		],
		DOCUMENT_REPLACED: {
			target: ".editor.idle",
			actions: enqueueActions(({ enqueue }) => {
				enqueue.assign({
					selectedIds: [],
					hoveredId: null,
					activeHandle: null,
					startPoint: null,
					currentPoint: null,
					draftVertices: [],
					dimensionAnchors: [],
					editingEntityId: null,
					editingVertexId: null,
				});
				enqueue.emit({ type: "CANCEL_GESTURE" });
				enqueue.emit({ type: "SELECTION_CHANGED", selectedIds: [] });
			}),
		},
		TOUCH_START: {
			guard: ({ event }) => event.touches.length >= 2,
			target: ".editor.pinching",
			actions: enqueueActions(({ event, enqueue }) => {
				const [t1, t2] = event.touches;
				const dist = Math.hypot(t2.x - t1.x, t2.y - t1.y);
				const center = { x: (t1.x + t2.x) / 2, y: (t1.y + t2.y) / 2 };
				enqueue.assign({ pinchStart: { distance: dist, center } });
				enqueue.emit({ type: "CANCEL_GESTURE" });
			}),
		},
		HOVER: {
			actions: enqueueActions(({ event, enqueue }) => {
				enqueue.assign({ hoveredId: event.id });
			}),
		},
		SET_CATALOG_DEFINITION: {
			actions: enqueueActions(({ event, enqueue }) => {
				enqueue.assign({ activeCatalogDefinitionId: event.definitionId });
			}),
		},
		ROTATE_GHOST: {
			actions: enqueueActions(({ context, event, enqueue }) => {
				const delta = event.deltaDeg ?? 15;
				const nextDeg = (context.ghostRotationDeg + delta) % 360;
				enqueue.assign({ ghostRotationDeg: nextDeg });
			}),
		},
		KEY_DOWN: {
			actions: enqueueActions(({ event, enqueue }) => {
				enqueue.assign({
					isShiftDown: Boolean(event.shiftKey),
					isAltDown: Boolean(event.altKey),
					isSpaceDown: event.key === " ",
				});
			}),
		},
		KEY_UP: {
			actions: enqueueActions(({ event, enqueue }) => {
				if (event.key === "Shift") enqueue.assign({ isShiftDown: false });
				if (event.key === "Alt") enqueue.assign({ isAltDown: false });
				if (event.key === " ") enqueue.assign({ isSpaceDown: false });
			}),
		},
	},
	states: {
		editor: {
			initial: "idle",
			on: {
				SET_TOOL: [
					{
						guard: ({ event }) => event.tool === "device",
						target: ".devicePlacing",
						actions: enqueueActions(({ event, enqueue }) => {
							enqueue.assign({
								tool: event.tool,
								lastEditorTool: event.tool,
							});
							enqueue.emit({ type: "TOOL_CHANGED", tool: event.tool });
						}),
					},
					{
						guard: ({ event }) => event.tool === "opening",
						target: ".openingPlacing",
						actions: enqueueActions(({ event, enqueue }) => {
							enqueue.assign({
								tool: event.tool,
								lastEditorTool: event.tool,
							});
							enqueue.emit({ type: "TOOL_CHANGED", tool: event.tool });
						}),
					},
					{
						target: ".idle",
						actions: enqueueActions(({ event, enqueue }) => {
							enqueue.assign({
								tool: event.tool,
								lastEditorTool: event.tool,
							});
							enqueue.emit({ type: "TOOL_CHANGED", tool: event.tool });
						}),
					},
				],
			},
			states: {
				idle: {
					on: {
						SELECT: {
							actions: enqueueActions(({ context, event, enqueue }) => {
								let nextSelection: readonly string[];
								if (event.toggle) {
									const set = new Set(context.selectedIds);
									for (const id of event.ids) {
										if (set.has(id)) set.delete(id);
										else set.add(id);
									}
									nextSelection = Array.from(set);
								} else {
									nextSelection = [...event.ids];
								}
								enqueue.assign({ selectedIds: nextSelection });
								enqueue.emit({
									type: "SELECTION_CHANGED",
									selectedIds: nextSelection,
								});
							}),
						},
						CLEAR_SELECTION: {
							actions: enqueueActions(({ enqueue }) => {
								enqueue.assign({ selectedIds: [] });
								enqueue.emit({ type: "SELECTION_CHANGED", selectedIds: [] });
							}),
						},
						DOUBLE_CLICK: {
							guard: ({ event }) => Boolean(event.hitEntityId),
							target: "vertexEditing",
							actions: enqueueActions(({ event, enqueue }) => {
								enqueue.assign({
									editingEntityId: event.hitEntityId ?? null,
								});
							}),
						},
						POINTER_DOWN: [
							// Handle clicked
							{
								guard: ({ event }) => Boolean(event.hitHandle),
								target: "resizing",
								actions: enqueueActions(({ event, enqueue }) => {
									enqueue.assign({
										activeHandle: event.hitHandle ?? null,
										startPoint: event.point,
										startWorldPoint: event.worldPoint,
										currentPoint: event.point,
										currentWorldPoint: event.worldPoint,
										dragDelta: { x: 0, y: 0 },
									});
								}),
							},
							// Tool: Pan or space held
							{
								guard: ({ context }) =>
									context.tool === "pan" || context.isSpaceDown,
								target: "panning",
								actions: enqueueActions(({ event, enqueue }) => {
									enqueue.assign({
										startPoint: event.point,
										currentPoint: event.point,
									});
								}),
							},
							// Tool: Wall
							{
								guard: ({ context }) => context.tool === "wall",
								target: "wallDrawing",
								actions: enqueueActions(({ event, enqueue }) => {
									enqueue.assign({
										draftVertices: [event.worldPoint],
										startPoint: event.point,
										currentPoint: event.point,
										currentWorldPoint: event.worldPoint,
									});
								}),
							},
							// Tool: Zone
							{
								guard: ({ context }) => context.tool === "zone",
								target: "zoneDrawing",
								actions: enqueueActions(({ event, enqueue }) => {
									enqueue.assign({
										draftVertices: [event.worldPoint],
										startPoint: event.point,
										currentPoint: event.point,
										currentWorldPoint: event.worldPoint,
									});
								}),
							},
							// Tool: Opening
							{
								guard: ({ context }) => context.tool === "opening",
								target: "openingPlacing",
								actions: enqueueActions(({ event, enqueue }) => {
									enqueue.assign({
										startWorldPoint: event.worldPoint,
										currentWorldPoint: event.worldPoint,
									});
								}),
							},
							// Tool: Device
							{
								guard: ({ context }) => context.tool === "device",
								target: "devicePlacing",
								actions: enqueueActions(({ event, enqueue }) => {
									enqueue.assign({
										startWorldPoint: event.worldPoint,
										currentWorldPoint: event.worldPoint,
									});
								}),
							},
							// Tool: Dimension
							{
								guard: ({ context }) => context.tool === "dimension",
								target: "dimensionDrawing",
								actions: enqueueActions(({ event, enqueue }) => {
									enqueue.assign({
										dimensionAnchors: [event.worldPoint],
										startWorldPoint: event.worldPoint,
										currentWorldPoint: event.worldPoint,
									});
								}),
							},
							// Tool: Annotation
							{
								guard: ({ context }) => context.tool === "annotation",
								target: "annotationPlacing",
								actions: enqueueActions(({ event, enqueue }) => {
									enqueue.assign({
										startWorldPoint: event.worldPoint,
										currentWorldPoint: event.worldPoint,
										editingEntityId: event.hitEntityId ?? null,
									});
								}),
							},
							// Entity clicked in select tool
							{
								guard: ({ event }) => Boolean(event.hitEntityId),
								target: "pressed",
								actions: enqueueActions(({ context, event, enqueue }) => {
									const id = event.hitEntityId!;
									let nextSelection: readonly string[];
									if (event.shiftKey) {
										const set = new Set(context.selectedIds);
										if (set.has(id)) set.delete(id);
										else set.add(id);
										nextSelection = Array.from(set);
									} else if (context.selectedIds.includes(id)) {
										nextSelection = context.selectedIds;
									} else {
										nextSelection = [id];
									}
									enqueue.assign({
										selectedIds: nextSelection,
										startPoint: event.point,
										startWorldPoint: event.worldPoint,
										currentPoint: event.point,
										currentWorldPoint: event.worldPoint,
										dragDelta: { x: 0, y: 0 },
									});
									enqueue.emit({
										type: "SELECTION_CHANGED",
										selectedIds: nextSelection,
									});
								}),
							},
							// Background clicked in select tool -> Marquee
							{
								target: "marquee",
								actions: enqueueActions(({ event, enqueue }) => {
									if (!event.shiftKey) {
										enqueue.assign({ selectedIds: [] });
										enqueue.emit({
											type: "SELECTION_CHANGED",
											selectedIds: [],
										});
									}
									enqueue.assign({
										startPoint: event.point,
										startWorldPoint: event.worldPoint,
										currentPoint: event.point,
										currentWorldPoint: event.worldPoint,
									});
								}),
							},
						],
					},
				},

				pressed: {
					on: {
						POINTER_MOVE: {
							guard: ({ context, event }) => {
								if (!context.startPoint) return false;
								const dist = Math.hypot(
									event.point.x - context.startPoint.x,
									event.point.y - context.startPoint.y,
								);
								return dist >= 3;
							},
							target: "moving",
							actions: enqueueActions(({ context, event, enqueue }) => {
								enqueue.assign({
									currentPoint: event.point,
									currentWorldPoint: event.worldPoint,
									dragDelta: {
										x: event.worldPoint.x - (context.startWorldPoint?.x ?? 0),
										y: event.worldPoint.y - (context.startWorldPoint?.y ?? 0),
									},
								});
								enqueue.emit({
									type: "TRANSACTION_START",
									operation: "move",
									entityIds: context.selectedIds,
								});
							}),
						},
						POINTER_UP: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.assign({
									startPoint: null,
									startWorldPoint: null,
								});
							}),
						},
						POINTER_CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.assign({
									startPoint: null,
									startWorldPoint: null,
								});
							}),
						},
						CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.assign({
									startPoint: null,
									startWorldPoint: null,
								});
							}),
						},
					},
				},

				moving: {
					on: {
						POINTER_MOVE: {
							actions: enqueueActions(({ context, event, enqueue }) => {
								const delta = {
									x: event.worldPoint.x - (context.startWorldPoint?.x ?? 0),
									y: event.worldPoint.y - (context.startWorldPoint?.y ?? 0),
								};
								enqueue.assign({
									currentPoint: event.point,
									currentWorldPoint: event.worldPoint,
									dragDelta: delta,
								});
								enqueue.emit({
									type: "PREVIEW_UPDATE",
									preview: {
										kind: "transform",
										ids: context.selectedIds,
										delta,
									},
								});
							}),
						},
						POINTER_UP: {
							target: "idle",
							actions: enqueueActions(({ context, enqueue }) => {
								enqueue.emit({
									type: "COMMIT_COMMAND",
									command: {
										type: "selection.transform",
										ids: context.selectedIds,
										delta: context.dragDelta,
									},
								});
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({
									startPoint: null,
									startWorldPoint: null,
									dragDelta: { x: 0, y: 0 },
								});
							}),
						},
						POINTER_CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "CANCEL_GESTURE" });
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({
									startPoint: null,
									startWorldPoint: null,
									dragDelta: { x: 0, y: 0 },
								});
							}),
						},
						CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "CANCEL_GESTURE" });
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({
									startPoint: null,
									startWorldPoint: null,
									dragDelta: { x: 0, y: 0 },
								});
							}),
						},
					},
				},

				resizing: {
					on: {
						POINTER_MOVE: {
							actions: enqueueActions(({ context, event, enqueue }) => {
								const delta = {
									x: event.worldPoint.x - (context.startWorldPoint?.x ?? 0),
									y: event.worldPoint.y - (context.startWorldPoint?.y ?? 0),
								};
								enqueue.assign({
									currentPoint: event.point,
									currentWorldPoint: event.worldPoint,
									dragDelta: delta,
								});
								enqueue.emit({
									type: "PREVIEW_UPDATE",
									preview: {
										kind: "resize",
										ids: context.selectedIds,
										handle: context.activeHandle,
										delta,
										shiftKey: event.shiftKey,
									},
								});
							}),
						},
						POINTER_UP: {
							target: "idle",
							actions: enqueueActions(({ context, enqueue }) => {
								enqueue.emit({
									type: "COMMIT_COMMAND",
									command: {
										type: "selection.resize",
										ids: context.selectedIds,
										handle: context.activeHandle,
										delta: context.dragDelta,
										shiftKey: context.isShiftDown,
									},
								});
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({
									activeHandle: null,
									startPoint: null,
									startWorldPoint: null,
									dragDelta: { x: 0, y: 0 },
								});
							}),
						},
						POINTER_CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "CANCEL_GESTURE" });
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({
									activeHandle: null,
									startPoint: null,
									startWorldPoint: null,
									dragDelta: { x: 0, y: 0 },
								});
							}),
						},
						CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "CANCEL_GESTURE" });
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({
									activeHandle: null,
									startPoint: null,
									startWorldPoint: null,
									dragDelta: { x: 0, y: 0 },
								});
							}),
						},
					},
				},

				rotating: {
					on: {
						POINTER_MOVE: {
							actions: enqueueActions(({ context, event, enqueue }) => {
								enqueue.assign({
									currentPoint: event.point,
									currentWorldPoint: event.worldPoint,
								});
								enqueue.emit({
									type: "PREVIEW_UPDATE",
									preview: {
										kind: "rotate",
										ids: context.selectedIds,
										currentPoint: event.worldPoint,
										shiftKey: event.shiftKey,
									},
								});
							}),
						},
						POINTER_UP: {
							target: "idle",
							actions: enqueueActions(({ context, enqueue }) => {
								enqueue.emit({
									type: "COMMIT_COMMAND",
									command: {
										type: "selection.transform",
										ids: context.selectedIds,
									},
								});
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({
									activeHandle: null,
									startPoint: null,
									startWorldPoint: null,
								});
							}),
						},
						POINTER_CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "CANCEL_GESTURE" });
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({
									activeHandle: null,
									startPoint: null,
									startWorldPoint: null,
								});
							}),
						},
						CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "CANCEL_GESTURE" });
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({
									activeHandle: null,
									startPoint: null,
									startWorldPoint: null,
								});
							}),
						},
					},
				},

				marquee: {
					on: {
						POINTER_MOVE: {
							actions: enqueueActions(({ context, event, enqueue }) => {
								enqueue.assign({
									currentPoint: event.point,
									currentWorldPoint: event.worldPoint,
								});
								enqueue.emit({
									type: "PREVIEW_UPDATE",
									preview: {
										kind: "marquee",
										start: context.startWorldPoint,
										current: event.worldPoint,
									},
								});
							}),
						},
						POINTER_UP: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({
									startPoint: null,
									startWorldPoint: null,
								});
							}),
						},
						POINTER_CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "CANCEL_GESTURE" });
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({
									startPoint: null,
									startWorldPoint: null,
								});
							}),
						},
						CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "CANCEL_GESTURE" });
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({
									startPoint: null,
									startWorldPoint: null,
								});
							}),
						},
					},
				},

				wallDrawing: {
					on: {
						POINTER_MOVE: {
							actions: enqueueActions(({ context, event, enqueue }) => {
								enqueue.assign({
									currentPoint: event.point,
									currentWorldPoint: event.worldPoint,
								});
								enqueue.emit({
									type: "PREVIEW_UPDATE",
									preview: {
										kind: "wall_preview",
										vertices: context.draftVertices,
										cursor: event.worldPoint,
									},
								});
							}),
						},
						POINTER_DOWN: [
							// Check closing wall by clicking near first vertex
							{
								guard: ({ context, event }) => {
									if (context.draftVertices.length < 2) return false;
									const first = context.draftVertices[0];
									// Distance check within 8 px or 500 mm
									const dist = Math.hypot(
										event.worldPoint.x - first.x,
										event.worldPoint.y - first.y,
									);
									return dist <= 500;
								},
								target: "idle",
								actions: enqueueActions(({ context, enqueue }) => {
									enqueue.emit({
										type: "COMMIT_COMMAND",
										command: {
											type: "wall.create",
											vertices: context.draftVertices,
											closed: true,
										},
									});
									enqueue.assign({ draftVertices: [] });
								}),
							},
							// Add next vertex
							{
								actions: enqueueActions(({ context, event, enqueue }) => {
									const updated = [...context.draftVertices, event.worldPoint];
									enqueue.assign({ draftVertices: updated });
								}),
							},
						],
						DOUBLE_CLICK: {
							guard: ({ context }) => context.draftVertices.length >= 2,
							target: "idle",
							actions: enqueueActions(({ context, enqueue }) => {
								enqueue.emit({
									type: "COMMIT_COMMAND",
									command: {
										type: "wall.create",
										vertices: context.draftVertices,
										closed: false,
									},
								});
								enqueue.assign({ draftVertices: [] });
							}),
						},
						KEY_DOWN: [
							{
								guard: ({ event, context }) =>
									event.key === "Enter" && context.draftVertices.length >= 2,
								target: "idle",
								actions: enqueueActions(({ context, enqueue }) => {
									enqueue.emit({
										type: "COMMIT_COMMAND",
										command: {
											type: "wall.create",
											vertices: context.draftVertices,
											closed: false,
										},
									});
									enqueue.assign({ draftVertices: [] });
								}),
							},
							{
								guard: ({ event }) => event.key === "Escape",
								target: "idle",
								actions: enqueueActions(({ enqueue }) => {
									enqueue.assign({ draftVertices: [] });
									enqueue.emit({ type: "CANCEL_GESTURE" });
								}),
							},
						],
						CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.assign({ draftVertices: [] });
								enqueue.emit({ type: "CANCEL_GESTURE" });
							}),
						},
					},
				},

				zoneDrawing: {
					on: {
						POINTER_MOVE: {
							actions: enqueueActions(({ context, event, enqueue }) => {
								enqueue.assign({
									currentPoint: event.point,
									currentWorldPoint: event.worldPoint,
								});
								enqueue.emit({
									type: "PREVIEW_UPDATE",
									preview: {
										kind: "zone_preview",
										vertices: context.draftVertices,
										cursor: event.worldPoint,
									},
								});
							}),
						},
						POINTER_DOWN: [
							// Check closing zone by clicking near first vertex
							{
								guard: ({ context, event }) => {
									if (context.draftVertices.length < 3) return false;
									const first = context.draftVertices[0];
									const dist = Math.hypot(
										event.worldPoint.x - first.x,
										event.worldPoint.y - first.y,
									);
									return dist <= 500;
								},
								actions: enqueueActions(({ context, enqueue }) => {
									if (isRingSelfIntersecting(context.draftVertices)) {
										enqueue.emit({
											type: "NOTIFICATION",
											message: "Self-intersecting polygon cannot be committed",
											severity: "error",
										});
									} else {
										enqueue.emit({
											type: "COMMIT_COMMAND",
											command: {
												type: "zone.create",
												vertices: context.draftVertices,
											},
										});
										enqueue.assign({ draftVertices: [] });
									}
								}),
								target: "idle",
							},
							// Add next vertex
							{
								actions: enqueueActions(({ context, event, enqueue }) => {
									const updated = [...context.draftVertices, event.worldPoint];
									enqueue.assign({ draftVertices: updated });
								}),
							},
						],
						DOUBLE_CLICK: {
							guard: ({ context }) => context.draftVertices.length >= 3,
							target: "idle",
							actions: enqueueActions(({ context, enqueue }) => {
								if (isRingSelfIntersecting(context.draftVertices)) {
									enqueue.emit({
										type: "NOTIFICATION",
										message: "Self-intersecting polygon cannot be committed",
										severity: "error",
									});
								} else {
									enqueue.emit({
										type: "COMMIT_COMMAND",
										command: {
											type: "zone.create",
											vertices: context.draftVertices,
										},
									});
									enqueue.assign({ draftVertices: [] });
								}
							}),
						},
						KEY_DOWN: [
							{
								guard: ({ event, context }) =>
									event.key === "Enter" && context.draftVertices.length >= 3,
								target: "idle",
								actions: enqueueActions(({ context, enqueue }) => {
									if (isRingSelfIntersecting(context.draftVertices)) {
										enqueue.emit({
											type: "NOTIFICATION",
											message: "Self-intersecting polygon cannot be committed",
											severity: "error",
										});
									} else {
										enqueue.emit({
											type: "COMMIT_COMMAND",
											command: {
												type: "zone.create",
												vertices: context.draftVertices,
											},
										});
										enqueue.assign({ draftVertices: [] });
									}
								}),
							},
							{
								guard: ({ event }) => event.key === "Escape",
								target: "idle",
								actions: enqueueActions(({ enqueue }) => {
									enqueue.assign({ draftVertices: [] });
									enqueue.emit({ type: "CANCEL_GESTURE" });
								}),
							},
						],
						CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.assign({ draftVertices: [] });
								enqueue.emit({ type: "CANCEL_GESTURE" });
							}),
						},
					},
				},

				openingPlacing: {
					on: {
						POINTER_MOVE: {
							actions: enqueueActions(({ event, enqueue }) => {
								enqueue.assign({ currentWorldPoint: event.worldPoint });
								enqueue.emit({
									type: "PREVIEW_UPDATE",
									preview: {
										kind: "opening_preview",
										cursor: event.worldPoint,
									},
								});
							}),
						},
						POINTER_DOWN: {
							actions: enqueueActions(({ context, event, enqueue }) => {
								// Emits command if fit is valid; otherwise notifies error
								if (context.draftWallId && context.draftOffsetMm !== null) {
									enqueue.emit({
										type: "COMMIT_COMMAND",
										command: {
											type: "opening.create",
											wallId: context.draftWallId,
											offsetMm: context.draftOffsetMm,
										},
									});
								} else {
									enqueue.emit({
										type: "NOTIFICATION",
										message: "Invalid fit: opening exceeds wall segment",
										severity: "error",
									});
								}
							}),
							target: "idle",
						},
						KEY_DOWN: {
							guard: ({ event }) => event.key === "Escape",
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "CANCEL_GESTURE" });
							}),
						},
						CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "CANCEL_GESTURE" });
							}),
						},
					},
				},

				devicePlacing: {
					on: {
						POINTER_MOVE: {
							actions: enqueueActions(({ context, event, enqueue }) => {
								enqueue.assign({ currentWorldPoint: event.worldPoint });
								enqueue.emit({
									type: "PREVIEW_UPDATE",
									preview: {
										kind: "device_ghost",
										definitionId: context.activeCatalogDefinitionId,
										position: event.worldPoint,
										rotationDeg: context.ghostRotationDeg,
									},
								});
							}),
						},
						KEY_DOWN: [
							{
								guard: ({ event }) => event.key === "r" || event.key === "R",
								actions: enqueueActions(({ context, enqueue }) => {
									const nextDeg = (context.ghostRotationDeg + 15) % 360;
									enqueue.assign({ ghostRotationDeg: nextDeg });
									enqueue.emit({
										type: "PREVIEW_UPDATE",
										preview: {
											kind: "device_ghost",
											definitionId: context.activeCatalogDefinitionId,
											position: context.currentWorldPoint,
											rotationDeg: nextDeg,
										},
									});
								}),
							},
							{
								guard: ({ event }) => event.key === "Escape",
								target: "idle",
								actions: enqueueActions(({ enqueue }) => {
									enqueue.assign({ tool: "select" });
									enqueue.emit({ type: "TOOL_CHANGED", tool: "select" });
									enqueue.emit({ type: "CANCEL_GESTURE" });
								}),
							},
						],
						POINTER_DOWN: {
							actions: enqueueActions(({ context, event, enqueue }) => {
								enqueue.emit({
									type: "COMMIT_COMMAND",
									command: {
										type: "device.place",
										definitionId: context.activeCatalogDefinitionId,
										position: event.worldPoint,
										rotationDeg: context.ghostRotationDeg,
									},
								});
							}),
							// Remains in devicePlacing ready for repeated placement (§7.3)
						},
						CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.assign({ tool: "select" });
								enqueue.emit({ type: "TOOL_CHANGED", tool: "select" });
								enqueue.emit({ type: "CANCEL_GESTURE" });
							}),
						},
					},
				},

				dimensionDrawing: {
					on: {
						POINTER_MOVE: {
							actions: enqueueActions(({ context, event, enqueue }) => {
								enqueue.assign({ currentWorldPoint: event.worldPoint });
								enqueue.emit({
									type: "PREVIEW_UPDATE",
									preview: {
										kind: "dimension_preview",
										anchors: context.dimensionAnchors,
										cursor: event.worldPoint,
									},
								});
							}),
						},
						POINTER_DOWN: [
							// First anchor
							{
								guard: ({ context }) => context.dimensionAnchors.length === 0,
								actions: enqueueActions(({ event, enqueue }) => {
									enqueue.assign({ dimensionAnchors: [event.worldPoint] });
								}),
							},
							// Second anchor
							{
								guard: ({ context }) => context.dimensionAnchors.length === 1,
								actions: enqueueActions(({ context, event, enqueue }) => {
									enqueue.assign({
										dimensionAnchors: [
											context.dimensionAnchors[0],
											event.worldPoint,
										],
									});
								}),
							},
							// Third click sets offset and commits
							{
								guard: ({ context }) => context.dimensionAnchors.length === 2,
								target: "idle",
								actions: enqueueActions(({ context, event, enqueue }) => {
									enqueue.emit({
										type: "COMMIT_COMMAND",
										command: {
											type: "dimension.create",
											anchorA: context.dimensionAnchors[0],
											anchorB: context.dimensionAnchors[1],
											offsetPoint: event.worldPoint,
										},
									});
									enqueue.assign({ dimensionAnchors: [] });
								}),
							},
						],
						KEY_DOWN: [
							// Enter after second anchor uses default 500 mm offset (§7.3, AC-037)
							{
								guard: ({ event, context }) =>
									event.key === "Enter" &&
									context.dimensionAnchors.length === 2,
								target: "idle",
								actions: enqueueActions(({ context, enqueue }) => {
									enqueue.emit({
										type: "COMMIT_COMMAND",
										command: {
											type: "dimension.create",
											anchorA: context.dimensionAnchors[0],
											anchorB: context.dimensionAnchors[1],
											offsetMm: 500,
										},
									});
									enqueue.assign({ dimensionAnchors: [] });
								}),
							},
							{
								guard: ({ event }) => event.key === "Escape",
								target: "idle",
								actions: enqueueActions(({ enqueue }) => {
									enqueue.assign({ dimensionAnchors: [] });
									enqueue.emit({ type: "CANCEL_GESTURE" });
								}),
							},
						],
						CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.assign({ dimensionAnchors: [] });
								enqueue.emit({ type: "CANCEL_GESTURE" });
							}),
						},
					},
				},

				annotationPlacing: {
					on: {
						POINTER_DOWN: {
							actions: enqueueActions(({ event, enqueue }) => {
								enqueue.assign({
									startWorldPoint: event.worldPoint,
									editingEntityId: event.hitEntityId ?? null,
								});
							}),
						},
						COMMIT_DRAFT: {
							target: "idle",
							actions: enqueueActions(({ context, enqueue }) => {
								enqueue.emit({
									type: "COMMIT_COMMAND",
									command: {
										type: "annotation.create",
										point: context.startWorldPoint,
										entityId: context.editingEntityId,
									},
								});
							}),
						},
						KEY_DOWN: {
							guard: ({ event }) => event.key === "Escape",
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "CANCEL_GESTURE" });
							}),
						},
						CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "CANCEL_GESTURE" });
							}),
						},
					},
				},

				vertexEditing: {
					on: {
						POINTER_DOWN: {
							actions: enqueueActions(({ event, enqueue }) => {
								enqueue.assign({
									editingVertexId: event.hitHandle ?? null,
									startWorldPoint: event.worldPoint,
									currentWorldPoint: event.worldPoint,
								});
							}),
						},
						POINTER_MOVE: {
							actions: enqueueActions(({ event, enqueue }) => {
								enqueue.assign({ currentWorldPoint: event.worldPoint });
							}),
						},
						POINTER_UP: {
							actions: enqueueActions(({ context, enqueue }) => {
								if (context.editingEntityId && context.editingVertexId) {
									enqueue.emit({
										type: "COMMIT_COMMAND",
										command: {
											type: "vertex.move",
											entityId: context.editingEntityId,
											vertexId: context.editingVertexId,
											point: context.currentWorldPoint,
										},
									});
								}
								enqueue.assign({ editingVertexId: null });
							}),
						},
						KEY_DOWN: {
							guard: ({ event }) => event.key === "Escape",
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.assign({
									editingEntityId: null,
									editingVertexId: null,
								});
								enqueue.emit({ type: "CANCEL_GESTURE" });
							}),
						},
						CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.assign({
									editingEntityId: null,
									editingVertexId: null,
								});
								enqueue.emit({ type: "CANCEL_GESTURE" });
							}),
						},
					},
				},

				panning: {
					on: {
						POINTER_MOVE: {
							actions: enqueueActions(({ context, event, enqueue }) => {
								if (context.startPoint) {
									const delta = {
										x:
											event.point.x -
											(context.currentPoint?.x ?? event.point.x),
										y:
											event.point.y -
											(context.currentPoint?.y ?? event.point.y),
									};
									enqueue.assign({ currentPoint: event.point });
									enqueue.emit({ type: "CAMERA_PAN", delta });
								}
							}),
						},
						POINTER_UP: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({ startPoint: null, currentPoint: null });
							}),
						},
						POINTER_CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({ startPoint: null, currentPoint: null });
							}),
						},
					},
				},

				pinching: {
					on: {
						TOUCH_MOVE: {
							actions: enqueueActions(({ context, event, enqueue }) => {
								if (event.touches.length >= 2 && context.pinchStart) {
									const [t1, t2] = event.touches;
									const newDist = Math.hypot(t2.x - t1.x, t2.y - t1.y);
									const zoomFactor =
										context.pinchStart.distance > 0
											? newDist / context.pinchStart.distance
											: 1;
									const center = {
										x: (t1.x + t2.x) / 2,
										y: (t1.y + t2.y) / 2,
									};
									enqueue.assign({
										pinchStart: { distance: newDist, center },
									});
									enqueue.emit({
										type: "CAMERA_PINCH",
										zoomFactor,
										center,
									});
								}
							}),
						},
						TOUCH_END: {
							guard: ({ event }) => event.touches.length < 2,
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.assign({ pinchStart: null });
								enqueue.emit({ type: "RELEASE_CAPTURE" });
							}),
						},
					},
				},
			},
		},

		preview: {
			initial: "idle",
			states: {
				idle: {
					on: {
						POINTER_DOWN: [
							{
								guard: ({ event }) => Boolean(event.hitEntityId),
								target: "inspecting",
								actions: enqueueActions(({ event, enqueue }) => {
									const id = event.hitEntityId!;
									enqueue.assign({ selectedIds: [id] });
									enqueue.emit({
										type: "SELECTION_CHANGED",
										selectedIds: [id],
									});
								}),
							},
							{
								target: "panning",
								actions: enqueueActions(({ event, enqueue }) => {
									enqueue.assign({
										startPoint: event.point,
										currentPoint: event.point,
									});
								}),
							},
						],
					},
				},

				panning: {
					on: {
						POINTER_MOVE: {
							actions: enqueueActions(({ context, event, enqueue }) => {
								if (context.currentPoint) {
									const delta = {
										x: event.point.x - context.currentPoint.x,
										y: event.point.y - context.currentPoint.y,
									};
									enqueue.assign({ currentPoint: event.point });
									enqueue.emit({ type: "CAMERA_PAN", delta });
								}
							}),
						},
						POINTER_UP: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({ startPoint: null, currentPoint: null });
							}),
						},
						POINTER_CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.emit({ type: "RELEASE_CAPTURE" });
								enqueue.assign({ startPoint: null, currentPoint: null });
							}),
						},
					},
				},

				pinching: {
					on: {
						TOUCH_MOVE: {
							actions: enqueueActions(({ context, event, enqueue }) => {
								if (event.touches.length >= 2 && context.pinchStart) {
									const [t1, t2] = event.touches;
									const newDist = Math.hypot(t2.x - t1.x, t2.y - t1.y);
									const zoomFactor =
										context.pinchStart.distance > 0
											? newDist / context.pinchStart.distance
											: 1;
									const center = {
										x: (t1.x + t2.x) / 2,
										y: (t1.y + t2.y) / 2,
									};
									enqueue.assign({
										pinchStart: { distance: newDist, center },
									});
									enqueue.emit({
										type: "CAMERA_PINCH",
										zoomFactor,
										center,
									});
								}
							}),
						},
						TOUCH_END: {
							guard: ({ event }) => event.touches.length < 2,
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.assign({ pinchStart: null });
								enqueue.emit({ type: "RELEASE_CAPTURE" });
							}),
						},
					},
				},

				inspecting: {
					on: {
						POINTER_DOWN: [
							{
								guard: ({ event }) => Boolean(event.hitEntityId),
								actions: enqueueActions(({ event, enqueue }) => {
									const id = event.hitEntityId!;
									enqueue.assign({ selectedIds: [id] });
									enqueue.emit({
										type: "SELECTION_CHANGED",
										selectedIds: [id],
									});
								}),
							},
							{
								target: "idle",
								actions: enqueueActions(({ enqueue }) => {
									enqueue.assign({ selectedIds: [] });
									enqueue.emit({
										type: "SELECTION_CHANGED",
										selectedIds: [],
									});
								}),
							},
						],
						CANCEL: {
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.assign({ selectedIds: [] });
								enqueue.emit({
									type: "SELECTION_CHANGED",
									selectedIds: [],
								});
							}),
						},
						KEY_DOWN: {
							guard: ({ event }) => event.key === "Escape",
							target: "idle",
							actions: enqueueActions(({ enqueue }) => {
								enqueue.assign({ selectedIds: [] });
								enqueue.emit({
									type: "SELECTION_CHANGED",
									selectedIds: [],
								});
							}),
						},
					},
				},
			},
		},
	},
});
