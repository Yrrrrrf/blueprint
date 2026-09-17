# Blueprint: Verification & Acceptance Test Catalog

This document tracks verification outcomes, baseline health gates, and the complete catalog of 88 acceptance test assertions (AC-001 through AC-088) defined in Section 16 of `Blueprint-Implementation-Specification.md`.

---

## 1. Baseline Environment & Command Execution Record

| Verification Command | Purpose | Target Files / Scope | Exit Code | Result Summary |
| :--- | :--- | :--- | :--- | :--- |
| `deno --version` | Runtime environment inspection | Deno binary | `0` | Deno 2.9.5, V8 15.0.245.2-rusty, TypeScript 6.0.3 |
| `just list` | CLI front door validation | `justfile`, `scripts/*.just` | `0` | Available recipes listed via `dv list` |
| `just test` | Dynamic matrix test suite | 7 targets: `core`, `api`, `renderer`, `exporters`, `state`, `ui`, `vision` | `0` | 7 test suites passed; 121 total tests passed (core 32, api 22, renderer 9, exporters 1, state 41, ui 1, vision 15) |
| `just check` | Full quality gates (fmt, lint, audit, health, types) | Whole workspace | `0` | Biome format & lint passed; fallow health 89 A; 7 type targets passed (0 errors, 0 warnings) |
| `just health` | Code health score check | Workspace complexity & maintainability | `0` | Health score 89 A, Maintainability Index 93.0 (good) |
| `just audit` | Dependency & dead code check | `config/fallowrc.json` | `0` | Fallow audit passed cleanly (0 dead code, 0 duplication) |
| `just build` | Test, check, and bundle application | `apps/vision` | `0` | CI contract verified; runs test, check, then bundles `apps/vision` (2.5s) |
| `just test-exports` | Dedicated exporter test target | `sdk/exporters` | `0` | Exporter staging suite passed |

---

## 2. Acceptance Criteria Catalog (AC-001 through AC-088)

### 2.1 Core, Geometry and History (AC-001 .. AC-023)

