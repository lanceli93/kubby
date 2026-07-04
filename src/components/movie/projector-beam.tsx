"use client";

import { useRef, useEffect } from "react";
import {
  Scene,
  OrthographicCamera,
  WebGLRenderer,
  PlaneGeometry,
  BufferGeometry,
  BufferAttribute,
  ShaderMaterial,
  Points,
  Mesh,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Color,
} from "three";

/**
 * ProjectorBeam — a subtle cinema "projection booth" ambience for the movie
 * detail hero. Renders a transparent-background WebGL2 canvas that overlays the
 * fanart with a soft volumetric light cone (entering from the top-right, angled
 * down-left), dust motes drifting inside the beam, and a faint film grain.
 *
 * This is AMBIENCE, not a spotlight: the whole thing is additively blended at a
 * low intensity so it never obscures the title text or the glass panel. It is
 * meant to be mounted absolutely inside the hero, above the fanart but below the
 * gradients/content row (pointer-events-none).
 *
 * Follows poster-wall.tsx idioms: renderer setup + disposal, pixelRatio cap,
 * a single rAF loop that pauses when off-screen or the tab is hidden, and a
 * ResizeObserver on the container.
 *
 * Gating: renders nothing when the user prefers reduced motion, when WebGL2 is
 * unavailable, or below the `md` breakpoint (matched against the same 768px the
 * hero uses). The gate is checked at mount inside the effect; if the environment
 * doesn't qualify, the canvas is simply never created.
 */

interface ProjectorBeamProps {
  className?: string;
}

// Beam geometry in normalized-ish clip space (the ortho camera spans -1..1 on
// both axes, aspect-corrected in the shader by feeding uResolution).
const DUST_COUNT = 160;

// Vertex/fragment for the volumetric beam plane. The beam is a soft cone: bright
// near the top-right entry point, fanning out and fading toward the bottom-left.
// Falloff is computed along + across the beam axis, with a slow lamp flicker.
const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BEAM_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uDim;
  uniform vec3 uWarm;
  uniform vec3 uEdge;

  void main() {
    // Beam enters from the top-right corner (uv ~ (1, 1)) and points toward the
    // bottom-left. Axis is the unit vector along the beam direction.
    vec2 origin = vec2(0.92, 1.08);
    vec2 dir = normalize(vec2(-0.62, -1.0));
    vec2 p = vUv - origin;

    // Distance along the beam (0 at origin, grows down-left) and lateral offset.
    float along = dot(p, dir);
    vec2 axisPoint = dir * along;
    float across = length(p - axisPoint);

    // Beam widens as it travels: half-width grows with distance.
    float halfWidth = 0.06 + along * 0.42;
    // Soft lateral falloff (cone edges).
    float lateral = 1.0 - smoothstep(0.0, halfWidth, across);
    lateral *= lateral;

    // Longitudinal falloff: fade in just past the lamp, fade out down the throw.
    float lengthwise = smoothstep(0.0, 0.12, along) * (1.0 - smoothstep(0.55, 1.35, along));

    // Slow lamp flicker, ~2-4% amplitude.
    float flicker = 1.0 + 0.03 * sin(uTime * 5.3) + 0.015 * sin(uTime * 13.1);

    float beam = lateral * lengthwise * flicker;

    // Warm-white core, faint indigo toward the cone edges.
    vec3 color = mix(uEdge, uWarm, clamp(lateral, 0.0, 1.0));

    // A light beam over bright fanart is imperceptible without contrast — a
    // real projector beam reads because the room around it is dark. Dim the
    // scene outside the cone and let the beam punch through: premultiplied
    // output means alpha attenuates the page while rgb adds light on top.
    float dim = clamp(uDim * (1.0 - beam * 2.5), 0.0, uDim);

    float light = beam * uIntensity;
    gl_FragColor = vec4(color * light, light + dim);
  }
