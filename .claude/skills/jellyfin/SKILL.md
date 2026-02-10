---
name: jellyfin
description: >
  Jellyfin media server architecture reference for building self-hosted media management systems.
  Use when: (1) Designing or building a media library/streaming system similar to Jellyfin/Plex/Emby,
  (2) Implementing media transcoding pipelines, HLS streaming, or FFmpeg integration,
  (3) Designing plugin/extension systems, scheduled task frameworks, or event-driven architectures,
  (4) Building React frontends with TanStack Query, legacy migration, or multi-app architecture,
  (5) Designing RESTful APIs with custom authentication, WebSocket communication, or media-specific endpoints,
  (6) Implementing metadata scraping systems, media file naming parsers, or EF Core data models with single-table inheritance,
  (7) Any task involving self-hosted media server architecture decisions.
---

# Jellyfin Architecture Reference

Reference skill based on deep analysis of Jellyfin (GPLv2 open-source media server). Server: C#/ASP.NET Core (~25 projects, 60 API controllers, ~303K LOC). Web: TypeScript/React (~1094 files, ~280K LOC).

## How to Use This Skill

1. Identify which subsystem is relevant to the current task
2. Read the corresponding reference file(s) from `references/`
3. Apply Jellyfin's patterns and decisions as architectural guidance

**Read references on demand** — each file is 500-1200 lines. Never load all at once.

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Clients (Web/Mobile/TV)            │
└──────────────────────┬──────────────────────────────┘
                       │ REST API + WebSocket
