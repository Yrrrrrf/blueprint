# Blueprint — WP-10 integrated product draft

Version: 1.0 · 2026-09-16  
Depends on: WP-07, WP-08, WP-09 and `Blueprint-WP00-09-Closure-Plan.md`  
Target: replace Vision's demonstration landing page with the first coherent Blueprint application, using the installed Rune Lab shell and the working SDK.

## 1. Execution contract

Execute this addendum against the actual repository. The main implementation specification remains normative except for the explicit user decisions and WP-10 staging clarifications below. This file fixes product and architecture decisions in advance; source inspection resolves installed API syntax, not a new choice of stack or application design.

The user requires the current scripts and CI pipeline to remain unchanged. Preserve Justfiles, recipes, `scripts/`, CI, tooling configuration, Deno manifests/lockfiles, dependency pins, and compatibility shims. The reported quality-gate issue is already fixed. Do not reopen it. Application source, application CSS/templates, browser/component test source, and documentation are in scope. Use current dependencies and existing runners. Do not install a new UI framework or upgrade Rune Lab.

Read the full main specification, current execution/verification/API documents, the closure plan, and all five parts of the supplied Rune Lab reference: SKILL, kernel/plugins, layout/theming, palettes/settings, and i18n/money. The supplied resource describes Rune Lab 0.5.2-rc.2. Verify against the installed package; do not assume examples are exact declarations.

Do not rebuild the domain, geometry, renderer, persistence, or telemetry systems inside the app. Extend their public ports only for an identified missing capability. Repair prerequisite defects in their owning package and record them under the closure plan.

## 2. Definition of the WP-10 outcome

After the existing launch command starts Vision, `/` must show Blueprint rather than a template showcase. A user can create or recover a local document, open the industrial example, edit its real geometry, inspect live simulated operations, save/download/reopen, and switch to a read-only view inside one consistent shell.

The draft must look and behave like an application: useful panels, coherent information hierarchy, real loading/empty/error states, keyboard access, persistent preferences, and responsive layout. A static mockup, a component gallery, or a canvas with disconnected buttons does not complete WP-10.

### Capability boundary at this milestone

| Available and functional now | Reserved for later WPs |
| --- | --- |
| New/open native Blueprint document, local document list/recovery, rename, autosave/save, download native JSON | SVG/raster import and calibration workflows: WP-11 |
| Existing drawing/editing tools, catalog, layers, inspector, relations, grouping/alignment, history | Snapshot creation/approval/proposal/diff product workflow: WP-12 |
| Operational viewer, asset search, simulated telemetry, issues and existing runtime reports | SVG/PNG/WebP/JPEG export: WP-13 |
| Rune Lab commands/shortcuts/settings/themes/toasts, standalone embedding | Architectural PDF: WP-14 |
| Responsive and accessible application workflow | Native PPTX/report deliverables: WP-15; final hardening: WP-16 |

The shell exposes discoverable export/revision/import locations, but unavailable actions show a concise explanation and cannot pretend to succeed. Native JSON download is fully operational. No fake PDF/PPTX downloads, screenshots labeled vector exports, pretend approvals, or placeholder chart values.

AC-058's keyboard save/export workflow at this milestone uses **native Blueprint JSON download**. Record that explicitly as the WP-10 interpretation; final format-specific workflows retain their later AC gates. Do not mark AC-060–088 passed from WP-10 UI work.

## 3. Source and API preflight

Inventory the actual `apps/vision` routes, root/provider/layout components, application stylesheet/template, adapter directory, SDK exports, and tests. Reuse existing files where equivalent. Record resolved paths rather than creating a parallel `src/packages/plugins/blueprint` tree.

The current API-COMPATIBILITY document already records `definePlugin`, `defineSlot`, `SlotContext`, `PersistenceHandle`, `defineSettings`, `Kernel`, contributions, and `CommandStore`. Extend this with the UI declarations and runtime behavior used here:

| Surface | Record before using |
| --- | --- |
| Plugin accessor | `createPluginKit` import/signature, accessor name for slot `blueprint`, context lookup, disposal contract |
| Provider | Public plugin array/config types; when overlays mount and how provider disposal occurs |
| Layout | WorkspaceLayout snippet props; preset, zone visibility/size setters and readable state |
| Commands | Real command fields, registration/unregistration, how children and action promises behave |
| Shortcuts | `useShortcuts` lifecycle, editable-target filtering, duplicate/built-in dispatch behavior |
| Palettes/settings | Registry APIs, settings sections/custom component props, actual callback target support, hash behavior |
| Themes/text/i18n | Current/discovered theme fields, text readiness, translator signature, available locale setup |

