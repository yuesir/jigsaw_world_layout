# `jigex-prog.js` 模块拆解

> 源文件：`D:\code\jigsaw_world_layout\jigex-prog.js`（2652 行，约 284KB，混淆压缩版）
> 归属：无归属 jigsaw puzzle 程序
> 拆解视角：模块边界 + 关键数据结构 + 状态机 + 关键算法

---

## 一、整体架构

**入口模式**：IIFE + `jigexGlobals.modules` 注册表

- 全局只暴露一个对象 `window.jigexGlobals`（源码中用 `e` 代指），其他所有变量都在 IIFE 闭包里。
- `e.modules` 上挂 `bundled / load / addModInit / update / haltInit / onInitComplete / onProgramStart`。
- 模块字典 `s` 声明了 13 个模块：`base / niftybar / utils / ClipGL / Sonic / SonicH5 / theme / photon / multiplayer / snapIndicator / ui / footer / player`。
- `update()` 用拓扑顺序遍历，依赖满足就 `init()`，全部 `inited` 后调用 `onProgramStart`。
- `haltInit()` 可在 WebGL 初始化失败时调用，让后续模块不再初始化。

**主流程**：

1. 读 `jigex-loader` 标签的 `data-puzzle-url / data-nop / data-color / data-credit / data-promo-*` 等属性，存到 `e.parms`。
2. 并发拉 promo1 / promo2 / profile.json，注入 `parms()`。
3. 拉 jQuery（带多重 CDN 兜底），然后逐个加载各模块。
4. 加载完成 → `t.player`（player 模块）执行 → 创建 `_.Puzzle` 实例 → 走 `init_prepping → prepping → waiting → ready → playing` 状态机。

---

## 二、基础层模块

### 1. `openConsole`

统一的日志门面。定义了 10 个级别（`detail / debug / trace / diag / log / note / info / warn / error / fault / assert`），用 `console.*` 输出，缓冲到内部数组 `b` 用于"导出日志给 Support"（`z.setAuxData("Logs", r.toString())`），并通过 `onlogwrite` 钩子把 `fault` 级日志喂给 `errMonitor.sendReport`。

### 2. `Sym`

带序号的枚举类（ordinal 可比较），支持按 `group.name.ordinal` 全局查找。常量集合：
- `themes`（12 种主题色）
- `layers`（5 个渲染层）
- `PC`（piece control，piece 状态）
- `PS`（puzzle state，拼图状态）
- `EDO`（edges display option，只显示边）
- `captures` / `connections`（bitmask 标志）

### 3. `Variant`

响应式状态变量，类似 MobX。核心方法：

- `get / set`：校验 → 通知监听器
- `addListener / removeListener`
- `lock / unlock` 防止误改
- `LOG_NONE / FAILURES / CHANGES / ALL / DEBUG` 5 档日志级别
- `Variant.define(host, name, variant)` 把 Variant 暴露成 host 的 getter/setter

这是整个游戏的"反应式"骨干，`piece.state / group / hasMoved / remotePlayerName / puzzle.state / puzzle.isComplete / capState` 都是 Variant。

### 4. `StateCell`

显式 FSM。定义 `definedStates`，每个 `(event) → state` 转换由注册的 handler 返回 `newState` 或 `{newState, cancel}`。`snapIndicator`、`multiplayer` 的某些状态用 StateCell 而不是 Variant，因为它们关心"事件"而不是"值"。

### 5. `errMonitor`

Raygun (`rg4js`) 集成。过滤掉已知噪音（内存不足、跨域脚本错误、jQuery 错误等），把 `n` 里的辅助数据（`setAuxData`）和栈合并上报。`sendReport(msg, {manual:true})` 是用户主动从 UI 触发的。

### 6. `base` 模块

加载 `open-console / sym / variant / state-cell / jQuery`，并把 `window.Variant / Sym / StateCell` 挂到 `t`（modules）上。它的 `dependenciesReady` 守住"基础设施 ready"这一关。

