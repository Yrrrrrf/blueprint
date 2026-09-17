# Blueprint: API Compatibility & Verification Report

This document records the exact runtime environment, installed package versions, resolved dependency versions for Blueprint, concrete type signatures from installed declarations (specifically `rune-lab`), and empirical probe evidence for the normative errata identified in Section 3 of `Blueprint-Implementation-Specification.md`.

---

## 1. Runtime Environment & Toolchain

| Tool / Runtime | Installed Version | Notes / Source of Truth |
| :--- | :--- | :--- |
| **Deno** | `2.9.5` (stable, release, x86_64-unknown-linux-gnu) | V8 `15.0.245.2-rusty`, built-in TypeScript `6.0.3` |
| **Nushell (`nu`)** | `0.112.2` | Configured shell for recipe execution in `justfile` (`set shell := ["nu", "-c"]`) |
| **Just (`just`)** | `1.51.0` | Task runner executing client recipes |
| **dv CLI** | `jsr:@yrrrrrf/dv` | Dynamic matrix runner and recipe coordinator (`scripts/_shared.just`) |
| **Biome** | `1.9.4` | Workspace formatting (`just fmt`) and linting (`just lint`) via `config/biome.json` |
| **Fallow** | `npm:fallow` | Code health and dead dependency audit (`config/fallowrc.json`) |

---

## 2. Workspace Installed Package Versions

The following package versions are currently resolved in `deno.lock` and installed in the workspace (`node_modules`):

| Package Name | Locked / Installed Version | Package Role / Location |
| :--- | :--- | :--- |
| **`svelte`** | `5.56.10` | Svelte 5 core reactivity and component engine (`apps/vision`, `sdk/`) |
| **`rune-lab`** | `0.5.2-rc.2` | Application shell, plugin kernel, layout, palettes, and i18n |
| **`tailwindcss`** | `4.3.3` | Utility styling engine |
| **`@tailwindcss/vite`** | `4.3.3` | Vite integration for Tailwind v4 |
| **`daisyui`** | `5.7.38` | Dynamic component themes and styling tokens |
| **`vite`** | `8.3.0` | Frontend bundler / development server engine |
| **`vite-plus` / `@voidzero-dev/vite-plus-core`** | `0.3.2` | Vite+ distribution runtime with TSGO compatibility |
| **`vitest`** | `4.1.11` | Unit and component test runner for SDK and apps |
| **`@sveltejs/kit`** | `3.0.0-next.27` | Application routing and page harness for `apps/vision` |
| **`@sveltejs/adapter-static`** | `4.0.0-next.4` | Static build adapter for SvelteKit |
| **`@sveltejs/vite-plugin-svelte`** | `7.0.0-next.1` / `7.3.0` | Svelte compilation plugin for Vite |
| **`@lucide/svelte`** | `1.46.0` | UI icons for Svelte components |
| **`arkano`** | `0.0.2` | Component toolkit integration |
| **`arktype`** | `2.2.3` | Legacy schema validator (kept for unrelated modules) |

---

## 3. Blueprint Target Dependencies (Specification §2.3)

Per Section 2.3 of the specification, the following exact packages and versions are targeted and mechanically resolved via Deno npm compatibility:

| Package | Specified Version | Resolved npm Version | Blueprint Role / Package Ownership |
| :--- | :--- | :--- | :--- |
| **`paper`** | `0.12.18` (pinned) | `0.12.18` | 2D vector canvas rendering and scenegraph (`@sdk/renderer`) |
| **`xstate`** | `^5.19.0` (min 5.19, never v6) | `5.26.0` | Finite state machines and interaction actor lifecycle (`@sdk/state`) |
| **`valibot`** | `^1.0.0` (v1 schema) | `1.2.0` | Canonical document schema and input validation (`@sdk/core`) |
| **`polygon-clipping`** | `0.15.7` (pinned) | `0.15.7` | Pure 2D polygon boolean operations for CAD zones/walls (`@sdk/core`) |
| **`rbush`** | `^4.0.0` (v4) | `4.0.1` | 2D spatial indexing for fast canvas item picking (`@sdk/renderer`) |
| **`jspdf`** | `^3.0.0` (v3) | `3.0.4` | Vector PDF document generation (`@sdk/exporters`) |
| **`svg2pdf.js`** | `^2.0.0` (v2) | `2.8.1` | SVG to PDF vector element conversion (`@sdk/exporters`) |
| **`pdf-lib`** | `1.17.1` (pinned) | `1.17.1` | PDF layer assembly and Optional Content Groups (`/OCProperties`) |
| **`pptxgenjs`** | `^4.0.0` (v4) | `4.0.1` | Native Microsoft PowerPoint shape/table generation (`@sdk/exporters`) |
| **`fflate`** | `0.8.2` (pinned) | `0.8.2` | High-speed ZIP postprocessing for PPTX XML customization (`@sdk/exporters`) |
| **`playwright`** | Pinned with browser | `1.63.0` | End-to-end browser automation (`apps/vision/test`) |

