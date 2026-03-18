# Kubby VR/360 全景视频播放方案

> 为 Kubby 影音管理系统添加 VR/360 全景视频识别与沉浸式播放能力。

---

## 1. 技术原理

### 1.1 Equirectangular 投影

绝大多数 360 视频采用 **Equirectangular（等距圆柱投影）** 编码——将球面展开为 2:1 宽高比的矩形帧（如 3840×1920、7680×3840）。播放时需将这张"世界地图"重新贴回球面，还原全景视角。

```
拍摄 → 拼接 → Equirectangular 帧 → WebGL 球体贴图 → 用户自由旋转视角
```

### 1.2 WebGL 球体贴图渲染

核心渲染流程：

1. 创建一个 **反转法线的球体几何体**（`SphereGeometry` + `side: BackSide`），相机置于球心
2. 将视频帧作为 `VideoTexture` 贴到球体内表面
3. 通过 `PerspectiveCamera` 模拟人眼，用户拖拽/陀螺仪控制相机旋转
4. 每帧 `requestAnimationFrame` 更新纹理 + 渲染

```typescript
// 核心伪代码
const geometry = new THREE.SphereGeometry(500, 60, 40);
geometry.scale(-1, 1, 1); // 翻转法线，从内部观看

const texture = new THREE.VideoTexture(videoElement);
const material = new THREE.MeshBasicMaterial({ map: texture });
const sphere = new THREE.Mesh(geometry, material);

scene.add(sphere);
camera.position.set(0, 0, 0); // 相机在球心
```

### 1.3 180° 与 VR 立体视频

| 类型 | 宽高比 | 投影 | 渲染方式 |
|------|--------|------|---------|
| 360° Mono | 2:1 | Equirectangular | 完整球体 |
| 180° Mono | 1:1 | Half Equirectangular | 半球 |
| 360° Stereo (SBS) | 4:1 | Equirectangular × 2 | 左右眼各一个球体 |
| 360° Stereo (TB) | 1:1 | Equirectangular × 2 | 上下半帧分别映射 |

> MVP 阶段仅支持 **360° Mono**，后续可扩展 180°/SBS/TB。

---

## 2. 检测方案

### 2.1 FFprobe 元数据检测

360 视频通常在容器级别携带 spherical metadata（由 Spatial Media Metadata Injector 或相机固件写入）：

```bash
ffprobe -v quiet -print_format json -show_streams -show_format input.mp4
```

关键字段：

```json
{
  "streams": [{
    "side_data_list": [{
      "side_data_type": "Spherical Mapping",
      "projection": "equirectangular"
    }]
  }],
  "format": {
    "tags": {
      "spherical-video": "true",
      "stitching_software": "Spatial Media Metadata Injector"
    }
  }
}
```

检测逻辑（优先级从高到低）：

1. `streams[].side_data_list[]` 中存在 `"Spherical Mapping"` → 确认 360
2. `format.tags` 中 `spherical-video` / `is_spherical` 为 `"true"` → 确认 360
3. 视频宽高比接近 2:1 且分辨率 ≥ 3840 → 标记为疑似（可在 UI 提供手动切换）

### 2.2 扫描器集成

在 `src/lib/scanner/index.ts` 扫描流程中，ffprobe 已用于提取 codec/resolution 等信息。扩展检测逻辑：

```typescript
// scanner 中提取 spherical 信息
function detectSpherical(probeData: FfprobeData): {
  isSpherical: boolean;
  projection: string | null;   // "equirectangular" | "cubemap" | null
  stereoMode: string | null;   // "mono" | "sbs" | "tb" | null
} {
  // 检查 side_data_list
  for (const stream of probeData.streams) {
    const sphericalData = stream.side_data_list?.find(
      (sd) => sd.side_data_type === "Spherical Mapping"
    );
    if (sphericalData) {
      return {
        isSpherical: true,
        projection: sphericalData.projection ?? "equirectangular",
        stereoMode: "mono",
      };
    }
  }
  // 检查 format tags
  const tags = probeData.format?.tags ?? {};
  if (tags["spherical-video"] === "true" || tags["is_spherical"] === "true") {
    return { isSpherical: true, projection: "equirectangular", stereoMode: "mono" };
  }
  return { isSpherical: false, projection: null, stereoMode: null };
}
```

