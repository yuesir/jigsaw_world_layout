# `jigex-prog.js` 拼图游戏实现逻辑分析

## 文档说明
- 目标文件：`d:\code\jigsaw_world_layout\jigex-prog.js`
- 分析目标：按照模块拆解这份拼图游戏主程序的实现逻辑，并梳理其整体架构、核心对象、数据流与主要功能分层。
- 结论先行：这不是一个单纯的“切图算法文件”，而是一套完整的网页拼图应用主程序，内部同时包含兼容层、错误监控、模块加载、WebGL 渲染、UI、音频、多人联机、切图算法、存档恢复和完成统计。

---

## 一、整体判断

`jigex-prog.js` 采用的是“多段 IIFE 自执行模块 + 自建模块注册器 + 主引擎命名空间”的实现方式。  
整个文件不是围绕某一个类展开，而是分为多个模块，逐步完成以下工作：

1. 浏览器兼容与错误监控
2. 全局配置与参数解析
3. 模块系统与依赖加载
4. 渲染基础设施
5. UI 和交互壳层
6. 拼图核心对象与玩法状态机
7. 切图与拼块外形生成
8. 存档、多人同步、恢复和完成反馈

真正决定拼图玩法体验的核心，集中在 `player` 模块中定义的这些对象：

- `Puzzle`
- `Piece`
- `Group`
- `knife`
- `clock`
- `recordsManager`
- `multiplayer`

---

## 二、总入口与启动流程

程序最外层入口位于：

- [jigex-prog.js:L1-L157](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1-L157)

这里主要做四件事：

1. 补浏览器兼容能力
2. 初始化错误监控系统
3. 解析 URL 参数与 DOM 配置
4. 建立 `jigexGlobals.modules` 模块系统

模块加载器的核心定义位于：

- [jigex-prog.js:L134-L140](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L134-L140)

它维护一张模块表，并提供：

- `addModInit(name, fn)`：注册模块初始化函数
- `update()`：轮询依赖是否满足并初始化模块
- `haltInit()`：中止初始化
- `onInitComplete(fn)`：全部模块完成后的回调
- `onProgramStart`：程序正式启动入口

也就是说，这个应用的真正 `main()` 不在文件最开头，而是在所有模块初始化完成后，统一触发 `onProgramStart`。

---

## 三、第一层：启动与基础设施

### 1. 浏览器兼容层

位于：

- [jigex-prog.js:L1-L23](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1-L23)

这里补上了：

- `String.includes`
- `String.codePointAt`
- `String.startsWith`
- `Array.includes`
- `Array.from`
- `Math.imul`
- `Object.assign`
- `Map`

这说明程序从设计之初就考虑了旧浏览器兼容，甚至还兼顾 IE11 这类环境。

### 2. 错误监控系统

位于：

- [jigex-prog.js:L23-L48](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L23-L48)

这里的 `errMonitor` 会：

- 收集异常 message、stack、UA
- 识别是否属于浏览器兼容问题
- 判断是否需要上报
- 判断是否需要弹窗提示用户
- 如果存在 `rg4js`，则将异常推送到远程错误系统

它还对 Firefox、IE、Edge、内存不足、jQuery 注入异常等情况做了大量历史性特判，说明这份代码已经经历过较长时间线上运行。

### 3. 参数解析与全局配置

位于：

- [jigex-prog.js:L78-L116](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L78-L116)

`e.parms()` 会把以下来源合并成统一配置：

- URL 查询参数
- DOM `data-*` 属性
- profile JSON 配置

最终形成统一的 puzzle 配置对象，里面包含：

- `puzzleId`
- `url`
- `nop`
- `min`
- `cred`
- `credu`
- `color`
- `gameId`
- `recId`
- `promo1/2`
- `debug`

同时资源路径常量也在前面统一定义：

- [jigex-prog.js:L70-L75](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L70-L75)

包括：

- 主页域名
- CDN 域名
- 图片路径
- 音频路径
- 脚本路径
- profile 路径

---

## 四、第二层：模块系统

模块清单定义位于：

- [jigex-prog.js:L50-L55](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L50-L55)

模块包括：

- `base`
- `niftybar`
- `utils`
- `ClipGL`
- `Sonic`
- `SonicH5`
- `theme`
- `photon`
- `multiplayer`
- `snapIndicator`
- `ui`
- `footer`
- `player`

