"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  PlaneGeometry,
  MeshBasicMaterial,
  Mesh,
  TextureLoader,
  Texture,
  SRGBColorSpace,
  LinearFilter,
  Color,
  Raycaster,
  Vector2,
  MathUtils,
} from "three";
import { resolveImageSrc } from "@/lib/image-utils";

interface PosterWallMovie {
  id: string;
  title: string;
  posterPath?: string | null;
}

interface PosterWallProps {
  movies: PosterWallMovie[];
  onClose: () => void;
}

// Layout constants (world units)
const POSTER_W = 2;
const POSTER_H = 3; // 2:3 aspect
const GAP_X = 0.5;
const GAP_Y = 0.6;
const COL_STEP = POSTER_W + GAP_X;
const WALL_RADIUS = 18; // curvature radius of the arc the posters sit on
const PLACEHOLDER_COLOR = 0x1a1a2e;
const HOVER_SCALE = 1.08;
const TEXTURE_CONCURRENCY = 6;

export function PosterWall({ movies, onClose }: PosterWallProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredTitle, setHoveredTitle] = useState<string | null>(null);

  // Keep the latest close handler without re-running the WebGL effect
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new Scene();
    scene.background = new Color(0x0a0a0f);

    const camera = new PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      200,
    );
    // Camera sits inside the arc looking outward toward the wall
    const camZ = WALL_RADIUS - 8;
    camera.position.set(0, 0, camZ);

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0a0a0f, 1);
    container.appendChild(renderer.domElement);

    // Layout: 2 rows if the library is large, else 1 row
    const rows = movies.length > 40 ? 2 : 1;
    const cols = Math.ceil(movies.length / rows);
    // Vertical offset so the grid is roughly centred on the camera's eye line
    const rowY = (r: number) =>
      rows === 1 ? 0 : (POSTER_H + GAP_Y) * (0.5 - r);

    // Track disposables for teardown
    const geometries: PlaneGeometry[] = [];
    const materials: MeshBasicMaterial[] = [];
    const textures: Texture[] = [];
    const meshes: Mesh[] = [];
    // Per-mesh metadata parallel to `meshes`
    interface Tile {
      mesh: Mesh;
      material: MeshBasicMaterial;
      movie: PosterWallMovie;
      col: number;
    }
    const tiles: Tile[] = [];

    // Build every plane immediately with a dark placeholder material.
    // Posters are laid out column-major so the two rows of a movie stay
    // adjacent along the wall.
    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i];
      const col = Math.floor(i / rows);
      const row = i % rows;
      // Centre the columns around x=0
      const x = (col - (cols - 1) / 2) * COL_STEP;
      // Bend the wall into a gentle arc: further-out columns recede in z
      // and rotate to face the camera.
      const theta = x / WALL_RADIUS;
      const z = WALL_RADIUS - Math.cos(theta) * WALL_RADIUS;
      const px = Math.sin(theta) * WALL_RADIUS;
      const y = rowY(row);

      const geometry = new PlaneGeometry(POSTER_W, POSTER_H);
      const material = new MeshBasicMaterial({ color: PLACEHOLDER_COLOR });
      const mesh = new Mesh(geometry, material);
      mesh.position.set(px, y, z);
      mesh.rotation.y = -theta; // face inward toward the camera arc
      mesh.userData.movieId = movie.id;
      mesh.userData.baseScale = 1;
      scene.add(mesh);

      geometries.push(geometry);
      materials.push(material);
      meshes.push(mesh);
      tiles.push({ mesh, material, movie, col });
    }

    // Horizontal pan bounds (in world x at the wall front)
    const halfSpan = ((cols - 1) / 2) * COL_STEP;
    const maxTilt = halfSpan / WALL_RADIUS; // max theta at the ends
    // Camera pans along an arc concentric with the wall so it always keeps
    // roughly the same distance to the posters it faces.
    let targetTheta = 0;
    let currentTheta = 0;

    // The wall's arc is centred at (0, 0, WALL_RADIUS); posters sit on it and
    // curve toward z=0 at the front. The camera orbits the same centre at a
    // smaller radius so it keeps a steady distance to whatever it faces.
    const camOrbit = WALL_RADIUS - camZ;
    const applyCamera = () => {
      camera.position.x = Math.sin(currentTheta) * camOrbit;
      camera.position.z = WALL_RADIUS - Math.cos(currentTheta) * camOrbit;
      // Look at the point on the wall directly ahead
      const lookX = Math.sin(currentTheta) * WALL_RADIUS;
      const lookZ = WALL_RADIUS - Math.cos(currentTheta) * WALL_RADIUS;
      camera.lookAt(lookX, 0, lookZ);
    };
    applyCamera();

    // ---- Texture streaming (nearest column first, concurrency-capped) ----
    const loader = new TextureLoader();
    // Tiles that actually have a poster to load, ordered by distance from centre
    const loadQueue = tiles
      .filter((t) => !!t.movie.posterPath)
      .sort((a, b) => Math.abs(a.col - cols / 2) - Math.abs(b.col - cols / 2));
    let queueIdx = 0;
    let inFlight = 0;
    let disposed = false;

    const pump = () => {
      while (!disposed && inFlight < TEXTURE_CONCURRENCY && queueIdx < loadQueue.length) {
        const tile = loadQueue[queueIdx++];
        inFlight++;
        const src = resolveImageSrc(tile.movie.posterPath!, 360);
        loader.load(
          src,
          (texture) => {
            inFlight--;
            if (disposed) {
              texture.dispose();
              return;
            }
            texture.colorSpace = SRGBColorSpace;
            texture.minFilter = LinearFilter;
            texture.magFilter = LinearFilter;
            textures.push(texture);
            tile.material.map = texture;
            tile.material.color.set(0xffffff);
            tile.material.needsUpdate = true;
            renderOnce();
            pump();
          },
          undefined,
          () => {
            // On error keep the placeholder and continue
            inFlight--;
            pump();
          },
        );
      }
    };

    // ---- Interaction: wheel / drag pan + hover raycast ----
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    let hoveredMesh: Mesh | null = null;
    let isDragging = false;
    let dragMoved = false;
    let lastPointerX = 0;

    const canvas = renderer.domElement;

    const setTargetFromDelta = (deltaTheta: number) => {
      targetTheta = MathUtils.clamp(targetTheta + deltaTheta, -maxTilt, maxTilt);
      startLoop();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      setTargetFromDelta(delta * 0.0006);
    };

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      dragMoved = false;
      lastPointerX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    };

    const updatePointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onPointerMove = (e: PointerEvent) => {
      updatePointer(e);
      if (isDragging) {
        const dx = e.clientX - lastPointerX;
        if (Math.abs(dx) > 2) dragMoved = true;
        lastPointerX = e.clientX;
        // Dragging right pans the wall leftward (camera moves opposite)
        setTargetFromDelta(-dx * 0.0016);
      }
      // Hover raycast (kept off while actively dragging to avoid jitter)
      if (!isDragging) updateHover();
    };

    const onPointerUp = (e: PointerEvent) => {
      isDragging = false;
      canvas.releasePointerCapture?.(e.pointerId);
    };

    const updateHover = () => {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(meshes, false);
      const next = (hits[0]?.object as Mesh) ?? null;
      if (next === hoveredMesh) return;
      // Reset previous
      if (hoveredMesh) hoveredMesh.scale.setScalar(1);
      hoveredMesh = next;
      if (hoveredMesh) {
        hoveredMesh.scale.setScalar(HOVER_SCALE);
        const movie = tiles.find((t) => t.mesh === hoveredMesh)?.movie;
        setHoveredTitle(movie?.title ?? null);
        canvas.style.cursor = "pointer";
      } else {
        setHoveredTitle(null);
        canvas.style.cursor = "grab";
      }
      renderOnce();
    };

    const onClick = () => {
      if (dragMoved || !hoveredMesh) return;
      const id = hoveredMesh.userData.movieId as string | undefined;
      if (!id) return;
      onCloseRef.current();
      routerRef.current.push(`/movies/${id}`);
    };

    canvas.style.cursor = "grab";
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("click", onClick);

    // ---- Render loop (inertial pan) ----
    let rafId = 0;
    let loopRunning = false;

    const renderOnce = () => {
      if (!loopRunning) renderer.render(scene, camera);
    };

    const animate = () => {
      currentTheta += (targetTheta - currentTheta) * 0.12;
      applyCamera();
      renderer.render(scene, camera);
      // Stop the loop once the pan has effectively settled
      if (Math.abs(targetTheta - currentTheta) < 0.0004) {
        currentTheta = targetTheta;
        loopRunning = false;
        return;
      }
      rafId = requestAnimationFrame(animate);
    };

    const startLoop = () => {
      if (loopRunning || disposed || document.hidden) return;
      loopRunning = true;
      rafId = requestAnimationFrame(animate);
    };

    // Pause the loop when the tab is hidden; resume if a pan is pending
    const onVisibility = () => {
      if (document.hidden) {
        loopRunning = false;
        cancelAnimationFrame(rafId);
      } else if (Math.abs(targetTheta - currentTheta) >= 0.0004) {
        startLoop();
      } else {
        renderOnce();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    // ESC closes the wall
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // Resize handling
    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderOnce();
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    // Kick off texture streaming and initial paint
    pump();
    renderOnce();

    return () => {
      disposed = true;
      loopRunning = false;
      cancelAnimationFrame(rafId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("keydown", onKeyDown);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("click", onClick);
      resizeObserver.disconnect();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [movies]);

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0a0f]">
      <div ref={containerRef} className="absolute inset-0" style={{ touchAction: "none" }} />

      {/* Exit button */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="glass-btn absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-fluid hover:text-foreground active:scale-95 cursor-pointer"
      >
        <X className="h-5 w-5" />
      </button>

      {/* Hovered title badge */}
      {hoveredTitle && (
        <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2">
          <div className="glass-btn max-w-[80vw] truncate rounded-full px-5 py-2 text-sm text-foreground">
            {hoveredTitle}
          </div>
        </div>
      )}
    </div>
  );
}
