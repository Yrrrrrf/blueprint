// ============================================================================
// Blueprint WebSocket Telemetry Source (§9.1, §9.2 of Blueprint Specification)
// Real-time WebSocket connection adapter implementing TelemetrySource.
// Batches rendering at <=10 Hz, limits message to 1 MiB/1000 samples,
// and handles exponential reconnect backoff with jitter.
// ============================================================================

import type {
	ConnectionState,
	TelemetryObserver,
	TelemetrySample,
	TelemetrySource,
} from "./telemetry.ts";
import {
	ChannelSequenceTracker,
	validateTelemetrySample,
} from "./telemetry.ts";

export const DEFAULT_RECONNECT_DELAYS_SEC = [1, 2, 4, 8, 16, 30] as const;
export const MAX_RECONNECT_DELAY_SEC = 30;
export const MAX_MESSAGE_BYTES = 1024 * 1024; // 1 MiB
export const MAX_SAMPLES_PER_MESSAGE = 1000;
export const DEFAULT_BATCH_INTERVAL_MS = 100; // 10 Hz
export const CONNECTED_RESET_MS = 10000; // Reset backoff after 10s connected

export interface WebSocketTelemetrySourceOptions {
	id?: string;
	url: string;
	protocols?: string | string[];
	clock?: () => number;
	random?: () => number;
	batchIntervalMs?: number;
	maxMessageBytes?: number;
	maxSamplesPerMessage?: number;
	reconnectDelays?: readonly number[];
	maxReconnectDelaySec?: number;
	jitterRatio?: number;
	connectedResetMs?: number;
	webSocketFactory?: (
		url: string,
		protocols?: string | string[],
	) => WebSocketLike;
}

export interface WebSocketLike {
	readyState: number;
	send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
	close(code?: number, reason?: string): void;
	onopen: ((event: unknown) => void) | null;
	onclose: ((event: unknown) => void) | null;
	onerror: ((event: unknown) => void) | null;
	onmessage: ((event: { data: unknown }) => void) | null;
}

type InternalSubscriber = {
	id: string;
	channels: Set<string>;
	observer: TelemetryObserver;
};

export class WebSocketTelemetrySource implements TelemetrySource {
	public readonly id: string;
	private readonly _url: string;
	private readonly _protocols?: string | string[];
	private readonly _clock: () => number;
	private readonly _random: () => number;
	private readonly _batchIntervalMs: number;
	private readonly _maxMessageBytes: number;
	private readonly _maxSamplesPerMessage: number;
	private readonly _reconnectDelays: readonly number[];
	private readonly _maxReconnectDelaySec: number;
	private readonly _jitterRatio: number;
	private readonly _connectedResetMs: number;
	private readonly _webSocketFactory: (
		url: string,
		protocols?: string | string[],
	) => WebSocketLike;

	private _socket: WebSocketLike | null = null;
	private _connectionState: ConnectionState = "disconnected";
	private _connectionGeneration = 0;
	private _reconnectAttempt = 0;
	private _lastReconnectDelayMs: number | null = null;
	private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private _connectedTimer: ReturnType<typeof setTimeout> | null = null;
	private _batchTimer: ReturnType<typeof setInterval> | null = null;
	private _subscribers = new Map<string, InternalSubscriber>();
	private _nextSubId = 1;
	private _pendingSamples = new Map<string, TelemetrySample>();
	private readonly _sequenceTracker = new ChannelSequenceTracker();
	private _disposed = false;

	constructor(options: WebSocketTelemetrySourceOptions) {
		this.id = options.id ?? "websocket-telemetry";
		this._url = options.url;
		this._protocols = options.protocols;
		this._clock = options.clock ?? (() => Date.now());
		this._random = options.random ?? (() => Math.random());
		this._batchIntervalMs = Math.max(
			50,
			options.batchIntervalMs ?? DEFAULT_BATCH_INTERVAL_MS,
		);
		this._maxMessageBytes = options.maxMessageBytes ?? MAX_MESSAGE_BYTES;
		this._maxSamplesPerMessage =
			options.maxSamplesPerMessage ?? MAX_SAMPLES_PER_MESSAGE;
		this._reconnectDelays =
			options.reconnectDelays ?? DEFAULT_RECONNECT_DELAYS_SEC;
		this._maxReconnectDelaySec =
			options.maxReconnectDelaySec ?? MAX_RECONNECT_DELAY_SEC;
		this._jitterRatio = options.jitterRatio ?? 0.1;
		this._connectedResetMs = options.connectedResetMs ?? CONNECTED_RESET_MS;

		this._webSocketFactory =
			options.webSocketFactory ??
			((url, protocols) => {
				const wsClass = (globalThis as any).WebSocket;
				if (!wsClass) {
					throw new Error("No WebSocket implementation available");
				}
				return new wsClass(url, protocols);
			});
	}