┌──────────────────────▼──────────────────────────────┐
│  Jellyfin.Server (ASP.NET Core Host)                │
│  ├── 21-layer Middleware Pipeline                    │
│  ├── 60 API Controllers (Jellyfin.Api)              │
│  └── Custom Auth (opaque token, 17 policies)        │
├─────────────────────────────────────────────────────┤
│  Service Layer (Emby.Server.Implementations)        │
│  ├── LibraryManager      — media library ops        │
│  ├── TranscodeManager    — FFmpeg process mgmt      │
│  ├── ProviderManager     — metadata scraping        │
│  ├── TaskManager         — scheduled tasks          │
│  ├── PluginManager       — plugin lifecycle         │
│  └── EventManager        — event pub/sub            │
├─────────────────────────────────────────────────────┤
│  Domain (MediaBrowser.Controller — interfaces)      │
│  Model  (MediaBrowser.Model — DTOs & config)        │
├─────────────────────────────────────────────────────┤
│  Data   (EF Core + SQLite, single DB)               │
│  ├── BaseItemEntity (single-table inheritance)      │
│  ├── UserData (play progress, favorites, ratings)   │
│  └── 28 entities, 15+ composite indexes             │
└─────────────────────────────────────────────────────┘
```

## Key Design Decisions

| Domain | Decision | Pattern |
|--------|----------|---------|
| Media storage | Dual model: library *structure* on filesystem, *content* in DB | `.collection` marker + `.mblink` shortcuts + `options.xml` per library |
| Media types | Single-table inheritance (`BaseItemEntity`, 70+ cols) | `Type` column stores .NET type full name, avoids JOINs |
| Transcoding | FFmpeg external process, three-tier: DirectPlay > DirectStream > Transcode | HLS with on-demand segment generation |
| Authentication | Custom opaque token (not JWT), 6 extraction sources | `CustomAuthenticationHandler` + 17 authorization policies |
| Plugins | .NET AssemblyLoadContext isolation, `meta.json` manifest | Version coexistence, `IPluginServiceRegistrator` for DI |
| Config | Factory-based modular XML (`system.xml`, `encoding.xml`, etc.) | `IConfigurationFactory` + `ConfigurationStore` |
| Frontend state | TanStack Query + React Context (no Redux/Zustand) | `queryOptions` factory pattern for data fetching |
| Frontend migration | Progressive Legacy-to-React with dual rendering bridge | `renderComponent()` bridge, `RootContext` provider stack |

## Data Directory Structure

```
{ProgramDataPath}/
├── root/default/{Library}/   # Library structure (filesystem-based)
│   ├── *.collection          # Type marker (movies/tvshows/music)
│   ├── *.mblink              # Media path shortcuts
│   └── options.xml           # Library config
├── data/jellyfin.db          # SQLite main database (EF Core)
├── metadata/                 # Internal metadata & images
│   ├── People/  artists/  Genre/  Studio/  Year/
│   └── library/{guid}/      # Per-item internal metadata
├── config/                   # Modular XML configuration
├── plugins/{Name}_{Ver}/     # Plugin isolation by version
├── cache/images/             # Image cache
├── log/                      # App + FFmpeg logs
└── transcodes/               # Temp HLS segments (auto-cleaned)
```

## Reference Files Guide

### By Development Scenario

| Building... | Read first | Then |
|-------------|-----------|------|
| Media library system | `10-skill-reference.md` §1 | `05-data-model.md`, `02-feature-detail.md` §1 |
| Video transcoding/streaming | `10-skill-reference.md` §2 | `09-media-core.md`, `02-feature-detail.md` §2 |
| Plugin/extension system | `10-skill-reference.md` §3 | `07-server-patterns.md` §1 |
| REST API layer | `10-skill-reference.md` §4 | `06-api-design.md` |
| React frontend app | `10-skill-reference.md` §5 | `04-web-architecture.md`, `08-web-patterns.md` |
| Metadata scraping | `10-skill-reference.md` §6 | `09-media-core.md`, `02-feature-detail.md` §4 |
| User auth system | `10-skill-reference.md` §7 | `06-api-design.md` §3 |
| Scheduled task framework | `10-skill-reference.md` §8 | `07-server-patterns.md` §2 |
| Data persistence layer | `10-skill-reference.md` §9 | `05-data-model.md` |
| Event-driven architecture | `10-skill-reference.md` §10 | `07-server-patterns.md` §3 |
| Full system architecture | `03-server-architecture.md` | `04-web-architecture.md` |

### Reference File Index

| File | Lines | Content | Search patterns |
|------|-------|---------|-----------------|
| `01-product-overview.md` | 542 | Product positioning, 6 user scenarios, feature tree, 60 controller overview, 4 frontend sub-apps | `功能全景`, `Controller 分组`, `路由表` |
| `02-feature-detail.md` | 1219 | Full-stack trace of 8 core features: library, playback, auth, metadata, SyncPlay, LiveTV, tasks, backup | `数据流`, `流程`, `链路`, `Controller`, `Service` |
| `03-server-architecture.md` | 656 | 25 projects, layered deps, 13-step startup, 60+ DI services, 21-layer middleware, config system | `启动序列`, `DI 注册`, `中间件`, `接口`, `实现` |
| `04-web-architecture.md` | 872 | Tech stack, multi-app arch, routing, state mgmt, component hierarchy, Webpack, Legacy status, i18n, themes | `路由`, `状态管理`, `组件`, `Legacy`, `主题` |
| `05-data-model.md` | 1002 | EF Core config, 28 entities, ER diagrams, domain model mapping, index strategy, dual migration system | `BaseItemEntity`, `UserData`, `实体`, `索引`, `迁移` |
| `06-api-design.md` | 867 | RESTful design, auth system (17 policies), WebSocket, dual API client, error handling | `认证`, `授权`, `WebSocket`, `Token`, `策略` |
| `07-server-patterns.md` | 1112 | Plugin system, scheduled tasks, events/notifications, config mgmt, backup/restore, migration framework | `插件`, `定时任务`, `事件`, `配置`, `备份`, `迁移` |
| `08-web-patterns.md` | 921 | TanStack Query patterns, custom hooks (6 types), Legacy→React migration, themes, i18n, player plugins | `useQuery`, `Hooks`, `Legacy`, `主题`, `播放器` |
| `09-media-core.md` | 971 | File naming parser, ProviderManager, EncodingHelper (7818 lines), HLS generator, 8 HW accel schemes | `FFmpeg`, `转码`, `HLS`, `硬件加速`, `命名规则` |
| `10-skill-reference.md` | 544 | Quick reference for 10 scenarios with decision tables, patterns, key file paths | `设计决策`, `架构模式`, `核心文件` |

## Core Patterns Quick Reference

### 1. Media Library — Dual Storage Model

- **Structure** (filesystem): `root/default/{Library}/` with `.collection` type marker, `.mblink` path pointers, `options.xml` config
- **Content** (database): `BaseItemEntity` single-table inheritance, `ParentId` + `AncestorId` for hierarchy
- **Scan**: `ILibraryManager.ValidateMediaLibrary()` full scan + `LibraryMonitor` filesystem watcher for incremental
- **Naming**: `Emby.Naming` library with 900+ line `NamingOptions`, 20+ regex patterns

### 2. Video Playback — Five-Stage Pipeline

```
Click → Negotiate (POST /PlaybackInfo) → Build URL → Serve Stream → Report Status
         DeviceProfile + StreamBuilder        ↓
         DirectPlay | DirectStream | Transcode
                                    FFmpeg via TranscodeManager
                                    HLS: master.m3u8 → segments
