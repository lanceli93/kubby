# Kubby — Bug 修复 & 优化交接单

> 本文档供后续用更强模型修复/优化时参考。每条 bug 已在代码中定位到精确文件/行号与根因。
> 交接时间点:测试环境已就绪(见文末)。

---

## 一、测试环境基本情况

### 运行方式
- **开发环境端口**:`localhost:3000`(打包后的软件是 `8665`,两者是设计如此,非 bug)
- **dev server 启动命令**(必须带代理,否则 TMDB 刮削超时):
  ```bash
  NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 \
    NO_PROXY=localhost,127.0.0.1 npm run dev
  ```
  > Node 内置 `fetch`(undici)默认不读 `HTTPS_PROXY`;`NODE_USE_ENV_PROXY=1`(Node 24+)开启。这是纯本地网络配置,**不要**硬编码进代码。
- **必需的本地文件**(均 gitignored):
  - `.env.local`:`AUTH_SECRET`(64 hex)+ `AUTH_TRUST_HOST=true`
  - `data/`:SQLite 数据库目录(`initDb()` 不会自动创建目录)

### 已初始化状态
- **管理员账号**:`admin` / `admin123`(locale=zh)
- **TMDB API key** 已写入 settings
- **媒体库** "Test Library" → `D:/AIworkspace/kubby/test-media`(`scraperEnabled=true`, `jellyfinCompat=false`)
- **扫描结果**:19/19 全部入库,0 跳过

### 测试视频矩阵(`test-media/`,gitignored)
分两批,所有源文件均**只读**、从不被修改:
- **合成矩阵**(`generate.sh`):从 `X:\Jellyfin\JAV\OFES-009\OFES-009.mp4`(1080p h264+aac)**重编码**生成,凑齐各种编码/容器/分辨率/宽高比,文件夹按真实热门电影命名以便 TMDB 刮削。
- **真实源 bug 复现片段**(`generate-real.sh`):从用户提供的真实问题视频**流拷贝**(`-c copy`,保留原始编码/分辨率/VR 布局),每个对应第三节一个 bug。番号 TMDB 搜不到,已补最小 `movie.nfo`。

映射表:`test-media/README-test-matrix.md`。

> **已精简**(用户要求):删除了分辨率梯度(720p/1080p/4K)、宽高比(2.40:1/9:16/4:3)、合成分碟(Godfather/LotR,真实 PSD-467 已覆盖真分碟)、Gladiator wmv(PSD-467 已覆盖 wmv)。当前库内 14 部(9 合成播放决策/元数据 + 5 真实源),NADE-131 因 BUG-4 未入库。

