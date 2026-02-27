# Kubby 视频串流/转码功能设计文档

> **状态**: Phase 1 设计稿（暂未实现）
> **创建日期**: 2026-02-21
> **优先级**: 低 — Kubby 现有的 HTTP Range Requests 对 MP4(H.264+AAC) 已能满足跨设备播放需求

---

## 1. 背景与动机

### 为什么需要串流/转码

- **格式兼容性**: 并非所有浏览器/设备都支持所有视频编码格式（如 HEVC、AV1、DTS 音频等）
- **带宽适配**: 局域网内不同设备的网络带宽差异大（WiFi vs 有线），需要自适应码率
- **实时播放**: MKV 等容器格式可能无法被浏览器直接播放，需要转封装或转码

### 为什么当前不急于实现

- Kubby 视频库以 MP4(H.264+AAC) 为主，浏览器原生支持直接播放
- 现有 HTTP Range Requests 已支持拖进度条、断点续传
- 串流功能开发量大，投入产出比暂时不高

---

## 2. 整体架构

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Browser   │────▶│  Next.js API     │────▶│  FFmpeg     │
│   (HLS.js)  │◀────│  /api/stream/*   │◀────│  Process    │
└─────────────┘     └──────────────────┘     └─────────────┘
                           │                        │
                           ▼                        ▼
                    ┌──────────────┐         ┌──────────────┐
                    │ Transcode    │         │ HLS Segment  │
                    │ Manager      │         │ Cache (.ts)  │
                    └──────────────┘         └──────────────┘
```

### 核心组件

| 组件 | 职责 |
|------|------|
| **PlaybackDecider** | 根据文件格式和客户端能力决定直接播放还是转码 |
| **TranscodeManager** | 管理 FFmpeg 进程的生命周期（启动、监控、清理） |
| **HLS Segment Cache** | 存放转码生成的 .m3u8 和 .ts 分片文件 |
| **Stream API Routes** | 提供 HLS playlist 和分片的 HTTP 端点 |
| **前端 HLS Player** | 基于 HLS.js 的自适应播放器 |

---

## 3. 播放决策逻辑 (PlaybackDecider)

```typescript
// src/lib/playback-decider.ts

interface PlaybackDecision {
  mode: 'direct' | 'remux' | 'transcode';
  reason: string;
}

function decidePlayback(
  fileInfo: MediaFileInfo,
  clientCapabilities: ClientCapabilities
): PlaybackDecision {
  const { container, videoCodec, audioCodec } = fileInfo;

  // Case 1: MP4 + H.264 + AAC → 直接播放
  if (container === 'mp4' && videoCodec === 'h264' && audioCodec === 'aac') {
    return { mode: 'direct', reason: 'Browser native support' };
  }

  // Case 2: MKV + H.264 + AAC → 仅转封装（不重新编码）
  if (videoCodec === 'h264' && audioCodec === 'aac' && container !== 'mp4') {
    return { mode: 'remux', reason: `Container ${container} not natively supported, remux to HLS` };
  }

  // Case 3: 需要视频或音频转码
  return { mode: 'transcode', reason: `Codec ${videoCodec}/${audioCodec} needs transcoding` };
}
```

### 决策矩阵

| 容器 | 视频编码 | 音频编码 | 决策 | FFmpeg 操作 |
|------|----------|----------|------|-------------|
| MP4 | H.264 | AAC | direct | 无 |
| MKV | H.264 | AAC | remux | `-c copy` 转封装 |
| MKV | H.264 | DTS/AC3 | transcode (audio) | `-c:v copy -c:a aac` |
| MKV | HEVC | AAC | transcode (video) | `-c:v libx264 -c:a copy` |
| AVI | MPEG-4 | MP3 | transcode (full) | `-c:v libx264 -c:a aac` |

---

## 4. FFmpeg 命令模板

### 4.1 转封装 (Remux to HLS)

```bash
ffmpeg -i input.mkv \
  -c:v copy -c:a copy \
  -f hls \
  -hls_time 6 \
  -hls_list_size 0 \
  -hls_segment_filename '/tmp/kubby-transcode/{session_id}/segment_%04d.ts' \
  -start_number 0 \
  /tmp/kubby-transcode/{session_id}/playlist.m3u8
```

### 4.2 音频转码

```bash
ffmpeg -i input.mkv \
  -c:v copy -c:a aac -b:a 192k \
  -f hls \
  -hls_time 6 \
  -hls_list_size 0 \
  -hls_segment_filename '/tmp/kubby-transcode/{session_id}/segment_%04d.ts' \
  /tmp/kubby-transcode/{session_id}/playlist.m3u8
```

### 4.3 完整转码

```bash
ffmpeg -i input.mkv \
  -c:v libx264 -preset veryfast -crf 23 -maxrate 4M -bufsize 8M \
  -c:a aac -b:a 192k \
  -f hls \
  -hls_time 6 \
  -hls_list_size 0 \
  -hls_segment_filename '/tmp/kubby-transcode/{session_id}/segment_%04d.ts' \
  /tmp/kubby-transcode/{session_id}/playlist.m3u8
```

### 4.4 从指定时间点开始转码（支持拖进度条）

```bash
ffmpeg -ss 00:30:00 -i input.mkv \
  -c:v libx264 -preset veryfast -crf 23 \
  -c:a aac -b:a 192k \
  -f hls \
  -hls_time 6 \
  -hls_list_size 0 \
  -hls_segment_filename '/tmp/kubby-transcode/{session_id}/segment_%04d.ts' \
  /tmp/kubby-transcode/{session_id}/playlist.m3u8
```

---

## 5. TranscodeManager

```typescript
// src/lib/transcode-manager.ts

interface TranscodeSession {
  id: string;
  movieId: number;
  ffmpegProcess: ChildProcess;
  outputDir: string;
  startedAt: Date;
  lastAccessedAt: Date;
  mode: 'remux' | 'transcode';
}

class TranscodeManager {
  private sessions: Map<string, TranscodeSession> = new Map();
  private cacheDir = '/tmp/kubby-transcode';

  /** 启动新的转码会话 */
  async startSession(movieId: number, filePath: string, decision: PlaybackDecision, seekTo?: number): Promise<string>;

  /** 获取已有会话（更新 lastAccessedAt） */
  getSession(sessionId: string): TranscodeSession | undefined;

  /** 停止并清理会话 */
  async stopSession(sessionId: string): Promise<void>;

  /** 定期清理不活跃的会话（超过 10 分钟无访问） */
  async cleanupStaleSessions(): Promise<void>;

  /** 服务关闭时清理所有会话 */
  async shutdownAll(): Promise<void>;
}
```

### 生命周期管理

- **启动**: 用户请求播放时，PlaybackDecider 判定需要转码 → 创建 session → 启动 FFmpeg
- **存活**: 前端每次请求 .ts 分片时刷新 `lastAccessedAt`
- **清理**: 定时任务每 60 秒扫描，清理 10 分钟内无访问的 session
- **关闭**: 进程退出时 `shutdownAll()` 杀掉所有 FFmpeg 子进程并删除临时文件

---

## 6. API 路由设计

### 6.1 播放决策

```
GET /api/stream/{movieId}/decide
→ { mode: 'direct' | 'remux' | 'transcode', directUrl?: string, hlsUrl?: string }
```

前端先调用此接口决定播放方式。如果是 `direct`，返回原始文件的 Range Request URL；否则返回 HLS playlist URL。

### 6.2 HLS Playlist

```
GET /api/stream/{movieId}/playlist.m3u8?session={sessionId}
→ Content-Type: application/vnd.apple.mpegurl
```

返回 FFmpeg 生成的 `.m3u8` 文件内容。如果 session 不存在则自动创建。

### 6.3 HLS 分片

```
GET /api/stream/{movieId}/segment/{segmentName}.ts?session={sessionId}
→ Content-Type: video/mp2t
```

返回对应的 `.ts` 分片文件，同时刷新 session 活跃时间。

### 6.4 停止串流

```
DELETE /api/stream/{movieId}/session/{sessionId}
```

用户关闭播放器时主动停止转码、释放资源。

---

## 7. 前端改造

### 7.1 安装 HLS.js

```bash
pnpm add hls.js
```

### 7.2 播放器组件改造

```typescript
// 伪代码示意
function VideoPlayer({ movieId }: { movieId: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    async function init() {
      // 1. 请求播放决策
      const decision = await fetch(`/api/stream/${movieId}/decide`).then(r => r.json());

      if (decision.mode === 'direct') {
        // 直接播放，使用原生 <video> src
        videoRef.current!.src = decision.directUrl;
      } else {
        // HLS 播放
        if (Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(decision.hlsUrl);
          hls.attachMedia(videoRef.current!);
        } else if (videoRef.current!.canPlayType('application/vnd.apple.mpegurl')) {
          // Safari 原生支持 HLS
          videoRef.current!.src = decision.hlsUrl;
        }
      }
    }
    init();

    // 清理：关闭播放器时停止 session
    return () => { /* DELETE session */ };
  }, [movieId]);

  return <video ref={videoRef} controls />;
}
```

### 7.3 播放器 UI 增强（可选）

- 显示当前播放模式标识（直播 / 转码中）
- 转码缓冲进度条
- 码率/分辨率切换（多码率 HLS 时）

---

## 8. 跨平台/跨设备支持

| 平台 | 直接播放 (MP4/H.264) | HLS 播放 |
|------|----------------------|----------|
| Chrome (Desktop/Android) | 原生支持 | HLS.js |
| Safari (macOS/iOS) | 原生支持 | 原生支持 |
| Firefox | 原生支持 | HLS.js |
| Edge | 原生支持 | HLS.js |
| Smart TV 浏览器 | 通常支持 | 视型号而定 |

> Safari 原生支持 HLS，无需 HLS.js。其他浏览器通过 HLS.js polyfill 实现。

---

## 9. 文件结构规划

```
src/
├── lib/
│   ├── playback-decider.ts      # 播放决策逻辑
│   ├── transcode-manager.ts     # FFmpeg 进程管理
│   └── media-probe.ts           # ffprobe 封装，获取文件编码信息
├── app/
│   └── api/
│       └── stream/
│           └── [movieId]/
│               ├── decide/route.ts        # GET 播放决策
│               ├── playlist/route.ts      # GET .m3u8
│               ├── segment/[name]/route.ts # GET .ts 分片
│               └── session/[id]/route.ts  # DELETE 停止
```

---

## 10. 依赖要求

| 依赖 | 用途 | 安装方式 |
|------|------|----------|
| FFmpeg | 视频转码/转封装 | 系统安装 (`apt install ffmpeg` / `brew install ffmpeg`) |
| ffprobe | 探测媒体文件编码信息 | 随 FFmpeg 附带 |
| hls.js | 前端 HLS 播放 | `pnpm add hls.js` |

---

## 11. Phase 1 范围与限制

### 包含

- 单码率 HLS 输出
- H.264 软件编码（libx264）
- AAC 音频编码
- 基本的 session 管理与清理
- 拖进度条支持（seek → 重新启动转码）

### 不包含（后续 Phase）

- **硬件加速编码** (NVENC / VAAPI / VideoToolbox) — Phase 2
- **多码率自适应** (ABR, 多 variant playlist) — Phase 2
- **字幕提取与烧录** — Phase 2
- **多音轨切换** — Phase 2
- **实时转码进度上报** (WebSocket) — Phase 2
- **转码结果缓存**（避免重复转码同一文件） — Phase 3
- **分布式转码** — Phase 3

---

## 12. 参考

- [Jellyfin 串流架构](https://github.com/jellyfin/jellyfin) — MediaBrowser.Controller / MediaEncoding
- [HLS 规范 (RFC 8216)](https://datatracker.ietf.org/doc/html/rfc8216)
- [HLS.js 文档](https://github.com/video-dev/hls.js)
- [FFmpeg HLS muxer](https://ffmpeg.org/ffmpeg-formats.html#hls-2)
