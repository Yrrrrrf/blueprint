import { assertEquals } from "@std/assert";
import { RENDERER_VERSION } from "../src/mod.ts";

Deno.test("renderer - staging test suite discovery", () => {
	assertEquals(RENDERER_VERSION, "0.0.1");
});
