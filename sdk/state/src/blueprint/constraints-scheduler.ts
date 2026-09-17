// ============================================================================
// Blueprint Constraints Worker Scheduler & Controller (§8.3, C-04)
// Coordinates off-thread spatial checks with single running + single replaceable
// pending job, generation invalidation, and cooperative main-thread chunk fallback.
// ============================================================================

import type { BlueprintDocument, SpatialIssue } from "@sdk/core";
import { runSpatialChecks, runSpatialChecksCooperative } from "@sdk/core";
import type {
	ConstraintsWorkerRequest,
	ConstraintsWorkerResponse,
} from "./constraints.worker.ts";

export interface WorkerLike {
	postMessage(message: unknown, transfer?: unknown[]): void;
	terminate?(): void;
	onmessage: ((event: MessageEvent<unknown>) => void) | null;
	onerror: ((event: unknown) => void) | null;
}

export type ConstraintsSchedulerStatus =
	| "idle"
	| "checking"
	| "fallback"
	| "error";

export interface ConstraintsSchedulerOptions {
	workerFactory?: () => WorkerLike;
	yieldFn?: () => Promise<void>;
	idFactory?: () => string;
}

interface ActiveJob {
	request: ConstraintsWorkerRequest;
	startTime: number;
}

interface Awaiter {
	revision: number;
	resolve: (issues: SpatialIssue[]) => void;
	reject: (err: Error) => void;
	cancellationToken?: { isCancelled: boolean };
}

export class ConstraintsScheduler {
	private readonly _workerFactory?: () => WorkerLike;
	private readonly _yieldFn?: () => Promise<void>;
	private readonly _idFactory: () => string;

	private _worker: WorkerLike | null = null;
	private _workerFailed = false;
	private _generation = 1;
	private _jobCounter = 1;

	private _currentJob: ActiveJob | null = null;
	private _pendingJob: ConstraintsWorkerRequest | null = null;
	private _latestResult: ConstraintsWorkerResponse | null = null;
	private _status: ConstraintsSchedulerStatus = "idle";
	private _isPending = false;
	private _lastError: string | null = null;

	private readonly _listeners = new Set<() => void>();
	private _awaiters: Awaiter[] = [];
	private _disposed = false;

	constructor(options: ConstraintsSchedulerOptions = {}) {
		this._workerFactory = options.workerFactory;
		this._yieldFn = options.yieldFn;
		this._idFactory = options.idFactory ?? (() => `job_${this._jobCounter++}`);
	}

	public get generation(): number {
		return this._generation;
	}

	public get status(): ConstraintsSchedulerStatus {
		return this._status;
	}

	public get isPending(): boolean {
		return this._isPending;
	}

	public get lastError(): string | null {
		return this._lastError;
	}

	public get latestResult(): ConstraintsWorkerResponse | null {
		return this._latestResult;
	}

	public get isDisposed(): boolean {
		return this._disposed;
	}

	/**
	 * Returns whether the displayed spatial issues are outdated relative to current document revision.
	 */
	public isOutdated(currentRevision: number, currentDocId?: string): boolean {
		if (!this._latestResult) {
			return true;
		}
		if (this._latestResult.generation !== this._generation) {
			return true;
		}
		if (currentDocId && this._latestResult.documentId !== currentDocId) {
			return true;
		}
		return this._latestResult.revision !== currentRevision;
	}

	/**
	 * Returns latest known spatial issues.
	 * Returns empty array if none checked or on unrecovered failure.
	 */
	public getIssues(): SpatialIssue[] {
		return this._latestResult ? [...this._latestResult.issues] : [];
	}

	/**
	 * Subscribes to check completion and state changes.
	 */
	public subscribe(listener: () => void): () => void {
		this._listeners.add(listener);
		return () => {
			this._listeners.delete(listener);
		};
	}

	private _notify(): void {
		for (const listener of this._listeners) {
			try {
				listener();
			} catch {
				// Ignore subscriber errors
			}
		}
	}

	/**
	 * Schedules spatial constraints check on a document (§8.3, C-04).
	 * Follows queue-cap=1: at most one running and one replaceable latest pending job.
	 */
	public schedule(doc: BlueprintDocument): void {
		if (this._disposed) return;

		const jobId = this._idFactory();
		const request: ConstraintsWorkerRequest = {
			documentId: doc.documentId,
			revision: doc.revision,
			generation: this._generation,
			jobId,
			doc,
		};

		if (this._currentJob !== null) {
			// Replace pending job with latest (never grows unbounded)
			this._pendingJob = request;
			this._isPending = true;
			this._notify();
			return;
		}

		this._dispatch(request);
	}

	private _dispatch(request: ConstraintsWorkerRequest): void {
		this._currentJob = {
			request,
			startTime: Date.now(),
		};
		this._isPending = true;

		// If worker is marked failed or unavailable, go directly to cooperative fallback
		if (this._workerFailed) {
			this._executeFallback(request);
			return;
		}

		try {
			const worker = this._getOrCreateWorker();
			if (!worker) {
				this._workerFailed = true;
				this._executeFallback(request);
				return;
			}

			this._status = "checking";
			this._notify();
			worker.postMessage(request);
		} catch {
			this._workerFailed = true;
			this._executeFallback(request);
		}
	}

	private _getOrCreateWorker(): WorkerLike | null {
		if (this._worker) return this._worker;

		if (this._workerFactory) {
			const w = this._workerFactory();
			this._attachWorkerListeners(w);
			this._worker = w;
			return w;
		}

		// Try browser Web Worker if in browser context
		if (typeof Worker !== "undefined") {
			try {
				const workerUrl = new URL("./constraints.worker.ts", import.meta.url);
				const w = new Worker(workerUrl.href, { type: "module" });
				this._attachWorkerListeners(w as unknown as WorkerLike);
				this._worker = w as unknown as WorkerLike;
				return this._worker;
			} catch {
				return null;
			}
		}

		return null;
	}