Known discrepancy to handle: the recorded `Command` declaration contains `id`, `label`, `category`, `keys`, `action`, and `children`; it does **not** establish `disabled`, `visible`, or `icon` fields. Do not copy richer skill examples with unsupported fields. Filter unavailable commands or use supported presentation facilities; keep an execution-time guard. Do not add casts to hide unsupported properties.

Likewise, `target: { type: 'callback' }` in a settings declaration does not itself show how to attach a callback. Resolve the actual installed mechanism. The selected implementation for document settings is a custom settings section with explicit session commands, avoiding direct mutable binding into document content.

## 4. Route and provider architecture

Use a root SvelteKit layout for global styles and child rendering. Scope the RuneProvider/AppLayout host to a route group, for example `(workspace)`, containing `/` and `/viewer/[documentId]`. Route groups do not change public URLs. Preserve the current client-rendering policy; this task does not enable application SSR. Move/reuse the existing provider instead of nesting a second provider around a child route.

Place `/embed-demo` outside that group so its editor/viewers truly render without an ancestor RuneProvider. Test isolation must be structural; not calling host accessors in a route still wrapped by a provider is not sufficient for AC-054. SDK imports/placeholders remain SSR-safe independently of the app's rendering policy.

| URL | Required behavior |
| --- | --- |
| `/` | Blueprint workspace. First visit offers New layout and Open industrial example; returning users can recover/select saved documents. Never replace recovered content with a fixture. |
| `/viewer/[documentId]` | Load approved local snapshot if available through the existing repository, otherwise saved draft labeled Draft. Missing IDs show Open native file / Return to workspace and do not create records. Read-only controls and inspection. Approval creation UI remains WP-12. |
| `/embed-demo` | Two independent in-memory viewers and one standalone editor, without RuneProvider. Include visible instance labels and an isolation demonstration; no shared active selection. |
| `/showcase` | May retain the old demo only under the app's existing development-only gating. It is not a workspace navigation destination or production landing page. |

Local repository scope must be clear in viewer error/help text: document IDs refer to this browser's storage; a viewer URL is not a remote sharing service.

Do not rely on app module singletons for mutable sessions. Route loading/opening has a generation token. Ignore stale repository responses after navigation/document selection. Show loading, not a transient fake blank document, while a document is being recovered.

Before new/open/replace/route departure, finish or cancel the active gesture and apply the existing dirty-work policy. If a durable save is pending, await it where possible. In memory-only/conflict/failed states offer download/save-copy, explicit discard, or cancel. Do not rely on an asynchronous `beforeunload` save completing. Cancel means the current document and route remain intact.

## 5. Ownership and dependency boundaries

| Owner | Responsibility |
| --- | --- |
| `sdk/core` | Canonical document, validation, geometry, command authorization/reducers/history; no Rune Lab/Svelte/DOM |
| `sdk/api` | Repository and telemetry ports/adapters |
| `sdk/state` | Session/actors/selectors; immutable snapshot-to-rune bridge; no host dependency |
| `sdk/renderer` | Paper scope projection, hit testing, camera rendering; no host UI |
| `sdk/ui` | Standalone editor/viewer, panels and controls via typed session props/context; no Rune Lab imports |
| `apps/vision/src/lib/blueprint` | Rune Lab plugin, registry, host services, command/settings adapter, route composition |

Keep existing equivalent files. Expected app-owned modules include `plugin.ts`, `runtime.ts`, `commands.ts`, `settings.ts`, `BlueprintHost.svelte`; use `.svelte.ts` for a module containing runes. Thin `.ts` exports may wrap it. Optional subdivisions for registry, preferences, services, or capability selection belong in the same directory, not a new architecture.

### Session and registry contract

Plugin ID: `rune-lab.blueprint`. Require actual installed IDs for layout and palettes (expected `rune-lab.layout` and `rune-lab.palettes`). Explicitly pass layout, palettes, existing i18n, and Blueprint plugins to RuneProvider once. The slot named `blueprint` exposes a registry facade and `getBlueprintStore()` through the real plugin kit.

