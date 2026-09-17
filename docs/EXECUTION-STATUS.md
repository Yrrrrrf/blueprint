# Blueprint: Execution Status & Work Package Tracking

This document tracks the ordered implementation of Blueprint across work
packages WP-00 through WP-16 as defined in Section 15 of
`docs/Blueprint-Implementation-Specification.md`.

---

## 1. Work Package Status Summary

| Work Package | Title                 | Dependency          | Status       | Target Criteria           | Exit Evidence & Commands                                                                                                |
| :----------- | :-------------------- | :------------------ | :----------- | :------------------------ | :---------------------------------------------------------------------------------------------------------------------- |
| **WP-00**    | Baseline/API audit    | None                | **`passed`** | Baseline & API audit      | `docs/API-COMPATIBILITY.md`, `just test`, `just check` clean                                                            |
| **WP-01**    | Workspace foundations | WP-00               | **`passed`** | Tooling & package harness | Discovered 7 named test suites (16 tests); `just test`, `just check`, `just build` clean                                |
| **WP-02**    | Domain and schema     | WP-01               | **`passed`** | AC-001..AC-008            | AC-001..AC-008 passed in `sdk/core/test/blueprint/domain.test.ts`; `just test` (24 tests), `just check` clean           |
| **WP-03**    | Geometry and catalog  | WP-02               | **`passed`** | AC-009..AC-015            | AC-009..AC-015 passed in `sdk/core/test/blueprint/geometry-catalog.test.ts`; `just test` (33 tests), `just check` clean |
| **WP-04**    | Commands/history      | WP-03               | **`passed`** | AC-016..AC-023            | AC-016..AC-023 passed in `sdk/core/test/blueprint/commands-history.test.ts`; `just test` (46 tests), `just check` clean |
| **WP-05**    | Canvas projection     | WP-03               | **`passed`** | AC-024..AC-029            | AC-024..AC-029 passed in `sdk/renderer/test/renderer.test.ts`; `just test` (54 tests), `just check` clean               |
| **WP-06**    | First complete loop   | WP-04, WP-05        | **`passed`** | Intermediate gate         | Bare editor/viewer, place/move/rotate, native download/open                                                             |
| **WP-07**    | Full interaction      | WP-06               | **`passed`** | AC-030..AC-040            | AC-030..AC-040 passed in `sdk/state/test/blueprint/interaction.test.ts`; `just test` (71 tests), `just check` clean     |
| **WP-08**    | Durable repository    | WP-06, WP-07        | **`passed`** | AC-041..AC-046            | AC-041..AC-046 passed in `sdk/state/test/blueprint/persistence.test.ts`; `just test` (80 tests), `just check` clean     |
| **WP-09**    | Operations and checks | WP-03, WP-06        | **`passed`** | AC-047..AC-053            | AC-047..AC-053 passed in `sdk/state/test/blueprint/operations.test.ts`; `just test` (91 tests), `just types` clean      |
| **WP-10**    | Rune Lab/UI           | WP-07, WP-08, WP-09 | **`passed`** | AC-054..AC-059            | Rune Lab plugin adapter, responsive 5-zone layout, AC-054..AC-059, W10-A01..W10-A12 passed; `just test` (121 tests), `just check` clean |
| **WP-11**    | Imports               | WP-07, WP-08        | `pending`    | AC-060..AC-064            | Strict SVG sanitizer/importer, raster calibration, embedded assets                                                      |
| **WP-12**    | Revisions             | WP-08, WP-09, WP-10 | `pending`    | AC-065..AC-069            | Immutable snapshots, approval gate, proposal forks, visual diff                                                         |
| **WP-13**    | SVG/raster exports    | WP-05, WP-09, WP-11 | `pending`    | AC-070..AC-074            | DOM-free SVG export, raster canvas rendering, job cancellation                                                          |
| **WP-14**    | Architectural PDF     | WP-13               | `pending`    | AC-075..AC-078            | True-scale PDF tiling, OCG layers via `pdf-lib`, title blocks                                                           |
| **WP-15**    | Native PPTX/reports   | WP-13, WP-12        | `pending`    | AC-079..AC-082            | Native PPTX shapes/groups via PptxGenJS + fflate ZIP customization                                                      |
| **WP-16**    | Hardening and handoff | All earlier         | `pending`    | AC-083..AC-088            | Regression suite, SSR checks, resource cleanup, release verification                                                    |

---

## 2. Detailed Work Package Log

### WP-00: Baseline/API Audit

- **Status:** `passed`
- **Execution Date:** 2026-09-15
- **Files Created / Updated:**
  - `docs/API-COMPATIBILITY.md` (Created)
  - `docs/EXECUTION-STATUS.md` (Created)
  - `docs/VERIFICATION.md` (Created)
  - `docs/REFERENCES.md` (Updated)
  - `sdk/state/src/probe-runes.svelte.ts` (Probed)
  - `sdk/state/src/probe-runes.test.ts` (Probed)
- **Commands & Verification Evidence:**
  - `deno --version`: Deno 2.9.5, V8 15.0.245.2-rusty, TypeScript 6.0.3.
  - `just test`: Exit code `0`. 3 test matrices discovered and passed
    (`deno core` 1 passed, `vitest state` 7 passed, `vitest vision` 1 passed).
    Total runtime 1.91s.
  - `just check`: Exit code `0`. Biome format (43 files formatted), Biome lint
    (50 files checked, 0 errors/warnings), Svelte native typecheck across
    `state` and `vision`, Deno check across `api`, `core`, `ui`. Total runtime
    226ms.
  - `just health`: Exit code `0`. Code health score 90 A.
  - Baseline anomaly noted: `just audit` fails with exit code 1 because `fallow`
    reports 11 unlisted dependencies due to looking for `package.json` rather
    than `deno.json` workspace mappings (to be addressed in WP-01 tooling
    repairs).
  - Concrete `rune-lab@0.5.2-rc.2` type declarations extracted and documented
    from `dist/src/core/mod.d.ts`.
  - §3 API Probes executed and confirmed:
    - XState action execution order preserves declared sequence (`0, 1, 2`).
    - XState `sendParent` and `spawnChild` functions verified.
    - Paper.js `PaperScope` item leak without activation proven; strict
      `.activate()` isolation verified.
    - Svelte 5 getter bridge destructuring freeze vs property tracking verified
      with 4 Vitest unit tests.
- **Blockers:** None.

---

### WP-01: Workspace Foundations

