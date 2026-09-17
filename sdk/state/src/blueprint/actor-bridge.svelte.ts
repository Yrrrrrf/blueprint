// ============================================================================
// Blueprint Actor Bridge for Svelte 5 Runes (§3 errata, §7.1, AC-055)
// Wraps XState actor snapshot with $state.raw to avoid getter destructuring freeze.
// ============================================================================

import type { AnyActorRef, SnapshotFrom } from "xstate";

// Ambient type declaration for TypeScript typecheckers
declare const $state: {
	<T>(initial: T): T;
	raw<T>(initial: T): T;
	snapshot<T>(val: T): T;
};

export class ActorBridge<TActor extends AnyActorRef> {
	readonly #actor: TActor;
	#snapshot: SnapshotFrom<TActor> = $state.raw({} as SnapshotFrom<TActor>);
	#subscription: { unsubscribe: () => void } | null = null;

	constructor(actor: TActor) {
		this.#actor = actor;
		this.#snapshot = actor.getSnapshot();

		this.#subscription = actor.subscribe((nextSnap) => {
			this.#snapshot = nextSnap;
		});

		// Refresh snapshot
		this.#snapshot = actor.getSnapshot();
	}

	get actor(): TActor {
		return this.#actor;
	}

	get snapshot(): SnapshotFrom<TActor> {
		return this.#snapshot;
	}

	send(event: Parameters<TActor["send"]>[0]): void {
		this.#actor.send(event);
	}

	dispose(): void {
		if (this.#subscription) {
			this.#subscription.unsubscribe();
			this.#subscription = null;
		}
	}
}

export function createActorBridge<TActor extends AnyActorRef>(
	actor: TActor,
): ActorBridge<TActor> {
	return new ActorBridge(actor);
}
