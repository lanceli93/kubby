# Jellyfin API 设计与认证体系分析

## 1. API 设计总览

### 1.1 整体架构

Jellyfin 后端基于 **ASP.NET Core** 构建 RESTful API，所有 Controller 继承自 `BaseJellyfinApiController`（位于 `Jellyfin.Api/BaseJellyfinApiController.cs`），后者继承 `ControllerBase` 并设置全局路由约定和输出格式。

```csharp
[ApiController]
[Route("[controller]")]
[Produces(
    MediaTypeNames.Application.Json,
    JsonDefaults.CamelCaseMediaType,
    JsonDefaults.PascalCaseMediaType)]
public class BaseJellyfinApiController : ControllerBase
```

前端采用 **双 API 客户端架构**：遗留的 `jellyfin-apiclient`（JavaScript）和新的 `@jellyfin/sdk`（TypeScript SDK），通过 `compat.ts` 桥接层共存。

### 1.2 URL 命名规范

| 规范项 | 说明 | 示例 |
|--------|------|------|
| 路由基础 | 默认 `[controller]` 名称作为路由前缀 | `UserController` → `/Users` |
| 自定义路由 | 部分 Controller 使用 `[Route("")]` + 方法级路由 | `ItemsController` → `/Items` |
| 资源标识 | GUID 作为资源 ID，路由参数绑定 | `/Users/{userId}` |
| 操作命名 | RESTful 动词 + 资源名，非 CRUD 用自定义动作 | `POST /Users/AuthenticateByName` |
| 向后兼容 | 保留旧路由（标记 `[Obsolete]` + `[ApiExplorerSettings(IgnoreApi = true)]`） | `/Users/{userId}/Items` → `/Items?userId=` |
| BaseUrl 前缀 | 通过 `BaseUrlRedirectionMiddleware` 支持可配置的 URL 前缀 | `/jellyfin/Users` |

### 1.3 版本策略

Jellyfin **不使用 URL 版本控制**（如 `/v1/`、`/v2/`），而是通过以下方式实现兼容性演进：

- **`[Obsolete]` 标记**：旧 API 保留但标记过时
- **`[ApiExplorerSettings(IgnoreApi = true)]`**：旧 API 从 Swagger 文档中隐藏
- **委托模式**：旧路由方法直接调用新方法
- **查询参数迁移**：路径参数 → 查询参数（如 `userId` 从路径移到 `[FromQuery]`）

```csharp
// 新 API
[HttpGet("Items")]
public ActionResult<QueryResult<BaseItemDto>> GetItems([FromQuery] Guid? userId, ...)

// 旧 API（向后兼容），隐藏于 Swagger
[HttpGet("Users/{userId}/Items")]
[Obsolete("Kept for backwards compatibility")]
[ApiExplorerSettings(IgnoreApi = true)]
public ActionResult<QueryResult<BaseItemDto>> GetItemsByUserIdLegacy(
    [FromRoute] Guid userId, ...) => GetItems(userId, ...);
```

### 1.4 内容协商

通过 `BaseJellyfinApiController` 的 `[Produces]` 属性支持多种 JSON 序列化格式：

- `application/json`（标准）
- `application/json; profile="CamelCase"`
- `application/json; profile="PascalCase"`

---

## 2. 典型 Controller 分析

### 2.1 UserController — 用户管理与认证

**文件**：`Jellyfin.Api/Controllers/UserController.cs`

**路由**：`[Route("Users")]`

**设计模式分析**：

| 方面 | 实现方式 |
|------|----------|
| 依赖注入 | 构造函数注入 9 个接口（`IUserManager`, `ISessionManager`, `INetworkManager` 等） |
| 认证要求 | 方法级 `[Authorize]` 或 `[Authorize(Policy = ...)]`，公共接口无认证要求 |
| 参数绑定 | `[FromRoute]` + `[FromQuery]` + `[FromBody]`，`[Required]` 标注必填参数 |
| 返回类型 | `ActionResult<T>`，标注 `[ProducesResponseType]` |
| 错误处理 | 手动检查返回 `NotFound()` / `StatusCode(403, "message")` |

**关键端点**：