---

## 三、UI 与交互模块

### 7. `niftybar`

自实现的工具栏/面板/对话框/侧滑组件库。核心类：

- **Button**（4 种 style：`0=普通 / 1=icon / 2=tab / 3=menu / 4=dialog`）
  - 支持 `enabled / toggled / debounce / tooltip / autoClick`
  - 可绑 touch / pointer / mouse 事件
- **Bar**：容器，统一管理一组按钮
- **Panel**（4 种 type：`1=panel / 2=sub / 3=dialog / 4=left-slide`）
  - 支持 `visible() / center() / handleResponse(response)`
  - 鼠标 hover 自动 dismiss 关闭
- **全局键盘**：
  - `Esc` 关闭顶层 dismissable panel
  - **回车**触发默认按钮
- **变量** `enabled` 用 `Variant.define` 暴露，UI 可以一键禁掉所有按钮
- **tween / tooltip** 用 jQuery + requestAnimationFrame 自实现

### 8. `utils`

杂物间：

- `List`：双向链表，带 free list 池。`addFirst / addLast / addBefore / addAfter / moveToBeginning / moveToEnd / unlinkFirst / unlink / find / dispose`
- `WebReq`：统一的图片/文件下载封装（XHR + Image），状态机 `0→1→2→3→4→5`，支持 `onload / onprogress / cancel`，处理了 Chrome `status=0` 那个老 bug
- `postMsg`：简单 POST 助手
- `getRandomSeed / getRandomGenerator`（Mulberry32 算法）
- `genGuuid` / `stringToVarName` / `sine / cosine`（带度数缓存）/ `xor / fileNameFromPath / localStore`（带 localStorage 不可用时的 polyfill）
- `secureString`：XSS 转义
- `convertTimestampToLocalDateAndTime / convertTimestampToTime`
- `stringify`：JSON 序列化，带循环引用处理
- `sysTiming.Timer`：基于 `requestAnimationFrame` 的计时器

### 9. `Sonic / SonicH5`

双策略音频：

- `Sonic`：用 `AudioContext.decodeAudioData` 解码 mp3，再用 `BufferSource` + `GainNode` 播放——延迟低、可并发、可淡出
- `SonicH5`：用 `<audio>` 元素 + `play()` Promise，移动端兜底
- `e.forceAltAudio` 由 localStorage `jigex-alt-audio` 控制
- 准备阶段要用户点一下屏幕触发（`mousedown / pointerdown / touchstart`）
- `e.audioMuted()` 状态持久化到 `jigex-opt-muted`

### 10. `footer`

广告（AdThrive / Raptive）的状态管理：

- 监听 DOM MutationObserver 检测 `AdThrive_Footer_1_*` 容器
- 暴露关闭按钮和"暂停弹窗"（popover）
- 给 GDPR / comscore 注入隐藏样式

---

## 四、渲染与主题

### 11. `ClipGL` —— 核心渲染器

WebGL 2D 拼图渲染器。设计很紧凑：

#### 数据布局（`vertMngr`）

一个巨大的 `Float32Array R`，每 15 个 float = 1 个六边形（实际是 6 个顶点 / 2 三角形），字段顺序：

```
pos.xy | scale.xy | trans.xy | rot.xy | state | color | opacity | tex0.uv × 4 | tex1.uv × 4
```

当 piece 移动/旋转/换纹理时只更新对应 15 个 float。双 VBO 缓冲（`F` 和 `H`）实现 ping-pong 上传。

#### Shader

- **顶点着色器**：接收 `aspect / invAspect / scale / trans / rot` 做变换
- **片元着色器**：组合 `u_image + u_mask + u_mask2`，支持 bevel + 阴影
- **三个默认 shader**：`defColorShader / defImageShader / defImageAndMaskShader`
- **piece shader**（player 模块的 `cut()` 编译）：按 state 位做 bevel / 阴影 / 连通边变亮（`lightShad / darkShad / shad`），通过 switch 选 5 档 smoothstep 系数

