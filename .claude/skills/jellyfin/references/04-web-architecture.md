# Jellyfin Web 前端架构分析

## 1. 技术栈概览

| 类别 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **UI 框架** | React | 18.3.1 | 核心视图层 |
| **类型系统** | TypeScript | 5.8.3 | 静态类型检查 |
| **路由** | react-router-dom | 6.30.1 | Hash 路由，懒加载 |
| **UI 组件库** | MUI (Material UI) | 6.4.12 | 组件、主题系统 |
| **数据获取** | @tanstack/react-query | 5.80.10 | 服务器状态管理 |
| **API SDK** | @jellyfin/sdk | 0.0.0-unstable | 服务端 API 客户端 |
| **构建工具** | Webpack | 5.99.9 | 打包、代码分割 |
| **测试框架** | Vitest | 3.2.4 | 单元测试（使用 Vite 配置） |
| **样式方案** | SCSS + Emotion | sass 1.89.2 / @emotion/react 11.14.0 | 主题 CSS + CSS-in-JS |
| **日期处理** | date-fns | 2.30.0 | 日期格式化与本地化 |
| **媒体播放** | hls.js / flv.js / libass-wasm | 1.6.15 / 1.6.2 / 4.2.3 | HLS/FLV 流、ASS 字幕 |
| **表格** | material-react-table | 3.2.1 | 管理后台数据表格 |
| **代码规范** | ESLint (flat config) + Stylelint | 9.30.1 / 16.21.0 | JS/TS 和 CSS 代码规范 |
| **Legacy** | jQuery / jellyfin-apiclient | 3.7.1 / 1.11.0 | 旧版代码依赖 |

### 运行环境要求

- Node.js >= 24.0.0, npm >= 11.0.0
- 浏览器兼容：最新 2 版本 Chrome/Firefox/Safari/Edge，以及 Chrome 27/38/47/53/56/63、Edge 18、Firefox ESR、iOS > 10

---

## 2. 项目结构说明

```
src/
├── apps/                  # 多应用架构（4 个子应用）
│   ├── dashboard/         # 管理后台（Admin Dashboard）
│   ├── experimental/      # 实验性用户界面（全新 React UI）
│   ├── stable/            # 稳定版用户界面（大量 Legacy 代码）
│   └── wizard/            # 首次设置向导
├── components/            # 共享组件库（107 个条目，含 .tsx/.js/.scss）
│   ├── common/            # 通用 UI 原语（SectionContainer、NoItemsMessage 等）
│   ├── router/            # 路由基础设施（AsyncRoute、LegacyRoute、ErrorBoundary）
│   ├── viewManager/       # Legacy 视图引擎（HTML 注入 + 控制器生命周期）
│   ├── playback/          # 播放控制组件
│   ├── cardbuilder/       # 媒体卡片构建器
│   └── ...                # 其他功能组件
├── controllers/           # Legacy 页面控制器（HTML 模板 + JS 控制器）
├── elements/              # 自定义 Web Components（emby-* 系列）+ React 包装器
├── hooks/                 # React Hooks（API、设置、数据获取）
│   └── api/               # 领域特定 API hooks
├── lib/                   # 第三方库封装
│   ├── globalize/         # 自定义国际化系统
│   ├── jellyfin-apiclient/# Legacy API 客户端
│   ├── legacy/            # 浏览器 Polyfills（core-js、jQuery 等）
│   ├── navdrawer/         # 导航抽屉
│   └── scroller/          # 滚动工具
├── plugins/               # 播放器与屏保插件（14 个）
├── scripts/               # 工具脚本（浏览器检测、输入管理、主题等 32 个文件）
├── strings/               # 国际化翻译文件（99 个语言的 JSON 文件）
├── styles/                # 全局样式
├── themes/                # 主题系统（6 个主题 + 基础主题）
├── types/                 # TypeScript 类型定义
├── utils/                 # 工具函数
├── constants/             # 常量定义
├── RootApp.tsx            # 应用根组件（Provider 层）
├── RootAppRouter.tsx      # 路由根组件（Hash Router）
├── index.jsx              # Webpack 入口（初始化、Polyfill 加载）
└── index.html             # HTML 模板
```

### 文件类型分布

| 类型 | 数量 | 性质 |
|------|------|------|
| `.tsx` | ~273 | 现代 React + TypeScript |
| `.ts` | ~267 | 现代 TypeScript |
| `.js` | ~246 | Legacy / 过渡期 JavaScript |
| `.html` | ~69 | Legacy HTML 模板 |
| `.jsx` | 1 | 仅入口文件 `index.jsx` |

---

