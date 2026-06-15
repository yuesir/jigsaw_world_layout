# 从 0 到 1 开发一款拼图引擎 · 核心逻辑拆解与构建指南

> 分析对象：`jigex-prog.js`（JigsawExplorer 主程序，约 2652 行）
> 目标：拆解一款工业级网页拼图游戏的核心逻辑，整理一套可复用的「从 0 到 1 开发拼图引擎」要点与具体实现细节。
> 适用读者：想自己实现拼图玩法（切图、吸附、拼合、渲染、保存）的工程师。

---

## 〇、一句话结论

一套拼图引擎 = **图片切片（knife）+ 凸凹边掩码（mask）+ GPU 批量渲染（Clip）+ 拾取/拖拽/旋转交互（Piece）+ 邻接吸附与拼组（snap/Group）+ 状态机与存档（Puzzle/Record）**。这六块缺一不可，但只要把它们理清，拼图引擎并不神秘。

---

## 一、整体架构分层

源码采用「多段 IIFE 自执行模块 + 自建模块注册器 + 主命名空间」结构。模块按依赖顺序自动初始化。可划分为 6 层：

| 层 | 模块 | 职责 | 关键源码位置 |
|---|---|---|---|
| L0 基础设施 | 兼容 polyfill、`openConsole` 日志、`errMonitor` 错误监控 | 老浏览器兜底、日志记录、错误上报 | L2–L212 |
| L1 响应式原语 | `Sym`（带序数的枚举）、`Variant`（响应式变量）、`StateCell`（显式状态机） | 状态管理、监听器通知、日志 | L213–L335 |
| L2 工具 | `utils`（双向链表、随机数、WebReq、定时器、本地存储）、`niftybar`（工具栏/面板/按钮 UI） | 数据结构与 IO | L568–L567 |
| L3 渲染内核 | `ClipGL`：WebGL 上下文、着色器、纹理池、`Clip`、`Tweener2`、`projector`（RAF 主循环） | 把「图片片段」画到屏幕 | L676–L1050 |
| L4 体验层 | `theme`（12 主题）、`Sonic`（音频）、`photon`/`multiplayer`（联机）、`snapIndicator`、`ui` | 视觉听觉与多人 | L1051–L1476 |
| L5 拼图核心 | `player` 模块内的 `Subject`/`knife`/`Piece`/`Group`/`Puzzle`/`clock`/`puzzleRecord`/`recordsManager` | **真正的拼图玩法** | L1477–L2652 |

> ⚠️ L0–L4 是「应用壳」，L5 才是「拼图引擎本体」。如果只做引擎，L5 + L3 是必做，其余可裁剪。

### 模块初始化机制（值得借鉴）

```text
addModInit(name, initFn)  →  注册到模块表 s
update()                  →  轮询：若某模块 init.dependenciesReady() 返回 true，就调用 init()
                            每初始化完一个，重新轮询，直到全部完成
onInitComplete(fn)        →  收集到 R 队列，全部模块就绪后依次执行
onProgramStart            →  最终入口（创建第一个 Puzzle）
```

这是一种**无显式 import 的依赖图**：每个模块声明 `dependenciesReady()`，注册器拓扑排序式地推进。自研框架里很实用（不依赖打包器的模块分析）。

---

## 二、核心数据模型

先建立这张「对象关系图」，后面所有逻辑都围绕它展开：

