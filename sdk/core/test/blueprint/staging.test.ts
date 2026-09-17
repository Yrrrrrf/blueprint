import { assertEquals } from "@std/assert";

Deno.test("core - staging test suite discovery", () => {
	assertEquals(typeof Deno.test, "function");
});
