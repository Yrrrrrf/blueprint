# Blueprint: Implementation Execution Plan

> [!abstract] Step-by-Step Implementation Roadmap
> This actionable implementation plan guides the development of the **Blueprint** CAD/layout plugin for **rune-lab**. Each phase is modular, testable, and builds directly on the technical decisions documented in [BLUEPRINT_MANIFEST.md](file:///home/yrrrrrf/Documents/lab/code/typescript/rune-lab/BLUEPRINT_MANIFEST.md).

---

## Phase 0: Plugin Scaffolding & Kernel Integration

- [ ] **Directory Scaffolding:** Create `src/packages/plugins/blueprint/` in `rune-lab`.
- [ ] **Plugin Definition:** Author `blueprintPlugin` using `definePlugin` from `rune-lab/core`:
  - Declare id: `"rune-lab.blueprint"`.
  - Require dependencies: `["rune-lab.layout"]`.
  - Define `blueprint` slot holding the active document, active layer, current tool, and selection.
- [ ] **Kit Generation:** Author `createPluginKit` exports:
  - `blueprintPlugin`
  - `getBlueprintStore()` typed accessor.
- [ ] **Command Palette Registration:** Expose Blueprint actions to the global command palette (Save, Export PDF, Export PPTX, Toggle Preview).

---

## Phase 1: Paper.js Engine & Viewport Setup

- [ ] **Isolated Scope Instantiation:**
  - Create an isolated `paper.PaperScope` instance per canvas component to avoid global singleton collision:
    ```ts
    const scope = new paper.PaperScope();
    scope.setup(canvasElement);
    ```
- [ ] **High-DPI Canvas Rendering:** Handle device pixel ratio scaling (`window.devicePixelRatio`) to ensure sharp rendering on Retina/4K displays.
- [ ] **Viewport Navigation:**
  - **Pan:** Middle-mouse drag or `Space + Left-click` drag modifying `scope.view.center`.
  - **Zoom:** Mouse wheel zoom centered on cursor coordinates (`view.viewToProject(point)`).
  - **Fit to View:** Automatic zoom and center calculation to bound all active shapes.
- [ ] **Coordinate Space Utilities:**
  - Screen to Project: `scope.view.viewToProject(screenPoint)`.
  - Project to Screen: `scope.view.projectToView(projectPoint)`.

---

## Phase 2: The 4 Industrial Layers & Scenegraph Architecture

- [ ] **Layer Initialization:** On project boot, create and name the 4 core layers in strict z-order:
  ```ts
  const foundationLayer = new scope.Layer({ name: 'foundation' });
  const sectionsLayer = new scope.Layer({ name: 'sections' });
  const machineryLayer = new scope.Layer({ name: 'machinery' });
  const marksLayer = new scope.Layer({ name: 'marks' });
  ```
- [ ] **Layer Controller State:**
  - Reactive Svelte 5 store tracking each layer's status (`visible`, `locked`, `opacity`).
  - Active layer pointer (`activeLayerId: 'machinery'`).
- [ ] **Foundation Drafting Tools:**
  - Concrete grid generator (major grid every 10m, minor grid every 1m).
  - Wall drawing tool: Compound paths with customizable thickness (e.g. 300mm outer walls, 150mm partitions).
  - Boolean path cuts for door/dock openings using `wall.subtract(opening)`.
- [ ] **Sections / Zones Tool:**
  - Polygon drawing tool creating closed shapes on the `sections` layer.
  - Fill presets with semi-transparency:
    - Storage (Yellow: `#f59e0b`, opacity 0.25)
    - Production / Assembly (Blue: `#3b82f6`, opacity 0.25)
    - Hazard / Quarantine (Red: `#ef4444`, opacity 0.3)
    - Transit Corridor (Green: `#10b981`, opacity 0.2)

---

## Phase 3: Mock Device Catalog & Domain Schemas

- [ ] **Valibot Schemas:** Define runtime validation schemas in `src/packages/plugins/blueprint/schemas.ts`:
  - `DeviceMetadataSchema` (powerKW, status, temperature, vibration, maintenanceDue).
  - `DeviceItemSchema` (id, name, category, position, dimensions, rotation, metadata).
  - `BlueprintDocumentSchema` (version, name, dimensions, layers, customData).
- [ ] **Built-in Nave Industrial Device Catalog:**
  - **5-Axis CNC Mill:** 4m x 3m footprint, working envelope, status indicator, spindle RPM mock data.
  - **Robotic Arm Cell:** 3m x 3m safety enclosure with central articulated arm symbol.
  - **Conveyor Belt Segment:** Parametric modular conveyor (start point, end point, belt speed).
  - **High-Bay Pallet Rack:** Multi-level storage rack with bay capacity metadata.
  - **IoT Telemetry Sensor Node:** Compact wireless sensor glyph tracking ambient temperature & vibration.
- [ ] **Drag & Drop Placement:**
  - Dragging a device card from the left `navigationPanel` onto the canvas translates screen drop coordinates to Paper.js project space:
    ```ts
    const projectPos = scope.view.viewToProject(new scope.Point(e.offsetX, e.offsetY));
    createDeviceInstance(catalogItem, projectPos);
    ```

---

## Phase 4: Interaction State Machine (Tools & Gizmos)

- [ ] **State Machine Configuration (XState v5 or Runed FSM):**
  - **Top-level States:** `editor` ↔ `preview`.
  - **Editor Sub-states:**
    - `idle`: Hovering items, cursor updates.
    - `select`: Clicking items to select, shift-clicking for multi-select, dragging marquee selection box.
    - `transform`: Dragging selected items, resizing via 8 corner/edge handles, rotating via rotation stem.
    - `draw_wall`: Point-by-point polyline drafting.
    - `draw_zone`: Polygon zoning drafting.
    - `place_device`: Active ghost preview following cursor until click.
    - `measure`: Two-point dimension line drafting with dynamic label.
- [ ] **Snapping Engine:**
  - Snap to grid (configurable 0.5m, 1m, 5m increments).
  - Snap to existing wall vertices and midpoints.
  - Angle snapping (holding `Shift` constrains rotation to 15° increments).

---

## Phase 5: Document History & Drafts (Undo / Redo)

- [ ] **CanvasHistory Implementation:**
  - Svelte 5 class storing stringified snapshots via `scope.project.exportJSON()`.
  - Bounded memory array (default limit: 50 states).
  - Linear branch pruning (`futureStates = []` on new mutation).
- [ ] **Transaction Hooking:**
  - Trigger snapshot on `mouseUp` after transform, tool commit, layer deletion, or property edit.
  - Skip intermediate snapshots during active drag/mouseMove.
- [ ] **Persistence Integration:**
  - Wire to `rune-lab`'s `ctx.persistence` driver.
  - Autosave drafts to `localStorage` under `rune-lab.blueprint:draft:${docId}`.

---

## Phase 6: Dual Modes (Editor vs. Preview)

- [ ] **Preview Mode Activation:**
  - Detach all active Paper.js editing tools (`scope.tools.forEach(t => t.remove())`).
  - Hide all selection bounding boxes, handles, and transform overlays.
  - Set all layers to `locked = true`.
- [ ] **Interactive Telemetry Overlay:**
  - Attach lightweight pointermove listener on the canvas.
  - When hovering a device item (`hitTest` on `machinery` layer), display an absolute-positioned DaisyUI card over the canvas showing live mock telemetry:
    - Status badge (`Operational` / `Maintenance` / `Offline`)
    - Power consumption (kW)
    - Temperature & Vibration gauges
- [ ] **Reusable `<BlueprintViewer />` Component:**
  - Export a standalone Svelte 5 component `<BlueprintViewer doc={json} interactive={false} />` that other pages or applications can embed as a live floorplan background.

---

## Phase 7: Multi-Format Export Engine

- [ ] **JSON Export/Import:**
  - Native lossless save and restore using `scope.project.exportJSON()` and `scope.project.importJSON()`.
  - Validate schema integrity via Valibot upon import.
- [ ] **SVG Export:**
  - Clean vector extraction using `scope.project.exportSVG({ asString: true })`.
- [ ] **Raster Image Export (PNG / WebP):**
  - Extract high-resolution canvas snapshot:
    ```ts
    const blob = await new Promise<Blob | null>((resolve) =>
      canvasElement.toBlob(resolve, 'image/png')
    );
    ```
- [ ] **Architectural PDF Export (`jspdf` + `svg2pdf.js`):**
  - Instantiate `jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })`.
  - Stream exported SVG directly into the PDF document for 100% crisp vector print output.
  - Add title block, scale bar, and project metadata.
- [ ] **PowerPoint Export (`pptxgenjs`):**
  - Generate `.pptx` presentation.
  - Slide 1: High-res vector floorplan slide.
  - Slide 2: Equipment summary table with mock telemetry data.
  - Slide 3: Individual zone breakdown slides.