```
Puzzle（一局拼图）
├─ subject: Subject        源图（缩放后的 Image → Texture）
├─ pieces: PieceList       所有拼块的双向链表（按 z 序）
├─ specList: PieceSpec[]   每块的「规格」（几何/掩码信息），切图阶段产出
├─ knife                   切图器（cut / cutChoices / style.buildMask）
├─ shapeIndex, tabIndexRight, tabIndexBottom   决定凸凹分布的随机种子
├─ seed / aseed            拼块布局随机种子 / 旋转角度随机种子
├─ snapDistance            吸附阈值（随平均块尺寸自适应）
├─ rotatable, isComplete   玩法开关与完成标志
├─ record: puzzleRecord    存档（可序列化到 localStorage）
└─ clock / multiplayer     计时 / 联机

Piece（一块拼图，继承自 Clip）
├─ id                      从 1 开始的整数（= 在 specList 中的下标+1）
├─ spec                    指向切图规格（core 宽高、image.bounds、edges）
├─ group: Group | null     所属拼组（null = 散块）
├─ neighbors[4]            上下左右相邻块（正交邻接，用于吸附判定）
├─ caterNeighbors[4]       对角相邻块（用于拼组传播）
├─ state: Variant(PC)      个体状态机：resting/selected/moving/touched/captured/remote-*
├─ hasMoved: Variant(bool) 是否被挪过（驱动 homePos 检测）
└─ position/angle/opacity  继承自 Clip 的可补间属性

Group（拼组：若干已拼合的块）
├─ members: Piece[]        成员
├─ id                      = 第一个成员的 id（作为「代表块」refPiece）
├─ edgeCount               组内边块数量（判断「外框是否完成」）
├─ isEdge                  是否纯边块组
└─ pivotPiece              旋转时的旋转中心块
```

**关键设计点**：
- `Piece` 既是**逻辑实体**又是**渲染实体**（继承 `Clip`），不搞「逻辑/显示」分离——减少同步成本。
- `id` 即下标，`neighbors` 直接存引用，`O(1)` 查邻居，吸附判定不用搜全图。
- `Group` 用「代表块」模式：组的位置 = refPiece 的位置，其他成员靠 `Piece.gap`（相对偏移）推导。

---

## 三、六块核心逻辑详解

### 3.1 图片准备（Subject）

`_.Subject` 负责把任意源图缩放到「适合当前画布」的尺寸。

**要点**：
1. 目标面积比：让源图像素面积占画布的 **~35%**（`i/o < .35` 上限、`.35` 下限），既不太小（块太少）也不撑满（没地方散块）。
2. 单边上限：宽高都不超过画布的 **90%**（`Me = .9`）。
3. 留边距：canvas 画布比实际图像大 `margin = 7px * 2`（给凸耳留空间，见 3.3）。
4. 输出一个内部 canvas（`drawImage` 重绘缩放图），挂到一张 WebGL `Texture` 上。

```
rescale():  while 面积比过大 → scale -= 0.01；过小 → scale += 0.01
            image.width = round(srcW*scale) + 14 + 1   // +margin*2 +1
            ctx.drawImage(src, 7, 7, w, h)
            texture = Texture.getTexture(image)
```

> **细节**：缩放是「面积驱动」而非「边长驱动」，保证不同长宽比的图都能有合理的拼块数量空间。

---

### 3.2 切图：`knife.cut()` —— 把网格规格生成出来

这是拼图引擎的**算法心脏**。注意：它不真的「切」图片像素，而是**生成每块的几何规格 + 掩码**，真正的「切」在 GPU 用 mask 完成。

#### 3.2.1 决定网格

```js
cutChoices(subject, minNop, defNop):
  // 从「块边长约 = min(srcW, srcH)/3」起步，逐步缩小边长，生成多档选择
  size = floor(min(w,h)/3)
  while size > 10:
    rows = floor(h/size); cols = floor(w/size); nop = rows*cols
    if nop >= 6 && nop >= minNop: 记录一档 {nop, rows, cols, size}
    size = max(floor(h/(rows+1)), floor(w/(cols+1)))  // 收敛
```

> **要点**：块是**正方形**（`core.width ≈ core.height ≈ size`），但通过对余数 `width % cols` 均摊，让边缘列/行略宽，避免最后一列变成窄条。

#### 3.2.2 生成每块规格

```js
cut(subject, nop):
  f = nop.size;  remainderX = subject.width % cols;  ...
  for each (row, col):
    w = f + 均摊余数      // core 宽
    spec = { id, core:{width:w, height:h}, image:{bounds:{margin:7}},
             shadowDepth, bevelDepth, edges:{top,left,right,bottom:{}},
             sortOrder: random() }   // sortOrder 决定散开顺序
  style.buildMask(specs, rows, cols)  // 给每条边赋「凸/凹 + 曲线」
```

#### 3.2.3 凸凹分布：保证「相邻互补」

这是拼图能拼上的根本。每条边要么是 **tab（凸）** 要么是 **hole（凹）**，且相邻两块的共享边必须**一凸一凹**。