这套模块系统不是 ES Module，也不是 CommonJS，而是“运行时依赖检查模型”：

- 每个模块定义自己的 `dependenciesReady()`
- `modules.update()` 反复扫描模块表
- 只要依赖满足，模块就会初始化

这意味着整个程序加载是“渐进构建”的，而不是一次性 import 完成。

---

## 五、第三层：底座运行时

这一层主要位于：

- [jigex-prog.js:L158-L336](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L158-L336)

### 1. `openConsole`

位于：

- [jigex-prog.js:L158-L212](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L158-L212)

这是一个增强版日志系统，提供：

- 多级别日志
- 内存中日志缓存
- 格式化输出
- 原生日志回退
- 日志长度控制

后面大量 `log / warn / error / fault / detail` 都基于它。

### 2. `Sym`

位于：

- [jigex-prog.js:L213-L231](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L213-L231)

它是一个轻量枚举类，后面所有主题、状态、图层、模式等都通过 `Sym` 创建。

### 3. `Variant`

位于：

- [jigex-prog.js:L231-L300](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L231-L300)

这是全局状态系统的核心。它支持：

- 值变化监听
- 校验器
- 锁定/解锁
- 错误信息记录
- 日志跟踪

可以把它理解为“可观察变量 + 状态约束器”。

### 4. `StateCell`

位于：

- [jigex-prog.js:L300-L336](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L300-L336)

这是有限状态机封装，用于处理事件触发的状态迁移。  
后面的广告 footer 控制器就大量使用了它。

---

## 六、第四层：基础模块

### 1. `base`

位于：

- [jigex-prog.js:L336-L346](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L336-L346)

作用：

- 加载并确认 `jQuery`
- 将 `openConsole`、`Sym`、`Variant`、`StateCell` 接入模块系统
- 设置日志和默认行为

### 2. `footer`

位于：

- [jigex-prog.js:L347-L388](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L347-L388)

作用：

- 管理广告 footer
- 监听广告 DOM 变化
- 插入关闭逻辑
- 清理广告相关浮层

它不是玩法核心，但说明程序用于真实商业站点。

### 3. `SonicH5` / `Sonic`

位于：

- [jigex-prog.js:L389-L444](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L389-L444)

作用：

- 构建 HTML5 Audio 与 Web Audio 双后端
- 处理第一次交互后才能播放声音的问题
- 提供吸附音、加入/离开音、鼓掌音等反馈

---

## 七、第五层：UI 框架层 `niftybar`

位于：

- [jigex-prog.js:L445-L567](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L445-L567)

它是一套自定义 UI 控件框架，负责：

- toolbar
- button
- panel
- dialog
- tooltip
- 左滑面板

核心能力包括：

- 按钮启用/禁用
- toggle 状态切换
- 自动关闭
- Esc/Enter 键控制
- 点击外部关闭面板
- tooltip 延迟显示

后面的 `ui` 模块并不直接从原生 DOM 重新造逻辑，而是大量使用 `niftybar.getBtn / getBar / getPnl` 提供的对象。

---

## 八、第六层：工具模块 `utils`

位于：

- [jigex-prog.js:L568-L675](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L568-L675)

关键工具包括：

### 1. `List`
- [jigex-prog.js:L570-L597](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L570-L597)
- 自定义双向链表
- 用于渲染对象管理、pieces 集合管理

### 2. `WebReq`
- [jigex-prog.js:L598-L627](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L598-L627)
- 统一处理图片、JSON、二进制下载
- 支持主备地址、失败重试、Chrome Bug 回退

### 3. 可复现随机
- [jigex-prog.js:L629-L631](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L629-L631)
- `getRandomGenerator(seed)` 用于切图、散块时保证随机过程可复现

### 4. 本地存储
- [jigex-prog.js:L641-L649](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L641-L649)
- `localStore` 对 `localStorage` 做安全包装

### 5. HTML 转义
- [jigex-prog.js:L650-L652](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L650-L652)
- `secureString` 用于玩家名、credits 等字符串清洗

### 6. 定时与任务
- [jigex-prog.js:L661-L675](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L661-L675)
- `sysTiming` 提供统一 Timer 和 requestAnimationFrame 驱动的任务循环