The following is a **Blueprint-owned design**, not a claim that these methods already exist in Rune Lab:

- `register(instanceId, session, focusTarget)` returns an idempotent unregister function.
- `activate(instanceId)` sets the active editor/inspection instance after a real focus/pointer interaction.
- `activeSessionId`, `activeSession`, and a readonly session listing are reactive views.
- `dispose()` releases registry registrations and host-owned subscriptions; ownership rules below still apply.

Use instance IDs, not document IDs, as registry keys: two editors can display the same document. Duplicate live instance IDs are errors. Unregistering an older registration must not remove a newer registration with the same key; use a registration token. Removing the active instance clears active state. Do not silently route commands to an arbitrary surviving editor.

The registry points to existing sessions; it does not copy canonical documents into a second writable store. Do not persist the registry, active session, actors, Paper scopes, selected IDs, callbacks, telemetry, or history in Rune Lab persistence. A separate preferences surface may persist small validated JSON.

Host-created sessions are disposed by the host after their consumers unmount. An editor given a session owns only its renderer/UI subscriptions; an editor given `initialDoc + environment` owns the session it creates. Registry removal alone does not dispose a borrowed session. Idempotent cleanup prevents double stops/closes.

### Command target and focus contract

Register one global Blueprint command set for the provider/adapter lifetime. Route owners register sessions, not duplicate command sets. Resolve the target using the active registry entry. Opening a palette/dialog from an editor captures that initiating instance and registration token; overlay focus must not accidentally clear or replace the target. If the target disappears while an async dialog is open, cancel cleanly. Never redirect a delayed action to another editor.

Use the same capability selector and session `can(command)` authorization for toolbar, palette, keyboard, and inspector. Recheck immediately before execution. Command guards are required even if the visible command is filtered out.

## 6. Workspace composition and visual specification

Use the existing Rune Lab `WorkspaceLayout` with its actual five snippets. Do not invent a header slot. A Blueprint header belongs inside the `content` region above the canvas.

| Zone | Blueprint contents |
| --- | --- |
| `workspaceStrip` | Tool buttons with label/tooltip, selected state, and keyboard hint; workspace navigation remains distinguishable from tools |
| `navigationPanel` | Tabs: Layers, Catalog, Assets. Search and list selection remain usable with keyboard |
| `content` | Document header, canvas, viewport controls, transient tool instructions, pending/error overlays |
| `detailPanel` | Tabs: Inspector, Operations, Issues; content driven by current selection/session |
| `statusbar` | Display units, cursor coordinates, zoom, snap state, save state, connection/simulation indicator |

Apply the workspace preset on entry once. Capture and restore previous host layout state when leaving the Blueprint host. Do not reset user panel toggles after every render. Use only verified layout setters. Store persistent desktop panel preferences separately from temporary responsive visibility; entering a narrow viewport must not erase the user's desktop arrangement.

### Visual hierarchy

- Use existing daisyUI/Rune Lab semantic surface, text, border, focus, and status tokens. Match the current app typography. No independent theme system or new font dependency.
- Header order: document title; draft/save state; Editor/Viewer switch; undo/redo; File; Export; command search; settings. Collapse lower-priority controls into labeled menus on narrow screens.
- Desktop header is approximately 48–56 CSS px high; retain Rune Lab zone sizing unless the installed API supports the needed adjustment. Use consistent 4/8/12/16 px spacing.
- Canvas has a quiet background, readable grid, clear facility boundary, deterministic layer order, obvious selection, and handles distinct from machine-status decoration. Overlay controls must not obscure the primary selection unnecessarily.
- Numeric fields are aligned, unit-labeled, and show validation adjacent to the field. Avoid icon-only status and unexplained acronym labels.
- Empty states have a direct action. Error states retain the document/canvas where possible and offer relevant recovery. Loading does not resemble an empty saved document.
- Show actual pending checks and actual save freshness; do not manufacture counts or show Saved before the latest revision is durable.

The industrial fixture is the visual demonstration dataset. Use its existing deterministic geometry, IDs, definitions, relations, and telemetry. Opening it creates an editable document with a new document ID; do not alter the fixture itself to make screenshots look better. Fit the facility and make machine labels, zones, dimensions, and operational statuses discoverable through zoom/inspection.

