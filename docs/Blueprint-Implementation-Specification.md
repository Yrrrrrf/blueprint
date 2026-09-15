# Blueprint — Normative Implementation Specification and Execution Runbook

Version: 1.0 • Prepared: 2026-09-15 • Target: the supplied Blueprint Deno
workspace

Status: implementation contract. This document specifies work to perform; it
does not claim that the application, integrations, benchmarks, or tests have
already been implemented or passed.

## 0. Executor contract

Build the complete release defined here. Do not stop after scaffolding, a static
canvas, the first vertical slice, or a successful build. The vertical slice is
an intermediate gate. Completion requires every required work package and
acceptance case in this document.

Use MUST for mandatory behavior, MUST NOT for forbidden behavior, and MAY only
for implementation freedom that does not alter the contract. All architectural
choices below are settled. Choose local variable names and internal helper
decomposition normally; do not reopen product scope, replace the selected stack,
or invent backend services.

Read this entire specification before implementation. Read the supplied
Paper.js, Svelte, XState, Rune Lab, Runed, and validation reference resources
relevant to each work package. The corrections in §3 override inaccurate
examples in those resources. Use installed package declarations and primary
upstream documentation to resolve API spelling. Do not treat reference prose as
proof that a method exists.

Respect actual repository instructions and user changes. Inspect the working
tree first; preserve unrelated work. No repository reset, deletion of other
apps, package publication, deployment, or external telemetry connection is
authorized by this implementation guide alone. Implementation and local
validation of Blueprint are the intended work.

Proceed without asking routine design questions. If a dependency API differs,
implement its adapter against the installed API while preserving this contract.
Record the exact mapping and a test. Stop only the affected gate if its required
package/resources cannot be obtained or the requested behavior cannot be
implemented truthfully. Continue independent work. A blocked gate is never a
passed gate, and a screenshot is never evidence of functional behavior.

### 0.1 Inputs and precedence

1. Current user instructions and applicable repository instructions.
2. This specification, including explicit decisions replacing earlier plans.
3. Actual source and installed dependency declarations, for existing
   behavior/API facts.
4. Supplied library skills, with §3 corrections applied.
5. Historical `docs/MANIFEST.md`, `docs/PLAN.md`, `docs/REFERENCES.md`,
   `WIRING.md`, and `EVOLUTION.md` as context.

Use the actual checkout as the file authority. The two new source captures are
evidence, not two repositories to merge:

| Input                           | Observed content                                        | Interpretation                                                          |
| ------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- |
| `blueprint-20260915_000859.txt` | 100 files, including React, Vue, Svelte and Vision apps | Broader workspace capture                                               |
| `blueprint-20260915_000925.txt` | 64 files, Vision app and shared workspace/SDK files     | Narrower capture; all 64 shared file contents match the broader capture |
| Earlier Blueprint capture       | Manifest and initial plan                               | Original feature inventory                                              |
| Three related-to skill captures | Paper.js, Svelte, XState references and examples        | Reference material requiring the errata below                           |

The narrower capture is not an instruction to delete the other applications.
Absence from a text dump is not evidence of a repository deletion. Binary assets
may also be absent from dumps.

### 0.2 Assumptions, decisions, exclusions

Assumptions: the executor has the supplied captures and skills, the real
checkout or permission to reconstruct its textual files, and normal dependency
installation tools. Existing backend credentials and a deployed backend are not
assumed. If only captures exist, reconstruct the narrower capture as the
baseline and report omitted binary assets; use a local generated SVG favicon
rather than leaving a broken import. Do not recreate omitted framework demo apps
solely to satisfy hardcoded recipes.

Decisions: the first product is a factory layout editor and operational viewer;
`apps/vision` hosts it. Blueprint owns a versioned semantic document. Paper.js
renders it. XState orchestrates interactions and I/O lifecycles. Svelte presents
UI. Units are millimetres internally. Persistence is local IndexedDB by default.
A deterministic simulator supplies demonstration telemetry. Rune Lab integration
is a thin adapter. The four industrial layers are an extensible preset. Exact
PowerPoint geometry and genuine PDF optional-content layers are required, with
the supported feature subset defined below.

Explicit exclusions from release 1.0: 3D/BIM, DWG/DXF/IFC import, structural
engineering calculations, industrial control writes, certified safety/compliance
analysis, automatic plant optimization, production-flow simulation, multi-user
real-time collaboration, authentication/backend provisioning, multi-floor
coordinates, native CAD constraint solving, and React/Vue wrappers. The
contracts leave space for extensions; do not implement placeholder UI for
excluded features. Local proposals, snapshot comparison, geometric clearance
checks, and read-only telemetry are included.

## 1. Product contract

Blueprint lets a user create a dimensioned floorplan, arrange identifiable
assets, describe zones and connections, assess geometric conflicts, save the
document, reopen it, publish a local approved snapshot for a viewer, compare a
proposal, and export the result. A host application can embed a viewer and
respond to asset selections without depending on Paper.js.

### 1.1 Required capabilities

| Requirement              | Required outcome                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| BP-01 Document lifecycle | New, open, import, save draft, download native JSON, recover, duplicate, rename, delete local document with confirmation                 |
| BP-02 Structure          | Grid, walls, thickness, editable door/dock openings, columns, reusable symbols, calibrated reference background                          |
| BP-03 Zones              | Polygon zones, transit/storage/production/hazard/quality categories, hierarchy-independent zone membership                               |
| BP-04 Assets             | Catalog placement, rigid equipment transforms, parametric racks/conveyors, per-instance identity, specification fields, sensor bindings  |
| BP-05 Editing            | Selection, marquee, multi-selection, move, allowed resize, rotate, duplicate, delete, grouping, layer operations, snapping, measurements |
| BP-06 Transactions       | Atomic validated commands, exact undo/redo, cancelable gesture previews, bounded history                                                 |
| BP-07 Viewer             | Read-only geometry, configurable pan/zoom and inspection, selection callbacks, accessible asset list, telemetry overlay                  |
| BP-08 Operations         | Simulator, injected telemetry source, freshness/quality, status filters, zone summary, asset details                                     |
| BP-09 Spatial checks     | Footprint overlap, clearance intrusion, facility containment, restricted-zone intrusion, broken bindings/relations                       |
| BP-10 Revisions          | Immutable named snapshots, approved snapshot, proposal fork, geometric/semantic diff, explicit approval replacement                      |
| BP-11 Interchange        | Validated native format, restricted SVG import, safe raster import, portable embedded catalog/assets                                     |
| BP-12 Export             | SVG, PNG, WebP, JPEG, scaled layered PDF, native editable PPTX, equipment/zone report data                                               |
| BP-13 Integration        | Existing Rune Lab workspace/palette/theme, standalone Svelte viewer and editor, framework-neutral core                                   |
| BP-14 Quality            | Keyboard/touch behavior, error recovery, lifecycle cleanup, bounded resource use, tested distribution and harness                        |

### 1.2 First-run and navigation

`/` is the workspace. First launch shows an empty-document option and “Open
industrial example”; do not automatically overwrite recovered work. New document
defaults: name `Untitled layout`, 60,000 × 40,000 mm facility, four preset
layers, grid visible, selection tool, machinery layer active, editor mode.
`foundation` starts locked; other layers start unlocked.

`/viewer/[documentId]` loads the approved local snapshot if one exists,
otherwise the last saved draft with a visible “Draft” badge. Missing ID offers a
native file picker and return to workspace; never creates a blank record under
the unknown ID. `/embed-demo` hosts two independent in-memory viewers and one
standalone editor without RuneProvider. It is a functional integration example
used by tests. `/showcase` may remain a development-only route; it is not the
Blueprint landing page.

The workspace fills its available height. Header: document name, draft/save
state, editor/viewer mode, undo/redo, file menu, export. Left strip: tools.
Navigation panel: layers, catalog, assets/search. Main content: canvas with
viewport controls. Detail panel: selected entity, properties, bindings and
issues. Status bar: units, cursor position, zoom, snap state and save state.
Preserve existing Rune Lab zone toggles when they do not conflict with canvas
shortcuts.

## 2. Existing source integration and package ownership

### 2.1 Starting-point facts

The root uses `deno.json`, `nodeModulesDir: auto`, workspace globs `./sdk/**`
and `./apps/**`, and imports for Arkano, Vite+, Tailwind, DaisyUI and ArkType.
No Blueprint implementation exists in the inspected capture. `sdk/core` contains
generic Item/Comment examples; its kernel/schema barrels are placeholders.
`sdk/state` contains generic auth/item rune stores. `sdk/api` is empty. `sdk/ui`
contains template components.

`apps/vision` already pins Svelte `5.56.10` and Rune Lab `0.5.2-rc.2`. Its route
layout disables SSR, mounts RuneProvider with layout/palettes/i18n, and mounts
an AppLayout using WorkspaceLayout snippets. Reuse this shell and replace its
demo content. The former proposed location `src/packages/plugins/blueprint` does
not match this workspace and MUST NOT become a parallel application tree.

### 2.2 Dependency direction

| Package/path                                 | Owns                                                                          | Permitted runtime dependencies                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `sdk/core/src/blueprint/`                    | Canonical types/schemas, pure geometry, commands, history, revisions, reports | Valibot and polygon-clipping; no DOM, Svelte, XState, Rune Lab or Paper      |
| `sdk/api/src/blueprint/`                     | Persistence and telemetry ports, browser adapters, asset decoding             | Core; browser globals only inside called adapters                            |
| `sdk/state/src/blueprint/`                   | Session controller, XState machines, Svelte subscription bridges              | Core and API; renderer through a port, never concrete Paper imports          |
| `sdk/renderer/src/` (new workspace package)  | Paper lifecycle, draw-list projection, picking, previews, camera              | Core, Paper.js, RBush                                                        |
| `sdk/exporters/src/` (new workspace package) | Format serializers and export validation                                      | Core and renderer's DOM-free draw-list types; format libraries lazily loaded |
| `sdk/ui/src/blueprint/`                      | Standalone canvas, editor, viewer and panels                                  | Core, State, Renderer; exporter accessed by dynamic import or host callback  |
| `apps/vision/src/lib/blueprint/`             | Rune Lab adapter, composition, local repository, route coordination           | SDK leaf packages and installed Rune Lab APIs                                |

Add `@sdk/renderer` and `@sdk/exporters` with `deno.json` exports
`./src/mod.ts`; use the established `mod.ts` convention. Update root
`sdk/mod.ts` exports deliberately and avoid duplicate named exports. Leaf
packages import leaf barrels or relative files, never `@sdk` root, to avoid
cycles and importing UI into core. All new implementation belongs below each
package's `src/`; tests belong in each package's `test/`. Existing unrelated
exports remain usable.

Recommended files are mandatory ownership locations; helpers may be added within
them:

| Directory                        | Required modules                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sdk/core/src/blueprint/`        | `mod.ts`, `types.ts`, `schemas.ts`, `validation.ts`, `canonical.ts`, `migrations.ts`, `commands.ts`, `reducer.ts`, `history.ts`, `revisions.ts`, `catalog.ts`, `anchors.ts`, `geometry.ts`, `constraints.ts`, `diff.ts`, `reports.ts`, `fixtures.ts`                                                                                                             |
| `sdk/api/src/blueprint/`         | `mod.ts`, `ports.ts`, `indexeddb.ts`, `memory.ts`, `telemetry.ts`, `simulator.ts`, `websocket.ts`, `assets.ts`, `files.ts`                                                                                                                                                                                                                                       |
| `sdk/state/src/blueprint/`       | `mod.ts`, `session.ts`, `interaction.machine.ts`, `persistence.machine.ts`, `telemetry.machine.ts`, `export.machine.ts`, `actor-bridge.svelte.ts`, `context.svelte.ts`, `selectors.ts`                                                                                                                                                                           |
| `sdk/renderer/src/`              | `mod.ts`, `types.ts`, `draw-list.ts`, `paper-renderer.ts`, `scope.ts`, `camera.ts`, `input.ts`, `picking.ts`, `snapping.ts`, `overlays.ts`, `symbols.ts`                                                                                                                                                                                                         |
| `sdk/exporters/src/`             | `mod.ts`, `contracts.ts`, `svg.ts`, `raster.ts`, `pdf.ts`, `pdf-layers.ts`, `pptx.ts`, `pptx-freeform.ts`, `report.ts`                                                                                                                                                                                                                                           |
| `sdk/ui/src/blueprint/`          | `mod.ts`, `props.ts`, `BlueprintCanvas.svelte`, `BlueprintEditor.svelte`, `BlueprintViewer.svelte`, `Toolbar.svelte`, `LayerPanel.svelte`, `CatalogPanel.svelte`, `AssetPanel.svelte`, `Inspector.svelte`, `TelemetryCard.svelte`, `IssuesPanel.svelte`, `RevisionPanel.svelte`, `ExportDialog.svelte`, `FileDialog.svelte`, `StatusBar.svelte`, `blueprint.css` |
| `apps/vision/src/lib/blueprint/` | `mod.ts`, `plugin.ts`, `runtime.ts`, `commands.ts`, `settings.ts`, `BlueprintHost.svelte`                                                                                                                                                                                                                                                                        |
| `docs/`                          | Updated `MANIFEST.md`, `PLAN.md`, `REFERENCES.md`; new `EXECUTION-STATUS.md`, `API-COMPATIBILITY.md`, `VERIFICATION.md`                                                                                                                                                                                                                                          |

### 2.3 Stack and resolution policy

Keep Deno as the command entry runtime and `deno.json` as the package manifest.
No npm/yarn/pnpm workflow and no new per-package package.json. Preserve existing
Vite+/SvelteKit setup and compatibility shim unless a failing targeted test
proves a necessary adjustment. Do not upgrade Svelte, Rune Lab or TypeScript
majors as part of this work.

Use Paper.js `0.12.18`; XState v5 (minimum `5.19`, never v6); Valibot v1 for
Blueprint schemas; polygon-clipping `0.15.7` for pure polygon set operations;
RBush v4 for the renderer spatial index. Use jsPDF v3 + svg2pdf.js v2, pdf-lib
`1.17.1` for PDF layer assembly, PptxGenJS v4 and fflate `0.8.2` for PPTX ZIP
postprocessing. Existing ArkType may remain for unrelated code; do not validate
Blueprint through two competing schemas. Browser automation uses Playwright
through Deno's npm compatibility.

At WP-00, retain already resolved compatible versions. For a new dependency
without a lock entry, resolve the highest non-prerelease published version in
the specified major line once, record its exact version and integrity in the
normal Deno lockfile, and replace any newly introduced floating import with that
exact version. This is a mechanical resolution rule, not a stack-choice task. Do
not invent a patch version or assume a future release exists. Lock browser
automation version/browser revision together. No new Blueprint-specific
configuration file is needed; project settings live in the document, user
settings in existing host settings/local preferences.

## 3. Reference errata and mandatory API probes

The previous review correctly identified the broad architecture but repeated or
missed several reference inaccuracies. These corrections are normative:

| Topic                | Required correction                                                                                                                                                                            | Probe or evidence                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| XState action order  | v5 executes ordinary actions and `assign` in declared order; do not assume all assignments are hoisted ahead of effects                                                                        | An action/assign/action/assign/action sequence records `0,1,2`. [Migration guide](https://stately.ai/docs/migration)                   |
| Parent messaging     | `sendParent` exists in v5. Never use private `self._parent`; inject a typed actor reference or use callback `sendBack`                                                                         | Parent receives one typed message. [Actions](https://stately.ai/docs/actions)                                                          |
| Spawn                | `spawnChild` is itself an action creator and can appear in entry/actions; it is not restricted to `assign`/`enqueueActions`                                                                    | Use installed declarations; avoid arbitrary restrictions. [Migration guide](https://stately.ai/docs/migration)                         |
| Svelte getter bridge | `const { snapshot } = bridge` evaluates an ordinary getter once; keep `bridge.snapshot` inside a tracked expression                                                                            | Button event updates displayed state twice. [Svelte state](https://svelte.dev/docs/svelte/$state)                                      |
| `$state.raw`         | Adopt it for replacement snapshots; it is a project policy, not a universal Svelte requirement. Class instances are not automatically deep-proxied                                             | No Paper instance is treated as reactive document state. [Svelte state](https://svelte.dev/docs/svelte/$state)                         |
| Actor startup        | Subscribe before `start`, then refresh the snapshot; handle startup transitions and dispose subscription/actor once                                                                            | Immediate entry transition appears in UI                                                                                               |
| History state        | XState shallow/deep history remembers active state nodes, not earlier documents or undo transactions                                                                                           | Undo is tested against the command history. [History states](https://stately.ai/docs/history-states)                                   |
| Actor persistence    | Persisted actor state can include supported child actor state; blanket claims that all actor references break it are inaccurate. Blueprint deliberately persists domain data separately        | No engine/actor snapshot in native files. [Persistence](https://stately.ai/docs/persistence)                                           |
| Paper scope          | Accessing `scope.Path` alone is not the multi-canvas ownership guarantee. Explicitly activate the intended scope/project during synchronous item creation                                      | Alternate creation in two scopes and an export scope; ownership never crosses. [PaperScope](https://paperjs.org/reference/paperscope/) |
| Boolean cleanup      | Operations create result geometry; retain semantic operands in the document. Explicitly place output in its intended renderer group; do not rely on an assumed active-layer insertion location | Opening survives wall edits and redraws                                                                                                |
| Precision            | Never run blanket `path.simplify(1)` on CAD geometry. Simplification changes geometry and a unitless tolerance can erase features                                                              | Thin openings and adjacent walls remain within tolerance. [Path](https://paperjs.org/reference/path/)                                  |
| Coordinates          | Raw `clientX/clientY` are not canvas-local. DOM input and Paper ToolEvent input are different contracts                                                                                        | Offset canvas + page scroll + zoom tests                                                                                               |
| Preview              | Locking every Paper item is not the permission system; hit-testing behavior must not make inspection disappear                                                                                 | Viewer click/hover works while every mutation command is rejected                                                                      |
| SVG/PPTX             | SVG insertion and PNG backdrop insertion do not produce editable native PowerPoint geometry                                                                                                    | PPTX XML contains native shapes/text/freeforms. [PptxGenJS shapes](https://gitbrent.github.io/PptxGenJS/docs/api-shapes/)              |
| PDF                  | Vector conversion alone does not create optional-content layers                                                                                                                                | PDF contains usable `/OCProperties` and one OCG per exported document layer                                                            |

Limit probes to concrete integration risks above. They are not a request to
rewrite or republish the supplied skills. Put resolved package/API evidence in
`docs/API-COMPATIBILITY.md`. Installed Rune Lab plugin/persistence signatures
were not included in the captures, so record their real declarations before
implementing `plugin.ts`; never fabricate `definePlugin`, `createPluginKit`,
slot operations, or persistence methods from their names.

## 4. Canonical document, units and validation

### 4.1 Units and numerical rules

All saved positions, lengths, widths, radii and offsets use millimetres as
finite JavaScript numbers. Origin is facility top-left; +X right, +Y down.
Angles are degrees, clockwise positive, normalized to `[0,360)`. Persist
dimensions independently of viewport pixels. Display units are `mm`, `cm`, or
`m`; default `m`, two decimal places. Display conversion never mutates geometry.

Coordinate magnitude limit is 10,000,000 mm per axis. Default facility is
`[0,0,60000,40000]`. Quantize committed positions/lengths to 0.001 mm and angles
to 0.000001 degrees. Geometric equality epsilon is 0.001 mm; meaningful overlap
area threshold is 1 mm². During pointer preview use unrounded doubles; quantize
once on commit and validate the resulting shape. Normalize negative zero to
zero. Never infer design accuracy from floating-point precision.

No arbitrary affine matrices in the domain format. Entity transform is
translation + rotation only; supported resizing changes semantic geometry
dimensions/vertices. Equipment marked rigid cannot be stretched or sheared. This
avoids silently changing a 4 m CNC into a physically different machine by
dragging a generic resize handle.

### 4.2 Normative TypeScript contract

Implement these data shapes and corresponding strict Valibot schemas. Use schema
inference for production types or ensure these declared types and inferred
schemas agree bidirectionally in type checks. Readonly arrays/maps mean callers
must not mutate snapshots; the reducer returns structural copies. `Json`
excludes undefined, NaN, Infinity, dates, functions and class instances.

```ts
type Id = string;
type IsoDate = string; // Valid UTC ISO-8601 instant ending in Z
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Vec2 = { x: number; y: number };
type Transform = { x: number; y: number; rotationDeg: number };
type RingVertex = Vec2 & { id: Id };
type Ring = readonly RingVertex[]; // Stable vertex IDs; implicitly closed
type Polygon = { outer: Ring; holes: readonly Ring[] };
type Geometry =
  | { kind: "rect"; width: number; height: number; cornerRadius: number }
  | { kind: "ellipse"; width: number; height: number }
  | { kind: "polygon"; polygons: readonly Polygon[] }
  | { kind: "path"; closed: boolean; segments: readonly BezierVertex[] };
