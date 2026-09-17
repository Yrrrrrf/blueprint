import { assertEquals } from "@std/assert";

const isVitest = typeof (globalThis as any).__vitest_worker__ !== "undefined";

if (isVitest) {
	const { describe, it } = await import("vite-plus/test");
	describe("state - staging test suite discovery", () => {
		it("discovers state staging suite", () => {
			assertEquals(true, true);
		});
	});
} else if (typeof Deno !== "undefined" && typeof Deno.test === "function") {
	Deno.test("state - staging test suite discovery", () => {
		assertEquals(true, true);
	});
}
