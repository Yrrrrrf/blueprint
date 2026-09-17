// ============================================================================
// Blueprint Telemetry Statechart Actor (§9.1, §9.2 of Blueprint Specification)
// XState v5 actor managing connection lifecycle, generation tokens,
// sequence tracking, and sample freshness checks.
// ============================================================================

import type {
	ConnectionState,
	TelemetryQuality,
	TelemetrySample,
	TelemetrySource,
	TelemetryValue,
} from "@sdk/api";
import {
	ChannelSequenceTracker,
	checkFreshness,
	FRESHNESS_WINDOW_MS,
	validateTelemetrySample,
} from "@sdk/api";
import { assign, emit, setup } from "xstate";

export interface TelemetryContext {
	source: TelemetrySource | null;
	channels: readonly string[];
	generation: number;
	values: Map<string, TelemetrySample>;
	receivedAt: Map<string, number>;
	staleChannels: Set<string>;
	connectionState: "disconnected" | "connecting" | "connected" | "error";
	error: Error | null;
	clock: () => number;
	staleWindowMs: number;
	tracker: ChannelSequenceTracker;
	activeUnsub: (() => void) | null;
}

export interface TelemetryInput {
	source?: TelemetrySource | null;
	channels?: readonly string[];
	clock?: () => number;
	staleWindowMs?: number;
}

export type TelemetryEvent =
	| { type: "CONNECT" }
	| { type: "DISCONNECT" }
	| { type: "SET_SOURCE"; source: TelemetrySource | null }
	| { type: "SET_CHANNELS"; channels: readonly string[] }
	| {
			type: "BATCH_RECEIVED";
			generation: number;
			batch: readonly TelemetrySample[];
	  }
	| {
			type: "CONNECTION_CHANGED";
			generation: number;
			state: ConnectionState;
	  }
	| {
			type: "SOURCE_ERROR";
			generation: number;
			error: Error;
	  }
	| { type: "CHECK_FRESHNESS"; nowMs?: number }
	| { type: "UNMOUNT" };

export type TelemetryEmitted =
	| {
			type: "VALUES_UPDATED";
			values: ReadonlyMap<string, TelemetrySample>;
			staleChannels: ReadonlySet<string>;
	  }
	| {
			type: "STATUS_CHANGED";
			state: "disconnected" | "connecting" | "connected" | "error";
	  }
	| { type: "ERROR"; error: Error };

/**
 * Creates subscription on source and wires observer back to actorRef via send.
 */
function subscribeSource(
	source: TelemetrySource,
	channels: readonly string[],
	generation: number,
	sendEvent: (event: TelemetryEvent) => void,
): () => void {
	return source.subscribe(channels, {
		next: (batch) => {
			sendEvent({ type: "BATCH_RECEIVED", generation, batch });
		},
		error: (err) => {
			sendEvent({ type: "SOURCE_ERROR", generation, error: err });
		},
		connection: (st) => {
			sendEvent({ type: "CONNECTION_CHANGED", generation, state: st });
		},
	});
}