#### Clip

每张图片对应一个 `Clip`（继承自 vertMngr 的一条记录 + texture + 可选 mask + 可选 mask2 + 6 个可补间属性：`position / angle / opacity / color / size / touchRect`）。每帧用 `Clip.drawAll()` 把相邻相同 shader+texture+mask 的 clip 合并一次 `drawArrays`。

#### Tweener 系统

- `Tweener`（老版，已弃用）
- `Tweener2`：`{state, fromValue, toValue, startTime, duration, ease, onStep, onEnd, link}`，状态 `not_queued → pending → active → completed / delayed`，支持 `extend()` 串联
- `updateTweeners(now)` 每帧推进
- 6 种 ease：`EASE_NONE / IN / IN_SLOW / OUT / OUT_SLOW / IN_OUT`

#### PosPoint

每个 clip 的位置，逻辑坐标 ↔ OpenGL 坐标互转（`(0,0)→(-1,1) / (W,H)→(1,-1)`），带 pixel 对齐处理（奇偶判断决定 floor/round）。

#### Texture 池

最多 32 张，按 `name` 复用，`addRef / subtractRef` 引用计数。

#### Context lost / restore

监听 `webglcontextlost / webglcontextrestored`，重新编译 shader、reset 纹理。

#### Animators

精灵图动画（applause 动画用），按 fps 翻帧。

### 12. `theme`

12 个 Sym（blue / brown / gray / yellow / white / charcoal / lavender / teal / coral / plum / green / olive），每个 theme 是：

```js
{
  name,
  texUrl: 'leather-{name}.jpg',
  altTexUrl,
  color: { background, panel, highlight, border }
}
```

`Variant` 暴露当前 theme，UI 监听 `isLoaded` 把色值注入到 niftybar CSS。

---

## 五、网络与多人

### 13. `photon`

封装 Photon Realtime SDK（`LoadBalancingClient`）：

- AppId：`a0a94d7b-d90a-4161-ab65-91e8e3752c8c`
- 区域：`ns.photonengine.io:443`
- 状态机：`NOT_LOADED → LOADING → UNINIT → CONNING_NAM → CONNED_NAM → CONNING_MAS → CONNED_MAS → LOBBY → CONNING_GAM → CONNED_GAM → JOIN → DISCONN`
- API：`createAndJoinRoom / joinRoom / connect / disconnect / sendEvent / changeProperty`
- 回调：`onStateChange / onError / onJoinRoom / onActorJoin / onActorLeave / onEvent`

### 14. `multiplayer`

房间协调 + 协议层：

#### 房间自定义属性

格式 `p-{pieceId} = {x, y, a (angle/90), m (moved), g (groupId), p (playerId), pv (pivotId), wc (wasCaptured)}`：

- `p-` 开头的 key 走 piece 更新
- 其他 key（`edo` 等）走 `onSettingChange`

坐标在 server 端归一化（× canvas 宽高），本地还原。同步节奏通过 `sendUpdate` 节流，1-3 名玩家 200-1000ms 一次。

#### 状态机

`joinedToGameVar`（Variant）控制 `createAndJoinGame / joinGame / leaveGame`，`session id` 用 `localStore jigex-mp-game-rec` 持久化（防重连错位）。`completeWhenLoaded`：断线重连后如果游戏已完成，自动 `onComplete`。

#### 回调注入

`onAction / onEvent / onSettingChange / onLoading` 由 player 模块注入。

#### Timer

`{elapsed, start, stop, getElapsedSecs, conditionalStart, update}`，master 玩家才动 `elpsd`。

#### Tab 可见性

监听 `visibilitychange`：标签切走 10s 后未在游戏中就 leaveGame。

### 15. `snapIndicator`