---

## 九、第七层：图形引擎 `ClipGL`

位于：

- [jigex-prog.js:L676-L1050](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L676-L1050)

这不是简单 canvas 封装，而是专门服务拼图的 WebGL 精灵系统。

### 主要职责

- 初始化 WebGL 上下文
- 管理 `Clip`
- 管理纹理、shader、顶点缓存
- 管理 tween、动画和任务
- 管理截图、性能监测和上下文恢复

### 关键子系统

#### 1. `projector`
- [jigex-prog.js:L702-L708](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L702-L708)
- 主渲染循环
- 每帧刷新 tween、animator、顶点缓冲和截图任务

#### 2. `vertMngr`
- [jigex-prog.js:L712-L739](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L712-L739)
- 所有拼块、背景、盒图等对象的顶点信息都写入它管理的缓冲数组

#### 3. 上下文丢失恢复
- [jigex-prog.js:L1041-L1047](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1041-L1047)
- 监听 `webglcontextlost` / `webglcontextrestored`
- 自动重建 shader、texture 与顶点状态

在业务层里，后续的 `Piece`、背景、盒图和动画角色，本质上都是 `ClipGL.Clip` 的实例。

---

## 十、第八层：主题系统 `theme`

位于：

- [jigex-prog.js:L1051-L1067](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1051-L1067)

该模块定义了一组主题枚举及其配色方案，包括：

- 背景色
- 面板色
- 高亮色
- 边框色
- 纹理地址

`theme.val` 是一个 `Variant`。  
当主题变化时：

- 背景重新加载皮革纹理
- 工具栏、面板和按钮颜色也同步调整
- 存档中会记录主题编号，恢复时可还原

---

## 十一、第九层：联机底层 `photon`

位于：

- [jigex-prog.js:L1068-L1109](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1068-L1109)

它的职责不是“懂拼图”，而是对 Photon SDK 做一层业务友好的封装：

- 连接服务器
- 创建房间
- 加入房间
- 发事件
- 改房间属性
- 玩家进出通知

它为上层提供了网络通道，但“piece 如何同步、group 如何合并”不在这一层处理。

---

## 十二、第十层：多人拼图业务 `multiplayer`

位于：

- [jigex-prog.js:L1110-L1206](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1110-L1206)

这是把 Photon 房间转成“拼图协作规则”的业务层。

### 核心状态

- `joinedToGameVar`
- `errorVar`
- `onPlayerJoinVar`
- `onPlayerExitVar`

### 核心职责

1. 创建/加入拼图房间
2. 将拼块状态写入 Photon 房间属性
3. 发送选择、旋转、移动等事件
4. 同步房间配置，如是否边缘模式
5. 维护联机计时器
6. 处理断线重连与 session 安全性

### 关键方法

- `sendUpdate(piece, options)`
- `sendGroupUpdate(piece)`
- `changeSetting(key, value)`
- `placePieces()`
- `timer.start() / stop() / getElapsedSecs()`

### 核心设计特点

不是逐帧同步所有拼块，而是使用：

- 房间属性同步 piece 状态
- 事件消息同步瞬时动作

这样既能减少网络带宽，又能保证拼图状态一致。

---

## 十三、第十一层：吸附提示 `snapIndicator`

位于：

- [jigex-prog.js:L1207-L1238](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1207-L1238)

作用：

- 当拼块靠近可吸附位置时显示左右方向指示图
- 联机时还可提示哪个玩家正在操作某个拼块

这不是规则本身的一部分，但对交互反馈体验很重要。

---

## 十四、第十二层：业务 UI 模块 `ui`

位于：

- [jigex-prog.js:L1239-L1477](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1239-L1477)

它是整个程序的界面控制壳层，主要负责：

- 顶部工具栏按钮
- 帮助面板
- 消息框
- 主题菜单
- 拼块数量菜单
- 启动面板
- 暂停界面
- 日志面板
- 联机邀请面板
- 联机加入面板
- 当前房间状态面板

### 关键交互点

#### 1. 块数菜单
- [jigex-prog.js:L1404-L1412](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1404-L1412)
- 动态生成拼块数量候选按钮

