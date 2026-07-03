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

> **BUG-1~8 已全部修复** — 见 `docs/feature-completed.md`(2026-07-03 两批)。
> 遗留已知限制:rm/rmvb 容器 demuxer seek 不可靠(测试片段 seek 会落到损坏数据,0 帧输出),从头播放正常;rmvb seek 属 best-effort。

---

## 四、候选优化(观察所得,非用户明确要求)

1. **刮削代理设置项**:目前 TMDB 刮削依赖 dev server 的代理环境变量。可考虑在 Providers 设置页加一个「刮削 HTTP 代理」配置,让打包用户自行填写代理地址(通过 undici `ProxyAgent` / `setGlobalDispatcher` 注入),而非依赖启动环境变量。
2. **播放路径实测**:用测试矩阵在浏览器实际播放 9 种格式,验证 direct / remux / transcode 三条链路(尤其 HLS 转码)真的可播。