## 3. 多应用架构

Jellyfin Web 采用**多应用架构**（Multi-App Architecture），在同一个 SPA 中包含 4 个子应用，通过路由隔离。

### 3.1 子应用概览

| 子应用 | 路径前缀 | 定位 | 布局组件 | 现代化程度 |
|--------|---------|------|----------|-----------|
| **Stable** | `/*` | 稳定版用户界面（默认 TV 模式） | `AppLayout`（简单包装） | 低（大量 Legacy 路由） |
| **Experimental** | `/*` | 实验性用户界面（默认桌面/移动端） | `AppLayout`（MUI AppBar + Drawer） | 高（React 路由为主） |
| **Dashboard** | `/dashboard/*` | 服务器管理后台 | `AppLayout`（完整 MUI 布局） | 最高（几乎全 React） |
| **Wizard** | `/wizard/*` | 首次设置向导 | 复用 Stable 的 `AppLayout` | 低（全部 Legacy） |

### 3.2 布局模式选择

```typescript
// RootAppRouter.tsx
const layoutMode = browser.tv ? LayoutMode.Tv : localStorage.getItem(LAYOUT_SETTING_KEY);
const isExperimentalLayout = !layoutMode || layoutMode === LayoutMode.Experimental;

// Stable 和 Experimental 互斥，二选一
...(isExperimentalLayout ? EXPERIMENTAL_APP_ROUTES : STABLE_APP_ROUTES),
...DASHBOARD_APP_ROUTES,   // 始终加载
...WIZARD_APP_ROUTES,      // 始终加载
```

- **TV 设备**：强制使用 Stable 布局（`LayoutMode.Tv`）
- **桌面/移动端**：默认使用 Experimental 布局
- Dashboard 和 Wizard 在两种模式下都可用

### 3.3 各应用 AppLayout 对比

**Dashboard AppLayout**（最复杂）：
- MUI `AppBar` + 响应式侧边栏 `AppDrawer`
- `LocalizationProvider`（MUI 日期选择器本地化）
- 管理员导航标签 `AppTabs`
- 条件显示 `ServerButton`、`HelpButton`

**Experimental AppLayout**：
- MUI `AppBar` + 响应式抽屉 `AppDrawer`
- 自定义 `AppToolbar`（搜索按钮、SyncPlay、远程播放）
- 用户视图导航 `UserViewNav`
- `CustomCss` 支持用户自定义样式

**Stable AppLayout**（最简单）：
- 仅包含 `AppBody` + `ThemeCss` + `CustomCss`
- 实际 UI chrome 由 Legacy `AppHeader` 和 `libraryMenu.js` 提供

**Wizard**：复用 Stable 的 `AppLayout`，无额外 chrome。

---

## 4. 路由架构

### 4.1 路由基础设施

- **路由器类型**：`createHashRouter`（React Router v6 Data Router，使用 `#/` Hash 路由）
- **路由守卫**：`ConnectionRequired` 组件，支持 4 个访问级别
- **懒加载**：React Router v6 原生 `lazy` 属性 + Webpack 动态 `import()`
- **Legacy 桥接**：`ViewManagerPage` 组件将旧版 HTML+JS 页面嵌入 React 路由树

### 4.2 路由类型系统

路由定义分为两种类型，通过工厂函数转换为 `RouteObject`：

```typescript
// 现代异步路由 - 使用 React Router lazy 加载
interface AsyncRoute {
    path: string;
    page?: string;      // 默认等于 path
    type?: AppType;     // 决定从哪个 app 目录导入
}

// 转换为 RouteObject
const toAsyncPageRoute = ({ path, page, type }: AsyncRoute): RouteObject => ({
    path,
    lazy: async () => {
        const { default: Component, ...route } = await importRoute(page ?? path, type);
        return { Component, ...route };
    }
});

// Legacy 路由 - 使用 ViewManager 渲染 HTML+JS
interface LegacyRoute {
    path: string;
    pageProps: {
        controller: string;  // JS 控制器模块路径
        view: string;         // HTML 模板路径
        appType?: AppType;
        isFullscreen?: boolean;
        isNowPlayingBarEnabled?: boolean;
        isThemeMediaSupported?: boolean;
    };
}

// 转换为 RouteObject
const toViewManagerPageRoute = (route: LegacyRoute): RouteObject => ({
    path: route.path,
    element: <ViewManagerPage {...route.pageProps} />
});
```

### 4.3 路由守卫 — ConnectionRequired

```
ConnectionRequired 组件
├── level='public'    → 允许未登录用户访问（登录、注册等）
├── level='user'      → 需要已登录（默认值）
├── level='admin'     → 需要管理员权限
└── level='wizard'    → 需要未完成设置向导
```