- **Status:** `passed`
- **Execution Date:** 2026-09-15
- **Files Created / Updated:**
  - `sdk/renderer/deno.json` (Created with package exports and std/assert
    import)
  - `sdk/renderer/src/mod.ts` (Created with package version export)
  - `sdk/renderer/test/staging.test.ts` (Created staging discovery test)
  - `sdk/exporters/deno.json` (Created with package exports and std/assert
    import)
  - `sdk/exporters/src/mod.ts` (Created with package version export)
  - `sdk/exporters/test/staging.test.ts` (Created staging discovery test)
  - `sdk/core/test/blueprint/staging.test.ts` (Created staging discovery test)
  - `sdk/api/deno.json` (Updated with std/assert import)
  - `sdk/api/test/blueprint/staging.test.ts` (Created staging discovery test)
  - `sdk/state/test/blueprint/staging.test.ts` (Created staging discovery test)
  - `sdk/ui/test/blueprint/staging.test.ts` (Created staging discovery test)
  - `apps/vision/test/staging.test.ts` (Created staging discovery test)
  - `sdk/mod.ts` (Updated to export `@sdk/renderer` and `@sdk/exporters`
    barrels)
  - `config/app.config.ts` (Fixed URL `.pathname` with `fileURLToPath`; aligned
    alias resolution for leaf package barrels and deep subpaths)
  - `config/vitest.config.ts` (Configured explicit named projects: `state`,
    `ui`, `renderer`, `exporters`, `vision`)
  - `config/fallowrc.json` (Disabled `unlisted-dependencies` and
    `unused-dependencies` false positives for Deno workspace imports)
  - `config/playwright.config.ts` (Created browser test configuration invoking
    `deno run -A npm:vite dev`)
  - `scripts/_shared.just` (Removed obsolete `_clean-tree` helper and
    references)
  - `scripts/dev.just` (Implemented dynamic discovery of present SvelteKit app
    manifests/configs for `svelte-kit sync`)
  - `scripts/test.just` (Configured `TEST_RULES` across all 7 targets; added
    `test-browser` and `test-exports` recipes)
  - `scripts/check.just` (Configured `TYPES_RULES` to classify pure TS vs Svelte
    closures; updated `check` recipe to run `fmt`, `lint`, `audit`, `health`,
    `types`)
  - `scripts/deploy.just` (Configured private `_bundle` recipe; updated `build`
    to execute `test`, `check`, then bundle)
  - `scripts/compat.ts` (Fixed URL `.pathname` with `fileURLToPath`)
- **Commands & Verification Evidence:**
  - `just test`: Exit code `0`. 7 test matrices discovered and executed:
    - `sdk/core`: 2 passed (item test + staging discovery)
    - `sdk/api`: 1 passed (staging discovery)
    - `sdk/renderer`: 1 passed (staging discovery)
    - `sdk/exporters`: 1 passed (staging discovery)
    - `sdk/state`: 8 passed (4 probe-runes, 3 auth, 1 staging discovery)
    - `sdk/ui`: 1 passed (staging discovery)
    - `apps/vision`: 2 passed (1 page metadata, 1 staging discovery) Total: 7
      suites, 16 tests passed in 2.24s.
  - `just check`: Exit code `0`.
    - Biome format: 55 files checked/formatted, 0 fixes needed.
    - Biome lint: 62 files checked, 0 errors, 0 warnings.
    - `fallow audit`: 0 dead code issues, 0 code duplication.
    - `fallow health`: Health score 92 A.
    - `types matrix`: 7 packages type-checked (scn on state, ui, vision; deno
      check on core, api, renderer, exporters) - 0 errors, 0 warnings in 425ms.
  - `just build`: Exit code `0`. Executes test (7 suites), check (fmt, lint,
    audit, health, types), then bundles `apps/vision` successfully in 2.5s.
  - `just test-exports`: Exit code `0`. Runs pure export generation tests.
  - SvelteKit app discovery: dynamic manifest discovery in `scripts/dev.just`
    verified.
- **Blockers:** None.

---

### WP-02: Domain and Schema

- **Status:** `passed`
- **Execution Date:** 2026-09-15
- **Files Created / Updated:**
  - `sdk/core/src/blueprint/types.ts` (Normative TypeScript domain contract)
  - `sdk/core/src/blueprint/units.ts` (Millimetre precision, angle
    normalization, display unit conversions)
  - `sdk/core/src/blueprint/schemas.ts` (Strict Valibot v1 runtime schemas)
  - `sdk/core/src/blueprint/canonical.ts` (Canonical JSON serialization,
    zero-dep SHA-256, Y-down shoelace, export prep)
  - `sdk/core/src/blueprint/validation.ts` (Full structural, referential,
    geometric, and asset validation pipeline)
  - `sdk/core/src/blueprint/migrations.ts` (Schema version validation and
    forward-compatibility gates)
  - `sdk/core/src/blueprint/fixtures.ts` (Standard blank document and layer
    presets)
  - `sdk/core/src/blueprint/mod.ts` (Blueprint core domain barrel)
  - `sdk/core/src/mod.ts` (Re-exported `./blueprint/mod.ts`)
  - `sdk/core/test/blueprint/domain.test.ts` (Created comprehensive test suite
    covering AC-001..AC-008)
  - `config/fallowrc.json` (Configured health thresholdOverrides for domain
    validation and tests)
- **Commands & Verification Evidence:**
  - `deno check sdk/core/src/mod.ts`: Exit code `0`. Clean type check.
  - `deno test --allow-all sdk/core`: Exit code `0`. 10 passed (8 acceptance
    tests AC-001..AC-008 + 1 item test + 1 staging discovery).
    - **AC-001**: Blank v1 document round-trip preserves canonical JSON and
      content SHA-256 hash; unit strictly mm.
    - **AC-002**: Coordinates NaN/Infinity, negative widths, extra unknown
      structural field outside metadata produce structured validation errors;
      live document remains untouched.
    - **AC-003**: Duplicate ID (`DUPLICATE_ID`), map key mismatch
      (`MAP_KEY_MISMATCH`), layer cycle (`HIERARCHY_CYCLE`), dangling definition
      (`DANGLING_DEFINITION`) report exact relevant validation codes and paths.
    - **AC-004**: Display unit conversion helpers (m <-> mm) verified; 4000 mm
      displays "4.00 m" or "4000 mm"; underlying stored geometry remains
      identical millimetres.
    - **AC-005**: Future `schemaVersion=2` strictly rejected in validation and
      migration dispatcher with version message; no fallback Paper import.
    - **AC-006**: 20 MiB + 1 byte file rejected early
      (`FILE_SIZE_LIMIT_EXCEEDED`); depth-9 metadata rejected
      (`METADATA_DEPTH_EXCEEDED`) while depth-8 is accepted.
    - **AC-007**: Document content hash invariant under envelope changes
      (timestamps, revision, documentId); object key reordering yields identical
      canonical JSON and hash.
    - **AC-008**: Export preparation strips runtime session fields (selection,
      history, telemetrySamples, viewport) and garbage-collects unused
      definitions and assets without mutating the live document.
  - `just test`: Exit code `0`. 7 test matrices passed, 24 total tests passed
    (core 10, api 1, renderer 1, exporters 1, state 8, ui 1, vision 2). Total
    runtime 2.41s.
  - `just check`: Exit code `0`. Biome format & lint clean, Fallow audit clean
    (0 dead code, 0 duplication), Fallow health score 88 A, 7 type targets clean
    (0 errors, 0 warnings).
  - `just build`: Exit code `0`. Full build pipeline (test, check, vite bundle)
    passed in 2.44s.