```
GET    /Users                        — 获取用户列表（需认证）
GET    /Users/Public                  — 获取公共用户列表（登录页用，无需认证）
GET    /Users/{userId}                — 获取指定用户（需认证 + IgnoreParentalControl）
GET    /Users/Me                      — 获取当前认证用户
DELETE /Users/{userId}                — 删除用户（需管理员权限 RequiresElevation）
POST   /Users/AuthenticateByName      — 用户名密码认证
POST   /Users/AuthenticateWithQuickConnect — QuickConnect 认证
POST   /Users/New                     — 创建用户（需管理员权限）
POST   /Users/Password                — 更新密码
POST   /Users/ForgotPassword          — 忘记密码
POST   /Users/ForgotPassword/Pin      — PIN 重置
POST   /Users/{userId}/Policy         — 更新用户策略（需管理员权限）
```

**认证入口实现**（`AuthenticateUserByName`）：

```csharp
[HttpPost("AuthenticateByName")]
public async Task<ActionResult<AuthenticationResult>> AuthenticateUserByName(
    [FromBody, Required] AuthenticateUserByName request)
{
    var auth = await _authContext.GetAuthorizationInfo(Request);  // 解析请求头
    var result = await _sessionManager.AuthenticateNewSession(new AuthenticationRequest
    {
        App = auth.Client,
        AppVersion = auth.Version,
        DeviceId = auth.DeviceId,
        DeviceName = auth.Device,
        Password = request.Pw,
        RemoteEndPoint = HttpContext.GetNormalizedRemoteIP().ToString(),
        Username = request.Username
    });
    return result;  // 返回 AuthenticationResult（包含 AccessToken）
}
```

### 2.2 ItemsController — 媒体项目查询

**文件**：`Jellyfin.Api/Controllers/ItemsController.cs`

**路由**：`[Route("")]`（空路由，方法级自定义）

**设计特点**：

- **超大查询接口**：`GetItems` 方法接受 60+ 个查询参数，涵盖所有媒体过滤和排序条件
- **自定义 ModelBinder**：使用 `CommaDelimitedCollectionModelBinder` 和 `PipeDelimitedCollectionModelBinder` 处理复杂集合参数
- **API Key 支持**：`User.GetIsApiKey()` 判断是否为 API Key 调用，API Key 可跳过用户级权限检查
- **全局 `[Authorize]`**：Controller 级别标注，所有方法默认需要认证

**参数绑定模式**：

```csharp
[FromQuery, ModelBinder(typeof(CommaDelimitedCollectionModelBinder))] BaseItemKind[] includeItemTypes
[FromQuery, ModelBinder(typeof(PipeDelimitedCollectionModelBinder))] string[] genres
```

**关键端点**：

```
GET /Items                           — 通用媒体项目查询
GET /UserItems/Resume                — 获取继续观看列表
GET /UserItems/{itemId}/UserData     — 获取用户对项目的交互数据
POST /UserItems/{itemId}/UserData    — 更新用户对项目的交互数据
```

### 2.3 ApiKeyController — API Key 管理

**文件**：`Jellyfin.Api/Controllers/ApiKeyController.cs`

**路由**：`[Route("Auth")]`

**设计特点**：简洁的 CRUD 控制器，所有操作都需要 `RequiresElevation`（管理员权限）。

```
GET    /Auth/Keys        — 获取所有 API Key
POST   /Auth/Keys        — 创建新 API Key
DELETE /Auth/Keys/{key}  — 撤销 API Key
```

---

## 3. 认证授权体系

### 3.1 认证方案概览

Jellyfin 使用自定义的 **`CustomAuthentication`** 认证方案（`AuthenticationSchemes.cs`），而非标准的 JWT Bearer 或 Cookie 认证。

```
认证方案名称: "CustomAuthentication"
认证处理器: CustomAuthenticationHandler
Token 类型: 不透明随机 Token（存储在数据库中）
```

### 3.2 认证流程详解

#### 3.2.1 Token 解析流程 (`AuthorizationContext`)

**文件**：`Jellyfin.Server.Implementations/Security/AuthorizationContext.cs`

Token 从以下位置依次提取（优先级从高到低）：

| 优先级 | 来源 | 格式 |
|--------|------|------|
| 1 | `Authorization` 请求头 | `MediaBrowser Client="...", Device="...", DeviceId="...", Version="...", Token="..."` |
| 2 | `X-Emby-Authorization` 请求头（遗留兼容） | 同上（需开启 `EnableLegacyAuthorization`） |
| 3 | `X-Emby-Token` 请求头（遗留兼容） | 纯 Token 值 |
| 4 | `X-MediaBrowser-Token` 请求头（遗留兼容） | 纯 Token 值 |
| 5 | `ApiKey` 查询参数 | `?ApiKey=xxx` |
| 6 | `api_key` 查询参数（遗留兼容） | `?api_key=xxx`（需开启 `EnableLegacyAuthorization`） |

