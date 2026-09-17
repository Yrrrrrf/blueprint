# Blueprint

> Modern CAD/industrial layout editor powered by Rune Lab v0.5.2-rc.2 and Svelte 5.

## Overview

Blueprint is a high-precision, 2D industrial facility layout editor and telemetry visualization application. Built with Svelte 5 runes, XState v5 statecharts, and an isolated Paper.js vector renderer, Blueprint delivers millimeter-precise CAD editing, constraint verification, and live telemetry monitoring.

## Application Routes (`apps/vision`)

- **`/`**: Integrated Blueprint workspace shell powered by Rune Lab (`WorkspaceLayout`). Provides 5 responsive zones: Header, Workspace Strip (8 editing tools), Navigation Panel (Layers, Catalog, Assets), Content Canvas, Detail Panel (Inspector, Operations, Issues), and Status Bar.
- **`/viewer/[documentId]`**: Read-only facility viewer loading documents from local IndexedDB or falling back with explicit local storage error notices.
- **`/embed-demo`**: Standalone embedding demonstration rendering 2 independent viewers and 1 editor without an ancestor `RuneProvider` (AC-054).
- **`/showcase`**: Legacy Vision test bench demo.

## Development & Quality Gates

```bash
# Run all quality gates (format, lint, health audit, type checks)
just check

# Run full test matrix across SDKs and apps
just test

# Start development server
just dev
```