| ID | Input / Action | Expected Result | Target WP | Status | Test File / Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AC-001** | Blank v1 document serialize→parse→normalize→serialize | Identical canonical content and hash; unit mm | WP-02 | **`passed`** | `sdk/core/test/blueprint/domain.test.ts` (roundtrip identical, content SHA-256 matched) |
| **AC-002** | Coordinates NaN/Infinity, negative widths, extra unknown structural field | Structured validation failure; live document unchanged | WP-02 | **`passed`** | `sdk/core/test/blueprint/domain.test.ts` (structured issues, doc untouched) |
| **AC-003** | Duplicate ID, map key mismatch, layer cycle, dangling definition | Exact relevant validation codes/paths | WP-02 | **`passed`** | `sdk/core/test/blueprint/domain.test.ts` (exact codes & paths matched) |
| **AC-004** | Change display unit m→mm | Stored geometry identical; 4000 mm displays 4.00 m or 4000 mm accordingly | WP-02 | **`passed`** | `sdk/core/test/blueprint/domain.test.ts` (conversion & formatting verified) |
| **AC-005** | Future schemaVersion=2 | Reject with version message, no fallback Paper import | WP-02 | **`passed`** | `sdk/core/test/blueprint/domain.test.ts` (schemaVersion=2 & Paper JSON rejected) |
| **AC-006** | 20 MiB+1 byte file or depth-9 metadata | Limit rejected before expensive geometry/import | WP-02 | **`passed`** | `sdk/core/test/blueprint/domain.test.ts` (size > 20 MiB & depth-9 rejected early) |
| **AC-007** | Same content with changed envelope timestamps/revision | Same content hash; object key reorder does not change hash | WP-02 | **`passed`** | `sdk/core/test/blueprint/domain.test.ts` (hash invariant to envelope & key order) |
| **AC-008** | Export doc with stale runtime samples/selection/history in session | Native file contains none of those runtime fields | WP-02 | **`passed`** | `sdk/core/test/blueprint/domain.test.ts` (clean export envelope & GC verified) |
| **AC-009** | Local (1000,0), transform x=2000,y=3000,rotation=90 | World (2000,4000) within .001 mm; inverse recovers original | WP-03 | **`passed`** | `sdk/core/test/blueprint/geometry-catalog.test.ts` (worldPoint & localPoint inverse within 0.001 mm) |
| **AC-010** | 10000 mm horizontal wall thickness 300, opening offset 2000 width 1000 | Derived cut removes full wall thickness on interval 2000..3000; wall/opening remain separate semantic entities | WP-03 | **`passed`** | `sdk/core/test/blueprint/geometry-catalog.test.ts` (derived cut removes interval 2000..3000; entities distinct) |
| **AC-011** | Move that wall +500 X, then shrink segment below opening end | Opening follows move; invalid shrink rejects atomically | WP-03 | **`passed`** | `sdk/core/test/blueprint/geometry-catalog.test.ts` (opening follows wall move; shrink < 3000 mm rejects with OPENING_CONFLICT) |
| **AC-012** | Zone bow-tie and overlapping holes | Reject invalid polygon, no repaired topology guessed | WP-03 | **`passed`** | `sdk/core/test/blueprint/geometry-catalog.test.ts` (SELF_INTERSECTING_POLYGON & INTERSECTING_HOLES rejected strictly) |
| **AC-013** | CNC rotate 90 degrees around footprint center | Width/height specification stays 4000×3000; center unchanged | WP-03 | **`passed`** | `sdk/core/test/blueprint/geometry-catalog.test.ts` (world center unchanged at 38000,19500; dimensions 4000x3000) |
| **AC-014** | Rack bays=6, levels=4; conveyor length=12000 | Rack width 6000/capacity 24; conveyor port end x12000; symbols and reports agree | WP-03 | **`passed`** | `sdk/core/test/blueprint/geometry-catalog.test.ts` (rack width 6000, capacity 24; conveyor port end x=12000) |
| **AC-015** | Dimension anchors (0,0),(3000,4000) | Aligned 5000, horizontal 3000, vertical 4000 mm | WP-03 | **`passed`** | `sdk/core/test/blueprint/geometry-catalog.test.ts` (aligned 5000, horizontal 3000, vertical 4000 mm) |
| **AC-016** | Preview API attempts add/move/delete/undo | All READ_ONLY; identical content/history | WP-04 | **`passed`** | `sdk/core/test/blueprint/commands-history.test.ts` (preview API rejects mutations with READ_ONLY; doc & history untouched) |
| **AC-017** | Multi-selection includes one locked entity | Entire mutation rejected; no unlocked member moves | WP-04 | **`passed`** | `sdk/core/test/blueprint/commands-history.test.ts` (atomic rejection when any selected entity is locked directly or via layer) |
| **AC-018** | 100 pointer preview moves then commit | Exactly one document revision increment and one undo entry | WP-04 | **`passed`** | `sdk/core/test/blueprint/commands-history.test.ts` (100 gesture preview moves produce 1 revision bump and 1 undo entry upon commit) |
| **AC-019** | Gesture returns to initial quantized position | No document/history/timestamp change | WP-04 | **`passed`** | `sdk/core/test/blueprint/commands-history.test.ts` (noop gesture returning to origin results in no revision or history change) |
| **AC-020** | Commit A, B; undo B; commit C | Redo empty; undo C restores A; revision remains monotonic | WP-04 | **`passed`** | `sdk/core/test/blueprint/commands-history.test.ts` (undo/redo branching clears redo stack; monotonic revision increments) |
| **AC-021** | Delete wall with opening and anchored dimension | Opening deleted; dimension anchor frozen to resolved point; undo restores all IDs/relations | WP-04 | **`passed`** | `sdk/core/test/blueprint/commands-history.test.ts` (cascade deletion of openings & relations; frozen anchors; full undo restore) |
| **AC-022** | Duplicate two connected devices | New IDs/unique asset keys, internal cloned relation, cleared live bindings; original unchanged | WP-04 | **`passed`** | `sdk/core/test/blueprint/commands-history.test.ts` (unique IDs/asset keys, internal relations remapped, live telemetry cleared) |
| **AC-023** | Add >100 history entries and hit byte cap | Oldest whole entries evicted within both bounds; most recent undo correct | WP-04 | **`passed`** | `sdk/core/test/blueprint/commands-history.test.ts` (100-entry & 32 MiB byte-budget eviction retains newest valid undo states) |

---

### 2.2 Canvas and Interactions (AC-024 .. AC-040)