`;

// Dust motes: points confined to the beam volume, brighter deeper in the beam.
// Each mote carries a phase + drift so they rise/sway slowly. Alpha is shaped
// by the same beam falloff logic so motes fade at the cone edges.
const DUST_VERT = /* glsl */ `
  precision mediump float;
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform vec2 uResolution;
  varying float vAlpha;

  void main() {
    // position.xy is the mote's base location in -1..1 space.
    vec2 pos = position.xy;
    // Slow upward drift + gentle lateral sway, wrapped by phase.
    float t = uTime * 0.04 + aPhase;
    pos.y += fract(t) * 0.9 - 0.2;          // rise, then wrap
    pos.x += sin(uTime * 0.15 + aPhase * 6.2831) * 0.03;

    // Map to the beam falloff to fade motes outside the cone.
    vec2 uv = pos * 0.5 + 0.5;
    vec2 origin = vec2(0.92, 1.08);
    vec2 dir = normalize(vec2(-0.62, -1.0));
    vec2 p = uv - origin;
    float along = dot(p, dir);
    vec2 axisPoint = dir * along;
    float across = length(p - axisPoint);
    float halfWidth = 0.06 + along * 0.42;
    float lateral = 1.0 - smoothstep(0.0, halfWidth, across);
    float lengthwise = smoothstep(0.0, 0.12, along) * (1.0 - smoothstep(0.55, 1.35, along));
    vAlpha = lateral * lengthwise;

    gl_Position = vec4(pos, 0.0, 1.0);
    // Twinkle the size a touch for life.
    gl_PointSize = aSize * (0.8 + 0.2 * sin(uTime * 2.0 + aPhase * 6.2831));
  }
`;

const DUST_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uIntensity;
  varying float vAlpha;
  void main() {
    // Round, soft-edged point sprite.
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float mote = smoothstep(0.5, 0.0, d);
    gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * mote * vAlpha * uIntensity, mote * vAlpha * uIntensity);
  }
`;

// Film grain: cheap animated hash over a fullscreen quad, very low opacity.
const GRAIN_FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uIntensity;
  void main() {
    float n = fract(sin(dot(vUv * uTime, vec2(12.9898, 78.233))) * 43758.5453);
    // Center around 0 so grain both lightens and darkens, additive-safe here by
    // keeping it a subtle positive-only speckle.
    gl_FragColor = vec4(vec3(n) * uIntensity, n * uIntensity);
  }