**Authorization 请求头解析**：

```
Authorization: MediaBrowser Client="Jellyfin Web", Device="Chrome", DeviceId="abc123", Version="10.9.0", Token="xyz789"
```

解析器（`GetParts`）手动实现了一个基于逗号和引号的键值对解析器。

#### 3.2.2 Token 验证流程

```
请求 → AuthorizationContext.GetAuthorizationInfo()
         ├── 从请求头/查询参数提取 Token 和设备信息
         ├── 查询数据库中的 Device 记录（按 AccessToken 匹配）
         │     ├── 找到 → 标记 IsAuthenticated = true，关联 User
         │     │         └── 更新设备信息（名称、版本、最后活动时间）
         │     └── 未找到 → 查询 ApiKeys 表
         │           ├── 找到 → 标记 IsApiKey = true, IsAuthenticated = true
         │           └── 未找到 → IsAuthenticated = false
         └── 返回 AuthorizationInfo
```

#### 3.2.3 CustomAuthenticationHandler

**文件**：`Jellyfin.Api/Auth/CustomAuthenticationHandler.cs`

```csharp
protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
{
    var authorizationInfo = await _authService.Authenticate(Request);

    if (!authorizationInfo.HasToken)
        return AuthenticateResult.NoResult();  // 无 Token，跳过（可能由其他策略处理）

    // 构建 ClaimsIdentity
    var claims = new[]
    {
        new Claim(ClaimTypes.Name, user.Username),
        new Claim(ClaimTypes.Role, role),                          // "Administrator" 或 "User"
        new Claim(InternalClaimTypes.UserId, userId),
        new Claim(InternalClaimTypes.DeviceId, deviceId),
        new Claim(InternalClaimTypes.Device, device),
        new Claim(InternalClaimTypes.Client, client),
        new Claim(InternalClaimTypes.Version, version),
        new Claim(InternalClaimTypes.Token, token),
        new Claim(InternalClaimTypes.IsApiKey, isApiKey.ToString())
    };

    return AuthenticateResult.Success(new AuthenticationTicket(principal, Scheme.Name));
}
```

**Claims 映射**：

| Claim | 说明 | 来源 |
|-------|------|------|
| `ClaimTypes.Name` | 用户名 | `authorizationInfo.User.Username` |
| `ClaimTypes.Role` | 角色（`Administrator` / `User`） | API Key 或管理员 → `Administrator` |
| `Jellyfin-UserId` | 用户 ID (GUID) | `authorizationInfo.UserId` |
| `Jellyfin-DeviceId` | 设备 ID | 请求头提供或数据库补全 |
| `Jellyfin-Device` | 设备名称 | 同上 |
| `Jellyfin-Client` | 客户端名称 | 同上 |
| `Jellyfin-Version` | 客户端版本 | 同上 |
| `Jellyfin-Token` | Access Token | 请求头或查询参数 |
| `Jellyfin-IsApiKey` | 是否为 API Key | 数据库判断 |

### 3.3 授权策略体系

#### 3.3.1 策略定义 (`Policies.cs`)

**文件**：`MediaBrowser.Common/Api/Policies.cs`

```
策略名称                              说明
─────────────────────────────────────────────────────────────
RequiresElevation                     需要管理员权限
FirstTimeSetupOrElevated              首次安装向导或管理员
FirstTimeSetupOrDefault               首次安装向导或普通用户
LocalAccessOnly                       仅本地网络访问
LocalAccessOrRequiresElevation        本地访问或管理员
IgnoreParentalControl                 跳过家长控制计划
AnonymousLanAccessPolicy              允许局域网匿名访问
Download                              需要下载权限
SyncPlayHasAccess                     SyncPlay 访问权限
SyncPlayCreateGroup                   SyncPlay 创建群组权限
SyncPlayJoinGroup                     SyncPlay 加入群组权限
SyncPlayIsInGroup                     SyncPlay 在群组中权限
CollectionManagement                  合集管理权限
LiveTvAccess                          Live TV 访问权限
LiveTvManagement                      Live TV 管理权限
SubtitleManagement                    字幕管理权限
LyricManagement                       歌词管理权限
```

#### 3.3.2 策略 Handler 架构

每个策略由一对 `Requirement` + `Handler` 组成，遵循 ASP.NET Core 的 `IAuthorizationRequirement` / `AuthorizationHandler<T>` 模式。

