# Blueprint — WP-00–09 closure and verification plan

Version: 1.0 · 2026-09-16  
Purpose: executable follow-up for the model with access to the implementation repository and the same reference resources. Execute this plan before declaring WP-00–09 closed. Then execute `Blueprint-WP10-Integrated-Draft-Plan.md`.

## 1. Authority, scope, and user decisions

This is a targeted addendum to `docs/Blueprint-Implementation-Specification.md`, not a replacement architecture. The review used documentation, not implementation source. A missing evidence record is not proof of missing code. Inspect each implementation and its tests first; preserve working behavior, add missing assertions, and repair only demonstrated gaps.

The user's latest decisions override older recommendations:

| Review finding | Decision for this execution |
| --- | --- |
| Browser/acceptance evidence is incomplete | Investigate and close with executable evidence. |
| Constraints worker and WebSocket lifecycle are not sufficiently accounted for | Inspect, complete where needed, and verify. |
| Quality/test-gate concerns | User reports these already fixed. Do not reopen the remediation or retune the gates. |
| CI/script changes and four removed harness-repair rows | Preserve current scripts and CI exactly. Do not restore those rows as active repair requirements. Record that their earlier recommendation is superseded by the user's instruction. |
| Smaller application/documentation inconsistencies | Correct within the application, tests, and documentation scope. |

### Protected surface

Do not modify Justfiles/recipes, `scripts/`, CI workflows, Deno manifests or lockfiles, dependency pins, compatibility shims, lint/audit/health/type/test runner configuration, or build/publish/prune/prepare behavior. This includes `config/fallowrc.json`, `config/vitest.config.ts`, and existing Playwright configuration. Run existing commands unchanged. Add test **source files** within existing discovery conventions; use an already supported direct runner invocation when necessary. Do not add a new runner or bypass a failed assertion. If current tooling cannot execute a required test, record the precise environment/tooling blocker and complete independent application work; do not silently alter the protected surface.

The application may need real bug fixes. This protection does not prohibit changes to renderer, domain, state, repository, UI, or app source, or narrowly scoped test instrumentation. Do not change unrelated React/Vue samples, package versions, or supplied skills.

## 2. Inputs and working protocol

Read these repository documents: implementation specification, API-COMPATIBILITY, EXECUTION-STATUS, VERIFICATION, REFERENCES. Compare against actual source and the supplied Paper.js, Svelte, XState, and Rune Lab resources. Installed declarations control API syntax; the specification controls product behavior subject to this addendum's user overrides.

1. Record branch/commit, working-tree changes, runtime and browser versions, viewport, DPR, and relevant baseline commands. Preserve user edits. Associate final evidence with a commit or a recorded source-file digest when the working tree is dirty.
2. Inventory the named tests and implementations. Map every clause of AC-024–053 to assertions, including negative cases and browser interactions. Inspect existing tests before adding duplicates.
3. For each item below, classify it as `already implemented and verified`, `implemented but missing evidence`, `implementation defect`, or `blocked`. Use these descriptions inside records; retain the existing WP status vocabulary.
4. Run targeted tests, fix demonstrated application defects, then run existing relevant regression commands. Do not broaden unrelated repairs.
5. Update evidence only from observed results. Keep prior execution records as history; never invent a test count, screenshot, browser run, or exit code.

A WP remains `in_progress` while required behavior is unverified, or `blocked` if an external condition prevents verification. Do not erase historically reported passes; explain what the closure review reopens.

## 3. C-01 — Browser rendering and coordinates

Owner: `sdk/renderer`, browser test sources under its existing conventions and `apps/vision/test/`.

| Criteria | Required execution and assertions |
| --- | --- |
| AC-024 | Mount two independent visible canvases/Paper scopes. Alternate mutations and create/dispose a third export-style scope. Assert entity/item ownership, unchanged other-document content, continued interaction in the survivor, and no cross-scope teardown. |
| AC-025 | Render a canvas inside an offset container with actual page scrolling. Click the screen projection of a known world position. Assert world coordinates and picked entity before and after scroll. Include panel resize. Test real DOM bounds, not a stubbed constant alone. |
| AC-026 | Run separate browser contexts at DPR 1 and 2 with identical CSS viewport/canvas size. Assert stable world placement and hit positions; inspect CSS versus backing-buffer dimensions and visible geometry for double scaling. A coordinate helper test alone does not satisfy this criterion. |
| AC-027 | Wheel/zoom at a known cursor point. Preserve its world anchor at the specified numerical tolerance; use direct coordinate assertions for the numeric tolerance and real browser interaction to prove event wiring. |
| AC-028 | Collapse the containing panel to zero size and reopen it. Assert finite camera state, preserved center/scale, and a resumed visible render. |
| AC-029 | Hide one layer and lock another. Verify actual picking under editor and viewer policies; hidden items do not pick, locked items remain inspectable in viewer mode. |

Use stable semantic assertions plus targeted screenshots. Screenshots alone do not establish geometry correctness. Pure helper tests remain valuable, but must be labeled as pure tests.

## 4. C-02 — Interaction, text editing, and first complete workflow

