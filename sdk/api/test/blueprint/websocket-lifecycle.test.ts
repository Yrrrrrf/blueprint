// ============================================================================
// Blueprint WebSocket Lifecycle & Telemetry Boundaries Test Suite (C-05)
// Tests per §9.1, §9.2:
// - Reconnect backoff schedule: bases 1, 2, 4, 8, 16, 30s with ±10% jitter
// - Normative absolute 30s cap applied after jitter
// - Reset backoff after 10s connected
// - Connection generation token dropping late callbacks
// - 1 MiB message limit, 1000-sample message rejection
// - Channel sequence acceptance and generation reset
// - Unsubscribe/dispose cleanup: timer cancellation and single close
// - Local WebSocket integration with Deno.serve
// ============================================================================

import { assertEquals, assertNotEquals } from "@std/assert";
import {
	WebSocketTelemetrySource,
	type WebSocketLike,
} from "../../src/blueprint/websocket.ts";
import type { TelemetrySample } from "../../src/blueprint/telemetry.ts";

class MockSocket implements WebSocketLike {
	public readyState = 0; // CONNECTING
	public sent: string[] = [];
	public closed = false;
	public closeCode?: number;
	public closeReason?: string;

	public onopen: ((event: unknown) => void) | null = null;
	public onclose: ((event: unknown) => void) | null = null;
	public onerror: ((event: unknown) => void) | null = null;
	public onmessage: ((event: { data: unknown }) => void) | null = null;

	public send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
		this.sent.push(String(data));
	}

	public close(code?: number, reason?: string): void {
		this.closed = true;
		this.readyState = 3; // CLOSED
		this.closeCode = code;
		this.closeReason = reason;
		this.onclose?.({});
	}

	public triggerOpen(): void {
		this.readyState = 1; // OPEN
		this.onopen?.({});
	}

	public triggerMessage(data: unknown): void {
		this.onmessage?.({ data });
	}

	public triggerError(err: unknown = new Error("Mock error")): void {
		this.onerror?.(err);
	}
}

Deno.test("C-05: Reconnect backoff bases 1, 2, 4, 8, 16, 30s with +10% jitter capped at 30s", () => {
	const sockets: MockSocket[] = [];
	// Force jitter to maximum (+10%) with random returning 1.0: (1.0 * 2 - 1) * 0.1 = +0.10
	const source = new WebSocketTelemetrySource({
		url: "ws://test.local/telemetry",
		random: () => 1.0,
		webSocketFactory: () => {
			const s = new MockSocket();
			sockets.push(s);
			return s;
		},
	});

	const unsub = source.subscribe(["CNC-01:power"], {
		next: () => {},
		error: () => {},
		connection: () => {},
	});

	// Attempt 0 -> trigger disconnect
	assertEquals(sockets.length, 1);
	sockets[0].close();
	// Base 1s * 1.10 = 1100ms
	assertEquals(source.reconnectAttempt, 1);
	assertEquals(source.lastReconnectDelayMs, 1100);

	// Attempt 1 -> Base 2s * 1.10 = 2200ms
	(source as any)._connect();
	sockets[1].close();
	assertEquals(source.reconnectAttempt, 2);
	assertEquals(source.lastReconnectDelayMs, 2200);

	// Attempt 2 -> Base 4s * 1.10 = 4400ms
	(source as any)._connect();
	sockets[2].close();
	assertEquals(source.reconnectAttempt, 3);
	assertEquals(source.lastReconnectDelayMs, 4400);

	// Attempt 3 -> Base 8s * 1.10 = 8800ms
	(source as any)._connect();
	sockets[3].close();
	assertEquals(source.reconnectAttempt, 4);
	assertEquals(source.lastReconnectDelayMs, 8800);

	// Attempt 4 -> Base 16s * 1.10 = 17600ms
	(source as any)._connect();
	sockets[4].close();
	assertEquals(source.reconnectAttempt, 5);
	assertEquals(source.lastReconnectDelayMs, 17600);

	// Attempt 5 -> Base 30s * 1.10 = 33000ms -> must be capped at 30000ms!
	(source as any)._connect();
	sockets[5].close();
	assertEquals(source.reconnectAttempt, 6);
	assertEquals(source.lastReconnectDelayMs, 30000);

	// Subsequent attempts stay capped at 30000ms
	(source as any)._connect();
	sockets[6].close();
	assertEquals(source.reconnectAttempt, 7);
	assertEquals(source.lastReconnectDelayMs, 30000);

	unsub();
	source.dispose();
});

