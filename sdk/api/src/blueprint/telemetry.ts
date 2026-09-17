// ============================================================================
// Blueprint Telemetry Protocol & Validation (§9.1 of Blueprint Specification)
// Source contract, sample validation, sequence tracking, and freshness checks.
// ============================================================================

import type { IsoDate } from "@sdk/core";

export type TelemetryStatus = "running" | "maintenance" | "offline" | "unknown";

export type TelemetryValue = number | TelemetryStatus;

export type TelemetryQuality = "good" | "bad" | "uncertain";

export type ConnectionState = "connecting" | "connected" | "disconnected";

/**
 * Discrete point-in-time telemetry sample (§9.1).
 */
export interface TelemetrySample {
	sourceId: string;
	channel: string;
	value: TelemetryValue;
	observedAt: IsoDate;
	sequence: number;
	quality: TelemetryQuality;
	assetKey?: string;
	field?: string;
}

/**
 * Observer interface for streaming telemetry batches (§9.1).
 */
export interface TelemetryObserver {
	next(batch: readonly TelemetrySample[]): void;
	error(error: Error): void;
	connection(state: ConnectionState): void;
}

/**
 * Telemetry source contract (§9.1).
 * Sources emit batches of validated samples to subscribed observers.
 */
export interface TelemetrySource {
	id: string;
	subscribe(
		channels: readonly string[],
		observer: {
			next(batch: readonly TelemetrySample[]): void;
			error(error: Error): void;
			connection(state: ConnectionState): void;
		},
	): () => void;
}

/**
 * Maximum freshness age in milliseconds (§9.1, AC-049).
 */
export const FRESHNESS_WINDOW_MS = 5000;

/**
 * Maximum allowable clock skew ahead of wall clock in milliseconds (§9.1).
 */
export const MAX_CLOCK_SKEW_MS = 60000;

const VALID_STATUSES = new Set<string>([
	"running",
	"maintenance",
	"offline",
	"unknown",
]);

export interface TelemetryValidationOptions {
	nowMs?: number;
}

export interface TelemetryValidationResult {
	valid: boolean;
	error?: string;
	sample?: TelemetrySample;
}

/**
 * Validates a telemetry sample strictly per §9.1:
 * - Reject non-object or null
 * - Channel name max 256 characters
 * - Source ID max 128 characters
 * - Sequence >= 0, finite integer
 * - Numeric values: finite (reject NaN, Infinity)
 * - Load %: bounded in [0, 100]
 * - RPM, speed, power: non-negative (>= 0)
 * - Status strings: exactly "running" | "maintenance" | "offline" | "unknown"
 * - Clock skew > 60s ahead marked "uncertain"
 */
function validateMetadata(raw: Record<string, unknown>): string | null {
	if (typeof raw.channel !== "string" || raw.channel.length === 0) {
		return "Channel must be a non-empty string";
	}
	if (raw.channel.length > 256) {
		return `Channel name exceeds 256 characters (${raw.channel.length})`;
	}
	if (typeof raw.sourceId !== "string" || raw.sourceId.length === 0) {
		return "sourceId must be a non-empty string";
	}
	if (raw.sourceId.length > 128) {
		return `sourceId exceeds 128 characters (${raw.sourceId.length})`;
	}
	if (
		typeof raw.sequence !== "number" ||
		!Number.isInteger(raw.sequence) ||
		raw.sequence < 0
	) {
		return `Sequence must be a non-negative integer, received: ${String(raw.sequence)}`;
	}
	if (typeof raw.observedAt !== "string") {
		return "observedAt must be an ISO string";
	}
	return null;
}

function resolveQuality(
	rawQuality: unknown,
	observedTime: number,
	nowMs: number,
): { quality: TelemetryQuality } | { error: string } {
	let quality: TelemetryQuality = "good";
	if (
		rawQuality === "good" ||
		rawQuality === "bad" ||
		rawQuality === "uncertain"
	) {
		quality = rawQuality;
	} else if (rawQuality !== undefined) {
		return {
			error: `Quality must be good, bad, or uncertain, received: ${String(rawQuality)}`,
		};
	}

	if (observedTime - nowMs > MAX_CLOCK_SKEW_MS) {
		quality = "uncertain";
	}
	return { quality };
}

function validateNumericField(
	field: string | undefined,
	value: number,
): string | null {
	if (!Number.isFinite(value)) {
		return `Numeric telemetry value must be finite, received ${value}`;
	}
	if ((field === "load" || field === "loadPct") && (value < 0 || value > 100)) {
		return `Load percentage must be within [0, 100], received ${value}`;
	}
	if (field === "rpm" && value < 0) {
		return `RPM cannot be negative, received ${value}`;
	}
	if ((field === "speed" || field === "speedMps") && value < 0) {
		return `Speed cannot be negative, received ${value}`;
	}
	if ((field === "power" || field === "powerKw") && value < 0) {
		return `Power cannot be negative, received ${value}`;
	}
	return null;
}