type BezierVertex = {
  id: Id;
  point: Vec2;
  handleIn: Vec2;
  handleOut: Vec2;
};
type Style = {
  fill: string | null;
  stroke: string | null;
  strokeWidthMm: number;
  opacity: number;
  dashMm: readonly number[];
}; // Colors: #RRGGBB only; opacity supplies alpha
type Layer = {
  id: Id;
  name: string;
  role: "foundation" | "sections" | "machinery" | "marks" | "custom";
  parentId: Id | null;
  visible: boolean;
  locked: boolean;
  printable: boolean;
  opacity: number;
};
type Base = {
  id: Id;
  name: string;
  layerId: Id;
  groupId: Id | null;
  transform: Transform;
  style: Style;
  hidden: boolean;
  locked: boolean;
  tags: readonly string[];
  metadata: Readonly<Record<string, Json>>;
};
type ShapeEntity = Base & {
  kind: "shape";
  geometry: Geometry;
  structural: boolean;
};
type WallEntity = Base & {
  kind: "wall";
  vertices: readonly { id: Id; point: Vec2 }[];
  thicknessMm: number;
  closed: boolean;
};
type OpeningEntity = Base & {
  kind: "opening";
  wallId: Id;
  segmentStartId: Id;
  segmentEndId: Id;
  offsetMm: number;
  widthMm: number;
  openingType: "door" | "dock" | "passage";
  hinge: "start" | "end";
  swing: "left" | "right";
};
type ZoneEntity = Base & {
  kind: "zone";
  polygon: Polygon;
  category:
    | "storage"
    | "production"
    | "hazard"
    | "transit"
    | "quality"
    | "custom";
  restricted: boolean;
};
type DeviceEntity = Base & {
  kind: "device";
  definitionId: Id;
  assetKey: string;
  parameters: Readonly<Record<string, number | string | boolean>>;
  ratedPowerKw: number | null;
  maintenanceDue: IsoDate | null;
  bindings: readonly TelemetryBinding[];
};
type Anchor =
  | { kind: "point"; point: Vec2 } // Absolute world position
  | {
    kind: "entity";
    entityId: Id;
    feature: "origin" | "center" | "port" | "vertex";
    featureId: Id | null;
  };
type DimensionEntity = Base & {
  kind: "dimension";
  a: Anchor;
  b: Anchor;
  axis: "aligned" | "horizontal" | "vertical";
  offsetMm: number;
  displayUnit: "document" | "mm" | "cm" | "m";
  precision: 0 | 1 | 2 | 3;
};
type AnnotationEntity = Base & {
  kind: "annotation";
  anchor: Anchor;
  offsetMm: Vec2;
  text: string;
  annotationType:
    | "label"
    | "warning"
    | "inspection"
    | "maintenance"
    | "evacuation";
  textHeightMm: number;
};
type ReferenceEntity = Base & {
  kind: "reference";
  assetId: Id;
  widthMm: number;
  heightMm: number;
  opacity: number;
};
type Entity =
  | ShapeEntity
  | WallEntity
  | OpeningEntity
  | ZoneEntity
  | DeviceEntity
  | DimensionEntity
  | AnnotationEntity
  | ReferenceEntity;
type Group = { id: Id; name: string; parentId: Id | null };
type Relation =
  | { id: Id; kind: "memberOfLine"; deviceId: Id; lineId: Id }
  | { id: Id; kind: "observes"; sensorId: Id; assetId: Id }
  | {
    id: Id;
    kind: "flow";
    fromDeviceId: Id;
    fromPortId: Id;
    toDeviceId: Id;
    toPortId: Id;
  }
  | { id: Id; kind: "assignedZone"; deviceId: Id; zoneId: Id };
type ProductionLine = { id: Id; name: string; color: string };
type TelemetryBinding = {
  field:
    | "status"
    | "loadPct"
    | "temperatureC"
    | "vibrationMmS"
    | "powerKw"
    | "rpm"
    | "speedMps";
  sourceId: string;
  channel: string;
};
type SymbolPart = {
  id: Id;
  geometry: Geometry;
  transform: Transform;
  style: Style;
};
type DeviceDefinition = {
  id: Id;
  version: number;
  name: string;
  category: "cnc" | "robot" | "conveyor" | "rack" | "sensor" | "custom";
  nominalWidthMm: number;
  nominalHeightMm: number;
  sizing: "rigid" | "conveyor" | "rack";
  footprint: Polygon;
  clearance: Polygon;
  ports: readonly { id: Id; point: Vec2; directionDeg: number }[];
  symbol: readonly SymbolPart[];
  defaults: Readonly<Record<string, number | string | boolean>>;
};
type EmbeddedAsset = {
  id: Id;
  mime: "image/png" | "image/jpeg" | "image/webp";
  sha256: string;
  widthPx: number;
  heightPx: number;
  base64: string;
};
type DocumentContent = {
  name: string;
  description: string;
  unit: "mm";
  displayUnit: "mm" | "cm" | "m";
  facility: { widthMm: number; heightMm: number };
  layers: readonly Layer[]; // Preorder, sibling order is painting order
  entities: Readonly<Record<Id, Entity>>;
  entityOrder: readonly Id[]; // Back-to-front ordering within a layer
  groups: readonly Group[];
  definitions: Readonly<Record<Id, DeviceDefinition>>;
  assets: Readonly<Record<Id, EmbeddedAsset>>;
  lines: readonly ProductionLine[];
  relations: readonly Relation[];
  grid: { origin: Vec2; minorMm: number; majorEvery: number; visible: boolean };
  metadata: Readonly<Record<string, Json>>;
};
type BlueprintDocument = {
  format: "blueprint";
  schemaVersion: 1;
  documentId: Id;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  revision: number;
  content: DocumentContent;
};
```

Special geometry ownership rules: opening transform MUST be identity; its world
geometry derives solely from its referenced wall segment and opening fields.
Dimension and annotation transform MUST be identity; their anchors/offsets carry
position. Their inspector must not expose meaningless X/Y/rotation controls.
Other entities use local geometry with transform applied once.
Rects/ellipses/device footprints use top-left local origin; catalog rotations
pivot at the world footprint center by adjusting translation as well as angle.

Ring vertex IDs are stable within an entity/definition; normalization may
reverse order but must preserve IDs. Holes and outer rings cannot reuse a vertex
ID within the same owner. Imported/new polygon vertices receive IDs once at
creation. Derived clipping geometry may use internal numeric point arrays;
assign canonical vertex IDs only when materializing a new editable polygon
entity. An entity vertex anchor resolves by this ID, never by a changing array
index. Rect corners have reserved feature IDs `top-left`, `top-right`,
`bottom-right`, `bottom-left`; ellipse supports `center` and `origin` anchors,
not arbitrary vertex anchors. Device `port` resolves a definition port ID after
parameter generation. Missing or invalid anchor feature IDs reject
imports/commands, except the explicit freeze-to-world-point deletion behavior in
§5.

Defaults for new Base fields: identity transform, groupId null, hidden/locked
false, empty tags/metadata, Style
`{fill:null, stroke:'#334155', strokeWidthMm:25, opacity:1, dashMm:[]}`
overridden by tool/catalog presets. Annotation offsetMm is `(0,0)`, dimension
precision2, unnamed entities receive their kind plus a document-local counter.
Reference base style opacity stays1; its reference opacity field supplies image
alpha, default0.35. Layer effective visibility is the AND of self/ancestor
visibility; locked is the OR; printable is the AND; effective opacity is the
product of ancestor/layer/entity style opacity, with reference alpha multiplied
once. Group membership changes selection/order only, with no hidden style
inheritance. Removing one of the four preset layers is forbidden; custom layers
default role custom, opacity1, visible/printable true, locked false.

Parametric definitions use `nominalWidthMm/nominalHeightMm` and named parameters
to generate footprint, symbol, clearance and ports. Rigid definitions reject
parameter keys not in their defaults. Rack/conveyor parameter schemas are fixed
in §8. Custom definitions default to rigid. Saved definitions are immutable by
version: changing a catalog definition creates a new ID/version and an explicit
instance-upgrade command. Loading an old document never silently changes its
geometry to match a newer installed catalog.

### 4.3 Validation order and failure semantics

1. Check UTF-8 file size before parsing: maximum native JSON 20 MiB; maximum
   10,000 entities, 256 layers, 1,000 groups, 500 definitions, 64 embedded
   assets, 250,000 Bezier vertices total. Limit arbitrary metadata depth to 8
   and total metadata to 1 MiB.
2. Parse JSON without evaluating content. Strict schemas reject unknown
   structural fields outside `metadata`. Validate discriminants, ranges, string
   lengths and finite numbers.
3. Normalize committed numerical precision and ring orientation. Canonical outer
   rings have positive signed shoelace area in the chosen Y-down coordinate
   representation; holes have negative area. Algorithms must use this convention
   consistently, not visual clockwise labels.
4. Validate IDs: nonempty ASCII `[A-Za-z][A-Za-z0-9_-]{0,127}`, unique across
   each collection and all entity IDs. Runtime-created IDs use prefixed UUIDs;
   fixtures use stable IDs. Map keys must equal embedded entity/definition/asset
   IDs.
5. Validate layer/group references, acyclic parents, maximum depth 8, exact
   entityOrder permutation, no dangling catalog/asset/port/vertex references and
   relation endpoint kinds. Groups may span only one layer and have no saved
   transform.
6. Reject self-intersecting zone rings, holes outside the outer ring,
   intersecting holes, degenerate area <1 mm², nonpositive dimensions, zero wall
   segments, invalid opening offsets or overlapping openings on a wall segment.
   Repeated consecutive polygon points within epsilon are removed only by
   documented normalization; topology changes cause rejection.
7. Validate embedded bytes against declared MIME, SHA-256 and decoded pixel
   dimensions before replacing the active document. Each image <=8 MiB and <=16
   megapixels; total embedded bytes <=12 MiB to leave JSON/base64 overhead
   within the file cap.
8. Run semantic spatial checks. Geometric overlaps and clearances produce
   issues, not import rejection; broken mandatory references and impossible
   geometry reject the document.

Return `ValidationIssue { code, path, message, entityIds }[]`, sorted by path
then code. Show the first 20 in UI plus total count; provide expandable full
report. Import failure leaves current document/history intact. Unknown future
schemaVersion rejects with an explicit version message. Raw Paper.js JSON is not
a native Blueprint document; offer an explicit geometry-only conversion through
SVG if a supported converter is implemented later, never label it a lossless
migration now.

### 4.4 Canonical serialization and migration

Canonical JSON sorts object keys lexicographically, preserves ordered arrays,
normalizes numbers and emits UTF-8 with LF. Native download includes one
document, embedded used definitions/assets, and format/version metadata; it
excludes telemetry samples, actor snapshots, viewports, selection, history and
recovery metadata. Export-time garbage collection removes unused
definitions/assets from a copy, never mutates the live document.

Content identity is SHA-256 of canonical `DocumentContent`; exclude envelope
timestamps/revision. Use the exact canonical content string or synchronous
identity token for immediate dirty-state decisions; asynchronous hashing must
carry a session generation and revision to avoid stale results. Every successful
mutation, undo or redo increments envelope revision monotonically and updates
updatedAt using the injected clock. A no-op changes neither revision nor
history. Pure migrations are explicit `vN -> vN+1` functions with fixtures.
Release 1 has only validation/normalization of v1; do not fabricate migration
support for undocumented historical formats.

## 5. Commands, authorization boundary and history

### 5.1 Command pipeline

The session is the sole write authority. UI, keyboard, pointer tools, palette
and host API all send typed commands to it. The reducer takes
`(document, command, environment)` and returns either
`{ document, delta, issues }`, `{ noChange: true }`, or a structured error.
Environment contains injected ID factory/clock and mode permissions. Commands
are checked before state mutation; atomic batches validate the final prospective
document and commit once.

Store renderer instances, WebSockets, DOM nodes and worker handles outside
canonical data. The renderer may mutate its scenegraph for preview but cannot
modify the document. Structural errors reject the command; spatial advisory
issues are committed and displayed. Mode `preview` rejects every document
mutation with `READ_ONLY`, including undo/redo/import-replacement through the
viewer surface. Host prop replacement of a viewer document is allowed as a new
input, not an edit.

| Command family                                                              | Required payload and behavior                                                                                                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.rename`, `document.describe`, `document.settings`                 | New typed content fields; unit remains mm; shrinking facility may create containment issues                                                           |
| `entity.add`, `entity.update`, `entity.delete`                              | Full new entity or discriminated patch; no `Partial<Entity>` that can create mixed kinds                                                              |
| `selection.transform`                                                       | IDs, translation delta and/or angle/pivot, or validated per-entity new dimensions; use initial gesture state                                          |
| `selection.duplicate`                                                       | Deep clone selected entities and included owned openings, allocate IDs, preserve definition refs, offset +1000 mm X/Y                                 |
| `group.create`, `group.dissolve`                                            | Selection in same layer; dissolve preserves world transforms/order                                                                                    |
| `layer.add`, `layer.update`, `layer.move`, `layer.delete`                   | Cycle prevention, subtree reorder, printable/visible/locked state; delete mode must explicitly be `deleteContents` or `moveContents` with destination |
| `wall.setVertices`, `opening.add`, `opening.update`                         | Stable vertex IDs, segment references, width/offset constraints                                                                                       |
| `zone.setPolygon`                                                           | Entire prospective polygon, validated atomically                                                                                                      |
| `device.parameters`, `device.binding`, `device.upgradeDefinition`           | Definition-specific validation; no live telemetry values in metadata                                                                                  |
| `relation.add`, `relation.delete`, `line.add`, `line.update`, `line.delete` | Validate endpoint kinds and IDs; remove line removes its membership relations                                                                         |
| `dimension.setAnchors`, `annotation.update`                                 | Stable anchors/text; no stale cached measured values saved                                                                                            |
| `selection.align`, `selection.distribute`                                   | World bounds; common horizontal/vertical centers or edges; distribution min 3                                                                         |
| `history.undo`, `history.redo`                                              | Restore semantic content and revalidate, with new monotonic revision                                                                                  |

