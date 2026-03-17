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
}

export function Panorama360Player({ videoRef, isPlaying }: Panorama360PlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const animFrameRef = useRef<number>(0);

  // Spherical coordinates for camera look direction
  const lonRef = useRef(0);
  const latRef = useRef(0);

  // Drag state
  const isDraggingRef = useRef(false);
  const prevPointerRef = useRef({ x: 0, y: 0 });
  const wasDragRef = useRef(false);

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

    const renderer = new WebGLRenderer({ antialias: false });
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

    // Render loop
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

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
      cancelAnimationFrame(animFrameRef.current);
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

  // Pointer events for drag rotation
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    wasDragRef.current = false;
    prevPointerRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current) return;
      const dx = e.clientX - prevPointerRef.current.x;
      const dy = e.clientY - prevPointerRef.current.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) wasDragRef.current = true;
      lonRef.current -= dx * 0.2;
      latRef.current = Math.max(-85, Math.min(85, latRef.current + dy * 0.2));
      prevPointerRef.current = { x: e.clientX, y: e.clientY };
      updateCamera();
    },
    [updateCamera],
  );

  const onPointerUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  // Scroll wheel for FOV zoom
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.stopPropagation();
    const camera = cameraRef.current;
    if (!camera) return;
    camera.fov = Math.max(30, Math.min(120, camera.fov + e.deltaY * 0.05));
    camera.updateProjectionMatrix();
  }, []);

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