工作流程：
1. 调用 `ServerConnections.connect()` 建立服务器连接
2. 根据 `ConnectionState` 决定路由：`SignedIn` → 继续 / `ServerSignIn` → 登录页 / `ServerSelection` → 选服务器
3. Admin 级别额外检查 `user.Policy.IsAdministrator`
4. Wizard 级别检查 `StartupWizardCompleted` 状态
5. 验证通过后渲染 `<Outlet />`

### 4.4 各应用路由统计

| 子应用 | Async 路由 | Legacy 路由 | 总计 |
|--------|-----------|-------------|------|
| **Dashboard** | 30 | 3 | 33 |
| **Experimental** | 11 | 8 | 19 |
| **Stable** | 5 | 14 | 19 |
| **Wizard** | 0 | 6 | 6 |

### 4.5 路由层次结构

```
createHashRouter
└── RootAppLayout (ThemeProvider + Backdrop + AppHeader)
    ├── Experimental 或 Stable 路由 (互斥)
    │   └── /* → AppLayout
    │       ├── / → Redirect to /home
    │       ├── ConnectionRequired (user)
    │       │   ├── Async 用户路由 (lazy loaded)
    │       │   ├── Legacy 用户路由 (ViewManager)
    │       │   └── ErrorBoundary
    │       └── ConnectionRequired (public)
    │           ├── Async/Legacy 公开路由
    │           └── * → FallbackRoute
    ├── Dashboard 路由
    │   └── ConnectionRequired (admin)
    │       └── AppLayout (lazy loaded)
    │           ├── /dashboard/* → Async + Legacy 管理路由
    │           ├── /metadata → ViewManager (元数据编辑器)
    │           └── /configurationpage → ServerContentPage (插件配置)
    ├── Wizard 路由
    │   └── ConnectionRequired (wizard)
    │       └── /wizard/* → Legacy 向导步骤
    └── /!/* → BangRedirect (Legacy URL 兼容)
```

### 4.6 懒加载实现

不使用 `@loadable/component` 或 `React.lazy`，而是利用 **React Router v6 原生 `lazy` 属性**：

```typescript
// AsyncRoute.tsx - 按 AppType 分目录动态导入
const importRoute = (page: string, type: AppType) => {
    switch (type) {
        case AppType.Dashboard:
            return import(/* webpackChunkName: "[request]" */ `../../apps/dashboard/routes/${page}`);
        case AppType.Experimental:
            return import(/* webpackChunkName: "[request]" */ `../../apps/experimental/routes/${page}`);
        case AppType.Stable:
            return import(/* webpackChunkName: "[request]" */ `../../apps/stable/routes/${page}`);
    }
};
```

Webpack 的 `[request]` magic comment 为每个页面生成独立 chunk，实现按需加载。

---

## 5. 状态管理方案

Jellyfin Web **没有使用 Redux、Zustand、MobX 等外部状态管理库**。状态管理完全基于三个支柱：

### 5.1 架构概览

```
QueryClientProvider (TanStack Query)
└── ApiProvider (React Context - API 客户端 + 当前用户)
    └── UserSettingsProvider (React Context - 用户偏好)
        └── WebConfigProvider (React Context - Web 配置)
            └── RootAppRouter (路由树)
```

### 5.2 三个核心 Context Provider

#### ApiProvider (`hooks/useApi.tsx`)

最关键的 Context，提供 API 连接状态：

```typescript
interface JellyfinApiContext {
    __legacyApiClient__?: ApiClient  // Legacy API 客户端
    api?: Api                         // @jellyfin/sdk 现代 API 实例
    user?: UserDto                    // 当前登录用户
}
```

- 监听 `localusersignedin` / `localusersignedout` Legacy 事件
- 通过 `toApi()` 将 Legacy `ApiClient` 转换为现代 `@jellyfin/sdk` 的 `Api` 实例
- 所有 TanStack Query hooks 都依赖 `useApi()` 获取 `api` 和 `user`

#### UserSettingsProvider (`hooks/useUserSettings.tsx`)

用户显示偏好：
- `customCss` / `disableCustomCss` — 自定义 CSS
- `theme` / `dashboardTheme` — 主题选择
- `dateTimeLocale` / `language` — 语言与日期格式

通过监听 Legacy `userSettings` 对象的 `change` 事件，将命令式状态桥接到 React。

#### WebConfigProvider (`hooks/useWebConfig.tsx`)

从 `config.json` 加载静态配置并通过 Context 提供。