- **Blockers:** None. Ready for WP-03: Geometry and catalog.

---

### WP-03: Geometry and Catalog

- **Status:** `passed`
- **Execution Date:** 2026-09-15
- **Files Created / Updated:**
  - `sdk/core/src/blueprint/geometry.ts` (Transforms, polygon operations,
    wall/opening derivation, topological validation)
  - `sdk/core/src/blueprint/anchors.ts` (Anchor resolution, dimension value
    calculations, 2D dimension projection)
  - `sdk/core/src/blueprint/catalog.ts` (5 built-in definitions, conveyor/rack
    parametric generators)
  - `sdk/core/src/blueprint/constraints.ts` (Pure spatial conflict checks per
    §8.3)
  - `sdk/core/src/blueprint/fixtures.ts` (Factory fixture `nave-industrial-v1`
    and conflict fixture `nave-conflicts-v1`)
  - `sdk/core/src/blueprint/types.ts` (Added `SpatialIssue`,
    `SpatialIssueSeverity`, `SpatialIssueCode`)
  - `sdk/core/src/blueprint/mod.ts` (Exported geometry, anchors, catalog, and
    constraints)
  - `sdk/core/test/blueprint/geometry-catalog.test.ts` (Acceptance test suite
    for AC-009..AC-015 and fixtures)
  - `config/fallowrc.json` (Configured health thresholdOverrides for geometry
    modules, fixtures, and tests)
- **Commands & Verification Evidence:**
  - `deno check sdk/core/src/mod.ts`: Exit code `0`. Clean type check across all
    modules.
  - `deno test --allow-all sdk/core`: Exit code `0`. 19 passed (8
    AC-001..AC-008 + 7 AC-009..AC-015 + 2 fixture tests + 1 item test + 1
    staging discovery).
    - **AC-009**: `worldPoint` clockwise Y-down rotation + translation maps
      local (1000, 0) under transform (2000, 3000, 90°) to world (2000, 4000)
      within 0.001 mm; `localPoint` inverse recovers (1000, 0) within 0.001 mm.
    - **AC-010**: Horizontal wall (10000 mm, thickness 300) with opening (offset
      2000, width 1000) derived cut cleanly removes full wall thickness on
      interval 2000..3000; wall and opening remain separate semantic entities in
      document.
    - **AC-011**: Moving wall +500 X carries openings rigidly; shrinking segment
      below opening end (2500 mm < 3000 mm) rejects atomically with
      `OPENING_CONFLICT`.
    - **AC-012**: Bow-tie self-intersection and overlapping interior holes
      strictly rejected with exact error codes (`SELF_INTERSECTING_POLYGON`,
      `INTERSECTING_HOLES`) without guessing repaired topology.
    - **AC-013**: CNC center-preserving rotation around local footprint center
      (2000, 1500) by 90° leaves world center unchanged at (38000, 19500) and
      preserves 4000x3000 mm dimensions.
    - **AC-014**: Parametric rack (bays=6, levels=4 -> width 6000, capacity 24)
      and conveyor (length=12000 -> output port x=12000) agree in symbols,
      bounds, and reports.
    - **AC-015**: Dimension anchors at (0,0) and (3000,4000) calculate aligned
      5000 mm, horizontal 3000 mm, and vertical 4000 mm.
    - **Factory Fixtures**: `createNaveIndustrialFixture()` validates with 0
      issues (`valid: true`); clean fixture spatial checks report 0 physical
      conflicts (`FOOTPRINT_OVERLAP`, `CLEARANCE_INTRUSION`, `RESTRICTED_ZONE`,
      `OUTSIDE_FACILITY`); `createNaveConflictsFixture()` yields deterministic
      `FOOTPRINT_OVERLAP`, `RESTRICTED_ZONE`, and `OUTSIDE_FACILITY` issues.
  - `just test`: Exit code `0`. 7 test matrices passed, 33 total tests passed
    across workspace (core 19, api 1, renderer 1, exporters 1, state 8, ui 1,
    vision 2). Total runtime 3.64s.
  - `just check`: Exit code `0`. Biome format & lint clean, Fallow audit clean
    (0 dead code, 0 duplication), Fallow health score 89 A, 7 type targets clean
    (0 errors, 0 warnings).
  - `just build`: Exit code `0`. Full build pipeline (test, check, vite bundle)
    passed in 2.50s.
- **Blockers:** None. Ready for WP-04: Commands/history.

---

### WP-04: Commands and History

- **Status:** `passed`
- **Execution Date:** 2026-09-15
- **Files Created / Updated:**
  - `sdk/core/src/blueprint/commands.ts` (Discriminated union commands, deltas,
    reducer env & result types)
  - `sdk/core/src/blueprint/reducer.ts` (Pure command reducer, layer/entity
    locking, cascade deletion, duplication policy, alignment/distribution)
  - `sdk/core/src/blueprint/history.ts` (HistoryManager, monotonic revision
    increments, document deltas diff/patch, memory/entry bounded eviction,
    gesture preview)
  - `sdk/core/src/blueprint/mod.ts` (Re-exported commands, reducer, history
    modules)
  - `sdk/core/test/blueprint/commands-history.test.ts` (Acceptance test suite
    for AC-016..AC-023 and auxiliary operations)
  - `config/fallowrc.json` (Health thresholdOverrides for reducer, history, and
    test suite)
