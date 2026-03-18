"use client";

import { useRef, useEffect, useCallback } from "react";
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  SphereGeometry,
  MeshBasicMaterial,
  Mesh,
  VideoTexture,
  LinearFilter,
  SRGBColorSpace,
  BackSide,
  MathUtils,
} from "three";

interface Panorama360PlayerProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isPlaying: boolean;
  onResetRef?: (resetFn: () => void) => void;
  onCaptureRef?: (captureFn: () => Promise<Blob | null>) => void;
  onViewRef?: (fns: { getView: () => { lon: number; lat: number; fov: number }; setView: (v: { lon: number; lat: number; fov: number }) => void }) => void;
}

export function Panorama360Player({ videoRef, isPlaying, onResetRef, onCaptureRef, onViewRef }: Panorama360PlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const animFrameRef = useRef<number>(0);

  // Spherical coordinates for camera look direction
  const lonRef = useRef(270);
  const latRef = useRef(0);

  // Drag state
  const isDraggingRef = useRef(false);
  const prevPointerRef = useRef({ x: 0, y: 0 });
  const wasDragRef = useRef(false);

  // Pinch-to-zoom state
  const pinchDistRef = useRef(0);
  const isPinchingRef = useRef(false);
  const activeTouchesRef = useRef(new Map<number, { x: number; y: number }>());

  const updateCamera = useCallback(() => {
    const camera = cameraRef.current;
    if (!camera) return;
    const phi = MathUtils.degToRad(90 - latRef.current);
    const theta = MathUtils.degToRad(lonRef.current);
    const target = {
      x: 500 * Math.sin(phi) * Math.cos(theta),
      y: 500 * Math.cos(phi),
      z: 500 * Math.sin(phi) * Math.sin(theta),
    };
    camera.lookAt(target.x, target.y, target.z);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    // Scene setup
    const scene = new Scene();
    const camera = new PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000,
    );
    camera.position.set(0, 0, 0);
    cameraRef.current = camera;
    updateCamera();

    const renderer = new WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Inverted sphere
    const geometry = new SphereGeometry(500, 60, 40);
    const texture = new VideoTexture(video);
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.colorSpace = SRGBColorSpace;

    const material = new MeshBasicMaterial({ map: texture, side: BackSide });
    const sphere = new Mesh(geometry, material);
    scene.add(sphere);

    // Render loop — runs when playing; renders one frame then stops when paused
    let loopRunning = false;
    const animate = () => {
      renderer.render(scene, camera);
      if (loopRunning) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };
    const startLoop = () => {
      if (!loopRunning) { loopRunning = true; animate(); }
    };
    const stopLoop = () => { loopRunning = false; };
    const renderOnce = () => {
      if (!loopRunning) renderer.render(scene, camera);
    };

    // Expose renderOnce so pointer handlers can trigger it while paused
    (renderer as unknown as Record<string, unknown>).__renderOnce = renderOnce;

    // Register external callbacks (after renderOnce is available)
    onResetRef?.(() => {
      lonRef.current = 270;
      latRef.current = 0;
      camera.fov = 120;
      camera.updateProjectionMatrix();
      updateCamera();
      renderOnce();
    });

    onCaptureRef?.(() => {
      renderOnce();
      return new Promise<Blob | null>((resolve) => {
        renderer.domElement.toBlob((blob) => resolve(blob), "image/jpeg", 0.92);
      });
    });

    onViewRef?.({
      getView: () => ({ lon: lonRef.current, lat: latRef.current, fov: camera.fov }),
      setView: (v) => {
        lonRef.current = v.lon;
        latRef.current = v.lat;
        camera.fov = v.fov;
        camera.updateProjectionMatrix();
        updateCamera();
        renderOnce();
      },
    });

    // Start based on current play state
    if (video.paused) { renderOnce(); } else { startLoop(); }

    // Listen for play/pause to toggle loop
    const onPlay = () => startLoop();
    const onPause = () => stopLoop();
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    // Resize
    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    return () => {
      stopLoop();
      cancelAnimationFrame(animFrameRef.current);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      resizeObserver.disconnect();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      cameraRef.current = null;
    };
  }, [videoRef, updateCamera]);

  const renderOnce = useCallback(() => {
    const r = rendererRef.current as unknown as Record<string, unknown> | null;
    if (r && typeof r.__renderOnce === "function") (r.__renderOnce as () => void)();
  }, []);

  // Pointer events for drag rotation + pinch-to-zoom
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouchesRef.current.size === 2) {
      // Start pinch
      isPinchingRef.current = true;
      isDraggingRef.current = false;
      const pts = [...activeTouchesRef.current.values()];
      pinchDistRef.current = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
    } else if (activeTouchesRef.current.size === 1) {
      isDraggingRef.current = true;
      wasDragRef.current = false;
      prevPointerRef.current = { x: e.clientX, y: e.clientY };
    }
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      activeTouchesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (isPinchingRef.current && activeTouchesRef.current.size === 2) {
        const camera = cameraRef.current;
        if (!camera) return;
        const pts = [...activeTouchesRef.current.values()];
        const newDist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const delta = pinchDistRef.current - newDist;
        camera.fov = Math.max(30, Math.min(120, camera.fov + delta * 0.1));
        camera.updateProjectionMatrix();
        pinchDistRef.current = newDist;
        wasDragRef.current = true;
        renderOnce();
        return;
      }

      if (!isDraggingRef.current) return;
      const dx = e.clientX - prevPointerRef.current.x;
      const dy = e.clientY - prevPointerRef.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) wasDragRef.current = true;
      lonRef.current -= dx * 0.2;
      latRef.current = Math.max(-85, Math.min(85, latRef.current + dy * 0.2));
      prevPointerRef.current = { x: e.clientX, y: e.clientY };
      updateCamera();
      renderOnce();
    },
    [updateCamera, renderOnce],
  );

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    activeTouchesRef.current.delete(e.pointerId);
    if (activeTouchesRef.current.size < 2) isPinchingRef.current = false;
    if (activeTouchesRef.current.size === 0) isDraggingRef.current = false;
  }, []);

  // Scroll wheel for FOV zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const camera = cameraRef.current;
    if (!camera) return;
    camera.fov = Math.max(30, Math.min(120, camera.fov + e.deltaY * 0.05));
    camera.updateProjectionMatrix();
    renderOnce();
  }, [renderOnce]);

  // Click handler: only toggle play if it wasn't a drag
  const onClick = useCallback(
    (e: React.MouseEvent) => {
      if (wasDragRef.current) {
        e.stopPropagation();
      }
      // If not a drag, let the click bubble up to the container's togglePlay
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
      onClick={onClick}
      style={{ touchAction: "none" }}
    />
  );
}