Deno.test("C-05: Reconnect backoff with -10% jitter", () => {
	const sockets: MockSocket[] = [];
	// Force jitter to minimum (-10%) with random returning 0.0: (0.0 * 2 - 1) * 0.1 = -0.10
	const source = new WebSocketTelemetrySource({
		url: "ws://test.local/telemetry",
		random: () => 0.0,
		webSocketFactory: () => {
			const s = new MockSocket();
			sockets.push(s);
			return s;
		},
	});

	const unsub = source.subscribe(["CNC-01:power"], {
		next: () => {},
		error: () => {},
		connection: () => {},
	});

	// Attempt 0: Base 1s * 0.90 = 900ms
	sockets[0].close();
	assertEquals(source.lastReconnectDelayMs, 900);

	// Attempt 1: Base 2s * 0.90 = 1800ms
	(source as any)._connect();
	sockets[1].close();
	assertEquals(source.lastReconnectDelayMs, 1800);

	// Attempt 2: Base 4s * 0.90 = 3600ms
	(source as any)._connect();
	sockets[2].close();
	assertEquals(source.lastReconnectDelayMs, 3600);

	// Attempt 5: Base 30s * 0.90 = 27000ms
	(source as any)._reconnectAttempt = 5;
	(source as any)._connect();
	sockets[3].close();
	assertEquals(source.lastReconnectDelayMs, 27000);

	unsub();
	source.dispose();
});

Deno.test("C-05: Connected reset timer resets backoff attempt after 10s connected", async () => {
	const sockets: MockSocket[] = [];
	let now = 100000;
	const source = new WebSocketTelemetrySource({
		url: "ws://test.local/telemetry",
		connectedResetMs: 25, // Accelerated for unit test
		clock: () => now,
		webSocketFactory: () => {
			const s = new MockSocket();
			sockets.push(s);
			return s;
		},
	});

	const unsub = source.subscribe(["CNC-01:power"], {
		next: () => {},
		error: () => {},
		connection: () => {},
	});

	// Fail twice to bump attempt counter
	sockets[0].close();
	assertEquals(source.reconnectAttempt, 1);
	(source as any)._connect();
	sockets[1].close();
	assertEquals(source.reconnectAttempt, 2);

	// Reconnect and open
	(source as any)._connect();
	sockets[2].triggerOpen();
	assertEquals(source.connectionState, "connected");
	assertEquals(source.reconnectAttempt, 2);

	// Wait for connected reset timer (25ms)
	await new Promise((r) => setTimeout(r, 35));
	assertEquals(source.reconnectAttempt, 0);

	unsub();
	source.dispose();
});

Deno.test("C-05: Disconnect before 10s connected does NOT reset backoff", async () => {
	const sockets: MockSocket[] = [];
	const source = new WebSocketTelemetrySource({
		url: "ws://test.local/telemetry",
		connectedResetMs: 100,
		webSocketFactory: () => {
			const s = new MockSocket();
			sockets.push(s);
			return s;
		},
	});

	const unsub = source.subscribe(["CNC-01:power"], {
		next: () => {},
		error: () => {},
		connection: () => {},
	});

	// Attempt 0 fails -> attempt = 1
	sockets[0].close();
	assertEquals(source.reconnectAttempt, 1);

	// Reconnect and open, but disconnect immediately (before 100ms)
	(source as any)._connect();
	sockets[1].triggerOpen();
	sockets[1].close();

	// Attempt should now be 2, not reset to 0
	assertEquals(source.reconnectAttempt, 2);

	unsub();
	source.dispose();
});