**DefaultAuthorizationHandler**（默认策略）：

```
验证流程：
1. API Key → 直接成功（无限制）
2. 非本地网络 + 用户无远程访问权限 → 失败
3. Administrator 角色 → 直接成功
4. 需要验证家长控制计划且不在允许时间 → 失败
5. 其他情况 → 成功
```

**Handler 继承层次**：

```
DefaultAuthorizationRequirement
├── DefaultAuthorizationHandler （基础检查：网络、角色、家长控制）
├── FirstTimeSetupRequirement extends DefaultAuthorizationRequirement
│   └── FirstTimeSetupHandler （向导未完成时放行，或检查 Admin/User）
├── UserPermissionRequirement extends DefaultAuthorizationRequirement
│   └── UserPermissionHandler （检查用户特定权限位）
├── SyncPlayAccessRequirement extends DefaultAuthorizationRequirement
│   └── SyncPlayAccessHandler （检查 SyncPlay 特定权限）
└── ...
```

**AnonymousLanAccessHandler**（特殊策略）：

```csharp
// 不继承 DefaultAuthorizationRequirement，独立的策略
// 仅检查请求是否来自本地网络，允许匿名访问
if (ip is null || _networkManager.IsInLocalNetwork(ip))
    context.Succeed(requirement);
```

### 3.4 认证完整链路图

```
┌─────────────────────────────────────────────────────────────────────┐
│                        前端（jellyfin-web）                         │
│                                                                     │
│  1. 用户输入用户名/密码                                              │
│  2. POST /Users/AuthenticateByName                                 │
│     Body: { "Username": "admin", "Pw": "password" }                │
│     Header: MediaBrowser Client="Web", Device="Chrome",            │
│             DeviceId="xxx", Version="10.9.0"                        │
│  3. 收到 AuthenticationResult { AccessToken, User, ServerId }       │
│  4. 存储 AccessToken（内存/localStorage）                           │
│  5. 后续请求携带 Authorization 头                                   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     后端中间件管线                                    │
│                                                                     │
│  IPBasedAccessValidationMiddleware                                  │
│     └── 检查远程IP是否允许访问（networkManager.ShouldAllowServerAccess）│
│         ├── 不允许 → 503 Service Unavailable                       │
│         └── 允许 → 继续                                             │
│                                                                     │
│  ExceptionMiddleware                                                │
│     └── 全局异常捕获，映射异常到 HTTP 状态码                          │
│                                                                     │
│  WebSocketHandlerMiddleware                                         │
│     └── WebSocket 请求拦截，转交 IWebSocketManager                  │
│                                                                     │
│  ASP.NET Core Authentication Middleware                              │
│     └── CustomAuthenticationHandler.HandleAuthenticateAsync()       │
│         └── AuthService.Authenticate()                              │
│             └── AuthorizationContext.GetAuthorizationInfo()          │
│                 ├── 解析 Authorization 请求头                       │
│                 ├── 数据库查询 Token → Device 记录                  │
│                 ├── 或查询 ApiKeys 表                               │
│                 └── 返回 AuthorizationInfo（含 User、IsApiKey 等）  │
│                                                                     │
│  ASP.NET Core Authorization Middleware                               │
│     └── 根据 [Authorize(Policy = "...")] 选择 Handler              │
│         └── DefaultAuthorizationHandler / 其他 Handler               │
│                                                                     │
│  Controller Action 执行                                             │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.5 用户角色体系

**文件**：`Jellyfin.Api/Constants/UserRoles.cs`

```csharp
public static class UserRoles
{
    public const string Guest = "Guest";           // 访客
    public const string User = "User";             // 普通用户
    public const string Administrator = "Administrator";  // 管理员
}
```

角色分配逻辑（在 `CustomAuthenticationHandler` 中）：
- API Key → `Administrator`
- 用户有 `IsAdministrator` 权限 → `Administrator`
- 其他认证用户 → `User`

---

## 4. WebSocket 通信

### 4.1 WebSocket 架构概览

```
客户端 WebSocket 连接
    │
    ▼
WebSocketHandlerMiddleware
    │
    ▼
WebSocketManager (IWebSocketManager)
    ├── 认证验证（必须携带有效 Token）
    ├── 创建 WebSocketConnection
    ├── 通知所有 IWebSocketListener
    └── 开始接收消息循环
