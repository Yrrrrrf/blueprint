// ============================================================================
// Blueprint State Selectors (§7.1, §7.3, AC-031, AC-036)
// Pure query and policy functions operating on session, interaction context,
// and entity arrays.
// ============================================================================

import type { Entity } from "@sdk/core";
import { getCatalogDefinition } from "@sdk/core";
import type { InteractionMachineContext } from "./interaction.machine.ts";
import type { BlueprintSession } from "./session.ts";

/**
 * Checks if undo is possible in current session.
 */
export function canUndo(session: BlueprintSession): boolean {
	return session.canUndo();
}

/**
 * Checks if redo is possible in current session.
 */
export function canRedo(session: BlueprintSession): boolean {
	return session.canRedo();
}

/**
 * Returns active tool name from interaction context.
 */
export function activeTool(context: InteractionMachineContext): string {
	return context.tool;
}

/**
 * Returns list of selected entity IDs.
 */
export function selectedEntityIds(
	context: InteractionMachineContext,
): readonly string[] {
	return context.selectedIds;
}

/**
 * Checks if there is any selection.
 */
export function hasSelection(context: InteractionMachineContext): boolean {
	return context.selectedIds.length > 0;
}

/**
 * Checks if exactly one entity is selected.
 */
export function isSingleSelection(context: InteractionMachineContext): boolean {
	return context.selectedIds.length === 1;
}

/**
 * Checks if multiple entities are selected.
 */
export function isMultiSelection(context: InteractionMachineContext): boolean {
	return context.selectedIds.length > 1;
}

/**
 * Formats camera zoom as an integer percentage.
 */
export function zoomPercent(scale: number): number {
	return Math.round(scale * 100);
}

/**
 * Determines whether the interaction state indicates active geometry drafting.
 */
export function isDrawing(stateValue: unknown): boolean {
	if (typeof stateValue === "string") {
		return (
			stateValue === "wallDrawing" ||
			stateValue === "zoneDrawing" ||
			stateValue === "openingPlacing" ||
			stateValue === "devicePlacing" ||
			stateValue === "dimensionDrawing" ||
			stateValue === "annotationPlacing"
		);
	}
	if (typeof stateValue === "object" && stateValue !== null) {
		const editor = (stateValue as Record<string, unknown>).editor;
		if (typeof editor === "string") {
			return (
				editor === "wallDrawing" ||
				editor === "zoneDrawing" ||
				editor === "openingPlacing" ||
				editor === "devicePlacing" ||
				editor === "dimensionDrawing" ||
				editor === "annotationPlacing"
			);
		}
	}
	return false;
}

/**
 * Determines whether the interaction state indicates active dragging.
 */
export function isDragging(stateValue: unknown): boolean {
	if (typeof stateValue === "string") {
		return (
			stateValue === "moving" ||
			stateValue === "resizing" ||
			stateValue === "rotating" ||
			stateValue === "marquee" ||
			stateValue === "panning" ||
			stateValue === "pinching"
		);
	}
	if (typeof stateValue === "object" && stateValue !== null) {
		const editor = (stateValue as Record<string, unknown>).editor;
		if (typeof editor === "string") {
			return (
				editor === "moving" ||
				editor === "resizing" ||
				editor === "rotating" ||
				editor === "marquee" ||
				editor === "panning" ||
				editor === "pinching"
			);
		}
	}
	return false;
}

/**
 * Checks if session is in editor mode.
 */
export function isEditorMode(context: InteractionMachineContext): boolean {
	return context.mode === "editor";
}

/**
 * Checks if session is in viewer mode.
 */
export function isViewerMode(context: InteractionMachineContext): boolean {
	return context.mode === "preview";
}

/**
 * Returns currently selected catalog definition ID for device placement.
 */
export function activeCatalogDefinition(
	context: InteractionMachineContext,
): string | null {
	return context.activeCatalogDefinitionId;
}

/**
 * Evaluates whether selection can be resized via bounding box handles (§7.3, AC-031, AC-036).
 * Multi-selection resize is disabled with reason "Resize objects individually".
 * Rigid devices reject resize ("Rigid equipment cannot be resized").
 */
