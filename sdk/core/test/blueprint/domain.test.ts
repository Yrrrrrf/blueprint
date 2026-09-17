// ============================================================================
// Blueprint Domain Acceptance Tests (AC-001 through AC-008)
// Normative test assertions for WP-02: Domain and Schema
// (§16.1 of Blueprint Implementation Specification)
// ============================================================================

import {
	assert,
	assertEquals,
	assertFalse,
	assertMatch,
	assertNotEquals,
	assertThrows,
} from "@std/assert";

import {
	computeContentHash,
	computeMetadataDepth,
	computeSha256,
	convertFromMm,
	convertToMm,
	createBlankDocument,
	createStandardLayers,
	formatDisplayLength,
	MAX_FILE_SIZE_BYTES,
	MAX_METADATA_DEPTH,
	migrateDocument,
	normalizeDocument,
	prepareExportDocument,
	serializeCanonicalJson,
	setDisplayUnit,
	validateBlueprintDocument,
	validateRawDocumentText,
	validateSchemaVersion,
	type BlueprintDocument,
	type DeviceDefinition,
	type DeviceEntity,
	type DocumentContent,
	type EmbeddedAsset,
	type ShapeEntity,
} from "../../src/mod.ts";

// ----------------------------------------------------------------------------
// Test Helpers
// ----------------------------------------------------------------------------

function createTestDefinition(id: string): DeviceDefinition {
	return {
		id,
		version: 1,
		name: `Definition ${id}`,
		category: "cnc",
		nominalWidthMm: 4000,
		nominalHeightMm: 3000,
		sizing: "rigid",
		footprint: {
			outer: [
				{ id: "v1", x: 0, y: 0 },
				{ id: "v2", x: 4000, y: 0 },
				{ id: "v3", x: 4000, y: 3000 },
				{ id: "v4", x: 0, y: 3000 },
			],
			holes: [],
		},
		clearance: {
			outer: [
				{ id: "c1", x: -500, y: -500 },
				{ id: "c2", x: 4500, y: -500 },
				{ id: "c3", x: 4500, y: 3500 },
				{ id: "c4", x: -500, y: 3500 },
			],
			holes: [],
		},
		ports: [],
		symbol: [],
		defaults: {},
	};
}

function createTestDevice(id: string, definitionId: string): DeviceEntity {
	return {
		id,
		name: `Device ${id}`,
		layerId: "layer_machinery",
		groupId: null,
		transform: { x: 5000, y: 5000, rotationDeg: 0 },
		style: {
			fill: "#3b82f6",
			stroke: "#1e3a8a",
			strokeWidthMm: 2,
			opacity: 1,
			dashMm: [],
		},
		hidden: false,
		locked: false,
		tags: [],
		metadata: {},
		kind: "device",
		definitionId,
		assetKey: `asset_${id}`,
		parameters: {},
		ratedPowerKw: 25,
		maintenanceDue: null,
		bindings: [],
	};
}

function createTestAsset(id: string): EmbeddedAsset {
	const raw = new TextEncoder().encode(`asset-data-${id}`);
	let binary = "";
	for (let i = 0; i < raw.length; i++) {
		binary += String.fromCharCode(raw[i]);
	}
	const base64 = btoa(binary);
	const sha256 = computeSha256(raw);
	return {
		id,
		mime: "image/png",
		sha256,
		widthPx: 64,
		heightPx: 64,
		base64,
	};
}

// ----------------------------------------------------------------------------
// AC-001: Blank v1 Document Roundtrip & Unit Invariant
// ----------------------------------------------------------------------------

