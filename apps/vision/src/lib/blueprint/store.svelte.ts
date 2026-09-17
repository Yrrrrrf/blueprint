import type { SlotContext } from "rune-lab/core";
import type { BlueprintSession } from "@sdk/state";
import type {
	BlueprintPreferences,
	BlueprintStore,
	SessionRegistration,
} from "./types.ts";

export const PREFERENCES_STORAGE_KEY = "blueprint.preferences.v1";

export const DEFAULT_PREFERENCES: BlueprintPreferences = {
	version: 1,
	displayUnit: "mm",
	gridVisible: true,
	gridMinorMm: 1000,
	gridMajorEvery: 10,
	snapEnabled: true,
	hoverDelayMs: 250,
	reducedMotion: false,
	navigationTab: "catalog",
	detailTab: "inspector",
};

export class BlueprintStoreImpl implements BlueprintStore {
	private _registrations = $state<SessionRegistration[]>([]);
	private _activeInstanceId = $state<string | null>(null);
	private _preferences = $state<BlueprintPreferences>({
		...DEFAULT_PREFERENCES,
	});
	private _ctx?: SlotContext<unknown>;

	constructor(ctx?: SlotContext<unknown>) {
		this._ctx = ctx;
		this._loadPreferences();
	}

	private _loadPreferences(): void {
		if (!this._ctx?.persistence) return;
		try {
			const raw = this._ctx.persistence.get(PREFERENCES_STORAGE_KEY);
			if (raw && typeof raw === "string") {
				const parsed = JSON.parse(raw);
				if (parsed && typeof parsed === "object" && parsed.version === 1) {
					this._preferences = { ...DEFAULT_PREFERENCES, ...parsed };
				}
			}
		} catch {
			// Nonfatal fallback to defaults
		}
	}

	public get activeInstanceId(): string | null {
		return this._activeInstanceId;
	}

	public get activeSession(): BlueprintSession | null {
		if (!this._activeInstanceId) return null;
		const found = this._registrations.find(
			(r) => r.instanceId === this._activeInstanceId,
		);
		return found ? found.session : null;
	}

	public get activeFocusTarget(): HTMLElement | null {
		if (!this._activeInstanceId) return null;
		const found = this._registrations.find(
			(r) => r.instanceId === this._activeInstanceId,
		);
		return found?.focusTarget ?? null;
	}

	public get sessions(): readonly {
		instanceId: string;
		session: BlueprintSession;
	}[] {
		return this._registrations.map((r) => ({
			instanceId: r.instanceId,
			session: r.session,
		}));
	}

	public get preferences(): BlueprintPreferences {
		return this._preferences;
	}

	public register(
		instanceId: string,
		session: BlueprintSession,
		focusTarget?: HTMLElement | null,
	): () => void {
		const existing = this._registrations.find(
			(r) => r.instanceId === instanceId,
		);
		if (existing) {
			throw new Error(`Duplicate live instance ID: ${instanceId}`);
		}

		const token = Symbol(instanceId);
		this._registrations.push({
			instanceId,
			session,
			focusTarget,
			token,
		});

		// Auto-activate first registered session
		if (this._activeInstanceId === null) {
			this._activeInstanceId = instanceId;
		}

		let unregistered = false;
		return () => {
			if (unregistered) return;
			unregistered = true;
			const idx = this._registrations.findIndex((r) => r.token === token);
			if (idx !== -1) {
				this._registrations.splice(idx, 1);
				if (this._activeInstanceId === instanceId) {
					// Clearing active state without routing to an arbitrary surviving editor (per §5)
					this._activeInstanceId = null;
				}
			}
		};
	}

	public activate(instanceId: string): void {
		const found = this._registrations.find((r) => r.instanceId === instanceId);
		if (found) {
			this._activeInstanceId = instanceId;
		}
	}

	public updatePreferences(patch: Partial<BlueprintPreferences>): void {
		this._preferences = { ...this._preferences, ...patch };
		if (this._ctx?.persistence) {
			try {
				this._ctx.persistence.set(
					PREFERENCES_STORAGE_KEY,
					JSON.stringify(this._preferences),
				);
			} catch {
				// Preference storage failure is nonfatal
			}
		}
	}

	public dispose(): void {
		this._registrations.length = 0;
		this._activeInstanceId = null;
	}
}

export function createBlueprintStore(
	ctx?: SlotContext<unknown>,
): BlueprintStore {
	return new BlueprintStoreImpl(ctx);
}