### 5.3 服务器状态 — TanStack React Query

**QueryClient 配置**（`utils/query/queryClient.ts`）：

```typescript
export const queryClient = new QueryClient({
    defaultOptions: {
        mutations: { networkMode: 'always' },  // 支持 localhost 无网络场景
        queries: { networkMode: 'always' }
    }
});
```

**全项目共 86 个文件使用 `useQuery` / `useMutation`**，遵循统一模式：

```typescript
// 模式 A: 标准 Query Hook
const fetchConfiguration = async (api: Api, options?: AxiosRequestConfig) => {
    const response = await getConfigurationApi(api).getConfiguration(options);
    return response.data;
};

export const useConfiguration = () => {
    const { api } = useApi();
    return useQuery({
        queryKey: ['Configuration'],
        queryFn: ({ signal }) => fetchConfiguration(api!, { signal }),
        enabled: !!api
    });
};

// 模式 B: queryOptions 工厂（支持组件外 prefetch）
export const getItemQuery = (api, itemId, userId) => queryOptions({
    queryKey: ['User', userId, 'Items', itemId],
    queryFn: ({ signal }) => fetchItem(api!, itemId!, userId!, { signal }),
    staleTime: 1000,
    enabled: !!api && !!userId && !!itemId
});

// 模式 C: Mutation + 缓存失效
export const useUpdateUser = () => {
    const { api } = useApi();
    return useMutation({
        mutationFn: (params) => getUserApi(api!).updateUser(params),
        onSuccess: (_, params) => {
            void queryClient.invalidateQueries({ queryKey: ['Users', params.userId] });
        }
    });
};
```

### 5.4 URL 状态

通过 React Router 的 `useSearchParams` 及自定义包装器管理：
- `useCurrentTab` — 从 URL 参数读取当前 Tab
- `useSearchParam` — 双向同步 URL 搜索参数

### 5.5 本地持久化

`useLocalStorage` Hook 提供 `localStorage` 键值存储的 React 封装。

### 5.6 Legacy 事件桥接

自定义 pub/sub 系统（`utils/events.ts`）在任意 JS 对象上挂载回调：

```typescript
// Events.on(obj, 'eventName', handler)
// Events.off(obj, 'eventName', handler)
// Events.trigger(obj, 'eventName', args)
```

用于桥接非 React 代码（播放管理器、服务器通知、Legacy API 客户端）与 React 状态更新。Context Provider 订阅这些事件并转换为 `useState` 调用或 Query 缓存失效。

### 5.7 Hooks 一览

| Hook | 文件 | 职责 |
|------|------|------|
| `useApi` | `hooks/useApi.tsx` | API 客户端 + 用户 Context |
| `useUserSettings` | `hooks/useUserSettings.tsx` | 用户偏好 Context |
| `useWebConfig` | `hooks/useWebConfig.tsx` | Web 配置 Context |
| `useFetchItems` | `hooks/useFetchItems.ts` | 大型数据获取 Hook 集合（911 行） |
| `useItem` | `hooks/useItem.ts` | 单项获取 |
| `useConfiguration` | `hooks/useConfiguration.ts` | 服务器配置 |
| `useUsers` | `hooks/useUsers.ts` | 用户列表 |
| `useUserViews` | `hooks/useUserViews.ts` | 用户媒体库视图 |
| `useSystemInfo` | `hooks/useSystemInfo.ts` | 系统信息 |
| `useLocale` | `hooks/useLocale.tsx` | 语言与日期本地化 |
| `useThemes` | `hooks/useThemes.ts` | 主题列表 |
| `useLocalStorage` | `hooks/useLocalStorage.tsx` | localStorage 封装 |
| `useCurrentTab` | `hooks/useCurrentTab.ts` | URL Tab 参数 |
| `useSearchParam` | `hooks/useSearchParam.ts` | URL 搜索参数双向同步 |
| `useElementSize` | `hooks/useElementSize.ts` | ResizeObserver 元素尺寸 |
| `usePrevious` | `hooks/usePrevious.ts` | 前一值追踪 |

---

## 6. 组件层次设计

### 6.1 组件分类