function validateValue(
	value: unknown,
	field: string | undefined,
): string | null {
	if (typeof value === "string") {
		return VALID_STATUSES.has(value)
			? null
			: `Invalid status value '${value}'. Expected running, maintenance, offline, or unknown.`;
	}
	if (typeof value === "number") {
		return validateNumericField(field, value);
	}
	return `Telemetry value must be number or status string, received ${typeof value}`;
}

/**
 * Validates a telemetry sample strictly per §9.1:
 * - Reject non-object or null
 * - Channel name max 256 characters
 * - Source ID max 128 characters
 * - Sequence >= 0, finite integer
 * - Numeric values: finite (reject NaN, Infinity)
 * - Load %: bounded in [0, 100]
 * - RPM, speed, power: non-negative (>= 0)
 * - Status strings: exactly "running" | "maintenance" | "offline" | "unknown"
 * - Clock skew > 60s ahead marked "uncertain"
 */
export function validateTelemetrySample(
	input: unknown,
	options: TelemetryValidationOptions = {},
): TelemetryValidationResult {
	if (!input || typeof input !== "object") {
		return { valid: false, error: "Sample must be a non-null object" };
	}

	const raw = input as Record<string, unknown>;
	const metaError = validateMetadata(raw);
	if (metaError) {
		return { valid: false, error: metaError };
	}

	const observedTime = Date.parse(raw.observedAt as string);
	if (Number.isNaN(observedTime)) {
		return {
			valid: false,
			error: `Invalid observedAt ISO date: ${String(raw.observedAt)}`,
		};
	}

	const nowMs = options.nowMs ?? Date.now();
	const qualResult = resolveQuality(raw.quality, observedTime, nowMs);
	if ("error" in qualResult) {
		return { valid: false, error: qualResult.error };
	}

	const field =
		typeof raw.field === "string"
			? raw.field
			: inferFieldFromChannel(raw.channel as string);

	const valError = validateValue(raw.value, field);
	if (valError) {
		return { valid: false, error: valError };
	}

	const sample: TelemetrySample = {
		sourceId: raw.sourceId as string,
		channel: raw.channel as string,
		value: raw.value as TelemetryValue,
		observedAt: raw.observedAt as IsoDate,
		sequence: raw.sequence as number,
		quality: qualResult.quality,
		...(typeof raw.assetKey === "string" ? { assetKey: raw.assetKey } : {}),
		...(field ? { field } : {}),
	};

	return { valid: true, sample };
}

/**
 * Infer telemetry field name from channel string e.g. "CNC-04:power" or "CNC-04.powerKw".
 */
export function inferFieldFromChannel(channel: string): string | undefined {
	const separator = channel.includes(":")
		? ":"
		: channel.includes(".")
			? "."
			: null;
	if (!separator) return undefined;
	const parts = channel.split(separator);
	return parts[parts.length - 1];
}

/**
 * Per-channel sequence tracker (§9.1, AC-048).
 * Tracks the last accepted sequence number per channel, discarding older or equal sequence numbers.
 * Resets state when a new connection generation is declared.
 */
export class ChannelSequenceTracker {
	private readonly _sequences = new Map<string, number>();
	private _generation = 0;

	get generation(): number {
		return this._generation;
	}

	/**
	 * Declares a new connection generation, resetting all tracked sequences (§9.1).
	 */
	public resetGeneration(): void {
		this._generation++;
		this._sequences.clear();
	}

	/**
	 * Evaluates whether a sample's sequence is accepted (§9.1, AC-048).
	 * Returns true if sequence > last accepted sequence, false if older or duplicate.
	 */
	public accept(channel: string, sequence: number): boolean {
		const last = this._sequences.get(channel);
		if (last !== undefined && sequence <= last) {
			return false;
		}
		this._sequences.set(channel, sequence);
		return true;
	}

	public getSequence(channel: string): number | undefined {
		return this._sequences.get(channel);
	}

	public clear(): void {
		this._sequences.clear();
	}
}

/**
 * Checks sample freshness against current monotonic or wall clock (§9.1, AC-049).
 */
export function checkFreshness(
	receivedAtMs: number,
	nowMs: number,
	windowMs = FRESHNESS_WINDOW_MS,
): { isFresh: boolean; ageMs: number; status: "fresh" | "stale" } {
	const ageMs = Math.max(0, nowMs - receivedAtMs);
	const isFresh = ageMs <= windowMs;
	return {
		isFresh,
		ageMs,
		status: isFresh ? "fresh" : "stale",
	};
}