Use a discriminated union with exact fields for every command; the table defines
behavior and the executor must type each payload accordingly. UI commands expose
affected IDs and operation labels. Reject mutation of hidden/locked entities,
locked ancestor layers, or locked selected-group members as one atomic failure;
layer visibility/lock management itself remains available to the user so a layer
can be unlocked. Root preset layers can be renamed and hidden but cannot be
deleted or have their role changed. Additional layers can be deleted with
explicit UI confirmation; nonempty layer deletion states affected count.

Deletion policy: deleting a wall also deletes its openings; deleting an entity
converts dimension/annotation anchors referencing it to their last resolved
world point; deleting a device removes incident relations and its bindings.
Duplicating a selected device allocates a unique assetKey with suffix `-copy-N`
and clears telemetry bindings to avoid accidental duplicate live identities.
Duplicate relations only when both endpoints are duplicated. Group deletion
follows selected group members; no invisible orphan groups remain. A single undo
restores all dependent changes.

### 5.2 Transactions and history

One gesture is one transaction. Capture starting content and affected-entity
baselines on pointerdown after the drag threshold is crossed; mutate only
preview during movement; perform one command on pointerup. Escape,
pointercancel, lost capture, window blur, route departure, document replacement,
or entering preview cancels the preview. No history entry for
selection/camera/hover or a net-zero gesture.

History entry is
`{ id, label, beforeChanges, afterChanges, affectedIds, timestamp }`. Changes
are collection-level deltas: old/new entity objects for affected IDs, old/new
relevant arrays or settings, and old/new definition/asset entries. Do not store
full scenegraph JSON per drag. For simplicity, an unusually broad command may
store before/after content, but all history is bounded to 100 entries and 32 MiB
combined undo+redo serialized bytes. Evict oldest complete entries; never break
a transaction. An individual entry >32 MiB is rejected before commit with
`HISTORY_LIMIT` (normal document limit should keep this rare).

New mutation after undo clears redo. Consecutive keyboard nudges while the same
key is held form one transaction ending on keyup or 300 ms idle; a new
direction/selection ends the current nudge transaction. Inspector typing is
local until Enter or blur commits; Escape reverts. Invalid input keeps focus and
displays an inline message without a partial commit. Undo restores geometry and
relations, never live readings or viewport. Reopening a document starts empty
in-memory history; draft recovery restores content, not an in-progress gesture.

## 6. Geometry, renderer and input

### 6.1 Geometry derivation

Core computes geometry in plain numeric objects. `worldPoint(local, transform)`
applies clockwise rotation in the Y-down coordinate system then translation:
`(x cosθ - y sinθ + tx, x sinθ + y cosθ + ty)`. Inverse conversion subtracts
translation then rotates by `-θ`. All bounds, relation ports, snapping and
dimensional anchors use the same functions. No duplicated transform math in UI
components.

Wall centerlines have stable vertex IDs. For each segment, form a rectangle with
half-thickness offsets along its unit normal. Use butt caps at open endpoints
and a bevel polygon joining offsets at shared vertices. Union these polygons
with polygon-clipping; subtract opening rectangles. Cross-wall connections are
visual unions only when exporting a consolidated structure layer; individual
walls remain separately selectable. Reject a 180-degree reversal at a shared
wall vertex as invalid geometry. Do not smooth wall contours. The pure polygon
implementation is used for semantic checks, allowing core tests without Canvas.
Paper Boolean operations may assist renderer-only shape operations, but their
output is converted to ordinary polygons/Bezier vertices before any document
commit.

Opening offset is measured from referenced segment start along the centerline;
width is along that segment. Require `0 <= offset`,
`offset + width <= segmentLength`, width >=100 mm, and at least 1 mm separation
from another opening. Cut through full wall thickness plus 1 mm on each side to
avoid coplanar artifacts. The stored geometry remains the wall plus opening
relation. Moving a wall carries its openings; moving/deleting a referenced
vertex must preserve the segment and fit, or reject with `OPENING_CONFLICT`.
Explicitly deleting a wall segment offers a dependent-opening deletion preview
before the command is submitted. Do not silently slide openings onto a different
segment.