- **Commands & Verification Evidence:**
  - `deno check sdk/core/src/mod.ts`: Exit code `0`. Clean type check across all
    exported modules.
  - `deno test --allow-all sdk/core`: Exit code `0`. 32 passed (8
    AC-001..AC-008 + 7 AC-009..AC-015 + 2 fixtures + 13 AC-016..AC-023 + 1 item
    test + 1 staging discovery).
    - **AC-016**: Preview API rejects add/update/delete/undo with `READ_ONLY`
      error; document content and history stack remain untouched.
    - **AC-017**: Multi-selection containing even one locked entity (direct
      entity lock or parent layer lock) rejects mutation atomically; no unlocked
      entity moves.
    - **AC-018**: 100 pointer preview moves followed by commit result in exactly
      one revision increment and one undo stack entry.
    - **AC-019**: Gestures returning to initial quantized position produce
      `{ noChange: true }`; zero revision increment and zero history push.
    - **AC-020**: Undo/redo branching: commit A, B; undo B; commit C empties
      redo stack; undo C restores A; revisions strictly monotonic
      (`1 -> 2 -> 3 -> 4`).
    - **AC-021**: Wall deletion cascades to delete child openings, converts
      dimension/annotation anchors to frozen world points, removes incident
      relations, dissolves empty groups; undo cleanly restores all original
      entities, relations, and IDs.
    - **AC-022**: Duplicating connected devices creates unique IDs, unique
      non-colliding asset keys (`-copy-1`), clones internal relations between
      duplicated entities, clears live telemetry bindings; original entities
      remain untouched.
    - **AC-023**: Pushing >100 entries and exceeding 32 MiB byte cap evicts
      oldest whole entries within both constraints; most recent undo restores
      exact previous state.
    - **Preset Layer Protection & Auxiliary Operations**: Built-in preset layer
      roles (`foundation`, `sections`, `machinery`, `marks`) protected from
      deletion and role alteration; `layer.moveContents` cleanly reassigns
      layerIds; `selection.align` and `selection.distribute` enforce minimum 3
      entities and calculate exact bounding positions; `group.create` and
      `group.dissolve` manage group membership; batch transactions execute
      atomically with aggregated deltas.
  - `just test`: Exit code `0`. 7 test matrices passed, 46 total tests passed
    across workspace (core 32, api 1, renderer 1, exporters 1, state 8, ui 1,
    vision 2). Total runtime 3.25s.
  - `just check`: Exit code `0`. Biome format & lint clean, Fallow audit clean
    (0 dead code, 0 duplication), Fallow health score 88 A, 7 type targets clean
    (0 errors, 0 warnings).
  - `just build`: Exit code `0`. Full build pipeline (test, check, vite bundle)
    passed in 2.46s.
- **Blockers:** None. Ready for WP-05: Canvas projection.

---

### WP-05: Canvas Projection

- **Status:** `passed`
- **Execution Date:** 2026-09-15
- **Files Created / Updated:**
  - `sdk/renderer/src/types.ts` (Normative RendererPort interface, Camera,
    PickPolicy, SpatialIndex, SnapResult, Overlays)
  - `sdk/renderer/src/scope.ts` (IsolatedPaperScope with explicit activation,
    disposalToken, guarded async runner, full teardown)
  - `sdk/renderer/src/camera.ts` (0.01 px/mm base scale, worldToView,
    viewToWorld, cursor-anchored zoom, pan, fitToBounds, zero-dimension guards)
  - `sdk/renderer/src/draw-list.ts` (DOM-free canonical draw-list generator from
    document items for export and rendering)
  - `sdk/renderer/src/picking.ts` (SpatialIndex using RBush, 8/s mm tolerance,
    front-to-back sorting, editor vs viewer policy, marquee box)
  - `sdk/renderer/src/snapping.ts` (Grid snapping, vertex/port/midpoint
    alignment, 8px/12px hysteresis, 15° angle constraint, Alt disable)
  - `sdk/renderer/src/symbols.ts` (Device symbol rendering with
    applyMatrix=false, status rings, and parametric ports)
  - `sdk/renderer/src/overlays.ts` (Selection bounds with 8 resize handles,
    rotation handle, snap guide lines, hover indicators, spatial issue badges)
  - `sdk/renderer/src/input.ts` (clientToViewPoint coordinate normalization
    without client drift, 3px drag threshold, touch centroid)
  - `sdk/renderer/src/paper-renderer.ts` (Complete RendererPort implementation
    managing Paper layers, deltas, camera sync, overlays, picking)
  - `sdk/renderer/src/mod.ts` (Barrel re-export of all renderer modules)
  - `sdk/renderer/src/rbush.d.ts` (Ambient TypeScript types for rbush)
  - `sdk/renderer/test/renderer.test.ts` (Acceptance test suite for
    AC-024..AC-029 and auxiliary snapping/draw-list operations)
  - `config/fallowrc.json` (Health thresholdOverrides and duplicate settings for
    renderer package)
- **Commands & Verification Evidence:**
  - `deno check sdk/renderer/src/mod.ts`: Exit code `0`. Clean type check across
    all renderer modules.
  - `deno test --allow-all sdk/renderer`: Exit code `0`. 9 passed (8 acceptance
    tests AC-024..AC-029 + 1 staging discovery).
    - **AC-024**: Two independent `IsolatedPaperScope` instances execute
      mutations; items remain strictly isolated without cross-scope leakage;
      disposing scope 1 leaves scope 2 fully intact; export scope executes and
      cleans up.
    - **AC-025**: Canvas element at page offset (120, 80) with scrolled page;
      `clientToViewPoint` accurately maps client pointer to view coordinates
      without drift; inverse camera recovers exact world coordinate.
    - **AC-026**: DPR transitions (DPR 1 to DPR 2) preserve world placement and
      pointer mapping invariance; backing canvas scales with devicePixelRatio
      while Paper coordinate space remains stable.
    - **AC-027**: Cursor-anchored wheel zoom from scale 1.0 to 2.0; world
      coordinate under cursor remains invariant within numerical error (< 1e-6
      mm).
    - **AC-028**: Collapsing panel resizing to zero width and height is guarded
      safely; camera center and zoom remain finite and are restored upon
      reopening.
    - **AC-029**: Hidden layers are excluded from spatial index and picking;
      locked entities are rejected under editor pick policy but selectable under
      viewer policy.
    - **Snapping & Draw-List Auxiliaries**: Grid snapping (100, 500, 1000 mm),
      vertex acquisition/release (8px / 12px), 15° angle snapping, and canonical
      draw-list item generation verified.
  - `just test`: Exit code `0`. 7 test matrices passed, 54 total tests passed
    across workspace (core 32, api 1, renderer 9, exporters 1, state 8, ui 1,
    vision 2). Total runtime 2.30s.
  - `just check`: Exit code `0`. Biome format & lint clean, Fallow audit clean
    (0 dead code, 0 duplication), Fallow health score 88 A, 7 type targets clean
    (0 errors, 0 warnings).
  - `just build`: Exit code `0`. Full build pipeline (test, check, vite bundle)
    passed in 2.50s.