源码用一个**预定义的真值表 `_e`**（39 个布尔值）+ 两个游标 `tabIndexRight` / `tabIndexBottom`：

```js
_e = [false,false,true,false,true,true,false,true,true,false,true,false,true,true,false,true,true,false,true,false,true,true,false,true,true,false,true,false,true,true]
//  ↑ 右边界列用 tabIndexRight 游标遍历 _e，决定「该块右边凸还是凹」
//  ↑ 下边界行用 tabIndexBottom 游标遍历 _e，决定「该块下边凸还是凹」
```

- 对**最顶行/最左列**的块，其 top/left 是**直边**（`border=true`，没有凸凹）。
- 对**内部块**，共享边继承自邻居：
  ```
  piece[r][c].left.tab  = !piece[r][c-1].right.tab    // 左邻居的右边的取反
  piece[r][c].top.tab   = !piece[r-1][c].bottom.tab   // 上邻居的下边的取反
  ```
- 只对**右边和下边**「掷骰子」（查 `_e` 表），左边和上边被动继承——这样天然保证整张图互补、无矛盾。
- `tabIndexRight/Bottom` 是**种子化**的随机起点，于是同一张图、同一组种子 → 同一套凸凹布局（联机/存档复现的关键）。

#### 3.2.4 曲线形状：4 种 tab 样式

`traditionalKnife` 定义了 4 种凸耳曲线（`Nn`=sock袜状、`Rn`=finger指状、`Dn`=ball球状、`Gn`=stub短桩），每种用 **12 个控制点** 描述：

```
每点 = { fromBase, alongBase }   // fromBase=垂直边线的偏移(正=凸出)，alongBase=沿边线的进度(0..1)
还有 ptsReversed = 凹耳的镜像点集
```

- `Ee` 表（39 项）决定每条边用哪种曲线 + 是否翻转（`bend`）：`case 0..5` 分别选 `Dn/Rn/Gn` + `bend` 真假，`default` 用 `Nn`。
- `shapeIndex` 是游标起点，种子化 → 可复现。

> **要点**：用 12 点二次贝塞尔（`quadraticCurveTo`）拟合凸耳轮廓，而不是 100 个采样点——既省存储又保证平滑。控制点是**归一化**（相对边长）的，所以任意块尺寸都能复用同一条曲线。

#### 3.2.5 `buildMask`：画掩码 + 烘焙阴影/斜面

这是把「规格」变成「可渲染掩码」的烘焙步骤，在一张离屏 canvas 上完成：

1. **画轮廓**：对每块，按 `edges.top→right→bottom→left` 顺序，用 `quadraticCurveTo` 连点画封闭路径，`fill` 成红色（`Le`）。
2. **测量凸耳高度**：因为凸耳会超出 core 矩形，需要知道每条边的凸耳「厚度」`thickness`，以便：
   - 计算块的完整外接矩形 `width/height`（含 margin）。
   - 计算相邻块的重叠区（凸耳压到邻居 core 上）。
   - 源码用 `getImageData` 扫描像素来量出 `tabHeights`/`holeHeights`（一次性预计算并缓存到曲线对象上）。
3. **拼接成大图**：所有块的轮廓画到**同一张离屏 canvas**上（按网格排列），得到两张全图掩码 `Y`（mask）和 `H`（mask2）。
4. **烘焙光照**：逐像素扫描，根据每块的 `slope`（对角线）判断当前像素属于哪条边的凸耳，写入：
   - `mask.r` = alpha（是否属于该块）
   - `mask.g` = edge 标志（用于「已连接边变暗」效果）
   - `mask.b` / `mask2.rgb` = 4 个方向的阴影值（亮/暗），用于旋转后重新选向。
   - `shadowDepth`/`bevelDepth` 随块尺寸分档（size<30 用浅档，size≥100 用深档），让大块有更明显的立体感。

> **这是整个引擎最「黑科技」的部分**：它把「凸耳形状 + 立体阴影 + 连接边高亮」全部预烘焙进一张掩码纹理，GPU 只需采样即可，运行时零计算。

---

### 3.3 渲染：ClipGL —— GPU 批量画片

#### 3.3.1 顶点布局（极其紧凑）

每个 Clip（拼块）= **2 个三角形（6 个顶点）× 15 个 float**：

