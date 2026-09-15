# Blueprint: Technical Skills & References Map

> [!abstract] Context Guide for Future Implementation Agents This document maps
> all relevant skills, library documentation paths, architectural invariants,
> and code patterns needed to implement the **Blueprint** CAD/layout canvas
> plugin for **rune-lab**.

---

## 1. Primary Skills Index

| Skill Name   | Path                                              | Role in Blueprint                                                                                                                                          | Key Files to Read                                                                                                                                                                                                                                                                                                                                                                                              |
| :----------- | :------------------------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **paper.js** | `/home/yrrrrrf/Downloads/skills/lang/ts/paper.js` | **Core 2D Vector Canvas Engine:** Scenegraph, layers, Bézier curves, boolean geometry, matrix transforms, SVG/JSON I/O.                                    | [`SKILL.md`](file:///home/yrrrrrf/Downloads/skills/lang/ts/paper.js/SKILL.md), [`geometry-and-paths.md`](file:///home/yrrrrrf/Downloads/skills/lang/ts/paper.js/geometry-and-paths.md), [`interaction-and-animation.md`](file:///home/yrrrrrf/Downloads/skills/lang/ts/paper.js/interaction-and-animation.md), [`styling-and-io.md`](file:///home/yrrrrrf/Downloads/skills/lang/ts/paper.js/styling-and-io.md) |
| **rune-lab** | `/home/yrrrrrf/Downloads/skills/lang/ts/rune-lab` | **Application Shell & Plugin Architecture:** Kernel dependency injection, 5-zone `WorkspaceLayout`, DaisyUI dynamic themes, settings, and command palette. | [`SKILL.md`](file:///home/yrrrrrf/Downloads/skills/lang/ts/rune-lab/SKILL.md), [`kernel-and-plugins.md`](file:///home/yrrrrrf/Downloads/skills/lang/ts/rune-lab/kernel-and-plugins.md), [`layout-and-theming.md`](file:///home/yrrrrrf/Downloads/skills/lang/ts/rune-lab/layout-and-theming.md)                                                                                                                |
| **runed**    | `/home/yrrrrrf/Downloads/skills/lang/ts/runed`    | **Svelte 5 Runes Utilities:** `StateHistory` for reactive undo/redo, `FiniteStateMachine` for simple tool transitions, `PersistedState`, `Debounced`.      | [`SKILL.md`](file:///home/yrrrrrf/Downloads/skills/lang/ts/runed/SKILL.md), [`state.md`](file:///home/yrrrrrf/Downloads/skills/lang/ts/runed/state.md), [`reactivity.md`](file:///home/yrrrrrf/Downloads/skills/lang/ts/runed/reactivity.md)                                                                                                                                                                   |
| **xstate**   | `/home/yrrrrrf/Downloads/skills/lang/ts/xstate`   | **Complex Tool State Machine:** Hierarchical statecharts for pointer interaction (`idle`, `select`, `draw_wall`, `transform`, `preview`).                  | [`SKILL.md`](file:///home/yrrrrrf/Downloads/skills/lang/ts/xstate/SKILL.md), [`hierarchical-and-parallel-states.md`](file:///home/yrrrrrf/Downloads/skills/lang/ts/xstate/hierarchical-and-parallel-states.md)                                                                                                                                                                                                 |
| **valibot**  | `/home/yrrrrrf/Downloads/skills/lang/ts/valibot`  | **Data Schema & Validation:** Lightweight schema validation for mock devices, document save drafts, and export payload validation.                         | [`SKILL.md`](file:///home/yrrrrrf/Downloads/skills/lang/ts/valibot/SKILL.md)                                                                                                                                                                                                                                                                                                                                   |

---

## 3. Critical Invariants for Implementation Agents

### Paper.js Invariants (`paper@0.12.18`)

1. **Explicit Scope Management (`PaperScope`):**
   - NEVER use the default global singleton `paper.setup(canvas)` in a reusable
     Svelte component.
   - ALWAYS instantiate an isolated scope:
     ```ts
     const scope = new paper.PaperScope();
     scope.setup(canvasElement);
     ```
   - Reference classes through `scope.Path`, `scope.Point`, `scope.Layer`, etc.
2. **No Operator Overloading in TypeScript:**
   - PaperScript arithmetic syntax (`point1 + point2`, `size * 2`) fails
     silently or causes `NaN` in standard TS.
   - ALWAYS use explicit methods: `point1.add(point2)`, `point.multiply(2)`,
     `point.subtract(offset)`.
3. **`applyMatrix = false` for Interactive Transformations:**
   - By default, `item.applyMatrix = true`, which bakes transformations directly
     into segment coordinates and resets `item.rotation` to `0`.
   - Set `item.applyMatrix = false` on interactive equipment and shapes so that
     `.rotation`, `.scaling`, and `.position` retain inspectable transform
     values.
4. **Coordinate Spaces: View vs. Project:**
   - Pointer events from the browser (`e.offsetX`, `e.offsetY`) exist in DOM
     pixel space.
   - Convert to Paper project coordinates via `scope.view.viewToProject(point)`
     before performing hit tests or placing items.
5. **Scenegraph Memory Cleanup:**
   - Removing an item variable in TypeScript does not delete it from Paper's
     memory.
   - Explicitly call `item.remove()` to detach an item, and call
     `scope.project.clear()` and `scope.project.remove()` upon component unmount
     (`onDestroy` / `$effect` teardown).

---

### Svelte 5 & Rune-Lab Invariants

1. **Fine-Grained Runes State:**
   - Use `$state()` for reactive UI properties (`activeTool`, `canUndo`,
     `selectedItem`).
   - Use `$derived()` for computed state (e.g.
     `isDrawing = $derived(currentTool !== 'select')`).
   - Never mutate external state inside `$derived` expressions.
2. **Kernel Slot Dependency Declaration:**
   - Plugins defining slots must declare their dependencies explicitly via
     `requires: ["rune-lab.layout"]`.
   - Plugin state cells wrap Effect's `SubscriptionRef` for reactive cross-slot
     synchronization.
3. **daisyUI Dynamic Theming:**
   - All custom toolbar and inspector components should use semantic daisyUI
     class tokens (`bg-base-100`, `text-base-content`, `btn-primary`, `card`,
     `badge`) to automatically respond to the user's selected theme.

---

## 4. Multi-Format Export Quick Reference

### PDF Export (`jspdf` + `svg2pdf.js`)

```ts
import { jsPDF } from "jspdf";
import "svg2pdf.js";

export async function exportToPdf(
  scope: paper.PaperScope,
  filename = "blueprint.pdf",
) {
  const svgElement = scope.project.exportSVG() as SVGElement;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a3" });
  await doc.svg(svgElement, { x: 10, y: 10, width: 400, height: 277 });
  doc.save(filename);
}
```

### PPTX Export (`pptxgenjs`)

```ts
import pptxgen from "pptxgenjs";

export async function exportToPptx(
  scope: paper.PaperScope,
  filename = "blueprint.pptx",
) {
  const pptx = new pptxgen();
  const slide = pptx.addSlide();

  // Export canvas as high-res PNG for slide backdrop
  const dataUrl = scope.view.element.toDataURL("image/png");
  slide.addImage({ data: dataUrl, x: 0.5, y: 0.5, w: 9, h: 5 });

  await pptx.writeFile({ fileName: filename });
}
```