#### 2. 主题菜单
- [jigex-prog.js:L1391-L1404](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1391-L1404)
- 动态生成主题按钮并绑定颜色切换

#### 3. 联机邀请面板
- [jigex-prog.js:L1328-L1363](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1328-L1363)
- 创建联机房间并生成邀请短链

#### 4. 联机加入面板
- [jigex-prog.js:L1372-L1391](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1372-L1391)
- 输入玩家名后加入现有房间

#### 5. 程序日志面板
- [jigex-prog.js:L1420-L1448](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1420-L1448)
- 打包日志和截图并发送给支持团队

---

## 十五、第十三层：主引擎 `player`

位于：

- [jigex-prog.js:L1477-L2652](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1477-L2652)

这里是整份程序真正的拼图核心。

进入 `player` 后，程序开始拥有这些关键对象：

- `Puzzle`
- `Piece`
- `Group`
- `knife`
- `clock`
- `recordsManager`
- `Credits`
- `applause`

这层负责从“图片和配置”真正过渡到“可玩的拼图局”。

---

## 十六、第十四层：状态系统

状态常量定义位于：

- [jigex-prog.js:L1512-L1513](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1512-L1513)

### 1. 拼图状态 `PS`

- `dead`
- `init_prepping`
- `prepping`
- `waiting`
- `ready`
- `playing`

### 2. 拼块状态 `PC`

- `resting`
- `selected`
- `moving`
- `touched`
- `captured`
- `remote-select`
- `remote-control`

此外还定义了：

- 捕获模式状态
- 图层状态
- 边缘模式状态

这套枚举是整个交互系统的语义基础。

---

## 十七、第十五层：输入控制系统 `Controller`

位于：

- [jigex-prog.js:L1537-L1605](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1537-L1605)

`Controller` 统一处理：

- mouse
- touch
- pointer
- keydown

### 核心职责

- 将浏览器坐标转换到 canvas 坐标
- 记录移动增量
- 管理当前被捕获的控制对象
- 分发事件到监听器
- 统一处理重复 touch/pointer 事件

### 快捷键逻辑

见：

- [jigex-prog.js:L1557-L1577](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1557-L1577)

包括：

- `B`：预览盒图
- `C`：捕获模式
- `P`：暂停
- `R`：重新散开
- `T`：主题菜单
- `Shift+Ctrl+S`：导出存档记录

这一层可以理解为“输入总线”。

---

## 十八、第十六层：背景、盒图与题图

### 1. 背景层

位于：

- [jigex-prog.js:L1605-L1625](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1605-L1625)

根据主题加载皮革纹理，并铺满整体背景。

### 2. 盒图 `boxTop`

位于：

- [jigex-prog.js:L1625-L1684](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1625-L1684)

支持：

- 显示/隐藏
- peek / unpeek
- 拖动位置
- mystery 模式下只显示局部

盒图不是普通 DOM 图片，而是经过 canvas 阴影处理后生成的 `ClipGL.Clip`。

### 3. 题图 `Subject`

位于：

- [jigex-prog.js:L1685-L1696](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1685-L1696)

作用：

- 按当前画布大小对原图做缩放
- 构建标准化纹理
- 为切图和盒图提供统一图像来源

---

## 十九、第十七层：`Puzzle` 对象

核心定义起点：

- [jigex-prog.js:L1837-L1884](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1837-L1884)

`Puzzle` 是“一整局拼图”的总对象。  
它管理：

- 当前题图
- 当前拼块集合
- 当前 record
- 当前主题
- credits
- mystery 配置
- 块数方案
- 切块种子
- 计时状态
- 联机 gameId

### 重要方法

位于：

- [jigex-prog.js:L1885-L1985](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1885-L1985)

包括：

- `reset()`
- `showEdgesOnly()`
- `updateRecord()`
- `resetPieces()`
- `start()`
- `toggleCaptureMode()`
- `percentComplete()`
- `onComplete()`
- `handleEvent()`
- `scatter()`
- `dispose()`

---

## 二十、第十八层：拼图准备流程

### 1. `Ht()`：就绪检查

位于：

- [jigex-prog.js:L1718-L1731](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1718-L1731)

检查：

- `Puzzle` 是否存在
- `subject` 是否就绪
- `boxTop` 是否就绪
- `ui` 是否 ready
- 如果是联机，是否已连入房间

