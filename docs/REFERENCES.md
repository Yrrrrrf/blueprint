# Blueprint: Technical Skills & References Map

> [!abstract] Context Guide for Implementation Agents
> This document maps all relevant skills, library documentation paths, architectural invariants, and normative API rules needed to implement the **Blueprint** factory CAD/layout canvas for **rune-lab**. All paths are repo-relative (`docs/skills/...`). The normative errata from Section 3 of `Blueprint-Implementation-Specification.md` override any conflicting sample code.

---

## 1. Primary Skills Index

All reference skills are resolved locally in `docs/skills/`:

| Skill Name | Local Path | Role in Blueprint | Key Reference Files |
| :--- | :--- | :--- | :--- |
| **`paper.js`** | `docs/skills/paper.js` | **2D Vector Canvas Engine:** Scenegraph, layers, Bézier curves, boolean geometry, matrix transforms, SVG I/O (`@sdk/renderer`). | [`SKILL.md`](skills/paper.js/SKILL.md), [`geometry-and-paths.md`](skills/paper.js/geometry-and-paths.md), [`interaction-and-animation.md`](skills/paper.js/interaction-and-animation.md), [`styling-and-io.md`](skills/paper.js/styling-and-io.md) |
| **`rune-lab`** | `docs/skills/rune-lab` | **Application Shell & Plugin Architecture:** Kernel dependency injection, 5-zone `WorkspaceLayout`, settings, command palette, and i18n (`apps/vision`). | [`SKILL.md`](skills/rune-lab/SKILL.md), [`kernel-and-plugins.md`](skills/rune-lab/kernel-and-plugins.md), [`layout-and-theming.md`](skills/rune-lab/layout-and-theming.md), [`palettes-and-settings.md`](skills/rune-lab/palettes-and-settings.md) |
| **`runed`** | `docs/skills/runed` | **Svelte 5 Runes Utilities:** Reactive utilities, debouncing, and finite state helpers. | [`SKILL.md`](skills/runed/SKILL.md), [`state.md`](skills/runed/state.md), [`reactivity.md`](skills/runed/reactivity.md) |
| **`xstate`** | `docs/skills/xstate` | **Actor & Interaction Orchestration:** Hierarchical statecharts for tool lifecycles, autosave timers, telemetry subscriptions, and export jobs (`@sdk/state`). | [`SKILL.md`](skills/xstate/SKILL.md), [`actions-guards-and-effects.md`](skills/xstate/actions-guards-and-effects.md), [`actors-and-invocations.md`](skills/xstate/actors-and-invocations.md), [`hierarchical-and-parallel-states.md`](skills/xstate/hierarchical-and-parallel-states.md) |
| **`valibot`** | `docs/skills/valibot` | **Canonical Schema & Validation:** Lightweight pure schema validation for document models, units, migrations, and fixtures (`@sdk/core`). | [`SKILL.md`](skills/valibot/SKILL.md) |
| **`svelte`** | `docs/skills/svelte` | **Svelte 5 Runes & UI:** Component lifecycle, `$state`, `$derived`, `$props`, snippet templates, and UI rendering (`sdk/ui`, `apps/vision`). | [`SKILL.md`](skills/svelte/SKILL.md), [`component-api.md`](skills/svelte/component-api.md), [`template-syntax.md`](skills/svelte/template-syntax.md) |
| **`deno`** | `docs/skills/deno` | **Runtime & Toolchain:** Workspace resolution, CLI commands, native permissions sandbox, and npm compatibility. | [`SKILL.md`](skills/deno/SKILL.md), [`cli-toolchain.md`](skills/deno/cli-toolchain.md), [`workspaces-and-package-json.md`](skills/deno/workspaces-and-package-json.md) |

---

## 2. Normative Errata & Architectural Invariants (Specification §3)

The following rules override any obsolete patterns found in external documentation or earlier plans:

### 2.1 Paper.js Invariants (`paper@0.12.18`)

1. **Explicit Scope Activation (Multi-Canvas Isolation):**
   - NEVER rely on `scope.Path` alone to isolate items. As proven empirically in WP-00, calling `new scope1.Path.Rectangle(...)` while `scope2` is active creates the item in `scope2.project`.
   - ALWAYS explicitly call `scope.activate()` immediately before creating items or modifying the scenegraph:
     ```ts
     const scope = new paper.PaperScope();
     scope.setup(canvasElement);
     scope.activate();
     const path = new scope.Path.Rectangle(rect);
     ```