Owner: `sdk/state`, `sdk/ui`, and the Vision browser harness.

| Criteria | Required execution and assertions |
| --- | --- |
| AC-030 | Begin a real pointer drag, move outside canvas, release. Assert pointer capture lifecycle, exactly one commit/revision/history entry, and idle state. |
| AC-031 | Independently parameterize Escape, `pointercancel`, lost pointer capture, and window blur. Each restores original content, creates no history entry, clears handles/preview, and releases capture. Also retain cancellation on document replacement, route departure, and switching to viewer mode. |
| AC-032 | Switch to viewer while drafting a wall. No partial wall commits; layer locks remain identical; telemetry continues. |
| AC-033–037 | Preserve numerical/command tests and add real interaction coverage for snap hysteresis, common-delta multi-move, rotation modifiers, rigid versus parametric resize UI, and Enter/double-click completion without duplicated vertices. |
| AC-038 | Begin device drag, then introduce two touch contacts. Verify drag rollback. Move their centroid with fixed separation to test pan; vary separation with fixed centroid to test zoom; combine both. Release contacts and assert idle, no device change/history entry, and no jump caused by stale drag coordinates. Merely entering `pinching` is insufficient. |
| AC-039 | Focus a real inspector text input, type an edit, invoke platform-native text undo. The input value must undo and document history/revision must remain unchanged. Then focus canvas and verify document undo. Include textarea/contenteditable and a host dialog input where present. |
| AC-040 | Hold/repeat/release arrow nudge and assert one undoable change. Enter invalid inspector text and verify no commit. Enter a valid uncommitted draft, press Escape, and assert prior formatted value restored, error cleared, and unchanged content/history. |
| WP-06 intermediate gate | From the rendered app: create/open document, place device, move and rotate it, undo/redo, download native JSON, reopen the download, and inspect in viewer mode. Assert downloaded content matches canonical document content. Exercise actual file input/download events. |

For touch, prefer the installed browser automation's native touch/multi-contact capability. If unavailable, a browser PointerEvent integration test is useful but must be labeled synthetic; record any remaining real-touch verification gap. Never present state-machine event injection as complete touch hardware evidence.

Do not rely only on `defaultPrevented` for text undo. Assert the editable element's actual value. Prevent browser shortcuts only after the app has determined it will handle an enabled action.

## 5. C-03 — IndexedDB and multi-tab persistence

Owner: `sdk/api/src/blueprint/indexeddb.ts`, persistence machine/session, browser tests.

Keep memory-adapter and fake-clock tests for deterministic logic. Add browser integration against the real IndexedDB adapter using a fresh, isolated database per test environment. Do not delete a user's ordinary development database.

1. **AC-041:** edit through the UI; verify debounce and maximum-wait policies and inspect persisted content. Fake timers may cover precise timing; at least one real browser path must demonstrate successful durable write.
2. **AC-042:** deliberately hold save N through an injected repository gate, commit N+1, release N. Assert UI remains dirty until N+1 is durably saved. Verify the stored content, not just callback order.
3. **AC-043:** open two pages in the **same browser context/origin**, sharing actual IndexedDB. Load the same version in both. Use a test barrier around save initiation, not sleeps, so both submit the same expected storage version. Exactly one succeeds. The loser retains its draft and offers Save as copy or Reload; Save as copy produces a separate recoverable document. BroadcastChannel notifications must not silently overwrite either draft. Reload requires the existing discard/confirmation policy.
4. **AC-044:** inject a quota/unavailable-storage failure at the repository/browser boundary. Preserve dirty content and expose download/retry. Clearly label injected failure; do not claim to have exhausted the real disk quota.
5. **AC-045:** save, close/reload the page, reconstruct a session from actual IndexedDB, and compare canonical content/IDs. History/gesture state must start empty. Verify undo-to-saved clears dirty even with a larger revision number.
6. **AC-046:** force IndexedDB unavailable and observe explicit memory-only UI. Reload must not promise recovery. Native download remains usable.

Guard against hashing or unrelated asynchronous work invalidating an open IndexedDB transaction. If the implementation already obeys that contract, retain it.

## 6. C-04 — Constraints worker completion

First locate `sdk/state/src/blueprint/constraints.worker.ts` or a demonstrably equivalent existing module and its callers. A different filename is acceptable if documented and behaviorally equivalent; avoid creating a duplicate engine.

Required architecture:

- Keep the geometry algorithm pure in `sdk/core`. Synchronous structural command validation remains synchronous.
- Worker requests contain serializable normalized inputs and `{ documentId, revision, generation, jobId }`. Add the request identifier as an implementation detail to distinguish equal-revision reruns.
- Results echo the complete identity. Accept results only if all identity fields match the current requested job/session. This applies to failures as well as successes.
- Permit at most one running job and one replaceable latest pending job. Never create a queue proportional to pointer or telemetry frequency. Geometry checks run on relevant committed changes, not every hover/telemetry update.
- Increment/invalidate generation on document replacement/disposal. Cancel or ignore older jobs. A terminated/restarted worker must not revive old results.
- While checks are pending, expose an explicit pending state. Old issues may remain visible only when labeled outdated; never show a stale count as current or “0 issues” while unknown.
- Worker failure enters the same pure algorithm through bounded cooperative main-thread chunks. Reuse inputs and result identities. If fallback fails too, expose failure; never substitute an empty success.
- Provide a cancellable internal way to await checks for the latest content. Later export WPs use it; implementing export formats is not part of this closure.