```
components/
├── 应用框架层
│   ├── AppBody.tsx           # 双容器布局（Legacy + React 共存）
│   ├── AppHeader.tsx         # Legacy DOM 脚手架（libraryMenu 依赖）
│   ├── Backdrop.tsx          # 全局背景
│   ├── Page.tsx              # React 页面基础组件（生命周期事件桥接）
│   └── ConnectionRequired.tsx # 路由守卫
│
├── 路由层
│   ├── router/AsyncRoute.tsx        # 异步路由工厂
│   ├── router/LegacyRoute.tsx       # Legacy 路由工厂
│   ├── router/ErrorBoundary.tsx     # 路由错误边界
│   ├── router/FallbackRoute.tsx     # 404 / Legacy URL 重定向
│   ├── router/BangRedirect.tsx      # /!path → /path 重定向
│   ├── router/appRouter.js          # Legacy 导航单例
│   └── router/routerHistory.ts      # History API 适配器
│
├── Legacy 视图引擎
│   ├── viewManager/viewManager.js   # 视图生命周期管理
│   ├── viewManager/ViewManagerPage.tsx # React→Legacy 桥接组件
│   └── viewContainer.js             # DOM 注入 + 3 页循环缓冲
│
├── 通用 UI 组件
│   ├── common/SectionContainer.tsx  # 内容区域容器（Header + Scroller + Cards）
│   ├── common/NoItemsMessage.tsx    # 空状态提示
│   ├── cardbuilder/                 # 媒体卡片构建器
│   ├── indicators/                  # 进度/状态指示器
│   ├── images/                      # 图片组件
│   └── listview/                    # 列表视图
│
├── MUI 扩展
│   ├── ElevationScroll.tsx          # AppBar 滚动阴影
│   ├── ResponsiveDrawer.tsx         # 响应式侧边栏
│   ├── toolbar/AppToolbar.tsx       # 应用工具栏
│   ├── ConfirmDialog.tsx            # 确认对话框
│   └── InputDialog.tsx              # 输入对话框
│
├── 媒体功能组件
│   ├── playback/                    # 播放控制
│   ├── nowPlayingBar/               # 正在播放栏
│   ├── subtitlesettings/            # 字幕设置
│   ├── recordingcreator/            # 录制管理
│   └── guide/                       # 电视指南
│
└── 主题与样式
    ├── ThemeCss.tsx                 # 主题 CSS 加载器
    ├── CustomCss.tsx                # 用户自定义 CSS
    └── ServerContentPage.tsx        # 服务端 HTML 页面渲染
```

### 6.2 关键设计模式

#### 双容器渲染（Legacy/React 共存）

`AppBody` 组件创建两个并列容器：

```tsx
const AppBody = ({ children }) => (
    <>
        <div className='mainAnimatedPages skinBody' />  {/* Legacy ViewManager 注入目标 */}
        <div className='skinBody'>{children}</div>        {/* React 渲染目标 */}
    </>
);
```

当 React 页面激活时，`Page` 组件调用 `viewManager.hideView()` 隐藏 Legacy 容器；当 Legacy 路由激活时，`ViewManagerPage` 将 HTML 注入第一个容器。

#### Page 组件生命周期桥接

`Page` 组件在挂载时派发自定义 DOM 事件，供 Legacy 代码（`libraryMenu`、`appRouter`）消费：

```
挂载 → viewManager.hideView()
     → dispatch('viewbeforeshow')
     → dispatch('pagebeforeshow')
     → dispatch('viewshow')
     → dispatch('pageshow')
```

#### ViewManager 循环缓冲

`viewContainer` 维护 3 个页面槽位的循环缓冲区：

```javascript
const pageContainerCount = 3;
// 每次加载新 Legacy 页面时，使用下一个槽位
// 支持前进/后退动画和视图恢复
```

#### Feature 目录模式（Dashboard）

Dashboard 应用采用 Feature-based 目录组织：

```
apps/dashboard/features/
├── users/          # 用户管理
│   ├── api/        # TanStack Query hooks (useUsers, useUpdateUser 等)
│   └── components/ # UI 组件
├── plugins/        # 插件管理
├── tasks/          # 定时任务
├── devices/        # 设备管理
├── libraries/      # 媒体库管理
├── activity/       # 活动日志
├── branding/       # 品牌设置
├── backups/        # 备份管理
├── logs/           # 日志查看
├── settings/       # 服务器设置
├── livetv/         # 直播电视管理
└── ...
```

---

## 7. 构建与开发配置

### 7.1 Webpack 三层配置

| 配置文件 | 用途 |
|---------|------|
| `webpack.common.js` | 共享基础配置 |
| `webpack.dev.js` | 开发模式覆盖 |
| `webpack.prod.js` | 生产模式覆盖 |
| `webpack.analyze.js` | 包分析（基于生产配置） |

### 7.2 入口配置

```javascript
entry: {
    'main.jellyfin': './index.jsx',        // 主应用入口
    ...THEMES_BY_ID                         // 每个主题目录作为独立入口
    // 生产模式额外包含 'serviceworker': './serviceworker.js'
}
```