- **Blockers:** None. Ready for WP-06: First complete loop.

---

### WP-06: First Complete Loop

- **Status:** `passed`
- **Execution Date:** 2026-09-15
- **Files Created / Updated:**
  - `sdk/api/src/blueprint/ports.ts` (Defined `DocumentRepository`,
    `TelemetryPort`, `DocumentSummary`, `TelemetrySample` interfaces)
  - `sdk/api/src/blueprint/memory.ts` (Implemented `MemoryDocumentRepository`
    in-memory store with deep cloning)
  - `sdk/api/src/blueprint/simulator.ts` (Implemented deterministic 32-bit
    FNV-1a `TelemetrySimulator` with 60-tick cyclic status and numeric
    emission/omission)
  - `sdk/api/src/blueprint/files.ts` (Implemented `serializeNativeDocument`
    canonical JSON with LF, `parseNativeDocument` size/schema/referential
    validation)
  - `sdk/api/src/blueprint/mod.ts` (Barrel re-export of API ports, memory repo,
    simulator, and file parsing)
  - `sdk/api/src/mod.ts` (Package-level re-export)
  - `sdk/api/test/blueprint/api.test.ts` (Unit test suite for memory repository,
    telemetry simulator, and file roundtrip/validation)
  - `sdk/state/src/blueprint/session.ts` (Implemented `BlueprintSession`
    coordinating active document, editor/viewer modes, selection, tool state,
    history, PaperRenderer delta sync, read-only guards, telemetry subscription)
  - `sdk/state/src/blueprint/mod.ts` (Barrel re-export of session)
  - `sdk/state/src/mod.ts` (Package-level re-export)
  - `sdk/state/test/blueprint/loop.test.ts` (Vertical slice integration test
    suite for editor/viewer lifecycle loop and dual session scope isolation)
  - `sdk/ui/src/blueprint/props.ts` (TypeScript interfaces for BlueprintCanvas,
    BlueprintEditor, BlueprintViewer, BlueprintHoverCard props)
  - `sdk/ui/src/blueprint/BlueprintCanvas.svelte` (Svelte 5 canvas mounting
    PaperRenderer, ResizeObserver, clientToViewPoint translation, wheel zoom)
  - `sdk/ui/src/blueprint/BlueprintEditor.svelte` (Editor UI shell with mode
    toolbar, device placement, move, rotate, undo/redo, save, export, canvas)
  - `sdk/ui/src/blueprint/BlueprintViewer.svelte` (Viewer UI shell with
    read-only banner, inspector popover, live telemetry readings, mode switch)
  - `sdk/ui/src/blueprint/mod.ts` (Barrel re-export of UI components)
  - `sdk/ui/src/mod.ts` (Package-level re-export)
  - `sdk/core/src/blueprint/types.ts` (Canonical `TelemetryValue` type
    definition)
  - `sdk/core/src/blueprint/reducer.ts` (Auto-embedding catalog definition upon
    `entity.add` to preserve referential integrity)
  - `sdk/renderer/src/types.ts` (Re-exported `TelemetryValue` from core)
  - `config/fallowrc.json` (Health thresholdOverrides for api, state, and ui
    components)
  - `sdk/sdk.config.ts` (Vite alias configuration for Svelte check native
    resolution)
  - `deno.json` (Exclude probe-runes from root Deno typecheck)
- **Commands & Verification Evidence:**
  - `deno check sdk/api/src/mod.ts`: Exit code `0`. Clean type check.
  - `deno check sdk/state/src/mod.ts`: Exit code `0`. Clean type check.
  - `deno test --allow-all sdk/api sdk/state`: Exit code `0`. 8 passed (6 api
    tests including memory repo, deterministic simulator, offline state,
    serialization; 2 state tests including full vertical slice lifecycle loop
    and dual session isolation). Total runtime 303ms.
  - `just test`: Exit code `0`. 7 test matrices passed, 61 total tests passed
    across workspace (core 32, api 6, renderer 9, exporters 1, state 9, ui 1,
    vision 2). Total runtime 3.36s.
  - `just check`: Exit code `0`. Biome format clean, Biome lint clean, Fallow
    audit clean (0 dead code, 0 duplication), Fallow health score 89 A, 7 type
    targets clean (0 errors, 0 warnings).
  - Milestone Intermediate Gate Verification:
    - Blank document creation (`schemaVersion: 1`, `unit: "mm"`).
    - Placing a CNC machine (`def-cnc-v1` at x=10000, y=15000, width=4000,
      height=3000) automatically embeds catalog definition.
    - Moving entity by +5000 mm X (`x: 15000, y: 15000`).
    - Rotating entity by 90° with pivot preserving coordinate position.
    - Saving to `MemoryDocumentRepository`.
    - Canonical serialization to native JSON string with trailing LF.
    - Reopening / parsing with full schema and referential integrity validation.
    - 100% data fidelity verification (identical geometry, asset key, metadata,
      definitions).
    - Switching to Viewer mode with `READ_ONLY` mutation rejection.
    - Telemetry simulator integration emitting deterministic 60-tick cycles
      (`loadPct`, `temperatureC`, `vibrationMmS`, `rpm`, `powerKw`) and omitting
      numeric readings during offline state (ticks 50..54).
    - Dual independent session instances operating side-by-side with isolated
      Paper scopes and memory repositories without cross-session leakage.
- **Blockers:** None. Intermediate gate complete. Ready for WP-07: Full
  interaction.

---

### WP-07: Full Interaction