	public get connectionState(): ConnectionState {
		return this._connectionState;
	}

	public get isDisposed(): boolean {
		return this._disposed;
	}

	/**
	 * Subscribes observer to telemetry channels per §9.1.
	 */
	public subscribe(
		channels: readonly string[],
		observer: {
			next(batch: readonly TelemetrySample[]): void;
			error(error: Error): void;
			connection(state: ConnectionState): void;
		},
	): () => void {
		if (this._disposed) {
			observer.connection("disconnected");
			return () => {};
		}

		const subId = `ws_sub_${this._nextSubId++}`;
		const sub: InternalSubscriber = {
			id: subId,
			channels: new Set(channels),
			observer,
		};
		this._subscribers.set(subId, sub);

		// Notify current state
		observer.connection(this._connectionState);

		// If this is the first subscription, open socket and batch timer
		if (this._subscribers.size === 1) {
			this._startBatchTimer();
			this._connect();
		} else if (this._socket && this._socket.readyState === 1 /* OPEN */) {
			this._sendChannelSubscriptions();
		}

		return () => {
			this._subscribers.delete(subId);
			if (this._subscribers.size === 0) {
				this._cleanup();
			} else {
				this._sendChannelSubscriptions();
			}
		};
	}

	/**
	 * Closes connection and stops all background timers.
	 */
	public dispose(): void {
		if (this._disposed) return;
		this._disposed = true;
		this._cleanup();
		this._subscribers.clear();
	}

	public get connectionGeneration(): number {
		return this._connectionGeneration;
	}

	public get reconnectAttempt(): number {
		return this._reconnectAttempt;
	}

	public get lastReconnectDelayMs(): number | null {
		return this._lastReconnectDelayMs;
	}

	public get sequenceTracker(): ChannelSequenceTracker {
		return this._sequenceTracker;
	}

	private _cleanup(): void {
		this._connectionGeneration++;
		if (this._reconnectTimer !== null) {
			clearTimeout(this._reconnectTimer);
			this._reconnectTimer = null;
		}
		if (this._connectedTimer !== null) {
			clearTimeout(this._connectedTimer);
			this._connectedTimer = null;
		}
		if (this._batchTimer !== null) {
			clearInterval(this._batchTimer);
			this._batchTimer = null;
		}
		if (this._socket) {
			try {
				this._socket.close();
			} catch {
				// Ignore close errors during disposal
			}
			this._socket = null;
		}
		this._setConnectionState("disconnected");
		this._pendingSamples.clear();
	}

	private _setConnectionState(state: ConnectionState): void {
		if (this._connectionState === state) return;
		this._connectionState = state;
		for (const sub of this._subscribers.values()) {
			sub.observer.connection(state);
		}
	}

	private _connect(): void {
		if (this._disposed || this._subscribers.size === 0) return;

		this._setConnectionState("connecting");
		const currentGen = ++this._connectionGeneration;

		try {
			const ws = this._webSocketFactory(this._url, this._protocols);
			this._socket = ws;

			ws.onopen = () => {
				if (this._socket !== ws || this._connectionGeneration !== currentGen)
					return;
				this._sequenceTracker.resetGeneration();
				this._setConnectionState("connected");

				// Connected reset timer (§9.2: reset backoff after 10 seconds connected)
				this._connectedTimer = setTimeout(() => {
					this._reconnectAttempt = 0;
				}, this._connectedResetMs);

				this._sendChannelSubscriptions();
			};

			ws.onclose = () => {
				if (this._socket !== ws || this._connectionGeneration !== currentGen)
					return;
				this._handleDisconnect();
			};

			ws.onerror = (err: unknown) => {
				if (this._socket !== ws || this._connectionGeneration !== currentGen)
					return;
				const error =
					err instanceof Error ? err : new Error("WebSocket connection error");
				for (const sub of this._subscribers.values()) {
					sub.observer.error(error);
				}
				this._handleDisconnect();
			};

			ws.onmessage = (event: { data: unknown }) => {
				if (this._socket !== ws || this._connectionGeneration !== currentGen)
					return;
				this._handleMessage(event.data);
			};
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			for (const sub of this._subscribers.values()) {
				sub.observer.error(error);
			}
			this._handleDisconnect();
		}
	}