```
| pos(2) | texCoord0(2) | texCoord1(2) | scale(2) | trans(2) | rot(2) | state(1) | color(1) | opacity(1) | tex0(2) | tex1(2) |
```

实际上 stride = 15 floats = 60 bytes。所有变换（缩放/平移/旋转）在**顶点着色器**里做，CPU 只更新变化的属性。

#### 3.3.2 双 VBO ping-pong（避免渲染卡顿）

```js
vertMngr 维护两个 VBO（F、H），当前帧用一个画、另一个写入
commit() 时：track 修改范围（numClips/modifiedAt），用 bufferSubData 局部更新
```

> **要点**：渲染和 CPU 写入不会争用同一块显存，这是流畅拖拽上千块的关键。

#### 3.3.3 着色器（决定拼块的最终长相）

顶点着色器做 2D 仿射变换（含 aspect 修正）。片段着色器是核心，分 6 档（`case 2..6`）：

```glsl
// 简化版核心逻辑：
alpha   = mask.r;                      // 该像素是否属于本块
rawShad = (按旋转角从 mask2 选 rgb 分量); // 4 向阴影
sel     = mod(state, 256) > 0;         // 是否选中（高亮）
conn    = (state 的高 8 位) & edge;     // 该边是否已连接（变暗）
shad    = sel ? rawShad : 减一点;       // 选中的块更亮
gl_FragColor.rgb = image.rgb + shad;    // 叠加阴影
gl_FragColor.a   = alpha * opacity;
```

- `state` 是个 **packed uint**：低 8 位 = 选中标志，bit8-15 = 8 个方向的连接标志（用位掩码 `de/he/pe/ge/me/fe/ve/ye` 标记 4 正交 + 4 对角邻接是否已拼合）。
- 连接后的边会**变暗**，营造「拼合缝」效果——完全在 shader 里完成。

#### 3.3.4 纹理池

`Texture` 用引用计数 + 懒释放，上限 32 张。`getTexture(image)` 按 `image.src` 去重，避免重复上传。`context lost` 时 `resetAll()` 重新上传。

#### 3.3.5 主循环 projector

```js
requestAnimationFrame(loop):
  1. updateTweeners(now)      // 推进所有补间（位置/角度/透明度）
  2. updateAnimators(now)     // 推进精灵帧动画
  3. if 顶点有修改: Clip.drawAll()  // 重画
  4. createTask.processAll()  // 定时任务
```

`tweeningInProgress` 是个**全局 Variant 门控**：没有补间时完全停画，省电。

#### 3.3.6 补间系统 Tweener2

5 态状态机：`not_queued → pending → active → completed`（+ `delayed`）。
- 支持 6 种 easing（NONE/IN/IN_SLOW/OUT/OUT_SLOW/IN_OUT）。
- `extend()`：新补间「接龙」到正在进行的补间尾部（连续拖动不卡顿）。
- `throttle`：防止短时间内堆积过多补间。
- `onStep`：旋转用它在每帧重算成员块绕中心的位置（见 3.5）。

---

### 3.4 交互：拖拽、旋转、捕获

#### 3.4.1 输入控制器 Controller

三种控制器（mouse / touch / pointer），统一 `handleEvent`。核心是 **captor 捕获机制**：

```
piece 在 mousedown 时 controller.capture(piece)
→ 之后所有 move/up 事件直接发给 piece，不走路由
→ mouseup 时 controller.release()
```

这避免了「拖动中指针飞出拼块」的拾取丢失问题。

**坐标换算**：`(clientX - canvasRect.left) * devicePixelRatio` → 画布像素坐标。所有拼块位置都在画布像素空间。

#### 3.4.2 Piece 状态机（PC）

```
resting → (按下) → selected → (移动超阈值 5px/250ms) → moving → (松开) → drop/join
                ↓ (触屏)
              touched → (再按/移动) → moving
```

- `selected`：刚按下、还没动；松开 = 单击。
- `moving`：正在拖。
- `touched`：触屏特有，按住后松开手指但块仍跟随（等「放哪」）。
- `captured`：捕获模式（`capState`）下被收进 capturedList。
- `remote-select` / `remote-control`：联机时别的玩家正在操作。

#### 3.4.3 拖动 move()