## 7. Required panels and end-to-end behavior

### 7.1 First run and File

Provide New layout, Open native file, Open industrial example, recent/local document selection, Rename, Save now, Download Blueprint JSON, and return/recovery paths. Default new document follows the main spec: 60000 × 40000 mm, four preset layers, locked foundation, machinery active, grid visible, selection tool, editor mode.

Selecting an existing document loads its canonical state through the repository/session. Keep storageVersion separate from revision. Save now calls the existing flush operation; download uses canonical serialization and a sanitized filename. Rename is a domain command. Surface memory-only, saving, saved, unsaved, conflict, and failed states accurately. Autosave success should not generate repetitive toasts.

### 7.2 Tools, Layers, Catalog, Assets

Expose every already-required WP-07 tool through real commands/events, including selection/navigation and existing wall/zone/device/dimension/annotation workflows. Reuse the spec's tool keymap. Do not assign a shortcut already reserved by the host without explicit contextual routing.

Layer rows include visibility, lock, opacity, printable state, hierarchy/reorder and add sublayer. Preserve builtin role protections and inherited lock rules. Visibility does not mutate geometry; document-layer changes follow the established command policy. Viewer-only visibility overrides must not save layer changes.

Catalog includes all five builtin definitions (CNC, robot, conveyor, rack, sensor), category/name/tag search, dimensions, and a Place action. Keyboard placement uses a numeric-position form defaulting to the current camera center, validated before one commit; pointer placement uses the existing preview workflow. Parameter changes use the same domain generator as canvas/report data. Desktop drag/drop is supplementary, never the only placement path.

Assets lists real document entities, with search, status/freshness text where relevant, layer/category filters, and selection/focus-to-asset actions. Do not invent telemetry for unbound entities. List selection and canvas selection reflect the same session state.

Expose align/distribute/group/dissolve/boolean actions with eligibility and reasons. Alignment allows two eligible entities; distribution requires three. Multi-selection edits either use supported atomic operations or show why unavailable; never silently update only one selected entity.

### 7.3 Inspector

Implement this inventory for existing entity kinds, using the current schema and validated commands:

| Entity/context | Fields/actions |
| --- | --- |
| Common | Name, layer, lock, tags; transform only where meaningful |
| Wall | Thickness, vertices, related openings |
| Zone | Category, restriction, computed area |
| Device | Definition, unique asset key, allowed parameters, rated power, maintenance, bindings |
| Sensor | Observed device selector and supported bindings |
| Dimension | Anchors, axis, offset, display unit, precision |
| Annotation | Text/type, anchor/offset, text height |
| Relations | Typed source/port/target selectors, add/remove; production line name and membership |
| Reference entity | Existing size/opacity when present; calibration action explicitly unavailable until WP-11 |
| Multiple selection | Count, common editable values or mixed-value indicator, supported atomic actions |

A field owns a draft string while typing. Validate without committing on every keystroke. Enter or a successful blur commits once; Escape restores the formatted committed value; invalid blur leaves a visible error and does not mutate content. Define focus movement so a blur commit followed by Enter does not duplicate history. Read-only/locked fields have a visible reason.

Native text undo operates on the focused draft. Committed document undo applies in the canvas/application editing scope. Mixed values must not be rendered as literal data such as `NaN` or an empty committed string.

### 7.4 Operations and Issues

Operations displays selected asset identity, zone memberships, status, freshness, available metrics with units, source/connection state, and existing power summaries. Separate rated/live totals and stale/missing counts. Provide bind/unbind-to-simulator controls for supported fields. Blank documents have no automatic source; the industrial example is visibly marked Simulated data. Do not initiate a real socket without explicit host configuration.

Issues shows severity, stable code, plain-language message, affected entities, and Select/Focus action. Include text/icons, not color alone. Distinguish checking, current results, stale results, and failure. Zero issues is shown only for a successful current check. The panel is advisory layout feedback, not engineering certification.

Hover telemetry has keyboard/tap-accessible pinned detail equivalents. Keep the specified hover delays and viewport padding; selection, popover closure, and focus return must work inside the host shell.

### 7.5 Viewer mode

Switching Editor → Viewer cancels the active gesture without changing saved locks. No mutation commands/handles remain enabled; camera navigation, layer visibility override, asset inspection, and telemetry continue. Switching back restores editing capabilities according to session policy, not by unlocking document layers.

