// ============================================================================
// Blueprint Autosave Persistence Actor (§10.2 of Blueprint Specification)
// XState v5 statechart managing autosave lifecycle, debounce, max wait,
// queueing revisions, compare-and-swap conflict protocol, and quota failures.
// ============================================================================

import type { BlueprintDocument } from "@sdk/core";
import { computeContentHash } from "@sdk/core";
import type { DocumentRepository, SaveDraftResult } from "@sdk/api";
import { StorageUnavailableError } from "@sdk/api";
import { assign, emit, fromPromise, setup } from "xstate";

export interface PersistenceContext {
	document: BlueprintDocument | null;
	storageVersion: number;
	lastSavedDoc: BlueprintDocument | null;
	lastSavedContentHash: string | null;
	inFlightDoc: BlueprintDocument | null;
	pendingDoc: BlueprintDocument | null;
	error: Error | null;
	conflictStorageVersion: number | null;
	repository: DocumentRepository | null;
}

export interface PersistenceInput {
	document?: BlueprintDocument;
	storageVersion?: number;
	repository?: DocumentRepository;
}

export type PersistenceEvent =
	| { type: "COMMIT"; document: BlueprintDocument }
	| { type: "FLUSH" }
	| { type: "RETRY" }
	| { type: "SET_REPOSITORY"; repository: DocumentRepository }
	| {
			type: "SET_DOCUMENT";
			document: BlueprintDocument;
			storageVersion?: number;
	  }
	| { type: "REMOTE_UPDATE"; documentId: string; storageVersion: number }
	| {
			type: "RESOLVE_RELOAD";
			document: BlueprintDocument;
			storageVersion: number;
	  }
	| {
			type: "RESOLVE_SAVE_COPY";
			document: BlueprintDocument;
			storageVersion: number;
	  };

export type PersistenceEmitted =
	| { type: "SAVED"; document: BlueprintDocument; storageVersion: number }
	| {
			type: "CONFLICT";
			currentStorageVersion: number;
			draft: BlueprintDocument;
	  }
	| { type: "FAILED"; error: Error; draft: BlueprintDocument }
	| { type: "RELOAD_REMOTE"; documentId: string; storageVersion: number };