---

## 4. Concrete Rune Lab Type Signatures

Directly inspected from installed `node_modules/rune-lab/dist/src/core/mod.d.ts` and associated module definitions. These signatures are normative facts of the installed package; no hypothetical APIs are used.

### 4.1 Plugin Definition (`dist/src/core/forge/define-plugin.d.ts`)

```ts
import type { ContributionEntry } from "./define-contribution.js";
import type { SettingsSchema } from "./define-settings.js";
import type { BaseSlotSpec } from "./define-slot.js";
import { type SlotDescriptor } from "./descriptors.js";

export interface ForgedPlugin<
  TId extends string = string,
  TSlots extends Record<string, BaseSlotSpec> = Record<string, BaseSlotSpec>,
> {
  id: TId;
  requires?: string[];
  slots: TSlots;
  settings?: SettingsSchema;
  overlays?: unknown[];
  contributions?: ContributionEntry<unknown>[];
  descriptors: Record<keyof TSlots, SlotDescriptor>;
}

export type PluginInput =
  | ForgedPlugin<string, Record<string, BaseSlotSpec>>
  | PluginInput[]
  | null
  | undefined
  | boolean;

export declare function definePlugin<
  TId extends string,
  TSlots extends Record<string, BaseSlotSpec>,
>(spec: {
  id: TId;
  requires?: string[];
  slots?: TSlots;
  settings?: SettingsSchema;
  overlays?: unknown[];
  contributions?: ContributionEntry<unknown>[];
}): ForgedPlugin<TId, TSlots>;
```

### 4.2 Slot Definition (`dist/src/core/forge/define-slot.d.ts`)

```ts
import type { Schema } from "effect";
import type { LocaleAdapter } from "../ports/locale.js";
import type { TextMeasurer } from "../ports/text.js";
import type { PersistenceHandle } from "./descriptors.js";

export interface Disposable {
  dispose(): void | Promise<void>;
}

export interface SlotContext<TConfig = unknown> {
  config: TConfig;
  persistence: PersistenceHandle;
  stores: Map<string, unknown>;
  locale?: LocaleAdapter;
  textMeasurer?: TextMeasurer;
}

export interface BaseSlotSpec {
  create(context: SlotContext<unknown>): unknown;
  config?: unknown;
  persist?: boolean | string[];
  dependsOn?: string[];
  expose?: boolean;
  contextKey?: never;
}

export interface SlotSpec<
  TConfig = unknown,
  TStore = unknown,
  TEncoded = TConfig,
> extends BaseSlotSpec {
  create(context: SlotContext<TConfig>): TStore;
  config?: Schema.Schema<TConfig, TEncoded, never>;
  persist?: boolean | string[];
  dependsOn?: string[];
  expose?: boolean;
  contextKey?: never;
}

export declare function defineSlot<TConfig, TStore, TEncoded = TConfig>(
  spec: SlotSpec<TConfig, TStore, TEncoded>,
): SlotSpec<TConfig, TStore, TEncoded>;
```

### 4.3 Descriptors & Persistence Handle (`dist/src/core/forge/descriptors.d.ts`)

```ts
export interface SlotDescriptor {
  slotName: string;
  contextKey: symbol;
  accessorName: string;
}

export interface PersistenceHandle {
  get(key: string): string | null | Promise<string | null>;
  set(key: string, value: string): void | Promise<void>;
  remove(key: string): void | Promise<void>;
}

export declare function getAccessorName(slotName: string): string;
export declare function getContextSymbol(pluginId: string, slotName: string): symbol;
```

### 4.4 Settings Definition (`dist/src/core/forge/define-settings.d.ts`)