The standalone viewer contract retains independent `interactive` and `inspectable` flags, controlled selection support, document replacement semantics, and plain-data callbacks. Both flags false creates a passive view that may still show supplied telemetry. Do not infer editability from the presence of RuneProvider.

## 8. Rune Lab capability mapping

Use the library's applicable capabilities deliberately. Financial controls and observer takeover are not required to demonstrate a factory layout application.

| Rune Lab capability | Required integration |
| --- | --- |
| Kernel/plugin DAG | One Blueprint plugin, declared dependencies, typed session registry, deterministic disposal |
| WorkspaceLayout | Five real zones with preserved toggles and responsive Blueprint behavior |
| Command palette | One global command registration set, active-instance routing, nested file/export groups where supported |
| Shortcuts | Existing host manager for application actions; contextual canvas dispatch without duplicate listeners |
| Settings | Existing SettingsModal, Blueprint section, document commands versus personal preferences separated |
| Toasts | Existing provider overlay once; notifications based on actual operation results |
| Themes | Existing theme store, discovered themes, system preference, pre-paint restoration |
| FilterableGroupedList / presenters | Reuse for compatible catalog, asset, or shortcut list presentation; preserve proper selection/focus semantics |
| Text/RichText | Use for suitable measured list/card text only with readiness guard and ordinary-text fallback; never replace canonical canvas/export text geometry |
| i18n | Use current translator and existing locale infrastructure for all new labels/errors; reuse available language selector/locales |
| Contribution extension points | Use settings sections; do not register rootTakeover for this standard workspace |
| Persistence driver | Small preferences only; canonical document storage remains the existing repository |
| Observer | Excluded from production plugin list here; it can take over the root. Existing dev diagnostics may stay isolated under their current gate |
| Money/currency | Deferred until a real cost/financial domain exists; do not add invented prices, exchange feeds, or financial settings |

### Styling and theme details

Keep the app's current Tailwind/daisyUI setup. Ensure its **application CSS** contains a correctly resolved `@source` path to the installed Rune Lab dist directory. The skill's example path is relative to its own example file and must not be copied blindly. This does not authorize build/tooling configuration changes.

Reuse the existing theme boot logic or add the compatible synchronous restoration to the application HTML template, using the real driver/key. The reference default key is `rune-lab.layout:theme:theme`; a custom namespace requires the matching key. Handle blocked storage; `system` leaves explicit theme unset. Do not change security/CI policy to accommodate the script; record a concrete incompatibility if the app's existing policy prevents it.

Theme switching uses discovered supported themes. Validate light/dark/system and visible focus/selection/issue contrast. Do not promise all daisyUI themes if they are not included in current CSS.

Read host accessors during initialization of children under RuneProvider. Do not call accessors at module scope or before the provider exists. Avoid CSSOM, localStorage, or text-engine calls at module evaluation. Text readiness false must render normal readable content, not empty panels.

Localization: add messages through the existing project convention, including existing supported locales. Do not add a new Paraglide pipeline or advertise an unimplemented language. Use the provided translator's fallback where no project key mechanism exists and document that limit. Store stable command IDs/enum values independently from translated labels.

## 9. Commands, shortcuts, and capability policy

Implement a Blueprint-owned capability result such as `{ available, reason }`, adapted to existing command types. It combines phase availability, active session, mode, lock/selection eligibility, and in-flight state. It does not replace domain authorization.

| Stable command IDs | WP-10 action |
| --- | --- |
| `blueprint.file.new`, `.open` | Dirty-work handling then new/native open |
| `blueprint.file.save`, `.download` | Flush durable draft / download canonical native JSON |
| `blueprint.edit.undo`, `.redo`, `.duplicate`, `.delete` | Authorized existing session command |
| `blueprint.view.fit`, `.mode` | Fit selection/facility / switch mode |
| `blueprint.export.svg`, `.png`, `.webp`, `.jpeg`, `.pdf`, `.pptx` | Reserved; unavailable until implementation and corresponding tests exist |
| `blueprint.revision.create`, `.compare`, `.approve` | Reserved for WP-12 product workflow |

Use existing IDs for implemented ancillary commands; namespace newly needed tool/panel commands under `blueprint`. File download remains a separate native-format action; do not repurpose `blueprint.export.svg` to download JSON.