export function canResizeSelection(entities: readonly Entity[]): {
	allowed: boolean;
	reason?: string;
} {
	if (entities.length === 0) {
		return { allowed: false, reason: "No selection" };
	}

	if (entities.length > 1) {
		return { allowed: false, reason: "Resize objects individually" };
	}

	const entity = entities[0];
	switch (entity.kind) {
		case "device": {
			const def = getCatalogDefinition(entity.definitionId);
			if (def && (def.id === "def-cnc-v1" || def.id === "def-robot-v1")) {
				return { allowed: false, reason: "Rigid equipment cannot be resized" };
			}
			return { allowed: true };
		}
		case "zone":
			return { allowed: true };
		case "wall":
			return { allowed: false, reason: "Resize walls via vertex editing" };
		case "opening":
		case "dimension":
		case "annotation":
			return {
				allowed: false,
				reason: "Dependent entities cannot be resized with handles",
			};
		default:
			return { allowed: true };
	}
}

/**
 * Evaluates whether selection can be rotated (§7.3).
 * Group rotation with annotations or dimensions rejects with explanation.
 */
export function canRotateSelection(entities: readonly Entity[]): {
	allowed: boolean;
	reason?: string;
} {
	if (entities.length === 0) {
		return { allowed: false };
	}

	const hasAnnotationsOrDimensions = entities.some(
		(e) => e.kind === "annotation" || e.kind === "dimension",
	);

	if (hasAnnotationsOrDimensions) {
		if (entities.length > 1) {
			return {
				allowed: false,
				reason: "Rotate geometry separately from annotations.",
			};
		}
		return {
			allowed: false,
			reason: "Annotations and dimensions cannot be rotated independently.",
		};
	}

	const hasOpenings = entities.some((e) => e.kind === "opening");
	if (hasOpenings && entities.length === 1) {
		return {
			allowed: false,
			reason: "Openings cannot be rotated independently of wall.",
		};
	}

	return { allowed: true };
}

/**
 * Returns power consumption report from session (§12.6, AC-053).
 */
export function selectPowerReport(session: BlueprintSession) {
	return session.getPowerReport();
}

/**
 * Returns zone aggregate report from session (§12.6).
 */
export function selectZoneReport(session: BlueprintSession) {
	return session.getZoneReport();
}

/**
 * Returns equipment inventory report from session (§12.6).
 */
export function selectEquipmentReport(session: BlueprintSession) {
	return session.getEquipmentReport();
}

/**
 * Returns spatial check issues from session (§8.3, AC-051, AC-052).
 */
export function selectSpatialIssues(session: BlueprintSession) {
	return session.getSpatialIssues();
}

/**
 * Returns telemetry reading for a device entity from session (§9.1).
 */
export function selectTelemetry(session: BlueprintSession, entityId: string) {
	return session.getTelemetry(entityId);
}

/**
 * Returns current telemetry connection state.
 */
export function selectTelemetryState(session: BlueprintSession) {
	return session.telemetryState;
}

/**
 * Evaluates whether selection can be aligned (§13.2, C-06.1).
 * Requires at least 2 entities; rejects if any entity is locked.
 */
export function canAlignSelection(entities: readonly Entity[]): {
	allowed: boolean;
	reason?: string;
} {
	if (entities.length < 2) {
		return {
			allowed: false,
			reason: "Alignment requires at least 2 entities",
		};
	}
	const hasLocked = entities.some((e) => e.locked);
	if (hasLocked) {
		return {
			allowed: false,
			reason: "Cannot align locked entities",
		};
	}
	return { allowed: true };
}

/**
 * Evaluates whether selection can be distributed (§13.2, C-06.1).
 * Requires at least 3 entities; rejects if any entity is locked.
 */
export function canDistributeSelection(entities: readonly Entity[]): {
	allowed: boolean;
	reason?: string;
} {
	if (entities.length < 3) {
		return {
			allowed: false,
			reason: "Distribution requires at least 3 entities",
		};
	}
	const hasLocked = entities.some((e) => e.locked);
	if (hasLocked) {
		return {
			allowed: false,
			reason: "Cannot distribute locked entities",
		};
	}
	return { allowed: true };
}