### 2.3 数据库字段扩展

在 `movies` 表增加字段（或复用 `media_streams` 表扩展）：

```sql
-- 方案 A: movies 表直接加列（简单）
ALTER TABLE movies ADD COLUMN is_spherical INTEGER DEFAULT 0;
ALTER TABLE movies ADD COLUMN spherical_projection TEXT;  -- "equirectangular" | "cubemap"
ALTER TABLE movies ADD COLUMN spherical_stereo_mode TEXT; -- "mono" | "sbs" | "tb"
```

Drizzle schema 扩展：

```typescript
// src/lib/db/schema.ts — movies 表
is_spherical: integer("is_spherical").default(0),
spherical_projection: text("spherical_projection"),  // "equirectangular"
spherical_stereo_mode: text("spherical_stereo_mode"), // "mono"
```

### 2.4 手动标记

部分 360 视频缺少元数据。在电影详情页的 MetadataEditor 中增加 "360° Video" 开关，允许用户手动标记/取消标记。

---

## 3. 前端方案

### 3.1 组件架构

```
/movies/[id]/play/page.tsx
  │
  ├── is_spherical === false → 现有 <video> 播放器（不变）
  │
  └── is_spherical === true  → <Panorama360Player>
        ├── Three.js Scene (球体 + 相机)
        ├── <video> 隐藏元素（作为 VideoTexture 源）
        │   ├── Direct Play: video.src = stream URL
        │   └── HLS Play: hls.js attachMedia(video)
        └── 播放控制 Overlay（复用现有控件样式）
```

### 3.2 核心组件实现

```typescript
// src/components/player/panorama-360-player.tsx
"use client";

import { useRef, useEffect, useCallback } from "react";
import * as THREE from "three";

interface Panorama360PlayerProps {
  videoSrc: string;
  hlsSessionUrl?: string; // HLS 模式下的 playlist URL
  onTimeUpdate?: (time: number) => void;
  onEnded?: () => void;
}

export function Panorama360Player({
  videoSrc,
  hlsSessionUrl,
  onTimeUpdate,
  onEnded,
}: Panorama360PlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const video = videoRef.current;
    if (!container || !video) return;

    // --- Three.js 初始化 ---
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75, container.clientWidth / container.clientHeight, 0.1, 1000
    );
    camera.position.set(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // --- 球体 ---
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    geometry.scale(-1, 1, 1);

    const texture = new THREE.VideoTexture(video);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.MeshBasicMaterial({ map: texture });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);

    // --- 渲染循环 ---
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // --- 响应式 ---
    const onResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      texture.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <video
        ref={videoRef}
        src={videoSrc}
        crossOrigin="anonymous"
        playsInline
        className="hidden"
      />
      {/* 控制 Overlay 复用现有样式 */}
    </div>
  );
}
```

### 3.3 HLS 集成

360 视频文件通常较大（4K+），HLS 转码需求更强。复用现有 HLS 流程：

```typescript
// 在 Panorama360Player 内部
useEffect(() => {
  const video = videoRef.current;
  if (!video || !hlsSessionUrl) return;

  if (video.canPlayType("application/vnd.apple.mpegurl")) {
    // Safari 原生 HLS
    video.src = hlsSessionUrl;
  } else {
    const Hls = await import("hls.js");
    if (Hls.default.isSupported()) {
      const hls = new Hls.default();
      hls.loadSource(hlsSessionUrl);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
  }
}, [hlsSessionUrl]);
```

转码注意：360 视频转码时需保持 2:1 宽高比，`maxWidth` 应适配（如 3840→1920 缩放仍保持 2:1）。

---

## 4. 交互方案

### 4.1 鼠标拖拽（桌面）