### 2. `Wt()`：真正开始 prep

位于：

- [jigex-prog.js:L1734-L1751](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1734-L1751)

负责：

- 确定 rows / cols / piece size
- 调用 `knife.cut()`
- 绑定输入监听
- 恢复 record 或联机局面
- 恢复盒图、计时和边缘模式

### 3. `nn()`：块数候选生成

位于：

- [jigex-prog.js:L1778-L1785](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1778-L1785)

### 4. `on()`：改块数后重切

位于：

- [jigex-prog.js:L1785-L1790](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1785-L1790)

---

## 二十一、第十九层：题图来源与加载分支

### 1. 在线 profile 拼图
- [jigex-prog.js:L1764-L1778](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1764-L1778)
- 流程：请求 profile -> 请求主图和盒图 -> 应用主题和 credits

### 2. 自定义远程 URL
- [jigex-prog.js:L1771-L1777](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1771-L1777)
- 通过 `fetchPath + targetUrl` 拉取用户指定图片

### 3. 本地图片
- [jigex-prog.js:L2602-L2634](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2602-L2634)
- 使用 `FileReader.readAsDataURL` 读图并创建新 `Puzzle`

### 4. 本地 `.jigsaw`
- [jigex-prog.js:L2606-L2625](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2606-L2625)
- 支持新版与旧版存档格式恢复

---

## 二十二、第二十层：边缘模式 `showEdgesOnly`

位于：

- [jigex-prog.js:L1886-L1899](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1886-L1899)

这不是简单的显示切换，而是完整玩法模式。

它支持两种执行方式：

- `instant`：立即切换透明度并散开
- `animate`：渐隐渐现后重新排布

联机模式下，该状态还会同步到房间属性 `edo`。

边框拼完后，还会自动退出该模式。

---

## 二十三、第二十一层：`Piece` 对象

定义位于：

- [jigex-prog.js:L2004-L2017](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2004-L2017)

每个 `Piece` 同时是：

- 一个业务对象
- 一个 `ClipGL.Clip` 渲染对象

### 关键字段

- `id`
- `spec`
- `group`
- `neighbors`
- `caterNeighbors`
- `isEdge`
- `remoteData`
- `stateVar`
- `hasMoved`

### 关键方法

位于：

- [jigex-prog.js:L2017-L2179](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2017-L2179)

包括：

- `capture()`
- `release()`
- `move()`
- `rotate()`
- `drop()`
- `neighborWithinSnapRange()`
- `moveToFit()`
- `join()`
- `raise()`

---

## 二十四、第二十二层：`Piece` 交互状态机

核心位于：

- [jigex-prog.js:L2052-L2104](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2052-L2104)

本地拖拽主路径：

1. `resting`
2. `mousedown / touchstart`
3. `selected`
4. 移动超过阈值
5. `moving`
6. `drop()`
7. 返回 `resting` 或 join 到其他 group

还支持：

- 触摸轻点旋转
- 滚轮旋转
- 键盘旋转
- 捕获模式下的批量抓取/释放

---

## 二十五、第二十三层：吸附与拼接

### 1. 吸附判断

位于：

- [jigex-prog.js:L2116-L2122](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2116-L2122)

判定条件：

- 两块角度一致
- 不是正在旋转
- 位移与理论 gap 接近
- 距离误差在阈值内

### 2. 拼接逻辑

位于：

- [jigex-prog.js:L2125-L2137](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2125-L2137)

`join()` 会：

- 对齐位置
- 合并 group
- 更新边连接关系
- 播放吸附音效

### 3. 松手落块

位于：

- [jigex-prog.js:L2137-L2150](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2137-L2150)

`drop()` 会决定：

- 是否吸附到邻块
- 是否重设 `hasMoved`
- 是否联机广播
- 是否调整 group 层级

---

## 二十六、第二十四层：`Group` 组装体

位于：

- [jigex-prog.js:L2180-L2200](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2180-L2200)

`Group` 是逻辑层的拼块集合，不是单独渲染对象。

### 主要作用

- 表示已连接的多块组合
- 维护 `members`
- 维护 `edgeCount`
- 维护 `isEdge`
- 保证整组移动、旋转、层级调整时同步一致