If Rune Lab has no disabled command field, omit unavailable executable palette entries and show their availability explanation in the relevant menu/dialog. Do not register clickable commands that only throw FORMAT_UNAVAILABLE. Existing available toolbar controls and command palette entries execute the same adapter function.

Shortcut scope order:

1. Open modal/palette owns its keys and focus.
2. Editable input/textarea/contenteditable owns typing and native text history.
3. Focused button retains Enter/Space activation.
4. Active canvas/editor scope handles enabled editing shortcuts.
5. Host-level navigation/settings commands handle their own valid scope.

Rune Lab's skill says single printable keys are excluded in inputs, but modified shortcuts may still dispatch. Therefore Blueprint must explicitly protect Ctrl/Cmd+Z, redo, select-all, clipboard, and related native input behavior. Inspect composed event paths for editable ancestors. Do not stop every event at the document root.

Keep the existing Ctrl/Cmd+S/O/E mappings outside editable/modal scopes; save requests flush, open requests native file, export opens the honest capability dialog. Preserve host navigation/detail/shortcut-help toggles where nonconflicting. Choose one owner for each actual listener; do not register a host and canvas handler that both perform the same command.

Async action handling is centralized: capture target, recheck capability, set local pending state, await completion, report outcome, restore focus if the initiator still exists. If Rune Lab's action signature is synchronous, launch through a wrapper that explicitly catches rejection. Toast success only after completion; cancel is neutral; persistent failures have an accessible inline representation as well.

## 10. Settings and preference persistence

Contribute one Blueprint settings section to the existing host modal. Avoid duplicate manual SettingsModal/Toaster/PaletteHost if RuneProvider already renders them. Use custom settings components for document values so changes issue typed commands. Standard schema bindings are acceptable only for the dedicated preference facade with validated setters.

| Setting | Authority and application |
| --- | --- |
| Facility dimensions / document description | Canonical document command; respect validation and history |
| Grid/snap spacing and snap enabled | Follow the existing canonical schema ownership. If stored in document settings, issue commands; UI visibility overrides remain session preferences |
| Display units | Personal display preference unless the existing schema explicitly declares a document default; never rescale saved millimetres |
| Hover delay | Personal preference, initialized from the spec's 250 ms default |
| Preferred export page/scale | Personal preference for later formats; no claim of a working exporter |
| Reduced animation | Personal preference combined with OS reduced-motion request; OS request must not be defeated |
| Toolbar position and panel tabs | Personal preference; narrow-screen layout constraints take priority temporarily |
| Theme/language | Existing host stores and persistence, not duplicate Blueprint stores |

Persist small, versioned JSON through the current host-compatible preference mechanism using the established `blueprint.preferences.v1` logical key. When using a namespaced slot driver, document the physical key and do not prefix twice. Scope workspace-specific preferences by the existing workspace identity where available; use an explicit `default` scope otherwise. Global theme remains host-global by design.

Validate on load; use defaults for unknown/corrupt values without breaking document recovery. Serialize preference writes so late asynchronous completion cannot overwrite a newer setting. Storage failure is nonfatal to editing and visibly limits preference persistence. Do not write every pointer coordinate. No new Blueprint configuration file.

## 11. Responsive and accessibility contract

| Width | Layout |
| --- | --- |
| >=1200 CSS px | Navigation and detail panels visible by default; canvas fills remaining space |
| 768–1199 | Navigation visible; inspector/details in an accessible drawer |
| <768 | One drawer at a time, bottom toolbar, compact header, canvas pan/zoom/tap inspection preserved |

At 1440×900, 1024×768, and 390×844: no unintended horizontal page overflow, no unreachable controls, no canvas input offset from panels, no zero-size camera corruption, no overlapping persistent overlays. Opening inspector from an asset selection on mobile closes navigation first. Drawer closure restores focus to its initiating control or a documented surviving fallback.

Use labeled semantic buttons, aria-pressed for selected tools, visible focus, correct tab/dialog semantics, contextual errors with descriptions, and unit labels. Targets are at least 24×24 CSS px; major touch controls at least 44×44. Settings/export/file dialogs trap focus and restore it. Escape closes the topmost overlay before canceling underlying canvas state.

