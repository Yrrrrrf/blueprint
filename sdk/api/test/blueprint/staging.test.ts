import { assertEquals } from "@std/assert";

Deno.test("api - staging test suite discovery", () => {
	assertEquals(typeof Deno.test, "function");
});