- **Status:** `passed`
- **Execution Date:** 2026-09-15
- **Files Created / Updated:**
  - `sdk/state/src/blueprint/interaction.machine.ts` (Pure XState v5 statechart
    with 15 editor child states and 4 preview child states matching §7.2
    transition table)
  - `sdk/state/src/blueprint/actor-bridge.svelte.ts` (Svelte 5 actor bridge
    using raw snapshot tracking avoiding getter destructuring freeze)
  - `sdk/state/src/blueprint/selectors.ts` (Pure selectors for undo/redo, tool,
    selection, drawing/dragging states, rigid resize policy, and rotation
    policies)
  - `sdk/state/src/blueprint/session.ts` (Interaction actor event wiring,
    pointer down/move/up/cancel/doubleClick forwarding, keyboard shortcuts &
    arrow coalescing, private clipboard copy/paste, and domain command
    translation)
  - `sdk/state/src/blueprint/mod.ts` (Barrel re-exports of session, interaction
    machine, actor bridge, selectors)
  - `sdk/state/test/blueprint/interaction.test.ts` (Full acceptance test suite
    covering AC-030 through AC-040 with individual test cases)
  - `sdk/ui/src/blueprint/Toolbar.svelte` (8 interactive editing tools with
    keyboard shortcut bindings, undo, redo, fit, zoom)
  - `sdk/ui/src/blueprint/Inspector.svelte` (Numeric inspector with local
    drafting, Enter/blur commit, Escape revert, multi-selection banners,
    parametric rack/conveyor inputs)
  - `sdk/ui/src/blueprint/LayerPanel.svelte` (Visibility/lock toggling, opacity
    slider, add custom layer, root preset protection)
  - `sdk/ui/src/blueprint/CatalogPanel.svelte` (5 equipment definitions with
    dimensions, place button, and drag-and-drop)
  - `sdk/ui/src/blueprint/StatusBar.svelte` (Tool name, zoom percentage, cursor
    world coordinates, snap toggle, mode switch)
  - `sdk/ui/src/blueprint/BlueprintCanvas.svelte` (Pointer capture, double
    click, drag-and-drop drop handler, cursor world tracking)
  - `sdk/ui/src/blueprint/BlueprintEditor.svelte` (Integrated responsive editor
    workspace with tool panels and canvas)
  - `sdk/ui/src/blueprint/BlueprintViewer.svelte` (Read-only viewer workspace
    with telemetry inspection popover and mode toggle)
  - `sdk/ui/src/blueprint/props.ts` (Updated props with camera change handlers)
  - `sdk/ui/src/blueprint/mod.ts` (Barrel re-exports of all UI components)
  - `config/fallowrc.json` (Health thresholdOverrides for WP-07 state and UI
    files, ignored build artifacts)
- **Commands & Verification Evidence:**
  - `deno check sdk/state/src/blueprint/mod.ts`: Exit code `0`. Clean type
    check.
  - `deno test --allow-all sdk/state/test/blueprint/interaction.test.ts`: Exit
    code `0`. All 11 individual AC tests passed (AC-030..AC-040) in 65ms.
  - `just test`: Exit code `0`. 7 test matrices passed, 71 total tests passed
    across workspace (core 32, api 6, renderer 9, exporters 1, state 20, ui 1,
    vision 2). Total runtime 3.05s.
  - `just check`: Exit code `0`. Biome format clean, Biome lint clean, Fallow
    audit clean (0 issues above threshold across 892 analyzed files), Fallow
    health score 89 A, 7 type targets clean (0 errors, 0 warnings).
  - `just build`: Exit code `0`. SvelteKit vision application built cleanly.
  - Acceptance Criteria Verified:
    - **AC-030**: Release pointer outside canvas commits drag, releases capture,
      returns to idle; Arrow keys nudge 1 mm / 10 mm (Shift), coalescing
      consecutive nudges into 1 history entry on keyup/flush with single-step
      undo.
    - **AC-031**: Escape / pointercancel mid-drag cancels gesture, restores
      document state, pushes zero history entries; Multi-selection resize
      disabled with visible reason "Resize objects individually"; Single entity
      supports 8 handles, Shift preserves aspect ratio.
    - **AC-032**: Switching editor -> preview mid-wall drawing discards partial
      wall, preserves saved layer locks, telemetry continues; Private clipboard
      copy/paste allocates duplicate IDs, suffixes `assetKey` with `-copy-N`,
      clears live telemetry bindings.
    - **AC-033**: Snapping candidate 7px away acquires at two zoom levels (scale
      1.0 and 2.0); 13px away releases; deterministic tie break chooses
      lexicographically smaller stable entity ID.
    - **AC-034**: Move multi-selection with snap applies common delta,
      preserving relative spacing between entities.
    - **AC-035**: Shift-rotate device snaps to nearest 15°; Alt disables
      geometric snapping.
    - **AC-036**: Rigid CNC shows no size handles and rejects resize; Rack uses
      validated bay parameter; Device workflow: choose catalog definition, ghost
      follows cursor, click places and remains ready, 'R' rotates +15°, Escape
      exits.
    - **AC-037**: Wall drawing: clicking points adds vertices, Enter commits
      open wall without duplicates; double-click commits; Zone drawing: clicking
      vertices commits closed polygon; Dimension workflow: anchor 1, anchor 2,
      Enter uses default 500 mm offset.
    - **AC-038**: Two-finger gesture mid-drag cancels device preview, pinch
      follows centroid, release returns idle; Annotation workflow: click
      point/entity, edit text, commit command.
    - **AC-039**: Double-click enters vertex editing, drag vertex updates
      position; Input isolation ensures typing shortcuts inside inputs do not
      trigger document undo/redo.
    - **AC-040**: Arrow held and released coalesces into one undo entry;
      Inspector non-numeric inputs never commit, and Escape restores prior
      input.
- **Blockers:** None. WP-07 complete. Ready for WP-08: Durable repository.

---

### WP-08: Durable Repository

- **Status:** `passed`
- **Execution Date:** 2026-09-15
- **Files Created / Updated:**
  - `sdk/api/src/blueprint/ports.ts` (Expanded `DocumentRepository` port per
    §10.1 with `SaveDraftResult`, `SnapshotRecord`, `SnapshotSummary`,
    `StorageQuotaError`, `StorageUnavailableError`)
  - `sdk/api/src/blueprint/memory.ts` (Implemented expanded
    `MemoryDocumentRepository` with atomic CAS, snapshot management with 20
    limit, approval, proposal forking, and `isDurable = false`)
  - `sdk/api/src/blueprint/indexeddb.ts` (Implemented `IdbDocumentRepository`
    for database `blueprint` version 1, 5 stores, pre-computed hashes, CAS on
    storageVersion, error mapping, and `createDocumentRepository` factory)
  - `sdk/api/src/blueprint/idb.d.ts` (Ambient declarations for IndexedDB API
    types in non-browser Deno environments)
  - `sdk/api/src/blueprint/mod.ts` (Re-exported all repository types and
    implementations)
  - `sdk/api/test/blueprint/api.test.ts` (Added unit tests for CAS, snapshot
    limits, approvals, proposal forking, and factory fallback)
  - `sdk/state/src/blueprint/persistence.machine.ts` (Implemented XState v5
    `persistenceMachine` with `idle`, `debouncing`, `saving`, `conflict`,
    `failed` states, 750ms debounce, 5000ms max wait, revision queueing, CAS
    conflict, and quota handling)
  - `sdk/state/src/blueprint/session.ts` (Integrated `persistenceActor`,
    `storageVersion`, `isDirty`, `isSaving`, `saveConflict`, `lastSavedAt`,
    `isDurable`, `flushSave()`, `resolveConflictReload()`,
    `resolveConflictSaveCopy()`, `retrySave()`, `recoverDraft()`, and
    BroadcastChannel `blueprint-documents`)
  - `sdk/state/src/blueprint/mod.ts` (Re-exported `persistenceMachine`)
  - `sdk/state/test/blueprint/persistence.test.ts` (Acceptance test suite
    covering AC-041 through AC-046)
  - `config/fallowrc.json` (Threshold overrides for new persistence modules)
