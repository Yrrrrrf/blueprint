import type { BlueprintSession } from "@sdk/state";
import type { DisplayUnit } from "@sdk/core";

export interface SessionRegistration {
	instanceId: string;
	session: BlueprintSession;
	focusTarget?: HTMLElement | null;
	token: symbol;
}

export interface BlueprintPreferences {
	version: 1;
	displayUnit: DisplayUnit;
	gridVisible: boolean;
	gridMinorMm: number;
	gridMajorEvery: number;
	snapEnabled: boolean;
	hoverDelayMs: number;
	reducedMotion: boolean;
	navigationTab: "layers" | "catalog" | "assets";
	detailTab: "inspector" | "operations" | "issues";
}

export interface BlueprintStore {
	readonly activeInstanceId: string | null;
	readonly activeSession: BlueprintSession | null;
	readonly activeFocusTarget: HTMLElement | null;
	readonly sessions: readonly {
		instanceId: string;
		session: BlueprintSession;
	}[];
	readonly preferences: BlueprintPreferences;
	register(
		instanceId: string,
		session: BlueprintSession,
		focusTarget?: HTMLElement | null,
	): () => void;
	activate(instanceId: string): void;
	updatePreferences(patch: Partial<BlueprintPreferences>): void;
	dispose(): void;
}

export interface CapabilityResult {
	available: boolean;
	reason?: string;
}