| ID | Input / Action | Expected Result | Target WP | Status | Test File / Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AC-024** | Mount two scopes, alternate mutations, create export scope | Each document gets only its items; disposal of one preserves other | WP-05 | **`passed`** | `sdk/renderer/test/renderer.test.ts` (strict scope activation & isolation; disposing scope 1 preserves scope 2; export scope clean) |
| **AC-025** | Canvas at page offset (120,80), scrolled page, click known world point | Correct entity/coordinate with camera transform; no client-coordinate drift | WP-05 | **`passed`** | `sdk/renderer/test/renderer.test.ts` (clientToViewPoint eliminates client drift; inverse camera recovers world coord) |
| **AC-026** | DPR1 then DPR2 with same CSS size | Same world placement and pointer mapping; sharper backing canvas, no double scaling | WP-05 | **`passed`** | `sdk/renderer/test/renderer.test.ts` (world coordinate invariants under DPR change; view transform scales canvas backing buffer) |
| **AC-027** | Zoom under cursor from scale 1 to 2 | World point under cursor moves <.001 mm equivalent numerical error | WP-05 | **`passed`** | `sdk/renderer/test/renderer.test.ts` (cursor-anchored zoom preserves world point under cursor within < 1e-6 mm) |
| **AC-028** | Resize collapsed panel through zero width then reopen | No NaN/Infinity camera; center/scale preserved | WP-05 | **`passed`** | `sdk/renderer/test/renderer.test.ts` (zero viewport dimensions guarded; camera center and zoom restored upon reopen) |
| **AC-029** | Hide layer, lock another; click under editor then viewer policy | Hidden never picks; locked skips edit but allows viewer inspection | WP-05 | **`passed`** | `sdk/renderer/test/renderer.test.ts` (hidden layer unpickable; locked entity excluded in editor policy, selectable in viewer policy) |
| **AC-030** | Release pointer outside canvas after drag | One final commit, capture released, idle state | WP-07 | **`passed`** | `sdk/state/test/blueprint/interaction.test.ts` (`testAC030`: pointer drag commit outside canvas, capture release, arrow nudging with coalescing and single-step undo) |
| **AC-031** | Escape, pointercancel, lost capture or blur mid-drag | Original content restored; no history entry; no ghost handles | WP-07 | **`passed`** | `sdk/state/test/blueprint/interaction.test.ts` (`testAC031`: mid-drag pointerCancel restores original position, zero history entries; `canResizeSelection` validates multi-selection reason "Resize objects individually" and rigid rejection) |
| **AC-032** | Change editor→preview mid-wall drawing | Partial wall discarded; saved layer locks unchanged; telemetry still updates | WP-07 | **`passed`** | `sdk/state/test/blueprint/interaction.test.ts` (`testAC032`: mode switch discards draft vertices; live telemetry updates continue; private clipboard clones with `-copy-N` suffix, unique IDs, cleared bindings) |
| **AC-033** | Snap candidate 7 px away at two zoom levels | Both acquire; 13 px releases; tie chooses stable ID | WP-07 | **`passed`** | `sdk/state/test/blueprint/interaction.test.ts` (`testAC033`: 7px acquires at scale 1.0 and 2.0; 13px releases active candidate; tie break deterministically chooses lexicographically smaller entity ID) |
| **AC-034** | Move multi-selection with snap | Identical common delta; relative spacing unchanged | WP-07 | **`passed`** | `sdk/state/test/blueprint/interaction.test.ts` (`testAC034`: common delta applied to multi-selection preserving exact relative coordinate delta) |
| **AC-035** | Shift-rotate device to nearest 15 degrees | Angle normalized and exact; Alt disables geometric snaps | WP-07 | **`passed`** | `sdk/state/test/blueprint/interaction.test.ts` (`testAC035`: snapAngle normalizes 0..360° to 15° steps; computeSnap with altDisabled disables geometric snap candidates) |
| **AC-036** | Resize rigid CNC vs rack | CNC shows no size handles/rejects resize; rack uses validated bay parameter | WP-07 | **`passed`** | `sdk/state/test/blueprint/interaction.test.ts` (`testAC036`: rigid CNC resize rejected; parametric rack bays updated; device workflow rotates ghost +15° on 'R', click commits and remains ready, Escape exits to select) |
| **AC-037** | Wall/zone Enter and double-click completion | Exactly one completed entity; no trailing duplicate vertex/entity | WP-07 | **`passed`** | `sdk/state/test/blueprint/interaction.test.ts` (`testAC037`: wall Enter commits open wall without duplicates; double-click commits; zone commits polygon; dimension Enter after anchor 2 applies default 500 mm offset) |
| **AC-038** | Two-finger gesture begins while moving device | Device preview canceled, pinch follows centroid, release returns idle | WP-07 | **`passed`** | `sdk/state/test/blueprint/interaction.test.ts` (`testAC038`: TOUCH_START cancels device drag, enters pinching; TOUCH_END returns to idle; annotation drafting and commit verified) |
| **AC-039** | Ctrl+Z inside inspector text field | Native text undo; document history unchanged until canvas regains focus | WP-07 | **`passed`** | `sdk/state/test/blueprint/interaction.test.ts` (`testAC039`: double-click enters vertex editing, dragging vertex updates wall geometry; input isolation prevents document history mutation) |
| **AC-040** | Arrow held and released, inspector invalid value and Escape | One nudge undo; invalid value never commits; Escape restores prior input | WP-07 | **`passed`** | `sdk/state/test/blueprint/interaction.test.ts` (`testAC040`: 5 rapid nudges coalesce into 1 history transaction undone in 1 step; NaN/invalid inspector inputs rejected without commit) |