	private _attachWorkerListeners(worker: WorkerLike): void {
		worker.onmessage = (event: MessageEvent<unknown>) => {
			this._handleWorkerMessage(event.data as ConstraintsWorkerResponse);
		};
		worker.onerror = () => {
			if (this._currentJob) {
				this._workerFailed = true;
				this._executeFallback(this._currentJob.request);
			}
		};
	}

	private _handleWorkerMessage(data: ConstraintsWorkerResponse): void {
		if (this._disposed) return;
		if (!data || typeof data !== "object") return;

		// Strict identity check: generation and current active job must match
		if (data.generation !== this._generation) {
			return; // Stale generation ignored
		}

		if (!this._currentJob || this._currentJob.request.jobId !== data.jobId) {
			return; // Stale job or out-of-order result ignored
		}

		if (data.error) {
			// Worker execution error -> fall back cooperatively on main thread
			this._executeFallback(this._currentJob.request);
			return;
		}

		this._completeJob(data);
	}

	private async _executeFallback(
		request: ConstraintsWorkerRequest,
	): Promise<void> {
		this._status = "fallback";
		this._notify();

		const genAtStart = this._generation;
		const jobId = request.jobId;

		try {
			const cancellationToken = {
				get isCancelled(): boolean {
					return false;
				},
			};

			const issues = await runSpatialChecksCooperative(request.doc, {
				revision: request.revision,
				yieldFn: this._yieldFn,
				cancellationToken,
			});

			if (this._disposed || this._generation !== genAtStart) {
				return; // Invalidation during fallback
			}

			if (!this._currentJob || this._currentJob.request.jobId !== jobId) {
				return; // Superseded
			}

			this._completeJob({
				documentId: request.documentId,
				revision: request.revision,
				generation: request.generation,
				jobId: request.jobId,
				issues,
			});
		} catch (err: unknown) {
			if (this._disposed || this._generation !== genAtStart) return;

			this._status = "error";
			this._lastError = err instanceof Error ? err.message : String(err);
			this._currentJob = null;

			// Do not produce false clean state on failure
			const errorRevision = request.revision;
			this._rejectAwaiters(errorRevision, new Error(this._lastError));

			if (this._pendingJob !== null) {
				const next = this._pendingJob;
				this._pendingJob = null;
				this._dispatch(next);
			} else {
				this._isPending = false;
			}
			this._notify();
		}
	}

	private _completeJob(response: ConstraintsWorkerResponse): void {
		this._latestResult = response;
		this._status = "idle";
		this._lastError = null;
		this._currentJob = null;

		this._resolveAwaiters(response.revision, response.issues);

		// If a newer pending job was queued, dispatch it now
		if (this._pendingJob !== null) {
			const next = this._pendingJob;
			this._pendingJob = null;
			this._dispatch(next);
		} else {
			this._isPending = false;
		}

		this._notify();
	}

	/**
	 * Increments generation, invalidating all running and queued jobs (§8.3, C-04).
	 * Used when switching documents or disposing sessions.
	 */
	public invalidateGeneration(): void {
		this._generation++;
		this._pendingJob = null;
		this._currentJob = null;
		this._isPending = false;
		this._status = "idle";

		// Terminate worker if running to release resources
		if (this._worker?.terminate) {
			try {
				this._worker.terminate();
			} catch {
				// Ignore termination errors
			}
			this._worker = null;
		}
		this._workerFailed = false;

		// Cancel pending awaiters
		const err = new Error("Spatial check cancelled by generation change");
		for (const awaiter of this._awaiters) {
			awaiter.reject(err);
		}
		this._awaiters = [];

		this._notify();
	}

	/**
	 * Awaits completion of spatial checks for the specified or latest revision (C-04).
	 */
	public async awaitChecks(
		targetRevision?: number,
		cancellationToken?: { isCancelled: boolean },
	): Promise<SpatialIssue[]> {
		if (cancellationToken?.isCancelled) {
			throw new Error("Await spatial checks cancelled");
		}

		// If current result matches target revision and no pending checks, return immediately
		if (
			this._latestResult &&
			this._latestResult.generation === this._generation &&
			(!targetRevision || this._latestResult.revision === targetRevision) &&
			!this._isPending
		) {
			return [...this._latestResult.issues];
		}

		return new Promise<SpatialIssue[]>((resolve, reject) => {
			this._awaiters.push({
				revision: targetRevision ?? this._currentJob?.request.revision ?? 0,
				resolve,
				reject,
				cancellationToken,
			});
		});
	}

	private _resolveAwaiters(revision: number, issues: SpatialIssue[]): void {
		const remaining: Awaiter[] = [];
		for (const awaiter of this._awaiters) {
			if (awaiter.cancellationToken?.isCancelled) {
				awaiter.reject(new Error("Await spatial checks cancelled"));
			} else if (awaiter.revision <= revision) {
				awaiter.resolve([...issues]);
			} else {
				remaining.push(awaiter);
			}
		}
		this._awaiters = remaining;
	}

	private _rejectAwaiters(revision: number, error: Error): void {
		const remaining: Awaiter[] = [];
		for (const awaiter of this._awaiters) {
			if (awaiter.revision <= revision) {
				awaiter.reject(error);
			} else {
				remaining.push(awaiter);
			}
		}
		this._awaiters = remaining;
	}

	public dispose(): void {
		if (this._disposed) return;
		this._disposed = true;
		this.invalidateGeneration();
		this._listeners.clear();
	}
}
