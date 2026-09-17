<script lang="ts">
	import { onDestroy, onMount } from "svelte";
	import {
		clientToViewPoint,
		PaperRenderer,
		viewToWorld,
		zoomAtViewPoint,
	} from "@sdk/renderer";
	import type { Camera, RendererPort } from "@sdk/renderer";
	import type { Vec2 } from "@sdk/core";
	import type { BlueprintCanvasProps } from "./props.ts";

	interface ExtendedCanvasProps extends BlueprintCanvasProps {
		onCursorMove?: (worldPt: { x: number; y: number }) => void;
	}

	let {
		session,
		renderer: propRenderer,
		width = "100%",
		height = "100%",
		class: className = "",
		onCameraChange,
		onSelect,
		onCursorMove,
	}: ExtendedCanvasProps = $props();

	let containerEl = $state<HTMLDivElement | null>(null);
	let canvasEl = $state<HTMLCanvasElement | null>(null);
	let localRenderer: PaperRenderer | null = null;
	let activeRenderer = $state<RendererPort | null>(null);
	let resizeObserver: ResizeObserver | null = null;
	let detachSession: (() => void) | null = null;

	onMount(() => {
		if (!canvasEl || !containerEl) return;

		const rect = containerEl.getBoundingClientRect();
		const w = Math.max(10, rect.width || 800);
		const h = Math.max(10, rect.height || 600);

		if (propRenderer) {
			activeRenderer = propRenderer;
		} else {
			localRenderer = new PaperRenderer({
				canvas: canvasEl,
				width: w,
				height: h,
				document: session?.doc,
			});
			activeRenderer = localRenderer;
		}

		if (session && activeRenderer) {
			detachSession = session.attachRenderer(activeRenderer);
		}

		// ResizeObserver to track container bounds
		resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width: newW, height: newH } = entry.contentRect;
				if (newW > 0 && newH > 0 && localRenderer) {
					localRenderer.setViewportSize({ x: newW, y: newH });
				}
			}
		});
		resizeObserver.observe(containerEl);
	});

	onDestroy(() => {
		resizeObserver?.disconnect();
		detachSession?.();
		localRenderer?.dispose();
		activeRenderer = null;
		localRenderer = null;
	});

	function handlePointerDown(e: PointerEvent) {
		if (!canvasEl) return;
		try {
			canvasEl.setPointerCapture(e.pointerId);
		} catch {
			// Ignore if not supported in test environment
		}

		const viewPt = clientToViewPoint(e.clientX, e.clientY, canvasEl);
		if (session) {
			session.pointerDown({
				point: viewPt,
				button: e.button,
				shiftKey: e.shiftKey,
				altKey: e.altKey,
				ctrlKey: e.ctrlKey,
				metaKey: e.metaKey,
			});
			onSelect?.(session.selection);
		}
	}

	function getClientWorldPoint(clientX: number, clientY: number): { viewPt: Vec2; worldPt: Vec2 } | null {
		if (!canvasEl || !activeRenderer) return null;
		const viewPt = clientToViewPoint(clientX, clientY, canvasEl);
		const cam = activeRenderer.getCamera();
		const worldPt = viewToWorld(viewPt, cam, {
			x: canvasEl.clientWidth || 800,
			y: canvasEl.clientHeight || 600,
		});
		return { viewPt, worldPt };
	}

	function handlePointerMove(e: PointerEvent) {
		const pts = getClientWorldPoint(e.clientX, e.clientY);
		if (!pts) return;
		const { viewPt, worldPt } = pts;

		onCursorMove?.(worldPt);

		if (session) {
			session.pointerMove({
				point: viewPt,
				worldPoint: worldPt,
				shiftKey: e.shiftKey,
				altKey: e.altKey,
			});
		}
	}

	function handlePointerUp(e: PointerEvent) {
		if (canvasEl) {
			try {
				if (canvasEl.hasPointerCapture(e.pointerId)) {
					canvasEl.releasePointerCapture(e.pointerId);
				}
			} catch {
				// Ignore
			}
		}

		if (session && canvasEl) {
			const viewPt = clientToViewPoint(e.clientX, e.clientY, canvasEl);
			session.pointerUp({ point: viewPt });
		}
	}

	function handlePointerCancel() {
		session?.pointerCancel();
	}

	function handleDoubleClick(e: MouseEvent) {
		if (!canvasEl || !session) return;
		const viewPt = clientToViewPoint(e.clientX, e.clientY, canvasEl);
		session.doubleClick({ point: viewPt });
	}

	function handleWheel(e: WheelEvent) {
		if (!activeRenderer || !canvasEl) return;
		e.preventDefault();

		const curCam: Camera = activeRenderer.getCamera();
		const viewPt = clientToViewPoint(e.clientX, e.clientY, canvasEl);
		const viewportSize = {
			x: canvasEl.clientWidth || 800,
			y: canvasEl.clientHeight || 600,
		};
		const newCam = zoomAtViewPoint(curCam, viewPt, viewportSize, e.deltaY);
		activeRenderer.setCamera(newCam);
		onCameraChange?.(newCam);
	}

	function handleDragOver(e: DragEvent) {
		if (e.dataTransfer?.types.includes("application/x-blueprint-definition")) {
			e.preventDefault();
			e.dataTransfer.dropEffect = "copy";
		}
	}

	function handleDrop(e: DragEvent) {
		if (!session) return;
		e.preventDefault();
		const defId = e.dataTransfer?.getData("application/x-blueprint-definition");
		if (!defId) return;

		const pts = getClientWorldPoint(e.clientX, e.clientY);
		if (!pts) return;
		const { worldPt } = pts;

		// Place device at drop location
		session.execute({
			type: "entity.add",
			entity: {
				id: `dev-${Date.now()}`,
				name: defId,
				kind: "device",
				layerId: "layer_machinery",
				groupId: null,
				definitionId: defId,
				assetKey: `drop-${Date.now()}`,
				transform: { x: worldPt.x, y: worldPt.y, rotationDeg: 0 },
				style: {
					fill: null,
					stroke: null,
					strokeWidthMm: 1,
					opacity: 1,
					dashMm: [],
				},
				hidden: false,
				locked: false,
				tags: ["placed"],
				metadata: {},
				parameters: {},
				ratedPowerKw: 10,
				maintenanceDue: null,
				bindings: [],
			},
		});
	}
</script>

<div
	bind:this={containerEl}
	class="relative overflow-hidden {className}"
	style="width: {typeof width === 'number' ? width + 'px' : width}; height: {typeof height === 'number' ? height + 'px' : height};"
>
	<canvas
		bind:this={canvasEl}
		onpointerdown={handlePointerDown}
		onpointermove={handlePointerMove}
		onpointerup={handlePointerUp}
		onpointercancel={handlePointerCancel}
		ondblclick={handleDoubleClick}
		onwheel={handleWheel}
		ondragover={handleDragOver}
		ondrop={handleDrop}
		class="block w-full h-full touch-none select-none cursor-crosshair"
	></canvas>
</div>