```js
move(x, y, opts):
  dx = x - position.x; dy = y - position.y
  applyTask(p => { p.position.moveBy(dx,dy); p.hasMoved = true })  // 对整组生效
  // 边界裁剪：不能拖出画布（左侧留 Ge 像素给 home 锚）
```

`applyTask` 是**组操作核心**：对 `group.members` 逐个执行同一函数，支持完成回调聚合。一块动 = 整组动。

#### 3.4.4 旋转 rotate()

```js
rotate(event):
  clockwise = (deltaY>0 或 右键)
  对组内每块:
    newAngle = angle ± 90
    tweener = Tweener2('angle', newAngle, 200ms)
    tweener.onStep = An   // 每帧重算成员绕 pivot 的位置
    if 有 pivot: gap.measure → angleDelta = atan2(-gap.y, gap.x); radius = |gap|
```

旋转用 `pivotPiece`（组的代表块）作圆心，其他成员绕它转，`onStep` 每帧用极坐标重算位置——视觉上是「整组刚体旋转」。角度永远规范化到 0/90/180/270（`sn()` 函数）。

> **细节**：触屏「点击块旋转」= `touchend` 时若位移 < 2×阈值且没拖动，触发 rotate。单击 vs 拖动靠位移阈值区分。

---

### 3.5 吸附与拼合：snap + Group

#### 3.5.1 吸附判定 `neighborWithinSnapRange`

```js
对每个邻居 n:
  if angle 相同 && 透明 && 在 2×块尺寸内:
    gap = Piece.gap.measure(this, n)   // 理论相对偏移
    实际偏移 = position 差
    if |gap.x - 实际dx| <= snapDistance && |gap.y - 实际dy| <= snapDistance:
      return n   // 可吸附
```

- **`Piece.gap`**：计算「两块拼合时的理论坐标差」。用每块 spec 里的 `image.bounds.centerX/Y`（块的中心点在源图中的坐标），按角度旋转后相减。这是「两块本该在哪」的几何依据。
- `snapDistance` 自适应：默认 `6 * dpr`，但限制在 `[5%×平均块宽, 50%×平均块宽]`——块越大容错越大。

#### 3.5.2 拼合 join()

```js
join(neighbor):
  if 两块都有 group: group.join(this, neighbor)   // 组合并
  else if 一方有组: 把另一方加进去
  else: new Group(this, neighbor)
  // 合并后：moveToFit 对齐、记录邻居连接位（state 的连接标志）、播放 snap 音效
```

`Group.join` 把两个组的 members 数组合并，累加 edgeCount。`moveToFit` 用 `gap` 精确对齐消除误差——**这是拼图「咔哒」对齐感的来源**。

#### 3.5.3 连接传播 `Piece.checkConn`

用位掩码（8 位，4 正交 + 4 对角）记录「块 A 的哪个方向已和块 B 连」。拼合后遍历组的所有成员，把相邻关系全量标记——用于 shader 渲染连接边变暗。

#### 3.5.4 散开 scatter()

把所有散块铺到画布边缘（围绕 subject 留出的空白区）：

- 螺旋铺放：从右上角开始，按 `j` 状态机（3→1→2→0 四向）逐格摆放，遇冲突则让位。
- `getScatterSequence`：按 `sortOrder` 排序后「错位取」，让相邻块不挨着放（增加难度感）。
- `compactMode`：紧凑摆放（仅用 3% 块尺寸抖动）。
- 边框优先：边块先铺一圈。

> **细节**：散开时跳过 `boxTop`（图例预览）占用的区域，避免压住参考图。

#### 3.5.5 边框完成检测

```js
get isEdgeComplete:
  统计：有多少块的上下左右都没邻居（角块 _t++）、有多少只缺一边（Pt++）
  numEdges = 2*Pt + 2*_t - 4   // 外框总边块数
  是否完成 = 存在一个 group，其 edgeCount === numEdges
```

完成后工具栏「只显示边块」按钮语义切换为「重新散开」。

---

### 3.6 状态机与存档

#### 3.6.1 Puzzle 状态机（PS）

```
dead → init_prepping → prepping → waiting → ready → playing
                                  (用户选块数/主题)        (首次移动)
```

- `prepping`：`knife.cut` 切图、生成 Piece、scatter。
- `waiting`：显示开始对话框。
- `ready`：可交互。
- `playing`：计时开始。