### 7.3 Loader 管线

| 文件类型 | Loader 链 | 说明 |
|---------|----------|------|
| `.tsx` / `.ts` | `ts-loader`（transpileOnly） | 仅转译，类型检查由 `ForkTsCheckerWebpackPlugin` 异步执行 |
| `.js` / `.jsx` / `.mjs` | `babel-loader`（缓存启用） | 显式 include ~40 个 node_modules 包 |
| `.worker.ts` | `worker-loader` → `ts-loader` | Web Worker TypeScript |
| `.scss` / `.css` | `sass-loader` → `postcss-loader` → `css-loader` → extract/inject | Dev: `style-loader`; Prod: `MiniCssExtractPlugin` |
| `.html` | `html-loader` | Legacy HTML 模板 |
| 图片/字体/音频 | `asset/resource` | Webpack 5 内置 Asset Modules |
| jQuery | `expose-loader` | 暴露为全局 `$` 和 `jQuery` |

### 7.4 代码分割策略

```javascript
optimization: {
    runtimeChunk: 'single',           // 共享运行时
    splitChunks: {
        chunks: 'all',
        maxInitialRequests: Infinity,   // 不限初始请求数
        cacheGroups: {
            node_modules: {
                // 每个 npm 包独立 chunk
                // @scope/package → node_modules.@scope.package
                // date-fns/locale/xx → 每个语言独立 chunk
            }
        }
    }
}
```

**特点**：
- 每个 npm 包生成独立 chunk → 精细粒度缓存
- `date-fns` 的每个 locale 独立分块 → 按需加载日期本地化
- React Router `lazy` + Webpack `import()` → 页面级代码分割

### 7.5 Dev vs Prod 对比

| 特性 | 开发模式 | 生产模式 |
|------|---------|---------|
| Source Map | `eval-cheap-module-source-map` | 无 |
| CSS 处理 | `style-loader`（HMR 友好） | `MiniCssExtractPlugin`（独立文件） |
| Service Worker | 不包含 | 包含 |
| 压缩/Tree-shaking | 关闭 | 启用 |
| Dev Server | 启用（压缩、仅显示错误） | — |

### 7.6 Babel 配置

```javascript
// babel.config.js
presets: [
    ['@babel/preset-env', { useBuiltIns: 'usage', corejs: 3 }],
    '@babel/preset-react'
]
// sourceType: 'unambiguous' — 自动检测 ESM/CJS
```

### 7.7 PostCSS 配置

```javascript
// postcss.config.js
plugins: [
    postcssPresetEnv(),   // CSS 新特性降级
    autoprefixer(),        // 浏览器前缀
    cssnano()             // CSS 压缩
]
```

### 7.8 构建时注入常量

| 常量 | 来源 | 用途 |
|------|------|------|
| `__COMMIT_SHA__` | `git describe --always --dirty` | 版本标识 |
| `__JF_BUILD_VERSION__` | `JELLYFIN_VERSION` 环境变量 | 构建版本号 |
| `__PACKAGE_JSON_NAME__` | `package.json` | 包名 |
| `__PACKAGE_JSON_VERSION__` | `package.json` | 包版本 |
| `__USE_SYSTEM_FONTS__` | 环境变量 | 是否使用系统字体 |
| `__WEBPACK_SERVE__` | Webpack 自动设置 | 是否为开发服务器 |

### 7.9 测试配置

Vitest（独立于 Webpack）使用 `vite.config.ts`：

```typescript
// vite.config.ts — 仅用于测试
export default defineConfig({
    plugins: [tsconfigPaths()],
    test: {
        coverage: { include: ['src'] },
        environment: 'jsdom',
        restoreMocks: true
    }
});
```

---

## 8. Legacy 代码现状

### 8.1 Legacy 代码范围

Jellyfin Web 正在从**传统 HTML 模板 + 命令式 JS 控制器**架构向 **React + TypeScript** 迁移。迁移尚未完成，两种范式共存。

#### Legacy 代码组成

| 区域 | 文件数 | 说明 |
|------|--------|------|
| `controllers/` | ~40 文件 | HTML 模板 + JS 控制器（页面级） |
| `plugins/` | 14 目录 | 播放器插件和屏保（纯 JS） |
| `scripts/` | 32 文件 | 工具脚本（浏览器检测、库菜单、主题管理等） |
| `elements/` | ~25 条目 | `emby-*` 自定义 Web Components（V0 API） |
| `lib/legacy/` | 1 入口 | Polyfill 聚合（core-js, jQuery, 多种 polyfill） |
| `lib/jellyfin-apiclient/` | 2 文件 | Legacy API 客户端连接管理器 |