两个箭头图片（`snap-indicator-left.png / right.png`）做吸附提示，状态机 `available → active → killed`，离屏自动 `fadeOut`。多人模式下还在箭头上方显示"对方玩家名字"。

---

## 六、UI 模块

`Je = t.ui` 是大对象，挂在 `e.modules.ui`。包含以下子模块：

- **状态机**：`Je.starterDlg / connPanel / joinPanel / invitePanel / colorMenu / numPiecesMenu / pause / programLog / toast`
- **快捷键处理**（在 player 模块的 `Controller.handleEvent → rt`）：

| 键 | 功能 |
|---|---|
| `B` | peek box top |
| `C` | toggle capture mode |
| `D` | 删除所有记录（Shift+D） |
| `I` | 打印选中 piece 信息（Shift+I） |
| `K` | 强制无广告（Shift+K） |
| `M` | 弹程序日志（Ctrl+Shift+M） |
| `P` | 暂停 |
| `R` | 重新散开（relayer + scatter） |
| `S` | 导出 record（Ctrl+Shift+S） |
| `T` | 切主题 |
| `U` | 跑测试（Ctrl+Shift+U） |
| `X` | 加 #audit hash |

- **自适应 toolbar**：根据宽度把按钮挪到 `-alt` 占位
- **alt audio 切换**：localStorage `jigex-alt-audio`
- **全屏**：跨浏览器 API 包装
- **通用 UI 服务**：`msgbox / deleteRecordPrompt / stopAds / cursor / setClock / busy / update`
- `Je.update()` 是单点刷新入口，根据 `Puzzle.curr.state / showEdgesOnly / captureMode / numPieces / etc.` 同步按钮 toggled/enabled

---

## 七、Player 模块 —— 拼图核心

文件最大、最复杂的部分，包含以下子对象：

```
_.Controller
_.Puzzle
_.Piece
_.Group
_.traditionalKnife / _.knife
_.clock
_.puzzleRecord / _.recordsManager
_.Credits
_.applause
_.onEscape / _.delayedActions / _.trollShield / _.createContext
_.background / _.boxTop / _.Subject
_.restoreGame / _.test / _.missingPieceCheck
```

### 7.1 状态机

#### Puzzle 状态 `PS_*`（Sym）

```
DEAD(0) → INIT_PREPPING(1) → PREPPING(2) → WAITING(3) → READY(4) → PLAYING(5)
       ↘ captured 状态变量 capState: off(0) → ready(1) → capturing(2) → releasing(3)
```

#### Piece 状态 `PC_*`

```
resting(0) → selected(1) → moving(2) → touched(3) → captured(4) → remote-select(5) → remote-control(6)
```

### 7.2 `Controller`（输入聚合）

3 个 controller（`mouse / touch / pointer`），把事件标准化（clientX → canvas 像素），带 `captor` 机制（一次只响应一个 piece）。`Controller.handleEvent` 是大分发器：

- `pointerup + touchend` 在 Chrome 64 之前的 bug 用 `st()` 兜底（合成 `pointerup`）
- `keydown` 走 `rt` 路由所有快捷键
- `shakeDetector`：检测"摇一摇"操作，玩家摇动时批量释放被捕捉的 piece（移动端体感增强）
- `trollShield`：记录最近 10 次 piece 互动时间戳，5 秒内全 10 次就触发 alarm，限制 neighbor 吸附

### 7.3 `Subject`（拼图原图）

- 加载原图 → 缩放到 `≤ canvas × 0.9`，边距 7px
- 注册成 `Texture`
- 同时把图给 `_.boxTop.setImage` 用来生成"盒面"预览

### 7.4 `boxTop`（盒面预览）