Deno.test("AC-001: Blank v1 document serialize -> parse -> normalize -> serialize yields identical canonical content and hash; unit mm", () => {
	const doc = createBlankDocument("Test Facility 1");

	// Invariant checks
	assertEquals(doc.format, "blueprint");
	assertEquals(doc.schemaVersion, 1);
	assertEquals(doc.content.unit, "mm");
	assertEquals(doc.content.displayUnit, "m");
	assertEquals(doc.content.facility.widthMm, 60_000);
	assertEquals(doc.content.facility.heightMm, 40_000);

	// Validate fresh blank document
	const valResult = validateBlueprintDocument(doc);
	assertEquals(
		valResult.valid,
		true,
		`Validation failed: ${JSON.stringify(valResult.issues)}`,
	);
	assertEquals(valResult.issues.length, 0);

	// 1. Initial canonical serialization and content hash
	const serialized1 = serializeCanonicalJson(doc);
	const contentHash1 = computeContentHash(doc.content);

	// 2. Parse from serialized JSON
	const parsed: BlueprintDocument = JSON.parse(serialized1);
	assertEquals(parsed.content.unit, "mm");

	// 3. Normalize parsed document
	const normalized = normalizeDocument(parsed);
	assertEquals(normalized.content.unit, "mm");

	// 4. Re-serialize normalized document
	const serialized2 = serializeCanonicalJson(normalized);
	const contentHash2 = computeContentHash(normalized.content);

	// Assertions: identical canonical JSON string and SHA-256 content hash
	assertEquals(
		serialized1,
		serialized2,
		"Canonical JSON string must be identical after round-trip",
	);
	assertEquals(
		contentHash1,
		contentHash2,
		"Content SHA-256 hash must be identical after round-trip",
	);

	// Repeat pure content-level round-trip
	const contentJson1 = serializeCanonicalJson(doc.content);
	const parsedContent: DocumentContent = JSON.parse(contentJson1);
	const contentJson2 = serializeCanonicalJson(parsedContent);
	assertEquals(
		contentJson1,
		contentJson2,
		"DocumentContent canonical JSON must be identical after round-trip",
	);
});

// ----------------------------------------------------------------------------
// AC-002: Structured Validation Failure & Document Immutability
// ----------------------------------------------------------------------------