```

### 4.2 WebSocket 连接管理

**WebSocketManager**（`Emby.Server.Implementations/HttpServer/WebSocketManager.cs`）：

```csharp
public async Task WebSocketRequestHandler(HttpContext context)
{
    // 1. 认证（WebSocket 也需要 Token）
    var authorizationInfo = await _authService.Authenticate(context.Request);
    if (!authorizationInfo.IsAuthenticated)
        throw new SecurityException("Token is required");

    // 2. 接受 WebSocket 连接
    WebSocket webSocket = await context.WebSockets.AcceptWebSocketAsync();

    // 3. 创建连接对象
    var connection = new WebSocketConnection(logger, webSocket, authorizationInfo, remoteIP);
    connection.OnReceive = ProcessWebSocketMessageReceived;

    // 4. 通知所有 Listener 新连接
    foreach (var listener in _webSocketListeners)
        await listener.ProcessWebSocketConnectedAsync(connection, context);

    // 5. 进入接收循环
    await connection.ReceiveAsync();
}
```

### 4.3 WebSocket 消息格式

**入站消息**（客户端 → 服务端）：

```json
{
    "MessageType": "SessionsStart",
    "Data": "1000,1000"          // initialDelayMs,intervalMs
}
```

**出站消息**（服务端 → 客户端）：

```json
{
    "MessageType": "Sessions",
    "Data": [...]                 // 具体数据
}
```

**消息类型**定义在 `SessionMessageType` 枚举中，采用 **Start/Stop/Data 三消息模式**：

| 功能 | Start 消息 | Stop 消息 | 数据消息 |
|------|-----------|-----------|---------|
| 会话信息 | `SessionsStart` | `SessionsStop` | `Sessions` |
| 计划任务 | `ScheduledTasksInfoStart` | `ScheduledTasksInfoStop` | `ScheduledTasksInfo` |
| 活动日志 | `ActivityLogEntryStart` | `ActivityLogEntryStop` | `ActivityLogEntry` |
| 心跳保活 | — | — | `KeepAlive` / `ForceKeepAlive` |

### 4.4 WebSocket Listener 体系

#### 4.4.1 BasePeriodicWebSocketListener（基类）

**文件**：`MediaBrowser.Controller/Net/BasePeriodicWebSocketListener.cs`

这是一个基于 **Channel（生产者-消费者模式）** 的周期性数据推送框架：

```
客户端发送 Start 消息 → 注册连接（含 interval/delay 参数）
                    → Channel 写入触发信号
                    → 消费者循环读取，按 interval 向各连接推送数据
客户端发送 Stop 消息  → 移除连接、取消 CancellationToken
```

核心设计：
- **`SendData(bool force)`**：向 Channel 写入信号，`force=true` 立即发送，`false` 遵循 interval
- **`GetDataToSend()`**：子类实现，获取要推送的数据
- **连接管理**：线程安全的 `_activeConnections` 列表，每个连接有独立的 `CancellationTokenSource`

#### 4.4.2 具体 Listener 实现

**SessionInfoWebSocketListener**：

```csharp
// 监听 SessionManager 事件，推送活跃会话列表
protected override SessionMessageType Type => SessionMessageType.Sessions;
protected override SessionMessageType StartType => SessionMessageType.SessionsStart;
protected override SessionMessageType StopType => SessionMessageType.SessionsStop;

// 权限过滤：非管理员只能看到自己的会话
protected override Task<IEnumerable<SessionInfoDto>> GetDataToSendForConnection(
    IWebSocketConnection connection)
{
    if (!connection.AuthorizationInfo.User.HasPermission(IsAdministrator))
        sessions = sessions.Where(s => s.UserId.Equals(userId));
    ...
}
```

**ActivityLogWebSocketListener**：

```csharp
// 仅管理员可订阅活动日志
protected override void Start(WebSocketMessageInfo message)
{
    if (!message.Connection.AuthorizationInfo.User.HasPermission(IsAdministrator))
        throw new AuthenticationException("Only admin users can retrieve the activity log.");
    base.Start(message);
}
```

**ScheduledTasksWebSocketListener**：

```csharp
// 监听任务执行/完成事件，推送任务列表
// 订阅 _taskManager.TaskExecuting / TaskCompleted 事件
```

### 4.5 WebSocket 心跳机制

**SessionWebSocketListener**（`Emby.Server.Implementations/Session/SessionWebSocketListener.cs`）负责心跳管理：

```
参数：
- WebSocketLostTimeout = 60 秒
- IntervalFactor = 0.2（每 12 秒检查一次）
- ForceKeepAliveFactor = 0.75（45 秒无心跳时发送 ForceKeepAlive）