Required tests: result B arrives before A; switching documents while A runs; disposal before result; rapid changes retain only latest pending job; startup failure invokes fallback; fallback yields between chunks; worker/fallback return equivalent issues; failure cannot produce a false clean state; pending/latest-result UI contract. Exercise at least one actual module-worker round trip in the browser. Deterministic scheduling tests may use a controllable worker port.

Record the actual file path, request/result contract, pending-state selector, cancellation behavior, and tests in the docs. Worker performance benchmarking remains WP-16; functional scheduling is required now.

## 7. C-05 — WebSocket lifecycle and telemetry boundaries

Use a controlled local test WebSocket server supported by the existing harness, plus injected clock/randomness for deterministic schedule tests. No external live endpoint or credentials are required.

- Enforce one owned connection per session/source; share channels on that connection.
- Validate sample arrays, value types, channel/ID lengths, 1 MiB maximum message size, and 1000-sample maximum. Ignore unrequested channels. Reject invalid payloads without mutating document state or crashing subscriptions.
- Retain most recent accepted sample per channel while limiting rendering publication to at most 10 Hz.
- Prove reconnect bases 1, 2, 4, 8, 16, 30 seconds with specified ±10% injected jitter. Apply the normative absolute 30-second cap after jitter. Reset backoff after 10 connected seconds.
- Reset per-channel sequence acceptance on a new connection generation; do not compare sequence values across sources/generations. Drop late callbacks from the old connection.
- Test rebind/unmount while a callback and reconnect timer are queued. Unsubscribe exactly once; close owned socket, cancel timer, and prevent later mutations/reconnects.
- Check freshness from monotonic receipt time, retained stale value, bad/uncertain quality, future timestamp uncertainty, and distinct connection-versus-machine status.
- Hash/revision/history remain unchanged through telemetry updates and connection failures.
- Blank documents do not automatically connect. Example telemetry is labeled “Simulated data”. Real WebSockets require explicit host configuration.

Preserve AC-047–053's existing deterministic algorithm coverage. Add assertion-level references for visible bad quality and exact cleanup counts; naming a generation-token test is not sufficient evidence for all cleanup behavior.

## 8. C-06 — Small product and documentation corrections

1. Inspect `selection.align` and `selection.distribute`. Alignment accepts two eligible entities; distribution requires at least three. Preserve existing lock/read-only/atomic validation and define the disabled reason for insufficient selection. Add meaningful two-entity alignment and two-entity distribution rejection tests.
2. Restore the missing WP-08 row to EXECUTION-STATUS, with evidence and dependencies consistent with its detailed log. Do not infer final status from the old paragraph alone.
3. Correct canonical preset layer roles everywhere relevant: `foundation`, `sections`, `machinery`, `marks`. Names in PDF planning must map to these roles. Do not implement PDF in this pass.
4. Mark obsolete MANIFEST/PLAN material as historical and link to the normative specification/addenda. Explicitly supersede scenegraph-as-document/history, undecided interaction authority, fixed-only layer architecture, and the obsolete parallel plugin source-tree location.
5. Record the user's decision to retain the current CI/scripts and acceptance of their reported gate fixes. Do not reactivate the four removed harness repair rows or imply they were independently verified here.
6. Ensure evidence summaries match their test bodies. Unrelated vertex-edit assertions do not establish AC-039; add or reference the actual text-undo assertions.

## 9. Evidence contract and completion

For every closure item record:

| Field | Required value |
| --- | --- |
| Requirement | C-ID and AC/WP mapping; each required behavior accounted for |
| Source | Exact implementation and test paths, test names |
| Environment | Source revision/digest, OS, browser/version, viewport, DPR, runner |
| Execution | Actual command, exit code, timestamp, discovered/passed/failed/skipped counts |
| Artifacts | Browser report/trace and relevant screenshots/download assertions; use real paths |
| Remaining limitation | None, or an exact unsupported/unexecuted behavior and its owner |

Place evidence under the repository's existing artifact convention; if none exists, use `artifacts/blueprint/closure/` without changing ignored-file or CI configuration. Do not commit bulky generated artifacts unless the repository already requires it. Link available run outputs in documentation.

Completion requires C-01–C-06 resolved, all reopened acceptance clauses exercised in the appropriate environment, no unexplained failures in affected existing suites, and a diff confirming the protected tooling surface is unchanged. This is a targeted closure gate, not a claim that WP-10–16 are done.

### Executor handoff

Read this file and the main specification, inspect actual implementations, execute C-01 through C-06 in dependency order, repair application defects, and produce honest evidence. Keep the current pipeline intact. Then proceed to the WP-10 integrated-draft plan. If only an environment-dependent check is blocked, finish independent work and report the exact open gate; never relabel it passed.
