// ============================================================================
// Blueprint PaperScope Lifecycle & Multi-Canvas Isolation (§3, §6.2, AC-024)
// Encapsulates PaperScope, strictly activates project on synchronous operations,
// provides disposal token to guard async tasks, and cleans up completely.
// ============================================================================

import paper from "paper";

export type DisposalToken = {
	readonly disposed: boolean;
};

export type CanvasElementLike = {
	getContext?: (contextId: string, ...args: unknown[]) => unknown;
	width?: number;
	height?: number;
};

export class IsolatedPaperScope {
	private readonly _scope: paper.PaperScope;
	private _disposed = false;
	private readonly _token: { disposed: boolean } = { disposed: false };

	constructor(
		target?: CanvasElementLike | { width: number; height: number } | unknown,
	) {
		this._scope = new paper.PaperScope();

		if (target) {
			const candidate = target as Record<string, unknown>;
			if (typeof candidate.getContext === "function") {
				this._scope.setup(target as never);
			} else if (
				typeof candidate.width === "number" &&
				typeof candidate.height === "number"
			) {
				this._scope.setup(
					new this._scope.Size(
						candidate.width as number,
						candidate.height as number,
					),
				);
			}
			if (this._scope.view) {
				// Prevent automatic requestAnimationFrame loop to allow explicit rendering
				// and prevent persistent timers from keeping background processes alive
				this._scope.view.autoUpdate = false;
			}
		}
	}

	/**
	 * Underlying PaperScope instance.
	 */
	get scope(): paper.PaperScope {
		return this._scope;
	}

	/**
	 * Underlying Paper.js Project instance if setup.
	 */
	get project(): paper.Project | null {
		return this._scope.project ?? null;
	}

	/**
	 * Underlying Paper.js View instance if setup.
	 */
	get view(): paper.View | null {
		return this._scope.view ?? null;
	}

	/**
	 * Read-only disposal token for guarding async operations (§6.2).
	 */
	get disposalToken(): DisposalToken {
		return this._token;
	}

	/**
	 * Whether this scope has been disposed.
	 */
	get isDisposed(): boolean {
		return this._disposed;
	}

	/**
	 * Strictly activates this scope and its project to prevent cross-canvas item leakage (§3, §6.2).
	 */
	activate(): void {
		if (this._disposed) {
			throw new Error("Cannot activate a disposed IsolatedPaperScope");
		}
		this._scope.activate();
		if (this._scope.project) {
			this._scope.project.activate();
		}
	}

	/**
	 * Executes a synchronous callback with this scope and project strictly activated.
	 * Returns the callback result.
	 */
	execute<T>(fn: (scope: paper.PaperScope) => T): T {
		this.activate();
		return fn(this._scope);
	}

	/**
	 * Guarded async runner: checks disposal token before executing the callback
	 * and re-activates the scope before completion.
	 */
	async runGuardedAsync<T>(
		action: (scope: paper.PaperScope) => Promise<T>,
	): Promise<T | null> {
		if (this._disposed) {
			return null;
		}
		const result = await action(this._scope);
		if (this._disposed) {
			return null;
		}
		this.activate();
		return result;
	}

	/**
	 * Tears down project and view completely.
	 */
	dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._token.disposed = true;

		try {
			this._scope.activate();
			if (this._scope.project) {
				this._scope.project.clear();
				this._scope.project.remove();
			}
			if (this._scope.view) {
				this._scope.view.autoUpdate = false;
				this._scope.view.remove();
			}
		} catch {
			// Swallow cleanup errors during teardown
		}
	}
}