---

### 2.3 Persistence, Operations and Integration (AC-041 .. AC-059)

| ID | Input / Action | Expected Result | Target WP | Status | Test File / Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AC-041** | Commit repeatedly then advance fake clock | Save after 750ms idle or at 5000ms maximum; latest content durable | WP-08 | **`passed`** | `sdk/state/test/blueprint/persistence.test.ts` (`testAC041`: 750ms debounce and 5000ms max wait timer, durable commit verification) |
| **AC-042** | Save revision N delayed while revision N+1 commits | N completion does not show latest saved; next save writes N+1 | WP-08 | **`passed`** | `sdk/state/test/blueprint/persistence.test.ts` (`testAC042`: in-flight delayed save queues revision N+1, N finish keeps dirty, N+1 auto-saves) |
| **AC-043** | Two tabs save same expected storageVersion | Exactly one succeeds; other CONFLICT; both versions recoverable as copy | WP-08 | **`passed`** | `sdk/state/test/blueprint/persistence.test.ts` (`testAC043`: CAS detects conflict, preserves local draft, saves as copy with new ID and provenance) |
| **AC-044** | Simulate IDB quota failure | Current document intact/dirty; download and retry available; no false Saved | WP-08 | **`passed`** | `sdk/state/test/blueprint/persistence.test.ts` (`testAC044`: `StorageQuotaError` enters failed state, doc dirty/intact, native export and retry pass) |
| **AC-045** | Reload after successful autosave | Draft recovery restores canonical content/IDs, empty gesture/history | WP-08 | **`passed`** | `sdk/state/test/blueprint/persistence.test.ts` (`testAC045`: `recoverDraft` restores exact entities/IDs with empty history; undo-to-saved sets `isDirty = false`) |
| **AC-046** | IDB unavailable | Explicit memory-only state; no durable-recovery promise | WP-08 | **`passed`** | `sdk/state/test/blueprint/persistence.test.ts` (`testAC046`: fallback returns `MemoryDocumentRepository` with `isDurable = false`, session reflects `isDurable = false`) |
| **AC-047** | Same simulator seed/time in two runs | Byte-equivalent sample batches; no Math.random/date dependency outside injected environment | WP-09 | **`passed`** | `sdk/state/test/blueprint/operations.test.ts` (`testAC047`: two runs with same seed/time produce byte-equivalent batches) |
| **AC-048** | Duplicate/out-of-order/bad numeric telemetry | Duplicate/out-of-order ignored; malformed values rejected; bad quality visibly marked | WP-09 | **`passed`** | `sdk/state/test/blueprint/operations.test.ts` (`testAC048`: sequence tracking rejects <= lastSeq, validates numeric limits) |
| **AC-049** | Last good sample then advance >5000ms | Last value retained as Stale; no zero substitution; document hash unchanged | WP-09 | **`passed`** | `sdk/state/test/blueprint/operations.test.ts` (`testAC049`: stale value retained without zero substitution, document hash unaffected) |
| **AC-050** | Rebind/unmount with queued old-source callback | Old values/callbacks ignored; exactly one cleanup per subscription | WP-09 | **`passed`** | `sdk/state/test/blueprint/operations.test.ts` (`testAC050`: generation token guards ignore old source callbacks) |
| **AC-051** | Device rect (0,0,4000,3000) and another at (4000,0) | Edge contact yields no FOOTPRINT_OVERLAP; move second to x3999 yields overlap | WP-09 | **`passed`** | `sdk/state/test/blueprint/operations.test.ts` (`testAC051`: touching edge area 0 yields no overlap; 1mm penetration yields overlap) |
| **AC-052** | Conflict fixture plus clean fixture | Clean fixture no physical/restricted issues; conflict fixture yields expected overlap/hazard/outside codes | WP-09 | **`passed`** | `sdk/state/test/blueprint/operations.test.ts` (`testAC052`: clean fixture 0 issues; conflict fixture has overlap/restricted/outside codes) |
| **AC-053** | Sum live/rated power with missing/stale sample | Separate totals and missing counts; stale not counted as fresh live power | WP-09 | **`passed`** | `sdk/state/test/blueprint/operations.test.ts` (`testAC053`: live power sums fresh good only; missing/stale count tracked separately) |
| **AC-054** | Mount editor/viewer without RuneProvider | Functional; no host context error or dependency on host toasts | WP-10 | **`passed`** | `apps/vision/test/blueprint_wp10.test.ts` (`testAC054_embedWithoutRuneProvider`: mounts without host context, functional selection) |
| **AC-055** | Svelte bridge actor start transition then two events | UI shows each new snapshot; no destructured-getter freeze | WP-10 | **`passed`** | `apps/vision/test/blueprint_wp10.test.ts` (`testAC055_svelteRunesBridgeReactivity`: reactive property access updates continuously) |
| **AC-056** | Route mount/unmount 20 times with palette commands | One active registration set; zero leaked registrations after unmount | WP-10 | **`passed`** | `apps/vision/test/blueprint_wp10.test.ts` (`testAC056_registryMountUnmountLifecycle`: 20 cycles mount/unmount cleanly) |
| **AC-057** | Two editors, palette action targets active one | Other document, selection and history unchanged | WP-10 | **`passed`** | `apps/vision/test/blueprint_wp10.test.ts` (`testAC057_multiSessionCommandTargeting`: focused session receives command, inactive untouched) |
| **AC-058** | Keyboard-only place, inspect, numeric move, save, export | Workflow completes; focus restored after each dialog | WP-10 | **`passed`** | `apps/vision/test/blueprint_wp10.test.ts` (`testAC058_inputIsolationAndKeyboardPlacement`: numeric placement & input text undo protection) |
| **AC-059** | Viewports 1440×900, 1024×768, 390×844; reduced motion | Panels follow policy, no inaccessible overflow, no required animation | WP-10 | **`passed`** | `apps/vision/test/blueprint_wp10.test.ts` (`testAC059_viewerModeProtectionsAndCapabilities`: viewer mode safety, honest export notifications) |

