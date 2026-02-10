# 07 - Jellyfin Server 可复用设计模式分析

## 目录

- [1. 插件系统](#1-插件系统)
  - [1.1 插件接口定义与抽象基类](#11-插件接口定义与抽象基类)
  - [1.2 插件发现与加载机制](#12-插件发现与加载机制)
  - [1.3 插件生命周期管理](#13-插件生命周期管理)
  - [1.4 扩展点设计 — 插件服务注册](#14-扩展点设计--插件服务注册)
  - [1.5 插件配置管理](#15-插件配置管理)
- [2. 定时任务框架](#2-定时任务框架)
  - [2.1 任务定义接口](#21-任务定义接口)
  - [2.2 触发器类型](#22-触发器类型)
  - [2.3 TaskManager 调度逻辑](#23-taskmanager-调度逻辑)
  - [2.4 ScheduledTaskWorker 执行引擎](#24-scheduledtaskworker-执行引擎)
  - [2.5 进度报告机制](#25-进度报告机制)
  - [2.6 内置任务一览](#26-内置任务一览)
- [3. 事件/通知机制](#3-事件通知机制)
  - [3.1 现代事件系统 (IEventManager / IEventConsumer)](#31-现代事件系统-ieventmanager--ieventconsumer)
  - [3.2 事件参数体系](#32-事件参数体系)
  - [3.3 消费者双模式 — Logger 与 Notifier](#33-消费者双模式--logger-与-notifier)
  - [3.4 WebSocket 实时推送](#34-websocket-实时推送)
  - [3.5 遗留 EventHandler 系统](#35-遗留-eventhandler-系统)
- [4. 配置管理（概述）](#4-配置管理概述)
- [5. 备份恢复（概述）](#5-备份恢复概述)
- [6. 迁移框架（概述）](#6-迁移框架概述)

---

## 1. 插件系统

Jellyfin 的插件系统基于 .NET `AssemblyLoadContext` 实现隔离加载，通过 manifest (meta.json) 管理元数据，支持多版本共存、自动更新和 DI 服务注册。

### 1.1 插件接口定义与抽象基类

#### 核心接口层次

```
IPlugin (接口 — 所有插件的顶层契约)
  │
  ├── IPluginAssembly (接口 — 程序集属性设置)
  │
  └── BasePlugin (抽象类, 实现 IPlugin + IPluginAssembly)
        │
        └── BasePlugin<TConfigurationType> (泛型抽象类, 继承 BasePlugin, 实现 IHasPluginConfiguration)
              where TConfigurationType : BasePluginConfiguration

IPluginManager (接口 — 插件管理器契约)
IPluginServiceRegistrator (接口 — 插件 DI 服务注册)
IHasPluginConfiguration (接口 — 带配置的插件)
```

#### IPlugin — 插件顶层契约

**文件**: `MediaBrowser.Common/Plugins/IPlugin.cs`

```csharp
public interface IPlugin
{
    string Name { get; }
    string Description { get; }
    Guid Id { get; }
    Version Version { get; }
    string AssemblyFilePath { get; }
    bool CanUninstall { get; }
    string DataFolderPath { get; }
    PluginInfo GetPluginInfo();
    void OnUninstalling();
}
```

定义了插件的基本标识（Name, Id, Version）、文件路径、能力查询（CanUninstall）和生命周期钩子（OnUninstalling）。

#### BasePlugin — 通用抽象基类

**文件**: `MediaBrowser.Common/Plugins/BasePlugin.cs`

提供 `IPlugin` 和 `IPluginAssembly` 的默认实现。关键特性：

- `CanUninstall` 通过比较插件程序集目录与主应用程序目录来判断，内置组件不可卸载
- `SetAttributes()` / `SetId()` 由 `PluginManager` 在初始化阶段调用，注入路径和版本信息
- `GetPluginInfo()` 返回插件元信息 DTO

#### BasePlugin\<T> — 带类型化配置的插件基类

**文件**: `MediaBrowser.Common/Plugins/BasePluginOfT.cs`

```csharp
public abstract class BasePlugin<TConfigurationType> : BasePlugin, IHasPluginConfiguration
    where TConfigurationType : BasePluginConfiguration
```

在 `BasePlugin` 基础上增加了：
- **XML 序列化配置**：Configuration 属性延迟加载，线程安全
- **ConfigurationChanged 事件**：配置变更时触发
- **自动路径解析**：构造函数从程序集 GuidAttribute 读取插件 ID，计算数据目录路径
- **持久化**：`SaveConfiguration()` 将配置 XML 序列化到磁盘

#### PluginManifest — 插件清单模型

**文件**: `MediaBrowser.Common/Plugins/PluginManifest.cs`

JSON 序列化的插件元数据，存储为每个插件目录下的 `meta.json`：

| 属性 | 说明 |
|------|------|
| `Id` (Guid) | 插件全局唯一标识 |
| `Name` | 插件名称 |
| `Version` | 版本号字符串 |
| `TargetAbi` | 兼容的 Jellyfin 最低版本 |
| `Status` (PluginStatus) | 运行状态 |
| `AutoUpdate` | 是否自动更新 |
| `Assemblies` | 白名单 DLL 路径列表 |
| `Category`, `Description`, `Owner`, `Changelog` | 描述性元数据 |
| `ImagePath` | 插件图标路径 |

#### PluginStatus — 插件状态枚举

**文件**: `MediaBrowser.Model/Plugins/PluginStatus.cs`

```csharp
public enum PluginStatus
{
    Restart = 1,       // 需要重启才能生效（仅内存状态）
    Active = 0,        // 正常运行中
    Disabled = -1,     // 已禁用
    NotSupported = -2, // 不满足 TargetAbi 要求
    Malfunctioned = -3,// 实例化时发生错误
    Superseded = -4,   // 被更高版本取代
    Deleted = -5       // 标记删除，下次重启时物理删除
}
```

状态值按数值排序，`IsEnabledAndSupported` 判定条件为 `Status >= Active (0)` 且 ABI 兼容。

### 1.2 插件发现与加载机制

**文件**: `Emby.Server.Implementations/Plugins/PluginManager.cs`

#### 目录扫描与 Manifest 加载

```
{pluginsPath}/
├── PluginA_1.0.0/
│   ├── meta.json          ← PluginManifest
│   ├── PluginA.dll
│   └── ...
├── PluginA_2.0.0/
│   ├── meta.json
│   └── PluginA.dll
└── PluginB_1.0.0/
    └── ...
```

`DiscoverPlugins()` 的流程：

1. **枚举子目录**：扫描 `_pluginsPath` 的顶层子目录
2. **加载 Manifest**：`LoadManifest(dir)` 尝试读取 `meta.json`；如果不存在，从目录名解析版本号并自动创建 manifest
3. **按名称和版本排序**：同一插件的多个版本，最高版本优先
4. **清理旧版本**：低版本目录被物理删除（失败则标记为 Deleted）
5. **DLL 白名单校验**：`TryGetPluginDlls()` 根据 manifest 的 `Assemblies` 列表过滤，防止路径穿越攻击（canonicalize + startsWith 检查）

#### 程序集隔离加载

```csharp
var assemblyLoadContext = new PluginLoadContext(plugin.Path);
_assemblyLoadContexts.Add(assemblyLoadContext);
// ...
assemblies.Add(assemblyLoadContext.LoadFromAssemblyPath(file));
```

**PluginLoadContext**（`Emby.Server.Implementations/Plugins/PluginLoadContext.cs`）：

```csharp
public class PluginLoadContext : AssemblyLoadContext
{
    private readonly AssemblyDependencyResolver _resolver;

    public PluginLoadContext(string path) : base(true) // isCollectible = true
    {
        _resolver = new AssemblyDependencyResolver(path);
    }

    protected override Assembly? Load(AssemblyName assemblyName)
    {
        var assemblyPath = _resolver.ResolveAssemblyToPath(assemblyName);
        if (assemblyPath is not null)
            return LoadFromAssemblyPath(assemblyPath);
        return null; // fallback 到默认上下文
    }
}
```

关键设计：
- **可卸载** (`isCollectible = true`)：`Dispose()` 时通过 `Unload()` 释放所有加载的程序集
- **依赖解析隔离**：`AssemblyDependencyResolver` 基于插件目录解析私有依赖
- **Fallback 机制**：`Load()` 返回 `null` 时，CLR 会从默认 `AssemblyLoadContext` 加载共享依赖（如 Jellyfin 核心库）

#### LoadAssemblies() 流程

```
对每个已注册的 LocalPlugin:
  1. 检查 Deleted 状态 → 物理删除 + 激活替代版本
  2. 检查 IsEnabledAndSupported → 跳过禁用/不兼容的插件
  3. 创建 PluginLoadContext → 加载所有 DLL
  4. 对每个 Assembly 调用 GetTypes() 验证类型兼容性
     - TypeLoadException → 标记为 NotSupported
     - 其他异常 → 标记为 Malfunctioned
  5. yield return 成功加载的 Assembly
```

### 1.3 插件生命周期管理

完整的插件生命周期：

```
安装 (Install)
  │  从仓库下载 ZIP → 解压到 pluginsPath → PopulateManifest() 写入 meta.json
  ↓
发现 (Discover)
  │  DiscoverPlugins() 扫描目录 → 创建 LocalPlugin 列表
  ↓
加载 (Load)
  │  LoadAssemblies() → PluginLoadContext 隔离加载 DLL
  ↓
服务注册 (RegisterServices)
  │  RegisterServices() → IPluginServiceRegistrator.RegisterServices()
  ↓
实例化 (CreatePlugins)
  │  CreatePlugins() → ActivatorUtilities.CreateInstance() → IPlugin 实例
  │  插件实例绑定到 LocalPlugin.Instance → 状态设为 Active
  ↓
运行 (Active)
  │  插件提供的服务通过 DI 被系统和其他组件使用
  ↓
禁用 (Disable)
  │  DisablePlugin() → 状态改为 Disabled → 激活替代版本
  │  需要重启才能真正卸载
  ↓
卸载 (Uninstall)
  │  RemovePlugin() → 物理删除目录 → 激活替代版本
  │  失败则标记为 Deleted，下次启动时删除
  ↓
释放 (Dispose)
     PluginManager.Dispose() → assemblyLoadContext.Unload()
```

#### 多版本共存

`ProcessAlternative()` 方法处理版本切换逻辑：
- 激活一个版本时，同 ID 的其他活跃版本标记为 `Superseded`
- 禁用/删除一个版本时，自动激活同 ID 的最高可用版本
- `UpdatePluginSupersededStatus()` 在加载阶段检查被取代的版本是否还有活跃的前任，如果没有则重新激活

### 1.4 扩展点设计 — 插件服务注册

#### IPluginServiceRegistrator

**文件**: `MediaBrowser.Controller/Plugins/IPluginServiceRegistrator.cs`

```csharp
public interface IPluginServiceRegistrator
{
    void RegisterServices(IServiceCollection serviceCollection, IServerApplicationHost applicationHost);
}
```

插件通过实现此接口，在 DI 容器构建之前注册自己的服务。这是插件与宿主系统集成的核心扩展点。

#### 注册流程

```csharp
// PluginManager.RegisterServices()
foreach (var pluginServiceRegistrator in _appHost.GetExportTypes<IPluginServiceRegistrator>())
{
    var plugin = GetPluginByAssembly(pluginServiceRegistrator.Assembly);
    // 检查插件状态...
    var instance = (IPluginServiceRegistrator?)Activator.CreateInstance(pluginServiceRegistrator);
    instance?.RegisterServices(serviceCollection, _appHost);
}
```

调用时序：
1. `ApplicationHost` 调用 `PluginManager.LoadAssemblies()` 加载所有插件程序集
2. `ApplicationHost` 调用 `PluginManager.RegisterServices(serviceCollection)`
3. 遍历所有实现了 `IPluginServiceRegistrator` 的类型
4. 通过 `Activator.CreateInstance` 创建实例（此时 DI 容器尚未构建）
5. 调用 `RegisterServices()`，插件在此注册自己的服务到 `IServiceCollection`

#### 插件可用的扩展点

插件可以通过 DI 注册以下类型的服务来扩展系统功能：

| 扩展点 | 说明 |
|--------|------|
| `IScheduledTask` | 注册定时任务 |
| `IEventConsumer<T>` | 订阅系统事件 |
| `IConfigurationFactory` | 注册配置模块 |
| `IMetadataProvider<T>` | 提供元数据提供者 |
| `IImageProvider` | 提供图片提供者 |
| `IExternalIdInfo` | 注册外部 ID 类型 |
| `IResolverIgnoreRule` | 注册库扫描忽略规则 |
| 任意自定义服务 | 插件可注册任意接口的实现 |

### 1.5 插件配置管理

`BasePlugin<TConfigurationType>` 提供了完整的配置管理能力：

```csharp
// 插件定义配置类型
public class MyPluginConfiguration : BasePluginConfiguration
{
    public string ApiKey { get; set; } = string.Empty;
    public bool EnableFeature { get; set; } = true;
}

// 插件继承 BasePlugin<T>
public class MyPlugin : BasePlugin<MyPluginConfiguration>
{
    // Configuration 属性自动提供类型安全的配置访问
}
```

配置存储：
- 格式：XML 序列化
- 路径：`{DataFolderPath}/{AssemblyFileName}.xml`
- 加载：`LoadConfiguration()` 延迟加载，失败时创建默认实例
- 保存：`SaveConfiguration()` 线程安全序列化
- 变更通知：`ConfigurationChanged` 事件

---

## 2. 定时任务框架

Jellyfin 实现了一套完整的定时任务框架，支持多种触发器类型、进度报告、任务排队和 REST API 控制。

### 2.1 任务定义接口

#### IScheduledTask — 任务定义契约

**文件**: `MediaBrowser.Model/Tasks/IScheduledTask.cs`

```csharp
public interface IScheduledTask
{
    string Name { get; }
    string Key { get; }
    string Description { get; }
    string Category { get; }
    Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken);
    IEnumerable<TaskTriggerInfo> GetDefaultTriggers();
}
```

- **Name / Description / Category**：UI 展示用元数据，通常通过 `ILocalizationManager` 本地化
- **Key**：稳定的字符串标识（如 `"RefreshLibrary"`, `"PluginUpdates"`），用于持久化和 API 引用
- **ExecuteAsync**：实际任务逻辑，接收进度回调和取消令牌
- **GetDefaultTriggers**：返回默认触发器配置

#### IConfigurableScheduledTask — 可选扩展

**文件**: `MediaBrowser.Model/Tasks/IConfigurableScheduledTask.cs`

```csharp
public interface IConfigurableScheduledTask
{
    bool IsHidden { get; }   // 是否在 UI 中隐藏
    bool IsEnabled { get; }  // 是否启用
    bool IsLogged { get; }   // 是否记录执行日志
}
```

任务可选实现此接口来控制可见性和启停状态。触发器触发时 Worker 会检查 `IsEnabled`。

#### 框架整体架构

```
               REST API (ScheduledTasksController)
                        │
                   ITaskManager (TaskManager)
                   /              \
     IScheduledTaskWorker     ConcurrentQueue<Type, Options>
     (ScheduledTaskWorker)
          /          \
   IScheduledTask   ITaskTrigger[]
   (具体任务实现)   (DailyTrigger, IntervalTrigger, ...)
```

### 2.2 触发器类型

#### ITaskTrigger — 触发器契约

**文件**: `MediaBrowser.Model/Tasks/ITaskTrigger.cs`

```csharp
public interface ITaskTrigger
{
    event EventHandler<EventArgs>? Triggered;
    TaskOptions TaskOptions { get; }
    void Start(TaskResult? lastResult, ILogger logger, string taskName, bool isApplicationStartup);
    void Stop();
}
```

触发器是事件驱动的：满足条件时触发 `Triggered` 事件。所有触发器实现位于 `Emby.Server.Implementations/ScheduledTasks/Triggers/`。

#### 四种内置触发器

| 触发器 | 基于定时器 | 行为说明 |
|--------|-----------|---------|
| **DailyTrigger** | Timer | 计算下一个指定时间点（TimeOfDayTicks），一次性触发 |
| **WeeklyTrigger** | Timer | 从当前时间向前查找下一个匹配的星期 + 时间，一次性触发 |
| **IntervalTrigger** | Timer | 自上次完成后间隔指定时长触发；首次运行时等待 1 小时；最大 dueTime 7 天 |
| **StartupTrigger** | 延时 3 秒 | 仅在 `isApplicationStartup=true` 时触发一次 |

所有基于 Timer 的触发器使用**一次性定时器**（period = -1），在任务执行完成后由 Worker 重新启动（延迟 1 秒）。

#### 触发器配置持久化

触发器配置序列化为 `TaskTriggerInfo` 数组，存储在：

```
{ConfigDir}/ScheduledTasks/{md5-id}.js    ← JSON 数组
```

`TaskTriggerInfo` 结构：

```csharp
public class TaskTriggerInfo
{
    public string Type { get; set; }          // TaskTriggerInfoType 枚举值
    public long? TimeOfDayTicks { get; set; } // 用于 Daily/Weekly
    public long? IntervalTicks { get; set; }  // 用于 Interval
    public DayOfWeek? DayOfWeek { get; set; } // 用于 Weekly
    public long? MaxRuntimeTicks { get; set; }// 最大运行时长
}
```

如果没有持久化的配置，则使用任务的 `GetDefaultTriggers()` 返回值。

### 2.3 TaskManager 调度逻辑

**文件**: `Emby.Server.Implementations/ScheduledTasks/TaskManager.cs` (263 行)

#### 核心设计

```csharp
public class TaskManager : ITaskManager, IDisposable
{
    private readonly ConcurrentQueue<Tuple<Type, TaskOptions>> _taskQueue;
    private readonly object _taskQueueLock = new();

    // 通过 DI 注册为单例
    // serviceCollection.AddSingleton<ITaskManager, TaskManager>();
}
```

- **ConcurrentQueue 排队机制**：当一个任务正在运行时，后续请求排入队列
- **Lock 执行门控**：`QueueScheduledTask()` 在 `lock (_taskQueue)` 内原子性检查状态并决定立即执行或排队
- **类型匹配**：所有泛型方法通过 `ScheduledTask.GetType() == typeof(T)` 查找已注册的 Worker
- **事件传播**：`OnTaskExecuting` / `OnTaskCompleted` 由 Worker 回调，Manager 触发管理级别事件

#### 任务排队与执行流程

```
QueueScheduledTask<T>()
  │
  ├── lock(_taskQueue)
  │     ├── 找到对应的 ScheduledTaskWorker
  │     ├── 状态 == Idle → 立即执行 (Task.Run)
  │     └── 状态 == Running → 加入 _taskQueue
  │
  ↓ (任务完成后)
ExecuteQueuedTasks()
  │
  ├── 去重队列中的任务
  └── 对每个 Idle 的 Worker 执行排队的任务
```

关键方法：

| 方法 | 行为 |
|------|------|
| `QueueScheduledTask<T>()` | 排队或立即执行 |
| `QueueIfNotRunning<T>()` | 仅在未运行时排队 |
| `CancelIfRunningAndQueue<T>()` | 取消当前执行 + 排队新执行 |
| `CancelIfRunning<T>()` | 仅取消，不重新排队 |
| `Cancel(worker)` | 取消指定 Worker 的当前执行 |
| `Execute(worker, options)` | 直接执行，绕过排队 |

#### 任务发现与注册

在 `ApplicationHost` 启动时：

```csharp
// 从 DI 容器发现所有 IScheduledTask 实现
Resolve<ITaskManager>().AddTasks(GetExports<IScheduledTask>(false));
```

`AddTasks()` 为每个 `IScheduledTask` 创建一个 `ScheduledTaskWorker` 包装器。

### 2.4 ScheduledTaskWorker 执行引擎

**文件**: `Emby.Server.Implementations/ScheduledTasks/ScheduledTaskWorker.cs` (678 行)

这是任务执行的核心引擎，包装每个 `IScheduledTask` 实例并管理其状态、触发器和执行历史。

#### 唯一标识

```csharp
Id = ScheduledTask.GetType().FullName.GetMD5().ToString("N");
```

以任务类型全名的 MD5 哈希作为唯一 ID，用于持久化触发器和执行结果。

#### 状态管理

```csharp
public TaskState State =>
    CurrentCancellationTokenSource is null ? TaskState.Idle :
    CurrentCancellationTokenSource.IsCancellationRequested ? TaskState.Cancelling :
    TaskState.Running;
```

| 状态 | 条件 |
|------|------|
| `Idle` | CancellationTokenSource == null |
| `Running` | CancellationTokenSource != null 且未取消 |
| `Cancelling` | CancellationTokenSource.IsCancellationRequested |

#### ExecuteInternal 执行管线

```
ExecuteInternal(options)
  │
  ├── 1. 防止并发执行（检查 State != Idle → 抛异常）
  ├── 2. 停止所有触发器
  ├── 3. 创建 CancellationTokenSource（含超时）
  ├── 4. 通知 TaskManager.OnTaskExecuting
  ├── 5. 调用 ScheduledTask.ExecuteAsync(progress, token)
  │     ├── 正常完成 → Status = Completed
  │     ├── OperationCanceledException → Status = Cancelled
  │     └── Exception → Status = Failed
  ├── 6. 记录 TaskResult → 持久化到 {DataDir}/ScheduledTasks/{id}.js
  ├── 7. 释放 CancellationTokenSource
  ├── 8. 通知 TaskManager.OnTaskCompleted
  └── 9. 延迟 1 秒后重新启动所有触发器
```

#### 触发器工厂

`GetTrigger()` 方法根据 `TaskTriggerInfo.Type` 创建具体触发器实例：

```csharp
private static ITaskTrigger GetTrigger(TaskTriggerInfo info)
{
    return info.Type switch
    {
        TaskTriggerInfoType.DailyTrigger => new DailyTrigger { TimeOfDay = ... },
        TaskTriggerInfoType.WeeklyTrigger => new WeeklyTrigger { TimeOfDay = ..., DayOfWeek = ... },
        TaskTriggerInfoType.IntervalTrigger => new IntervalTrigger { Interval = ... },
        TaskTriggerInfoType.StartupTrigger => new StartupTrigger(),
        _ => throw new ArgumentException(...)
    };
}
```

#### 优雅关闭

`Dispose()` 中：取消当前令牌，等待最多 2 秒让任务退出。如果任务仍在运行，记录状态为 `Aborted`。

### 2.5 进度报告机制

```csharp
// 任务内部通过 IProgress<double> 报告进度（0-100）
public async Task ExecuteAsync(IProgress<double> progress, CancellationToken cancellationToken)
{
    var items = await GetItemsToProcess();
    for (int i = 0; i < items.Count; i++)
    {
        await ProcessItem(items[i], cancellationToken);
        progress.Report((double)(i + 1) / items.Count * 100);
    }
}
```

Worker 的 `TaskProgress` 事件将进度变更传播到外部：

```
Task.ExecuteAsync(progress)
  → Worker.OnTaskProgress (更新 CurrentProgress)
    → Worker.TaskProgress 事件
      → API/WebSocket 可实时获取 CurrentProgress
```

REST API 通过 `GET /ScheduledTasks/{taskId}` 返回的 `TaskInfo` 包含 `CurrentProgressPercentage` 字段。

### 2.6 内置任务一览

| 任务类 | Key | 默认触发器 | 说明 |
|--------|-----|-----------|------|
| `RefreshMediaLibraryTask` | RefreshLibrary | 间隔 12h | 刷新媒体库 |
| `ChapterImagesTask` | RefreshChapterImages | 每日 2:00 AM (最长 4h) | 生成章节图片 |
| `AudioNormalizationTask` | AudioNormalization | 间隔 24h | 音频标准化 |
| `MediaSegmentExtractionTask` | TaskExtractMediaSegments | 间隔 12h | 媒体分段提取 |
| `PeopleValidationTask` | RefreshPeople | 间隔 7 天 | 人物元数据验证 |
| `PluginUpdateTask` | PluginUpdates | 启动 + 间隔 24h | 插件自动更新 |
| `DeleteCacheFileTask` | DeleteCacheFiles | 间隔 24h | 清理缓存文件 |
| `DeleteLogFileTask` | CleanLogFiles | 间隔 24h | 清理日志文件 |
| `DeleteTranscodeFileTask` | DeleteTranscodeFiles | 启动 + 间隔 24h | 清理转码文件 |
| `CleanActivityLogTask` | CleanActivityLog | 无（用户配置） | 清理活动日志 |
| `CleanupUserDataTask` | CleanupUserDataTask | 无（用户配置） | 清理用户数据 |
| `CleanupCollectionAndPlaylistPathsTask` | CleanCollectionsAndPlaylists | 启动 | 清理集合/播放列表路径 |
| `OptimizeDatabaseTask` | OptimizeDatabaseTask | 间隔 6h | 数据库优化 |
| `RefreshChannelsScheduledTask` | RefreshInternetChannels | 间隔 24h | 刷新频道 |
| `RefreshGuideScheduledTask` | RefreshGuide | 间隔 24h | 刷新节目指南 |
| `KeyframeExtractionScheduledTask` | KeyframeExtraction | 间隔 24h | 关键帧提取 |
| `LyricScheduledTask` | LyricDownload | 间隔 24h | 歌词下载 |
| `TrickplayImagesTask` | ExtractTrickplayImages | 间隔型 | 缩略图/进度条预览 |
| `TrickplayMoveImagesTask` | MoveTrickplayImages | 启动型 | 迁移缩略图位置 |
| `SubtitleScheduledTask` | DownloadSubtitles | 间隔型 | 字幕下载 |

#### REST API 接口

**文件**: `Jellyfin.Api/Controllers/ScheduledTasksController.cs`

| 方法 | 路由 | 说明 |
|------|------|------|
| GET | `/ScheduledTasks` | 列出所有任务（可过滤 isHidden/isEnabled） |
| GET | `/ScheduledTasks/{taskId}` | 获取单个任务详情 |
| POST | `/ScheduledTasks/Running/{taskId}` | 启动/执行任务 |
| DELETE | `/ScheduledTasks/Running/{taskId}` | 取消运行中的任务 |
| POST | `/ScheduledTasks/{taskId}/Triggers` | 更新任务触发器配置 |

所有端点需要管理员权限 (`RequiresElevation`)。

---

## 3. 事件/通知机制

Jellyfin 采用**双层事件系统**：现代的 DI 驱动的 `IEventManager / IEventConsumer<T>` 和遗留的 .NET `EventHandler` 模式。

### 3.1 现代事件系统 (IEventManager / IEventConsumer)

#### IEventManager — 发布接口

**文件**: `MediaBrowser.Controller/Events/IEventManager.cs`

```csharp
public interface IEventManager
{
    void Publish<T>(T eventArgs) where T : EventArgs;
    Task PublishAsync<T>(T eventArgs) where T : EventArgs;
}
```

纯发布接口，无订阅方法。订阅者通过 DI 容器自动发现。

#### IEventConsumer\<T> — 消费者接口

**文件**: `MediaBrowser.Controller/Events/IEventConsumer.cs`

```csharp
public interface IEventConsumer<in T> where T : EventArgs
{
    Task OnEvent(T eventArgs);
}
```

泛型逆变接口，每个消费者处理一种事件类型。

#### EventManager — 发布实现

**文件**: `Jellyfin.Server.Implementations/Events/EventManager.cs`

```csharp
public class EventManager : IEventManager
{
    private async Task PublishInternal<T>(T eventArgs) where T : EventArgs
    {
        using var scope = _appHost.ServiceProvider?.CreateScope();
        if (scope is null) return;

        foreach (var service in scope.ServiceProvider.GetServices<IEventConsumer<T>>())
        {
            try
            {
                await service.OnEvent(eventArgs).ConfigureAwait(false);
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Uncaught exception in EventConsumer {Type}: ", service.GetType());
            }
        }
    }
}
```

关键设计：
- **DI 作为订阅注册表**：创建新的 DI 作用域，解析所有 `IEventConsumer<T>` 注册
- **顺序执行**：消费者按注册顺序依次执行，非并行
- **错误隔离**：单个消费者失败不影响其他消费者

#### 消费者 DI 注册

**文件**: `Jellyfin.Server.Implementations/Events/EventingServiceCollectionExtensions.cs`

所有消费者注册为 **Scoped** 服务。添加新消费者只需：
1. 实现 `IEventConsumer<T>`
2. 在此扩展方法中注册

### 3.2 事件参数体系

#### GenericEventArgs\<T> — 通用基类

**文件**: `Jellyfin.Data/Events/GenericEventArgs.cs`

```csharp
public class GenericEventArgs<T> : EventArgs
{
    public GenericEventArgs(T arg) { Argument = arg; }
    public T Argument { get; }
}
```

大多数事件参数继承此泛型基类：

| 事件参数 | 泛型类型 | 发布者 |
|---------|---------|--------|
| `UserCreatedEventArgs` | `User` | `UserManager` |
| `UserDeletedEventArgs` | `User` | `UserManager` |
| `UserUpdatedEventArgs` | `User` | `UserManager` |
| `UserLockedOutEventArgs` | `User` | `UserManager` |
| `UserPasswordChangedEventArgs` | `User` | `UserManager` |
| `SessionStartedEventArgs` | `SessionInfo` | `SessionManager` |
| `SessionEndedEventArgs` | `SessionInfo` | `SessionManager` |
| `PlaybackStartEventArgs` | `PlaybackProgressInfo` | `SessionManager` |
| `PlaybackStopEventArgs` | `PlaybackStopInfo` | `SessionManager` |
| `PluginInstalledEventArgs` | `InstallationInfo` | `InstallationManager` |
| `PluginUninstalledEventArgs` | `IPlugin` | `InstallationManager` |

少数事件参数直接继承 `EventArgs`：
- `PendingRestartEventArgs`：空标记事件
- `AuthenticationRequestEventArgs`：包含 Username, UserId, App 等属性
- `AuthenticationResultEventArgs`：包含 User, SessionInfo, ServerId

### 3.3 消费者双模式 — Logger 与 Notifier

同一事件可以有多个消费者，Jellyfin 中常见两种模式：

#### 模式 A：Logger — 活动日志记录

将事件持久化到活动日志（数据库），通过 `IActivityManager.CreateAsync()`：

```csharp
public class UserCreatedLogger : IEventConsumer<UserCreatedEventArgs>
{
    public async Task OnEvent(UserCreatedEventArgs eventArgs)
    {
        await _activityManager.CreateAsync(new ActivityLog(
            string.Format(CultureInfo.InvariantCulture,
                _localizationManager.GetLocalizedString("UserCreatedWithName"),
                eventArgs.Argument.Username),
            "UserCreated",
            eventArgs.Argument.Id))
            .ConfigureAwait(false);
    }
}
```

#### 模式 B：Notifier — WebSocket 实时推送

通过 `ISessionManager` 向连接的客户端推送实时消息：

```csharp
public class TaskCompletedNotifier : IEventConsumer<TaskCompletionEventArgs>
{
    public async Task OnEvent(TaskCompletionEventArgs eventArgs)
    {
        await _sessionManager.SendMessageToAdminSessions(
            SessionMessageType.ScheduledTaskEnded,
            eventArgs.Result,
            CancellationToken.None).ConfigureAwait(false);
    }
}
```

#### 完整消费者注册表

| 事件 | Logger 消费者 | Notifier 消费者 |
|------|--------------|----------------|
| `UserCreatedEventArgs` | UserCreatedLogger | — |
| `UserDeletedEventArgs` | UserDeletedLogger | UserDeletedNotifier |
| `UserLockedOutEventArgs` | UserLockedOutLogger | — |
| `UserPasswordChangedEventArgs` | UserPasswordChangedLogger | — |
| `UserUpdatedEventArgs` | — | UserUpdatedNotifier |
| `SessionStartedEventArgs` | SessionStartedLogger | — |
| `SessionEndedEventArgs` | SessionEndedLogger | — |
| `PlaybackStartEventArgs` | PlaybackStartLogger | — |
| `PlaybackStopEventArgs` | PlaybackStopLogger | — |
| `AuthenticationRequestEventArgs` | AuthenticationFailedLogger | — |
| `AuthenticationResultEventArgs` | AuthenticationSucceededLogger | — |
| `TaskCompletionEventArgs` | TaskCompletedLogger | TaskCompletedNotifier |
| `PendingRestartEventArgs` | — | PendingRestartNotifier |
| `PluginInstalledEventArgs` | PluginInstalledLogger | PluginInstalledNotifier |
| `PluginUninstalledEventArgs` | PluginUninstalledLogger | PluginUninstalledNotifier |
| `PluginUpdatedEventArgs` | PluginUpdatedLogger | — |
| `InstallationFailedEventArgs` | PluginInstallationFailedLogger | PluginInstallationFailedNotifier |
| `PluginInstallingEventArgs` | — | PluginInstallingNotifier |
| `PluginInstallationCancelledEventArgs` | — | PluginInstallationCancelledNotifier |
| `SubtitleDownloadFailureEventArgs` | SubtitleDownloadFailureLogger | — |
| `LyricDownloadFailureEventArgs` | LyricDownloadFailureLogger | — |

### 3.4 WebSocket 实时推送

#### ISessionController — 会话消息投递

**文件**: `MediaBrowser.Controller/Session/ISessionController.cs`

```csharp
public interface ISessionController
{
    bool IsSessionActive { get; }
    bool SupportsMediaControl { get; }
    Task SendMessage<T>(SessionMessageType name, Guid messageId, T data, CancellationToken cancellationToken);
}
```

#### 投递目标

| 方法 | 目标 |
|------|------|
| `SendMessageToAdminSessions` | 所有管理员会话 |
| `SendMessageToUserSessions` | 指定用户的会话 |
| `SendRestartRequiredNotification` | 所有活跃会话 |

#### BasePeriodicWebSocketListener — 订阅式推送

**文件**: `MediaBrowser.Controller/Net/BasePeriodicWebSocketListener.cs`

用于轮询/订阅模式的实时数据流。客户端发送 `Start` 消息订阅，`Stop` 消息取消订阅。

三个具体实现：
- **ActivityLogWebSocketListener**：桥接 `IActivityManager.EntryCreated` 事件
- **ScheduledTasksWebSocketListener**：推送任务状态更新
- **SessionInfoWebSocketListener**：推送会话信息更新

#### 完整数据流

```
生产者 (SessionManager, UserManager, InstallationManager)
  │
  ├── _eventManager.PublishAsync(new XxxEventArgs(...))
  │
  ↓
EventManager.PublishInternal<T>()
  │
  ├── DI scope.GetServices<IEventConsumer<T>>()
  │
  ├──→ Logger 消费者 → IActivityManager.CreateAsync()
  │                        │
  │                        ├── DB 持久化 (EF Core)
  │                        └── EntryCreated 事件 → ActivityLogWebSocketListener
  │                                                    └── WebSocket 推送到订阅客户端
  │
  └──→ Notifier 消费者 → ISessionManager.SendMessageToAdminSessions()
                          ISessionManager.SendMessageToUserSessions()
                              └── ISessionController.SendMessage() 逐会话投递
                                   └── WebSocket 推送到连接客户端
```

### 3.5 遗留 EventHandler 系统

**文件**: `MediaBrowser.Common/Events/EventHelper.cs`

```csharp
// TODO: @bond Remove
public static class EventHelper
{
    public static void QueueEventIfNotNull<T>(EventHandler<T>? handler, object sender, T args, ILogger logger)
    {
        if (handler is not null)
        {
            Task.Run(() => { handler(sender, args); });
        }
    }
}
```

标记为待移除的遗留系统。使用标准 .NET `event EventHandler<T>` 字段，在 ThreadPool 线程上触发。

仍在使用此模式的组件：
- `SessionManager`：PlaybackStart, PlaybackProgress, PlaybackStopped, SessionStarted, SessionEnded 等
- `ApplicationHost`：HasPendingRestartChanged
- `BaseConfigurationManager`：ConfigurationUpdated

注意：`SessionManager` 对同一逻辑事件**同时触发两套系统**（新的 `IEventManager` 和遗留的 `EventHandler`），表明迁移尚未完成。

---

## 4. 配置管理（概述）

### 架构设计

Jellyfin 使用**基于工厂的模块化 XML 配置系统**，分三层：

```
IConfigurationManager (基础接口)
  └── IServerConfigurationManager (服务器扩展接口)

BaseConfigurationManager (抽象实现, 383 行)
  └── ServerConfigurationManager (具体实现)

IConfigurationFactory + ConfigurationStore (模块化扩展)
```

### 核心接口

**文件**: `MediaBrowser.Common/Configuration/IConfigurationManager.cs`

关键能力：
- **主配置读写**：`CommonConfiguration` 属性 + `SaveConfiguration()` / `ReplaceConfiguration()`
- **命名子配置**：`GetConfiguration(key)` / `SaveConfiguration(key, config)` — 每个模块一个 XML 文件
- **事件通知**：`ConfigurationUpdated`, `NamedConfigurationUpdating`, `NamedConfigurationUpdated`
- **工厂注册**：`AddParts(IEnumerable<IConfigurationFactory>)` — 收集所有配置工厂

### 存储模式

- 主配置：`{ConfigDir}/system.xml` → `ServerConfiguration` 对象
- 命名子配置：`{ConfigDir}/{key}.xml` — 如 `encoding.xml`, `network.xml`, `dlna.xml`
- 内存缓存：`ConcurrentDictionary<string, object>` — 延迟加载 + 线程安全

### 工厂/Store 模式

各模块通过 `IConfigurationFactory` 注册自己的配置类型：

```csharp
// 编码模块
public class EncodingConfigurationFactory : IConfigurationFactory
{
    public IEnumerable<ConfigurationStore> GetConfigurations()
    {
        yield return new ConfigurationStore { Key = "encoding", ConfigurationType = typeof(EncodingOptions) };
    }
}

// 使用扩展方法访问
var options = configManager.GetConfiguration<EncodingOptions>("encoding");
```

已注册的配置工厂包括：`EncodingConfigurationFactory`, `LiveTvConfigurationFactory`, `NfoConfigurationFactory`, `NetworkConfigurationFactory`, `SubtitleConfigurationFactory`, `MetadataConfigurationStore` 等。

### 关键文件

| 文件 | 说明 |
|------|------|
| `MediaBrowser.Common/Configuration/IConfigurationManager.cs` | 基础接口 |
| `MediaBrowser.Controller/Configuration/IServerConfigurationManager.cs` | 服务器接口 |
| `Emby.Server.Implementations/AppBase/BaseConfigurationManager.cs` | 核心实现 (383 行) |
| `Emby.Server.Implementations/Configuration/ServerConfigurationManager.cs` | 服务器实现 |
| `MediaBrowser.Common/Configuration/IConfigurationFactory.cs` | 工厂接口 |
| `MediaBrowser.Common/Configuration/ConfigurationStore.cs` | 配置存储描述 |

---

## 5. 备份恢复（概述）

### 功能概述

Jellyfin 提供了完整的系统级备份恢复功能，以 ZIP 归档 + JSON 清单的形式存储，通过 REST API 暴露给管理员。

### 架构设计

```
IBackupService (接口)
  └── BackupService (实现, 560 行)

BackupController (REST API)
  └── POST /Backup/Create, POST /Backup/Restore, GET /Backup, GET /Backup/Manifest
```

### 备份内容

| 内容 | 默认包含 | 可选 | 说明 |
|------|---------|------|------|
| 数据库 | 是 | `Options.Database` | 所有 EF Core DbSet 序列化为 JSON |
| 配置文件 | 是 | — | `*.xml`, `*.json`, `users/`, `ScheduledTasks/` |
| 集合/播放列表 | 是 | — | `collections/`, `playlists/` |
| 元数据 | 否 | `Options.Metadata` | `metadata/` 目录 |
| 缩略图 | 否 | `Options.Trickplay` | `trickplay/` 目录 |
| 字幕 | 否 | `Options.Subtitles` | `subtitles/` 目录 |

### 备份流程

1. 运行数据库优化
2. 检查 5GB 可用空间
3. 创建 ZIP 归档 `jellyfin-backup-{timestamp}.zip`
4. 数据库：反射遍历所有 `DbSet`，事务内逐表序列化为 JSON
5. 配置：复制 XML/JSON 配置文件
6. 数据：根据选项复制数据目录
7. 写入 `manifest.json`

### 恢复流程

1. 验证归档和清单
2. 版本兼容性检查（服务器版本 ≥ 备份版本，引擎版本精确匹配）
3. 文件系统恢复（Config, Data, Root）
4. 数据库恢复：清空所有表 → 反序列化 JSON → 重新插入

### 关键文件

| 文件 | 说明 |
|------|------|
| `MediaBrowser.Controller/SystemBackupService/IBackupService.cs` | 接口 |
| `Jellyfin.Server.Implementations/FullSystemBackup/BackupService.cs` | 实现 (560 行) |
| `Jellyfin.Api/Controllers/BackupController.cs` | REST API |
| `MediaBrowser.Controller/SystemBackupService/BackupOptionsDto.cs` | 备份选项 |
| `MediaBrowser.Controller/SystemBackupService/BackupManifestDto.cs` | 清单 DTO |

---

## 6. 迁移框架（概述）

### 功能概述

Jellyfin 实现了一套**属性驱动、分阶段执行**的迁移框架，将 C# 代码迁移和 EF Core 数据库迁移统一编排。

### 架构设计

```
JellyfinMigrationService (中央编排器, 459 行)
  │
  ├── MigrationStage (阶段集合)
  │     └── CodeMigration (代码迁移包装)
  │           └── IAsyncMigrationRoutine / IMigrationRoutine (迁移实现)
  │
  ├── EF Core Migrations (通过 IMigrator 执行)
  │
  └── Backup Integration (IJellyfinDatabaseProvider / IBackupService)
```

### 迁移阶段

| 阶段 | 枚举值 | 时机 | 用途 |
|------|--------|------|------|
| `PreInitialisation` | 1 | 服务初始化前 | 修改应用配置 |
| `CoreInitialisation` | 2 | 宿主配置后 | 数据库迁移 + 代码迁移混合执行 |
| `AppInitialisation` | 3 | 服务注册后 | 最终数据整理 |

### 迁移发现与元数据

通过特性标注（`[JellyfinMigration]`）定义迁移元数据：

```csharp
[JellyfinMigration("2025-04-20T20:00:00Z", "MigrateLibraryDb")]
[JellyfinMigrationBackup(JellyfinDb = true, LegacyLibraryDb = true)]
public class MigrateLibraryDb : IAsyncMigrationRoutine
{
    public async Task PerformAsync(CancellationToken cancellationToken) { ... }
}
```

- `Order`：ISO8601 时间戳，决定执行顺序
- `Name`：人类可读名称
- `Stage`：执行阶段（默认 CoreInitialisation）
- `RunMigrationOnSetup`：首次安装时是否执行

### 执行流程

```
服务器启动
  │
  ├── CheckFirstTimeRunOrMigration()
  │     ├── 首次安装 → 标记所有迁移为已完成（除 RunMigrationOnSetup=true）
  │     └── 已有安装 → 迁移旧 migrations.xml 到 EF Core 历史表
  │
  ├── PrepareSystemForMigration()
  │     └── 聚合待执行迁移的备份需求 → 创建预迁移备份
  │
  ├── MigrateStepAsync(PreInitialisation)
  ├── MigrateStepAsync(CoreInitialisation)  ← 含 EF Core 迁移
  ├── MigrateStepAsync(AppInitialisation)
  │     │
  │     ├── 成功 → 记录到 EF Core 历史表
  │     └── 失败 → 自动回滚三种备份（library.db / EF Core DB / 全系统备份）
  │
  └── CleanupSystemAfterMigration()
        └── 清理临时备份文件
```

### 与备份系统的集成

迁移框架通过 `[JellyfinMigrationBackup]` 特性声明备份需求，`JellyfinMigrationService` 在执行前自动调用：
- `IJellyfinDatabaseProvider.MigrationBackupFast()` — EF Core 数据库快速备份
- `IBackupService.CreateBackupAsync()` — 全系统备份（元数据/字幕/缩略图）
- 文件复制 — legacy `library.db` 备份

迁移失败时自动回滚所有备份。

### 关键文件

| 文件 | 说明 |
|------|------|
| `Jellyfin.Server/Migrations/JellyfinMigrationService.cs` | 中央编排器 (459 行) |
| `Jellyfin.Server/Migrations/IAsyncMigrationRoutine.cs` | 异步迁移接口 |
| `Jellyfin.Server/Migrations/JellyfinMigrationAttribute.cs` | 迁移元数据特性 |
| `Jellyfin.Server/Migrations/JellyfinMigrationBackupAttribute.cs` | 备份需求特性 |
| `Jellyfin.Server/Migrations/Stages/JellyfinMigrationStageTypes.cs` | 阶段枚举 |
| `Jellyfin.Server/Migrations/Stages/CodeMigration.cs` | 代码迁移包装 |
| `Jellyfin.Server/Migrations/PreStartupRoutines/` | 预启动迁移 (5 个) |
| `Jellyfin.Server/Migrations/Routines/` | 主迁移 (25+ 个) |
| `src/Jellyfin.Database/.../Migrations/` | EF Core 迁移 (30+ 个) |