- `setImage` 后用 `setScale` 计算实际尺寸（mystery puzzle 限制 80%）
- 通过 `canvas 2D` 抠出"凹进"和"凸出"两版（用 `quadraticCurveTo` 加阴影 + 透明度），生成两个 Clip
- API：`show / hide / peek / unpeek / autoPeek / moveTo / toggleDisplay`
- `B` 键触发 `autoPeek`
- `drag`：按下 mouse/pointer/touch → 绑 move/up → 改 `posX / posY`

### 7.5 `background`

加载主题纹理（leather 背景），按 canvas 尺寸自动重铺。同时支持 `powered-by-logo.png` 和自定义 `logoUrl`。

### 7.6 `traditionalKnife` + `knife.cut()`

拼图形状生成器：

#### 4 种曲线模板

- `Nn = sock`（12 个 Bézier 控制点）
- `Rn = finger`
- `Dn = ball`
- `Gn = stub`

每种 0° / 90° / 180° / 270° 各有反向版本。

#### 索引表

- `Ee[36]`：36 种形状排列组合（bend + curve 4×3 之外的 N 系列），用 `shapeIndex` 取
- `_e[30]`：30 种 tab / hole 朝向排列（用来在边上随机挖凸/凹）

#### `buildMask(specs, rows, cols)`

1. 对每条边先按"邻接 piece 的反向"继承 bend / curve，再以一定概率从 `_e` 取 tab 方向
2. `measure`：用临时 canvas 画一遍 tab / hole，实测高度（自动调整 `tabHeights / holeHeights` 缓存，第二次起就用查表）
3. 把 `mask / mask2` 写到共享 canvas，阴影/凹凸由着色器实时算

#### `cutChoices`

根据 Subject 尺寸穷举 N×M，给玩家 6+ 个 piece 数选择（手机/平板/桌面分别有上限 35/60/100）。

#### `cut(subject, choice)`

1. 选 piece 数 → 算 `lightingLevel` 和 `shadowDepth / bevelDepth`
2. 编译 piece shader（按 lightingLevel 选 5 档 smoothstep 系数）
3. 生成所有 piece spec
4. 建 mask → `new Piece(spec)` 一个个挂到 `pieces` 链表
5. `scatter()`

`lightingLevel` 6 档：30×30 以下、40、50、60、100、100+，对应不同阴影深度。

### 7.7 `Piece`（每一片拼图）

继承 `Clip`，重写 `state / group / hasMoved` 为 Variant。

#### 邻居

- `neighbors[4]`：上下左右相邻 piece
- `caterNeighbors[4]`：四角对角 piece

#### `handleEvent`：状态机驱动

4 个本地状态 + 3 个远程/被捕获状态：

- **`F` 状态 + `mousedown`**：进入 `H`，记录 `moveOffsetX/Y`，加 mousedown/mouseup/move 监听
- **拖动距离 > `Oe=5*devicePixelRatio`**：→ `q`
- **`W` 状态 + 抬起**：
  - `t.fromTouch` 且基本没动 → 旋转 90°（移动端点一下转一下）
  - 其他 → drop

#### `move(x, y, opt)`

调用 `applyTask` 把整个 group 一起搬，可选 `tween` 动画、`throttle`、回调。

#### `rotate / rotateTo`

- `rotateTo(angle, slow, cb)`：自动拆 90/180/270° 多次 `rotate`
- 保持 piece 离 pivot 距离不变（`gap.measure + radius + angleDelta`）
- `keydown 37/39` 触发旋转
- `wheel` 滚动也支持（被 `e.skunkOptions.disableScrollWheelRotate` 关掉）

#### `join(neighbor)`

合并两个 group（`_.Group.join` 合并成员、更新 `edgeCount / isEdge`），触发 snap 音效与多人同步。

#### `neighborWithinSnapRange`

`gap.measure + Math.abs` 在 snap 半径内才算相邻。

#### `drop(immediate)`

松手后吸附检查 + 多人 `sendUpdate`。

#### 其它