#### 3.6.2 存档 puzzleRecord

序列化结构（存 localStorage，key 前缀 `jigex-rec-`）：

```json
{
  "info": "Jigsaw Explorer - Saved Jigsaw Puzzle File",
  "ver": 8,
  "pid": "图ID", "seed": 切图种子, "aseed": 角度种子,
  "shp": { "rw":行, "cl":列, "ri":右游标, "bi":下游标, "si":形状 },
  "thm": 主题序数, "rot": 可旋转, "edo": 只显边块, "tmr": 用时秒,
  "pcs": [ { "id":1, "x":0.5, "y":0.5, "a":0, "m":1, "g":0 }, ... ]  // 归一化坐标
}
```

- **坐标归一化**（`normX = x / canvas.width`）：让存档与屏幕尺寸解耦，换设备能恢复。
- `g` = 所属组的代表块 id（0 = 散块）。
- **校验和**：用块数、未移动块数、用时算一个数，防篡改/检测损坏。
- **防抖保存**：`update` 用 500ms 定时器合并频繁的移动事件。
- **最多 10 条**记录（LRU 淘汰最旧的）。

#### 3.6.3 恢复流程

```
加载 record → 用 seed/aseed/shp 重建一模一样的切图 → 遍历 pcs：
  对每个 tuple: piece.angle = a; piece.hasMoved = m; 
  if g: 收集到组（同 g 的块一起 moveToFit + new Group）
  else: position.assignNorm(x, y)
最后 auditPieces() 修正误差
```

> **关键**：因为切图是**种子驱动**的确定性过程，所以存档只需存「每块在哪、转了多少、组和谁」——极小体积（一个 500 块拼图存档 < 20KB）。

---

## 四、从 0 到 1 的开发路线图

把上面的分析倒着推，得到一条「最小可用 → 工业级」的递进路径：

### 阶段 0：脚手架与数学底座（1–2 天）

- [ ] 选型：Canvas2D 起步（验证玩法）→ WebGL2 提速（量产）。**建议第一版用 Canvas2D**，逻辑跑通再换渲染。
- [ ] 实现工具：`Vec2`、`AABB`、`Random`（Mulberry32，种子化）、`List`（双向链表，用于 z 序）。
- [ ] 响应式原语（可选）：`Variant`（带监听器的变量）—— 让状态变更可订阅，大幅简化 UI 同步。

### 阶段 1：静态切图（2–3 天）—— 能看到拼块

- [ ] **网格生成**：给定图 + 行列数，输出 `PieceSpec[]`（每块的 core 宽高、在源图的位置）。
- [ ] **凸凹分配**：实现「左/上继承、右/下掷骰」+ 种子化真值表，保证互补。
- [ ] **曲线定义**：先做 1 种凸耳（12 点贝塞尔），跑通后再加样式。
- [ ] **掩码烘焙**：离屏 canvas 画轮廓 → `getImageData` 量厚度 → 拼大图。
- [ ] **渲染**：Canvas2D 版 = 用 `clip()` 裁路径 + `drawImage`；WebGL 版 = mask 纹理 + 片段着色器。
- [ ] **验收**：屏幕上出现一堆形状各异、带凸耳的拼块，静置。

### 阶段 2：拖拽 + 吸附（2–3 天）—— 能拼了

- [ ] **拾取**：`getClipAt(x, y)` —— 倒序遍历 z 序，命中测试（用 mask 的 alpha 像素做精确命中，凸耳也能点中）。
- [ ] **Controller**：mouse/touch/pointer 三合一，captor 捕获机制。
- [ ] **Piece 状态机**：resting/selected/moving。
- [ ] **`Piece.gap`**：计算两块的理论相对偏移（核心几何）。
- [ ] **吸附判定**：遍历 `neighbors`，比对 gap 与实际偏移，在 snapDistance 内即吸附。
- [ ] **Group**：拼合后建组，`applyTask` 实现组操作。
- [ ] **moveToFit**：消除吸附误差（对齐到理论位置）。
- [ ] **验收**：能拖动拼块、靠近邻居时「咔哒」对齐、两块成组后一起动。

### 阶段 3：完整玩法（2–3 天）—— 能玩通关