Ellipses and Bezier paths used for collision checks are tessellated with maximum
0.1 mm chord error, 4096 segments per entity. Exceeding the cap raises
`GEOMETRY_COMPLEXITY`; do not return an inaccurate clear result. Polygon sets
may contain holes. Rectangle bounding boxes are only the broad phase, followed
by actual polygon intersection/difference. Cache derived geometry by entity
content identity + definition version; invalidate all dependents when
anchors/definitions change.
[Polygon-clipping supports polygon set operations](https://github.com/mfogel/polygon-clipping).

### 6.2 Renderer port and scenegraph ownership

The state package depends only on this renderer contract:

```ts
interface RendererPort {
  setDocument(doc: BlueprintDocument): void;
  applyDelta(doc: BlueprintDocument, delta: DocumentDelta): void;
  setPreview(preview: GesturePreview | null): void;
  setSelection(ids: readonly Id[]): void;
  setTelemetry(values: ReadonlyMap<Id, AssetTelemetry>): void;
  setIssues(issues: readonly SpatialIssue[]): void;
  setCamera(camera: Camera): void;
  getCamera(): Camera;
  hitTest(viewPoint: Vec2, policy: PickPolicy): PickResult | null;
  fit(bounds?: WorldBounds): void;
  dispose(): void;
}
```

Implement the named ancillary types in `sdk/core` when domain-only, or renderer
`types.ts` when view-only; `state` receives a structural port type with no Paper
imports. `DocumentDelta` lists added/changed/removed entity IDs and changed
layer/definition/asset/settings keys. `GesturePreview` contains transient entity
replacements, snap guides and marquee rectangle. `Camera` is
`{ centerMm: Vec2, scale: number }`. `PickPolicy` states editing or inspection,
whether group drill-down is active, and visible layer filter. `PickResult`
contains `entityId`, optional subpart/anchor ID, world point, and hit category;
never exposes Paper Item.

Create one PaperScope per mounted canvas. On every synchronous
construction/reconciliation block: activate scope, activate its project,
construct with explicit parents or `insert:false`, attach to the intended
layer/group, finish without awaiting. Asynchronous asset completion re-enters
that block after checking a disposal token. Rendering never depends on the last
scope activated elsewhere. Do not install Paper into `window`. Keep scenegraph
records in an ordinary `Map<Id, RenderHandle>`; stable document IDs survive
redraws, while Paper numeric IDs do not escape.

Use a background grid canvas, the Paper content canvas, and a
pointer-transparent overlay canvas or SVG overlay. Only the content canvas owns
primary pointer input. Grid, handles, snap guides, hover rings, issue badges and
draft previews are view artifacts and are excluded from native persistence.
Telemetry/issue annotations are exportable only when the user includes them;
never accidentally serialize selection handles. The dimension entities
themselves remain part of the document and are included when printable.

Do not recreate the whole Paper project on every edit. Reconcile changed
entities and their dependents; update transforms in place when safe, replace
geometry handles when type/shape changes. `applyMatrix=false` is used on
transformed entity groups. Never read a rotated axis-aligned Paper bounds width
back as the physical device width. Symbols may share immutable base drawings;
per-instance status rings remain separate so one machine's status does not
recolor all symbol instances.

### 6.3 Camera, pixel ratio and resizing

Set base scale to `0.01 CSS px/mm`; Camera.scale is a factor in `[0.01,1000]`,
so actual pixels per mm `s = 0.01 * scale`. Paper view.zoom is `s`. At 100%
display, scale is 1 and 1 m occupies 10 CSS pixels. Status bar displays this
percentage; physical printing scale is a different export setting.

Given canvas content-box size `(W,H)`, world coordinate is
`centerMm + ((viewX-W/2)/s, (viewY-H/2)/s)`. Canvas-local view coordinates come
from client position minus content-box origin, adjusted for CSS display resizing
if logical size differs. Give the canvas no CSS border/padding/transform;
wrapper may have borders. CSS-transformed canvas ancestors are unsupported in v1
and must be documented in embed API. Page scroll and ordinary responsive
resizing are supported.

Cursor-anchored wheel zoom: compute world point under cursor before changing
scale; compute new center as `worldPoint - (viewPoint - viewportCenter)/newS`.
Normalize wheel deltaMode to CSS pixels (line=16, page=viewport height);
multiplier `exp(-deltaPx * 0.0015)`, clamped to range. Prevent wheel default
only over an enabled interactive canvas. Middle mouse or Space+primary drag pans
by screen delta divided by `s`, with opposite sign for center motion. Fit uses
bounds plus 32 CSS px margin per side and preserves aspect ratio; empty fit uses
facility bounds. Resize preserves world center/scale; initial nonzero layout
fits once.

ResizeObserver owns canvas logical dimensions. Let Paper manage its own high-DPI
backing-store behavior; verify DPR 1 and 2 rather than multiplying sizes twice.
Scale grid/overlay backing stores by DPR manually because those are separately
owned. Input always stays in CSS pixels. Suspend fit/render while either
dimension is zero. A DPR change triggers resize handling, not a document
mutation.

### 6.4 Event routing and picking

Use DOM Pointer Events as the single event entry, not simultaneous Paper Tool
handlers and DOM drag handlers. Pointerdown focuses the canvas, records pointer
ID, and captures the pointer. Movement begins after 3 CSS px travel. Always
process terminal pointerup/cancel; RAF coalescing must not lose the last
position. Release capture in a finally path. Ignore nonprimary buttons except
middle-button pan. Disable browser touch gestures only on the interactive canvas
via `touch-action:none`.

One touch selects/drags/places using the current tool. Second touch cancels any
geometry preview and begins two-finger pan/pinch. The world point at the initial
centroid remains under the updated centroid while scale follows pointer
separation. Lifting to one finger ends the gesture; do not unexpectedly resume
drafting. Native drag/drop catalog placement is a desktop convenience;
click-to-place works for touch and keyboard.

Picking checks visible and permitted entities using RBush bounds expanded by
`8/s` mm, then precise hit geometry in front-to-back layer/entity order. Filled
interiors and strokes count; paths with neither fill nor visible stroke do not.
Under editor policy skip hidden/locked entities and ancestors; under viewer
policy include locked entities because inspection is allowed. Do not implement
this by temporarily unlocking the saved layer. Active layer controls insertion,
not a forced restriction on selection. A hit on a symbol subpart resolves to its
device. Group click selects the outermost group; Alt+click drills down to an
entity. Alt+drag is reserved for no operation; duplication uses an explicit
command.

Selection: plain click replaces; Shift+click toggles; background click clears;
background drag creates marquee. Left-to-right marquee selects fully contained
actual world bounds, right-to-left selects intersecting geometry; show distinct
solid/dashed rectangle. Hidden/locked entities never enter editor selection.
Double-click selects a zone/wall for vertex editing or opens device details; it
does not accidentally finish a new drawing after a selection action. Synchronize
selection with asset list/inspector using IDs.

### 6.5 Snapping

Default grid: 1000 mm minor, major every 10. Inspector allows snap steps 100,
500, 1000, 5000 mm independently from visual density. Draw minor grid only when
adjacent lines are >=8 CSS px apart; major lines when >=16 px apart. This
adaptive drawing never changes the snap step.

Snap acquisition radius is 8 CSS px, release radius 12 px. Candidate rank:
vertex/port, midpoint, alignment guide, grid; within rank choose smallest screen
distance, then entity ID then feature ID. A currently acquired candidate stays
until release radius or invalidation. Exclude moving entities and their derived
dependents. Candidates from visible locked foundations are allowed for snapping
even when not selectable. Alt temporarily disables all snapping. Shift
constrains drawing angle or rotation to 15-degree increments; constrained
geometry is generated first, then compatible snap candidates are considered. No
snap may violate the angle constraint.

Move snapping uses selection pivot/origin and edge/center alignment; apply one
common delta to the whole selection, never snap each item separately. Rotation
uses the initial selection center. Single-entity resize snaps the moving handle
while keeping the opposite handle fixed. Guides are transient and display exact
snapped coordinate/angle. Tests cover zoom-invariant thresholds and
deterministic tie breaks.

## 7. Interaction machines and editing tools

### 7.1 Machine ownership

Create one session per editor. It owns the document store and command history
outside XState and creates separate actors for interaction, persistence,
telemetry and export. XState context holds IDs, mode, transaction IDs, job IDs,
small immutable input records and typed port references; no live scenegraph. Do
not persist these actors as the Blueprint file. Separate actors provide
concurrency without a single enormous parallel machine.

The interaction machine has top-level `editor` and `preview`. Editor has `idle`,
`pressed`, `moving`, `resizing`, `rotating`, `marquee`, `wallDrawing`,
`openingPlacing`, `zoneDrawing`, `devicePlacing`, `dimensionDrawing`,
`annotationPlacing`, `vertexEditing`, `panning`, `pinching`. Current chosen tool
is context, not a second unsynchronized boolean system. Viewer uses
idle/panning/pinching/inspecting only. Invalid editing events in preview are
ignored by the interaction actor and rejected if submitted to the command layer.

Pointer movement is coalesced to at most one preview update per animation frame.
XState processes semantic lifecycle events; the gesture controller calculates
high-frequency geometry through the current tool strategy. It must not have an
independent contradictory lifecycle. Enter/exit actions allocate and dispose the
strategy. No `UPDATE_PREVIEW` payload carries the entire document.

### 7.2 Required transition behavior

| State/event                              | Next state              | Required action                                                                         |
| ---------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| editor idle + pointerdown on entity      | pressed                 | Capture selection and starting pointer; update selection according to modifiers         |
| pressed + move >=3 px                    | moving                  | Start transaction from original selected entity snapshots                               |
| pressed + pointerup                      | idle                    | Selection only, no undo record                                                          |
| moving/resizing/rotating + pointermove   | same                    | Compute preview from initial transform, show snaps/issues                               |
| moving/resizing/rotating + pointerup     | idle                    | Flush last movement; commit one command if valid; otherwise restore and show reason     |
| idle + handle pointerdown                | resizing or rotating    | Check entity sizing policy before opening transaction                                   |
| idle + background primary drag           | marquee                 | Preview rectangle; selection commit has no document transaction                         |
| drafting + Enter/double-click finish     | idle or placement-ready | Validate and commit completed geometry                                                  |
| any unfinished edit + Escape/cancel/blur | editor idle             | Discard preview and release capture; retain chosen tool                                 |
| editor + SET_MODE preview                | preview idle            | Cancel active edit, clear edit selection/handles, preserve camera and saved layer locks |
| preview + SET_MODE editor                | editor idle             | Restore last chosen tool and camera; do not resume unfinished geometry                  |
| any + document replacement               | appropriate idle        | Cancel work and invalidate asynchronous result generations                              |
| any + second touch                       | pinching                | Cancel geometry preview and initialize centroid/pinch baseline                          |
| navigation end                           | mode idle               | Release all capture state                                                               |

On mode change, persistence and telemetry continue. Export continues using its
captured document revision. Use `setup().createMachine()` as the project's type
policy, pure guards and declared-order actions. `emit` communicates external
semantic notifications; `raise` is for internal events. Bind parent refs through
input or closures, never `_parent`. Register actor error observers; errors
become a visible recoverable state with diagnostics, not silent console
failures.

### 7.3 Tool details

| Tool             | Exact workflow                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Select (`V`)     | Click/marquee/move, handles, group selection; default tool                                                                                                                                 |
| Pan (`H`)        | Primary drag pans; Space temporarily pans only when no geometry gesture is active                                                                                                          |
| Wall (`W`)       | Click first point, subsequent vertices; Enter/double-click finishes open wall, click initial point within 8 px closes; >=2 distinct vertices; Escape discards; thickness default 300 mm    |
| Opening (`O`)    | Hover nearest eligible straight wall segment, click preview opening; default door width 1000 mm, dock 4000 mm; inspector changes kind/hinge/swing; invalid fit shown red and cannot commit |
| Zone (`Z`)       | Click vertices; Enter/double-click or first-point closure with >=3 vertices commits; categories choose preset fill; self-intersection prevents commit                                      |
| Device (`D`)     | Choose catalog entry then ghost follows pointer; click commits; remains ready for repeated placement; Escape clears ghost and returns select; R rotates ghost +15 degrees                  |
| Dimension (`M`)  | First anchor, second anchor, third click sets signed offset; Enter after second uses 500 mm offset; aligned/horizontal/vertical in tool options                                            |
| Annotation (`A`) | Click entity anchor or point, edit text in floating input; Enter commits, Shift+Enter newline, Escape cancels; default label text height 250 mm                                            |
| Vertex editing   | Double-click eligible wall/zone/path; drag vertex; insert nearest edge midpoint from context action; delete vertex only if shape remains valid; any drag is atomic                         |

Generic shape actions in toolbar overflow: rectangle, ellipse, line/Bezier path
and structural column. Rect/ellipse drag sets positive dimensions; minimum 1 mm.
Path editing stores handles explicitly and supports line segments, cubic Bezier
handles and open/closed state. Boolean union/intersect/subtract/exclude is
available only for selected filled shape entities on the same unlocked layer,
ordered with first selected as minuend for subtraction. Results become
polygon/path shape entities; no automatic boolean rewrite of semantic walls,
zones, devices or dimensions.

Move/rotate applies to multi-selection rigidly. Multi-selection resize is
disabled with the visible reason “Resize objects individually”; no arbitrary
group scaling. Single zones/shapes/reference images support 8 handles; Shift
preserves aspect ratio. Rigid devices expose rotation/move only. Racks/conveyors
expose their named parameter handles. Rotation stem sits 24 CSS px above
top-center of the selection box. Prevent flips/negative dimensions by clamping
active handle before crossing the opposite anchor. Inspector supports explicit
numeric transforms at all zooms.

Dependent-geometry transforms are explicit exceptions: moving an opening changes
its segment offset along the parent wall, never its transform; moving a
dimension changes only its signed label offset along the dimension normal, never
its measured anchors; moving an anchored annotation changes offsetMm, and moving
a free annotation moves its point anchor. Rotation is unavailable for
openings/dimensions/annotations in v1. A multi-selection transform containing an
independently selected dependent entity is rejected unless its referenced owner
is also selected and the dependent will follow exactly once. Translation of a
selected wall carries all its openings; do not translate those a second time.
For group rotation with dimensions/annotations present, reject and explain
“Rotate geometry separately from annotations.” Numeric anchor editing remains
available for dimensions.

Dimensions resolve anchors on every dependent geometry update; aligned length is
Euclidean, horizontal/vertical length is absolute axis difference. Offset sign
determines side. World anchor geometry is stored; label value is derived.
On-screen labels/arrowheads use 12 px/6 px nominal sizes; printed
labels/arrowheads use 3 mm/2 mm on sheet. Text size does not alter measured
length. Display `0.00 m` rather than negative zero. Annotation text is plain
text, not HTML.

For offset calculation, use the ordered measured axis vector `d`, normalized
normal `n=(-d.y,d.x)/|d|`, and place the dimension baseline at anchor
projection + n×offsetMm. Horizontal uses d=(1,0); vertical d=(0,1); aligned uses
b-a. A dimension with coincident anchors displays zero and uses horizontal
normal (0,1) rather than dividing by zero. Center the label on the baseline,
rotate readable text back by180° when needed, and draw extension lines from
original anchors. Deleting a referenced vertex while retaining its entity
freezes only anchors to that vertex before the geometry mutation, in the same
atomic command.

### 7.4 Keyboard and clipboard

Canvas scope: Delete/Backspace deletes selected entities; Escape cancels current
edit or clears selection; Ctrl/Cmd+Z undo; Ctrl/Cmd+Shift+Z and Ctrl+Y redo;
Ctrl/Cmd+D duplicate; Ctrl/Cmd+A select all visible editable entities; arrows
nudge 1 mm and Shift+arrows 10 mm; Ctrl/Cmd+G group and Ctrl/Cmd+Shift+G
dissolve; `F` fit selection or facility; `+/-` zoom at viewport center.
Ctrl/Cmd+S requests durable draft save; Ctrl/Cmd+O opens file dialog; Ctrl/Cmd+E
opens export dialog.

Never intercept typing shortcuts in inputs, textareas, contenteditable, or modal
text fields. Focused buttons keep Enter/Space activation. Register shortcuts
once per mounted host and unregister on unmount. Prevent browser defaults only
for an actually handled enabled action. Arrow nudge values are real units
independent of zoom/grid. Copy/paste uses an app-private serialized selection
clipboard by default; system clipboard integration is best-effort and falls back
visibly. Clipboard payload includes used definitions/assets and same duplication
ID/binding rules. Clipboard operations never execute serialized code.

## 8. Catalog, factory fixture and domain relationships

### 8.1 Built-in definitions

All five requested devices are required. Draw their symbols from repo-native
vector primitives; no generated bitmap machine pictures. Geometry dimensions are
examples for the demonstration catalog, not manufacturer-certified
specifications.

| Definition ID     | Footprint in mm     | Clearance envelope                      | Parameters and behavior                                                                                                                                      |
| ----------------- | ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `def-cnc-v1`      | Rect 4000×3000      | Rect from (-1000,-1000), size 6000×5000 | Rigid; 12 kW rated; symbol enclosure, spindle and control panel; fields load, temp, vibration, power, rpm                                                    |
| `def-robot-v1`    | Rect 3000×3000      | Rect from (-1000,-1000), size 5000×5000 | Rigid; 5 kW rated; fence and articulated arm lines; input/output ports at (0,1500)/(3000,1500)                                                               |
| `def-conveyor-v1` | Rect 6000×1000      | Rect from (-500,-500), size 7000×2000   | `lengthMm` default 6000, range 1000..30000 step 100; `widthMm` default 1000 range 500..3000 step 100; `speedMps` default 0.5 range 0..5; ports at end-center |
| `def-rack-v1`     | Rect 4000×1200      | Rect from (0,-1500), size 4000×2700     | `bays` default 4 range 1..20 integer; `levels` default 3 range 1..10; `bayWidthMm` 1000; capacity = bays×levels pallets; depth fixed 1200                    |
| `def-sensor-v1`   | Circle diameter 200 | Same circle                             | Rigid, non-obstructive; observes link required to show device context; temperature/vibration; does not trigger physical collision checks                     |

Conveyor/rack parameter changes regenerate symbol, ports, footprint and
clearance from the same pure generator; display dimensions and reports must
match. Their saved definition describes the nominal template plus generation
policy; their saved parameters are the instance authority. A sensor's spatial
position is independent from the machine it observes. A sensor may be inside the
observed footprint without collision noise.

Provide catalog search by name/category/tag, definition details, accessible
“Place” button and desktop drag/drop. Custom symbol creation: select same-layer
shape entities, choose “Create catalog symbol”, set name and physical
width/height, normalize relative coordinates and create a rigid definition with
exact footprint and clearance defaulting to footprint. SVG symbol import uses
§11 sanitizer; local catalog definitions are embedded in documents when used.
Never evaluate user-supplied JavaScript symbol generators.

### 8.2 Factory fixture: `nave-industrial-v1`

Create one deterministic factory fixture in core and expose it through the
first-run action. Use fixed IDs and injected clock `2026-09-15T00:00:00.000Z`;
default document ID `doc-nave-industrial-v1` when building a fixture, but
allocate a new ID when the user opens it as a new editable document. Facility
60000×40000 mm. Every coordinate below is millimetres, top-left unless stated.

| Entity ID          | Geometry/placement                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| `wall-perimeter`   | Closed centerline vertices `v1`(150,150), `v2`(59850,150), `v3`(59850,39850), `v4`(150,39850); thickness 300 |
| `opening-dock-a`   | Top segment v1→v2, offset 7850, width 4000, dock                                                             |
| `opening-dock-b`   | Top segment v1→v2, offset 17850, width 4000, dock                                                            |
| `opening-entry`    | Right segment v2→v3, offset 4850, width 1200, door                                                           |
| `column-r{r}-c{c}` | Nine 400×400 structural rects centered at X 10000/30000/50000 and Y 10000/20000/30000                        |
| `zone-storage`     | Rectangle corners (1000,1000),(24000,1000),(24000,16000),(1000,16000)                                        |
| `zone-production`  | Rectangle corners (26000,1000),(58000,1000),(58000,26000),(26000,26000)                                      |
| `zone-quality`     | Rectangle corners (1000,24000),(24000,24000),(24000,38000),(1000,38000)                                      |
| `zone-transit`     | Rectangle corners (1000,17000),(24000,17000),(24000,23000),(1000,23000)                                      |
| `zone-hazard`      | Rectangle corners (44000,28000),(58000,28000),(58000,38000),(44000,38000); restricted                        |
| `device-rack-a`    | def-rack-v1 at (4000,5000), rotation 0; assetKey RACK-01                                                     |
| `device-rack-b`    | def-rack-v1 at (14000,5000), rotation 0; assetKey RACK-02                                                    |
| `device-robot`     | def-robot-v1 at (34000,5000), rotation 0; assetKey ROBOT-01                                                  |
| `device-conveyor`  | def-conveyor-v1 at (41000,6000), rotation 0; assetKey CONVEYOR-01                                            |
| `device-cnc`       | def-cnc-v1 at (36000,18000), rotation 0; assetKey CNC-04                                                     |
| `device-sensor`    | def-sensor-v1 at (37500,19500), rotation 0; assetKey SENSOR-04                                               |
| `dimension-width`  | World anchors (0,0),(60000,0), horizontal, offset -1500; reports 60.00 m                                     |
| `dimension-height` | World anchors (0,0),(0,40000), vertical, offset 1500; reports 40.00 m                                        |
| `mark-entry`       | Plain text “Staff entry” at world (56500,4200), height 300                                                   |
| `mark-inspection`  | Inspection annotation anchored to CNC center; text “Inspect spindle”; height 250                             |

Use the four preset layer IDs `foundation`, `sections`, `machinery`, `marks`;
grid remains procedural. Zone colors: storage #F59E0B, production #3B82F6,
quality #8B5CF6, transit #10B981, hazard #EF4444, opacity .25 except hazard .30.
Physical structure #64748B; equipment body #CBD5E1 with #334155 strokes. Actual
canvas document colors are explicit and stable across application themes.
Dark/light UI themes change panels and neutral canvas backdrop, not exported
content colors.

Create `line-assembly` and memberships for robot/conveyor/CNC. Flow relation
robot output→conveyor input; do not fabricate a physically connected CNC port.
Add observes sensor→CNC. Auto-computed geometric zone membership is independent
from optional assignedZone relations: show assignment discrepancies rather than
moving the object. No persisted zone membership cache.

Fixture includes simulator bindings for six devices; fixtures for errors are
separate. Add `nave-conflicts-v1` derived from the fixture by moving rack B to
(6000,5000), placing an additional rack in hazard zone, and moving CNC partly
outside the facility. Its expected issue IDs are deterministic. The clean
fixture has no physical overlap or restricted-zone issues; intended
sensor/device overlap is excluded.

### 8.3 Spatial checks

Checks operate on committed geometry; preview checks are throttled to one per
animation frame for affected candidates only. Report
`SpatialIssue { id, code, severity, entityIds, geometry?, message, measured?, revision }`.
Sort by severity then code then sorted IDs; issue ID is
`${code}:${sortedEntityIds.join(':')}` with an extra feature key when necessary.

| Code                       | Predicate                                                                                                    | Severity/handling                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| `FOOTPRINT_OVERLAP`        | Intersection area >1 mm² between two obstructive equipment/structural footprints                             | Warning; commit permitted                      |
| `CLEARANCE_INTRUSION`      | Another obstructive footprint intersects the clearance-only region (clearance minus own footprint) by >1 mm² | Warning                                        |
| `OUTSIDE_FACILITY`         | Device footprint minus facility rect has area >1 mm²                                                         | Warning                                        |
| `RESTRICTED_ZONE`          | Obstructive device intersects a restricted zone by >1 mm²                                                    | Warning                                        |
| `ZONE_ASSIGNMENT_MISMATCH` | Explicit assignedZone does not contain the complete footprint within 1 mm² tolerance                         | Info                                           |
| `UNBOUND_SENSOR`           | Sensor has no observes relation                                                                              | Info                                           |
| `DISCONNECTED_FLOW`        | Referenced valid ports separated by >1 mm                                                                    | Info, not a prediction of conveyor feasibility |
| `STALE_TELEMETRY`          | Active binding has no fresh good sample                                                                      | Runtime warning, never persisted as geometry   |

Touching edges with area zero are not overlap. Clearance overlap with another
clearance alone is not intrusion. Walls/columns participate as obstacles,
zones/marks/reference images/sensors do not. Nested zones may overlap and are
not themselves errors. Reports make no claims about legal aisle width or
engineering certification. Relationship lines are optional view overlays, not
proof of actual material flow.

## 9. Telemetry and operational viewer

### 9.1 Source contract and data ownership

```ts
type TelemetryValue =
  | number
  | "running"
  | "maintenance"
  | "offline"
  | "unknown";
type TelemetrySample = {
  sourceId: string;
  channel: string;
  value: TelemetryValue;
  observedAt: string;
  sequence: number;
  quality: "good" | "bad" | "uncertain";
};
interface TelemetrySource {
  id: string;
  subscribe(channels: readonly string[], observer: {
    next(batch: readonly TelemetrySample[]): void;
    error(error: Error): void;
    connection(state: "connecting" | "connected" | "disconnected"): void;
  }): () => void;
}
```

Binding field supplies units: temperature °C, vibration mm/s, power kW, load %,
rpm and belt speed m/s. Reject values with wrong type, nonfinite numbers,
negative sequence, negative rpm/speed/power or load outside 0..100. Status
strings are exactly the union above. Channel names max 256 characters, source
IDs max 128. Each subscription tracks last accepted sequence per channel;
discard older/equal samples; reset sequence state when a new connection
generation is declared. Do not compare sequences across different sources or
reconnect generations.

Store latest values in runtime map keyed by document ID/entity ID/binding field.
One source connection per session/source, not one socket per machine. Changing a
binding removes obsolete subscriptions, clears only affected values, and
subscribes the new channel set. A late sample from a disposed generation is
ignored. Inactivity/unmount disposes subscription and timers.

Freshness: good sample is fresh for 5000 ms since receipt by injected monotonic
clock. Bad/uncertain quality is visibly marked immediately. An observedAt >60
seconds ahead of wall clock is marked uncertain with clock-skew info; don't use
it to stay fresh forever. Stale data keeps the last known value with “Stale” and
age, not a manufactured zero. Aggregate status prioritizes explicit offline,
maintenance, running; absent/bad/stale status becomes unknown. Connection lost
is separate from machine offline. Telemetry never changes content hash, undo
history or saved draft revision.

### 9.2 Deterministic simulator

Implement `createSimulator({ seed, clock, tickMs: 1000 })`. Values are pure
functions of seed, assetKey and tick index; a reconnect with the same clock
reproduces readings. Use 32-bit FNV-1a over
`${seed}:${assetKey}:${tick}:${field}`, map unsigned integer to [0,1), and
derive bounded values. Default seed is `blueprint-nave-v1`. Load=40+50u %,
temperature=25+40u °C, vibration=.2+3u mm/s, power=ratedPowerKw×load/100 (null
rated power yields no power sample), rpm=round(1000+7000u), speed from conveyor
parameter. Sequence=tick index within generation. During each 60-tick cycle,
ticks 0..44 running, 45..49 maintenance, 50..54 offline, 55..59 running. Offline
devices emit status but omit numeric updates so freshness visibly expires.
Simulator banner says “Simulated data”. Do not represent this as a
process/physics simulation.

Default UI source is the simulator for the example only; a blank new document
has no bindings/source. Add inspector buttons to bind/unbind selected supported
fields to the simulator. Consumers may inject a source directly. Provide a
WebSocket adapter behind the same port for host use; UI requires explicit host
configuration before opening a socket. It accepts validated JSON arrays of the
sample shape, ignores unknown channel values, limits each message to 1 MiB/1000
samples, and batches rendering at <=10 Hz while retaining the most recent sample
per channel. Reconnect delays are 1,2,4,8,16,30 seconds, maximum 30, with
injected random jitter of ±10%; reset after 10 seconds connected. Cleanup
cancels reconnect timer and closes the owned socket. Default exported documents
contain binding identifiers but no URL credentials or tokens.

### 9.3 Viewer behavior and API

```ts
interface BlueprintViewerProps {
  doc: BlueprintDocument;
  interactive?: boolean; // default true: navigation
  inspectable?: boolean; // default true: selection/hover/list
  telemetrySource?: TelemetrySource;
  selectedAssetId?: Id | null; // optional controlled selection
  visibleLayerIds?: readonly Id[]; // view override, never saves to doc
  onSelectAsset?: (
    event: { documentId: Id; entityId: Id; assetKey: string },
  ) => void;
  onViewportChange?: (camera: Camera) => void;
  onError?: (error: BlueprintError) => void;
}
```

`interactive=false` disables pan/zoom and fits on initial load/resize;
`inspectable=false` disables pointer/keyboard inspection and telemetry popovers.
Both false is a passive floorplan background. Visible telemetry coloring may
still update if a source is supplied. Document prop replacement reconciles by
IDs for the same documentId and clears invalid selection; changed documentId
resets camera, selection, generation and subscriptions. Consumer objects are
never mutated.

Hover popover appears after 250 ms on a device, dismisses after 150 ms off
target unless pointer is over the popover, and stays within viewport with 8 px
padding. Click pins details; Escape closes and returns focus. Touch uses tap;
keyboard asset list uses Enter. Show name, assetKey, definition, zone(s),
status, freshness and available metrics. Do not display fake missing metrics.
Accessible asset list provides search/filter, status text/icons and
focus-to-asset without requiring pixel-level interaction.

Viewer selection is inspection state and has no editing handles. A list
selection can highlight a locked foundation/entity when applicable but cannot
move it. Host callbacks emit IDs and data; no Paper classes escape. Multiple
viewers may share one host-supplied telemetry source implementation only if that
implementation explicitly supports multiple independent subscriptions; each
unsubscribes its own handle.

## 10. Persistence, recovery, revisions and comparison

### 10.1 Repository port

Implement an asynchronous `DocumentRepository` with `list`, `load`, `create`,
`saveDraft`, `delete`, `listSnapshots`, `createSnapshot`, `loadSnapshot`,
`approveSnapshot`, `forkProposal`. `saveDraft` receives `expectedStorageVersion`
and returns new storageVersion or `CONFLICT`; document revision and
storageVersion are different counters. IndexedDB is default; a memory adapter
implements the same port for tests/ephemeral embeds. Rune Lab persistence may
back small user preferences or replace the repository only through a compatible
adapter; do not assume its driver can atomically store large documents.

IndexedDB database `blueprint`, version 1, stores: `documents` (ID, metadata,
draft content reference, complete draft envelope without content,
storageVersion, approvedSnapshotId); `contents` (content hash → canonical
content); `snapshots` (snapshot ID, documentId, content hash, complete source
envelope without content, label, timestamps, revision); `assets` (hash → Blob
for local decode/cache); `preferences` (workspace settings). Every
draft/save/snapshot transaction writes referenced content before updating the
pointer within the same transaction. Canonical serialization and hashes are
computed before opening the IDB transaction; do not await unrelated promises
inside a live transaction. Rehydrate a document from its saved envelope and
content, never invent a new createdAt/revision on load.

Local downloads remain standalone JSON with embedded assets; IDB deduplication
is an internal storage optimization. Retain at most 20 named snapshots per
document in v1; creating the 21st requires the user to delete a non-approved
snapshot or cancel. Never auto-delete the approved snapshot. Content garbage
collection deletes only unreferenced records after successful transactions, with
a separate tested reference scan; it is not part of every autosave.

### 10.2 Save lifecycle

Autosave after 750 ms without a committed mutation, maximum wait 5000 ms under
continuous commits. Ctrl/Cmd+S flushes immediately. Actor states: idle,
debouncing, saving, failed, conflict. While saving revision N, newer edits mark
another save pending; a successful N save marks only its content as saved. Start
the pending latest save next using returned storageVersion. One write at a time
per repository/session. Compare-and-swap of expected version and write happens
in one IDB readwrite transaction, so two tabs cannot both overwrite silently.

BroadcastChannel `blueprint-documents` notifies other tabs of
documentId/storageVersion only, no content broadcast. When a clean tab sees a
newer version, reload it; a dirty tab enters conflict. Conflict UI offers
“Reload saved” (discard current draft only after explicit confirmation) or “Save
as copy” (new documentId). No automatic last-write-wins merge. Undoing to saved
content displays Saved even with a newer envelope revision; downloaded-file
status is tracked separately if shown.

Keep a last-good stored draft until new save succeeds.
Quota/permission/unavailable-storage errors keep editing in memory, show
“Changes are not saved” and offer JSON download/retry. Do not label an in-memory
fallback as durable autosave. Debounce writes; handle visibilitychange/pagehide
with best-effort flush, but do not promise asynchronous writes finish during
unload. Register beforeunload only while unsaved durable changes exist. Startup
recovery offers the stored draft with timestamp and explicit open/discard
choice; no partially drawn entities recover.

### 10.3 Snapshots and proposals

Snapshot creation first commits or cancels any active edit using the normal
command boundary; the snapshot contains committed content only. Default label
`Revision N`; user can rename the snapshot record without modifying its content.
Snapshot content is immutable by hash. “Approve for viewer” chooses an existing
snapshot and atomically updates approvedSnapshotId; show date/label and an
explicit confirmation when replacing an approval. This is local application
workflow, not a server authorization scheme.

Proposal fork creates a new documentId with copied content, original asset
identities/bindings, and provenance
`{ baseDocumentId, baseSnapshotId, baseContentHash }` in metadata. It starts
without an approved snapshot; telemetry is disconnected by default in proposals
to avoid confusing proposed equipment positions with current operations, but the
user may enable view-only readings explicitly. Approving a proposal creates an
immutable snapshot in the base document and changes its approved pointer after a
comparison review; it does not silently overwrite an unrelated dirty base draft.
If base approval changed since the fork, show conflict and require a new
comparison before approval.

### 10.4 Diff and reports

Compare immutable snapshots by persistent entity IDs. Diff categories: added,
removed, geometry/transform changed, specification changed, layer/style changed,
relation/binding changed. Ignore envelope revision/timestamps and all telemetry.
Dictionary ordering must not produce a diff. Proposal IDs preserve entity
identities until explicit duplication. Definition changes count as affected
device geometry/specification changes even if entity definitionId stays constant
only in malformed data; immutable-version validation normally prevents that
case.

Approval snapshot ownership: when promoting a proposal into its base document,
retain the proposal's content and IDs but write a new snapshot envelope owned by
baseDocumentId, with the base document's createdAt and the proposal's source
revision recorded as provenance. Allocate an independent monotonically
increasing snapshot sequence for the base document and use it for the approved
snapshot envelope revision/label. Base draft content/envelope is preserved until
an explicit later reload/apply action; the approved snapshot pointer has its own
repository transaction. Snapshot IDs/content hashes, not a bare
documentId/revision pair, identify immutable snapshots because draft and
snapshot sequences are distinct. When a snapshot is explicitly applied as a
draft, choose a draft revision greater than both the current draft and applied
snapshot revision. Viewer callbacks always report the route/base document
identity. Draft saves update only draft fields and storageVersion and must not
overwrite an approved pointer changed by another transaction.

Display base/proposal side by side with synchronized world cameras, plus overlay
view (added green, removed red dashed, changed amber with before/after outline).
Clicking a diff focuses both cameras and shows numeric X/Y/angle/dimension
changes. Provide counts by zone/category and aggregate footprint
area/capacity/rated power. Live power sum includes only fresh good numeric
samples and labels missing/stale device count; rated power sum never substitutes
for measured consumption. No automatic merge or optimization.

## 11. Native files, SVG and raster import

Native file extension is `.blueprint.json`; MIME `application/json`. File menu
supports New, Open, Save draft, Download document, Duplicate document, Import
SVG, Import background, Calibrate background, Snapshots and Delete local
document. Native Open replaces the current session only after validation and any
needed unsaved-change decision. SVG/background import adds entities to the
active document as one transaction and fits selection; it never replaces
unrelated geometry.

SVG is a restricted graphics interchange format, not a way to recover lost
device semantics. Max source 5 MiB, 25,000 XML elements, 16 levels nesting.
Parse with an inert XML parser, reject DOCTYPE/entities and parser errors.
Whitelist SVG/groups, path, rect, circle, ellipse, line, polygon and polyline.
Whitelist numeric geometry, transform, fill/stroke, stroke-width, dash, opacity
and ID attributes; reject scripts, `on*` attributes, foreignObject, external
URLs, image, use, filters, patterns, animations, CSS stylesheets and unknown
elements. Report the unsupported elements and leave the document unchanged. Do
not silently remove structural content and call the import successful.

SVG text import supports plain `text` with explicit x/y, font-size and fill,
with untransformed or translate/uniform-scale placement only; convert to plain
annotations. Reject textPath, nested tspans, rotated/skewed text and missing
supported glyphs with a clear report. Imported geometry transforms are flattened
into local vertices/Bezier handles and identity/translation transform as
appropriate; ellipse under skew becomes a path. Paths may have multiple closed
contours and holes. Normalize command types to M/L/C/Z; convert quadratics/arcs
to cubic curves with specified 0.1 mm import tolerance. Import placement
includes a scale dialog: default 1 SVG user unit =1 mm; explicit physical SVG
dimensions/viewBox determine the default when unambiguous. Show resulting
width/height before committing.

Use sanitized detached SVG only for Paper import; never inject original markup
with `{@html}`. Materialize ordinary Blueprint entities and discard original
executable markup. Export consumes the normalized document, so imported unknown
attributes never escape later. If browser parsing/import is asynchronous,
capture session/document generation and ignore stale callbacks. No external
network asset fetch occurs from opening a native/SVG file.

SVG normalization never depends on the Paper scenegraph export format: remove
temporary imported Items after converting to domain entities. Native JSON
opening uses the domain parser directly, so a normal reopen does not create a
Paper import layer or duplicate existing Items. The SVG unit dialog is required
when width/height units and viewBox disagree or are absent; prefill the fixed
fallback but require the user to confirm the physical size of this source file
as part of the import UI.

Background accepts PNG/JPEG/WebP from local file. Decode before insertion,
verify pixel/byte limits, apply EXIF orientation once, and store normalized PNG
bytes plus hash. Reference initially defaults to 10 mm/pixel, locked at
foundation bottom. Calibration: select two image-local points, enter actual
positive distance >=1 mm, compute uniform scale `distanceMm / pixelDistance`,
require pixelDistance >=1, and update reference dimensions/translation so the
first selected world point stays fixed. The image remains raster in all exports
and is labeled a reference background. Calibration never claims automatic wall
recognition.

## 12. Export architecture and fidelity contracts

### 12.1 Shared draw list

Implement `buildDrawList(document, options): DrawList` from canonical data. The
Paper renderer and export backends consume this representation, so entity
geometry, holes, text placement, layer order and scale share one definition.
Primitive union: path (`M/L/C/Z`, fills/holes/stroke), text (text, baseline
position, font size, color), and image (assetId, rectangle). Each primitive has
entityId, partId, layerId, transform and effective opacity. Device definitions
expand to primitives; per-entity primitives remain grouped in export metadata.

Draw-list generation is DOM-free and does not instantiate Paper. Put its
contracts/builders under renderer but export them through a pure submodule;
importing them must not evaluate Paper or browser globals. Export formatting
constructs display text separately from metric values. Escape XML/PDF text as
required. Use application-owned Liberation Sans Regular/Bold TTF and WOFF2 fonts
with their license; acquire from the official Liberation Fonts distribution at
dependency setup, record checksum, and serve locally. Export labels use those
fonts; validate glyph coverage and show `FONT_GLYPH_UNSUPPORTED` for missing
characters instead of silent replacement. Initial supported text set must cover
English, Spanish, degree sign, arrows used by built-in marks, and ordinary SI
labels; use vector arrow primitives if a glyph is absent. PDF registers the TTF
before SVG conversion. PPTX declares the same typeface and uses deterministic
text boxes; font substitution on a host without that font is a documented
consumer limitation.

Do not snapshot the current canvas for architectural export. Capture a committed
immutable document revision and, when requested, a timestamped copy of latest
telemetry. An in-progress gesture triggers “Finish or cancel the current edit”
in the export dialog; no partial geometry is exported. Export jobs use states
idle/preparing/rendering/encoding/ready/failed/canceled, accept AbortSignal,
expose progress by processed item/page count, and ignore late results after
cancellation. Limit to one job per editor; disable a second start until
termination. Dynamic-import PDF/PPTX/ZIP libraries only when needed.

Options common to all formats: scope `all printable`, `visible printable`,
`selection`, or `zone`; default visible printable. Scope traverses layer
ancestors and respects `printable`; selected nonprintable layers require
explicit inclusion. Output bounds include actual strokes and measurement labels;
background grid defaults off, telemetry/issues/relations default off,
transparent background default for SVG/PNG/WebP, white for JPEG/PDF/PPTX. Use
white document background when opaque independent of UI theme. Layer opacity
multiplies entity/style opacity exactly once.

`all printable` overrides hidden/visibility flags for included printable
entities, so all exported PDF groups default ON. `visible printable` excludes
effectively hidden content. Add an advanced PDF-only “Include hidden layers,
initially off” switch to retain hidden printable layers in OFF groups; this does
not change the default scope. Selection and zone scopes override view culling
but not printable flags without the explicit include control. DrawList includes
clip polygons for scoped output and a separate export-space text layout stage;
screen-size labels cannot be copied directly into print-space millimetres.

Zone export includes zone polygon and entities whose footprints intersect it;
clips content at the zone boundary and includes a title outside the clip.
Selection export includes semantic dependents needed to render it (selected wall
openings, selected dimension anchors for measurement resolution) without
necessarily drawing unselected referenced entities. Export must not change live
visibility, camera, active layer, locks, selection or history. Failure leaves
application usable and revokes all temporary URLs/canvases.

### 12.2 Format matrix

| Format        | Required fidelity                                                                      | Explicit limitation                                                                               |
| ------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Native JSON   | Full semantic editable document and embedded assets                                    | Runtime/history/repository snapshots are external                                                 |
| SVG           | Vector paths and text, grouped by layer/entity; embedded background images             | Blueprint semantics are metadata for identification, not a guaranteed reimport round trip         |
| PNG/WebP/JPEG | User-selected output pixel dimensions, faithful render                                 | Raster output by definition                                                                       |
| PDF           | Vector native geometry, searchable supported text, real print scale, actual OCG layers | Reference photos remain raster; optional-content UI depends on PDF viewer                         |
| PPTX          | Editable native shapes/freeforms/text, groups and equipment tables                     | Reference photos remain images; CAD constraints/telemetry bindings do not become PowerPoint logic |

### 12.3 SVG and raster

SVG root viewBox uses world-mm bounds, explicit width/height in mm, unique
sanitized IDs, layer groups in order and entity groups with `data-blueprint-id`.
Paths preserve holes with explicit fill-rule; flatten transformations if
necessary for export consistency. Add `<title>` and `<desc>` and document
metadata containing format, documentId, source revision and export timestamp;
omit arbitrary metadata by default. No event handlers, scripts, externally
resolved fonts or linked images. Use embedded data images only. Unit test parsed
bounds, IDs and path count.

Raster dialog offers width px (default 2400), linked height preserving aspect
ratio, format, background and quality `.92` for JPEG/WebP. Cap either edge at
8192 and total pixels at 32 million; calculate estimated RGBA memory before
render. Allocate a fresh export canvas at requested backing resolution, use the
draw list with a dedicated renderer/scope, await fonts/images, draw once, then
`toBlob`. `toBlob` returning null or a browser fallback MIME is a structured
failure (`FORMAT_UNAVAILABLE`) unless user explicitly chooses PNG instead.
Cleanup in finally. The viewport's current size/zoom does not determine output
resolution.

### 12.4 Architectural PDF and optional-content groups

Default A3 landscape 420×297 mm, margins 10 mm. Model region `(10,10,400,242)`
mm; title block `(10,262,400,25)` mm. Title block contains document name,
snapshot/draft label, revision, exported UTC, scale, units, page X/Y and
telemetry timestamp when included. A4 landscape uses 297×210 mm, model region
`(10,10,277,155)` and title block `(10,175,277,25)`. No border or label enters
margins.

Scale choices: 1:50, 1:100, 1:200, 1:500, 1:1000, fit. At 1:N,
`sheetMm = worldMm/N` without independent X/Y stretching. Fit chooses the
smallest listed denominator that fits both dimensions including annotations; if
none fits, calculate a larger denominator rounded up to the next 100 and label
its actual value. Explicit scale that exceeds sheet content bounds requires
tiled output or cancellation; never silently downscale. Tiling uses 10 mm
sheet-space overlap, row-major order, match marks and world origin labels.
Export preview gives expected page count and estimated memory; cap 100
pages/job.

Scale bar is vector with labelled 0, half, full length; choose 1/2/5×10^k
world-mm span closest to 50 mm printed width. A 60000 mm width at 1:200 must
occupy exactly 300 mm before annotation bounds. Test PDF coordinates in points
with conversion `pt=mm*72/25.4` and tolerance 0.05 mm on sheet.

PDF implementation is fixed:

1. For each page tile and included document layer, generate a sanitized
   layer-only SVG using the same model-to-sheet transform and clip.
2. Render it into a temporary page-sized jsPDF PDF through svg2pdf.js with
   embedded fonts. This step runs in a real browser; do not depend on JSDOM
   rendering support.
   [svg2pdf.js documents its browser/curated-SVG constraints](https://github.com/yWorks/svg2pdf.js).
3. Create the final PDF with pdf-lib. Embed each temporary page as a Form
   XObject, preserving vectors and fonts. Allocate an indirect OCG dictionary
   `{Type:/OCG, Name:<layer name>}` for every exported document layer, shared
   across pages.
4. Add catalog `/OCProperties` with `/OCGs` array and `/D` containing `/Order`,
   `/ON`, `/OFF`, `/BaseState /ON`. Set per-page `/Resources /Properties`
   entries mapping safe names `BP_L0`, `BP_L1`, ... to the OCG references.
   Effective exported visibility determines the default ON/OFF list. Title block
   and page furniture remain outside OCGs.
5. Around each layer Form draw, emit `/OC /BP_Ln BDC`, draw the embedded
   full-size page, then `EMC`. Use pdf-lib low-level
   PDFName/PDFOperator/resource dictionaries isolated inside `pdf-layers.ts`;
   never patch arbitrary jsPDF internals throughout the exporter. Use
   page-height conversion for the PDF bottom-left coordinate system.
   [pdf-lib provides page embedding](https://pdf-lib.js.org/docs/api/classes/pdfdocument)
   and [page operators](https://pdf-lib.js.org/docs/api/classes/pdfpage).
6. Add document metadata and title/scale block. Save, parse independently and
   render for verification. A vector PDF without OCG membership does not pass.

### 12.5 Editable PowerPoint

Create a 16:9 deck at 13.333333×7.5 inches. Slide 1 is the complete plan and
title/legend; slide 2+ equipment tables; subsequent slides one per zone,
followed by issues/revision summary when included. Content plan region
`(0.4,0.9,12.533333,5.9)` inches. Use uniform fit preserving aspect ratio.
Equipment table columns: assetKey, name, category, zone, dimensions, rated kW,
status; rows 0.28 inches nominal with wrap-aware expansion and pagination, never
clipped at the footer. Zone summary shows area in m², equipment count and
capacity/rated power where applicable.

Export each Blueprint entity as one named PowerPoint group containing native
subshapes/text. Rectangles/ellipses/lines use native PptxGenJS shapes; text uses
native text boxes. Vector silhouettes and polygons with holes use DrawingML
custom geometry. A whole-plan PNG or SVG image fails editable export. Shared
catalog symbols expand to native per-device groups in the deck so one device can
be moved independently.

Custom geometry algorithm: generate a native shape placeholder through PptxGenJS
with a unique description marker containing entityId/partId. After generating
the PPTX array buffer, unzip with fflate, locate only marked shape nodes through
namespace-aware XML, and replace their preset geometry with `<a:custGeom>` plus
avLst/gdLst/ahLst/cxnLst/rect/pathLst in schema order. Geometry coordinates are
integers in a local 1,000,000-unit space per bounding dimension. Convert
M→moveTo, L→lnTo, C→cubicBezTo, Z→close; retain separate contours and winding
for holes. Set shape xfrm off/ext/rotation consistently; zero-width stroke-only
paths receive a nonzero normalization box. Preserve cNvPr IDs, descriptions,
relationships, text and style. Do not replace XML with broad regular
expressions. Rezip and parse again.
[DrawingML custom geometry](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.drawing.customgeometry?view=openxml-3.0.1)
defines the representation.

Convert slide offsets/extents with 914400 EMU per inch and DrawingML rotation
with 60000 units per degree. For zone slides, clip vector geometry before native
shape emission, using the same0.1mm maximum approximation error when curve
clipping needs tessellation. Labels are included only when their complete text
box fits the zone/model region; otherwise move them to a native legend entry
outside the plan with an anchor leader. Imported reference imagery may be
raster-masked to the zone because it is already a raster asset; the plan's
vector objects remain native. This removes reliance on nonexistent generic
PowerPoint group clipping.

If native grouping is unavailable in the pinned PptxGenJS API,
`pptx-freeform.ts` also groups marked sibling shapes using `p:grpSp`, nonvisual
group properties and `a:xfrm` with off/ext/chOff/chExt defining the same
coordinate mapping. Group IDs are unique per slide. Flatten world rotations into
path coordinates or use DrawingML rotation; never apply both. Pixel images
remain `p:pic` only for imported reference assets. Validation must find
shapes/text for each exported semantic entity, including compound paths. Do not
silently fall back to images if freeform conversion fails; show exact failed
entity IDs and preserve the document.

### 12.6 Report data

Expose `buildEquipmentReport`, `buildZoneReport`, `buildIssueReport`,
`buildRevisionReport` as pure functions returning typed rows. Export JSON report
alongside other formats via the dialog; do not require Excel integration. Same
report data populates the app and PPTX, so counts cannot diverge. A device fully
in multiple overlapping zones appears once in global totals and under each
matching zone with an “overlapping membership” note. Footprint area sums and
occupied union area are separate named fields. Printed telemetry includes
timestamp and freshness; absent readings are null/“Unavailable”, never zero.

## 13. Svelte API, Rune Lab integration and accessibility

### 13.1 Standalone component ownership

`BlueprintEditor` accepts either a provided session or an initialDoc plus
environment, as a discriminated prop union; reject both together. With a
supplied session, the host owns disposal; the component mounts/disposes only its
renderer and UI subscriptions. With initialDoc, the component creates and owns a
session. Changing initialDoc on an already mounted owned editor is not a silent
replacement; host calls `session.openDocument(doc)` so unsaved edits can be
handled. `onDocumentChange` fires exactly once per successful commit/undo/redo
and contains documentId, revision and affected IDs; it never fires on hover or
telemetry. `onSelectionChange`, `onViewportChange`, `onError` are separate
callbacks.

`BlueprintCanvas` owns element lifecycle only. `BlueprintViewer` owns its
read-only renderer and input subscriptions and uses §9 props. No standalone
component imports Rune Lab, calls host toasts, or requires RuneProvider. Default
UI errors are accessible inline messages; the host may also show toasts. All
components render without touching window/document during module import; browser
renderer modules load after mount. Although `apps/vision` remains client
rendered as captured, exported component modules pass SSR
import/render-placeholder tests.

Use a typed per-instance Svelte context for session/accessors. `$state.raw`
bridges immutable document/actor snapshots with replacement assignments. Keep
the bridge object and read `bridge.snapshot` in `$derived` or template; do not
destructure its getter into a stale const. Subscribe before actor start and
resynchronize once after start. Renderer side effects belong in lifecycle hooks
or narrowly scoped effects with cleanup; derived values are pure. Never mirror
the same mutable state simultaneously in a rune store and actor context.

Public core APIs must be usable in Deno tests without Svelte compiler or browser
emulation. Do not export raw Paper Item or AnyStateMachine through consumer
props. Preserve TypeScript strictness; no `any`, `@ts-ignore`, unsafe widening,
wildcard ambient module shims, or disabled diagnostics to make the build pass.
Necessary package boundary casts must be localized, explained, and covered by a
real contract test.

### 13.2 Rune Lab host adapter

Use the real installed Rune Lab `0.5.2-rc.2` declarations. `RuneProvider`,
layout/palettes/i18n plugin imports, WorkspaceLayout snippets,
getLayoutStore/getCommandStore/getRegistryStore/getToastStore and useShortcuts
are evidenced by the current app. The custom plugin definition/store/persistence
API still requires source inspection.

Implement plugin ID `rune-lab.blueprint`, declaring layout and palettes
dependencies using their actual installed identifiers. The plugin slot exposes a
session registry keyed by editor instance ID and `activeSessionId`; multiple
viewers do not share mutable active selection. Provide `getBlueprintStore()`
from the adapter as a typed accessor implemented with the installed API. The
store points to the session/controller; it is not another document authority.
Dispose session registrations when owners unmount, and unregister all palette
commands on plugin teardown.

Inspect the package's public plugin factory and slot lifecycle; record exact
factory name, dependency keys, setup/teardown context, accessor construction,
and return cleanup behavior in API-COMPATIBILITY. If the package lacks a public
custom plugin API entirely, continue standalone/editor work but mark Rune Lab
plugin gate blocked; do not counterfeit an object that merely resembles a
plugin. No change of Rune Lab version without a documented compatibility reason.

Replace AppLayout demo snippets with Toolbar, LayerPanel/CatalogPanel,
BlueprintHost content, Inspector, StatusBar. Keep
layout.applyPreset('workspace') for the Blueprint route and restore prior host
layout on leave if appropriate to installed lifecycle. Use the actual
WorkspaceLayout `workspaceStrip`, `navigationPanel`, `content`, `detailPanel`,
`statusbar` snippets shown in the capture; put header actions in a real
content/header region supported by the package, not an invented slot.

Palette IDs: `blueprint.file.new`, `.open`, `.save`, `.download`;
`blueprint.edit.undo`, `.redo`, `.duplicate`, `.delete`; `blueprint.view.fit`,
`.mode`; `blueprint.export.svg`, `.png`, `.webp`, `.jpeg`, `.pdf`, `.pptx`;
`blueprint.revision.create`, `.compare`, `.approve`. Namespace by active session
in routing, not duplicate global registrations. Disabled states use the same
session `can(command)` logic as toolbar and keyboard. Toast success only after
the promised operation succeeds; canceled export is informational, not failure.

Settings: display units, grid/snap size, snap enabled, hover delay, preferred
export page/scale, reduced animation, toolbar position. Document settings are
commands; personal preferences never rewrite document geometry. Persist only
small JSON preferences through the existing host setting driver when compatible;
default local preferences key `blueprint.preferences.v1`. Test two workspaces do
not overwrite each other's session state.

Inspector field inventory is mandatory: common name/layer/lock/tags; transform
fields only when valid for the entity kind; wall thickness/vertices/openings;
zone category/restriction/area; device definition/assetKey/parameters/rated
power/maintenance/bindings; sensor observes selector; dimension
anchors/axis/offset/unit/precision; annotation text/type/offset/text height;
reference dimensions/opacity/calibrate. Relations are edited through typed
source/port/target selectors in device details, with add/remove buttons;
production lines through a named list and membership selectors. Layer rows
expose add sublayer/reorder/visibility/lock/opacity/printable; selection action
menu exposes align/distribute/group/dissolve/boolean actions with disabled
reasons. File/snapshot/export menus must surface every included operation rather
than leaving it available only in an undocumented API.

### 13.3 Accessibility and responsive behavior

Provide tooltips and aria-labels on icon buttons, pressed state on selected
tools, labelled numeric fields with units and errors, visible focus rings and
dialog focus trapping/restoration. Announce commits, errors and tool changes via
a polite live region, throttled; do not announce every pointer coordinate or
telemetry tick. Color is supplemented by text/icons for statuses and issues.
Asset list and inspector support complete placement/transform/deletion through
keyboard controls, so important operations do not require canvas hit precision.

At width >=1200 px show both side panels; 768..1199 show navigation by default
and inspector as drawer; <768 use one drawer at a time and bottom tool bar.
Canvas retains pan/zoom and tap inspection. Controls have >=24×24 CSS px target
size, major touch controls >=44×44. Respect prefers-reduced-motion; machine
status uses static rings/text rather than mandatory blinking. Telemetry cards
have accessible pinned equivalents. Dialogs escape/close consistently and never
leak shortcuts to the canvas.

### 13.4 Teardown/error invariants

Disposal order: mark generation disposed; cancel active gesture; remove
pointer/keyboard/wheel handlers and capture; disconnect ResizeObserver; cancel
RAF/timers; unsubscribe UI/telemetry; stop owned actors; clear Paper
handlers/project/scope; release decoded images and object URLs. Idempotent
disposal is required. Restoring/remounting creates new owned actors; do not
attempt to restart a stopped actor instance by accident.

Use `BlueprintError { code, message, operation, entityIds?, cause? }` with
stable codes: VALIDATION, READ_ONLY, LOCKED, INVALID_GEOMETRY, OPENING_CONFLICT,
HISTORY_LIMIT, STORAGE_UNAVAILABLE, STORAGE_QUOTA, CONFLICT, ASSET_INVALID,
IMPORT_UNSUPPORTED, EXPORT_FAILED, FORMAT_UNAVAILABLE, FONT_GLYPH_UNSUPPORTED,
GEOMETRY_COMPLEXITY, DEPENDENCY_INCOMPATIBLE, CANCELED. User-visible messages
are concise and actionable; raw stack/cause is available in dev diagnostics. An
error must never leave partially committed document content.

## 14. Workspace tooling, tests and distribution

### 14.1 Required source-aware harness repairs

The captured harness is already using `dv`; do not build another CLI or replace
it with ad hoc pipeline scripts. Keep the root Justfile and five existing recipe
files. Repair these specific gaps as part of BP-14:

| Observed gap                                                                   | Required repair                                                                                                              |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| prepare hardcodes `apps/svelte` though narrower workspace contains only Vision | Discover actual SvelteKit workspace manifests/configs and sync those; no nonexistent-directory command                       |
| test rule only matches core `src/entities/*.test.ts`                           | Discover new package `test/**/*.test.ts` and existing tests; verify nonzero discovery per required suite                     |
| type rule may send Svelte UI barrels to plain Deno checker                     | Classify pure TS vs `.svelte`/`.svelte.ts` dependency closures; Svelte packages use Svelte checker, pure packages Deno check |
| test configs lack explicit named projects                                      | Name state/ui/renderer/exporters/vision test projects consistently with dv `--project` arguments                             |
| check lists fmt/lint/types but omits audit/health                              | Include audit/health; document thresholds and nonzero exit on failure                                                        |
| build directly bundles without the stated CI contract                          | Public build runs test then check then bundle exactly once; use a private bundle recipe to avoid dependency recursion        |
| `_clean-tree` exists as an old private gate                                    | Remove unused obsolete helper/references; do not require a clean user tree to test Blueprint                                 |
| docs name scripts/cli paths absent in source                                   | Update WIRING.md to actual scripts/compat.ts and dv wiring after verifying execution                                         |

Keep commands as argument vectors inside dv rules; no shell-concatenated user
paths. Use existing Nu/Just quoting conventions and the installed dv schema.
Verify actual `dv --help` before changing flags. Run target selection correctly
with one or multiple present apps. Preparation compatibility shim runs before
parallel child commands so children do not race while patching node_modules.
Deno.env changes in a compatibility process do not propagate to later
independent processes; if TSGO_BIN is required, export it in the invoking
environment or pass it explicitly to the spawned check command. Do not assume
the shim's environment side effect persists across separate Just lines.

No new Blueprint config file. Add required browser test configuration under
`config/playwright.config.ts`; this is tooling configuration, not a new
user/application configuration convention. Runtime settings remain as specified.
Browser tests invoke the app through `deno run -A npm:vite` via existing Vite
compatibility resolution, and use the pinned Playwright package through Deno. Do
not swap to npm scripts.

### 14.2 Suite ownership and commands

| Suite       | Location                    | Engine and responsibility                                                         |
| ----------- | --------------------------- | --------------------------------------------------------------------------------- |
| core        | `sdk/core/test/blueprint/`  | Deno test, pure schemas/reducers/geometry/history/reports                         |
| api         | `sdk/api/test/blueprint/`   | Pure protocol/memory tests in Deno; IndexedDB/WebSocket integration in browser    |
| state       | `sdk/state/test/blueprint/` | Existing Vite+/Vitest runner for actor/rune integration and fake timers           |
| renderer    | `sdk/renderer/test/`        | Browser tests for scopes/picking/coordinates/DPR; pure draw-list checks in Deno   |
| exporters   | `sdk/exporters/test/`       | Pure XML/ZIP geometry tests + real-browser export generation                      |
| ui          | `sdk/ui/test/blueprint/`    | Svelte component tests and keyboard/panel contracts                               |
| application | `apps/vision/test/`         | Playwright end-to-end workflow, local persistence, responsive and lifecycle tests |

Use `just test`, `just types`, `just check`, `just ci`, `just build vision` (or
the installed dv equivalent selection syntax) as the stable front door. Add
`just test-browser` and `just test-exports` in test.just, not new runner scripts
for pipeline orchestration. The executor records exact working command syntax in
VERIFICATION after checking dv's actual interface; documentation must not
preserve a command that the installed CLI rejects.

Core tests require no network/browser/nodeModules at runtime except resolved
normal package dependencies. Raster/SVG-to-PDF tests run in a real Chromium
browser; Firefox covers input/render/viewer semantics. Headless DOM mocks alone
cannot prove Canvas, image decode, font layout, SVG conversion or Pointer
Events. Tests use injected IDs/clocks and fixed fixtures. Assert result
semantics and parsed artifact structure, not arbitrary private function layout.

### 14.3 Build and packaging contract

All SDK exports typecheck and app builds with current Deno workspace resolution.
Keep synchronous defineGWA/defineSveltePkg configuration shape. Confirm aliases
for both `@sdk/renderer` and deeper imports resolve identically in Deno, bundler
and TS. Avoid OS-dependent raw URL `.pathname` errors for spaces/Windows when
modifying config path code; use the existing project-compatible URL-to-path
utility where needed. Do not add broad declaration shims to hide asset or module
errors.

Code-split exporter dependencies away from the viewer initial bundle. Dynamic
browser renderer import must not pull PDF/PPTX on viewer-only routes. Serve
fonts and example assets locally. The app works offline after its resources have
loaded for the session; installing a service worker/offline PWA is excluded.
Network disconnection does not block local editing/saving/export with already
loaded format assets. Do not claim cold offline reload support without a service
worker.

Distribution output: built `apps/vision` application; reusable SDK source
exports; documented standalone viewer/editor example; versioned native fixture;
tests and verification report. Keep the project's MIT license and include
licenses/attribution for bundled fonts and any new third-party assets.
Publishing the application/package is a separate user action; the guide's
completion gate validates artifacts locally.

## 15. Ordered execution work packages

Follow this order. Each package has a concrete exit gate; implement, test,
update EXECUTION-STATUS, then continue. A partially passing phase remains in
progress. No phase may replace a functional requirement with a
screenshot/mock-only panel. The supplied skills are reference inputs, not
generated application dependencies.

| Work package                | Dependency          | Required implementation                                                                                                                                                                                                    | Exit evidence                                                                                                                          |
| --------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| WP-00 Baseline/API audit    | None                | Inspect actual tree/git status, read source and skills, record dependency versions, compare captures, probe Rune Lab/XState/Paper/Svelte integration, identify baseline failures                                           | API-COMPATIBILITY with actual signatures, baseline command outcomes, no fabricated APIs                                                |
| WP-01 Workspace foundations | WP-00               | Add renderer/exporters packages, dependency mappings and lock policy; discover valid app targets; fix test/type discovery, lint suppression, prepare paths; introduce empty but runnable named test suites only as staging | Every intended suite discovered; build/check front door executes with honest exit codes; empty suites cannot count as later acceptance |
| WP-02 Domain and schema     | WP-01               | Types, strict schemas, units, canonical serialization, IDs, migrations, minimal blank fixture, full definition/asset validation                                                                                            | AC-001..AC-008 pass without DOM                                                                                                        |
| WP-03 Geometry and catalog  | WP-02               | Transform helpers, polygons, wall/opening derivation, anchors, device parameter generators, five catalog definitions and factory fixture                                                                                   | AC-009..AC-015 and fixture validity                                                                                                    |
| WP-04 Commands/history      | WP-03               | Command union/reducer/permission checks, deltas, dependency deletion rules, grouping/layers, history memory accounting                                                                                                     | AC-016..AC-023                                                                                                                         |
| WP-05 Canvas projection     | WP-03               | Draw list, Paper scope ownership, layered rendering, camera/grid, resize/DPR, picking, accessible asset list                                                                                                               | AC-024..AC-029; two independent canvases                                                                                               |
| WP-06 First complete loop   | WP-04, WP-05        | Session, bare editor/viewer, place/move/rotate device, native download/open, injected simulator status, memory persistence                                                                                                 | Create/place/save/reopen/view/select workflow passes; this is an intermediate gate, continue                                           |
| WP-07 Full interaction      | WP-06               | XState lifecycle, all tools, snapping, pointer capture/touch, multi-select/clipboard/keyboard, numeric inspector                                                                                                           | AC-030..AC-040 and all tool workflows                                                                                                  |
| WP-08 Durable repository    | WP-04, WP-06        | IDB adapter, autosave actor, save queue, conflict protocol, recovery/quota fallback                                                                                                                                        | AC-041..AC-046                                                                                                                         |
| WP-09 Operations and checks | WP-03, WP-06        | Simulator/protocol/WebSocket adapter, stale values, overlays, zone/asset reports, spatial checks/worker                                                                                                                    | AC-047..AC-053                                                                                                                         |
| WP-10 Rune Lab/UI           | WP-07, WP-08, WP-09 | Real plugin/store adapter, shell/palette/settings, standalone API, responsive panels and accessibility                                                                                                                     | AC-054..AC-059                                                                                                                         |
| WP-11 Imports               | WP-07, WP-08        | Strict SVG normalization, background decode/calibration, native error handling and portable assets                                                                                                                         | AC-060..AC-064                                                                                                                         |
| WP-12 Revisions             | WP-08, WP-09, WP-10 | Named immutable snapshots, approval, proposal fork, diff views, conflict on changed base                                                                                                                                   | AC-065..AC-069                                                                                                                         |
| WP-13 SVG/raster exports    | WP-05, WP-09, WP-11 | Export draw-list options, SVG serializer, independent raster canvas, jobs/cleanup                                                                                                                                          | AC-070..AC-074                                                                                                                         |
| WP-14 Architectural PDF     | WP-13               | Font registration, true scale/tile layout, layer PDFs, pdf-lib OCG assembly, title block                                                                                                                                   | AC-075..AC-078 with parsed PDF and visual evidence                                                                                     |
| WP-15 Native PPTX/reports   | WP-13, WP-12        | Native shapes/text/groups, custom geometry ZIP adapter, tables and zone pages, reports                                                                                                                                     | AC-079..AC-082 with XML validation and rendered deck                                                                                   |
| WP-16 Hardening and handoff | All earlier         | Lifecycle/performance checks, full acceptance workflow, package import checks, docs and final manifest alignment                                                                                                           | AC-083..AC-088 and release checklist                                                                                                   |

### 15.1 Work package execution protocol

For each WP: read the specified ownership modules, add or amend implementation,
run the smallest test set proving its exit gate, fix failures, then run affected
type checks. Record command, exit status, test count and evidence paths in
EXECUTION-STATUS. Do not run the entire suite after every CSS edit. At milestone
WP-06 and release WP-16 run the full available regression suite.

If a full workspace baseline already fails for unrelated React/Vue samples,
preserve their files, identify the failing command and baseline status, and
still run/repair Blueprint's required suites. Release status distinguishes
Blueprint acceptance from unrelated baseline failures; do not declare the entire
workspace green while they fail. If a required Rune Lab or export gate is
blocked, finish independent packages but report release incomplete with exact
blocker.

No shell command in this document is permission to bypass a protected
environment or fetch credentials. Existing normal dependency credentials may be
used through their configured workflow. No real machine is controlled by this
software. Client-side preview is not a substitute for server authorization in
future hosted integrations.

## 16. Acceptance test catalog

The following assertions are required; combine related cases into a readable
test file where sensible. IDs remain stable in VERIFICATION. Unless specified,
use 60,000×40,000 mm facility, injected clock, isolated repository and
deterministic IDs. A “passes” statement requires an executed assertion, not code
inspection alone.

### 16.1 Core, geometry and history

| ID     | Input/action                                                              | Expected result                                                                                                |
| ------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| AC-001 | Blank v1 document serialize→parse→normalize→serialize                     | Identical canonical content and hash; unit mm                                                                  |
| AC-002 | Coordinates NaN/Infinity, negative widths, extra unknown structural field | Structured validation failure; live document unchanged                                                         |
| AC-003 | Duplicate ID, map key mismatch, layer cycle, dangling definition          | Exact relevant validation codes/paths                                                                          |
| AC-004 | Change display unit m→mm                                                  | Stored geometry identical; 4000 mm displays 4.00 m or 4000 mm accordingly                                      |
| AC-005 | Future schemaVersion=2                                                    | Reject with version message, no fallback Paper import                                                          |
| AC-006 | 20 MiB+1 byte file or depth-9 metadata                                    | Limit rejected before expensive geometry/import                                                                |
| AC-007 | Same content with changed envelope timestamps/revision                    | Same content hash; object key reorder does not change hash                                                     |
| AC-008 | Export doc with stale runtime samples/selection/history in session        | Native file contains none of those runtime fields                                                              |
| AC-009 | Local (1000,0), transform x=2000,y=3000,rotation=90                       | World (2000,4000) within .001 mm; inverse recovers original                                                    |
| AC-010 | 10000 mm horizontal wall thickness 300, opening offset 2000 width1000     | Derived cut removes full wall thickness on interval 2000..3000; wall/opening remain separate semantic entities |
| AC-011 | Move that wall +500 X, then shrink segment below opening end              | Opening follows move; invalid shrink rejects atomically                                                        |
| AC-012 | Zone bow-tie and overlapping holes                                        | Reject invalid polygon, no repaired topology guessed                                                           |
| AC-013 | CNC rotate 90 degrees around footprint center                             | Width/height specification stays 4000×3000; center unchanged                                                   |
| AC-014 | Rack bays=6, levels=4; conveyor length=12000                              | Rack width6000/capacity24; conveyor port end x12000; symbols and reports agree                                 |
| AC-015 | Dimension anchors (0,0),(3000,4000)                                       | Aligned5000, horizontal3000, vertical4000 mm                                                                   |
| AC-016 | Preview API attempts add/move/delete/undo                                 | All READ_ONLY; identical content/history                                                                       |
| AC-017 | Multi-selection includes one locked entity                                | Entire mutation rejected; no unlocked member moves                                                             |
| AC-018 | 100 pointer preview moves then commit                                     | Exactly one document revision increment and one undo entry                                                     |
| AC-019 | Gesture returns to initial quantized position                             | No document/history/timestamp change                                                                           |
| AC-020 | Commit A, B; undo B; commit C                                             | Redo empty; undo C restores A; revision remains monotonic                                                      |
| AC-021 | Delete wall with opening and anchored dimension                           | Opening deleted; dimension anchor frozen to resolved point; undo restores all IDs/relations                    |
| AC-022 | Duplicate two connected devices                                           | New IDs/unique asset keys, internal cloned relation, cleared live bindings; original unchanged                 |
| AC-023 | Add >100 history entries and hit byte cap                                 | Oldest whole entries evicted within both bounds; most recent undo correct                                      |

### 16.2 Canvas and interactions

| ID     | Input/action                                                           | Expected result                                                                     |
| ------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| AC-024 | Mount two scopes, alternate mutations, create export scope             | Each document gets only its items; disposal of one preserves other                  |
| AC-025 | Canvas at page offset (120,80), scrolled page, click known world point | Correct entity/coordinate with camera transform; no client-coordinate drift         |
| AC-026 | DPR1 then DPR2 with same CSS size                                      | Same world placement and pointer mapping; sharper backing canvas, no double scaling |
| AC-027 | Zoom under cursor from scale1 to2                                      | World point under cursor moves <.001 mm equivalent numerical error                  |
| AC-028 | Resize collapsed panel through zero width then reopen                  | No NaN/Infinity camera; center/scale preserved                                      |
| AC-029 | Hide layer, lock another; click under editor then viewer policy        | Hidden never picks; locked skips edit but allows viewer inspection                  |
| AC-030 | Release pointer outside canvas after drag                              | One final commit, capture released, idle state                                      |
| AC-031 | Escape, pointercancel, lost capture or blur mid-drag                   | Original content restored; no history entry; no ghost handles                       |
| AC-032 | Change editor→preview mid-wall drawing                                 | Partial wall discarded; saved layer locks unchanged; telemetry still updates        |
| AC-033 | Snap candidate 7 px away at two zoom levels                            | Both acquire; 13 px releases; tie chooses stable ID                                 |
| AC-034 | Move multi-selection with snap                                         | Identical common delta; relative spacing unchanged                                  |
| AC-035 | Shift-rotate device to nearest 15 degrees                              | Angle normalized and exact; Alt disables geometric snaps                            |
| AC-036 | Resize rigid CNC vs rack                                               | CNC shows no size handles/rejects resize; rack uses validated bay parameter         |
| AC-037 | Wall/zone Enter and double-click completion                            | Exactly one completed entity; no trailing duplicate vertex/entity                   |
| AC-038 | Two-finger gesture begins while moving device                          | Device preview canceled, pinch follows centroid, release returns idle               |
| AC-039 | Ctrl+Z inside inspector text field                                     | Native text undo; document history unchanged until canvas regains focus             |
| AC-040 | Arrow held and released, inspector invalid value and Escape            | One nudge undo; invalid value never commits; Escape restores prior input            |

### 16.3 Persistence, operations and integration

| ID     | Input/action                                             | Expected result                                                                                            |
| ------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| AC-041 | Commit repeatedly then advance fake clock                | Save after750ms idle or at5000ms maximum; latest content durable                                           |
| AC-042 | Save revisionN delayed while revisionN+1 commits         | N completion does not show latest saved; next save writes N+1                                              |
| AC-043 | Two tabs save same expected storageVersion               | Exactly one succeeds; other CONFLICT; both versions recoverable as copy                                    |
| AC-044 | Simulate IDB quota failure                               | Current document intact/dirty; download and retry available; no false Saved                                |
| AC-045 | Reload after successful autosave                         | Draft recovery restores canonical content/IDs, empty gesture/history                                       |
| AC-046 | IDB unavailable                                          | Explicit memory-only state; no durable-recovery promise                                                    |
| AC-047 | Same simulator seed/time in two runs                     | Byte-equivalent sample batches; no Math.random/date dependency outside injected environment                |
| AC-048 | Duplicate/out-of-order/bad numeric telemetry             | Duplicate/out-of-order ignored; malformed values rejected; bad quality visibly marked                      |
| AC-049 | Last good sample then advance >5000ms                    | Last value retained as Stale; no zero substitution; document hash unchanged                                |
| AC-050 | Rebind/unmount with queued old-source callback           | Old values/callbacks ignored; exactly one cleanup per subscription                                         |
| AC-051 | Device rect (0,0,4000,3000) and another at (4000,0)      | Edge contact yields no FOOTPRINT_OVERLAP; move second to x3999 yields overlap                              |
| AC-052 | Conflict fixture plus clean fixture                      | Clean fixture no physical/restricted issues; conflict fixture yields expected overlap/hazard/outside codes |
| AC-053 | Sum live/rated power with missing/stale sample           | Separate totals and missing counts; stale not counted as fresh live power                                  |
| AC-054 | Mount editor/viewer without RuneProvider                 | Functional; no host context error or dependency on host toasts                                             |
| AC-055 | Svelte bridge actor start transition then two events     | UI shows each new snapshot; no destructured-getter freeze                                                  |
| AC-056 | Route mount/unmount 20 times with palette commands       | One active registration set; zero leaked registrations after unmount                                       |
| AC-057 | Two editors, palette action targets active one           | Other document, selection and history unchanged                                                            |
| AC-058 | Keyboard-only place, inspect, numeric move, save, export | Workflow completes; focus restored after each dialog                                                       |
| AC-059 | Viewports1440×900,1024×768,390×844; reduced motion       | Panels follow policy, no inaccessible overflow, no required animation                                      |

### 16.4 Import, revisions and export

| ID     | Input/action                                                   | Expected result                                                                             |
| ------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| AC-060 | SVG with script/event handler/external image/DOCTYPE           | Reject clearly, no network request or executable DOM insertion                              |
| AC-061 | Supported SVG rect/path/hole with scale                        | Correct normalized dimensions and holes; import is one undo entry                           |
| AC-062 | Unsupported SVG filter/rotated text                            | Explicit unsupported report; current doc unchanged                                          |
| AC-063 | Calibrate image points100 px apart to10000mm                   | 100mm/px uniform scale; first anchor fixed                                                  |
| AC-064 | Corrupt embedded asset or late image load after doc switch     | Reject/ignore safely; no stale entity inserted                                              |
| AC-065 | Snapshot then edit live doc                                    | Snapshot content/hash unchanged                                                             |
| AC-066 | Fork proposal and move CNC +1000 X                             | One changed entity geometry category, same asset identity, runtime telemetry disconnected   |
| AC-067 | Compare reordered dictionaries and changed timestamps only     | Zero semantic changes                                                                       |
| AC-068 | Approve proposal while base approval changed since fork        | Conflict requires renewed compare; no silent overwrite                                      |
| AC-069 | Viewer route with approval then dirty draft edit               | Viewer remains on approved snapshot; draft badge only when no approval                      |
| AC-070 | SVG all vs visible printable, selection handles visible in app | Correct layer scope; zero grid/handles unless requested; stable entity IDs                  |
| AC-071 | SVG bounds with negative dimension offset                      | Includes dimension label/stroke; no clipped marks                                           |
| AC-072 | PNG2400px wide from small zoomed-out canvas                    | Exact requested width/aspect, independent of viewport; no UI controls                       |
| AC-073 | WebP/JPEG unavailable/null toBlob                              | FORMAT_UNAVAILABLE; no wrongly labelled download                                            |
| AC-074 | Cancel export while editing another viewport                   | Export disposed; live camera/document unchanged                                             |
| AC-075 | PDF60000mm span at1:200                                        | 300mm physical extent ±.05mm; title says1:200                                               |
| AC-076 | PDF selected scale too large                                   | Exact-scale tiling or explicit cancel; never silent distortion                              |
| AC-077 | Four-layer PDF structural parse                                | Four OCGs, OCProperties, per-layer marked content references and correct default visibility |
| AC-078 | PDF render/text extraction                                     | Vectors retained, supported labels searchable, title/scale/units present, no clipped glyphs |
| AC-079 | PPTX export six-device fixture                                 | Each device native group with shapes; plan not one p:pic; IDs/positions preserved           |
| AC-080 | PPTX cubic/compound-hole/rotated fixture                       | custGeom commands/holes/rotation valid and visually match SVG                               |
| AC-081 | PPTX many equipment rows and five zones                        | Tables paginate without clipping; one zone slide minimum per zone                           |
| AC-082 | Report and PPTX zone/global totals                             | Same typed report data/counts; null readings not zero                                       |

### 16.5 Release and regression

| ID     | Input/action                                                  | Expected result                                                                    |
| ------ | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| AC-083 | 20 mount/dispose cycles with pending assets and simulator     | Zero owned timers/listeners/subscriptions/scopes after disposal; no later mutation |
| AC-084 | Core import under Deno and UI import under SSR renderer       | No unexpected DOM/Paper access; placeholder SSR render valid                       |
| AC-085 | Viewer-only production route dependency/network audit         | PDF/PPTX/ZIP libraries absent from initial route load                              |
| AC-086 | Full harness with deliberately failing temporary test fixture | Test discovery and nonzero exit correctly propagate; remove fixture afterward      |
| AC-087 | Performance fixtures in §17                                   | Measured targets met or release explicitly blocked on listed regression            |
| AC-088 | End-to-end completion scenario below                          | All operations survive save/reload and exports satisfy structural/visual checks    |

For AC-086 use a dedicated runner fixture/config or a temporary test file under
an isolated test project; do not leave a failing assertion in the user's default
suite. For all export cases, inspect ZIP/XML/PDF structure and rendered
appearance. Do not assert that output looks correct merely because `writeFile`
returned.

## 17. Performance and resource budgets

These are acceptance targets, not claims about current implementation. Record
CPU, memory, OS, browser version, DPR, viewport, fixture size and production
build commit alongside timings. Reference runner is a machine with >=4 CPU cores
and >=8 GiB RAM, Chromium at1440×900, DPR1, production build, no dev inspector.
Tests use fixed seeded scenes, three warmup runs and 30 measured runs. Compare
the same runner before/after changes. Browser version/revision is pinned by
WP-00.

| Scenario                                   | Target                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------- |
| 1000 entities, typical factory             | Initial interactive render <=1500ms p95 after required assets loaded                  |
| 1000 entities drag/pan                     | Frame interval <=20ms p95 during 5-second gesture                                     |
| 10000 entities overview                    | Initial interactive render <=5000ms p95; drag/pan <=40ms p95                          |
| Picking 10000 entities                     | <=8ms p95 query excluding browser event dispatch                                      |
| Commit20 affected entities in10000 scene   | Synchronous core/renderer work <=50ms p95; advisory checks may finish asynchronously  |
| 1000 device telemetry samples/sec incoming | Render batching <=10Hz; no document/history writes; no unbounded sample queue         |
| Serialize5MiB native document              | <=500ms p95 outside UI critical event; no repeated serialization per pointermove      |
| Unmount20 cycles                           | Owned-resource counters return to baseline; no persistent growth across last10 cycles |

Use RBush broad-phase indexes, stable IDs, incremental entity updates, symbol
reuse, viewport culling and adaptive grid/label detail. At zoom where a device
<6px across, draw simple footprint/status and suppress detailed symbol parts; at
>=6px show normal symbol. Selected/hovered objects retain useful indication.
Culling never removes document entities or changes export.

Advisory spatial checks run in a module worker
`sdk/state/src/blueprint/constraints.worker.ts`, receiving plain normalized
geometry/deltas and returning issues tagged documentId/revision/generation.
Structural command validation stays synchronous. Drop stale worker results;
while latest checks are pending show “Checking layout…” and never present old
issue counts as current. Export with included issues awaits current checks or
fails/cancels explicitly. Worker startup failure uses chunked main-thread
analysis with the same algorithm and cooperative yielding, not a false clear
result. Bound worker queue to the latest job; cancellation/generation
invalidation prevents backlog.

Do not run a permanent 60fps Paper animation loop for a static layout. Redraw on
dirty content/camera/telemetry or an active gesture. Hidden tab pauses animation
and UI repaint; real source state may still arrive but only latest bounded
values are retained. Resume refreshes freshness and camera. Limit retained
telemetry to bound fields per live entity; historical chart storage is excluded.

## 18. End-to-end completion scenario

Run in a fresh local browser profile and repeat saved-data stages after reload:

1. Open industrial example. Verify facility60×40m, four layers, five catalog
   types, six equipment instances and measured dimensions.
2. Unlock foundation, add a wall and door, change thickness, move wall, confirm
   door remains attached. Relock foundation.
3. Draw a new transit polygon, place CNC and rack, rotate CNC90°, change rack
   bays, measure distance between asset centers.
4. Drag CNC with snapping and cancel. Confirm content unchanged. Drag again and
   commit; undo/redo yields identical positions and one history entry.
5. Bind example telemetry, inspect through mouse/touch/keyboard, advance into
   simulated offline/stale period, verify data freshness never changes saved
   state.
6. Save draft, reload, recover, confirm asset IDs, parameters, opening
   relations, measurements and embedded catalog match.
7. Open the second browser tab, create conflicting draft edits, verify
   compare-and-swap and Save as copy preserve both.
8. Create and approve snapshot. Open viewer route and prove editing commands
   fail while locked assets remain inspectable.
9. Fork proposal, move an asset into restricted space, inspect spatial issue,
   compare to approved snapshot, review changes and approve with explicit
   confirmation. Verify original dirty draft handling.
10. Import safe SVG and calibrate an image. Reject a malicious/unsupported SVG
    without altering the plan.
11. Export native JSON, SVG, PNG, WebP, JPEG, A3 PDF at1:200 and PPTX. Reopen
    native file. Parse and render other outputs, inspect PDF layers and PPTX
    native entities, compare report counts.
12. Open embed demo with two independent viewers and an editor. Alternate
    interactions and export. Dispose/remount; confirm no cross-canvas data or
    lifecycle leakage.
13. Execute targeted and complete release checks, capture evidence and mark all
    acceptance rows.

## 19. Required documentation and handoff

Update the old manifest so it agrees with this implementation: canonical
Blueprint document, extensible layer preset, separate runtime telemetry/session,
XState choice settled, real editor/viewer API, existing SDK workspace paths,
exact export subset. Replace outdated PLAN phase checklists with WP-00..WP-16
and references to acceptance IDs. Update REFERENCES with provided skills, §3
corrections, exact installed versions and primary links. Replace absolute
`/home/yrrrrrf/...` links with repo-relative paths/resource names when possible;
do not claim local skill files exist without resolving them.

`docs/EXECUTION-STATUS.md` contains one row per WP: status
pending/in_progress/passed/blocked, commit or file set, acceptance IDs,
command/results, evidence paths and blockers. `docs/VERIFICATION.md` contains
all AC IDs, environment, command exit codes/counts, parsed export checks, visual
screenshots, benchmark results and known failures. `docs/API-COMPATIBILITY.md`
contains exact dependency versions, Rune Lab plugin mapping, Paper scope
behavior and corrected Svelte/XState probes. The root README gives launch/check
commands that actually run, capabilities, native format, standalone embedding
and real limitations.

Traceability matrix (cases can support more than one requirement):

| Requirement | Main work packages | Main acceptance evidence               |
| ----------- | ------------------ | -------------------------------------- |
| BP-01       | WP-02,04,08,11     | AC-001..008,041..046,060..064          |
| BP-02       | WP-03,05,07,11     | AC-009..011,024..029,037,063           |
| BP-03       | WP-03,07,09        | AC-012,037,051..053                    |
| BP-04       | WP-03,06,07,09     | AC-013..014,022,036,047..050           |
| BP-05       | WP-04,05,07        | AC-016..023,024..040                   |
| BP-06       | WP-04,07           | AC-016..023,030..032,040               |
| BP-07       | WP-06,09,10        | AC-016,029,032,049,054..059,069        |
| BP-08       | WP-09              | AC-047..053                            |
| BP-09       | WP-03,09,12        | AC-011..012,051..053,066               |
| BP-10       | WP-08,12           | AC-041..046,065..069                   |
| BP-11       | WP-02,11           | AC-001..008,060..064                   |
| BP-12       | WP-13,14,15        | AC-070..082                            |
| BP-13       | WP-01,10,16        | AC-054..059,083..086                   |
| BP-14       | WP-01,16           | AC-030..032,041..046,058..059,083..088 |

Release checklist:

- [ ] All BP-01..BP-14 map to implemented behavior and acceptance evidence.
- [ ] WP-00..WP-16 are passed; no required gate silently skipped.
- [ ] AC-001..AC-088 have executed outcomes and reproducible evidence.
- [ ] No fake publish success, swallowed check errors, no-op handlers, TODO
      feature stubs, placeholder telemetry labelled live, or screenshot-only
      editable exports.
- [ ] Canonical/native round trip, undo dependency restoration, read-only
      enforcement and multiple canvases pass.
- [ ] PDF layers and scale, PPTX native groups/freeforms/text and raster output
      dimensions verified independently.
- [ ] Full factory scenario, standalone import, keyboard/touch, persistence
      conflict/recovery and cleanup pass.
- [ ] Actual built application and SDK source exports are available locally;
      user changes and unrelated apps preserved.
- [ ] Handoff states what changed, exact tests, unresolved baseline limitations
      and how to launch. No deployment/publication claimed without performing an
      authorized operation.

## 20. Executor kickoff instruction

Use this instruction together with this entire specification and the same
supplied project/skill resources:

> Implement Blueprint according to `Blueprint-Implementation-Specification.md`
> in the actual supplied Deno workspace. Treat its architecture, data model,
> behavior, package ownership, export fidelity and acceptance criteria as
> settled. Start with WP-00, record installed APIs and baseline outcomes, then
> execute WP-01 through WP-16 in order. Use the associated skills with the
> specification's errata applied. Preserve unrelated source and use the existing
> dv/Just/Vite+/SvelteKit wiring. Continue past the first working canvas and
> vertical slice until every required capability and acceptance gate is
> complete. Resolve routine coding/API adaptation details independently; report
> actual blockers without inventing APIs, weakening tests, flattening editable
> exports or claiming unsupported functionality. Maintain EXECUTION-STATUS,
> API-COMPATIBILITY and VERIFICATION as you work. Finish with runnable
> application/SDK code and evidence. Do not deploy or publish unless separately
> authorized.

The scope of “everything” in this contract is the complete release1.0 described
here. Excluded future capabilities are not missing implementation tasks. Within
the included scope, no essential product decision is deferred to the
implementing model.