```typescript
function useMouseDrag(
  containerRef: React.RefObject<HTMLDivElement>,
  cameraRef: React.RefObject<THREE.PerspectiveCamera>
) {
  const isDragging = useRef(false);
  const prevMouse = useRef({ x: 0, y: 0 });
  const spherical = useRef({ lon: 0, lat: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      isDragging.current = true;
      prevMouse.current = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - prevMouse.current.x;
      const dy = e.clientY - prevMouse.current.y;
      spherical.current.lon -= dx * 0.15;
      spherical.current.lat = Math.max(-85, Math.min(85,
        spherical.current.lat + dy * 0.15
      ));
      prevMouse.current = { x: e.clientX, y: e.clientY };
      updateCamera(cameraRef.current!, spherical.current);
    };

    const onPointerUp = () => { isDragging.current = false; };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);

    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
    };
  }, [containerRef, cameraRef]);

  return spherical;
}

function updateCamera(
  camera: THREE.PerspectiveCamera,
  { lon, lat }: { lon: number; lat: number }
) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lon);
  camera.lookAt(
    500 * Math.sin(phi) * Math.cos(theta),
    500 * Math.cos(phi),
    500 * Math.sin(phi) * Math.sin(theta)
  );
}
```

### 4.2 触摸手势（移动端）

Pointer Events API 已统一处理触摸和鼠标。额外支持：

- **双指缩放（pinch-to-zoom）**：调整 `camera.fov`（范围 30°–120°）
- **惯性滑动**：松手后按速度衰减继续旋转

```typescript
// FOV 缩放
const onWheel = (e: WheelEvent) => {
  e.preventDefault();
  const camera = cameraRef.current!;
  camera.fov = Math.max(30, Math.min(120, camera.fov + e.deltaY * 0.05));
  camera.updateProjectionMatrix();
};
```

### 4.3 陀螺仪（移动设备）

使用 `DeviceOrientationEvent` 实现头部追踪，需在 iOS 13+ 请求权限：

```typescript
function useGyroscope(
  cameraRef: React.RefObject<THREE.PerspectiveCamera>,
  enabled: boolean
) {
  useEffect(() => {
    if (!enabled) return;

    const requestPermission = async () => {
      // iOS 13+ 需要用户手势触发权限请求
      if (typeof (DeviceOrientationEvent as any).requestPermission === "function") {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission !== "granted") return false;
      }
      return true;
    };

    let granted = false;
    requestPermission().then((ok) => { granted = ok; });

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (!granted || !cameraRef.current) return;
      const { alpha, beta, gamma } = e;
      if (alpha === null || beta === null || gamma === null) return;

      // 将设备朝向映射到相机旋转
      const euler = new THREE.Euler(
        THREE.MathUtils.degToRad(beta),
        THREE.MathUtils.degToRad(alpha),
        -THREE.MathUtils.degToRad(gamma),
        "YXZ"
      );
      cameraRef.current.quaternion.setFromEuler(euler);
    };

    window.addEventListener("deviceorientation", onOrientation);
    return () => window.removeEventListener("deviceorientation", onOrientation);
  }, [cameraRef, enabled]);
}
```

### 4.4 交互优先级

| 环境 | 主交互 | 辅助 |
|------|--------|------|
| 桌面浏览器 | 鼠标拖拽 | 滚轮缩放 FOV |
| 移动浏览器 | 触摸拖拽 + 双指缩放 | 陀螺仪（用户手动开启） |
| VR 头显 | WebXR（未来） | — |

陀螺仪默认关闭，通过 UI 按钮手动启用（避免在桌面/平板误触发权限弹窗）。

---

## 5. 注意事项

### 5.1 CORS

`VideoTexture` 要求视频元素设置 `crossOrigin="anonymous"`，服务端需返回正确的 CORS 头。Kubby 的 API Routes 和视频都在同源，**不存在跨域问题**。但若未来支持远程 URL 播放，需确保：

```typescript
// next.config.ts 中已有 API Routes 处理
// 视频流端点返回头部已包含 Content-Type，无需额外 CORS 配置
// 远程源需要: Access-Control-Allow-Origin: *
```

### 5.2 iOS 限制