流程：
1. 新连接加入 → 发送 ForceKeepAlive 告知超时时间
2. 定时器每 12 秒触发检查：
   - 45-60 秒无心跳 → 发送 ForceKeepAlive
   - ≥60 秒无心跳 → 标记为 lost，移除连接
3. 客户端收到 ForceKeepAlive → 应回复 KeepAlive
4. 服务端收到 KeepAlive → 更新 LastKeepAliveDate，回复 KeepAlive
```

### 4.6 WebSocket 与 Session 集成

```csharp
// SessionWebSocketListener.ProcessWebSocketConnectedAsync
public async Task ProcessWebSocketConnectedAsync(IWebSocketConnection connection, HttpContext httpContext)
{
    var session = await RequestHelpers.GetSession(_sessionManager, _userManager, httpContext);
    EnsureController(session, connection);  // 将 WebSocket 绑定到 SessionInfo
    await KeepAliveWebSocket(connection);    // 启动心跳监控
}
```

每个 WebSocket 连接都绑定到一个 `SessionInfo`，通过 `WebSocketController` 管理，使得服务端可以通过 Session 向客户端推送命令（如远程控制播放）。

---

## 5. 前端 API 通信层

### 5.1 双客户端架构

Jellyfin Web 前端同时维护两套 API 客户端：

```
┌─────────────────────────────────────────────────┐
│              jellyfin-web 前端                    │
│                                                   │
│  ┌─────────────────────┐  ┌──────────────────┐  │
│  │  遗留 ApiClient      │  │  @jellyfin/sdk   │  │
│  │  (jellyfin-apiclient)│  │  (TypeScript SDK) │  │
│  │                     │  │                  │  │
│  │  • WebSocket 支持   │  │  • 类型安全      │  │
│  │  • 连接管理         │  │  • OpenAPI 生成  │  │
│  │  • 服务器发现       │  │  • TanStack Query │  │
│  └──────────┬──────────┘  └────────┬─────────┘  │
│             │                      │             │
│             └──────────┬───────────┘             │
│                        │                         │
│              compat.ts (桥接层)                   │
│              toApi(apiClient) → Api              │
└─────────────────────────────────────────────────┘
```

### 5.2 API Context 与 Provider

**文件**：`src/hooks/useApi.tsx`

```typescript
export interface JellyfinApiContext {
    __legacyApiClient__?: ApiClient   // 遗留客户端（WebSocket等）
    api?: Api                          // SDK 客户端（类型安全请求）
    user?: UserDto                     // 当前用户
}

export const ApiProvider: FC<PropsWithChildren<unknown>> = ({ children }) => {
    // 监听 ServerConnections 事件
    events.on(ServerConnections, 'localusersignedin', updateApiUser);
    events.on(ServerConnections, 'localusersignedout', resetApiUser);

    // 当 legacyApiClient 变更时，通过 compat.ts 创建 SDK Api 实例
    useEffect(() => {
        setApi(legacyApiClient ? toApi(legacyApiClient) : undefined);
    }, [legacyApiClient]);

    return <ApiContext.Provider value={context}>{children}</ApiContext.Provider>;
};
```

### 5.3 compat.ts 桥接层

**文件**：`src/utils/jellyfin-apiclient/compat.ts`

```typescript
export const toApi = (apiClient: ApiClient): Api => {
    return (new Jellyfin({
        clientInfo: { name: apiClient.appName(), version: apiClient.appVersion() },
        deviceInfo: { name: apiClient.deviceName(), id: apiClient.deviceId() }
    })).createApi(
        apiClient.serverAddress(),
        apiClient.accessToken()        // 复用遗留客户端的 Token
    );
};
```

这个桥接确保：
- 新旧客户端**共享同一个 AccessToken**
- 新旧客户端使用相同的**服务器地址和设备信息**
- 只需一次认证，两个客户端都可用

### 5.4 TanStack Query 封装模式

#### 5.4.1 查询 Hook（useQuery）

**文件**：`src/hooks/api/libraryHooks/useGetDownload.ts`

```typescript
// 1. 定义异步数据获取函数
const getDownload = async (
    apiContext: JellyfinApiContext,
    params: LibraryApiGetDownloadRequest,
    options?: AxiosRequestConfig
) => {
    const { api, user } = apiContext;
    if (!api) throw new Error('[getDownload] No API instance available');
    if (!user?.Id) throw new Error('[getDownload] No User ID provided');

    const response = await getLibraryApi(api).getDownload(params, options);
    return response.data;
};