export const telemetryMachine = setup({
	types: {
		context: {} as TelemetryContext,
		events: {} as TelemetryEvent,
		emitted: {} as TelemetryEmitted,
		input: {} as TelemetryInput,
	},
	delays: {
		FRESHNESS_CHECK_INTERVAL: 1000,
	},
}).createMachine({
	id: "telemetry",
	initial: "disconnected",
	context: ({ input }) => {
		const clock = input?.clock ?? (() => Date.now());
		return {
			source: input?.source ?? null,
			channels: input?.channels ?? [],
			generation: 1,
			values: new Map<string, TelemetrySample>(),
			receivedAt: new Map<string, number>(),
			staleChannels: new Set<string>(),
			connectionState: "disconnected",
			error: null,
			clock,
			staleWindowMs: input?.staleWindowMs ?? FRESHNESS_WINDOW_MS,
			tracker: new ChannelSequenceTracker(),
			activeUnsub: null,
		};
	},
	states: {
		disconnected: {
			entry: assign({
				connectionState: "disconnected" as const,
			}),
			on: {
				CONNECT: {
					target: "connecting",
					actions: [
						assign(({ context, self }) => {
							if (!context.source || context.channels.length === 0) {
								return {};
							}
							if (context.activeUnsub) {
								context.activeUnsub();
							}
							const unsub = subscribeSource(
								context.source,
								context.channels,
								context.generation,
								(ev) => self.send(ev),
							);
							return { activeUnsub: unsub };
						}),
					],
				},
			},
		},
		connecting: {
			entry: assign({
				connectionState: "connecting" as const,
			}),
			on: {
				CONNECTION_CHANGED: [
					{
						guard: ({ event, context }) =>
							event.generation === context.generation &&
							event.state === "connected",
						target: "connected",
					},
					{
						guard: ({ event, context }) =>
							event.generation === context.generation &&
							event.state === "disconnected",
						target: "disconnected",
					},
				],
				SOURCE_ERROR: {
					guard: ({ event, context }) =>
						event.generation === context.generation,
					target: "error",
					actions: assign({
						error: ({ event }) => event.error,
					}),
				},
				DISCONNECT: {
					target: "disconnected",
					actions: assign(({ context }) => {
						if (context.activeUnsub) {
							context.activeUnsub();
						}
						return { activeUnsub: null };
					}),
				},
			},
		},
		connected: {
			entry: assign({
				connectionState: "connected" as const,
				error: null,
			}),
			on: {
				CONNECTION_CHANGED: [
					{
						guard: ({ event, context }) =>
							event.generation === context.generation &&
							event.state === "disconnected",
						target: "disconnected",
					},
					{
						guard: ({ event, context }) =>
							event.generation === context.generation &&
							event.state === "connecting",
						target: "connecting",
					},
				],
				SOURCE_ERROR: {
					guard: ({ event, context }) =>
						event.generation === context.generation,
					target: "error",
					actions: assign({
						error: ({ event }) => event.error,
					}),
				},
				DISCONNECT: {
					target: "disconnected",
					actions: assign(({ context }) => {
						if (context.activeUnsub) {
							context.activeUnsub();
						}
						return { activeUnsub: null };
					}),
				},
			},
		},
		error: {
			entry: assign({
				connectionState: "error" as const,
			}),
			on: {
				CONNECT: {
					target: "connecting",
					actions: [
						assign(({ context, self }) => {
							if (!context.source || context.channels.length === 0) {
								return {};
							}
							if (context.activeUnsub) {
								context.activeUnsub();
							}
							const unsub = subscribeSource(
								context.source,
								context.channels,
								context.generation,
								(ev) => self.send(ev),
							);
							return { activeUnsub: unsub };
						}),
					],
				},
				DISCONNECT: {
					target: "disconnected",
					actions: assign(({ context }) => {
						if (context.activeUnsub) {
							context.activeUnsub();
						}
						return { activeUnsub: null };
					}),
				},
			},
		},
	},
	on: {
		// Global handler: BATCH_RECEIVED
		BATCH_RECEIVED: {
			actions: [
				assign(({ context, event }) => {
					// Discard late samples from older generations (§9.1, AC-050)
					if (event.generation !== context.generation) {
						return {};
					}

					const nowMs = context.clock();
					let changed = false;

					for (const rawSample of event.batch) {
						// 1. Telemetry validation (AC-048)
						const validated = validateTelemetrySample(rawSample, { nowMs });
						if (!validated.valid || !validated.sample) {
							// Reject malformed values (§9.1, AC-048)
							continue;
						}

						const sample = validated.sample;

						// 2. Sequence tracking: discard older/duplicate sequences (§9.1, AC-048)
						const accepted = context.tracker.accept(
							sample.channel,
							sample.sequence,
						);
						if (!accepted) {
							continue;
						}

						context.values.set(sample.channel, sample);
						context.receivedAt.set(sample.channel, nowMs);
						context.staleChannels.delete(sample.channel);
						changed = true;
					}

					return {};
				}),
				emit(({ context }) => ({
					type: "VALUES_UPDATED",
					values: context.values,
					staleChannels: context.staleChannels,
				})),
			],
		},

		// Global handler: CHECK_FRESHNESS (AC-049)
		CHECK_FRESHNESS: {
			actions: [
				assign(({ context, event }) => {
					const nowMs = event.nowMs ?? context.clock();
					let changed = false;

					for (const [channel, ts] of context.receivedAt.entries()) {
						const freshness = checkFreshness(ts, nowMs, context.staleWindowMs);
						if (!freshness.isFresh) {
							if (!context.staleChannels.has(channel)) {
								// Mark as stale while retaining last known value (§9.1, AC-049)
								context.staleChannels.add(channel);
								changed = true;
							}
						} else {
							if (context.staleChannels.has(channel)) {
								context.staleChannels.delete(channel);
								changed = true;
							}
						}
					}

					return {};
				}),
				emit(({ context }) => ({
					type: "VALUES_UPDATED",
					values: context.values,
					staleChannels: context.staleChannels,
				})),
			],
		},

		// Global handler: SET_SOURCE (rebinds source, bumps generation, cleans up old, AC-050)
		SET_SOURCE: {
			actions: [
				assign(({ context, event, self }) => {
					// 1. Cleanup old subscription (exactly once, AC-050)
					if (context.activeUnsub) {
						context.activeUnsub();
					}

					// 2. Bump generation so in-flight / late callbacks are ignored (AC-050)
					const newGen = context.generation + 1;
					context.tracker.resetGeneration();

					let newUnsub: (() => void) | null = null;
					if (event.source && context.channels.length > 0) {
						newUnsub = subscribeSource(
							event.source,
							context.channels,
							newGen,
							(ev) => self.send(ev),
						);
					}

					return {
						source: event.source,
						generation: newGen,
						activeUnsub: newUnsub,
						connectionState: event.source ? "connecting" : "disconnected",
					};
				}),
				emit(({ context }) => ({
					type: "STATUS_CHANGED",
					state: context.connectionState,
				})),
			],
		},

		// Global handler: SET_CHANNELS (updates channel subscription, clears removed)
		SET_CHANNELS: {
			actions: [
				assign(({ context, event, self }) => {
					const newChannelsSet = new Set(event.channels);

					// Clear values for obsolete channels (§9.1)
					for (const ch of Array.from(context.values.keys())) {
						if (!newChannelsSet.has(ch)) {
							context.values.delete(ch);
							context.receivedAt.delete(ch);
							context.staleChannels.delete(ch);
						}
					}

					// Resubscribe active source if needed
					if (context.source) {
						if (context.activeUnsub) {
							context.activeUnsub();
						}
						const newGen = context.generation + 1;
						context.tracker.resetGeneration();
						const newUnsub =
							event.channels.length > 0
								? subscribeSource(
										context.source,
										event.channels,
										newGen,
										(ev) => self.send(ev),
									)
								: null;

						return {
							channels: event.channels,
							generation: newGen,
							activeUnsub: newUnsub,
						};
					}

					return {
						channels: event.channels,
					};
				}),
				emit(({ context }) => ({
					type: "VALUES_UPDATED",
					values: context.values,
					staleChannels: context.staleChannels,
				})),
			],
		},

		// Global handler: UNMOUNT
		UNMOUNT: {
			actions: [
				assign(({ context }) => {
					if (context.activeUnsub) {
						context.activeUnsub();
					}
					return {
						activeUnsub: null,
						generation: context.generation + 1,
						connectionState: "disconnected" as const,
					};
				}),
			],
		},
	},
});