| 限制 | 影响 | 解决方案 |
|------|------|---------|
| `autoplay` 静音限制 | 视频需用户手势才能播放 | 展示"点击播放"按钮 |
| `playsInline` 必须 | 否则进入全屏原生播放器 | 已设置 `playsInline` 属性 |
| WebGL 纹理尺寸限制 | iPhone 最大 4096×4096 | 4K 360 视频（3840×1920）刚好在限制内；8K 需转码降分辨率 |
| `DeviceOrientationEvent` 权限 | iOS 13+ 需用户授权 | 按钮触发 `requestPermission()` |
| Safari WebGL 性能 | 低端设备帧率不足 | 降低球体细分数 + 限制 `pixelRatio` |

### 5.3 性能优化

```
目标：4K 60fps 流畅旋转，低端设备 30fps 降级
```

| 策略 | 说明 |
|------|------|
| `pixelRatio` 限制 | `Math.min(window.devicePixelRatio, 2)` 避免高 DPI 设备渲染 4x 像素 |
| 球体细分控制 | 桌面 `SphereGeometry(500, 60, 40)`，移动端降为 `(500, 32, 24)` |
| `VideoTexture` 更新频率 | Three.js 自动按 `requestAnimationFrame` 更新，无需手动 `needsUpdate` |
| 纹理格式 | 使用 `THREE.SRGBColorSpace` 避免 gamma 计算开销 |
| 内存释放 | 组件卸载时 `dispose()` 所有 Three.js 对象 |
| 渲染暂停 | 视频暂停时停止 `requestAnimationFrame` 循环 |

### 5.4 SSR 兼容

Three.js 依赖 `window`/`document`/`WebGLRenderingContext`，在 Next.js App Router 中需：

```typescript
// 方案：dynamic import + "use client"
import dynamic from "next/dynamic";

const Panorama360Player = dynamic(
  () => import("@/components/player/panorama-360-player").then(
    (mod) => mod.Panorama360Player
  ),
  { ssr: false }
);
```

Three.js 本身也应 dynamic import 避免服务端报错：

```typescript
// 组件内部
useEffect(() => {
  let THREE: typeof import("three");
  import("three").then((mod) => {
    THREE = mod;
    // 初始化场景...
  });
}, []);
```

### 5.5 包体积控制

| 依赖 | 体积 (gzip) | 策略 |
|------|------------|------|
| `three` | ~150 KB | Tree-shakeable；仅 import 用到的类 |
| `hls.js` | ~70 KB | 已在项目中使用 |
| 总增量 | ~150 KB | 仅 360 播放页加载（dynamic import + code splitting） |

```typescript
// 精确导入减少 bundle
import {
  Scene, PerspectiveCamera, WebGLRenderer,
  SphereGeometry, MeshBasicMaterial, Mesh,
  VideoTexture, MathUtils, Euler,
} from "three";
```

> 注意：Three.js 的 tree-shaking 效果取决于打包器配置。Next.js + Webpack 5 默认支持，但实际减少幅度有限（核心模块相互依赖）。150 KB 是保守估计。

---

## 6. 开源库对比

### 6.1 纯 Three.js（推荐）

| 维度 | 评价 |
|------|------|
| 体积 | ~150 KB gzip，可 tree-shake |
| 灵活性 | 完全可控，自定义相机/交互/特效 |
| 维护状态 | Three.js 极其活跃，月更新 |
| 学习成本 | 中等（需理解 3D 基础） |
| HLS 集成 | 自然集成（`<video>` → `VideoTexture`） |
| React 生态 | 可配合 `@react-three/fiber` 简化 |

**推荐理由**：Kubby 只需球体贴图 + 相机控制，Three.js 的核心 API 即可满足，无需引入专用 360 库的额外抽象层。

### 6.2 @react-three/fiber + drei

| 维度 | 评价 |
|------|------|
| 体积 | +40 KB（fiber）+ 按需（drei） |
| 优点 | 声明式 JSX 写 Three.js，React 生态完美整合 |
| 缺点 | 额外抽象层，调试链更长 |
| 适用 | 复杂 3D 场景多组件协作时收益更大 |