// 2. 定义 queryOptions 工厂（可在组件外复用）
export const getDownloadQuery = (apiContext, params) =>
    queryOptions({
        queryKey: ['Download', params.itemId],
        queryFn: ({ signal }) => getDownload(apiContext, params, { signal }),
        enabled: !!apiContext.api && !!apiContext.user?.Id && !!params.itemId
    });

// 3. 导出 Hook
export const useGetDownload = (params) => {
    const apiContext = useApi();
    return useQuery(getDownloadQuery(apiContext, params));
};
```

**模式要点**：
- `queryKey` 包含操作名和参数，确保缓存正确性
- `enabled` 守卫确保 API/User 就绪后才发起请求
- 支持 `AbortSignal` 实现请求取消
- 使用 SDK 生成的类型安全的 API 方法

#### 5.4.2 变更 Hook（useMutation）

**文件**：`src/hooks/api/videosHooks/useDeleteAlternateSources.ts`

```typescript
export const useDeleteAlternateSources = () => {
    const apiContext = useApi();
    return useMutation({
        mutationFn: (params: VideosApiDeleteAlternateSourcesRequest) =>
            deleteAlternateSources(apiContext, params)
    });
};
```

#### 5.4.3 实时 WebSocket + Query 混合模式

**文件**：`src/apps/dashboard/features/tasks/hooks/useLiveTasks.ts`

```typescript
const useLiveTasks = (params) => {
    const { __legacyApiClient__ } = useApi();
    const tasksQuery = useTasks(params);          // TanStack Query 基础查询

    useEffect(() => {
        // WebSocket 消息直接更新 Query 缓存
        const onScheduledTasksUpdate = (_e, _apiClient, info: TaskInfo[]) => {
            queryClient.setQueryData([QUERY_KEY], info);
        };

        // 降级：WebSocket 不可用时轮询
        const fallbackInterval = setInterval(() => {
            if (!__legacyApiClient__?.isMessageChannelOpen()) {
                void queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
            }
        }, FALLBACK_POLL_INTERVAL_MS);

        // 发送 WebSocket 订阅消息
        __legacyApiClient__?.sendMessage(SessionMessageType.ScheduledTasksInfoStart, '1000,1000');
        Events.on(serverNotifications, SessionMessageType.ScheduledTasksInfo, onScheduledTasksUpdate);

        return () => {
            clearInterval(fallbackInterval);
            __legacyApiClient__?.sendMessage(SessionMessageType.ScheduledTasksInfoStop, null);
            Events.off(serverNotifications, SessionMessageType.ScheduledTasksInfo, onScheduledTasksUpdate);
        };
    }, [__legacyApiClient__]);

    return tasksQuery;
};
```

**模式亮点**：
- WebSocket 推送直接注入 TanStack Query 缓存（`queryClient.setQueryData`）
- WebSocket 断开时自动降级为轮询（`queryClient.invalidateQueries`）
- 清理时发送 Stop 消息取消订阅

### 5.5 前端认证流程

```
1. 用户在登录页输入用户名/密码
2. 调用 connectionManager.loginToConnect() 或 apiClient.authenticateUserByName()
3. 请求头包含：
   Authorization: MediaBrowser Client="Jellyfin Web", Device="Chrome",
                  DeviceId="<uuid>", Version="10.9.0"
   Body: { "Username": "admin", "Pw": "password" }
4. 服务端返回 AuthenticationResult:
   {
     "User": { "Id": "...", "Name": "admin", ... },
     "AccessToken": "abc123...",
     "ServerId": "..."
   }
