// ============================================================================
// Blueprint UI Component Props (§9.3 of Blueprint Specification)
// Types for canvas, editor, viewer, and telemetry cards.
// ============================================================================

import type { BlueprintDocument, Id } from "@sdk/core";
import type { Camera, RendererPort } from "@sdk/renderer";
import type { BlueprintSession } from "@sdk/state";
import type { DocumentRepository, TelemetryPort } from "@sdk/api";

export interface BlueprintCanvasProps {
	session?: BlueprintSession;
	renderer?: RendererPort;
	width?: number | string;
	height?: number | string;
	class?: string;
	onCameraChange?: (camera: Camera) => void;
	onSelect?: (entityIds: readonly Id[]) => void;
}

export interface BlueprintEditorProps {
	session?: BlueprintSession;
	initialDoc?: BlueprintDocument;
	repository?: DocumentRepository;
	telemetryPort?: TelemetryPort;
	class?: string;
	onCameraChange?: (camera: Camera) => void;
}

export interface BlueprintViewerProps {
	doc?: BlueprintDocument;
	session?: BlueprintSession;
	interactive?: boolean;
	inspectable?: boolean;
	telemetrySource?: TelemetryPort;
	selectedAssetId?: Id | null;
	visibleLayerIds?: readonly Id[];
	onSelectAsset?: (event: {
		documentId: Id;
		entityId: Id;
		assetKey: string;
	}) => void;
	onViewportChange?: (camera: Camera) => void;
	onError?: (error: unknown) => void;
	class?: string;
}

export interface TelemetryHoverCardProps {
	entityId: Id;
	name: string;
	definitionId: string;
	assetKey: string;
	status?: "running" | "maintenance" | "offline" | "unknown";
	values?: Readonly<Record<string, unknown>>;
	position?: { x: number; y: number };
}