- [ ] **scatter**：散开算法（螺旋铺放 + 错位排序）。
- [ ] **旋转**：`rotateTo` + pivot 绕转（可选，先做 0/90 两档）。
- [ ] **完成检测**：`group.length === pieces.length` → 触发完成动画。
- [ ] **计时 clock**。
- [ ] **边框检测**：`isEdgeComplete` + 「只显边块」辅助。
- [ ] **验收**：完整的「散开 → 拼合 → 通关」闭环。

### 阶段 4：体验打磨（3–5 天）—— 好玩

- [ ] **补间动画**：Tweener2 + 6 种 easing，拖拽/吸附/旋转丝滑。
- [ ] **阴影/斜面**：shader 里叠加，立体感。
- [ ] **连接边高亮**：state 位掩码 + shader。
- [ ] **音频**：snap 声、完成掌声（WebAudio 解码 mp3，注意移动端需用户手势解锁）。
- [ ] **boxTop 预览**：可拖动的参考图（带「凹陷」阴影效果）。
- [ ] **主题**：背景色/工具栏配色切换。
- [ ] **context lost 恢复**：`webglcontextlost` / `restored` 事件，重建纹理和着色器。

### 阶段 5：持久化与联机（可选，3–7 天）

- [ ] **存档**：种子化切图 + 归一化坐标序列化 → localStorage。
- [ ] **校验和**：防损坏。
- [ ] **联机**：用 Photon/自建 WebSocket，同步「每块的归一化坐标 + 角度 + 组 id」，用属性同步（`changeProperties`）而非高频事件。

---

## 五、关键实现细节清单（避坑指南）

| # | 细节 | 为什么要这么做 |
|---|---|---|
| 1 | 凸凹用「左/上继承、右/下掷骰」 | 天然互补，不会出现两凸或两凹顶死 |
| 2 | 曲线控制点归一化（相对边长） | 任意块尺寸复用同一曲线，省存储 |
| 3 | 凸耳厚度用 `getImageData` 预量 | 凸耳超出 core 矩形，必须知道精确外接框才能正确布局/命中 |
| 4 | 拼块 canvas 比 core 大 `margin*2`（14px） | 给凸耳留空间，避免画到隔壁块的区域 |
| 5 | mask 烘焙成一张大图纹理 | 一次上传、GPU 采样，远比每块单独画快 |
| 6 | 阴影分 6 档随块尺寸调整 | 小块用浅阴影（否则糊成一团），大块用深阴影（立体感） |
| 7 | state 用 packed uint 存连接标志 | 一个顶点属性同时表达「选中 + 8 向连接」，省带宽 |
| 8 | 双 VBO ping-pong | 渲染和写入不争显存，避免 stalls |
| 9 | 坐标按 `devicePixelRatio` 放大 | 高 DPI 屏不糊 |
| 10 | 位置用「画布像素坐标」，存档用「归一化坐标」 | 运行时精度高，存档跨设备 |
| 11 | `Piece.gap` 用每块的中心点算理论偏移 | 与块的具体形状无关，只依赖网格位置 |
| 12 | `snapDistance` 自适应（5%–50% 块宽） | 块大容错大，块小不能太松否则乱吸 |
| 13 | captor 捕获机制 | 拖动中指针出块也不丢，体验丝滑 |
| 14 | 组旋转用 pivotPiece + onStep 极坐标 | 整组刚体旋转，成员保持相对位置 |
| 15 | 角度永远规范到 0/90/180/270 | 简化几何（gap/containsPoint 只处理 4 向） |
| 16 | scatter 螺旋铺放 + 相邻块错位 | 散开均匀且增加难度（相邻块不挨着） |
| 17 | 切图种子化（seed + shapeIndex + tabIndex） | 同图同种子 = 同布局，存档/联机能复现 |
| 18 | 完成检测用「最大组长度」而非「所有块归位」 | 允许小幅误差，对齐靠 moveToFit 保证 |
| 19 | 音频需用户首次手势解锁 | 移动端浏览器策略，否则 play() 被拒 |
| 20 | 存档防抖（500ms 合并） | 频繁移动不刷爆 localStorage |

---

## 六、最小可行架构（推荐第一版）

如果你只想快速跑通一个拼图，可以极简化：