5. ApiClient 存储 AccessToken
6. 触发 'localusersignedin' 事件
7. ApiProvider 接收事件 → 更新 legacyApiClient、api、user
8. 后续所有请求自动携带 Authorization 头
9. WebSocket 连接时也携带 Token（URL 参数或 Cookie）
```

---

## 6. 中间件管线

### 6.1 中间件列表与执行顺序

| 顺序 | 中间件 | 职责 |
|------|--------|------|
| 1 | `BaseUrlRedirectionMiddleware` | 处理 BaseUrl 前缀重定向 |
| 2 | `IPBasedAccessValidationMiddleware` | IP 过滤（远程访问控制） |
| 3 | `ExceptionMiddleware` | 全局异常处理 |
| 4 | `QueryStringDecodingMiddleware` | 查询字符串解码 |
| 5 | `ResponseTimeMiddleware` | 响应时间追踪 |
| 6 | `WebSocketHandlerMiddleware` | WebSocket 请求拦截 |
| 7 | `RobotsRedirectionMiddleware` | robots.txt 重定向 |
| 8 | `ServerStartupMessageMiddleware` | 服务器启动中提示 |
| 9 | ASP.NET Core Authentication | 认证中间件 |
| 10 | ASP.NET Core Authorization | 授权中间件 |

### 6.2 异常处理中间件

**文件**：`Jellyfin.Api/Middleware/ExceptionMiddleware.cs`

**异常 → HTTP 状态码映射**：

| 异常类型 | HTTP 状态码 |
|----------|------------|
| `ArgumentException` | 400 Bad Request |
| `AuthenticationException` | 401 Unauthorized |
| `SecurityException` | 403 Forbidden |
| `DirectoryNotFoundException` | 404 Not Found |
| `FileNotFoundException` | 404 Not Found |
| `ResourceNotFoundException` | 404 Not Found |
| `MethodNotAllowedException` | 405 Method Not Allowed |
| 其他 | 500 Internal Server Error |

**安全策略**：
- 仅在 `Development` 环境返回异常详情
- 生产环境返回通用错误消息 `"Error processing request."`
- 异常消息中的系统路径信息被自动清除

### 6.3 IP 访问控制中间件

**文件**：`Jellyfin.Api/Middleware/IpBasedAccessValidationMiddleware.cs`

```
请求到达 → 是否本机? → 是 → 放行
                    → 否 → networkManager.ShouldAllowServerAccess(remoteIP)
                              → Allow → 放行
                              → 其他 → 503 Service Unavailable + 日志记录
```

---

## 7. 错误处理模式

### 7.1 后端错误处理分层

```
层次 1: Controller 级（业务逻辑错误）
  ├── NotFound()                    → 404
  ├── BadRequest("message")         → 400
  ├── StatusCode(403, "message")    → 403
  └── Unauthorized("message")       → 401

层次 2: ExceptionMiddleware（未捕获异常）
  ├── ArgumentException             → 400
  ├── AuthenticationException       → 401
  ├── SecurityException             → 403
  ├── ResourceNotFoundException     → 404
  └── 其他 Exception                → 500

层次 3: 认证层（AuthService）
  ├── Token 无效                    → SecurityException → 403
  └── 用户被禁用                    → SecurityException → 403
```

### 7.2 前端错误处理

**API Hook 层**：
- `enabled` 守卫防止在 API/User 未就绪时发起请求
- 前置校验（`if (!api) throw new Error(...)`）提供明确的错误信息
- TanStack Query 自动处理重试、错误状态管理

**WebSocket 层**：
- 降级机制：WebSocket 断开 → 轮询替代
- 心跳检测：服务端 `ForceKeepAlive` → 客户端 `KeepAlive` 响应

### 7.3 前后端错误对接

| 场景 | 后端行为 | 前端处理 |
|------|----------|----------|
| Token 过期/无效 | 401 Unauthorized | 重定向到登录页 |
| 权限不足 | 403 Forbidden | 显示权限不足提示 |
| 资源不存在 | 404 Not Found | 显示未找到页面 |
| 服务器错误 | 500 + 日志记录 | 显示通用错误提示 |
| 远程访问被拒 | 503 Service Unavailable | 连接失败处理 |
| WebSocket 断开 | 关闭连接 + 日志 | 降级为轮询 |

---

## 8. 关键设计决策总结

| 设计决策 | 选择 | 原因 |
|----------|------|------|
| 认证方案 | 自定义不透明 Token（非 JWT） | 支持 Token 即时撤销，数据库集中管理 |
| API 版本控制 | 无版本号，`[Obsolete]` 渐进废弃 | 简化 URL，社区项目不需要严格版本控制 |
| 授权模型 | ASP.NET Core Policy-based | 灵活的策略组合，支持复杂权限场景 |
| WebSocket | 原生 ASP.NET Core WebSocket | 实时推送会话/任务状态 |
| 前端 API | 双客户端 + 桥接 + TanStack Query | 渐进式迁移，兼顾类型安全和遗留功能 |
| 序列化 | System.Text.Json，支持 CamelCase/PascalCase | 性能优先，多客户端兼容 |
| 参数绑定 | 自定义 ModelBinder（逗号/管道分隔） | 支持复杂的多值查询参数 |