很多后续计算不是针对单块，而是针对当前块所属的 `group`。

---

## 二十七、第二十五层：切图算法 `knife`

位于：

- [jigex-prog.js:L2201-L2403](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2201-L2403)

这是整份代码最复杂、最有技术含量的区域。

### 1. 边缘曲线模板

`traditionalKnife` 预定义多组 tab / hole 曲线：

- `sock`
- `finger`
- `ball`
- `stub`

### 2. `buildMask()`

它负责：

- 给每块建立边信息
- 决定 border / tab / hole
- 计算边厚与曲线高度
- 用 canvas path 绘制每块轮廓
- 使用 `getImageData()` 做阴影、bevel 和连接边信息计算

### 3. `cutChoices()`

位于：

- [jigex-prog.js:L2352-L2361](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2352-L2361)

根据题图尺寸和最小块数自动推导可选切块方案。

### 4. `cut()`

位于：

- [jigex-prog.js:L2361-L2403](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2361-L2403)

负责：

- 创建 piece spec
- 生成 mask 和 mask2
- 绑定 shader
- 实例化所有 `Piece`
- 建立上下左右和对角邻居关系
- 初始散布 pieces

---

## 二十八、第二十六层：Piece Shader

位于：

- [jigex-prog.js:L2371-L2389](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2371-L2389)

这里动态生成 fragment shader，用于将：

- 原图纹理
- mask
- mask2
- 旋转方向
- 连接状态
- 选中状态

合成为最终拼块视觉。

最终表现包括：

- 高光
- 阴影
- bevel
- 已连接边缘的不同视觉处理

所以拼图块视觉效果不是简单 PNG 裁剪，而是图像 + mask + shader 的实时合成结果。

---

## 二十九、第二十七层：散块布局 `scatter`

位于：

- [jigex-prog.js:L1942-L1980](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1942-L1980)

散块布局不是纯随机，而是综合考虑：

- 屏幕大小
- 中间工作区
- 盒图是否显示
- 当前是否边缘模式
- 哪些块已经移动过
- compact mode

这样做的目的，是让初始布局更易于操作、更接近真实拼图游戏体验。

---

## 三十、第二十八层：计时系统 `clock`

位于：

- [jigex-prog.js:L2403-L2418](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2403-L2418)

单机模式下提供：

- `start`
- `pause`
- `resume`
- `stop`
- `getElapsedSecs`

联机模式下则显示多人房间时间。

点击时钟按钮还能显示当前完成度、玩家列表和联机链接。

---

## 三十一、第二十九层：存档结构 `puzzleRecord`

位于：

- [jigex-prog.js:L2419-L2452](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2419-L2452)

存档内容包括：

- puzzle id / name
- credits
- 创建与修改时间
- 当前主题
- 块数
- 是否可旋转
- 是否完成
- 用时
- 是否边缘模式
- 盒图位置
- 切图形状信息
- 所有 piece 的位置、角度、移动状态、group
- checksum

保存不是立即写盘，而是做延迟批量更新，以降低频繁存储开销。

---

## 三十二、第三十层：存档管理 `recordsManager`

位于：

- [jigex-prog.js:L2452-L2467](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2452-L2467)

职责：

- 扫描 `localStorage`
- 过滤损坏记录
- 同一 puzzle 保留最新记录
- 删除已完成记录
- 最多保留 10 条
- 提供：
  - `youngest()`
  - `find()`
  - `store()`
  - `delete()`

它相当于应用自己的小型本地持久化索引层。

---

## 三十三、第三十一层：Credits 与完成动画

### 1. `Credits`

位于：

- [jigex-prog.js:L2467-L2496](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2467-L2496)

负责组织：

- 图片说明
- 摄影师信息
- 来源链接
- 授权信息

### 2. `applause`

位于：

- [jigex-prog.js:L2497-L2517](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2497-L2517)

负责：

- 拼图完成后的掌声动画
- 音效播放
- 用户点击或按键提前收起

### 3. `onComplete()`

位于：

- [jigex-prog.js:L1925-L1933](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1925-L1933)

拼图完成时会：

- 停止计时
- 标记完成
- 更新 record
- 上报完成统计
- 触发 applause

---

## 三十四、第三十二层：联机恢复与远端动作回放

位于：