Deno.test("AC-002: Coordinates NaN/Infinity, negative widths, extra unknown structural field -> structured validation failure; document unchanged", () => {
	const originalDoc = createBlankDocument();
	const originalSnapshot = JSON.stringify(originalDoc);

	// 1. Coordinates NaN and Infinity
	{
		const badDoc = JSON.parse(originalSnapshot) as BlueprintDocument;
		const invalidShapeNaN: ShapeEntity = {
			id: "shape_nan",
			name: "NaN Shape",
			layerId: "layer_sections",
			groupId: null,
			transform: { x: NaN, y: 1000, rotationDeg: 0 },
			style: {
				fill: "#000000",
				stroke: null,
				strokeWidthMm: 1,
				opacity: 1,
				dashMm: [],
			},
			hidden: false,
			locked: false,
			tags: [],
			metadata: {},
			kind: "shape",
			geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
			structural: false,
		};
		const entities = { ...badDoc.content.entities, shape_nan: invalidShapeNaN };
		badDoc.content = {
			...badDoc.content,
			entities,
			entityOrder: [...badDoc.content.entityOrder, "shape_nan"],
		};

		const snapshotBefore = JSON.stringify(badDoc);
		const result = validateBlueprintDocument(badDoc);

		assertFalse(result.valid, "NaN coordinate must fail validation");
		assert(
			result.issues.some((i) => i.code === "INVALID_COORDINATE"),
			`Expected INVALID_COORDINATE issue, got: ${JSON.stringify(result.issues)}`,
		);
		// Ensure document was not mutated during validation
		assertEquals(
			JSON.stringify(badDoc),
			snapshotBefore,
			"Document must remain unchanged after validation",
		);
	}

	{
		const badDoc = JSON.parse(originalSnapshot) as BlueprintDocument;
		const invalidShapeInf: ShapeEntity = {
			id: "shape_inf",
			name: "Infinity Shape",
			layerId: "layer_sections",
			groupId: null,
			transform: { x: 1000, y: Infinity, rotationDeg: 0 },
			style: {
				fill: "#000000",
				stroke: null,
				strokeWidthMm: 1,
				opacity: 1,
				dashMm: [],
			},
			hidden: false,
			locked: false,
			tags: [],
			metadata: {},
			kind: "shape",
			geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
			structural: false,
		};
		const entities = { ...badDoc.content.entities, shape_inf: invalidShapeInf };
		badDoc.content = {
			...badDoc.content,
			entities,
			entityOrder: [...badDoc.content.entityOrder, "shape_inf"],
		};

		const snapshotBefore = JSON.stringify(badDoc);
		const result = validateBlueprintDocument(badDoc);

		assertFalse(result.valid, "Infinity coordinate must fail validation");
		assert(
			result.issues.some((i) => i.code === "INVALID_COORDINATE"),
			`Expected INVALID_COORDINATE issue, got: ${JSON.stringify(result.issues)}`,
		);
		assertEquals(
			JSON.stringify(badDoc),
			snapshotBefore,
			"Document must remain unchanged after validation",
		);
	}

	// 2. Negative widths
	{
		const badDoc = JSON.parse(originalSnapshot) as BlueprintDocument;
		const negativeShape: ShapeEntity = {
			id: "shape_neg",
			name: "Negative Width Shape",
			layerId: "layer_sections",
			groupId: null,
			transform: { x: 1000, y: 1000, rotationDeg: 0 },
			style: {
				fill: "#000000",
				stroke: null,
				strokeWidthMm: 1,
				opacity: 1,
				dashMm: [],
			},
			hidden: false,
			locked: false,
			tags: [],
			metadata: {},
			kind: "shape",
			geometry: { kind: "rect", width: -500, height: 1000, cornerRadius: 0 },
			structural: false,
		};
		const entities = { ...badDoc.content.entities, shape_neg: negativeShape };
		badDoc.content = {
			...badDoc.content,
			entities,
			entityOrder: [...badDoc.content.entityOrder, "shape_neg"],
		};

		const snapshotBefore = JSON.stringify(badDoc);
		const result = validateBlueprintDocument(badDoc);

		assertFalse(result.valid, "Negative width must fail validation");
		assert(
			result.issues.some((i) => i.code === "NON_POSITIVE_DIMENSION"),
			`Expected NON_POSITIVE_DIMENSION issue, got: ${JSON.stringify(result.issues)}`,
		);
		assertEquals(
			JSON.stringify(badDoc),
			snapshotBefore,
			"Document must remain unchanged after validation",
		);
	}

	// 3. Extra unknown structural field outside metadata
	{
		const badDoc = JSON.parse(originalSnapshot) as Record<string, unknown>;
		badDoc.rogueEnvelopeField = "should_be_rejected";

		const snapshotBefore = JSON.stringify(badDoc);
		const result = validateBlueprintDocument(badDoc);

		assertFalse(result.valid, "Extra envelope field must fail validation");
		assert(
			result.issues.some((i) => i.code === "UNKNOWN_FIELD"),
			`Expected UNKNOWN_FIELD issue, got: ${JSON.stringify(result.issues)}`,
		);
		assertEquals(
			JSON.stringify(badDoc),
			snapshotBefore,
			"Document must remain unchanged after validation",
		);
	}

	{
		const badDoc = JSON.parse(originalSnapshot) as BlueprintDocument;
		const contentRecord = badDoc.content as unknown as Record<string, unknown>;
		contentRecord.rogueContentField = 42;

		const snapshotBefore = JSON.stringify(badDoc);
		const result = validateBlueprintDocument(badDoc);

		assertFalse(result.valid, "Extra content field must fail validation");
		assert(
			result.issues.some((i) => i.code === "UNKNOWN_FIELD"),
			`Expected UNKNOWN_FIELD issue, got: ${JSON.stringify(result.issues)}`,
		);
		assertEquals(
			JSON.stringify(badDoc),
			snapshotBefore,
			"Document must remain unchanged after validation",
		);
	}

	// Live original document was never mutated
	assertEquals(
		JSON.stringify(originalDoc),
		originalSnapshot,
		"Original document must be completely untouched",
	);
});