```
JigsawEngine
├─ image: HTMLImageElement
├─ grid: { rows, cols, pieceSize }
├─ pieces: Piece[]                 // 不用链表，用数组+zIndex
├─ Piece
│   ├─ row, col
│   ├─ x, y (画布坐标)
│   ├─ edges: [top,right,bottom,left]  // 每边 'tab'/'hole'/'flat'
│   ├─ maskPath: Path2D            // Canvas2D 路径
│   ├─ groupId: number | null
│   └─ isPlaced: boolean
├─ knife.cut(image, rows, cols)
│   ├─ 分配凸凹（左/上继承）
│   ├─ 为每块生成 Path2D（用 12 点贝塞尔）
│   └─ 返回 Piece[]
├─ render(ctx)
│   └─ for piece: ctx.save(); ctx.clip(piece.maskPath); ctx.drawImage(image, ...); ctx.restore();
├─ onPointerDown/Move/Up
│   ├─ hitTest (倒序 + isPointInPath)
│   ├─ drag (整组移动)
│   └─ drop → snapTest → join
└─ checkComplete()
```

**关键简化**：
- 渲染用 Canvas2D `clip()` + `drawImage`，不写 shader（性能够用到 ~200 块）。
- mask 用 `Path2D` + `isPointInPath` 做命中，不用像素扫描。
- 不做旋转（固定 angle=0），几何简单一半。
- 不做联机/存档，先跑通单机。

跑通后再逐项替换成 WebGL、加旋转、加存档——**每个阶段都可独立验证**，这是这套源码最大的工程启示。

---

## 七、源码模块速查表

| 想看什么 | 去哪找（行号近似） |
|---|---|
| 启动/模块加载 | L2–L157 |
| 日志/错误监控 | L24–L48, L158–L212 |
| Variant/Sym/StateCell | L213–L335 |
| utils（List/Random/WebReq/Timer） | L568–L675 |
| ClipGL 渲染内核 | L676–L1050 |
| 顶点着色器 | L721 |
| 片段着色器（3 个默认 + pieceShader） | L950–L952, L2373–L2388 |
| VertexManager（VBO） | L712–L753 |
| Clip（渲染对象） | L758–L914 |
| Tweener2（补间） | L977–L995 |
| Texture（纹理池） | L841–L867 |
| player 模块入口 | L1477–L2652 |
| 拼块状态机定义（PC） | L1512 |
| 拼图状态机定义（PS） | L1512 |
| Subject（源图缩放） | L1685–L1696 |
| knife.cutChoices（网格选择） | L2352–L2360 |
| knife.cut（切图主流程） | L2361–L2402 |
| traditionalKnife（4 种曲线 + buildMask） | L2202–L2351 |
| 凸凹真值表 `_e` | L1512 |
| 曲线选择表 `Ee` | L1512 |
| Piece 构造 + 状态机 | L1985–L2017 |
| Piece.handleEvent（拖拽/旋转） | L2052–L2104 |
| Piece.gap（理论偏移） | L2105–L2109 |
| neighborWithinSnapRange（吸附） | L2116–L2122 |
| Piece.join（拼合） | L2125–L2136 |
| Group（拼组） | L2180–L2200 |
| scatter（散开） | L1946–L1979 |
| puzzleRecord（存档） | L2419–L2451 |
| multiplayer（联机） | L1110–L1206 |
| shader pieceShader（含连接边/阴影） | L2373–L2388 |

---

## 八、结语

这款引擎的精妙之处不在于某一段炫技代码，而在于**一系列「把运行时计算前移到预处理」的设计**：

- 凸凹布局 → 种子化的真值表（运行时 O(1) 查表）
- 凸耳形状 → 12 个归一化贝塞尔点（任意尺寸复用）
- 立体阴影/连接边 → 烘焙进 mask 纹理（GPU 零计算）
- 拼合判定 → 预存 neighbors 引用（O(1) 邻接查询）
- 存档体积 → 种子化切图（只存坐标，不存形状）

掌握了这套「预计算 + 查表 + GPU 采样」的思路，你不仅能做拼图，还能做任何「网格 + 形状 + 批量渲染」类的游戏（如消消乐、塔防地图编辑器）。祝你造出属于自己的引擎。