```ts
import type { SelectOption } from "../config/item-presenter.js";

export interface SettingsFieldSchema {
  id: string;
  label: string;
  type: "select" | "toggle" | "text" | "number" | "range" | "color" | "custom";
  component?: unknown;
  options?: () => SelectOption[];
  min?: number;
  max?: number;
  step?: number;
  target:
    | { type: "cell"; name: string; }
    | { type: "store"; storeId: string; property: string; }
    | { type: "callback"; };
}

export interface SettingsSchema {
  id: string;
  label: string;
  icon?: string;
  fields: SettingsFieldSchema[];
}

export declare function defineSettings(schema: SettingsSchema): SettingsSchema;
```

### 4.5 Kernel Creation (`dist/src/core/kernel/kernel.d.ts`)

```ts
import { type ContributionKey } from "../forge/define-contribution.js";
import type { PluginInput } from "../forge/define-plugin.js";
import type { LocaleAdapter } from "../ports/locale.js";
import type { PersistenceDriver } from "../ports/persistence.js";
import type { TextMeasurer } from "../ports/text.js";

export interface PluginDescriptor {
  id: string;
  requires: string[];
  slotNames: string[];
  hasSettings: boolean;
}

export interface SlotSummary {
  id: string;
  slotName: string;
  pluginId: string;
  dependsOn: string[];
  expose: boolean;
  persist?: boolean | string[];
}

export interface Kernel<TCells = Record<string, unknown>> {
  stores: Map<string, unknown>;
  overlays: unknown[];
  getCell<K extends keyof TCells>(cellName: K): TCells[K];
  subscribe(cellName: keyof TCells, listener: () => void): () => void;
  getContributions<T>(key: ContributionKey<T>): T[];
  registerContribution<T>(key: ContributionKey<T>, item: T): void;
  unregisterContribution<T>(key: ContributionKey<T>, id: string): void;
  getStoreEntry(id: string): { contextKey?: symbol; expose?: boolean } | undefined;
  listPlugins(): PluginDescriptor[];
  listSlots(): SlotSummary[];
  dispose(): Promise<void>;
}

export declare function createKernel<TCells = Record<string, unknown>>(
  pluginsInput: PluginInput[],
  options: {
    persistence: PersistenceDriver;
    localeAdapter?: LocaleAdapter;
    textMeasurer?: TextMeasurer;
    pluginConfig?: Record<string, Record<string, unknown>>;
  },
): Kernel<TCells>;
```

### 4.6 Persistence Driver (`dist/src/core/ports/persistence.d.ts`)

```ts
export interface PersistenceDriver {
  get(key: string): string | null | Promise<string | null>;
  set(key: string, value: string): void | Promise<void>;
  remove(key: string): void | Promise<void>;
}
```

### 4.7 State Cell (`dist/src/core/cells/define-cell.d.ts`)

```ts
import { SubscriptionRef } from "effect";

export declare class StateCell<T> {
  ref: SubscriptionRef.SubscriptionRef<T>;
  version: number;
  private listeners;
  constructor(ref: SubscriptionRef.SubscriptionRef<T>);
  get(): T;
  set(value: T): void;
  getVersion(): number;
  subscribe(listener: () => void): () => void;
  private pendingNotify;
  notify(): void;
}
```

### 4.8 Contributions (`dist/src/core/forge/define-contribution.d.ts`)

```ts
export interface ContributionKey<T> {
  readonly id: string;
  readonly __brand?: T;
}

export interface ContributionEntry<T = unknown> {
  readonly key: ContributionKey<T>;
  readonly items: T[];
}

export declare function defineContribution<T>(id: string): ContributionKey<T>;
export declare function contribute<T>(key: ContributionKey<T>, ...items: T[]): ContributionEntry<T>;
export declare const settingsSections: ContributionKey<SettingsSectionContribution>;
export declare const rootTakeover: ContributionKey<RootTakeoverContribution>;
```

### 4.9 Palettes & Command Registry (`dist/src/plugins/palettes/commands/store.svelte.d.ts`)

```ts
export interface Command {
  id: string;
  label: string;
  category?: string;
  keys?: string;
  action?: () => void;
  children?: Command[];
}

export declare class CommandStore {
  commands: Command[];
  register(command: Command): void;
  unregister(id: string): void;
  search(query: string, parentId?: string): Command[];
}
```

---

## 5. Specification §3 Normative API Probes & Empirical Evidence

### 5.1 Probe 1: XState v5 Action Execution Order