- `raise / matchLevelOf / moveToFit / applyTask`：group 内 piece 层级和位置同步
- `applyTask(fn, onDone, members)`：在 group 成员上批跑 fn，所有完成才触发 onDone，task 失败就 throw
- `isInMainAssembly`：判断 piece 是否在主体装配里（`edgeCount > numEdges/2` 或 `length > total/2`）
- `trollShield.pieceHandled`：每改一次状态就记一次时间戳，alarm 触发就拒绝吸附

### 7.8 `Group`

- 字段：`members[] / id / refPiece / isEdge / edgeCount`
- `join(piece1, piece2)`：两 piece 合一组，gap 测量后 `moveToFit`
- `sendToBottom` / 隐式 `length` getter

### 7.9 `pieces` 链表（继承自 `O.clips[ne]` 即 `pieces-layer`）

- 双向链表（utils.List 那一套），加 piece 算 zOrder
- `numRows / numCols / length / numEdges / isEdgeComplete`（getter，按需重算）：
  - 通过 `Ct()` 走一遍所有 piece 算 `bt[] / xt[]`
  - `isEdgeComplete` 是 `唯一的 group.edgeCount === total`
- `getPieceAt(controller)`：
  - 先看 `Piece.selectedPiece` 是不是本人
  - 否则用 `O.clips.getClipAt` 拿 top-most piece
  - 被他人 remote-control 锁的会显示"另一个玩家正在操作" tooltip
- `dispose`：所有 piece `stateVar.dispose + piece.dispose`，链表清空
- `audit / applyTask`：遍历执行

### 7.10 `scatter()`（随机散落）

- 算螺旋路径（`j = 3→1→2→0` 四象限推进）
- 避开 boxTop 显示区
- 避开其他已放置 piece 的包围盒
- `getScatterSequence()`：按 `sortOrder` 排，但避免相邻 piece 紧挨着出现（`5!==o` 计数器）
- `byCommand` 模式下还有 `vn()` 双击切换 `compactMode`（两次散开间隔 > 600ms）
- `record` 已存在 + `partial` 为 false：直接从 record 还原坐标 + group

### 7.11 `showEdgesOnly(edo, action, animDelay)`

- `EDO` 状态：`animate / instant / value-only`
- `animate` 模式：fadeOut 非边 → relayer → scatter
- 多人模式下 `master` 玩家同步 `changeSetting("edo", ...)`
- `isEdgeComplete` 触发时强制关掉

### 7.12 `toggleCaptureMode`

- **进入**：`capState=K (ready)` → mousedown 抓 piece → `capState=Q (capturing)` → 收集到 `capturedList`
- **退出**：mouseup 释放（自动 `neighborWithinSnapRange` 吸附）→ `capState=Z (releasing)` → 全部释放回 `F`
- `Esc` 也能强制退出

### 7.13 `Clock`

```
qn = startTime
Wn = totalMs
```

- API：`getElapsedSecs / pause / resume / stop / onTick / onClick`
- 多人模式下用 `d.timer`（房间同步时钟）代替本地时钟

### 7.14 `puzzleRecord`（保存/恢复）

#### 字段

```
info / home / ver=8 / progv / id / pid / nam / cred / credu / date / thm / num /
rot / cmplt / tmr / edo / cmpt / seed / aseed / asp / hnts / pau / shp / bt / pcs[] / chksm
```

#### 坐标

`pcs[i] = {id, x, y, a, m, g}`（归一化坐标 5 位小数）。

#### 保存

`update(debounce)`：500ms 后真正写 localStorage。

#### 校验

`chksm` 校验算法：`(37 + n² + c² + t) * 37` 之类，ver=6 老记录有专门迁移函数。

#### API

`findTuple(id) / save / dispose / purge`

### 7.15 `recordsManager`（localStorage 索引）