Keyboard-only path must support catalog placement, list selection, numeric transform, save, native download, and viewer inspection. Do not require pixel-perfect canvas targeting. Announce meaningful commits/errors/tool changes through a polite throttled live region; never announce every coordinate or telemetry tick. Reduced motion removes nonessential animation; stale/offline/warnings remain understandable without blinking or color.

## 12. Reactivity, SSR safety, and disposal

Use `$state.raw` snapshot replacement or the already-verified bridge. Subscribe before actor start and resynchronize after start. Read `bridge.snapshot` reactively; do not destructure a getter once and freeze the value. `$derived` stays pure. Avoid broad effects that repeatedly create sessions, providers, renderers, or command registrations.

Separate UI subscriptions from resource ownership. On route/instance disposal: invalidate generation; cancel gesture; remove event listeners/capture; disconnect ResizeObserver; cancel scheduled work; unsubscribe UI/source; stop owned actors; release owned renderer/project/scope and object URLs. Follow existing idempotent disposal. Provider teardown must not stop a caller-owned session twice.

Settings/palette registrations belong to their actual lifecycle owner. Provider-scoped registrations survive child-route remounts once, then disappear on provider teardown. Session registrations disappear on route/instance unmount. Test baseline counts rather than assuming host plugins have zero internal registrations.

SDK standalone modules import/render an SSR placeholder without window/document access. Mounting loads the browser renderer and restores the actual content. Do not disable diagnostics or introduce ambient declarations to conceal a browser-only import leak.

## 13. Ordered implementation tasks

Each task ends with observable behavior and targeted evidence. Update execution status after each completed task; do not wait until the end to discover the shell cannot mount.

| Step | Change | Exit evidence |
| --- | --- | --- |
| W10-01 | Read closure results, inventory route/API surfaces, record API gaps | Concrete file map and compatibility declarations; protected pipeline baseline retained |
| W10-02 | Implement typed Blueprint plugin/session registry and host service adapter | Dependency resolution, registration-token and borrowed-session ownership tests |
| W10-03 | Scope provider by route group; replace landing demo with workspace/first run | `/` renders Blueprint; `/embed-demo` structurally lacks RuneProvider |
| W10-04 | Wire five layout zones, header, real canvas and document lifecycle | Open industrial fixture, edit, save, download/reopen from rendered UI |
| W10-05 | Complete tools/layers/catalog/assets and inspector | Keyboard placement, validated edits, mode/lock protection and selection synchronization |
| W10-06 | Complete operations/issues and viewer route | Simulator badge, current/stale/pending states, read-only navigation and inspection |
| W10-07 | Register command palette/shortcuts/settings/toasts | One registration set; native text shortcuts preserved; document settings use commands |
| W10-08 | Theme/style/localization and responsive accessibility pass | Three viewports, theme reload, drawers, keyboard focus and reduced motion |
| W10-09 | Standalone ownership/reactivity/lifecycle verification | AC-054–057 and SSR placeholder checks; 20 navigation cycles |
| W10-10 | Run integrated acceptance, record artifacts, update capability docs | AC-058–059 plus W10-A checks below; honest pending WP-11–16 |

The order is intentional: establish a functioning shell and data path before visual polish. Independent panel work may proceed while an environment-only closure check is blocked, but final WP-10 acceptance must disclose any open prerequisite gate.

## 14. Acceptance tests

Retain AC IDs and add supplemental W10-A IDs without renumbering the main spec. Use existing Svelte-aware component runners for component/rune behavior and real browser tests for integrated behavior. Do not modify runner configuration or scripts to make results green.

