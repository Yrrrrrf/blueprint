import { describe, expect, it } from "vite-plus/test";
import { GetterBridge, createDerivedChecker } from "./probe-runes.svelte.ts";

describe("Svelte 5 runes and getter bridge probe", () => {
	it("demonstrates getter bridge evaluates dynamically when accessed via object property", () => {
		const bridge = new GetterBridge();
		expect(bridge.count).toBe(0);

		bridge.inc();
		expect(bridge.count).toBe(1);

		bridge.inc();
		expect(bridge.count).toBe(2);
	});

	it("proves that destructuring a getter evaluates once and freezes value", () => {
		const bridge = new GetterBridge();

		// Evaluating getter once by destructuring:
		const { snapshot } = bridge;
		expect(snapshot.version).toBe(1);
		expect(snapshot.label).toBe("initial");

		// Update bridge snapshot
		bridge.updateSnapshot(2, "updated");

		// The destructured local variable stays frozen at old snapshot!
		expect(snapshot.version).toBe(1);
		expect(snapshot.label).toBe("initial");

		// But accessing through bridge.snapshot yields the new snapshot!
		expect(bridge.snapshot.version).toBe(2);
		expect(bridge.snapshot.label).toBe("updated");
	});

	it("verifies $state.raw behaves by reassignment only", () => {
		const bridge = new GetterBridge();
		const snap1 = bridge.snapshot;
		expect(snap1.version).toBe(1);

		bridge.updateSnapshot(2, "v2");
		const snap2 = bridge.snapshot;
		expect(snap2.version).toBe(2);
		expect(snap1).not.toBe(snap2); // Reassigned new object reference
	});

	it("verifies derived computation over bridge getters", () => {
		const bridge = new GetterBridge();
		const checker = createDerivedChecker(bridge);

		expect(checker.doubled).toBe(0);
		bridge.inc();
		expect(checker.doubled).toBe(2);
		bridge.inc();
		expect(checker.doubled).toBe(4);
	});
});
