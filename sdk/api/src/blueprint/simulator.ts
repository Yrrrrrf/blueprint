// ============================================================================
// Blueprint Deterministic Telemetry Simulator (§9.2 of Blueprint Specification)
// Pure function generation of sensor readings via 32-bit FNV-1a hash.
// Strictly implements TelemetrySource per §9.1 and AC-047..AC-049.
// ============================================================================

import type { IsoDate } from "@sdk/core";
import type {
	ConnectionState,
	TelemetryObserver,
	TelemetryQuality,
	TelemetrySample,
	TelemetrySource,
	TelemetryValue,
} from "./telemetry.ts";

export interface SimulatorOptions {
	id?: string;
	seed?: string;
	clock?: () => IsoDate;
	tickMs?: number;
	ratedPowerKw?: number | null;
}

type InternalSubscriber = {
	id: string;
	subscribedChannels: Set<string>;
	observer: TelemetryObserver | ((sample: TelemetrySample) => void);
};

/**
 * 32-bit FNV-1a non-cryptographic hash (§9.2).
 */
export function fnv1a32(str: string): number {
	let hash = 0x811c9dc5;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/**
 * Generates deterministic uniform scalar in [0, 1) from hash.
 */
export function deterministicUniform(
	seed: string,
	assetKey: string,
	tick: number,
	field: string,
): number {
	const key = `${seed}:${assetKey}:${tick}:${field}`;
	return fnv1a32(key) / 4294967296.0;
}

/**
 * Normalized field name matcher supporting abbreviations and aliases:
 * load <-> loadPct
 * temperature <-> temperatureC
 * vibration <-> vibrationMmS
 * speed <-> speedMps
 * power <-> powerKw
 */
function normalizeFieldName(name: string): string {
	const lower = name.toLowerCase();
	if (lower === "load" || lower === "loadpct") return "loadPct";
	if (lower === "temperature" || lower === "temperaturec" || lower === "temp")
		return "temperatureC";
	if (lower === "vibration" || lower === "vibrationmms" || lower === "vib")
		return "vibrationMmS";
	if (lower === "speed" || lower === "speedmps") return "speedMps";
	if (lower === "power" || lower === "powerkw") return "powerKw";
	if (lower === "rpm") return "rpm";
	if (lower === "status") return "status";
	return name;
}

/**
 * Parses channel string into assetKey and field.
 * e.g. "ROBOT-01:status" -> { assetKey: "ROBOT-01", field: "status" }
 * e.g. "ROBOT-01.loadPct" -> { assetKey: "ROBOT-01", field: "loadPct" }
 * e.g. "ROBOT-01" -> { assetKey: "ROBOT-01", field: undefined }
 */
export function parseChannel(channel: string): {
	assetKey: string;
	field?: string;
} {
	const sep = channel.includes(":") ? ":" : channel.includes(".") ? "." : null;
	if (!sep) {
		return { assetKey: channel };
	}
	const parts = channel.split(sep);
	return {
		assetKey: parts[0],
		field: normalizeFieldName(parts.slice(1).join(sep)),
	};
}

export class TelemetrySimulator implements TelemetrySource {
	public readonly id: string;
	private readonly _seed: string;
	private readonly _clock: () => IsoDate;
	private readonly _tickMs: number;
	private readonly _ratedPowerKw: number | null;
	private _tick = 0;
	private _intervalId: ReturnType<typeof setInterval> | null = null;
	private readonly _subscribers = new Map<string, InternalSubscriber>();
	private _nextSubId = 1;

	constructor(options: SimulatorOptions = {}) {
		this.id = options.id ?? "simulator";
		this._seed = options.seed ?? "blueprint-nave-v1";
		this._clock = options.clock ?? (() => new Date().toISOString());
		this._tickMs = options.tickMs ?? 1000;
		this._ratedPowerKw =
			options.ratedPowerKw !== undefined ? options.ratedPowerKw : 15;
	}

	get seed(): string {
		return this._seed;
	}

	get tickCount(): number {
		return this._tick;
	}

	public setTick(tick: number): void {
		this._tick = Math.max(0, tick);
	}

	/**
	 * Subscribes to channels/assets (§9.1).
	 * Accepts observer object or legacy callback function.
	 */
	public subscribe(
		channels: readonly string[],
		observer:
			| {
					next(batch: readonly TelemetrySample[]): void;
					error?(error: Error): void;
					connection?(state: ConnectionState): void;
			  }
			| ((sample: TelemetrySample) => void),
	): () => void {
		const id = `sub_${this._nextSubId++}`;
		const normalizedObserver:
			| TelemetryObserver
			| ((sample: TelemetrySample) => void) =
			typeof observer === "function"
				? observer
				: {
						next: (batch) => observer.next(batch),
						error: (err) => observer.error?.(err),
						connection: (state) => observer.connection?.(state),
					};

		this._subscribers.set(id, {
			id,
			subscribedChannels: new Set(channels),
			observer: normalizedObserver,
		});

		if (typeof observer !== "function" && observer.connection) {
			observer.connection("connected");
		}

		return () => {
			this._subscribers.delete(id);
		};
	}

	public start(): void {
		if (this._intervalId !== null) return;
		this._intervalId = setInterval(() => {
			this.tick();
		}, this._tickMs);
	}

	public stop(): void {
		if (this._intervalId !== null) {
			clearInterval(this._intervalId);
			this._intervalId = null;
		}
	}

	/**
	 * Compute deterministic readings for an asset at a specific tick index (§9.2).
	 */
	public computeReadings(
		assetKey: string,
		tick: number,
	): {
		status: "running" | "maintenance" | "offline";
		samples: TelemetrySample[];
	} {
		const cycleTick = tick % 60;
		let status: "running" | "maintenance" | "offline";
		if (cycleTick < 45) {
			status = "running";
		} else if (cycleTick < 50) {
			status = "maintenance";
		} else if (cycleTick < 55) {
			status = "offline";
		} else {
			status = "running";
		}

		const observedAt = this._clock();
		const samples: TelemetrySample[] = [];

		// Status sample is emitted in all states (§9.2)
		samples.push({
			sourceId: this.id,
			channel: `${assetKey}.status`,
			value: status,
			observedAt,
			sequence: tick,
			quality: "good" as TelemetryQuality,
			assetKey,
			field: "status",
		});

		// Offline devices emit status but omit numeric updates (§9.2, AC-049)
		if (status === "offline") {
			return { status, samples };
		}

		// Numeric parameters: loadPct, temperatureC, vibrationMmS, powerKw, rpm, speedMps
		const uLoad = deterministicUniform(this._seed, assetKey, tick, "loadPct");
		const loadPct = Math.round((40 + 50 * uLoad) * 10) / 10;
		samples.push({
			sourceId: this.id,
			channel: `${assetKey}.loadPct`,
			value: loadPct,
			observedAt,
			sequence: tick,
			quality: "good",
			assetKey,
			field: "loadPct",
		});

		const uTemp = deterministicUniform(
			this._seed,
			assetKey,
			tick,
			"temperatureC",
		);
		const temperatureC = Math.round((25 + 40 * uTemp) * 10) / 10;
		samples.push({
			sourceId: this.id,
			channel: `${assetKey}.temperatureC`,
			value: temperatureC,
			observedAt,
			sequence: tick,
			quality: "good",
			assetKey,
			field: "temperatureC",
		});

		const uVib = deterministicUniform(
			this._seed,
			assetKey,
			tick,
			"vibrationMmS",
		);
		const vibrationMmS = Math.round((0.2 + 3 * uVib) * 100) / 100;
		samples.push({
			sourceId: this.id,
			channel: `${assetKey}.vibrationMmS`,
			value: vibrationMmS,
			observedAt,
			sequence: tick,
			quality: "good",
			assetKey,
			field: "vibrationMmS",
		});

		const uRpm = deterministicUniform(this._seed, assetKey, tick, "rpm");
		const rpm = Math.round(1000 + 7000 * uRpm);
		samples.push({
			sourceId: this.id,
			channel: `${assetKey}.rpm`,
			value: rpm,
			observedAt,
			sequence: tick,
			quality: "good",
			assetKey,
			field: "rpm",
		});

		if (this._ratedPowerKw !== null && this._ratedPowerKw > 0) {
			const powerKw =
				Math.round(((this._ratedPowerKw * loadPct) / 100) * 100) / 100;
			samples.push({
				sourceId: this.id,
				channel: `${assetKey}.powerKw`,
				value: powerKw,
				observedAt,
				sequence: tick,
				quality: "good",
				assetKey,
				field: "powerKw",
			});
		}

		// Conveyor speed parameter
		const uSpeed = deterministicUniform(this._seed, assetKey, tick, "speedMps");
		const speedMps = Math.round((0.1 + 1.5 * uSpeed) * 100) / 100;
		samples.push({
			sourceId: this.id,
			channel: `${assetKey}.speedMps`,
			value: speedMps,
			observedAt,
			sequence: tick,
			quality: "good",
			assetKey,
			field: "speedMps",
		});

		return { status, samples };
	}

	/**
	 * Advances tick by 1 and dispatches telemetry samples to all subscribers.
	 */
	public tick(): readonly TelemetrySample[] {
		this._tick++;
		const currentTick = this._tick;

		// Collect all unique assetKeys from all subscribers
		const allAssets = new Set<string>();
		for (const sub of this._subscribers.values()) {
			for (const ch of sub.subscribedChannels) {
				const { assetKey } = parseChannel(ch);
				allAssets.add(assetKey);
			}
		}

		// Also default assets if no subscribers have specific assets
		if (allAssets.size === 0) {
			allAssets.add("ROBOT-01");
			allAssets.add("CONVEYOR-01");
			allAssets.add("CNC-04");
			allAssets.add("SENSOR-04");
			allAssets.add("RACK-01");
			allAssets.add("RACK-02");
		}

		// Compute readings for each asset
		const generatedSamples: TelemetrySample[] = [];
		for (const assetKey of allAssets) {
			const { samples } = this.computeReadings(assetKey, currentTick);
			generatedSamples.push(...samples);
		}

		// Deliver to subscribers
		for (const sub of this._subscribers.values()) {
			const matchingBatch: TelemetrySample[] = [];

			for (const sample of generatedSamples) {
				for (const requestedCh of sub.subscribedChannels) {
					const parsed = parseChannel(requestedCh);
					const assetMatches =
						parsed.assetKey.toLowerCase() ===
						(sample.assetKey ?? "").toLowerCase();

					if (!assetMatches) continue;

					if (!parsed.field) {
						// Subscribed to whole assetKey
						matchingBatch.push(sample);
						break;
					}

					if (parsed.field === sample.field) {
						// Deliver sample with requested channel name so binding match is exact
						matchingBatch.push({
							...sample,
							channel: requestedCh,
						});
						break;
					}
				}
			}

			if (typeof sub.observer === "function") {
				for (const s of matchingBatch) {
					sub.observer(s);
				}
			} else if (matchingBatch.length > 0) {
				sub.observer.next(matchingBatch);
			}
		}

		return generatedSamples;
	}

	/**
	 * Direct snapshot lookup of latest readings for an asset.
	 */
	public getLatest(assetKey: string): Record<string, TelemetryValue> {
		const { status, samples } = this.computeReadings(assetKey, this._tick);
		const result: Record<string, TelemetryValue> = { status };
		for (const sample of samples) {
			if (sample.field) {
				result[sample.field] = sample.value;
			}
		}
		return result;
	}
}

export function createSimulator(
	options?: SimulatorOptions,
): TelemetrySimulator {
	return new TelemetrySimulator(options);
}
