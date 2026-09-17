import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type PluginOption, type UserConfig } from "vite-plus";

export interface GwaPkg {
	extraPlugins?: PluginOption[];
	overrides?: UserConfig;
}

const SDK_ROOT = new URL(".", import.meta.url).pathname;
const SDK_ENTRY = new URL("./mod.ts", import.meta.url).pathname;

export function defineSveltePkg(options: GwaPkg = {}) {
	const { extraPlugins = [], overrides = {} } = options;

	return defineConfig({
		resolve: {
			alias: [
				{ find: /^@sdk\/([^/]+)$/, replacement: `${SDK_ROOT}/$1/src/mod.ts` },
				{ find: /^@sdk\/(.*)/, replacement: `${SDK_ROOT}/$1` },
				{ find: /^@sdk$/, replacement: SDK_ENTRY },
				{ find: "@std/assert", replacement: "@jsr/std__assert" },
			],
		},
		plugins: [
			tailwindcss() as PluginOption,
			svelte({
				configFile: false,
				compilerOptions: {
					runes: true,
				},
			}) as PluginOption,
			...extraPlugins,
		],
		...overrides,
	});
}
