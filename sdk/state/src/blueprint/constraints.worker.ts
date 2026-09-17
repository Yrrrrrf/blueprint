// ============================================================================
// Blueprint Spatial Constraints Web Worker (§8.3, C-04)
// Off-main-thread execution of spatial conflict checks.
// ============================================================================

import { runSpatialChecks } from "@sdk/core";
import type { BlueprintDocument, SpatialIssue } from "@sdk/core";

export interface ConstraintsWorkerRequest {
	documentId: string;
	revision: number;
	generation: number;
	jobId: string;
	doc: BlueprintDocument;
}

export interface ConstraintsWorkerResponse {
	documentId: string;
	revision: number;
	generation: number;
	jobId: string;
	issues: SpatialIssue[];
	error?: string;
}

// In Web Worker environment, self.onmessage handles incoming jobs
if (
	typeof self !== "undefined" &&
	typeof (self as any).postMessage === "function"
) {
	(self as any).onmessage = (event: MessageEvent<ConstraintsWorkerRequest>) => {
		const data = event.data;
		if (!data || typeof data !== "object") return;

		const { documentId, revision, generation, jobId, doc } = data;
		try {
			const issues = runSpatialChecks(doc, { revision });
			const response: ConstraintsWorkerResponse = {
				documentId,
				revision,
				generation,
				jobId,
				issues,
			};
			(self as any).postMessage(response);
		} catch (err: unknown) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			const response: ConstraintsWorkerResponse = {
				documentId,
				revision,
				generation,
				jobId,
				issues: [],
				error: errorMessage,
			};
			(self as any).postMessage(response);
		}
	};
}