#### 具体 Legacy 模式统计

| 模式 | 出现次数 | 文件数 |
|------|---------|--------|
| `innerHTML =` 赋值 | 64 | ~30 |
| `document.querySelector` | 52 | ~27 |
| jQuery `$()` / `.html()` 等 | 35 | ~10 |
| `globalize.translateHtml` | — | ~69 个 HTML 模板 |

### 8.2 自定义 Web Components

`emby-*` 系列组件使用**已弃用的 V0 Custom Elements API**：

```javascript
// 使用 Object.create 而非 class extends
Object.create(HTMLButtonElement.prototype)
// 使用 createdCallback / attachedCallback 而非 constructor / connectedCallback
```

包括：`emby-button`, `emby-checkbox`, `emby-collapse`, `emby-input`, `emby-select`, `emby-slider`, `emby-tabs`, `emby-textarea`, `emby-toggle` 等。

部分已有 React 包装器：`Button.tsx`, `IconButton.tsx`, `Scroller.tsx`, `ItemsContainer.tsx`, `SelectElement.tsx`, `CheckBoxElement.tsx`。

### 8.3 ViewManager — Legacy 视图生命周期

```
请求加载 Legacy 页面
  → importController(appType, controller, view)
  → 加载 HTML 模板 + globalize.translateHtml 翻译
  → viewContainer.loadView() 注入 DOM（3 页循环缓冲）
  → new Controller(viewElement, params) 实例化控制器
  → 派发 viewinit → viewbeforeshow → viewshow 事件
  → 控制器通过 document.querySelector 操作 DOM
```

### 8.4 迁移状态

| 区域 | 迁移进度 | 说明 |
|------|---------|------|
| **Dashboard** | ★★★★★ | 几乎完全 React 化（30 Async / 3 Legacy 路由） |
| **Experimental UI** | ★★★★☆ | 主要页面已迁移（11 Async / 8 Legacy 路由） |
| **Stable UI** | ★★☆☆☆ | 核心页面仍为 Legacy（5 Async / 14 Legacy 路由） |
| **Wizard** | ★☆☆☆☆ | 全部 Legacy（0 Async / 6 Legacy 路由） |
| **播放器插件** | ★☆☆☆☆ | 全部 Legacy JS |
| **自定义元素** | ★★☆☆☆ | V0 API，部分有 React 包装器 |

---

## 9. 国际化方案

### 9.1 架构概述

Jellyfin Web 使用**自定义国际化系统**（非 `react-i18next` 或 `formatjs/intl`），基于位置参数的字符串替换。

### 9.2 翻译文件

- **位置**：`src/strings/`
- **格式**：扁平 JSON 键值对，99 个语言文件
- **占位符**：`{0}`, `{1}` 位置参数

```json
// strings/en-us.json
{
    "Absolute": "Absolute",
    "AccessRestrictedTryAgainLater": "Access is currently restricted. Please try again later.",
    "AddedOnValue": "Added {0}",
    "HeaderEditImages": "Edit Images"
}
```

### 9.3 Globalize 模块

`lib/globalize/index.js`（303 行）提供核心翻译引擎：

| API | 用途 |
|-----|------|
| `translate(key, ...args)` | 字符串翻译 + 参数替换 |
| `translateHtml(html, module)` | HTML 模板中 `${KeyName}` 标记替换 |
| `loadStrings(options)` | 加载翻译字典 |
| `register(options)` | 注册翻译模块 |
| `updateCurrentCulture()` | 检测并应用语言偏好 |
| `getCurrentLocale()` | 获取当前语言 |
| `getIsRTL()` | RTL（右到左）检测 |

### 9.4 两种集成路径

**路径 A — Legacy HTML 模板**：

```html
<!-- HTML 模板中使用 ${Token} 标记 -->
<h3>${HeaderEditImages}</h3>
<button>${ButtonBack}</button>
```

由 `globalize.translateHtml(html, 'core')` 递归查找并替换 `${...}` 标记。

**路径 B — React / JS 代码**：

```typescript
// 直接调用 globalize.translate()
import globalize from 'lib/globalize';
globalize.translate('Search')        // → "搜索"
globalize.translate('AddedOnValue', '2024-01-01')  // → "Added 2024-01-01"
```

### 9.5 RTL 支持

内置检测：Arabic (`ar`)、Farsi (`fa`)、Urdu (`ur`)、Hebrew (`he`)。自动设置 `dir="rtl"` 并加载 `rtl.scss`。

### 9.6 语言注册

`lib/globalize/locales.ts` 注册 65 个活跃语言映射：