// ----------------------------------------------------------------------------
// AC-003: Exact Relevant Validation Codes and Paths
// ----------------------------------------------------------------------------

Deno.test("AC-003: Duplicate ID, map key mismatch, layer cycle, dangling definition -> exact relevant validation codes/paths", () => {
	// 1. Duplicate ID
	{
		const doc = createBlankDocument();
		// Add duplicate layer ID
		const layersWithDuplicate = [
			...doc.content.layers,
			{
				id: "layer_foundation", // Duplicate!
				name: "Duplicate Foundation",
				role: "custom" as const,
				parentId: null,
				visible: true,
				locked: false,
				printable: true,
				opacity: 1,
			},
		];
		doc.content = { ...doc.content, layers: layersWithDuplicate };

		const result = validateBlueprintDocument(doc);
		assertFalse(result.valid, "Duplicate layer ID must be invalid");
		const issue = result.issues.find((i) => i.code === "DUPLICATE_ID");
		assert(issue, "Expected DUPLICATE_ID issue");
		assertEquals(issue.path, "content.layers[4].id");
	}

	// 2. Map key mismatch
	{
		const doc = createBlankDocument();
		const shape: ShapeEntity = {
			id: "shape_correct_id",
			name: "Mismatched Key Shape",
			layerId: "layer_sections",
			groupId: null,
			transform: { x: 0, y: 0, rotationDeg: 0 },
			style: {
				fill: "#ffffff",
				stroke: null,
				strokeWidthMm: 1,
				opacity: 1,
				dashMm: [],
			},
			hidden: false,
			locked: false,
			tags: [],
			metadata: {},
			kind: "shape",
			geometry: { kind: "rect", width: 1000, height: 1000, cornerRadius: 0 },
			structural: false,
		};
		// Insert under different map key
		doc.content = {
			...doc.content,
			entities: { shape_wrong_key: shape },
			entityOrder: ["shape_correct_id"],
		};

		const result = validateBlueprintDocument(doc);
		assertFalse(result.valid, "Map key mismatch must be invalid");
		const issue = result.issues.find((i) => i.code === "MAP_KEY_MISMATCH");
		assert(
			issue,
			`Expected MAP_KEY_MISMATCH issue, got: ${JSON.stringify(result.issues)}`,
		);
		assertEquals(issue.path, "content.entities.shape_wrong_key");
	}

	// 3. Layer hierarchy cycle
	{
		const doc = createBlankDocument();
		const layers = createStandardLayers();
		// Create cycle: layer_sections -> layer_machinery -> layer_sections
		const sectionLayer = layers.find((l) => l.id === "layer_sections")!;
		const machineryLayer = layers.find((l) => l.id === "layer_machinery")!;
		sectionLayer.parentId = "layer_machinery";
		machineryLayer.parentId = "layer_sections";

		doc.content = { ...doc.content, layers };

		const result = validateBlueprintDocument(doc);
		assertFalse(result.valid, "Layer cycle must be invalid");
		const issue = result.issues.find((i) => i.code === "HIERARCHY_CYCLE");
		assert(
			issue,
			`Expected HIERARCHY_CYCLE issue, got: ${JSON.stringify(result.issues)}`,
		);
		assertMatch(issue.path, /^content\.layers\[\d+\]\.parentId$/);
	}

	// 4. Dangling definition
	{
		const doc = createBlankDocument();
		const device = createTestDevice("dev_001", "def_nonexistent_999");
		doc.content = {
			...doc.content,
			entities: { dev_001: device },
			entityOrder: ["dev_001"],
		};

		const result = validateBlueprintDocument(doc);
		assertFalse(result.valid, "Dangling definition must be invalid");
		const issue = result.issues.find((i) => i.code === "DANGLING_DEFINITION");
		assert(
			issue,
			`Expected DANGLING_DEFINITION issue, got: ${JSON.stringify(result.issues)}`,
		);
		assertEquals(issue.path, "content.entities.dev_001.definitionId");
		assertEquals(issue.entityIds, ["dev_001"]);
	}
});