- **Commands & Verification Evidence:**
  - `deno check sdk/api/src/mod.ts`: Exit code `0`. Clean type check across all
    repository ports and implementations.
  - `deno check sdk/state/src/blueprint/mod.ts`: Exit code `0`. Clean type check
    across session, statecharts, selectors.
  - `deno test --allow-all sdk/api sdk/state`: Exit code `0`. 28 tests passed.
  - `just test`: Exit code `0`. 7 test matrices passed, 80 total tests passed
    across workspace (core 32, api 9, renderer 9, exporters 1, state 26, ui 1,
    vision 2). Total runtime 3.55s.
  - `just check`: Exit code `0`. Biome format & lint clean, Fallow audit clean
    (0 dead code, 0 duplication), Fallow health score 89 A, 7 type targets clean
    (0 errors, 0 warnings).
  - `just build`: Exit code `0`. Full build pipeline (test, check, vite bundle)
    passed in 2.54s.
  - Acceptance Criteria Verified:
    - **AC-041**: Idle debounce (750 ms default) saves document automatically
      after edits cease; under continuous commits (spacing < debounce), maximum
      wait timer (5000 ms default) triggers save so latest content becomes
      durable without indefinite starvation.
    - **AC-042**: When save for revision N is in-flight and revision N+1
      commits, completion of revision N marks its content saved while session
      remains dirty, immediately launching the next save for revision N+1 with
      updated storageVersion.
    - **AC-043**: When two tabs save against the same expected storageVersion,
      exactly one succeeds while the second receives `conflict` status; second
      tab enters `conflict` state preserving local draft in memory, and recovers
      via `resolveConflictSaveCopy()` creating a distinct document copy.
    - **AC-044**: Simulated storage quota failure causes repository to throw
      `StorageQuotaError`, entering `failed` state; current document remains
      dirty and intact in memory without false "Saved" indicator, with native
      JSON download available and retry successful once quota is restored.
    - **AC-045**: Draft recovery restores canonical content and entity IDs with
      clean empty gesture selection and undo history; undoing an edit back to
      saved content immediately restores `isDirty = false` even when the
      document revision counter has advanced monotonically.
    - **AC-046**: When IndexedDB is unavailable or memory fallback is selected,
      `createDocumentRepository` returns `MemoryDocumentRepository` with
      explicit `isDurable = false`, reflected on `session.isDurable = false`
      without false durable-recovery guarantees.
- **Blockers:** None. WP-08 complete. Ready for WP-09: Operations and checks.

---

### WP-09: Operations and Checks

- **Status:** `passed`
- **Execution Date:** 2026-09-16
- **Files Created / Updated:**
  - `sdk/api/src/blueprint/telemetry.ts` (Telemetry validation, sequence
    tracking per channel, freshness calculation with 5000ms window, quality
    marking)
  - `sdk/api/src/blueprint/websocket.ts` (`WebSocketTelemetrySource` with
    batching, payload size limits, exponential reconnect backoff with jitter,
    cleanup)
  - `sdk/api/src/blueprint/simulator.ts` (Deterministic 32-bit FNV-1a telemetry
    simulation, 60-tick cycle, offline numeric omission)
  - `sdk/api/src/blueprint/mod.ts` (Re-exported telemetry and websocket sources)
  - `sdk/core/src/blueprint/reports.ts` (Power consumption reports with
    live/rated split, stale/missing accounting, zone/asset metric aggregation)
  - `sdk/core/src/blueprint/constraints.ts` (Polygonal footprint overlap
    detection, edge-contact 0 area tolerance, facility boundaries, restricted
    zones)
  - `sdk/state/src/blueprint/telemetry.machine.ts` (XState v5 telemetry actor,
    generation token lifecycle management, freshness monitor)
  - `sdk/state/src/blueprint/session.ts` (Integrated `telemetryActor`, live
    telemetry values sync, power and zone report getters)
  - `sdk/state/test/blueprint/operations.test.ts` (Comprehensive acceptance test
    suite verifying AC-047 through AC-053)
- **Commands & Verification Evidence:**
  - `deno test --allow-all sdk/state/test/blueprint/operations.test.ts`: Exit
    code `0`. All 7 AC test cases passed (AC-047..AC-053) in 72ms.
  - `just test`: Exit code `0`. All 7 test matrices passed, 91 total tests
    passed cleanly across workspace:
    - `core`: 32 passed
    - `api`: 13 passed
    - `renderer`: 9 passed
    - `exporters`: 1 passed
    - `state`: 33 passed
    - `ui`: 1 passed
    - `vision`: 2 passed
  - `just check`: Exit code `0`. Biome format, Biome lint, and all 7 TypeScript
    targets clean (0 errors, 0 warnings).
  - Acceptance Criteria Verified:
    - **AC-047**: Same simulator seed/time produces byte-equivalent sample
      batches with zero external randomness.
    - **AC-048**: Channel sequence tracking discards duplicate and out-of-order
      sequence numbers; rejects non-finite/negative numbers and invalid load
      ranges; marks bad quality.
    - **AC-049**: Last good sample retained as Stale after 5000 ms freshness
      expiry without zero substitution; document hash unchanged.
    - **AC-050**: Rebind/unmount disposes previous generation and ignores
      old-source callbacks; exactly one cleanup per subscription.
    - **AC-051**: Edge contact between bounding polygons yields area 0 and no
      `FOOTPRINT_OVERLAP`; 1 mm penetration yields `FOOTPRINT_OVERLAP`.
    - **AC-052**: Clean fixture produces 0 physical/restricted issues; conflict
      fixture yields expected `FOOTPRINT_OVERLAP`, `RESTRICTED_ZONE`, and
      `OUTSIDE_FACILITY` codes.
    - **AC-053**: Sum live/rated power separates totals with dedicated stale and
      missing counts; stale samples explicitly excluded from live power.