```tsx
// 示例：react-three/fiber 写法
<Canvas camera={{ fov: 75, position: [0, 0, 0] }}>
  <mesh>
    <sphereGeometry args={[500, 60, 40]} />
    <meshBasicMaterial side={THREE.BackSide}>
      <videoTexture attach="map" args={[videoElement]} />
    </meshBasicMaterial>
  </mesh>
</Canvas>
```

### 6.3 Video.js + videojs-vr

| 维度 | 评价 |
|------|------|
| 体积 | Video.js ~200 KB + videojs-vr ~50 KB |
| 优点 | 开箱即用，自带 UI 控件 |
| 缺点 | 与现有自定义播放器冲突；Video.js 过重；videojs-vr 维护不活跃 |
| 适用 | 全新项目快速原型 |

**不推荐**：Kubby 已有完整自定义播放器，引入 Video.js 会造成组件体系冲突。

### 6.4 A-Frame

| 维度 | 评价 |
|------|------|
| 体积 | ~300 KB（含 Three.js） |
| 优点 | HTML 标签式 3D 开发，WebXR 内置支持 |
| 缺点 | 体积大，抽象过重，React 集成不佳 |
| 适用 | VR 社交/展厅等重 WebXR 场景 |

**不推荐**：过于重量级，定位偏向 WebXR 应用开发而非视频播放。

### 6.5 总结

| 库 | 体积 | 推荐度 | 备注 |
|----|------|--------|------|
| **Three.js（纯）** | ~150 KB | ★★★★★ | 最轻量，完全可控 |
| @react-three/fiber | ~190 KB | ★★★★ | 声明式开发，中大型 3D 场景更优 |
| Video.js + vr | ~250 KB | ★★ | 与现有播放器冲突 |
| A-Frame | ~300 KB | ★ | 过重，场景不匹配 |

**最终选择：纯 Three.js**（如果后续 3D 需求增长，再评估迁移到 react-three/fiber）。

---

## 7. 分步实施计划

### Phase 1: 检测与数据层

- [ ] `movies` 表增加 `is_spherical` / `spherical_projection` / `spherical_stereo_mode` 列
- [ ] Drizzle schema 更新 + 生成迁移
- [ ] Scanner 扫描时调用 `detectSpherical()` 写入 DB
- [ ] `/api/movies/[id]` 返回 spherical 字段
- [ ] MetadataEditor 中增加 "360° Video" 手动开关

### Phase 2: 基础 360 播放器

- [ ] 创建 `Panorama360Player` 组件（Three.js + SphereGeometry + VideoTexture）
- [ ] `play/page.tsx` 根据 `is_spherical` 条件渲染 360 播放器或普通播放器
- [ ] 实现鼠标拖拽旋转视角
- [ ] 实现滚轮 FOV 缩放
- [ ] SSR 兼容处理（dynamic import）

### Phase 3: HLS 与播放控制集成

- [ ] 360 播放器内集成 hls.js（复用现有 HLS 逻辑）
- [ ] 复用现有播放控制栏（进度条、播放/暂停、音量、倍速、全屏）
- [ ] 进度自动保存 + 书签系统适配
- [ ] 转码分辨率选择器适配（360 视频的 maxWidth 默认更高）

### Phase 4: 移动端与陀螺仪

- [ ] 触摸拖拽（Pointer Events，已在 Phase 2 基础覆盖）
- [ ] 双指缩放 FOV
- [ ] 陀螺仪控制（`DeviceOrientationEvent` + iOS 权限请求）
- [ ] 陀螺仪开关按钮（默认关闭）
- [ ] 移动端性能降级（降低球体细分、限制 pixelRatio）

### Phase 5: 体验优化

- [ ] 惯性滑动动画
- [ ] 初始视角指示器（"拖拽环顾四周"提示）
- [ ] 电影详情页 360 标签/图标展示
- [ ] 电影列表支持按 360 属性筛选

### 未来扩展

- 180° 视频支持（半球渲染）
- SBS/TB 立体 3D 模式
- WebXR 头显支持（Quest/Vision Pro）
- Cubemap 投影格式支持