// ----------------------------------------------------------------------------
// AC-004: Display Unit Conversion & Geometry Immutability
// ----------------------------------------------------------------------------

Deno.test("AC-004: Display unit m <-> mm conversion helper; stored geometry unchanged; 4000 mm displays 4.00 m or 4000 mm accordingly", () => {
	// 1. Conversion helpers
	assertEquals(convertFromMm(4000, "m"), 4);
	assertEquals(convertFromMm(4000, "mm"), 4000);
	assertEquals(convertFromMm(4000, "cm"), 400);

	assertEquals(convertToMm(4, "m"), 4000);
	assertEquals(convertToMm(4000, "mm"), 4000);
	assertEquals(convertToMm(400, "cm"), 4000);

	// 2. Display formatting: 4000 mm displays "4.00 m" or "4000 mm"
	assertEquals(formatDisplayLength(4000, "m"), "4.00 m");
	assertEquals(formatDisplayLength(4000, "mm"), "4000 mm");
	assertEquals(formatDisplayLength(4000, "cm"), "400.0 cm");

	// Precision override
	assertEquals(formatDisplayLength(4000, "m", 3), "4.000 m");
	assertEquals(formatDisplayLength(4000.5, "mm", 1), "4000.5 mm");

	// 3. Document display unit change preserves stored geometry
	const doc = createBlankDocument("Facility Geometry Test", {
		facilityWidthMm: 60_000,
		facilityHeightMm: 40_000,
		displayUnit: "m",
	});

	const device = createTestDevice("dev_4000", "def_test");
	doc.content = {
		...doc.content,
		definitions: { def_test: createTestDefinition("def_test") },
		entities: { dev_4000: device },
		entityOrder: ["dev_4000"],
	};

	const originalSnapshot = JSON.stringify(doc);

	// Switch displayUnit from 'm' to 'mm'
	const docMm = setDisplayUnit(doc, "mm");

	// Live input document unchanged (immutability)
	assertEquals(JSON.stringify(doc), originalSnapshot);
	assertEquals(doc.content.displayUnit, "m");

	// New document has updated displayUnit
	assertEquals(docMm.content.displayUnit, "mm");

	// All stored geometries are strictly identical millimetre numbers
	assertEquals(docMm.content.facility.widthMm, 60_000);
	assertEquals(docMm.content.facility.heightMm, 40_000);
	assertEquals(docMm.content.grid.minorMm, 1_000);
	assertEquals(docMm.content.entities.dev_4000.transform.x, 5000);
	assertEquals(docMm.content.entities.dev_4000.transform.y, 5000);
	assertEquals(docMm.content.definitions.def_test.nominalWidthMm, 4000);
	assertEquals(docMm.content.definitions.def_test.nominalHeightMm, 3000);

	// Content hash remains identical (since displayUnit changed in content, verify unit remains mm)
	assertEquals(docMm.content.unit, "mm");
});

// ----------------------------------------------------------------------------
// AC-005: Future Schema Version Rejection & No Fallback Paper Import
// ----------------------------------------------------------------------------

