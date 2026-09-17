export class GetterBridge {
	#count = $state(0);
	#rawSnap = $state.raw({ version: 1, label: "initial" });

	get count(): number {
		return this.#count;
	}

	get snapshot() {
		return this.#rawSnap;
	}

	inc() {
		this.#count += 1;
	}

	updateSnapshot(newVersion: number, newLabel: string) {
		this.#rawSnap = { version: newVersion, label: newLabel };
	}

	mutateRawDirectlyFailsReactivity() {
		// mutating property of $state.raw does NOT trigger reassignment reactivity
		(this.#rawSnap as { version: number; label: string }).label =
			"mutated-without-reassignment";
	}
}

export function createDerivedChecker(bridge: GetterBridge) {
	return {
		get doubled() {
			return bridge.count * 2;
		},
	};
}
