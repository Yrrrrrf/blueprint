<script lang="ts">
import { RuneProvider } from "rune-lab";
import pkg from "../../../deno.json" with { type: "json" };
import { i18n } from "rune-lab/i18n";
import { layout } from "rune-lab/layout";
import { palettes } from "rune-lab/palettes";
import { blueprintPlugin } from "#lib/blueprint/plugin.ts";
import faviconUrl from "#lib/assets/img/rune.png";
import type { Snippet } from "svelte";

let { children }: { children: Snippet } = $props();
</script>

<RuneProvider
	plugins={[
		layout,
		palettes,
		i18n,
		blueprintPlugin,
	]}
	config={{
		app: {
			name: "Blueprint",
			version: pkg.version,
			description: "Industrial Facility CAD & Operations",
			author: pkg.authors?.[0] ?? "Blueprint Team",
			icon: faviconUrl,
		},
	}}
>
	{@render children()}
</RuneProvider>