Deno.test("AC-005: Future schemaVersion=2 rejected with version message, no fallback Paper import", () => {
	const doc = createBlankDocument();
	const futureDoc = { ...doc, schemaVersion: 2 };

	// 1. Validation pipeline rejection
	const valResult = validateBlueprintDocument(futureDoc);
	assertFalse(valResult.valid, "schemaVersion=2 must be rejected");
	const versionIssue = valResult.issues.find(
		(i) => i.code === "UNSUPPORTED_SCHEMA_VERSION",
	);
	assert(versionIssue, "Expected UNSUPPORTED_SCHEMA_VERSION issue");
	assertEquals(versionIssue.path, "schemaVersion");
	assertMatch(versionIssue.message, /Unsupported schema version: 2/);
	assertMatch(versionIssue.message, /Expected version 1/);

	// 2. Early raw document validation rejection
	const rawJson = JSON.stringify(futureDoc);
	const rawResult = validateRawDocumentText(rawJson);
	assertFalse(rawResult.valid, "Raw text check must reject schemaVersion=2");
	assertEquals(rawResult.issues[0].code, "UNSUPPORTED_SCHEMA_VERSION");

	// 3. Migration dispatcher rejection
	assertThrows(
		() => migrateDocument(futureDoc),
		Error,
		"Unsupported schema version: 2. Expected version 1. No forward migration or Paper import fallback available.",
	);

	assertThrows(
		() => validateSchemaVersion(2),
		Error,
		"Unsupported schema version: 2. Expected version 1. No forward migration or Paper import fallback available.",
	);

	// 4. Raw Paper.js JSON is not accepted as Blueprint
	const rawPaperJson = JSON.stringify([
		"PaperScope",
		{ version: "0.12.18", project: { layers: [] } },
	]);
	const paperResult = validateRawDocumentText(rawPaperJson);
	// Parsing produces array, not object with schemaVersion
	assertFalse(
		paperResult.valid && validateBlueprintDocument(paperResult.doc).valid,
		"Raw Paper.js JSON must not validate as native Blueprint",
	);

	assertThrows(() => migrateDocument(JSON.parse(rawPaperJson)), Error);
});

// ----------------------------------------------------------------------------
// AC-006: File Size Limit (20 MiB + 1 byte) & Depth-9 Metadata Rejection
// ----------------------------------------------------------------------------

Deno.test("AC-006: 20 MiB + 1 byte file or depth-9 metadata rejected before expensive operations", () => {
	// 1. 20 MiB + 1 byte payload check
	const oversizedLength = MAX_FILE_SIZE_BYTES + 1; // 20 * 1024 * 1024 + 1 = 20,971,521
	const oversizedBuffer = new Uint8Array(oversizedLength);
	oversizedBuffer.fill(32); // fill with ASCII spaces

	const sizeResult = validateRawDocumentText(oversizedBuffer);
	assertFalse(
		sizeResult.valid,
		"Payload > 20 MiB must be rejected immediately",
	);
	assertEquals(sizeResult.issues[0].code, "FILE_SIZE_LIMIT_EXCEEDED");
	assertMatch(sizeResult.issues[0].message, /exceeds 20 MiB limit/);

	// 2. Exact 20 MiB is within byte limit (though invalid JSON)
	const exact20MibBuffer = new Uint8Array(MAX_FILE_SIZE_BYTES);
	exact20MibBuffer.fill(32);
	const exactSizeResult = validateRawDocumentText(exact20MibBuffer);
	assertNotEquals(exactSizeResult.issues[0]?.code, "FILE_SIZE_LIMIT_EXCEEDED");

	// 3. Depth-9 metadata rejection
	let depth9Meta: Record<string, unknown> = { leaf: "value" };
	for (let i = 0; i < 8; i++) {
		depth9Meta = { step: depth9Meta };
	}
	const computedDepth = computeMetadataDepth(depth9Meta);
	assertEquals(
		computedDepth,
		9,
		"Constructed metadata must have nesting depth 9",
	);

	const doc = createBlankDocument();
	const docWithDeepMeta = {
		...doc,
		content: {
			...doc.content,
			metadata: depth9Meta,
		},
	};

	// Early raw text check
	const rawJson = JSON.stringify(docWithDeepMeta);
	const rawResult = validateRawDocumentText(rawJson);
	assertFalse(
		rawResult.valid,
		"Metadata depth 9 must be rejected in early raw check",
	);
	assertEquals(rawResult.issues[0].code, "METADATA_DEPTH_EXCEEDED");
	assertEquals(rawResult.issues[0].path, "content.metadata");

	// Full document validator check
	const docResult = validateBlueprintDocument(docWithDeepMeta);
	assertFalse(
		docResult.valid,
		"Metadata depth 9 must be rejected in document validation",
	);
	const metaIssue = docResult.issues.find(
		(i) => i.code === "METADATA_DEPTH_EXCEEDED",
	);
	assert(metaIssue, "Expected METADATA_DEPTH_EXCEEDED issue");
	assertEquals(metaIssue.path, "content.metadata");

	// 4. Depth-8 metadata is accepted (boundary condition)
	let depth8Meta: Record<string, unknown> = { leaf: "value" };
	for (let i = 0; i < 7; i++) {
		depth8Meta = { step: depth8Meta };
	}
	assertEquals(computeMetadataDepth(depth8Meta), MAX_METADATA_DEPTH);
	const docWithDepth8 = {
		...doc,
		content: {
			...doc.content,
			metadata: depth8Meta,
		},
	};
	const depth8Result = validateBlueprintDocument(docWithDepth8);
	assertEquals(depth8Result.valid, true, "Metadata depth 8 must be accepted");
});

