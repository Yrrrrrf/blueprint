import { getContext } from "svelte";
import type { BlueprintStore } from "./types.ts";

export const BLUEPRINT_CONTEXT_KEY = Symbol.for(
	"rl:rune-lab.blueprint:blueprint",
);

/**
 * Accessor for the active BlueprintStore within a RuneProvider hierarchy.
 */
export function getBlueprintStore(): BlueprintStore {
	const store = getContext<BlueprintStore>(BLUEPRINT_CONTEXT_KEY);
	if (!store) {
		throw new Error(
			"[rune-lab] getBlueprintStore() found no BlueprintStore. Did you register rune-lab.blueprint in <RuneProvider plugins={[…]}>?",
		);
	}
	return store;
}