```typescript
// locales.ts
const locales: Record<string, () => Promise<any>> = {
    'en-us': () => import('../../strings/en-us.json'),
    'zh-cn': () => import('../../strings/zh-cn.json'),
    'ja': () => import('../../strings/ja.json'),
    // ... 共 65 个
};
```

翻译文件按需动态加载，不打入主 bundle。

---

## 10. 主题系统

### 10.1 双轨主题架构

Jellyfin Web 的主题系统运行在两个并行轨道上：

#### SCSS 轨道（Legacy/CSS）

每个主题是独立的 **Webpack 入口点**，编译为独立 CSS 文件：

```
themes/
├── _base/
│   ├── _palette.scss      # 默认 SCSS 变量（!default）
│   └── _theme.scss        # 基础主题规则
├── dark/theme.scss         → dist/themes/dark/theme.css
├── light/theme.scss        → dist/themes/light/theme.css
├── blueradiance/theme.scss → dist/themes/blueradiance/theme.css
├── purplehaze/theme.scss   → dist/themes/purplehaze/theme.css
├── wmc/theme.scss          → dist/themes/wmc/theme.css
└── appletv/theme.scss      → dist/themes/appletv/theme.css
```

CSS 自定义属性命名规范：`--jf-palette-*`

#### MUI/TypeScript 轨道（Modern/React）

```typescript
// themes/index.ts
const DEFAULT_THEME = createTheme({
    cssVariables: {
        cssVarPrefix: 'jf',
        colorSchemeSelector: '[data-theme="%s"]',
        disableCssColorScheme: true
    },
    defaultColorScheme: 'dark',
    colorSchemes: { appletv, blueradiance, dark, light, purplehaze, wmc }
});
```

### 10.2 可用主题

| 主题 | 模式 | 主要色调 | 特点 |
|------|------|---------|------|
| `dark` | 深色 | 背景 #101010, 主色 #00a4dc | 默认主题 |
| `light` | 浅色 | 背景 #f2f2f2, 主色 #00a4dc | 浅色变体 |
| `appletv` | 浅色 | 背景 #d5e9f2 | Apple TV 风格 |
| `blueradiance` | 深色 | 背景 #011432（深蓝） | 含背景图 |
| `purplehaze` | 深色 | 主色 #48c3c8, 副色 #ff77f1 | 含背景图 |
| `wmc` | 深色 | 背景 #0c2450 | Windows Media Center 风格 |

### 10.3 运行时切换

`ThemeStorageManager` 实现 MUI `StorageManager` 接口，通过 `[data-theme="..."]` data 属性切换主题：

```typescript
// themeStorageManager.ts
subscribe: (callback) => {
    const handler = (_e, theme) => callback(theme);
    Events.on(document, EventType.THEME_CHANGE, handler);
    return () => Events.off(document, EventType.THEME_CHANGE, handler);
}
```

---

## 11. 架构总结

### 核心设计决策

| 决策 | 描述 |
|------|------|
| **渐进式迁移** | 不做大重写，通过 Legacy 桥接层让新旧代码共存 |
| **Hash 路由** | 使用 `#/` 路由确保 SPA 在各种服务器环境下工作 |
| **多应用分离** | Stable/Experimental 互斥 + Dashboard/Wizard 独立，降低耦合 |
| **TanStack Query 为核心** | 统一的服务器状态管理，无额外状态库 |
| **粒度化代码分割** | 每个页面、每个 npm 包独立 chunk |
| **双轨主题** | SCSS 独立编译 + MUI CSS 变量，支持运行时切换 |
| **自定义 i18n** | 轻量级自研方案，支持 99 种语言 |

### 架构优势

1. **平滑迁移路径**：Legacy 页面可以逐步替换为 React 组件而不影响其他部分
2. **TV/桌面/移动端统一代码库**：通过布局模式切换适配不同平台
3. **高效缓存**：npm 包独立 chunk + 内容哈希实现精细粒度浏览器缓存
4. **类型安全**：TypeScript strict 模式，渐进式类型化

### 架构挑战

1. **双容器并存增加复杂度**：React 和 Legacy DOM 操作可能产生冲突
2. **自定义 DOM 事件耦合**：Legacy 生命周期事件与 React 生命周期的协调是脆弱的
3. **V0 Custom Elements**：`emby-*` 组件使用已弃用的 API，限制现代浏览器优化
4. **自研 i18n**：缺少标准库的特性（复数、性、ICU 消息格式等）
5. **jQuery 全局依赖**：通过 `expose-loader` 暴露为全局变量，难以 tree-shake