2. **No Blanket Path Simplification:**
   - NEVER call `path.simplify(1)` on CAD geometry. Simplification alters curves and vertices; a unitless tolerance can erase fine architectural features and wall openings.
3. **DOM vs. View Coordinate Systems:**
   - Raw `clientX` and `clientY` are DOM viewport coordinates. Scrolled pages, CSS transforms, panel offsets, and device pixel ratios alter offsets.
   - ALWAYS convert input via canvas bounding rect and `scope.view.viewToProject(point)`.
4. **Interactive Transforms (`applyMatrix = false`):**
   - By default, Paper.js bakes transformations directly into segment coordinates (`applyMatrix = true`).
   - Interactive symbols and catalog equipment must set `item.applyMatrix = false` so that `.position`, `.rotation`, and `.scaling` remain inspectable without loss of identity.
5. **Scenegraph Teardown:**
   - Disposing a component must explicitly call `scope.project.clear()`, remove the project from `scope.projects`, and clear canvas references to prevent memory leaks.

---

### 2.2 XState v5 Invariants (`xstate@5.19+`)

1. **Action & Assignment Execution Order:**
   - XState v5 executes ordinary actions and `assign` in declared order. Do NOT assume assignments are hoisted ahead of effects.
   - An action/assign/action sequence executes sequentially (`0, 1, 2`), allowing intermediate actions to inspect state transitions.
2. **Actor Messaging via `sendParent`:**
   - `sendParent` is fully supported in XState v5. NEVER access private `self._parent`.
   - Child actors communicate with parent state machines via `sendParent({ type: 'EVENT' })` or typed actor reference injection.
3. **`spawnChild` is an Action Creator:**
   - `spawnChild` can appear directly in state `entry` or transition `actions`; it is not restricted to `assign` callbacks.
4. **History State vs. Document Undo:**
   - XState `type: 'history'` remembers active state nodes (e.g., returning to the previous tool).
   - Document undo/redo is NOT an XState history state; it is managed by the command reducer and transactional history stack in `@sdk/core`.

---

### 2.3 Svelte 5 & Rune Lab Invariants

1. **Getter Bridge Destructuring Prohibition:**
   - Destructuring a getter evaluates it once as a static value. Writing `const { snapshot } = bridge;` freezes the snapshot.
   - ALWAYS reference `bridge.snapshot` within tracked reactive expressions (`$derived`, `$effect`, or template snippets).
2. **Replacement Snapshots via `$state.raw`:**
   - Use `$state.raw` for full document replacement snapshots to avoid deep proxying large geometry trees.
   - Plain class instances (including Paper.js items) are never auto-proxied by Svelte.
3. **Actor Startup Subscription:**
   - Subscribe to actor state before calling `actor.start()`, then immediately capture the initial snapshot to ensure zero dropped startup transitions.
4. **Rune Lab Kernel Integration:**
   - Use concrete signatures from `node_modules/rune-lab/dist/src/core/mod.d.ts` (`definePlugin`, `defineSlot`, `defineSettings`).
   - Slot specs declare dependencies explicitly via `dependsOn: ['rune-lab.layout']`.

---

## 3. Multi-Format Export Architecture (Specification §12)

Do not use oversimplified or lossy export techniques:

### 3.1 PDF Export Architecture (`pdf-lib` + `jspdf` + `svg2pdf.js`)
- **Required Quality:** Genuine vector export at architectural scales (e.g. 1:200, 1:100, 1:50) with title blocks.
- **Optional Content Groups (OCGs):** Vector SVG conversion alone does NOT create PDF layers. Blueprint exports individual layer streams and uses `pdf-lib` to assemble valid `/OCProperties` with one OCG per document layer (`foundation`, `architectural`, `machinery`, `operational`).

### 3.2 PPTX Export Architecture (`pptxgenjs` + `fflate`)
- **Required Quality:** Native editable PowerPoint geometry. Inserting a whole-canvas PNG backdrop or flattened SVG does NOT satisfy the contract.
- **Custom Shapes & Groups:** Equipment and catalog items are emitted as native PowerPoint shape groups (`p:grpSp`), text elements, and `custGeom` freeforms with `fflate` ZIP postprocessing for shape XML customization.