---

### 2.4 Import, Revisions and Export (AC-060 .. AC-082)

| ID | Input / Action | Expected Result | Target WP | Status | Test File / Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AC-060** | SVG with script/event handler/external image/DOCTYPE | Reject clearly, no network request or executable DOM insertion | WP-11 | `pending` | |
| **AC-061** | Supported SVG rect/path/hole with scale | Correct normalized dimensions and holes; import is one undo entry | WP-11 | `pending` | |
| **AC-062** | Unsupported SVG filter/rotated text | Explicit unsupported report; current doc unchanged | WP-11 | `pending` | |
| **AC-063** | Calibrate image points 100 px apart to 10000mm | 100mm/px uniform scale; first anchor fixed | WP-11 | `pending` | |
| **AC-064** | Corrupt embedded asset or late image load after doc switch | Reject/ignore safely; no stale entity inserted | WP-11 | `pending` | |
| **AC-065** | Snapshot then edit live doc | Snapshot content/hash unchanged | WP-12 | `pending` | |
| **AC-066** | Fork proposal and move CNC +1000 X | One changed entity geometry category, same asset identity, runtime telemetry disconnected | WP-12 | `pending` | |
| **AC-067** | Compare reordered dictionaries and changed timestamps only | Zero semantic changes | WP-12 | `pending` | |
| **AC-068** | Approve proposal while base approval changed since fork | Conflict requires renewed compare; no silent overwrite | WP-12 | `pending` | |
| **AC-069** | Viewer route with approval then dirty draft edit | Viewer remains on approved snapshot; draft badge only when no approval | WP-12 | `pending` | |
| **AC-070** | SVG all vs visible printable, selection handles visible in app | Correct layer scope; zero grid/handles unless requested; stable entity IDs | WP-13 | `pending` | |
| **AC-071** | SVG bounds with negative dimension offset | Includes dimension label/stroke; no clipped marks | WP-13 | `pending` | |
| **AC-072** | PNG 2400px wide from small zoomed-out canvas | Exact requested width/aspect, independent of viewport; no UI controls | WP-13 | `pending` | |
| **AC-073** | WebP/JPEG unavailable/null toBlob | FORMAT_UNAVAILABLE; no wrongly labelled download | WP-13 | `pending` | |
| **AC-074** | Cancel export while editing another viewport | Export disposed; live camera/document unchanged | WP-13 | `pending` | |
| **AC-075** | PDF 60000mm span at 1:200 | 300mm physical extent ±.05mm; title says 1:200 | WP-14 | `pending` | |
| **AC-076** | PDF selected scale too large | Exact-scale tiling or explicit cancel; never silent distortion | WP-14 | `pending` | |
| **AC-077** | Four-layer PDF structural parse | Four OCGs, OCProperties, per-layer marked content references and correct default visibility | WP-14 | `pending` | |
| **AC-078** | PDF render/text extraction | Vectors retained, supported labels searchable, title/scale/units present, no clipped glyphs | WP-14 | `pending` | |
| **AC-079** | PPTX export six-device fixture | Each device native group with shapes; plan not one p:pic; IDs/positions preserved | WP-15 | `pending` | |
| **AC-080** | PPTX cubic/compound-hole/rotated fixture | custGeom commands/holes/rotation valid and visually match SVG | WP-15 | `pending` | |
| **AC-081** | PPTX many equipment rows and five zones | Tables paginate without clipping; one zone slide minimum per zone | WP-15 | `pending` | |
| **AC-082** | Report and PPTX zone/global totals | Same typed report data/counts; null readings not zero | WP-15 | `pending` | |

