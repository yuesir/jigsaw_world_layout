# jigex-prog.js 拼图游戏核心代码模块详细分析

> 文件共 **2651 行**，采用 IIFE（立即执行函数）包裹、单文件多模块架构，挂载在全局对象 `window.jigexGlobals` 上。

---

## 目录

1. [Polyfill 兼容层](#1-polyfill-兼容层)
2. [全局初始化与配置系统](#2-全局初始化与配置系统)
3. [模块加载器（Module Loader）](#3-模块加载器module-loader)
4. [错误监控与上报系统](#4-错误监控与上报系统)
5. [base 基础模块](#5-base-基础模块)
6. [footer 广告管理模块](#6-footer-广告管理模块)
7. [SonicH5 音频模块（HTML5 回退）](#7-sonich5-音频模块html5-回退)
8. [Sonic 音频模块（WebAudio API）](#8-sonic-音频模块webaudio-api)
9. [niftybar UI 组件库](#9-niftybar-ui-组件库)
10. [ClipGL 渲染引擎（WebGL）](#10-clipgl-渲染引擎webgl)
11. [multiplayer 多人游戏模块](#11-multiplayer-多人游戏模块)
12. [snapIndicator 吸附提示模块](#12-snapindicator-吸附提示模块)
13. [ui 主界面模块](#13-ui-主界面模块)
14. [Controller 输入事件控制器](#14-controller-输入事件控制器)
15. [Puzzle 拼图核心逻辑](#15-puzzle-拼图核心逻辑)
16. [Piece 拼图块逻辑](#16-piece-拼图块逻辑)
17. [Group 拼图块组合逻辑](#17-group-拼图块组合逻辑)
18. [knife 切割与形状生成系统](#18-knife-切割与形状生成系统)
19. [文件加载与存档系统](#19-文件加载与存档系统)
20. [player 主程序入口模块](#20-player-主程序入口模块)

---

## 1. Polyfill 兼容层

**位置：** 第 3–22 行

### 功能

为旧版浏览器（IE11、老版 Safari/Firefox/Edge）补全缺失的原生 API，确保整个程序可在目标环境中运行。

### 具体补丁列表

| 补丁对象 | 方法/属性 | 说明 |
|---|---|---|
| `String.prototype` | `includes` | 字符串包含检测，回退到 `indexOf` |
| `String.prototype` | `codePointAt` | Unicode 码点读取，正确处理代理对（surrogate pairs） |
| `String.prototype` | `startsWith` | 字符串前缀检测 |
| `Array.prototype` | `includes` | 数组元素存在性检测 |
| `Array.prototype` | `from` | 将类数组对象转为真实数组，回退到 `slice.call` |
| `Math` | `imul` | 32 位整数乘法，用于哈希/位运算 |
| `Number` | `MAX_SAFE_INTEGER` | 最大安全整数常量 `9007199254740991` |
| `window` | `queueMicrotask` | 微任务调度，回退到 `setTimeout(fn, 0)` |
| `Object` | `assign` | 对象属性浅合并 |
| `window` | `Map` | 简单 Map 实现（`_keys` + `_values` 数组对），支持任意 key 类型及 NaN 键 |
| `Object` | `values` | 返回对象的值数组 |

### 关键实现细节

- `Map` polyfill 使用双数组（`_keys`/`_values`）线性查找，**性能为 O(n)**，仅用于兼容而非性能优化。
- `codePointAt` 正确处理了 surrogate pair（高代理 `0xD800–0xDBFF` + 低代理 `0xDC00–0xDFFF`），可安全处理 emoji 等字符。

---

## 2. 全局初始化与配置系统

**位置：** 第 49–120 行

### 功能

初始化整个应用的全局状态，包括 DOM 根节点查找、URL 参数解析、路径配置、设备检测以及谜题参数（`parms`）的构建。

### 核心结构

```
window.jigexGlobals (e)
├── parms()          // 谜题参数工厂函数
├── homeDomain       // "https://www.jigsawexplorer.com/"
├── cdnDomain        // "https://d3v07jw5i24n9b.cloudfront.net/"
├── imagesPath       // 图片资源路径
├── audioPath        // 音频资源路径
├── scriptsPath      // 脚本资源路径
├── isIE11           // IE11 检测
├── isIOS            // iOS 检测（iPad/iPhone/iPod 及新版 iPadOS）
├── debug            // 调试模式开关
└── errMonitor       // 错误监控对象（见模块4）
```

### URL 参数解析（`l` 对象）

从 `window.location.search` 解析的参数：

| 参数名 | 用途 |
|---|---|
| `puzzle_id` | 拼图 ID |
| `url` / `img` | 图片 URL |
| `gid` | 多人游戏 ID |
| `nop` | 拼图块数量 |
| `min` | 最少块数 |
| `cred` / `credu` | 版权信息 / 版权链接 |
| `color` | 背景颜色 |
| `ctw` / `cth` | canvas 测试宽高 |
| `dbg` | 调试级别（`verbose` 或布尔） |
| `prof` | 自定义谜题 Profile 地址 |
| `promo1` / `promo2` | 推广面板地址 |

### `parms()` 工厂函数的特殊逻辑

- 参数来源优先级：**URL 参数 → Profile 配置文件 → HTML data 属性**
- `prof` 参数触发一次 XHR 请求加载 JSON 格式的谜题配置（Profile），支持 `nextProfileAddress` 字段实现链式加载（级联 Profile）。
- URL 中的 `url` 参数使用 Base64+URL 编码（将 `-` 还原为 `+`，`_` 还原为 `/`，`~` 还原为 `=`，再 `atob` 解码），防止特殊字符破坏查询字符串。
- `credu`（版权链接）有注入校验：不允许非 `http` 开头，或包含 `script`、`"`、`<`、`>` 的值。
- `parms().reset()` 方法清除所有加载相关字段，用于开始加载新谜题。

### 设备检测

- **iOS 检测**：检测 UA 中的 `iPad|iPhone|iPod`，同时兼容新版 iPadOS（UA 为 `Macintosh` + `maxTouchPoints >= 1` 或 `Audio.volume` 只读）。
- **IE11 检测**：检测 UA 中的 `Trident/`。

---

## 3. 模块加载器（Module Loader）

**位置：** 第 50–55 行（模块注册表）；加载逻辑分布于整个文件的各模块 IIFE 顶部

### 功能

实现一个轻量的**依赖追踪型按需模块加载系统**，管理所有子模块的加载状态与初始化顺序。

### 模块注册表（`s` 对象）

```javascript
{
  base:         { init, inited, file: "base" },
  niftybar:     { init, inited, file: "niftybar" },
  utils:        { init, inited, file: "utils" },
  ClipGL:       { init, inited, file: "clipgl" },
  Sonic:        { init, inited, file: "sonic" },
  SonicH5:      { init, inited, file: "sonic-h5" },
  theme:        { init, inited, file: "theme" },
  photon:       { init, inited, file: "photon" },
  multiplayer:  { init, inited, file: "multiplayer" },
  snapIndicator:{ init, inited, file: "snap" },
  ui:           { init, inited, file: "ui" },
  footer:       { init, inited, file: "footer" },
  player:       { init, inited, file: "player" }
}
```

### 加载流程

1. 每个子模块通过 `t.addModInit(name, initFn)` 注册自身。
2. `initFn.dependenciesReady()` 返回布尔值，描述该模块依赖是否就绪。
3. 加载器在每次脚本加载完毕后调用 `t.update()`，遍历未初始化的模块，依次检查 `dependenciesReady()`，若满足则调用 `init()`。
4. `t.load(url, callback)` 动态注入 `<script>` 标签，支持**备用 URL 数组**（主 CDN 失败时自动切换）。
5. CSS 同样由 `F` 函数（`loadCSS`）动态注入 `<link>` 标签，并 polyfill 了 Safari 的 `cssRules` 加载检测。
6. `bundled` 标志控制是否跳过动态加载（打包模式下所有脚本已内联）。

### 依赖关系图（简化）

```
base ←────────────────── player
  └── utils, niftybar ←─ ui
        └── ClipGL ←──── multiplayer, snapIndicator
              └── photon (Photon SDK)
              └── SonicH5 ←── Sonic
```

---

## 4. 错误监控与上报系统

**位置：** 第 24–48 行

### 功能

捕获全局未处理异常，进行智能过滤后通过 Raygun（`rg4js`）上报，并在必要时向用户弹出提示。

### 核心对象 `e.errMonitor`

| 方法/属性 | 说明 |
|---|---|
| `sendReport(err, opts)` | 主动上报一个错误 |
| `setAuxData(key, val)` | 附加自定义调试数据到下一次上报 |
| `addCallback(fn)` | 注册错误发生时的回调（用于 UI 联动） |
| `pushError(err)` | 实际调用 `rg4js("send", ...)` |
| `prepOnly` | 只准备错误，不立即上报（事务式上报） |
| `extendStackTrace` | 标记是否需要扩展堆栈追踪 |
| `forceErrorReporting` | 强制上报（绕过过滤） |

### 智能错误过滤器（`r` 函数）

过滤逻辑分两层：

**层1 — `reportError`（是否上报给服务器）**

不上报的条件（任意一项满足即过滤）：
- 堆栈为空或不含 `jigsawexplorer.com` 的脚本
- 所有堆栈帧均为 `anonymous`（广告/注入脚本）
- 错误来自已知第三方脚本（`yimg.com`、`amazon-adsystem.com`、`chrome-extension://`）
- 内存不足类错误（多语言版本，覆盖英/法/德/西/日/韩/葡等）
- 已知浏览器 bug（IE11 `Access is denied`、Edge jQuery 兼容性）
- iOS Safari 特有错误
- GPU 设备挂起错误
- 特定 Android WebView 限制

**层2 — `alertUser`（是否弹出警告框给用户）**

过滤条件更宽松，同时处理了：
- IE11 用户：提示更换到 Chrome
- Firefox 用户：提示更换到 Chrome

### 上报数据附加字段

在 `rg4js("onBeforeSend")` 钩子中补充：
- 地理位置占位符 `"<geo placeholder>"`
- 所有 `setAuxData` 附加的辅助数据
- 程序版本号 `e.status.progVersion`
- 标签 `"Web"`

---

## 5. base 基础模块

**位置：** 第 337–346 行

### 功能

初始化所有核心工具库，使其可被其他模块通过 `t.XXX` 访问。

### 初始化内容

| 挂载属性 | 来源 | 说明 |
|---|---|---|
| `t.console` | `window.openConsole` | 结构化日志系统（支持 DEBUG/FAULT 级别） |
| `t.Sym` | `window.Sym` | 符号/枚举系统（类型安全的字符串常量） |
| `t.StateCell` | `window.StateCell` | 有限状态机（FSM）实现 |
| `t.Variant` | `window.Variant` | 带监听器的响应式变量 |
| `t.jQuery` | `window.jQuery` | jQuery（1.12.4，动态加载，支持三个 CDN 备源） |

### 依赖链

```
openConsole.js → Sym.js → StateCell.js → Variant.js → jQuery
（所有脚本均支持主域/CDN备用地址双路由）
```

### StateCell 配置

```javascript
StateCell.setDefaultOptions({
  logger: window.openConsole  // 将状态转换日志输出到结构化控制台
});
```

---

## 6. footer 广告管理模块

**位置：** 第 347–388 行

### 功能

基于**有限状态机**管理页面底部 AdThrive 广告横幅的生命周期，包括显示、关闭按钮渲染和广告轮播。

### 状态机（StateCell）

```
states: [prepping-for-ads, prepped-for-first-ad, ad-display-cycling, ad-closed]

事件流:
ad-container-prepared → prepped-for-first-ad（10秒超时触发关闭）
new-ad-is-displayed   → ad-display-cycling（显示遮罩和关闭弹层）
ad-ended              → 清除 raptiveCloseBtn
jigex-ad-close        → 触发 Raptive 的关闭按钮点击
adthriveFooterClose   → 移除所有广告 DOM 节点，状态切换到 ad-closed
```

### DOM 监控机制

使用 **三个独立 MutationObserver**：
1. **主 Observer**：监听 `adthrive_sticky_footer`，检测广告容器的插入与移除，触发对应状态事件。
2. **Comscore Observer**：检测 `.adthrive-comscore` 元素插入并立即将其 `display:none`（防止侵占布局）。
3. **GDPR Observer**：检测 `id.includes("gdpr-toggle")` 的节点并隐藏（防止 GDPR 同意弹窗与游戏界面重叠）。

### 关闭按钮（`jigex-ad-close-pop`）

- 优先使用 HTML Popover API（`showPopover()`）。
- 降级方案：手动控制 `display` 样式。
- 关闭按钮样式内联注入（`34px × 90px`，白底，左边框灰线）。

---

## 7. SonicH5 音频模块（HTML5 回退）

**位置：** 第 389–416 行

### 功能

当 WebAudio API 不可用时（老旧设备/浏览器），使用 HTML5 `<Audio>` 元素提供音效播放能力。

### 初始化时机

采用**延迟初始化**策略：音频上下文必须在首次用户交互（`mousedown`/`pointerdown`/`touchstart`）后创建，符合浏览器自动播放策略。

### SonicH5 实例方法

| 方法 | 说明 |
|---|---|
| `play()` | 播放音效，静音时跳过，记录首次播放日志 |
| `stop()` | 暂停并重置进度，恢复默认音量（0.3） |
| `fadeOut()` | 使用 `requestAnimationFrame` 在 1 秒内将音量从 0.3 线性衰减到 0 |
| `load(url)` | 设置 `<audio>` 的 `src` 并触发 `load()` |

### 加载容错机制

```
尝试 resDir/audio/{name}.mp3（或 iOS 版 -ios.mp3）
      ↓ 失败
尝试 S3 CDN: s3.amazonaws.com/jigex-pub-res/media/audio/{name}.mp3
      ↓ 仍失败
标记 state = "failed"，静默忽略后续 play() 调用
```

### iOS 特殊处理

iOS 只能通过用户触发的事件内调用 `.play()`，因此在 `prep()` 中先播放一段 `silence.mp3` 来"解锁"音频上下文，之后再替换为实际音效文件。

---

## 8. Sonic 音频模块（WebAudio API）

**位置：** 第 417–443 行

### 功能

主音频系统，优先使用 WebAudio API（`AudioContext`），自动降级到 SonicH5。

### 初始化逻辑

```javascript
if (forceAltAudio || !AudioContext)
    t.Sonic = t.SonicH5;   // 强制 HTML5 模式（用户设置或环境不支持）
else
    t.Sonic = WebAudio 实现;  // 正常 WebAudio 模式
```

### WebAudio 实现细节

每次 `play()` 调用都：
1. 创建新的 `BufferSource` 节点（单次播放）。
2. 创建 `GainNode`（音量 0.3）。
3. 连接：`BufferSource → GainNode → AudioContext.destination`。
4. 调用 `start(0)` 立即播放。

`fadeOut()` 使用 `linearRampToValueAtTime(0, currentTime + 1)` 实现硬件级平滑淡出。

### 静音持久化

```javascript
e.audioMuted = function(val) {
  if (val === undefined) return s;  // 读取
  s = !!val;
  localStore.setItem("jigex-opt-muted", s.toString());  // 写入 localStorage
};
```

关键 key：`"jigex-opt-muted"`，布尔字符串存储。

### 音频资源加载

使用自定义 `WebReq`（XHR）以 `arraybuffer` 类型加载 `.mp3` 文件，通过 `AudioContext.decodeAudioData()` 解码为 `AudioBuffer`。解码失败时自动回退到 SonicH5。

---

## 9. niftybar UI 组件库

**位置：** 第 444 行起，约 300+ 行

### 功能

拼图游戏的 UI 框架层，封装了 jQuery，提供一套游戏特定的 UI 组件（面板、按钮、工具栏、菜单、提示框等）及动画系统。

### 核心子系统

#### 9.1 Tween 动画引擎（`ee`）

基于 `requestAnimationFrame` 的轻量补间动画：
- 支持同一元素同一属性的**动画复用**（修改进行中的动画目标值）。
- 通过 `css()` 设置属性值，每帧计算 `from + (elapsed/duration) * (to-from)`。
- 降级方案：不支持 `rAF` 时直接 `setTimeout` 设置终态值。

#### 9.2 Tooltip 系统（`te`）

- 使用**对象池**管理 tooltip 元素，避免频繁创建/销毁 DOM。
- 延迟显示（`tooltipDelay` 毫秒后才展示）。
- 多 tooltip 并发通过独立 div 元素支持。
- 位置自动修正：确保不超出视口左/右边界。

#### 9.3 Panel（面板 `getPnl`）

面板封装了：
- `visible(bool/toggle)` — 显示/隐藏切换
- `onShow` / `onHide` 钩子
- 支持 `cloak()`（透明但占位）/ `uncloak()` — 用于加载期间遮挡内容

#### 9.4 Button（按钮 `getBtn`）

按钮封装了：
- `enabled(bool)` — 禁用/启用及对应 CSS class
- `toggled(bool)` — 切换激活状态
- `onclick` / `onmouseenter` / `onmouseleave` 直接赋值

#### 9.5 Bar（工具栏 `getBar`）

工具栏实现了：
- 水平/垂直布局
- 动画展开/收起（`open()`/`close()`）
- 嵌套子菜单支持

#### 9.6 测量工具（`measure`）

离屏测量 DOM 元素文本宽度，用于 tooltip 和菜单的精确定位。

#### 9.7 下拉菜单定位（`$` 函数）

计算按钮下方的菜单弹出位置，自动处理：
- 宽度居中对齐到按钮
- 超出左/右视口边界时的位置修正

---

## 10. ClipGL 渲染引擎（WebGL）

**位置：** 约第 670–880 行

### 功能

核心 WebGL 渲染引擎，将每个拼图块（Clip）渲染为 WebGL 矩形，支持纹理、遮罩、旋转、透明度和 Z 轴排序。

### 架构

```
ClipGL
├── canvas (#jigex-canvas)        — WebGL 上下文
├── Clip (实体)                    — 可渲染对象（拼图块/背景/UI元素）
├── Texture                        — 纹理资源管理（引用计数，上限 32 个）
├── VertexManager (vertMngr)       — 顶点缓冲区管理
├── Shader                         — GLSL 着色器
├── Projector (projector)          — 渲染循环调度
├── Tweener2                       — 属性补间（角度/透明度/位置）
└── clips[]                        — 按图层分组的链表
```

### 10.1 Clip 对象

每个 Clip 对应 WebGL 中的**一个四边形（两个三角形，6 个顶点）**。

**属性：**

| 属性 | 说明 |
|---|---|
| `position` (PosPoint) | 中心点坐标，支持 `assign(x,y)` 和 `tween(x,y,dur)` |
| `angle` | 旋转角度（0/90/180/270），设置时触发 `vertMngr.rotate()` |
| `opacity` | 透明度 0–1，支持 Tweener2 |
| `width`, `height` | 显示尺寸（像素） |
| `layer` | 所在图层（不同图层决定渲染顺序） |
| `_texture` | 主纹理（图片） |
| `_mask` / `_mask2` | 遮罩纹理（决定拼图块形状轮廓及阴影/斜面） |
| `_userState` | 用户自定义状态位（存储于顶点数据，用于 Shader 分支） |
| `_color` | 颜色值（纯色 Shader 使用） |
| `zOrder` | Z 轴顺序（由顶点缓冲区中的位置决定） |
| `touchRect` | 点击检测矩形（可不同于显示尺寸） |

**方法：**

| 方法 | 说明 |
|---|---|
| `fadeIn(dur, cb, delay)` | 淡入动画（Tweener2 opacity: 0→1） |
| `fadeOut(dur, cb, deactivate)` | 淡出动画（opacity: 1→0，可自动设 active=false） |
| `moveToTop() / moveToBottom()` | 调整 Z 轴（修改链表位置并 rebuild 顶点缓冲） |
| `sendToLevelOf(other)` | 将此 Clip Z 轴调到另一个 Clip 之后 |
| `setSize(w,h,bounds,mask,mask2)` | 调整尺寸及纹理采样范围 |
| `setTexBounds(tex, bounds, isMask)` | 设置纹理采样的 UV 坐标范围 |
| `containsPoint(x, y)` | 点击测试（考虑 touchRect 及旋转） |

### 10.2 VertexManager 顶点管理器

每个 Clip 对应 **6 个顶点 × 每顶点 15 个浮点数（共 90 个）**的连续内存块：

```
顶点数据布局（每个顶点15个float）:
[0-1]  顶点类型标识 (-1/-1, 1/-1, 1/1, -1/1 组合，用于Shader推算最终位置)
[2-3]  宽高（像素）
[4-5]  中心位置（OpenGL 坐标 -1..1）
[6-7]  旋转（sin(angle), cos(angle)）
[8]    用户状态 (userState)
[9]    颜色值
[10]   透明度
[11-12] 主纹理 UV
[13-14] 遮罩纹理 UV
```

**双 VBO 机制：** 使用两个交替的 WebGL 顶点缓冲区（`F` 和 `H`），一个用于渲染，一个用于 CPU 端更新，避免渲染阻塞。

**脏标记系统：** `V`（需要上传）+ `W`（需要 Z 轴重建），避免无效 GPU 上传。

### 10.3 Texture 纹理管理

- 全局纹理池（`_textures[]`），最多 **32 个**活跃纹理。
- **引用计数**（`addRef` / `subtractRef` / `disposeIfUnused`）。
- 重用空槽位（`name === null` 的已回收纹理位置）。
- 遮罩纹理（`isMask: true`）额外提取 `pixels` 用于 CPU 端的碰撞/形状检测。
- `resetAll()` 用于 WebGL 上下文丢失后重新初始化所有纹理。

### 10.4 Shader 着色器体系

三种默认着色器：
- **defColorShader**：纯色渲染（背景、UI 元素）
- **defImageShader**：图片纹理渲染
- **defImageAndMaskShader**：图片 + 遮罩 + 第二遮罩（用于拼图块）

拼图块专用 Shader（动态生成 GLSL）：
- 根据 `v_state`（userState）决定渲染模式（正常/被选中/远程操控等）。
- 使用 `v_rot`（旋转向量）从 `u_mask2` 采样阴影/斜面方向。
- 支持 4 个旋转方向（0°/90°/180°/270°）的阴影正确投射。

---

## 11. multiplayer 多人游戏模块

**位置：** 约第 1040–1205 行

### 功能

基于 **Photon SDK**（`t.photon`）实现实时多人拼图游戏，管理玩家状态同步、拼图块操作广播及游戏会话生命周期。

### 核心状态机（通过 Variant 实现的 `joinedToGameVar`）

```
UNINIT → LOBBY → CONNING_NAM → CONNED_GAM → JOIN（已加入游戏）
                    ↑                              ↓
                  DISCONN ←──────────────────── ERR
```

### 数据同步协议

拼图块状态通过 Photon 的 Custom Properties 广播，key 格式为 `"p-{pieceId}"`，value 为：

```json
{
  "x": 0.5,      // 归一化 X 坐标 (0-1)
  "y": 0.3,      // 归一化 Y 坐标 (0-1)
  "a": 1,        // 角度 /90 的整数（0=0°, 1=90°, 2=180°, 3=270°）
  "g": 42,       // 所属组的 pieceId（0=不在组内）
  "m": 1,        // 是否已被移动过
  "p": "Alice",  // 操作玩家名
  "wc": 1,       // 是否刚被捕获释放
  "pv": 15       // 轴心块 ID（pivot piece）
}
```

### 事件队列与处理器（`G` 函数）

三级优先队列（`B`/`N`/`M` + `j`）：
- **即时操作**（`B`）：最高优先级，立即处理。
- **组操作**（`N`）：组成员状态同步。
- **普通操作**（`M`/`j`）：正常玩家移动。

`pi()` 函数处理单个远程动作：延迟处理正在动画中的块（返回 `false` 让队列稍后重试）。

### 会话安全机制

- 使用 `expectedSessionId` 防止同一用户重复连接到旧会话（可能导致状态回退）。
- 检测到 `sesn === -1` 时断开并延迟 2 秒重连。
- 浏览器 Tab 隐藏 10 秒后自动离开游戏（节省服务器资源）。

### 断线重连（`ri` 函数）

```
连接断开
  → 延迟 2 秒
  → 检查：在线 + Tab 可见 + 网络停顿 < 10 秒
  → 离开游戏
  → 等待新的 joinedToGameVar 事件后重新加入
```

### 多人计时器（`timer` 对象）

- 只有**房主（Master Client）**可以操控计时器（防止多端不一致）。
- 通过 Custom Property `elpsd`（已用时）、`strt`（开始时间戳）、`cmplt`（是否完成）持久化计时状态。
- `update()` 方法在房主客户端定期刷新 `last` 时间戳。

---

## 12. snapIndicator 吸附提示模块

**位置：** 第 1207–1238 行

### 功能

当玩家拖动拼图块接近可以吸附的相邻块时，显示动态的"左右箭头"动画提示。

### 工作流程

1. `check(piece)` — 在拖动过程中以 450ms 防抖调用，检查是否有邻居在吸附范围内。
2. `O()` — 防抖回调，通过 `neighborWithinSnapRange(false)` 查找候选邻居。
3. `I(entry)` — 计算两块之间中点坐标，渲染左右两个 Clip 到该位置（使用 `fadeIn`）。
4. `z(entry)` — 左右两个 Clip 向内位移 15px 的动画（EASE_IN，500ms）。
5. `L(entry)` — 动画结束后 200ms 淡出两个 Clip，归还到对象池（`k.free()`）。

### 对象池（`k`）

- 复用 `{ left: Clip, right: Clip, timer: Timer }` 三元组。
- 避免每次吸附动画都重新创建 WebGL Clip 对象。

### 多人模式下的扩展

`show(piece, neighbor)` — 由远程事件触发，在被远程玩家操作的两块之间显示吸附动画，同时在 niftybar Tooltip 中显示操作该块的玩家名。

### 图片资源

- `snap-indicator-left.png` 和 `snap-indicator-right.png`（两个箭头图片）。
- 图片加载失败时降级为 35×35 的白色实心矩形 Clip。

---

## 13. ui 主界面模块

**位置：** 第 1239 行起，约 350 行

### 功能

管理游戏 HTML 界面的所有交互元素，是 ClipGL 渲染层与 DOM 层之间的桥梁。

### 13.1 元素映射

初始化时通过 `niftybar.getBtn/getPnl/getBar` 或直接 `getElementById` 获取以下 UI 元素：

- **工具栏**：`jigex-toolbar`（主工具栏）、`jigex-start-tb`（开始对话框工具栏）
- **按钮**：捕获、边缘、盒顶预览、开始、修改、打开文件、全屏、静音、多人、旋转、时钟
- **面板**：开始对话框、帮助面板、消息框、暂停屏幕、Toast 提示、日志对话框、颜色菜单
- **特殊**：`jigex-spinner`（加载动画）、`jigex-canvas`（WebGL 画布）

### 13.2 触摸滚动修复

在 iOS/IE11/旧 Edge 上，通过监听 `touchstart` 和 `touchmove` 事件，允许包含滚动区域（`clientHeight < scrollHeight`）的 DOM 节点正常滚动，同时阻止其他元素的默认行为（防止画布区域的意外滚动）。

### 13.3 游戏控制按钮逻辑

- **边缘按钮（edges btn）**：若边缘已完成或多人游戏中，触发打散（scatter partial）；否则切换"仅显示边缘"模式，同步到多人房间设置。
- **盒顶按钮（box top）**：鼠标悬停触发 `peek()`（短暂透明显示），点击触发 `toggleDisplay()`，触摸设备用 `ontouchstart` 替代以避免触摸延迟问题。
- **旋转按钮**：仅在谜题就绪后切换 `rotatable` 状态。
- **颜色菜单**：`themeBtn.onclick` 切换菜单可见性。

### 13.4 键盘快捷键（通过 Controller `keydown` 分发）

| 按键 | 功能 |
|---|---|
| `B` | 快速预览盒顶（`boxTop.autoPeek()`，松开 B 时隐藏） |
| `C` | 切换捕获模式 |
| `P` | 暂停/继续计时器 |
| `R` | 打散拼图（scatter partial） |
| `T` | 切换颜色菜单 |
| `Shift+D` | 删除所有存档进度（二次确认） |
| `Shift+I` | 调试：显示鼠标下方拼图块信息（调试模式） |
| `Ctrl+K` | 停止广告 |
| `Ctrl+M` | 显示程序日志 |
| `Shift+Ctrl+M` | 显示版权信息（Base64 解码） |
| `Shift+Ctrl+S` | 导出拼图记录到剪贴板 |

### 13.5 BoxTop（盒顶预览）功能

`_.boxTop` 对象管理参考图的两种显示模式：
- **recessed（内嵌）**：全尺寸参考图，带 4 行半透明白色渐变边框（模拟纸板盒顶效果）。
- **floating（悬浮）**：较小的参考图，带 6 行斜角渐变（模拟"浮起"效果）。

两种效果均通过 **Canvas 2D 的像素操作**（`getImageData` / `putImageData`）在 CPU 端生成 alpha 渐变，然后上传为 WebGL 纹理。

---

## 14. Controller 输入事件控制器

**位置：** 约第 1537–1605 行

### 功能

统一处理鼠标、触摸、触控笔三种输入设备的事件，消除差异并路由到正确的监听器。

### 三种 Controller 实例

| 实例 | 类型 | 监听事件 |
|---|---|---|
| `mouseController` (type=0) | 鼠标 | mousedown/up/move/wheel + keydown |
| `touchController` (type=1) | 触摸 | touchstart/end/cancel/move |
| `pointerController` (type=2) | 指针（Pointer API） | pointerdown/up/move/cancel |

### 14.1 坐标统一化

所有输入设备的坐标均转换为 WebGL 画布内的像素坐标（减去画布 `clientRect.left/top`，再乘以设备像素比 `l`）。

```javascript
n = (e.clientX - h.left) * l;   // 鼠标/指针
i = (e.clientY - h.top) * l;

// 触摸：取 touches[0]
n = (touches[0].clientX - h.left) * l;
```

### 14.2 Chrome Android 指针取消 Bug 修复（`st` 函数）

Chrome Android 上 `pointercancel` 事件在某些情况下不会触发 `pointerup`，导致拼图块无法释放。通过缓存最后一次 `pointerdown` 事件和坐标，在检测到 `pointercancel` 时手动构造并派发一个 fake `pointerup` 事件。

### 14.3 捕获机制（Pointer Capture）

```javascript
canvas.addEventListener("pointerdown", qe);  // setPointerCapture
canvas.addEventListener("pointerup", We);    // releasePointerCapture
```

确保拼图块被按下后，即使手指移出画布边界，move/up 事件依然发给该元素。

### 14.4 事件路由

```
handleEvent(e)
  → 坐标更新 (x, y, movedXBy, movedYBy)
  → 设备类型标记 (fromMouseDevice / fromTouch)
  → keydown → rt()（快捷键处理）
  → 双击去抖（150ms 内的第二次 up 视为无效点击）
  → 如果已被 capture → 直接调用 captor.handleEvent(e)
  → 否则 → 遍历该事件类型的所有 listeners
```

### 14.5 摇晃检测（`ShakeDetector`）

当有多个拼图块被捕获时，玩家可以通过快速**左右晃动**鼠标来同时释放所有被捕获的块。`ShakeDetector` 通过检测位移方向快速变化（多次穿越中心点）来识别摇晃手势。

---

## 15. Puzzle 拼图核心逻辑

**位置：** 约第 1700–2000 行

### 功能

`_.Puzzle` 类管理一局拼图游戏的完整生命周期——从图片加载、切割，到块的布局、保存与还原。

### 15.1 状态机（`stateVar`）

```
B (INIT_START) → N (LOADING) → R (LOADED)
→ D (WAITING) → G (READY) → COMPLETE
```

状态跃迁触发对应的 UI 更新（显示/隐藏加载动画、开始对话框、完成动画等）。

### 15.2 构造函数流程

```
new _.Puzzle(parms)
  → 检查已存在的 Puzzle，若有则先 dispose
  → 设置 state = LOADING
  → 加载图片（URL/本地文件/base64）
  → 图片加载完成
     → loadRecord()（从 localStorage 恢复存档）
     → knife.cutChoices()（计算可用的块数选项）
     → 显示"开始对话框"（选择块数）
     → 玩家确认后：knife.cut()（切割生成 Piece 对象）
     → buildMask()（生成遮罩纹理）
     → scatter()（将块散布到画布上）
     → state = READY
```

### 15.3 进度存档系统（`updateRecord` / `loadRecord`）

存档格式（存储于 localStorage，key 为 `"jigex-rec-{puzzleName}"`）：

```json
{
  "ver": 8,
  "nam": "puzzle_name",
  "shp": { "rw": 10, "cl": 15 },
  "num": 150,
  "date": { "strt": 1234567890, "mod": 1234567890 },
  "pcs": [
    { "id": 1, "x": 0.3, "y": 0.5, "a": 0, "m": 1, "g": 0 },
    ...
  ]
}
```

- `x`/`y` 为归一化坐标（0–1 相对于 canvas 尺寸）。
- `a` 为角度除以 90 的整数。
- `m` 为是否已移动。
- `g` 为所属组的 refPiece ID。

存档节流：距上次保存 500ms 内不重复写入（防止频繁 I/O）。

### 15.4 Scatter（散布算法）

**新游戏散布（无存档时）：**

按螺旋顺序（顺时针：右→下→左→上）将块排布到画布边缘空白区域：
- 避免遮挡已完成的组和盒顶预览。
- 支持"紧凑模式"（`compactMode`）：多摆一行减少块间间距。
- 随机扰动：每块在 ±(`pieceSize * 0.0625`) 范围内添加随机偏移，避免整齐排列。
- 相邻块交叉插入（`getScatterSequence()`）：排布顺序使相邻块不相邻，减少初始状态下的意外吸附。

**存档还原散布（有存档时）：**
- 还原每块的角度、位置和组关系。
- 若 canvas 长宽比发生变化（横竖屏切换），未移动的块重新散布。

### 15.5 Relayer（图层重组）

`relayer()` 将已完成组的块降到底层（`te` 层），未完成的块保持在中层（`ne` 层），顶层（`ie` / `ee`）保留给 UI 元素和盒顶。

### 15.6 完成检测

`isCompleteVar`（Variant 响应式变量）在所有块加入同一个组时置为 `true`：
- 触发完成动画（掌声特效 `_.applause.play`）。
- 调用 Google Analytics `puzzle_completion` 事件。
- 向 `jigsawexplorer.com/api/completions` POST 增加完成计数。
- 更新 localStorage 的完成次数统计。

---

## 16. Piece 拼图块逻辑

**位置：** 约第 1985–2200 行

### 功能

`_.Piece` 继承自 `ClipGL.Clip`，是单个拼图块的完整实现，包含拖拽、旋转、吸附、多人同步状态管理。

### 16.1 状态机（`stateVar`，StateCell）

```
F (FREE)         — 空闲，可被拾取
H (HOLDING)      — 正在被本地玩家拖拽（已按下但未移动）
W (WIGGLE)       — 触摸"轻点"触发的短暂等待状态
q (DRAGGING)     — 正在被本地玩家拖动
Q (CAPTURE_MODE) — 进入捕获模式（批量选中）
U (CAPTURED)     — 已被捕获（淡出等待释放）
Y (REMOTE_SELECT) — 被远程玩家选中
X (REMOTE_CTRL)  — 被远程玩家控制（超时自动释放）
```

### 16.2 拖拽交互（`handleEvent`）

**按下（mousedown/touchstart/pointerdown）：**
```
state = FREE
  → 若捕获模式已激活：capture()
  → 否则：
    - state → HOLDING
    - 记录 startTime, startX, startY
    - 计算 moveOffsetX/Y（鼠标与中心的偏移）
    - 注册 mousemove/touchmove/pointermove 监听
    - controller.capture(this)（独占输入）
```

**移动（mousemove/touchmove/pointermove）：**
```
state = HOLDING → DRAGGING（首次移动时）
  move(controller.x + offsetX, controller.y + offsetY)
  → 更新组内所有成员的位置
  → snapIndicator.check(this)（检查吸附范围）
  → multiplayer.sendUpdate(this)（广播位置）
```

**释放（mouseup/touchend/pointerup）：**
```
state = DRAGGING
  → neighborWithinSnapRange(true) 检查可吸附邻居
  → 若有：join(neighbor)（吸附合并）
  → 若无：保留当前位置
  → state → FREE
  → 移除所有事件监听
  → updateRecord()（节流保存进度）
```

### 16.3 旋转（`rotate`）

- 触发方式：滚轮（`mousewheel/wheel`）、键盘方向键（`←`/`→`）、`piecerotate` 自定义事件。
- 按 90° 步进（0→90→180→270→0）。
- 携带 Tweener2 动画（角度补间）。
- 整组旋转：通过 `applyTask()` 对组内所有成员同步旋转，以组的 refPiece 为圆心重新计算各成员位置。
- 可选 `rotatable` 开关（由玩家设置控制）。

### 16.4 吸附检测（`neighborWithinSnapRange`）

遍历 `this.neighbors[0-3]`（四个方向的邻居块），计算实际坐标差与理论坐标差的偏差，若小于 `puzzle.snapDistance` 则判定可吸附。同时检测角度一致性（两块角度相差在误差范围内）。

### 16.5 捕获模式

`capture()` — 淡出该块（`fadeOut(Se)`），加入 `Piece.capturedList`，切换 puzzle 的 `capState`。

`Piece.release(controller)` — 从 `capturedList` 取出一块，在控制器当前位置放置，检查吸附，然后淡入显示。

`Piece.releaseAll()` — 批量释放所有被捕获的块（不检查吸附），用于取消捕获操作。

### 16.6 远程控制超时保护（`wn` 函数）

当块状态为 `REMOTE_SELECT` 或 `REMOTE_CTRL` 时启动超时计时器：
- `REMOTE_SELECT` 超时：30 秒后自动切回 FREE。
- `REMOTE_CTRL` 超时：3 秒后自动切回 FREE。
- 若块正在动画中（`isTweening()`），超时延迟 1 秒再检查。
- 若 5 次 `REMOTE_SELECT` 超时，认为多人连接异常，强制离开游戏。

### 16.7 userState 位字段

```
位 0-7：slot 0 — 渲染状态（0=FREE/REMOTE, 1=HOLDING/DRAGGING，用于Shader亮度控制）
位 8-15：slot 1 — 保留
...
```

---

## 17. Group 拼图块组合逻辑

**位置：** 约第 2150–2220 行

### 功能

`_.Group` 管理已吸附在一起的多个拼图块的集合，作为一个整体处理移动、旋转和碰撞检测。

### 核心概念

- **refPiece**：组内的"参考块"，组的位置/状态以 refPiece 为代表广播给多人游戏。
- **members[]**：组内所有 Piece 的数组。
- **edgeCount**：组内边缘块数量（判断是否为"主体组"的依据）。
- **id**：以 refPiece 的 id 为组 id。

### join（吸附合并）

```
Piece A 吸附到 Piece B：
1. 计算 A 相对于 B 的 gap（理论位移差）
2. A.position = B.position - gap
3. 若 B 已有 Group：A（及其整组）加入 B 的 Group
4. 否则：创建新 Group，A 和 B 都加入
5. 合并后检测新加入块是否与 Group 内其他成员形成新的吸附
6. isCompleteVar 检查（是否全部完成）
```

### 移动整组（`applyTask`）

`applyTask(task, callback, members)` 是拼图块操作的核心分发函数，对组内所有成员统一执行 `task`（如 move/fadeIn/stateVar 设置等），并在所有成员完成后调用 `callback`。

---

## 18. knife 切割与形状生成系统

**位置：** 约第 2233–2430 行

### 功能

负责将原始图片切割成若干拼图块，生成每个块的形状遮罩（Canvas 绘制），计算各块的精确布局参数。

### 18.1 拼图缺口形状库

预定义了 **4 种曲线形状**，每种形状有 **12 个控制点**（bezier 曲线），正向（tab/凸出）和反向（hole/凹入）各一套：

| 形状名 | 变量 | 描述 |
|---|---|---|
| `Rn` | finger | 细长指状 |
| `Dn` | ball | 圆球状 |
| `Gn` | stub | 短粗墩状 |
| `Nn` | （默认） | 标准形状 |

控制点格式：`{ fromBase, alongBase }`（相对于边长的比例坐标）。

### 18.2 切割流程（`knife.cut`）

```
1. 读取存档中的行列数（或 nopChoice 对象中的 rows/cols）
2. 根据图片大小与块数计算每块的 core.width / core.height
3. 根据块大小确定 lightingLevel（光照强度）和 shadowDepth / bevelDepth
4. 为每个块分配随机形状（tab/hole 交替，连接性约束）
5. 调用 buildMask() 生成所有块的 mask canvas
6. 创建 _.Piece 对象数组
```

### 18.3 块数选项（`knife.cutChoices`）

从最大块尺寸（`floor(max(w,h)/3)`）开始递减，生成所有合法的行列组合：
- 最少 6 块。
- 尺寸 ≥ 10px。
- 默认选择最接近 `parms.nop`（URL参数）或 Profile 配置的选项。

### 18.4 遮罩生成（`buildMask`）

```
1. 先测量所有形状在每种块尺寸下的 tabHeight / holeHeight
   （通过离屏 Canvas 绘制 + getImageData 像素扫描）
2. 对每个 Piece：
   - 在 Canvas 上绘制完整的 bezier 曲线路径（4条边，左上右下）
   - fill() 生成 alpha 遮罩
3. 生成两张 ImageData：
   - mask (Y / u_mask)：形状遮罩 + 阴影（shadow）+ 斜面（bevel）信息
   - mask2 (H / u_mask2)：方向性阴影数据（用于旋转时的光照修正）
```

### 18.5 光照计算（`te` 函数）

基于像素扫描生成阴影和斜面效果，存储在 mask 的 alpha/RGB 通道：
- **阴影**：块边缘外侧 `shadowDepth` 个像素内，按距离渐变透明度降低。
- **斜面高光（bevel）**：块边缘内侧亮边（`+36`）+ 暗边（`-60`）形成 3D 立体感。
- **方向性斜面**：根据相对于块中心的坡度方向（`slope`），在 `mask2` 中存储 4 个方向（左/上/右/下）的权重，Shader 根据旋转角度选择对应通道。

### 18.6 GLSL 着色器（动态生成）

```glsl
// 伪代码
float rawShad = (v_rot.s > 0.707) ? m2Pixel.r :  // 0° → 右通道
               ((v_rot.t < -0.707) ? m2Pixel.g :   // 90° → 上通道
               ((v_rot.s < -0.707) ? m2Pixel.b :   // 180° → 左通道
                mPixel.b));                          // 270° → 原始

// 合并遮罩
gl_FragColor = sPixel * mPixel.a * v_opacity;
gl_FragColor.rgb += shadow_adjust + bevel_adjust;
```

---

## 19. 文件加载与存档系统

**位置：** 第 2602–2640 行

### 功能

处理玩家通过文件选择对话框打开本地图片文件或 `.jigsaw` 存档文件。

### 支持的文件类型

| 类型 | 处理方式 |
|---|---|
| `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/bmp` | `readAsDataURL` 作为新谜题图片 |
| `*.jigsaw` 或 包含 "saved puzzle" 的文件名 | `readAsText` 解析 JSON 存档 |
| `jigex-options*.json` | `readAsText` 导入全局游戏设置 |

### `.jigsaw` 存档格式兼容性

**格式版本 8（最新）：**
```json
{
  "ver": 8,
  "info": "...Jigsaw Explorer...",
  "nam": "puzzle_name",
  "pid": "puzzle_id_or_url",
  "img": "<base64_jpeg>",
  ...
}
```

**格式版本 6（旧版）：**
```json
{
  "ver": 6,
  "info": "...Jigsaw Explorer...",
  "puzzle": { "ver": 6, "pid": "...", "img": "..." },
  ...
}
```

- 旧版 `.jigsaw` 文件中存在**重复 key** 问题（`"sgl"`/`"grp"` 字段），通过正则预处理将重复 key 重命名为 `sgl0`、`sgl1`... 再解析。
- 根据 `pid` 决定加载方式：`http` 开头 → URL 加载，否则 → `puzzleId` 加载，无 `pid` → base64 图片内嵌。

### 防误操作保护

- 检测当前是否已有谜题在加载中（`state.eq(LOADING, LOADED)`）。
- 检测是否在多人游戏中（禁止从文件打开）。
- 同一文件 1 秒内重复触发的事件被忽略（防抖）。

---

## 20. player 主程序入口模块

**位置：** 第 2640–2652 行（模块入口）+ 约第 2595–2640 行（程序启动逻辑）

### 功能

所有子模块全部就绪后，`player` 模块作为最终入口组装游戏并启动第一局拼图。

### 依赖检查

```javascript
player.dependenciesReady = function() {
  return !!(t.base && t.utils && t.niftybar && t.ClipGL
         && t.ui && t.snapIndicator && t.Sonic
         && t.theme && t.multiplayer);
}
```

### 启动流程

```
player.init()
  → 设置按钮回调（startBtn, rotateBtn, themeBtn, onFileSelect）
  → 等待 background 加载完成（isLoaded.addListener）
  → background 加载后：Sonic.prep()（准备音效系统）
  → 检查 parms().gameId：
      有 gameId → 等待加入多人游戏（joinedToGameVar.addListener）
             → 加入后用游戏房间的谜题参数 new _.Puzzle()
      无 gameId → 直接 new _.Puzzle(parms())
  → 挂载 window 事件：
      contextmenu → 触摸时阻止右键菜单
      message → 监听跨 iframe 的 puzzle-completion-event-request
  → t.player = _(整个 player 命名空间)
```

### 完成事件的跨域通知

通过 `window.addEventListener("message", ...)` 监听来自父页面的 `"puzzle-completion-event-request"` 消息。谜题完成时通过 `postMessage` 回发包含以下信息的 JSON：

```json
{
  "puzzleId": "...",
  "numberOfPieces": 150,
  "elapsedTime": 1234
}
```

---

## 总体架构图

```
┌─────────────────────────────────────────────────────┐
│                    jigex-prog.js                     │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │ Polyfill │  │ 全局配置  │  │  模块加载器         │ │
│  └──────────┘  └──────────┘  └────────────────────┘ │
│                                                      │
│  ┌─────────────────────────────────────────────────┐ │
│  │              渲染层 (ClipGL / WebGL)              │ │
│  │  Clip → Texture → VertexManager → Shader → GPU  │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ┌──────────────────┐   ┌──────────────────────────┐ │
│  │   游戏逻辑层      │   │       网络层              │ │
│  │  Puzzle / Piece  │←→│  multiplayer (Photon SDK) │ │
│  │  Group / knife   │   │  sendUpdate / onAction    │ │
│  └──────────────────┘   └──────────────────────────┘ │
│                                                      │
│  ┌──────────────────┐   ┌──────────────────────────┐ │
│  │    输入层         │   │       UI 层               │ │
│  │  Controller      │   │  niftybar / ui module     │ │
│  │  Mouse/Touch/    │   │  BoxTop / snapIndicator   │ │
│  │  Pointer         │   │  Toolbar / Dialogs        │ │
│  └──────────────────┘   └──────────────────────────┘ │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │  Sonic   │  │ 错误监控  │  │   文件加载/存档     │ │
│  │ (音频)   │  │ (rg4js)  │  │   localStorage      │ │
│  └──────────┘  └──────────┘  └────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

*分析基于 jigex-prog.js（2651 行），版本信息见文件头部注释。*
