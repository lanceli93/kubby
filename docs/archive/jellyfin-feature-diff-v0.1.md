# Kubby vs Jellyfin 功能差异记录

> 记录在参考 Jellyfin 过程中观察到的功能差异，以及 Kubby 暂不实现的理由。
> 后续如需实现某项功能，可直接参考此文档评估优先级。

---

## 1. Server Name (服务器名称)

**Jellyfin 行为**: 首次启动时的欢迎向导中要求设置 Server name，默认值为机器 hostname（Docker 环境下为容器 ID，如 `7cf34de3dd33`）。

**用途**:
- 多服务器区分 — 用户的客户端 App（手机/电视）可连接多台 Jellyfin 服务器，Server name 作为标识显示在服务器选择列表中
- 局域网发现 (SSDP/mDNS) — Jellyfin 在局域网广播时使用此名称，客户端自动发现时展示
- 客户端 UI 展示 — 替代 IP 地址，提供友好的显示名

**Kubby 现状**: 未实现。

**暂不实现原因**:
- Kubby 当前仅有 Web 前端，没有独立客户端 App（手机/TV），不存在多服务器选择场景
- 未实现局域网服务发现协议 (SSDP/mDNS)，无广播需求
- 单实例部署场景下，浏览器地址栏已足够标识服务器

**未来考虑**: 如果开发移动端/TV 客户端 App，或支持局域网自动发现，需引入此功能。可在 `system_config` 表中增加 `server_name` 字段，并在首次启动向导中设置。

---

## 2. 视频串流/转码 (HLS Transcoding)

**Jellyfin 行为**: 核心功能之一。Jellyfin 通过 FFmpeg 实时转码视频，生成 HLS 分片流，支持多码率自适应、硬件加速编码（NVENC/VAAPI/QSV）、字幕烧录、多音轨切换等。客户端请求播放时，服务端根据客户端能力自动决定直接播放(Direct Play)、转封装(Remux) 或转码(Transcode)。

**用途**:
- 让不支持源文件编码格式的设备也能播放（如 HEVC → H.264）
- 适配不同网络带宽（自适应码率）
- 处理 MKV 等浏览器不支持的容器格式
- 提取/烧录字幕、切换音轨

**Kubby 现状**: 未实现。当前仅通过 HTTP Range Requests 提供原始文件直接下载/播放。

**暂不实现原因**:
- Kubby 视频库以 MP4(H.264+AAC) 为主，浏览器原生支持直接播放，无需转码
- 现有 Range Requests 已支持拖进度条和断点续传，体验可接受
- 串流/转码是大型功能模块（FFmpeg 进程管理、HLS 分片生成、session 生命周期、前端 HLS.js 集成），开发量大
- 需要服务端安装 FFmpeg，增加部署依赖

**未来考虑**: 已完成 Phase 1 设计文档 → [`docs/streaming-feature-design.md`](./streaming-feature-design.md)。当出现以下场景时考虑实现：
- 视频库中 MKV/HEVC/DTS 格式文件占比增加
- 需要支持低带宽远程访问（外网串流）
- 用户反馈特定设备无法播放

---

<!-- 后续差异项按以下模板追加:

## N. 功能名称

**Jellyfin 行为**: ...

**用途**: ...

**Kubby 现状**: 未实现 / 部分实现 / 已简化实现

**暂不实现原因**: ...

**未来考虑**: ...

-->