	private _handleDisconnect(): void {
		if (this._connectedTimer !== null) {
			clearTimeout(this._connectedTimer);
			this._connectedTimer = null;
		}
		this._socket = null;
		this._setConnectionState("disconnected");

		if (this._disposed || this._subscribers.size === 0) return;

		// Schedule reconnect backoff (§9.2: 1, 2, 4, 8, 16, 30s with ±10% jitter)
		const delayIndex = Math.min(
			this._reconnectAttempt,
			this._reconnectDelays.length - 1,
		);
		const baseDelaySec = Math.min(
			this._reconnectDelays[delayIndex],
			this._maxReconnectDelaySec,
		);
		this._reconnectAttempt++;

		// Apply ±10% jitter and enforce normative absolute cap after jitter
		const jitter = (this._random() * 2 - 1) * this._jitterRatio;
		let delayMs = Math.round(baseDelaySec * 1000 * (1 + jitter));
		const maxDelayMs = this._maxReconnectDelaySec * 1000;
		if (delayMs > maxDelayMs) {
			delayMs = maxDelayMs;
		}
		if (delayMs < 0) {
			delayMs = 0;
		}
		this._lastReconnectDelayMs = delayMs;

		this._reconnectTimer = setTimeout(() => {
			this._reconnectTimer = null;
			this._connect();
		}, delayMs);
	}

	private _handleMessage(data: unknown): void {
		if (typeof data !== "string") {
			return; // Non-text message ignored
		}

		// Message size limit check: 1 MiB (§9.2)
		if (data.length > this._maxMessageBytes) {
			return;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(data);
		} catch {
			return; // JSON parse error ignored
		}

		if (!Array.isArray(parsed)) {
			return;
		}

		// Max samples per message limit: 1000 (§9.2) - reject if exceeded
		if (parsed.length > this._maxSamplesPerMessage) {
			return;
		}

		const samples = parsed;
		const activeChannels = this._getActiveChannels();
		const nowMs = this._clock();

		for (const item of samples) {
			const validated = validateTelemetrySample(item, { nowMs });
			if (!validated.valid || !validated.sample) {
				continue;
			}

			// Ignore unknown/unsubscribed channels (§9.2)
			if (!activeChannels.has(validated.sample.channel)) {
				continue;
			}

			// Sequence tracking: discard older/duplicate sequences per generation (§9.1, AC-048)
			if (
				!this._sequenceTracker.accept(
					validated.sample.channel,
					validated.sample.sequence,
				)
			) {
				continue;
			}

			// Batching: retain the most recent sample per channel (§9.2)
			this._pendingSamples.set(validated.sample.channel, validated.sample);
		}
	}

	private _startBatchTimer(): void {
		if (this._batchTimer !== null) return;
		this._batchTimer = setInterval(() => {
			this._flushBatch();
		}, this._batchIntervalMs);
	}

	private _flushBatch(): void {
		if (this._pendingSamples.size === 0) return;

		const samples = Array.from(this._pendingSamples.values());
		this._pendingSamples.clear();

		for (const sub of this._subscribers.values()) {
			const matching = samples.filter((s) => sub.channels.has(s.channel));
			if (matching.length > 0) {
				sub.observer.next(matching);
			}
		}
	}

	private _getActiveChannels(): Set<string> {
		const active = new Set<string>();
		for (const sub of this._subscribers.values()) {
			for (const ch of sub.channels) {
				active.add(ch);
			}
		}
		return active;
	}

	private _sendChannelSubscriptions(): void {
		if (!this._socket || this._socket.readyState !== 1 /* OPEN */) {
			return;
		}
		try {
			const channels = Array.from(this._getActiveChannels());
			this._socket.send(JSON.stringify({ type: "subscribe", channels }));
		} catch {
			// Socket send error ignored
		}
	}
}

export function createWebSocketSource(
	options: WebSocketTelemetrySourceOptions,
): WebSocketTelemetrySource {
	return new WebSocketTelemetrySource(options);
}
