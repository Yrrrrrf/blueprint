import { defineConfig } from "vite-plus";

export default defineConfig({
	resolve: {
		alias: {
			"@std/assert": "@jsr/std__assert",
		},
	},
	test: {
		globals: true,
		projects: [
			{
				test: {
					name: "state",
					root: "./sdk/state",
				},
				extends: "./sdk/state/vite.config.ts",
			},
			{
				test: {
					name: "ui",
					root: "./sdk/ui",
				},
				extends: "./sdk/ui/vite.config.ts",
			},
			{
				test: {
					name: "renderer",
					root: "./sdk/renderer",
					include: ["test/**/*.browser.test.ts", "test/**/*.vitest.test.ts"],
				},
			},
			{
				test: {
					name: "exporters",
					root: "./sdk/exporters",
					include: ["test/**/*.browser.test.ts", "test/**/*.vitest.test.ts"],
				},
			},
			{
				test: {
					name: "vision",
					root: "./apps/vision",
				},
				extends: "./apps/vision/vite.config.mts",
			},
		],
		exclude: [
			"**/node_modules/**",
			"**/.git/**",
			"**/.svelte-kit/**",
			"**/dist/**",
			"**/build/**",
		],
	},
});