- **Specification Errata (§3):** XState v5 executes ordinary actions and `assign` in declared order. Do NOT assume all assignments are hoisted ahead of effects.
- **Probe Code Executed:**
  ```ts
  import { setup, createActor, assign } from 'xstate';

  const log: string[] = [];
  const orderMachine = setup({
    types: { context: {} as { count: number }, events: {} as { type: 'STEP' } }
  }).createMachine({
    id: 'order',
    context: { count: 0 },
    initial: 'idle',
    states: {
      idle: {
        on: {
          STEP: {
            actions: [
              ({ context }) => { log.push('action1: count=' + context.count); },
              assign({ count: ({ context }) => context.count + 1 }),
              ({ context }) => { log.push('action2: count=' + context.count); },
              assign({ count: ({ context }) => context.count + 1 }),
              ({ context }) => { log.push('action3: count=' + context.count); }
            ]
          }
        }
      }
    }
  });

  const actor = createActor(orderMachine).start();
  actor.send({ type: 'STEP' });
  ```
- **Observed Result:**
  ```json
  ["action1: count=0", "action2: count=1", "action3: count=2"]
  ```
- **Conclusion:** `assign` updates context sequentially between action executions. The sequence records exactly `0, 1, 2`.

### 5.2 Probe 2: XState v5 Parent Messaging & `spawnChild`

- **Specification Errata (§3):** `sendParent` exists in v5. Never use private `self._parent`. `spawnChild` is an action creator that can appear in entry/actions.
- **Probe Code Executed:**
  ```ts
  import { setup, createActor, assign, sendParent, spawnChild } from 'xstate';

  const parentLog: string[] = [];
  const childMachine = setup({
    types: { events: {} as { type: 'PING' } }
  }).createMachine({
    id: 'child',
    initial: 'active',
    states: {
      active: {
        on: {
          PING: { actions: [sendParent({ type: 'PONG', payload: 'fromChild' })] }
        }
      }
    }
  });

  const parentMachine = setup({
    types: {
      context: {} as { childRef: any },
      events: {} as { type: 'START' } | { type: 'PONG'; payload: string }
    },
    actors: { child: childMachine }
  }).createMachine({
    id: 'parent',
    context: { childRef: null },
    initial: 'idle',
    states: {
      idle: {
        on: {
          START: {
            actions: [
              assign({ childRef: ({ spawn }) => spawn('child', { id: 'myChild' }) })
            ]
          },
          PONG: { actions: ({ event }) => { parentLog.push('parent: ' + event.payload); } }
        }
      }
    }
  });

  const actor = createActor(parentMachine).start();
  actor.send({ type: 'START' });
  actor.getSnapshot().context.childRef.send({ type: 'PING' });
  ```
- **Observed Result:**
  ```json
  ["parent: fromChild"]
  ```
  And `typeof sendParent === 'function'`, `typeof spawnChild === 'function'`.
- **Conclusion:** `sendParent` is functional and typed; parent receives messages without private property access.

### 5.3 Probe 3: Paper.js Multi-Scope Isolation & Coordinate Transforms

- **Specification Errata (§3):** Accessing `scope.Path` alone does NOT guarantee multi-canvas project ownership. Explicitly activate the intended scope/project during synchronous item creation.
- **Probe Code Executed:**
  ```ts
  import paper from 'paper';

  const scope1 = new paper.PaperScope();
  scope1.setup(new paper.Size(800, 600));

  const scope2 = new paper.PaperScope();
  scope2.setup(new paper.Size(400, 300));

  // Activate scope1
  scope1.activate();
  const path1 = new scope1.Path.Rectangle(new scope1.Point(10, 10), new scope1.Size(50, 50));
  path1.name = 'rect1';

  // Activate scope2
  scope2.activate();
  const path2 = new scope2.Path.Circle(new scope2.Point(20, 20), 15);
  path2.name = 'circle2';

  // Test unactivated creation: while scope2 is active, call new scope1.Path.Rectangle(...)
  const leakTest = new scope1.Path.Rectangle(new scope1.Point(0, 0), new scope1.Size(10, 10));
  leakTest.name = 'leakTest';

  // Check which project owns leakTest:
  const scope1HasLeak = scope1.project.activeLayer.children.some(c => c.name === 'leakTest');
  const scope2HasLeak = scope2.project.activeLayer.children.some(c => c.name === 'leakTest');
  ```
- **Observed Result:**
  - `scope1` item count: 1 (`["rect1"]`)
  - `scope2` item count: 2 (`["circle2", "leakTest"]`)
  - `scope1HasLeak`: `false`
  - `scope2HasLeak`: `true`