| 类别 | 电影 | 关键属性 | 覆盖的代码路径 |
|---|---|---|---|
| **播放-direct** | Shawshank | mp4/h264/aac | `decidePlayback()` → direct |
| | The Dark Knight | mp4/hevc/aac | direct(HEVC fMP4) |
| | Inception | webm/vp9/opus | direct |
| **播放-remux** | Interstellar | mkv/h264/aac | remux(换容器) |
| | Pulp Fiction | mp4/h264/**ac3** | remux(音频转码) |
| | Fight Club | mov/h264/aac | remux |
| | The Matrix | ts/h264/aac | remux |
| **播放-transcode** | Forrest Gump | avi/mpeg4/mp3 | transcode |
| **元数据** | Spirited Away / Your Name | 带 NFO / 纯裸文件 | Jellyfin NFO 扫描 vs TMDB 刮削 |
| **真实-VR上下** | ETVCO-016 | h264 **2160×2160** over-under | BUG-5(360无法播+bufferAppendError) |
| **真实-8K VR** | Jibaro | hevc **8192×4096** | BUG-6(seek 延时 3s+) |
| **真实-普通** | ABP-181 | h264 720p mkv | BUG-7(拖动黑屏) |
| **真实-rmvb** | NADE-131 | **rv40/cook rmvb**(未入库) | BUG-4(rmvb 不被扫描) |
| **真实-wmv分碟** | PSD-467 | **wmv2** asf CD1+CD2 | BUG-8(wmv性能)+ BUG-1(分碟MediaInfo) |

> **注**:合成矩阵是 h264 重编码,无法复现真实编码 bug;真实源片段用流拷贝保留了 rv40/wmv2/8K/VR 布局等原始特征,才能复现对应 bug。分碟测试现由真实 PSD-467(wmv 双碟)承担。
> **未覆盖**:标准 equirectangular 360°(用户有素材但本轮未提供路径)。

### 关键行为备忘(非 bug,易踩坑)
- **`jellyfinCompat` 与 `scraperEnabled` 语义互斥**(`src/lib/scanner/index.ts:308`):TMDB 自动刮削只在 `jellyfinCompat=false` 时运行。兼容模式只读已有 NFO、绝不写文件,裸文件会被 `no_nfo` 跳过。

---

## 二、待修复 Bug

### BUG-1 :分碟的 Media Info 只显示 cd1 的文件大小
- **现象**:多碟电影(如 The Godfather)的 Media Info 弹窗只显示 cd1 的 media size,应分别显示每个碟片的信息。
- **根因**:后端 API **已经**返回了完整的 `discs[]` 数组(每碟含 `fileSize`/`container`/`videoCodec`/`runtimeSeconds` 等),但前端弹窗组件的 TypeScript 接口 `MediaInfoData` 根本没有 `discs` 字段,也没有渲染它 —— 只显示了顶层 `data.fileSize`(= 主视频/cd1)。
- **位置**:
  - API(已正确):`src/app/api/movies/[id]/media-info/route.ts:31-66`(返回 `discs[]`)
  - 前端(缺失):`src/components/movie/media-info-dialog.tsx:41-50`(`MediaInfoData` 接口无 `discs`),`:213-222`(文件信息头只渲染单个 fileSize)
- **修复方向**:在 `MediaInfoData` 接口加 `discs` 字段;当 `discs.length > 0` 时,为每个碟片渲染一组文件信息(fileName/container/fileSize/runtime/codec),而不是只显示顶层 fileSize。可参考 API 已返回的字段结构。

> **BUG-2(删除跳转丢 libraryId)、BUG-3(书签碟片排序)已修复** — 见 `docs/feature-completed.md`(2026-07-03)。

---

## 三、真实源片段暴露的 Bug(用户提供的实际问题视频)

> 这些用**流拷贝**(`-c copy`,保留原始编码/分辨率/VR 布局)从用户真实媒体截取,生成脚本见 `test-media/generate-real.sh`。
> 每个片段都已入库(除 rmvb 外),可直接在测试库中打开复现。番号在 TMDB 搜不到,故均补了最小 `movie.nfo` 以便扫描器收录。

### BUG-4 :RMVB 视频不被扫描器收录 — ✅ 扫描已修复,播放待验证
- **扫描部分已修复**(见 `docs/feature-completed.md` 2026-07-03):`VIDEO_EXTENSIONS` 加入 `.rmvb`/`.rm`,NADE-131 现已入库,播放决策判为 `transcode`(h264_nvenc)。
- **遗留待验证**:rv40/cook 的**实际转码播放**尚未端到端测试。FFmpeg 对 rm 容器 demux 支持较弱,需实际播放 NADE-131 确认转码链路能出流;若失败,应在 UI 提示"不支持的格式"而非黑屏。
- **测试片段**:`test-media/NADE-131/NADE-131.rmvb`(rv40 640×480 / cook,rm 容器)。

### BUG-5 :VR「上下排布」(over-under)视频 360 模式无法播放 + 开头 HLS bufferAppendError
- **现象**:该 VR 视频是上下(over-under)立体排布,进入 360 模式无法正常播放;且每次播放开头都报 `HLS: mediaError bufferAppendError`。
- **根因(待定位)**:
  - 360 播放器(`src/components/player/panorama-360-player.tsx`,Three.js sphere + VideoTexture)可能只处理了 equirectangular 单画面 / 左右(side-by-side)排布,未处理 over-under 立体格式。
  - `bufferAppendError` 通常是 HLS.js 追加分片时 codec/init-segment 不匹配 —— 需查转码/remux 生成的 HLS 分片(2160×2160 h264 的 fMP4 init segment 可能有兼容问题)。
- **位置(排查起点)**:`src/components/player/panorama-360-player.tsx`(投影/布局处理)、转码 HLS 分片生成逻辑(`src/lib/transcode/`)。
- **测试片段**:`test-media/ETVCO-016/ETVCO-016.mkv`(h264 **2160×2160**,over-under VR)。

### BUG-6 :高分辨率(8K)VR 视频拖动进度条延时 3s+(PotPlayer 仅 100-200ms)
- **现象**:8K VR 视频在本地播放,每次拖动进度条延时都 >3s;同一文件用 PotPlayer 本地播放延时仅 100-200ms,性能差距巨大。
- **根因(待定位)**:Kubby 走 HLS 转码/remux 管线,seek 时需要重新定位关键帧 + 生成新分片 + HLS.js 缓冲;8192×4096 hevc 的转码/解码开销极大。而 PotPlayer 是原生解码器直接 seek。可能的优化点:seek 时的分片预生成、关键帧索引、是否对超高分辨率强制走 remux 而非 full transcode、GPU 硬解(源机器 FFmpeg 有 NVENC/cuvid)。
- **位置(排查起点)**:`src/lib/transcode/transcode-manager.ts`、`playback-decider.ts`、HLS seek 处理、`src/app/api/movies/[id]/stream/`。
- **测试片段**:`test-media/Love, Death + Robots - Jibaro (2025)/`(hevc **8192×4096** 8K)。

### BUG-7 :普通视频拖动进度条黑屏
- **现象**:普通 h264 720p mkv,一拖动进度条就黑屏。
- **根因(待定位)**:mkv 走 remux→HLS 管线;seek 到非关键帧位置、或 HLS.js 分片切换时视频解码失败导致黑屏。可能与 BUG-5 的 bufferAppendError 同源(HLS 分片/init segment 处理),但这是普通 h264、无 VR 干扰,是更干净的复现样本。
- **位置(排查起点)**:HLS remux 分片生成、seek 处理、播放页 `src/app/(main)/movies/[id]/play/page.tsx`。
- **测试片段**:`test-media/ABP-181/ABP-181.mkv`(h264 1280×720,mkv)。

### BUG-8 :WMV 播放性能差
- **现象**:wmv 视频播放性能很差。
- **根因(待定位)**:wmv2/wmapro 浏览器无法直连,`playback-decider.ts` 判为 full `transcode`;wmv2 是老编码,FFmpeg 解码 + 转 H.264 + HLS 分片开销大。可能优化:GPU 加速、预转码、分片缓存。
- **位置(排查起点)**:`playback-decider.ts`(确认 wmv2→transcode)、`transcode-manager.ts`。
- **测试片段**:`test-media/PSD-467/`(wmv2 720×400,asf,**同时是 2 碟 CD1/CD2** —— 也是 BUG-1 分碟 Media Info 的测试对象)。

> **备注**:BUG-5/6/7/8 的性能与播放问题很可能有共同的底层根因(HLS 转码/remux 管线的 seek 与分片处理、缺少 GPU 硬解)。建议后续模型先统一排查转码管线,再逐个验证。

---

## 四、候选优化(观察所得,非用户明确要求)

1. **刮削代理设置项**:目前 TMDB 刮削依赖 dev server 的代理环境变量。可考虑在 Providers 设置页加一个「刮削 HTTP 代理」配置,让打包用户自行填写代理地址(通过 undici `ProxyAgent` / `setGlobalDispatcher` 注入),而非依赖启动环境变量。
2. **播放路径实测**:用测试矩阵在浏览器实际播放 9 种格式,验证 direct / remux / transcode 三条链路(尤其 HLS 转码)真的可播。