- [jigex-prog.js:L2529-L2595](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2529-L2595)

### 1. `restoreGame()`

将联机房间属性恢复到本地：

- piece 位置
- 角度
- group 状态
- 旋转开关
- 边缘模式

### 2. 远端动作解释器

主要由以下函数组成：

- `pi()`
- `ei()`
- `di()`
- `hi()`

它们负责把 Photon 房间属性和事件翻译成：

- 远端选择 piece
- 远端旋转
- 远端移动
- 远端 join group
- 远端 release capture

这一层逻辑复杂的原因，是要在“状态一致”和“动画自然”之间做平衡。

---

## 三十五、第三十三层：真正启动逻辑 `onProgramStart`

位于：

- [jigex-prog.js:L2595-L2652](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2595-L2652)

这里把页面控制真正和游戏连接起来：

- 修改块数
- 开始游戏
- 旋转开关
- 本地图片导入
- 主题切换
- 联机加入
- 外部消息监听

最后有两条主启动路径：

1. 如果 URL 带 `gameId`：
   - 先加入联机房间
   - 等房间信息回来后创建 `Puzzle`
2. 否则：
   - 直接 `new _.Puzzle(n)`

所以这里就是整套程序的最终 `main()`。

---

## 三十六、整条主链路

### 1. 单机链路

1. 页面加载
2. 建立模块系统
3. 初始化 UI、渲染器、音频
4. 创建 `Puzzle`
5. 加载 profile 或图片
6. `Subject` 就绪
7. 生成块数候选
8. 用户点击开始
9. `knife.cut()`
10. 生成 `Piece`
11. `scatter()`
12. 进入 `ready / playing`

### 2. 本地交互链路

1. 浏览器事件
2. `Controller.handleEvent`
3. `Puzzle.handleEvent`
4. `Piece.handleEvent`
5. `move / rotate / drop`
6. `join`
7. `updateRecord`
8. `ClipGL` 下一帧渲染

### 3. 联机链路

1. 本地拖拽/旋转
2. `multiplayer.sendUpdate / sendEvent`
3. Photon 广播
4. 远端 `onAction`
5. `pi() / ei()` 解释并回放本地动作

### 4. 存档链路

1. `Puzzle.updateRecord()`
2. `puzzleRecord.save()`
3. `recordsManager.store()`
4. 写入 `localStorage`

---

## 三十七、重点模块速记

如果只保留最关键的结论，可以概括为五层：

### 1. 初始化与加载层
- 参数解析
- 错误监控
- 模块系统

### 2. 基础设施层
- `openConsole`
- `Variant`
- `StateCell`
- `utils`

### 3. 表现层
- `ClipGL`
- `theme`
- `Sonic`
- `niftybar`
- `ui`

### 4. 核心玩法层
- `Puzzle`
- `Piece`
- `Group`
- `knife`
- `scatter`

### 5. 运行支撑层
- `clock`
- `puzzleRecord`
- `recordsManager`
- `multiplayer`
- `restoreGame`

---

## 三十八、一句话总结

`jigex-prog.js` 的本质，是使用自建状态系统、自建 UI 框架和 WebGL 渲染器，把“题图加载 -> 切图生成不规则拼块 -> 拖拽/旋转/吸附 -> 分组拼接 -> 存档恢复 -> 多人同步”这一整套网页拼图产品能力，打包成一个单文件主程序。

---

## 三十九、推荐继续精读的代码段

- 启动与模块装载：[jigex-prog.js:L49-L157](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L49-L157)
- 图形引擎 `ClipGL`：[jigex-prog.js:L676-L1050](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L676-L1050)
- 多人协作 `multiplayer`：[jigex-prog.js:L1110-L1206](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1110-L1206)
- UI 总控：[jigex-prog.js:L1239-L1477](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1239-L1477)
- `Puzzle` 主流程：[jigex-prog.js:L1718-L1985](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L1718-L1985)
- `Piece` 交互与拼接：[jigex-prog.js:L2004-L2200](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2004-L2200)
- 切图与 shader：[jigex-prog.js:L2201-L2403](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2201-L2403)
- 存档与联机恢复：[jigex-prog.js:L2419-L2652](file:///d:/code/jigsaw_world_layout/jigex-prog.js#L2419-L2652)