- **Conclusion:** Calling `new scope1.Path...` while `scope2` was active placed the item into `scope2.project`! Explicit activation (`scope.activate()`) is strictly mandatory during any item construction to prevent cross-scope item leakage.
- **Coordinate Transforms (AC-009):**
  - Transform local `(1000, 0)` with translation `(2000, 3000)` and rotation `90°`: result is world `{ x: 2000, y: 4000 }`.
  - Inverting the transform restores `{ x: 1000, y: 0 }` within `< 0.001 mm`.

### 5.4 Probe 4: Svelte 5 Runes & Getter Bridge Behavior

- **Specification Errata (§3):** `const { snapshot } = bridge` evaluates an ordinary getter once; keep `bridge.snapshot` inside a tracked expression. Adopt `$state.raw` for snapshot replacements.
- **Probe Code Executed:**
  ```ts
  // In sdk/state/src/probe-runes.svelte.ts:
  export class GetterBridge {
    #count = $state(0);
    #rawSnap = $state.raw({ version: 1, label: "initial" });

    get count(): number { return this.#count; }
    get snapshot() { return this.#rawSnap; }
    inc() { this.#count += 1; }
    updateSnapshot(newVersion: number, newLabel: string) {
      this.#rawSnap = { version: newVersion, label: newLabel };
    }
  }

  // In sdk/state/src/probe-runes.test.ts:
  const bridge = new GetterBridge();
  const { snapshot } = bridge; // Destructuring evaluates once!
  bridge.updateSnapshot(2, "updated");

  expect(snapshot.version).toBe(1); // Destructured binding is frozen/stale!
  expect(bridge.snapshot.version).toBe(2); // Property access yields updated snapshot!
  ```
- **Observed Result:** 4 Vitest assertions passed in `sdk/state/src/probe-runes.test.ts`.
- **Conclusion:** Destructuring a getter breaks reactivity by evaluating it once as a static value. Reactive bindings and templates must continuously reference `bridge.snapshot`.

### 5.5 Probe 5: Rune Lab v0.5.2-rc.2 Integration & Svelte 5 Patterns (WP-10)

During WP-10 integration, several concrete API patterns of `rune-lab` were empirically verified:

1. **Command and Shortcut Separation (`rune-lab/palettes`):**
   - The `Command` interface registered into `CommandStore` provides:
     ```ts
     export interface Command {
       id: string;
       label: string;
       category?: string;
       icon?: any;
       action?: () => void;
       children?: Command[];
     }
     ```
   - Shortcuts are not embedded in `Command`. They are registered separately via `useShortcuts`:
     ```ts
     useShortcuts([
       { keys: "mod+z", action: () => handleUndo() },
       { keys: "mod+shift+z", action: () => handleRedo() },
       { keys: "mod+s", action: () => handleSave() }
     ]);
     ```

2. **Toast Notifications API:**
   - `ToastStore` defines `success(msg)`, `error(msg)`, `warn(msg)` (note: `warn`, not `warning`), and generic `send(msg, type, duration)`.

3. **WorkspaceLayout Snippet Children in Svelte 5:**
   - `WorkspaceLayoutProps` specifies explicit snippet slots: `workspaceStrip`, `navigationPanel`, `content`, `detailPanel`, `statusbar`.
   - In Svelte 5, comments placed at the root level inside `<WorkspaceLayout>...</WorkspaceLayout>` outside of snippet declarations are parsed as an implicit `children` snippet. Comments must be placed inside the snippets or `<script>` tags to prevent compiler warnings.

4. **Circular-Safe Accessor Pattern:**
   - `createPluginKit` creates accessors via `Symbol.for("rl:pluginId:slotName")`.
   - Isolating the accessor in a standalone `context.ts` (`export function getBlueprintStore() { return getContext(Symbol.for("rl:rune-lab.blueprint:blueprint")); }`) avoids cyclic dependencies between the plugin definition (`plugin.ts`) and settings UI (`BlueprintSettingsSection.svelte`).

5. **Input Text Isolation Protocol (§3 Errata, AC-039, AC-058):**
   - Native input elements (`<input>`, `<textarea>`) must retain browser text editing and undo history.
   - Global shortcuts inspect `event.composedPath()` via `isEditableTarget()` to ensure document-level commands (`Ctrl+Z`, `Ctrl+Y`, `Delete`, `Backspace`) do not fire while typing in form inputs.