| Gate | Required proof |
| --- | --- |
| AC-054 | Mount standalone editor and two viewers with no RuneProvider ancestor. Editing/inspection/error handling works and no host-context lookup occurs. |
| AC-055 | Actor start transition plus two later events each visibly update UI. No stale destructured getter; remount uses a fresh owned actor. |
| AC-056 | 20 workspace enter/leave cycles: command IDs/host listener count remain at one set while provider lives; instance registry returns to baseline after route unmount; teardown removes Blueprint registrations. No retained session or duplicated subscription. |
| AC-057 | Two editors, including two instances of the same doc identity where supported. Focus one; palette mutation touches only its session/history/selection. Overlay focus and target disposal do not retarget actions. |
| AC-058 | Keyboard only: open example/new, catalog placement, asset selection, numeric move, save, native JSON download, reopen. Each dialog restores focus. Later-format export remains explicitly pending. |
| AC-059 | Browser runs at all three specified sizes and reduced motion. Responsive rules, minimum targets, accessible overflow/focus, and canvas mapping hold. |
| W10-A01 | First launch and returning launch differ correctly. Fixture never overwrites existing draft. Missing viewer ID creates no record. |
| W10-A02 | Actual native file download/upload round trip preserves canonical content. Cancel/invalid open leaves current work unchanged. |
| W10-A03 | Viewer mode rejects mutation through buttons, keyboard, palette, and public session boundary while inspection/telemetry remain live. |
| W10-A04 | Ctrl/Cmd+Z inside inspector/settings input changes native text history, not document history; canvas undo still works after refocus. |
| W10-A05 | Settings distinguish preferences from document commands. Unit/theme/tab changes do not alter geometry/history. Two workspace scopes do not overwrite instance state. |
| W10-A06 | Theme persists through reload without incorrect initial explicit theme; system mode and blocked-storage fallback work. Rune Lab components actually receive compiled styles. |
| W10-A07 | Slow save, storage failure, conflict, memory fallback, pending/stale constraints, and stale/bad telemetry all show truthful UI with recovery. |
| W10-A08 | Unsupported export/import/revision features cannot execute or toast success. Only actual implemented capabilities appear actionable. |
| W10-A09 | Host-owned/borrowed sessions and multiple viewers dispose independently. SSR SDK placeholder import/render succeeds. |
| W10-A10 | No unintended horizontal overflow or focus loss at 390×844; keyboard/touch can reach every currently enabled workflow. |
| W10-A11 | New controls have translated labels through current locale mechanism; status information is available without color/animation. |
| W10-A12 | A reported user operation produces one commit and one appropriate callback; hover, camera, and telemetry never emit document-change callbacks. |

Use deterministic fixture/clock/source controls through injected ports. Any development/test instrumentation must be explicitly gated and excluded from production public APIs. Do not expose a global mutation console simply to make tests easy.

## 15. Reviewable final draft and evidence

Capture actual browser screenshots after implementation at the three required sizes. Also capture: desktop with selected machine/inspector and simulated operations; command palette; settings section; memory-only or conflict recovery; standalone embed. Do not generate screenshots from a static mockup. Record theme, fixture, viewport, DPR, browser version, and source revision for each.

Record real runner commands/exits/counts and browser report/trace paths using existing artifact conventions, or `artifacts/blueprint/wp10/` when absent. Keep tests attributable to source revision/digest. Existing `just test`, `just check`, and `just build` are run unchanged if available; their success does not replace the browser gates. If an existing baseline fails, distinguish it from new failures without modifying protected tooling.

Update:

- `docs/EXECUTION-STATUS.md`: WP-10 tasks, dependencies, exact gates, limitations.
- `docs/VERIFICATION.md`: AC-054–059 and W10-A evidence, including native-download interpretation of AC-058.
- `docs/API-COMPATIBILITY.md`: installed Rune Lab accessor/layout/settings/shortcut/lifecycle facts.
- README: actual launch command, routes, supported current workflows, local-only storage scope, and staged feature availability.

Perform a final diff check: no changes to protected scripts/CI/tooling/dependency files; no Rune Lab imports in standalone SDK UI; no duplicate document authority; no demo remaining as the production landing page; no fake completion of later WPs.

### Final walkthrough

1. Launch Vision using its current command; `/` is Blueprint.
2. Open the industrial example; see the facility, layers, catalog, assets, and Simulated data indicator.
3. Select CNC from the asset list; see identity, dimensions, actual live metrics, and freshness.
4. Move it numerically; undo/redo; create a real layout issue and navigate to it from Issues.
5. Place a rack by keyboard; change bays through validated parameters; see geometry/report consistency.
6. Use the command palette to fit and save; download native JSON and reopen it.
7. Reload and recover the saved draft; switch to viewer and prove editing is unavailable.
8. Change theme/display units; geometry remains unchanged.
9. Resize to phone; use catalog and inspector drawers and return focus correctly.
10. Open `/embed-demo`; independently inspect both viewers and edit the standalone editor without host context.

WP-10 is complete when this walkthrough and all its applicable gates pass with recorded evidence. The result is the first integrated Blueprint product draft; imports, revision workflows, final export formats, and final release hardening retain their planned owners and gates.