// ----------------------------------------------------------------------------
// AC-007: Content Hash Invariance & Object Key Reordering
// ----------------------------------------------------------------------------

Deno.test("AC-007: Same content with changed envelope timestamps/revision yields identical content hash; object key reorder does not alter hash", () => {
	const doc1 = createBlankDocument("Hashing Test Doc", {
		documentId: "doc_original_001",
		createdAt: "2026-09-15T00:00:00.000Z",
		updatedAt: "2026-09-15T00:00:00.000Z",
		revision: 1,
	});

	// Changed envelope metadata: different documentId, timestamps, revision
	const doc2: BlueprintDocument = {
		format: "blueprint",
		schemaVersion: 1,
		documentId: "doc_modified_999",
		createdAt: "2020-01-01T12:00:00.000Z",
		updatedAt: "2030-12-31T23:59:59.000Z",
		revision: 842,
		content: { ...doc1.content },
	};

	// 1. Content hash must be strictly identical despite changed envelope
	const hash1 = computeContentHash(doc1.content);
	const hash2 = computeContentHash(doc2.content);
	assertEquals(
		hash1,
		hash2,
		"Content SHA-256 hash must be identical when content is identical",
	);

	// 2. Key reordering in content does not change canonical JSON or content hash
	const c = doc1.content;
	const reorderedContent: DocumentContent = {
		metadata: c.metadata,
		grid: {
			visible: c.grid.visible,
			majorEvery: c.grid.majorEvery,
			minorMm: c.grid.minorMm,
			origin: { y: c.grid.origin.y, x: c.grid.origin.x },
		},
		relations: c.relations,
		lines: c.lines,
		assets: c.assets,
		definitions: c.definitions,
		groups: c.groups,
		entityOrder: c.entityOrder,
		entities: c.entities,
		layers: c.layers,
		facility: {
			heightMm: c.facility.heightMm,
			widthMm: c.facility.widthMm,
		},
		displayUnit: c.displayUnit,
		unit: c.unit,
		description: c.description,
		name: c.name,
	};

	// Standard JSON.stringify produces different strings due to key order
	assertNotEquals(
		JSON.stringify(c),
		JSON.stringify(reorderedContent),
		"Standard JSON stringify is key-order dependent",
	);

	// Canonical serialization produces identical output
	const canonicalOriginal = serializeCanonicalJson(c);
	const canonicalReordered = serializeCanonicalJson(reorderedContent);
	assertEquals(
		canonicalOriginal,
		canonicalReordered,
		"Canonical JSON must be strictly identical regardless of key order",
	);

	// Content hash remains identical
	const hashReordered = computeContentHash(reorderedContent);
	assertEquals(
		hash1,
		hashReordered,
		"Content hash must be identical after key reorder",
	);
});

