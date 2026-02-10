# 08 - Jellyfin Web 前端可复用设计模式分析

## 目录

1. [TanStack Query 数据层封装](#1-tanstack-query-数据层封装)
2. [自定义 Hooks 体系](#2-自定义-hooks-体系)
3. [Legacy → React 迁移策略](#3-legacy--react-迁移策略)
4. [主题系统](#4-主题系统概述)
5. [国际化（i18n）](#5-国际化i18n概述)
6. [播放器插件](#6-播放器插件概述)

---

## 1. TanStack Query 数据层封装

Jellyfin Web 使用 `@tanstack/react-query` 作为核心的服务端状态管理方案，建立了一套统一的 API 数据获取与缓存架构。

### 1.1 QueryClient 配置

QueryClient 在 `src/utils/query/queryClient.ts` 中创建，采用极简配置：

```typescript
// src/utils/query/queryClient.ts
export const queryClient = new QueryClient({
    defaultOptions: {
        mutations: {
            networkMode: 'always' // 本地运行时不需要网络连接检测
        },
        queries: {
            networkMode: 'always'
        }
    }
});
```

**设计要点：**

- **`networkMode: 'always'`**：Jellyfin 可以在 localhost 上运行，此配置跳过了 TanStack Query 默认的网络连接检测，确保本地部署也能正常发起请求。
- **没有设置全局 `staleTime`/`gcTime`**：由各 hook 根据需求自行控制缓存策略，提供更细粒度的灵活性。
- **全局单例**：通过 `RootApp.tsx` 中的 `<QueryClientProvider client={queryClient}>` 注入到 React 树。

### 1.2 Provider 层次结构

```
QueryClientProvider (queryClient)
  └─ ApiProvider (useApi - API 实例 + 用户上下文)
       └─ UserSettingsProvider (useUserSettings - 用户偏好)
            └─ WebConfigProvider (useWebConfig - 站点配置)
                 └─ RootAppRouter (路由)
```

`ApiProvider` 是 Query Hooks 的核心依赖，提供 `api`（Jellyfin SDK Api 实例）和 `user`（当前登录用户），几乎所有 Query Hook 都通过 `useApi()` 获取这两个值。

### 1.3 Query Key 命名与组织策略

项目中的 Query Key 遵循以下命名模式：

| 模式 | 示例 | 使用场景 |
|------|------|----------|
| `[资源名]` | `['Configuration']`, `['SystemInfo']`, `['Users']` | 全局单例资源 |
| `[资源名, 参数]` | `['Genres', parentId]`, `['User', userId]` | 带 ID 的资源 |
| `[层级路径]` | `['User', userId, 'Items', itemId]` | 层次化资源路径 |
| `[层级路径, 子资源]` | `['QuickConnect', 'Enabled']`, `['SyncPlay', 'Groups']` | 模块分组 |
| `[资源名, 参数对象]` | `['ItemsViewByType', { viewType, parentId, ... }]` | 复杂查询参数 |
| `[功能名, 参数对象]` | `['Search', 'Items', collectionType, parentId, searchTerm]` | 搜索等复合查询 |

**导出 QUERY_KEY 常量**的做法也很普遍，用于跨文件引用（如 mutation 后 invalidate）：

```typescript
// src/hooks/useConfiguration.ts
export const QUERY_KEY = 'Configuration';

// src/apps/dashboard/features/users/api/useUser.ts
export const QUERY_KEY = 'User';
```

### 1.4 自定义 Query Hook 封装模式

项目建立了一套统一的封装范式。以下是两种典型模式：

#### 模式一：基础模式（fetch 函数 + useQuery Hook）

这是最常见的封装模式，占比约 80%：

```typescript
// 1. 独立的 fetch 函数（纯异步，不依赖 React）
const fetchConfiguration = async (api: Api, options?: AxiosRequestConfig) => {
    const response = await getConfigurationApi(api).getConfiguration(options);
    return response.data;
};

// 2. 自定义 Hook 封装
export const useConfiguration = () => {
    const { api } = useApi();
    return useQuery({
        queryKey: [QUERY_KEY],
        queryFn: ({ signal }) => fetchConfiguration(api!, { signal }),
        enabled: !!api
    });
};
```

**核心约定：**
- **fetch 函数分离**：纯粹的异步函数，不依赖 React，方便测试和复用
- **传递 `signal`**：所有 fetch 函数都接收 `AxiosRequestConfig`，queryFn 从 `{ signal }` 中取出并传递，支持请求取消
- **`enabled` 守卫**：通过 `!!api` 或 `!!api && !!user?.Id` 确保在 API 实例/用户就绪后才发起请求

#### 模式二：queryOptions 工厂模式

用于需要在多处复用 query 配置，或在 legacy 代码中通过 `queryClient.fetchQuery` 使用的场景：

```typescript
// src/hooks/useItem.ts
export const getItemQuery = (
    api: Api | undefined,
    itemId?: string,
    userId?: string
) => queryOptions({
    queryKey: ['User', userId, 'Items', itemId],
    queryFn: ({ signal }) => fetchItem(api!, itemId!, userId!, { signal }),
    staleTime: 1000, // 1 秒
    enabled: !!api && !!userId && !!itemId
});

export const useItem = (itemId?: string) => {
    const { api, user } = useApi();
    return useQuery(getItemQuery(api, itemId, user?.Id));
};
```

导出 `queryOptions` 工厂函数允许在非 React 上下文中使用同一 query 配置：
```typescript
// legacy 代码可直接使用
const data = await queryClient.fetchQuery(getItemQuery(api, itemId, userId));
```

#### 模式三：Dashboard Feature 模块化封装

`src/apps/dashboard/features/` 下按功能领域组织 API hooks，每个 feature 有独立的 `api/` 目录：

```
apps/dashboard/features/
  ├── users/api/
  │     ├── useUser.ts            # Query: 获取单个用户
  │     ├── useUpdateUser.ts      # Mutation: 更新用户
  │     ├── useDeleteUser.ts      # Mutation: 删除用户
  │     ├── useCreateUser.ts      # Mutation: 创建用户
  │     └── useUpdateUserPolicy.ts # Mutation: 更新用户策略
  ├── plugins/api/
  │     ├── usePlugins.ts
  │     ├── useInstallPackage.ts
  │     └── useUninstallPlugin.ts
  ├── tasks/api/
  │     ├── useTasks.ts
  │     ├── useStartTask.ts
  │     └── useStopTask.ts
  └── ...
```

Dashboard 部分的 hooks 还使用了 `QueryKey` 枚举进行集中管理：

```typescript
// 某个 feature 内部定义
const getPluginsQuery = (api?: Api) => queryOptions({
    queryKey: [QueryKey.Plugins],
    queryFn: ({ signal }) => fetchPlugins(api!, { signal }),
    enabled: !!api
});
```

### 1.5 缓存策略

项目采用按需缓存策略，没有设置全局 staleTime：

| Hook | staleTime | 其他选项 | 原因 |
|------|-----------|----------|------|
| `useItem` | 1000ms (1s) | - | 初始加载多次请求，1s 内去重 |
| `useUserViews` | 1000ms (1s) | - | 初始加载多次请求同一数据 |
| `useSystemInfo` | 1000ms (1s) | `Cache-Control: no-cache` | 供 legacy JS 复用查询 |
| `useGetItems` (随机排序) | - | `gcTime: Infinity`, `refetchOnMount: false` | 随机排序结果应保持不变 |
| `useGetItemsViewByType` | - | `refetchOnWindowFocus: false`, `placeholderData: keepPreviousData` | 列表浏览时保持旧数据，避免闪烁 |
| `useLogEntries` | - | `refetchOnMount: false` | 日志数据不需要频繁刷新 |
| 多数 Hook | 默认 (0) | - | 始终获取最新数据 |

### 1.6 Mutation 处理

项目使用两种 Mutation 模式：

#### 简单 Mutation（无缓存更新）

```typescript
// src/hooks/useFetchItems.ts
export const useToggleFavoriteMutation = () => {
    const currentApi = useApi();
    return useMutation({
        mutationFn: ({ itemId, isFavorite }: ToggleFavoriteMutationProp) =>
            fetchUpdateFavoriteStatus(currentApi, itemId, isFavorite)
    });
};
```

#### 带缓存失效的 Mutation

```typescript
// src/apps/dashboard/features/users/api/useUpdateUser.ts
export const useUpdateUser = () => {
    const { api } = useApi();
    return useMutation({
        mutationFn: (params: UserApiUpdateUserRequest) =>
            getUserApi(api!).updateUser(params),
        onSuccess: (_, params) => {
            void queryClient.invalidateQueries({
                queryKey: [QUERY_KEY, params.userId]
            });
        }
    });
};
```

**注意点：**
- Mutation 成功后通过 `queryClient.invalidateQueries` 使相关缓存失效
- 直接引用全局 `queryClient` 单例（而非通过 `useQueryClient`），因为 mutation 回调可能在 React 外执行
- 项目中未使用乐观更新（Optimistic Updates），所有 mutation 都等服务端确认后再刷新 UI

### 1.7 组合查询模式

搜索功能展示了多个 Query 组合使用的高级模式：

```typescript
// src/apps/stable/features/search/api/useSearchItems.ts
export const useSearchItems = (parentId?, collectionType?, searchTerm?) => {
    // 并行发起多个子查询
    const { data: artists, isPending: isArtistsPending } = useArtistsSearch(parentId, collectionType, searchTerm);
    const { data: people, isPending: isPeoplePending } = usePeopleSearch(parentId, collectionType, searchTerm);
    const { data: videos, isPending: isVideosPending } = useVideoSearch(parentId, collectionType, searchTerm);
    // ...

    // 组合查询：等所有子查询就绪后再执行
    return useQuery({
        queryKey: ['Search', 'Items', collectionType, parentId, searchTerm],
        queryFn: async ({ signal }) => {
            // 聚合多个子查询的结果
            const sections: Section[] = [];
            addSection(sections, 'Artists', artists?.Items, { coverImage: true });
            // ...更多数据合并
            return sortSections(sections);
        },
        enabled: !!api && !!userId && !!isArtistsEnabled && !!isPeopleEnabled && ...
    });
};
```

---

## 2. 自定义 Hooks 体系

### 2.1 目录结构与分类

```
src/hooks/
  ├── api/                          # 按 API 领域分组的 hooks
  │     ├── libraryHooks/
  │     │     └── useGetDownload.ts
  │     ├── liveTvHooks/
  │     │     ├── useCancelSeriesTimer.ts
  │     │     ├── useCancelTimer.ts
  │     │     ├── useGetChannel.ts
  │     │     ├── useGetSeriesTimer.ts
  │     │     └── useGetTimer.ts
  │     └── videosHooks/
  │           └── useDeleteAlternateSources.ts
  ├── useApi.tsx                    # [Provider] API 上下文
  ├── useUserSettings.tsx           # [Provider] 用户设置上下文
  ├── useWebConfig.tsx              # [Provider] 站点配置上下文
  ├── useLocale.tsx                 # [Provider-like] 国际化 Locale
  ├── useLocalStorage.tsx           # [通用] localStorage 封装
  ├── useConfiguration.ts           # [API] 服务端配置
  ├── useNamedConfiguration.ts      # [API] 命名配置（泛型）
  ├── useFetchItems.ts              # [API] 媒体项目查询（核心文件）
  ├── useItem.ts                    # [API] 单个项目
  ├── useUsers.ts                   # [API] 用户列表
  ├── useUserViews.ts               # [API] 用户媒体库视图
  ├── useSystemInfo.ts              # [API] 系统信息
  ├── useQuickConnect.ts            # [API] 快速连接
  ├── useSyncPlayGroups.ts          # [API] SyncPlay 群组
  ├── useThemes.ts                  # [UI] 主题列表
  ├── useUserTheme.ts               # [UI] 当前用户主题
  ├── useElementSize.ts             # [UI] 元素尺寸监听
  ├── useCurrentTab.ts              # [路由] 当前标签页
  ├── useSearchParam.ts             # [路由] URL 搜索参数
  └── usePrevious.ts                # [通用] 前值引用
```

Hooks 分为以下几类：

| 类别 | 代表 Hook | 说明 |
|------|-----------|------|
| **Provider Hooks** | `useApi`, `useUserSettings`, `useWebConfig` | 通过 Context + Provider 模式提供全局状态 |
| **API Query Hooks** | `useItem`, `useUsers`, `useConfiguration` | 封装 TanStack Query 的服务端数据获取 |
| **API Mutation Hooks** | `useCancelTimer`, `useDeleteAlternateSources` | 封装 TanStack Query 的数据变更操作 |
| **UI Hooks** | `useElementSize`, `useThemes` | DOM 交互和 UI 状态 |
| **路由 Hooks** | `useCurrentTab`, `useSearchParam` | URL 状态管理 |
| **通用工具 Hooks** | `useLocalStorage`, `usePrevious` | 可在任何项目中复用的通用逻辑 |

### 2.2 典型 Hooks 详细分析

#### (1) useApi — API 上下文 Provider

**文件**: `src/hooks/useApi.tsx`

这是整个 React 数据层的基石，桥接了 legacy API client 和新的 Jellyfin SDK：

```typescript
export interface JellyfinApiContext {
    __legacyApiClient__?: ApiClient  // 旧版 jellyfin-apiclient
    api?: Api                         // 新版 @jellyfin/sdk Api
    user?: UserDto                    // 当前登录用户
}

export const useApi = () => useContext(ApiContext);
```

**核心设计：**
- 监听 `ServerConnections` 的 `localusersignedin` / `localusersignedout` 事件，同步更新 user 和 API client
- 通过 `toApi(legacyApiClient)` 将旧版 ApiClient 转换为新版 SDK Api 实例
- 保留 `__legacyApiClient__` 以供尚未迁移的代码使用
- 使用 `useMemo` 确保 context value 的引用稳定性

#### (2) useUserSettings — 用户设置 Provider

**文件**: `src/hooks/useUserSettings.tsx`

桥接 legacy 的命令式用户设置系统与 React 的声明式模型：

```typescript
const UserSettingField = {
    CustomCss: 'customCss',
    DisableCustomCss: 'disableCustomCss',
    Theme: 'appTheme',
    DashboardTheme: 'dashboardTheme',
    DateTimeLocale: 'datetimelocale',
    Language: 'language'
};
```

- 通过 `Events.on(userSettings, 'change', ...)` 监听 legacy 设置系统的变更事件
- 将命令式 API 转为声明式 Context 值
- 只追踪 React 组件实际使用的设置字段子集

#### (3) useFetchItems — 核心媒体数据查询

**文件**: `src/hooks/useFetchItems.ts`

这是最复杂的查询 Hook 文件（911 行），包含多个导出的 hooks：

- `useGetItems` — 通用项目查询
- `useGetItemsViewByType` — 按媒体库视图类型查询（支持 16 种不同 tab 类型）
- `useGetMovieRecommendations` — 电影推荐
- `useGetGenres` / `useGetStudios` — 分类和工作室
- `useGetGroupsUpcomingEpisodes` — 即将播出的剧集
- `useGetTimers` — 直播电视定时器
- `useGetSuggestionSectionsWithItems` / `useGetProgramsSectionsWithItems` — 首页区块
- `useToggleFavoriteMutation` / `useTogglePlayedMutation` — 收藏/已播放状态切换
- `usePlaylistsMoveItemMutation` — 播放列表排序

这个文件展示了一种 **策略模式**：`fetchGetItemsViewByType` 内部根据 `viewType` 的 switch 分支调用不同的 API 端点。

#### (4) useLocalStorage — 通用 localStorage 封装

**文件**: `src/hooks/useLocalStorage.tsx`

```typescript
export function useLocalStorage<T>(key: string, initialValue: T | (() => T)) {
    const [value, setValue] = useState<T>(() => {
        const storedValues = localStorage.getItem(key);
        if (storedValues != null) return JSON.parse(storedValues);
        return typeof initialValue === 'function'
            ? (initialValue as () => T)()
            : initialValue;
    });

    useEffect(() => {
        localStorage.setItem(key, JSON.stringify(value));
    }, [key, value]);

    return [value, setValue] as [typeof value, typeof setValue];
}
```

- 支持惰性初始化（`initialValue` 可以是函数）
- 自动序列化/反序列化 JSON
- API 与 `useState` 保持一致

#### (5) useSearchParam — URL 搜索参数双向绑定

**文件**: `src/hooks/useSearchParam.ts`

将 URL 查询参数与 React 状态双向同步：

```typescript
const useSearchParam = (param: string, defaultValue = '') => {
    const [searchParams, setSearchParams] = useSearchParams();
    const urlValue = searchParams.get(param) || defaultValue;
    const [value, setValue] = useState(urlValue);
    const previousValue = usePrevious(value, defaultValue);
    // ... 双向同步逻辑
    return [value, setValue];
};
```

- 结合 `usePrevious` hook 判断变更来源（组件内部 vs URL 变化）
- 支持清除参数（当值恢复为默认值时移除 URL 参数）
- 使用 `replace: true` 避免产生多余的浏览器历史记录

#### (6) useElementSize — DOM 尺寸监听

**文件**: `src/hooks/useElementSize.ts`

```typescript
export default function useElementSize<T extends HTMLElement>() {
    const target = useRef<T | null>(null);
    const [size, setSize] = useState<Size>({ width: 0, height: 0 });
    useLayoutEffect(() => {
        target.current && setSize(target.current.getBoundingClientRect());
    }, [target]);
    useResizeObserver(target, (entry) => setSize(entry.contentRect));
    return [target, size];
}
```

- 返回 ref + size 的元组，调用方只需将 ref 绑定到 DOM 元素
- 使用 `@react-hook/resize-observer` 监听尺寸变化
- 使用 `useLayoutEffect` 在首次渲染时同步获取初始尺寸

#### (7) useNamedConfiguration — 泛型配置查询

**文件**: `src/hooks/useNamedConfiguration.ts`

```typescript
export const useNamedConfiguration = <ConfigType = NamedConfiguration>(key: string) => {
    const { api } = useApi();
    return useQuery({
        queryKey: ['NamedConfiguration', key],
        queryFn: ({ signal }) =>
            fetchNamedConfiguration(api!, key, { signal }) as ConfigType,
        enabled: !!api
    });
};
```

使用 TypeScript 泛型参数让调用方可以指定返回类型，同时保持 query key 的标准化命名。

#### (8) useUsers + useUsersDetails — 数据派生 Hook

**文件**: `src/hooks/useUsers.ts`

```typescript
export const useUsersDetails = () => {
    const { data: users, ...rest } = useUsers();
    const usersById: UsersRecords = {};
    const names: string[] = [];
    if (users) {
        users.forEach(user => {
            if (user.Id) usersById[user.Id] = user;
            if (user.Name) names.push(user.Name);
        });
    }
    return { users, usersById, names, ...rest };
};
```

**组合模式**：在基础 Query Hook 之上构建派生 Hook，添加数据转换逻辑（按 ID 索引、提取名称列表），同时透传 TanStack Query 的状态标志。

### 2.3 Hooks 组合与复用模式

#### Provider 链式依赖

```
useWebConfig → useThemes → useUserTheme
useApi → useUserSettings → useLocale
```

`useUserTheme` 组合了 `useThemes`（获取可用主题列表）和 `useUserSettings`（获取用户主题偏好），加入默认值回退逻辑。

#### Feature-scoped Hooks

`src/apps/` 下各应用（stable、experimental、dashboard）有自己的 feature-level hooks：

```
apps/stable/features/search/api/
  ├── useSearchItems.ts      # 组合多个子搜索 hooks
  ├── useArtistsSearch.ts
  ├── usePeopleSearch.ts
  ├── useVideoSearch.ts
  └── useLiveTvSearch.ts
```

搜索功能通过多个专有 hooks 实现并行数据获取，再由 `useSearchItems` 统一聚合。

---

## 3. Legacy → React 迁移策略

### 3.1 旧代码范围和特征

Jellyfin Web 正处于从 legacy JavaScript（类/模块化 JS + 手动 DOM 操作）向 React 迁移的过程中。旧代码主要集中在：

| 目录 | 文件数 | 技术特征 |
|------|--------|----------|
| `src/controllers/` | ~60+ JS/HTML 文件 | 手动 DOM 操作、Class 继承、命令式视图控制 |
| `src/components/` (部分) | 混合 | 部分组件仍是 JS class 或原生自定义元素 |
| `src/plugins/` | 全部 JS | 纯 class 实现、手动事件管理 |
| `src/scripts/` | 大量 JS | 工具函数、全局管理器 |
| `src/elements/emby-*` | 混合 | 旧版 Web Components 正在逐步 React 化 |

旧代码的典型特征：

```javascript
// src/controllers/home.js — 基于 class 继承的视图控制器
class HomeView extends TabbedView {
    setTitle() {
        LibraryMenu.setTitle(null);
    }
    onResume(options) {
        super.onResume(this, options);
        document.querySelector('.skinHeader').classList.add('noHomeButtonHeader');
    }
    getTabController(index) {
        return import(`../controllers/${depends}`).then(({ default: ControllerFactory }) => {
            let controller = new ControllerFactory(
                instance.view.querySelector(".tabContent[data-index='" + index + "']"),
                instance.params
            );
            return controller;
        });
    }
}
```

```javascript
// src/controllers/itemDetails/index.js — 大量命令式 DOM 操作
import cardBuilder from 'components/cardbuilder/cardBuilder';
import itemContextMenu from 'components/itemContextMenu';
import { playbackManager } from 'components/playback/playbackmanager';
// ... 直接操作 DOM，手动管理生命周期
```

### 3.2 桥接方式：renderComponent

**关键文件**: `src/utils/reactUtils.tsx`

这是最重要的迁移桥接工具，允许在 legacy 代码中挂载 React 组件：

```typescript
export const renderComponent = <P extends object>(
    Component: React.FC<P>,
    props: P,
    element: HTMLElement
) => {
    const root = createRoot(element);
    root.render(
        <RootContext>
            <Component {...props} />
        </RootContext>
    );
    // 返回 unmount 函数，setTimeout 解决嵌套 root 问题
    return () => setTimeout(() => root.unmount());
};
```

`RootContext` 提供完整的 Provider 栈（QueryClientProvider、ApiProvider、UserSettingsProvider、WebConfigProvider、ThemeProvider），确保 legacy 环境中挂载的 React 组件可以正常使用所有 hooks。

**使用方式**：legacy controller 调用 `renderComponent(ReactButton, { props }, domElement)` 将 React 组件嵌入到旧页面的某个 DOM 节点。

### 3.3 API 层桥接

`useApi` Provider 是新旧代码共存的核心：

```typescript
export interface JellyfinApiContext {
    __legacyApiClient__?: ApiClient  // 旧版 API (jellyfin-apiclient)
    api?: Api                         // 新版 SDK (@jellyfin/sdk)
    user?: UserDto
}
```

- `__legacyApiClient__` 名称的双下划线前缀暗示这是一个过渡性属性
- `toApi(legacyApiClient)` 函数将旧的 ApiClient 转换为新的 SDK Api 实例
- 事件系统（`ServerConnections` 的 `localusersignedin`/`localusersignedout`）是双方共享的通信通道

### 3.4 queryOptions 工厂 — 为 legacy 代码提供 Query 访问

部分 hooks 导出 `queryOptions` 工厂函数（如 `getItemQuery`、`getSystemInfoQuery`、`getUserViewsQuery`），其注释明确说明了动机：

```typescript
// src/hooks/useSystemInfo.ts
export const getSystemInfoQuery = (api?: Api) => queryOptions({
    queryKey: ['SystemInfo'],
    queryFn: ({ signal }) => fetchSystemInfo(api!, { signal, headers: { 'Cache-Control': 'no-cache' } }),
    // Allow for query reuse in legacy javascript.
    staleTime: 1000, // 1 second
    enabled: !!api
});
```

legacy JS 代码可以通过 `queryClient.fetchQuery(getSystemInfoQuery(api))` 获取与 React hooks 共享的缓存数据。

### 3.5 事件系统桥接

项目维护了一个自定义事件系统 `utils/events`（类似 EventEmitter），作为新旧代码的通信机制：

```typescript
// legacy 代码触发事件
Events.trigger(ServerConnections, 'localusersignedin', updateApiUser);

// React Provider 监听事件
useEffect(() => {
    events.on(ServerConnections, 'localusersignedin', updateApiUser);
    events.on(ServerConnections, 'localusersignedout', resetApiUser);
    return () => {
        events.off(ServerConnections, 'localusersignedin', updateApiUser);
        events.off(ServerConnections, 'localusersignedout', resetApiUser);
    };
}, []);
```

`UserSettingsProvider` 同样通过 `Events.on(userSettings, 'change', ...)` 监听 legacy 设置变更。

### 3.6 迁移进度

| 领域 | 状态 | 说明 |
|------|------|------|
| **Dashboard 管理面板** | 积极迁移中 | `apps/dashboard/features/` 下大量 React 组件 + TanStack Query hooks |
| **Experimental App** | 新写代码 | `apps/experimental/` 完全基于 React |
| **Stable App** | 混合 | 部分路由已迁移到 React，部分仍使用 legacy controllers |
| **Controllers** | 待迁移 | `src/controllers/` 仍是传统 JS，是主要迁移目标 |
| **Plugins** | 未迁移 | 播放器插件全部为 JS class，与 React 通过事件通信 |
| **Elements (emby-*)** | 部分迁移 | 如 `FavoriteButton.tsx`、`PlayedButton.tsx` 已迁移 |

### 3.7 迁移策略总结

Jellyfin Web 采用 **渐进式迁移** 策略：

1. **共享状态层**：TanStack Query 的 `queryClient` 是全局单例，新旧代码共享缓存
2. **Provider 保障**：`RootContext`（reactUtils.tsx）确保任何位置的 React 组件都有完整的 Context 链
3. **API 双轨并行**：`useApi` 同时提供旧版 `ApiClient` 和新版 `Api` 实例
4. **事件总线通信**：自定义 Events 系统作为新旧代码的跨框架通信层
5. **Feature 切片重写**：Dashboard 等新功能模块按 feature 整体用 React 重写
6. **双应用共存**：`apps/stable` 和 `apps/experimental` 允许新旧实现并行运行

---

## 4. 主题系统（概述）

### 4.1 主题架构

Jellyfin Web 基于 **MUI (Material UI) Theme + SCSS 双层主题系统**：

**MUI 主题层** (`src/themes/index.ts`)：

```typescript
const DEFAULT_THEME = createTheme({
    cssVariables: {
        cssVarPrefix: 'jf',                          // CSS 变量前缀：--jf-*
        colorSchemeSelector: '[data-theme="%s"]',     // 通过 data-theme 属性切换
        disableCssColorScheme: true
    },
    defaultColorScheme: 'dark',
    colorSchemes: { appletv, blueradiance, dark, light, purplehaze, wmc }
});
```

**主题文件组织**：

```
src/themes/
  ├── _base/
  │     ├── _palette.scss    # SCSS 调色板变量
  │     ├── _theme.scss      # 基础 SCSS 主题样式（~500 行）
  │     └── theme.ts         # MUI 基础配色和组件定制
  ├── dark/
  │     ├── index.ts          # merge(DEFAULT_COLOR_SCHEME, { ... })
  │     └── theme.scss        # 仅覆盖少量 SCSS 变量
  ├── light/index.ts          # 覆盖背景色、文字色
  ├── purplehaze/index.ts     # 使用 buildCustomColorScheme() 构建
  ├── index.ts                # 组装所有主题
  ├── themeStorageManager.ts  # 自定义 MUI StorageManager
  └── utils.ts                # buildCustomColorScheme 辅助函数
```

### 4.2 CSS 变量体系

所有主题色通过 `--jf-*` 前缀的 CSS 变量暴露：

```scss
// SCSS 中通过 mixin 使用
@include var(background-color, --jf-palette-primary-main, $primary-main);
@include var(color, --jf-palette-text-secondary, $text-secondary);
```

`var` mixin 接受三个参数：CSS 属性、CSS 变量名、SCSS 回退值，确保在不支持 CSS 变量的环境下也能正常工作。

### 4.3 主题切换

- 通过 `ThemeStorageManager` 订阅 `THEME_CHANGE` 事件，通知 MUI 切换 colorScheme
- `useUserTheme` hook 从用户设置中读取当前主题 ID
- 支持为 Dashboard 和普通页面设置不同主题（`theme` vs `dashboardTheme`）

### 4.4 内置主题

| 主题 ID | 模式 | 特色 |
|---------|------|------|
| `dark` | dark | 默认主题，#101010 背景 |
| `light` | light | #f2f2f2 浅色背景 |
| `appletv` | dark | Apple TV 风格 |
| `blueradiance` | dark | 蓝色辐射背景图 |
| `purplehaze` | dark | 紫色调，#000420 背景 |
| `wmc` | dark | Windows Media Center 风格 |

---

## 5. 国际化（i18n）（概述）

### 5.1 实现方案

Jellyfin Web 使用 **自建的 globalize 模块**（`src/lib/globalize/`），而非 i18next 等第三方库。

核心 API：

```javascript
// 翻译文本
globalize.translate('HeaderFavorites')          // → "Favorites"
globalize.translate('AddedOnValue', dateStr)    // → "Added 2024-01-01"（支持参数替换）

// 翻译 HTML 模板
globalize.translateHtml(htmlTemplate)           // 替换 ${Key} 占位符
```

### 5.2 翻译文件组织

```
src/strings/
  ├── en-us.json     # 英文（基准语言，约 1200+ 条目）
  ├── zh-cn.json     # 简体中文
  ├── ja.json        # 日语
  ├── de.json        # 德语
  └── ...            # 共 100+ 种语言
```

翻译文件为简单的 key-value JSON：
```json
{
    "AddToFavorites": "Add to favorites",
    "AddedOnValue": "Added {0}",
    "AgeValue": "({0} years old)"
}
```

### 5.3 加载机制

- 启动时通过 `loadCoreDictionary()` 加载核心翻译
- 使用 webpack 动态导入按需加载语言包：`import(\`../../strings/${url}\`)`
- 回退机制：当前语言 → 语言族（去除地区后缀）→ `en-us`
- 支持 RTL 语言（阿拉伯语、波斯语、乌尔都语、希伯来语），自动切换文档方向
- 日期格式化使用 `date-fns/locale`，通过 `useLocale` hook 动态加载

### 5.4 插件翻译

插件可以注册自己的翻译字典：

```javascript
// pluginManager.js
#loadStrings(plugin) {
    const strings = plugin.getTranslations ? plugin.getTranslations() : [];
    return globalize.loadStrings({
        name: plugin.id || plugin.packageName,
        strings: strings
    });
}
```

---

## 6. 播放器插件（概述）

### 6.1 插件架构

播放器插件基于 `PluginType` 枚举和 `Plugin` 接口：

```typescript
// src/types/plugin.ts
export enum PluginType {
    MediaPlayer = 'mediaplayer',
    PreplayIntercept = 'preplayintercept',
    Screensaver = 'screensaver',
    SyncPlay = 'syncplay'
}

export interface Plugin {
    name: string
    id: string
    type: PluginType | string
    priority?: number
}
```

### 6.2 注册与加载机制

`PluginManager`（`src/components/pluginManager.js`）负责插件的生命周期管理：

```javascript
class PluginManager {
    pluginsList = [];

    async loadPlugin(pluginSpec) {
        // 支持三种加载方式：
        // 1. window 全局对象（外部插件）
        // 2. 动态 import（内置插件）：import(`../plugins/${pluginSpec}`)
        // 3. Promise/async 函数
    }

    ofType(type) {
        return this.pluginsList.filter(plugin => plugin.type === type);
    }

    firstOfType(type) {
        return this.ofType(type)
            .sort((p1, p2) => (p1.priority || 0) - (p2.priority || 0))[0];
    }
}
```

**插件加载流程**：

1. `index.jsx` 在 `loadPlugins()` 中从 `webSettings` 获取插件列表
2. 通过 `pluginManager.loadPlugin()` 逐个加载
3. 外部插件（NativeShell）通过 `window.NativeShell.getPlugins()` 注入
4. 加载完成后注册到 `pluginsList` 并触发 `registered` 事件

外部插件通过构造函数接收依赖注入：

```javascript
plugin = new PluginClass({
    events: Events, loading, appSettings,
    playbackManager, globalize, appHost,
    appRouter, inputManager, toast, confirm,
    dashboard, ServerConnections
});
```

### 6.3 关键播放器插件

| 插件 | 文件 | 类型 | 功能 |
|------|------|------|------|
| **htmlVideoPlayer** | `plugins/htmlVideoPlayer/plugin.js` | MediaPlayer | HTML5 视频播放，支持 HLS.js、FLV.js |
| **htmlAudioPlayer** | `plugins/htmlAudioPlayer/plugin.js` | MediaPlayer | HTML5 音频播放，支持 HLS.js |
| **chromecastPlayer** | `plugins/chromecastPlayer/plugin.js` | MediaPlayer | Google Cast 投屏播放 |
| **bookPlayer** | `plugins/bookPlayer/plugin.js` | MediaPlayer | EPUB 电子书阅读 |
| **photoPlayer** | `plugins/photoPlayer/plugin.js` | MediaPlayer | 照片幻灯片 |
| **pdfPlayer** | `plugins/pdfPlayer/plugin.js` | MediaPlayer | PDF 文档查看 |
| **comicsPlayer** | `plugins/comicsPlayer/plugin.js` | MediaPlayer | 漫画阅读（Swiper） |
| **youtubePlayer** | `plugins/youtubePlayer/plugin.js` | MediaPlayer | YouTube 视频嵌入 |
| **sessionPlayer** | `plugins/sessionPlayer/plugin.js` | MediaPlayer | 远程控制会话 |
| **syncPlay** | `plugins/syncPlay/plugin.ts` | SyncPlay | 同步播放（多人共看） |
| **playAccessValidation** | `plugins/playAccessValidation/plugin.js` | PreplayIntercept | 播放权限验证 |
| **backdropScreensaver** | `plugins/backdropScreensaver/plugin.js` | Screensaver | 背景图屏保 |
| **logoScreensaver** | `plugins/logoScreensaver/plugin.js` | Screensaver | Logo 屏保 |

### 6.4 播放器插件接口

所有 MediaPlayer 类型的插件遵循统一接口：

```javascript
class HtmlVideoPlayer {
    name = 'Html Video Player';
    type = PluginType.MediaPlayer;
    id = 'htmlvideoplayer';
    priority = 1;

    // 核心方法
    play(options) { ... }
    stop(destroyPlayer) { ... }
    pause() { ... }
    unpause() { ... }
    seek(positionTicks) { ... }

    // 能力查询
    canPlayMediaType(mediaType) { ... }
    canPlayItem(item, playOptions) { ... }

    // 状态查询
    currentTime() { ... }
    duration() { ... }
    volume(val) { ... }
    isMuted() { ... }
}
```

`playbackManager` 根据媒体类型和插件 priority 自动选择合适的播放器。

### 6.5 SyncPlay 插件

SyncPlay 是一个特殊的复杂插件，实现多用户同步播放：

```typescript
class SyncPlayPlugin implements Plugin {
    init() {
        // 注册播放器包装器
        SyncPlay.PlayerFactory.setDefaultWrapper(SyncPlayNoActivePlayer);
        SyncPlay.PlayerFactory.registerWrapper(SyncPlayHtmlVideoPlayer);
        SyncPlay.PlayerFactory.registerWrapper(SyncPlayHtmlAudioPlayer);

        // 监听播放器切换
        Events.on(playbackManager, 'playerchange', (_, newPlayer) => {
            SyncPlay.Manager.onPlayerChange(newPlayer);
        });
    }
}
```

它使用工厂模式（`PlayerFactory`）将实际播放器包装为可同步控制的代理，通过 Manager、Controller、PlaybackCore、QueueCore 等模块实现时间同步和状态协调。