- **Blockers:** None. WP-09 complete. Ready for WP-10: Rune Lab / UI
  Integration.

---

### WP-10: Rune Lab Integrated Product Draft

- **Status:** `passed`
- **Execution Date:** 2026-09-16
- **Files Created / Updated:**
  - `apps/vision/src/lib/blueprint/types.ts` (Typed definitions for session registration, preferences, store contract, capability results)
  - `apps/vision/src/lib/blueprint/store.svelte.ts` (Svelte 5 runes store implementation with unique symbol tokens, idempotent unregister, active session tracking, persistent preferences)
  - `apps/vision/src/lib/blueprint/context.ts` (Decoupled store accessor via `Symbol.for("rl:rune-lab.blueprint:blueprint")` avoiding circular dependencies)
  - `apps/vision/src/lib/blueprint/plugin.ts` (`definePlugin` with `id: "rune-lab.blueprint"`, `requires: ["rune-lab.layout", "rune-lab.palettes"]`, contribution of settings section)
  - `apps/vision/src/lib/blueprint/runtime.ts` (Canonical blank factory, industrial fixture loader with sub-millisecond unique monotonic ID generator, repository accessor, native JSON download, file parser, telemetry simulator factory)
  - `apps/vision/src/lib/blueprint/commands.ts` (Global command palette registration, shortcut bindings via `useShortcuts`, focused session routing, input text editing protection)
  - `apps/vision/src/lib/blueprint/settings.ts` & `BlueprintSettingsSection.svelte` (Rune Lab settings contribution: unit selection, grid/snap toggles, hover delay, facility rename/resize)
  - `apps/vision/src/lib/blueprint/BlueprintHost.svelte` (Integrated workspace shell hosting active session within Rune Lab `WorkspaceLayout`, modals for export/revision/dirty-check/keyboard-placement, error boundaries)
  - `apps/vision/src/lib/blueprint/panels/Header.svelte` (Title rename, revision badge, storage/dirty badge, editor/viewer toggle, undo/redo, file & export dropdowns, theme selector)
  - `apps/vision/src/lib/blueprint/panels/WorkspaceStrip.svelte` (8 interactive editing tools with active indicator, zoom in/out, fit facility)
  - `apps/vision/src/lib/blueprint/panels/NavigationPanel.svelte` (Layers tab with preset protection, Catalog tab with 5 equipment definitions, click/keyboard placement and drag-and-drop, Assets tab with search, layer filter and selection)
  - `apps/vision/src/lib/blueprint/panels/DetailPanel.svelte` (Inspector tab with numeric transforms, align/distribute, parametric controls; Operations tab with telemetry freshness, simulator bind/unbind, power summary; Issues tab with design rule checks)
  - `apps/vision/src/lib/blueprint/panels/StatusBar.svelte` (Mode, tool, selection count, world cursor coordinates, unit, snap toggle, zoom %, storage durability)
  - `apps/vision/src/app.html` (Synchronous `<head>` boot script for `rune-lab.layout:theme:theme` preventing dark/light FOUC)
  - `apps/vision/src/routes/+layout.svelte` (Clean root layout providing `layout.css` and rendering `children()` without ancestor `RuneProvider`)
  - `apps/vision/src/routes/(workspace)/+layout.svelte` (Scoped `RuneProvider` host for the main Blueprint application with layout, palettes, i18n, and blueprint plugins)
  - `apps/vision/src/routes/(workspace)/+page.svelte` (Production Blueprint workspace mounting `<BlueprintHost />`)
  - `apps/vision/src/routes/(workspace)/showcase/+page.svelte` (Relocated legacy Vision test bench showcase)
  - `apps/vision/src/routes/(workspace)/viewer/[documentId]/+page.svelte` (Dedicated viewer route with repository loading, generation tokens, and local storage scope recovery)
  - `apps/vision/src/routes/embed-demo/+page.svelte` (Standalone embed demo page completely outside `RuneProvider` rendering 2 independent viewers and 1 standalone editor with zero cross-talk)
  - `apps/vision/test/blueprint_wp10.test.ts` (15 acceptance and component tests verifying AC-054..AC-059 and W10-A01..W10-A12)
  - `sdk/renderer/src/picking.ts` (Fixed forEach callback return value for Biome lint compliance)
- **Commands & Verification Evidence:**
  - `just test`: Exit code `0`. 7 test matrices passed, 121 total tests passed cleanly:
    - `core`: 32 passed
    - `api`: 22 passed
    - `renderer`: 9 passed
    - `exporters`: 1 passed
    - `state`: 41 passed
    - `ui`: 1 passed
    - `vision`: 15 passed
  - `just check`: Exit code `0`. Biome format clean (128 files), Biome lint 0 errors, Fallow health score 90 A, all 7 TypeScript matrices clean (0 errors, 0 warnings).
  - Acceptance Criteria Verified:
    - **AC-054**: Standalone editor and viewers mount outside `RuneProvider` without host context error or dependency on host toasts (`testAC054_embedWithoutRuneProvider`).
    - **AC-055**: Svelte 5 runes getter bridge continuously tracks reactive state across snapshot transitions without destructured freeze (`testAC055_svelteRunesBridgeReactivity`).
    - **AC-056**: Route mount/unmount 20 cycles maintains exactly one active registration set and leaves zero leaked registrations after final unmount (`testAC056_registryMountUnmountLifecycle`).
    - **AC-057**: Multi-session commands target only the active focused session; inactive document selection and history remain completely untouched (`testAC057_multiSessionCommandTargeting`).
    - **AC-058**: Keyboard accessibility: numeric coordinates modal commits placement without mouse, and input text isolation prevents native typing from triggering document undo (`testAC058_inputIsolationAndKeyboardPlacement`).
    - **AC-059**: Responsive layout zones, viewer mode command protections, and honest capability disclosures verified (`testAC059_viewerModeProtectionsAndCapabilities`).
    - **W10-A01..W10-A12**: Lossless native JSON roundtrip, sub-millisecond industrial fixture generation, 5-zone workspace structure, theme initialization, and clean Svelte 5 compilation all verified.
- **Blockers:** None. WP-10 complete. Ready for WP-11: Imports.

---

### WP-11 through WP-16: Staging

All subsequent packages are in `pending` status, awaiting sequential execution
following the protocol in Section 15.1.