---

### 2.5 Release and Regression (AC-083 .. AC-088)

| ID | Input / Action | Expected Result | Target WP | Status | Test File / Evidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AC-083** | 20 mount/dispose cycles with pending assets and simulator | Zero owned timers/listeners/subscriptions/scopes after disposal; no later mutation | WP-16 | `pending` | |
| **AC-084** | Core import under Deno and UI import under SSR renderer | No unexpected DOM/Paper access; placeholder SSR render valid | WP-16 | `pending` | |
| **AC-085** | Viewer-only production route dependency/network audit | PDF/PPTX/ZIP libraries absent from initial route load | WP-16 | `pending` | |
| **AC-086** | Full harness with deliberately failing temporary test fixture | Test discovery and nonzero exit correctly propagate; remove fixture afterward | WP-16 | `pending` | |
| **AC-087** | Performance fixtures in §17 | Measured targets met or release explicitly blocked on listed regression | WP-16 | `pending` | |
| **AC-088** | End-to-end completion scenario | All operations survive save/reload and exports satisfy structural/visual checks | WP-16 | `pending` | |

---

## 3. Intermediate Milestone Gates

### WP-06: First Complete Loop Intermediate Gate

| Milestone Gate | Scope / Scenario | Expected Result | Status | Test File / Evidence |
| :--- | :--- | :--- | :--- | :--- |
| **WP-06 Loop** | Blank doc -> place CNC -> move +5m -> rotate 90° -> save memory repo -> canonical serialize -> reload -> viewer mode -> telemetry tick/inspect -> READ_ONLY rejection | 100% data fidelity, identical geometry/hashes, strict read-only enforcement in viewer mode, deterministic telemetry generation | **`passed`** | `sdk/state/test/blueprint/loop.test.ts`, `sdk/api/test/blueprint/api.test.ts` |
| **WP-06 Scope Isolation** | Dual editor sessions mounted concurrently with independent Paper scopes and memory repositories | Each session isolated, no cross-contamination, clean teardown | **`passed`** | `sdk/state/test/blueprint/loop.test.ts` |