- 启动时从 `localStore` 拉所有 `jigex-rec-` 开头 key，校验后塞进 `a{}`
- **去重**：同 `pid` 只留最新；`cmplt` 的记录清掉
- **容量**：超过 10 条删最旧
- API：`find(name) / youngest() / cache(rec) / store(rec) / delete(id)`
- `cache(rec)`：把"最近用的 record"记下来，避免每次都遍历

### 7.16 `Credits`（图片版权信息）

按 photographer / license（PD / CC×6 / SSTOCK）渲染不同文案：

- short 版用 toast
- long 版用 credits 面板

### 7.17 `applause`（完成动画）

- 预加载 `applause-2.png` 精灵图（15 帧、5×3、12.5fps）
- 3 排人群从屏幕外 tween 进场，2 秒后落到底部
- 任意输入 / Esc 中断动画

### 7.18 `trollShield`（防作弊）

每片 piece 状态变 F → Y/X 记一次时间戳，超过 5s 内 10 次就触发 `alarm`，`neighborWithinSnapRange` 返回 `null` 拒绝吸附。

### 7.19 多端集成

- `si / di / hi / ei / pi` 等一批 `xi` 函数处理多人操作到来时的本地动画（fade out → move → fade in，或 cap 状态机）
- `onAction(event)`：player 注入到 multiplayer 的处理入口
- `onSettingChange("edo", value, immediate)` 同步 `showEdgesOnly`
- `joinedToGameVar` 监听：掉线 10s 后 `rejoining` 状态尝试重连

### 7.20 `restoreGame` / `rescale` / `onComplete`

- `restoreGame`：加入多人房后用 `d.gameInfo` 还原 rotatable + placePieces
- `rescale`：浏览器尺寸变化时重置 canvas + subject + boxTop + primer-layer + pieces
- `onComplete`：
  - 触发 `puzzle_completion` GA 事件
  - 调接口 `incr` 完成数
  - 500ms 后播 applause

### 7.21 `onProgramStart`（整个 player 模块的最后一步）

- 绑 `contextmenu` 屏蔽（recentTouch 时）
- 绑 `postMessage` 协议（"puzzle-completion-event-request"）
- 主题按钮、开始按钮、旋转按钮、文件选择按钮、`gameId → join/show` 流程
- `theme.isLoaded` 时机 inject 音频 `t.Sonic.prep()`

---

## 八、值得注意的设计点

### 1. Variant + Sym 几乎是整个游戏的"领域类型系统"

所有可观察状态都用 Variant 包装，所有"类别/状态"都用 Sym。这样 `gt / lt / bet / eq / neq` 一组调用就能写出可读的状态机。

### 2. Min / Max 角点处理

`piece.move` 在 iOS 上把 piece 限定到屏幕可见区域（`Ge=35*devicePixelRatio` 留白），`auditPieces` 每帧修正越界 piece。

### 3. 多人冲突解决

- `lsync=false` 时 master 玩家广播 piece 位置，其他客户端只接收（`sendUpdate` 内 `isMaster() || wasCaptured` 判定）
- `lsync=true` 时所有客户端都广播自己改动

### 4. 旋转入口

**滚轮旋转**（`rotate(piecerotate)`）和 **点击旋转**（移动端 tap）是 piece.rotate 的两条用户路径，内部都走 `applyTask + Tweener2`。

### 5. Compact mode

`vn()` 切换：piece 散得更紧凑，靠 `scatter` 的 `y=.03125` 系数。

### 6. 审计兜底

`auditPieces`（line 1805）每 1.5s 跑一次（rotatable 切换时），修角度不一致、修越界位置、修 isEdge 计数，复杂错误会触发 `x.sendReport("Rotation corrections")`。

### 7. 渲染数据布局的高效性

每片 piece 只占 15 个 float（共 60 字节），整个游戏的 vertex buffer 在 18,000 float 左右（= 1200 片 piece），对 GPU 几乎零压力。

### 8. 模块间通信

