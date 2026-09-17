import {
	contribute,
	definePlugin,
	defineSlot,
	settingsSections,
} from "rune-lab/core";
import { createPluginKit } from "rune-lab/ui";
import { createBlueprintStore } from "./store.svelte.ts";
import BlueprintSettingsSection from "./BlueprintSettingsSection.svelte";
import type { BlueprintStore } from "./types.ts";

export { getBlueprintStore } from "./context.ts";

export const blueprintPluginSpec = definePlugin({
	id: "rune-lab.blueprint",
	requires: ["rune-lab.layout", "rune-lab.palettes"],
	slots: {
		blueprint: defineSlot<unknown, BlueprintStore>({
			create: (ctx) => createBlueprintStore(ctx),
			expose: true,
		}),
	},
	contributions: [
		contribute(settingsSections, {
			id: "blueprint",
			label: "Blueprint",
			icon: "📐",
			component: BlueprintSettingsSection,
		}),
	],
});

export const kit = createPluginKit(blueprintPluginSpec);
export const blueprintPlugin = kit.plugin;