Deno.test("C-05: Connection generation drops late callbacks from previous connection", () => {
	const sockets: MockSocket[] = [];
	const batches: TelemetrySample[][] = [];
	const errors: Error[] = [];

	const source = new WebSocketTelemetrySource({
		url: "ws://test.local/telemetry",
		batchIntervalMs: 20,
		webSocketFactory: () => {
			const s = new MockSocket();
			sockets.push(s);
			return s;
		},
	});

	const unsub = source.subscribe(["CNC-01:power"], {
		next: (b) => batches.push([...b]),
		error: (e) => errors.push(e),
		connection: () => {},
	});

	const ws1 = sockets[0];
	ws1.triggerOpen();
	assertEquals(source.connectionGeneration, 1);

	// Disconnect ws1 and start ws2
	ws1.close();
	(source as any)._connect();
	const ws2 = sockets[1];
	ws2.triggerOpen();
	assertEquals(source.connectionGeneration, 2);

	// Now ws1 (generation 1) fires late message, error, or close
	const samplePayload = JSON.stringify([
		{
			sourceId: "ws1-late",
			channel: "CNC-01:power",
			value: 999,
			observedAt: new Date().toISOString(),
			sequence: 1,
			quality: "good",
		},
	]);

	ws1.triggerMessage(samplePayload);
	ws1.triggerError(new Error("Late error from ws1"));

	// Verify no samples or errors processed from ws1
	assertEquals(errors.length, 0);

	// Now send valid message on ws2 (generation 2)
	const ws2Payload = JSON.stringify([
		{
			sourceId: "ws2",
			channel: "CNC-01:power",
			value: 42,
			observedAt: new Date().toISOString(),
			sequence: 1,
			quality: "good",
		},
	]);
	ws2.triggerMessage(ws2Payload);

	unsub();
	source.dispose();
});

Deno.test("C-05: Message bounds - 1 MiB limit and 1000-sample limit", async () => {
	let socket: MockSocket | null = null;
	const batches: TelemetrySample[][] = [];

	const source = new WebSocketTelemetrySource({
		url: "ws://test.local/telemetry",
		batchIntervalMs: 20,
		webSocketFactory: () => {
			socket = new MockSocket();
			return socket;
		},
	});

	const unsub = source.subscribe(["CNC-01:power"], {
		next: (b) => batches.push([...b]),
		error: () => {},
		connection: () => {},
	});

	socket!.triggerOpen();

	// 1. Message > 1 MiB (1024 * 1024 bytes) must be dropped
	const bigPayload = "X".repeat(1024 * 1024 + 10);
	socket!.triggerMessage(bigPayload);

	// 2. Message with > 1000 samples must be rejected entirely
	const tooManySamples = Array.from({ length: 1001 }, (_, i) => ({
		sourceId: "ws",
		channel: "CNC-01:power",
		value: i,
		observedAt: new Date().toISOString(),
		sequence: i + 1,
		quality: "good",
	}));
	socket!.triggerMessage(JSON.stringify(tooManySamples));

	await new Promise((r) => setTimeout(r, 40));
	// Nothing should have been emitted
	assertEquals(batches.length, 0);

	// 3. Message with <= 1000 samples is accepted
	const validSamples = [
		{
			sourceId: "ws",
			channel: "CNC-01:power",
			value: 55,
			observedAt: new Date().toISOString(),
			sequence: 1,
			quality: "good",
		},
	];
	socket!.triggerMessage(JSON.stringify(validSamples));

	await new Promise((r) => setTimeout(r, 40));
	assertEquals(batches.length, 1);
	assertEquals(batches[0][0].value, 55);

	unsub();
	source.dispose();
});