- **Variant 监听**：UI ↔ 游戏状态
- **postMessage**：跨 iframe / 父窗口（嵌入模式）
- **Photon 房间属性**：跨客户端（多人模式）
- **localStorage**：跨会话（进度保存）

### 9. 健壮性

- WebGL context lost 自动恢复
- localStorage 不可用自动降级到内存 map
- Web Audio 不可用降级到 HTML5 audio
- iOS 早期 Safari bug 有专门 alert
- Chrome `status=0` 下载 bug 专门处理
- 鼠标 / 触摸 / pointer 三套事件统一抽象

### 10. 调试基础设施

- `t.Variant.enableLogs` 可动态开关日志详细度
- `audit` / `getPieceAt` 失败时 `sendReport`
- `test` 系列函数暴露在 player module
- `verboseLoggingVar` 影响 Variant 内部 log
- `dbgEvents` / `logEvents` 状态变量做事件流记录

---

## 九、模块依赖关系图

```
                     ┌──────────┐
                     │  base    │ ← jQuery, openConsole, Sym, Variant, StateCell
                     └────┬─────┘
              ┌───────────┼─────────────┐
              ▼           ▼             ▼
          ┌───────┐  ┌────────┐   ┌──────────┐
          │ utils │  │  nifty │   │  ClipGL  │
          │       │  │  bar   │   │          │
          └───┬───┘  └───┬────┘   └────┬─────┘
              │          │             │
              │          │      ┌──────┴──────┐
              │          │      ▼             ▼
              │          │  ┌───────┐    ┌──────┐
              │          │  │ Sonic │    │theme │
              │          │  │SonicH5│    └──────┘
              │          │  └───┬───┘
              │          │      │
              │          ▼      ▼
              │      ┌──────────────┐
              │      │   footer     │ (AdThrive)
              │      └──────────────┘
              │          │
              ▼          ▼
          ┌──────────────────┐
          │   photon         │
          └────────┬─────────┘
                   ▼
          ┌──────────────────┐
          │   multiplayer    │
          └────────┬─────────┘
                   ▼
          ┌──────────────────┐
          │  snapIndicator   │
          └────────┬─────────┘
                   ▼
          ┌──────────────────┐
          │       ui         │
          └────────┬─────────┘
                   ▼
          ┌──────────────────┐
          │     player       │ ← Puzzle, Piece, Group, Knife, Clock, Record
          └──────────────────┘
```

---

## 十、关键文件/行号速查

| 模块 | 大致行号 | 核心对象 |
|---|---|---|
| IIFE 入口 | 1-156 | jigexGlobals, modules, parms, update |
| openConsole | 158-212 | log/fault/assert |
| Sym | 213-230 | Sym, ordinal |
| Variant | 231-310 | Variant, define, enableLogs |
| StateCell | 311-335 | StateCell, r (factory) |
| base 模块 | 336-345 | t.addModInit("base", r) |
| footer | 347-388 | ad-controller state cell |
| SonicH5 | 389-416 | SonicH5, prep |
| Sonic | 417-443 | Sonic, audioMuted |
| niftybar | 444-566 | Button, Bar, Panel, Tooltip, Tween |
| utils | 568-674 | List, WebReq, postMsg, getRandomGenerator, sysTiming |
| ClipGL | 676-1050 | vertMngr, Clip, Texture, Shader, Tweener2, PosPoint |
| theme | 1051-1066 | Variant(v), 12 Sym |
| photon | 1068-1108 | LoadBalancingClient 包装 |
| multiplayer | 1109-1206 | onAction, joinedToGameVar, timer |
| snapIndicator | 1207-1238 | pool of 2-arrow clips |
| ui | 1239-1476 | Je = {starterDlg, connPanel, joinPanel, invitePanel, colorMenu, numPiecesMenu, msgbox, ...} |
| player | 1477-2652 | _.Puzzle, _.Piece, _.Group, _.knife, _.clock, _.puzzleRecord, _.recordsManager, _.Credits, _.applause |