```

### 3. Authentication — Custom Opaque Token

- NOT JWT. Server-generated tokens stored in DB, validated per-request
- 6 token extraction sources: `Authorization` header, `X-Emby-Authorization`, query param, cookie, etc.
- 17 authorization policies with `IAuthorizationRequirement` + `IAuthorizationHandler` pairs
- `CustomAuthenticationHandler` extracts claims from token

### 4. Plugin System — AssemblyLoadContext Isolation

```
plugins/{Name}_{Version}/
├── meta.json       # Manifest (guid, name, version, status, targetAbi)
├── *.dll           # Assemblies (loaded in isolated context)
└── ...
```

- `IPluginServiceRegistrator` for DI integration
- Multi-version coexistence, auto-activate highest compatible
- 5 lifecycle states: Active → Disabled → Uninstalled → Superceded → Restart

### 5. Scheduled Tasks — Trigger + Worker Pattern

- `IScheduledTask` interface with 4 trigger types: Daily, Weekly, Interval, Startup
- `TaskManager` with `ConcurrentQueue` + `ScheduledTaskWorker` execution engine
- 20+ built-in tasks (library scan, transcoding cleanup, image extraction, etc.)

### 6. Metadata Scraping — ProviderManager Pipeline

- 6 provider types: `IRemoteMetadataProvider`, `ILocalMetadataProvider`, `IImageProvider`, etc.
- Priority-based refresh queue, 7-step refresh pipeline
- 26 `MetadataService` subclasses (one per media type)
- Dual-layer sorting: `HasOrder` interface → `MetadataProviderPriority` enum fallback

### 7. Frontend State — TanStack Query Patterns

Three patterns, from simple to complex:
1. Basic: `useQuery({ queryKey, queryFn })` inline
2. Factory: `queryOptions()` + separate hook file
3. Feature-scoped: `use{Feature}Query` + `use{Feature}Mutation` co-located

No Redux/Zustand — TanStack Query for server state, React Context for UI state only.

### 8. Frontend Migration — Legacy Bridge

- `renderComponent(el, Component)` mounts React inside Legacy containers
- `RootContext` wraps all bridge renders with full provider stack
- `queryOptions` factory enables Legacy code to access TanStack Query cache
- Event bus (`Events.on/off/trigger`) for cross-framework communication

## Startup Sequence (Server, 13 Steps)

1. Parse CLI args → 2. Init paths + logging → 3. Create `IHost` → 4. Migrate DB →
5. Register 60+ DI services → 6. Build middleware pipeline → 7. Init `IServerApplicationHost` →
8. Discover plugins + assemblies → 9. Run code migrations → 10. Start `IHostedService`s →
11. Validate media libraries → 12. Start scheduled tasks → 13. Open network listener

## Entity Relationship Core

```
User ──1:N──> Permission (library access, parental control)
User ──1:N──> UserData ──N:1──> BaseItemEntity
User ──1:N──> Device (sessions)

BaseItemEntity (single table, Type discriminator)
  ├── self-ref: ParentId (direct parent)
  ├── AncestorId table (ancestor chain for deep queries)
  ├── ItemValue table (genres/studios/tags, M:N normalized)
  ├── Chapter table (video chapters)
  ├── MediaStream table (video/audio/subtitle tracks)
  ├── People table (actors/directors, with role + sort order)
  └── TrickplayInfo table (thumbnail timeline previews)
```
