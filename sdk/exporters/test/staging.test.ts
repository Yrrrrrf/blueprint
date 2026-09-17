import { assertEquals } from "@std/assert";
import { EXPORTERS_VERSION } from "../src/mod.ts";

Deno.test("exporters - staging test suite discovery", () => {
	assertEquals(EXPORTERS_VERSION, "0.0.1");
});