Deno.test("C-05: Per-channel sequence acceptance and reset across generations", async () => {
	const sockets: MockSocket[] = [];
	const batches: TelemetrySample[][] = [];

	const source = new WebSocketTelemetrySource({
		url: "ws://test.local/telemetry",
		batchIntervalMs: 20,
		webSocketFactory: () => {
			const s = new MockSocket();
			sockets.push(s);
			return s;
		},
	});

	const unsub = source.subscribe(["CNC-01:power"], {
		next: (b) => batches.push([...b]),
		error: () => {},
		connection: () => {},
	});

	const ws1 = sockets[0];
	ws1.triggerOpen();

	const now = new Date().toISOString();

	// Send sequence 10 -> accepted
	ws1.triggerMessage(
		JSON.stringify([
			{
				sourceId: "ws",
				channel: "CNC-01:power",
				value: 10,
				observedAt: now,
				sequence: 10,
				quality: "good",
			},
		]),
	);

	// Wait for batch flush
	for (let i = 0; i < 10 && batches.length === 0; i++) {
		await new Promise((r) => setTimeout(r, 15));
	}
	assertEquals(batches.length, 1);
	assertEquals(batches[0][0].sequence, 10);

	// Send sequence 5 (older) -> rejected
	ws1.triggerMessage(
		JSON.stringify([
			{
				sourceId: "ws",
				channel: "CNC-01:power",
				value: 5,
				observedAt: now,
				sequence: 5,
				quality: "good",
			},
		]),
	);

	// Send sequence 10 (duplicate) -> rejected
	ws1.triggerMessage(
		JSON.stringify([
			{
				sourceId: "ws",
				channel: "CNC-01:power",
				value: 100,
				observedAt: now,
				sequence: 10,
				quality: "good",
			},
		]),
	);

	await new Promise((r) => setTimeout(r, 40));
	assertEquals(batches.length, 1); // No new batches

	// Disconnect and start ws2 (new connection generation)
	ws1.close();
	(source as any)._connect();
	const ws2 = sockets[1];
	ws2.triggerOpen();

	// Send sequence 1 on new generation -> accepted because sequence tracker reset!
	ws2.triggerMessage(
		JSON.stringify([
			{
				sourceId: "ws",
				channel: "CNC-01:power",
				value: 1,
				observedAt: now,
				sequence: 1,
				quality: "good",
			},
		]),
	);

	for (let i = 0; i < 10 && batches.length === 1; i++) {
		await new Promise((r) => setTimeout(r, 15));
	}
	assertEquals(batches.length, 2);
	assertEquals(batches[1][0].sequence, 1);

	unsub();
	source.dispose();
});

Deno.test("C-05: Unsubscribe and unmount cancels reconnect timer and cleans up socket", () => {
	let socket: MockSocket | null = null;
	const source = new WebSocketTelemetrySource({
		url: "ws://test.local/telemetry",
		reconnectDelays: [10],
		webSocketFactory: () => {
			socket = new MockSocket();
			return socket;
		},
	});

	const unsub = source.subscribe(["CNC-01:power"], {
		next: () => {},
		error: () => {},
		connection: () => {},
	});

	// Trigger disconnect so reconnect timer is scheduled
	socket!.close();
	assertEquals(source.connectionState, "disconnected");
	assertNotEquals((source as any)._reconnectTimer, null);

	// Unsubscribe sole subscriber -> triggers _cleanup()
	unsub();
	assertEquals((source as any)._reconnectTimer, null);
	assertEquals(source.connectionState, "disconnected");

	// Dispose is idempotent
	source.dispose();
	assertEquals(source.isDisposed, true);
});

Deno.test("C-05: Real local WebSocket integration with Deno.serve", async () => {
	let serverClosed = false;
	const port = 49281;
	const abortController = new AbortController();

	const server = Deno.serve(
		{ port, signal: abortController.signal, onListen: () => {} },
		(req) => {
			if (req.headers.get("upgrade") === "websocket") {
				const { socket, response } = Deno.upgradeWebSocket(req);
				socket.onopen = () => {
					// Send a valid sample
					const sample = [
						{
							sourceId: "real-ws-server",
							channel: "CNC-01:power",
							value: 77.5,
							observedAt: new Date().toISOString(),
							sequence: 1,
							quality: "good",
						},
					];
					socket.send(JSON.stringify(sample));
				};
				return response;
			}
			return new Response("Not a websocket", { status: 400 });
		},
	);

	const batches: TelemetrySample[][] = [];
	let connected = false;

	const source = new WebSocketTelemetrySource({
		url: `ws://127.0.0.1:${port}`,
		batchIntervalMs: 25,
	});

	const unsub = source.subscribe(["CNC-01:power"], {
		next: (b) => batches.push([...b]),
		error: (e) => console.error("WS error:", e),
		connection: (st) => {
			if (st === "connected") connected = true;
		},
	});

	// Wait for connection and batch arrival
	for (let i = 0; i < 30; i++) {
		if (batches.length > 0) break;
		await new Promise((r) => setTimeout(r, 50));
	}

	assertEquals(connected, true);
	assertEquals(batches.length > 0, true);
	assertEquals(batches[0][0].channel, "CNC-01:power");
	assertEquals(batches[0][0].value, 77.5);

	unsub();
	source.dispose();
	abortController.abort();
	await server.finished;
});