// ----------------------------------------------------------------------------
// AC-008: Export Doc Excludes Stale Runtime Samples, Selection & History
// ----------------------------------------------------------------------------

Deno.test("AC-008: Export doc with runtime samples/selection/history excludes those runtime fields and garbage-collects unused definitions/assets", () => {
	const doc = createBlankDocument("Export Clean Test");

	// Setup definitions: one used, one unused
	const defUsed = createTestDefinition("def_used");
	const defUnused = createTestDefinition("def_unused");
	doc.content = {
		...doc.content,
		definitions: {
			def_used: defUsed,
			def_unused: defUnused,
		},
	};

	// Setup entities: one device referencing def_used
	const dev1 = createTestDevice("dev_01", "def_used");
	doc.content = {
		...doc.content,
		entities: { dev_01: dev1 },
		entityOrder: ["dev_01"],
	};

	// Setup assets: one unused
	const assetUnused = createTestAsset("asset_unused");
	doc.content = {
		...doc.content,
		assets: { asset_unused: assetUnused },
	};

	// Mock active runtime session containing non-canonical session fields
	const mockRuntimeSession = {
		selection: ["dev_01"],
		activeTool: "select",
		viewport: { x: 100, y: 200, zoom: 1.25 },
		history: [
			{ revision: 1, label: "Initial create" },
			{ revision: 2, label: "Add dev_01" },
		],
		telemetrySamples: [
			{
				timestamp: "2026-09-15T00:00:00.000Z",
				topic: "telemetry.power",
				value: 24.5,
			},
			{
				timestamp: "2026-09-15T00:00:01.000Z",
				topic: "telemetry.power",
				value: 25.1,
			},
		],
		staleSamples: true,
	};

	// Execute prepareExportDocument
	const exported = prepareExportDocument(doc, mockRuntimeSession);

	// 1. Root envelope must contain only canonical BlueprintDocument fields
	const exportedKeys = Object.keys(exported).sort();
	assertEquals(exportedKeys, [
		"content",
		"createdAt",
		"documentId",
		"format",
		"revision",
		"schemaVersion",
		"updatedAt",
	]);

	// Assert runtime session fields do NOT appear on root or content
	assertFalse("selection" in (exported as Record<string, unknown>));
	assertFalse("viewport" in (exported as Record<string, unknown>));
	assertFalse("history" in (exported as Record<string, unknown>));
	assertFalse("telemetrySamples" in (exported as Record<string, unknown>));
	assertFalse("staleSamples" in (exported as Record<string, unknown>));
	assertFalse("activeTool" in (exported as Record<string, unknown>));

	const exportedContentRecord = exported.content as unknown as Record<
		string,
		unknown
	>;
	assertFalse("selection" in exportedContentRecord);
	assertFalse("viewport" in exportedContentRecord);
	assertFalse("history" in exportedContentRecord);
	assertFalse("telemetrySamples" in exportedContentRecord);

	// 2. Unused definitions and assets are garbage-collected
	assertEquals(
		"def_used" in exported.content.definitions,
		true,
		"Used definition must be retained",
	);
	assertEquals(
		"def_unused" in exported.content.definitions,
		false,
		"Unused definition must be stripped",
	);
	assertEquals(
		"asset_unused" in exported.content.assets,
		false,
		"Unused asset must be stripped",
	);

	// 3. Live document remains unchanged (no mutation during export)
	assertEquals(
		"def_unused" in doc.content.definitions,
		true,
		"Live doc must keep unused definition",
	);
	assertEquals(
		"asset_unused" in doc.content.assets,
		true,
		"Live doc must keep unused asset",
	);

	// 4. Exported document is completely valid
	const exportVal = validateBlueprintDocument(exported);
	assertEquals(
		exportVal.valid,
		true,
		`Exported document must be valid: ${JSON.stringify(exportVal.issues)}`,
	);
});