export const persistenceMachine = setup({
	types: {
		context: {} as PersistenceContext,
		events: {} as PersistenceEvent,
		emitted: {} as PersistenceEmitted,
		input: {} as PersistenceInput,
	},
	actors: {
		saveDraftActor: fromPromise(
			async ({
				input,
			}: {
				input: {
					doc: BlueprintDocument;
					expectedStorageVersion: number;
					repository: DocumentRepository | null;
				};
			}): Promise<SaveDraftResult> => {
				if (!input.repository) {
					throw new StorageUnavailableError(
						"Cannot save draft: no repository attached",
					);
				}
				return await input.repository.saveDraft(
					input.doc,
					input.expectedStorageVersion,
				);
			},
		),
	},
	delays: {
		DEBOUNCE_DELAY: 750,
		MAX_WAIT_DELAY: 5000,
	},
	guards: {
		isDocDirty: ({ context, event }) => {
			if (event.type !== "COMMIT") return false;
			if (!context.lastSavedContentHash) return true;
			return (
				computeContentHash(event.document.content) !==
				context.lastSavedContentHash
			);
		},
		isUndoneToSaved: ({ context, event }) => {
			if (event.type !== "COMMIT") return false;
			return (
				context.lastSavedContentHash !== null &&
				computeContentHash(event.document.content) ===
					context.lastSavedContentHash
			);
		},
		hasPendingEdits: ({ context }) => {
			if (!context.pendingDoc) return false;
			if (!context.lastSavedContentHash) return true;
			return (
				computeContentHash(context.pendingDoc.content) !==
				context.lastSavedContentHash
			);
		},
		isRemoteConflict: ({ context, event }) => {
			if (event.type !== "REMOTE_UPDATE") return false;
			return (
				event.documentId === context.document?.documentId &&
				event.storageVersion > context.storageVersion
			);
		},
	},
}).createMachine({
	id: "persistence",
	initial: "idle",
	context: ({ input }) => {
		const doc = input.document ?? null;
		const hash = doc ? computeContentHash(doc.content) : null;
		return {
			document: doc,
			storageVersion: input.storageVersion ?? 1,
			lastSavedDoc: doc,
			lastSavedContentHash: hash,
			inFlightDoc: null,
			pendingDoc: null,
			error: null,
			conflictStorageVersion: null,
			repository: input.repository ?? null,
		};
	},
	states: {
		idle: {
			on: {
				COMMIT: [
					{
						guard: "isDocDirty",
						actions: assign({
							document: ({ event }) => event.document,
							pendingDoc: ({ event }) => event.document,
						}),
						target: "debouncing",
					},
					{
						actions: assign({
							document: ({ event }) => event.document,
							pendingDoc: null,
						}),
					},
				],
				FLUSH: {
					guard: ({ context }) =>
						context.pendingDoc !== null ||
						(context.document !== null &&
							computeContentHash(context.document.content) !==
								context.lastSavedContentHash),
					actions: assign({
						pendingDoc: ({ context }) => context.pendingDoc ?? context.document,
					}),
					target: "saving",
				},
				SET_DOCUMENT: {
					actions: assign({
						document: ({ event }) => event.document,
						lastSavedDoc: ({ event }) => event.document,
						lastSavedContentHash: ({ event }) =>
							computeContentHash(event.document.content),
						storageVersion: ({ event, context }) =>
							event.storageVersion ?? context.storageVersion,
						pendingDoc: null,
						inFlightDoc: null,
						error: null,
						conflictStorageVersion: null,
					}),
				},
				SET_REPOSITORY: {
					actions: assign({
						repository: ({ event }) => event.repository,
					}),
				},
				REMOTE_UPDATE: {
					guard: "isRemoteConflict",
					actions: [
						assign({
							storageVersion: ({ event }) => event.storageVersion,
						}),
						emit(({ event }) => ({
							type: "RELOAD_REMOTE",
							documentId: event.documentId,
							storageVersion: event.storageVersion,
						})),
					],
				},
			},
		},

		debouncing: {
			initial: "idle_wait",
			after: {
				MAX_WAIT_DELAY: {
					target: "saving",
				},
			},
			on: {
				FLUSH: {
					target: "saving",
				},
				SET_REPOSITORY: {
					actions: assign({
						repository: ({ event }) => event.repository,
					}),
				},
				REMOTE_UPDATE: {
					guard: "isRemoteConflict",
					actions: [
						assign({
							conflictStorageVersion: ({ event }) => event.storageVersion,
						}),
						emit(({ context, event }) => ({
							type: "CONFLICT",
							currentStorageVersion: event.storageVersion,
							draft: context.pendingDoc ?? context.document!,
						})),
					],
					target: "conflict",
				},
			},
			states: {
				idle_wait: {
					after: {
						DEBOUNCE_DELAY: {
							target: "#persistence.saving",
						},
					},
					on: {
						COMMIT: [
							{
								guard: "isUndoneToSaved",
								actions: assign({
									document: ({ event }) => event.document,
									pendingDoc: null,
								}),
								target: "#persistence.idle",
							},
							{
								actions: assign({
									document: ({ event }) => event.document,
									pendingDoc: ({ event }) => event.document,
								}),
								target: "idle_wait",
							},
						],
					},
				},
			},
		},

		saving: {
			entry: assign({
				inFlightDoc: ({ context }) => context.pendingDoc ?? context.document,
				pendingDoc: null,
			}),
			invoke: {
				id: "saveDraftActor",
				src: "saveDraftActor",
				input: ({ context }) => ({
					doc: context.inFlightDoc!,
					expectedStorageVersion: context.storageVersion,
					repository: context.repository,
				}),
				onDone: [
					{
						guard: ({ event }) => event.output.status === "saved",
						actions: [
							assign({
								storageVersion: ({ event }) =>
									(event.output as { status: "saved"; storageVersion: number })
										.storageVersion,
								lastSavedDoc: ({ context }) => context.inFlightDoc,
								lastSavedContentHash: ({ context }) =>
									context.inFlightDoc
										? computeContentHash(context.inFlightDoc.content)
										: null,
								inFlightDoc: null,
								error: null,
							}),
							emit(({ context, event }) => ({
								type: "SAVED",
								document: context.lastSavedDoc!,
								storageVersion: (
									event.output as { status: "saved"; storageVersion: number }
								).storageVersion,
							})),
						],
						target: "check_pending",
					},
					{
						guard: ({ event }) => event.output.status === "conflict",
						actions: [
							assign({
								conflictStorageVersion: ({ event }) =>
									(
										event.output as {
											status: "conflict";
											currentStorageVersion: number;
										}
									).currentStorageVersion,
								inFlightDoc: null,
							}),
							emit(({ context, event }) => ({
								type: "CONFLICT",
								currentStorageVersion: (
									event.output as {
										status: "conflict";
										currentStorageVersion: number;
									}
								).currentStorageVersion,
								draft: context.pendingDoc ?? context.document!,
							})),
						],
						target: "conflict",
					},
				],
				onError: {
					actions: [
						assign({
							error: ({ event }) =>
								event.error instanceof Error
									? event.error
									: new Error(String(event.error)),
							inFlightDoc: null,
						}),
						emit(({ context, event }) => ({
							type: "FAILED",
							error:
								event.error instanceof Error
									? event.error
									: new Error(String(event.error)),
							draft: context.pendingDoc ?? context.document!,
						})),
					],
					target: "failed",
				},
			},
			on: {
				COMMIT: {
					actions: assign({
						document: ({ event }) => event.document,
						pendingDoc: ({ event }) => event.document,
					}),
				},
				SET_REPOSITORY: {
					actions: assign({
						repository: ({ event }) => event.repository,
					}),
				},
			},
		},

		check_pending: {
			always: [
				{
					guard: "hasPendingEdits",
					target: "saving",
				},
				{
					target: "idle",
				},
			],
		},

		conflict: {
			on: {
				COMMIT: {
					actions: assign({
						document: ({ event }) => event.document,
						pendingDoc: ({ event }) => event.document,
					}),
				},
				RESOLVE_RELOAD: {
					actions: assign({
						document: ({ event }) => event.document,
						lastSavedDoc: ({ event }) => event.document,
						lastSavedContentHash: ({ event }) =>
							computeContentHash(event.document.content),
						storageVersion: ({ event }) => event.storageVersion,
						conflictStorageVersion: null,
						pendingDoc: null,
						inFlightDoc: null,
						error: null,
					}),
					target: "idle",
				},
				RESOLVE_SAVE_COPY: {
					actions: assign({
						document: ({ event }) => event.document,
						storageVersion: ({ event }) => event.storageVersion,
						conflictStorageVersion: null,
						pendingDoc: ({ event }) => event.document,
					}),
					target: "saving",
				},
				SET_REPOSITORY: {
					actions: assign({
						repository: ({ event }) => event.repository,
					}),
				},
			},
		},

		failed: {
			on: {
				RETRY: {
					target: "saving",
				},
				FLUSH: {
					target: "saving",
				},
				COMMIT: {
					actions: assign({
						document: ({ event }) => event.document,
						pendingDoc: ({ event }) => event.document,
					}),
				},
				SET_REPOSITORY: {
					actions: assign({
						repository: ({ event }) => event.repository,
					}),
				},
			},
		},
	},
});