`;

export function ProjectorBeam({ className }: ProjectorBeamProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // ---- Gating: reduced motion, WebGL2, md+ viewport ----
    if (typeof window === "undefined" || !window.matchMedia) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;

    // Probe WebGL2 before letting the renderer create its own context.
    const probe = document.createElement("canvas");
    const gl2 = probe.getContext("webgl2");
    if (!gl2) return;

    const scene = new Scene();
    // Ortho camera spanning the full quad; geometry is authored directly in
    // clip space so no projection math is needed.
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // premultipliedAlpha: true + ONE/ONE blending below = the canvas composites
    // over the page as `out = canvasRGB + page*(1-canvasA)` — true added light.
    // (Straight-alpha compositing would multiply the beam by its own low alpha
    // and render it invisible over bright fanart.)
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: true });
    } catch {
      return;
    }
    renderer.setClearColor(0x000000, 0); // transparent background
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    const width = container.clientWidth || 1;
    const height = container.clientHeight || 1;
    renderer.setSize(width, height);

    const canvas = renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    container.appendChild(canvas);

    // All three shaders output PREMULTIPLIED color (rgb = color·v, a = v), so
    // in-scene stacking must use ONE / ONE_MINUS_SRC_ALPHA — three's built-in
    // AdditiveBlending (SRC_ALPHA, ONE) would multiply by alpha a second time,
    // squaring the already-low intensity into invisibility.
    const premultipliedBlend = {
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
    } as const;

    // ---- Beam plane ----
    const beamGeo = new PlaneGeometry(2, 2);
    const beamMat = new ShaderMaterial({
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      ...premultipliedBlend,
      uniforms: {
        uTime: { value: 0 },
        // Overall brightness contribution — low; this is ambience.
        uIntensity: { value: 0.34 },
        // Darkening applied to the fanart OUTSIDE the beam (the contrast that
        // makes the cone legible over bright imagery).
        uDim: { value: 0.28 },
        uWarm: { value: new Color(0xfff4e0) },
        uEdge: { value: new Color(0x6366f1) }, // theme --primary indigo
      },
    });
    const beamMesh = new Mesh(beamGeo, beamMat);
    scene.add(beamMesh);

    // ---- Dust motes (inside the beam volume) ----
    const dustPositions = new Float32Array(DUST_COUNT * 3);
    const dustSizes = new Float32Array(DUST_COUNT);
    const dustPhases = new Float32Array(DUST_COUNT);
    // Seed motes roughly along the beam axis so most start inside the cone.
    for (let i = 0; i < DUST_COUNT; i++) {
      // Bias x toward the right (beam origin side) and spread across the throw.
      const t = Math.random();
      const x = 0.85 - t * 1.7 + (Math.random() - 0.5) * 0.5;
      const y = 1.0 - t * 1.9 + (Math.random() - 0.5) * 0.3;
      dustPositions[i * 3] = x;
      dustPositions[i * 3 + 1] = y;
      dustPositions[i * 3 + 2] = 0;
      dustSizes[i] = 1 + Math.random() * 2; // 1-3px (scaled by pixelRatio)
      dustPhases[i] = Math.random();
    }
    const dustGeo = new BufferGeometry();
    dustGeo.setAttribute("position", new BufferAttribute(dustPositions, 3));
    dustGeo.setAttribute("aSize", new BufferAttribute(dustSizes, 1));
    dustGeo.setAttribute("aPhase", new BufferAttribute(dustPhases, 1));
    const dustMat = new ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      ...premultipliedBlend,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.9 },
        uResolution: { value: [width, height] },
      },
    });
    const dust = new Points(dustGeo, dustMat);
    scene.add(dust);

    // ---- Film grain (very subtle fullscreen speckle) ----
    const grainGeo = new PlaneGeometry(2, 2);
    const grainMat = new ShaderMaterial({
      vertexShader: BEAM_VERT, // reuse: passes vUv through in clip space
      fragmentShader: GRAIN_FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      ...premultipliedBlend,
      uniforms: {
        uTime: { value: 0 },
        uIntensity: { value: 0.05 },
      },
    });
    const grainMesh = new Mesh(grainGeo, grainMat);
    scene.add(grainMesh);

    // ---- Render loop, paused off-screen / when tab hidden ----
    let rafId = 0;
    let running = false;
    let inView = true;
    const start = performance.now();

    const frame = () => {
      const t = (performance.now() - start) / 1000;
      beamMat.uniforms.uTime.value = t;
      dustMat.uniforms.uTime.value = t;
      grainMat.uniforms.uTime.value = t;
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(frame);
    };

    const startLoop = () => {
      if (running || document.hidden || !inView) return;
      running = true;
      rafId = requestAnimationFrame(frame);
    };
    const stopLoop = () => {
      running = false;
      cancelAnimationFrame(rafId);
    };

    // Pause when the hero scrolls out of the viewport.
    const io = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? false;
        if (inView) startLoop();
        else stopLoop();
      },
      { threshold: 0 },
    );
    io.observe(container);

    // Pause when the tab is hidden.
    const onVisibility = () => {
      if (document.hidden) stopLoop();
      else startLoop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // ---- Resize ----
    const onResize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h);
      dustMat.uniforms.uResolution.value = [w, h];
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    startLoop();

    return () => {
      stopLoop();
      io.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      beamGeo.dispose();
      beamMat.dispose();
      dustGeo.dispose();
      dustMat.dispose();
      grainGeo.dispose();
      grainMat.dispose();
      renderer.dispose();
      if (container.contains(canvas)) container.removeChild(canvas);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-0 ${className ?? ""}`}
    />
  );
}
