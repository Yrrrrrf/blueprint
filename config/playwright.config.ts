import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
	testDir: "../apps/vision/test",
	testMatch: "**/*.e2e.ts",
	timeout: 30000,
	expect: {
		timeout: 5000,
	},
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: "list",
	use: {
		actionTimeout: 0,
		baseURL: "http://localhost:5173",
		trace: "on-first-retry",
	},
	webServer: {
		command: "deno run -A npm:vite dev --port 5173",
		port: 5173,
		reuseExistingServer: !process.env.CI,
		cwd: "./apps/vision",
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
		{
			name: "firefox",
			use: { ...devices["Desktop Firefox"] },
		},
	],
});
