# `scatter` 函数碎片布局方式关键要点分析

> 源文件：`jigex-prog.js`（Jigsaw Explorer 拼图引擎）  
> 函数定义位置：约第 1946 行 `_.Puzzle.prototype.scatter`

---

## 1. 函数触发条件与入口逻辑

`scatter` 函数接受一个参数对象 `e`（即 `options`），包含以下可选字段：

| 参数字段 | 说明 |
|---|---|
| `partial` | 是否只散布部分碎片（非全量重置） |
| `shift` | 是否强制所有碎片移动（无论是否已移动过） |
| `animate` | 是否以动画方式移动碎片 |
| `byCommand` | 是否由用户命令触发（触发紧凑模式切换检测） |
| `unmovedPiecesOnly` | 是否仅散布从未移动过的碎片 |

**触发路径（代码中出现的调用场景）：**
- 拼图初始化后首次散布（`new _.Puzzle(n)` 流程内部）
- 玩家点击"重新散布"按钮（`byCommand: true`）
- 拼图尺寸/状态变化后的重布局（如边框拼图完成后）
- 多人游戏同步状态后
- 从存档文件恢复时，若宽高比翻转则对未移动碎片重新散布

---

## 2. 两大执行分支：新游戏 vs 读档恢复

```
scatter(options)
  ├── 分支 A：新游戏 / partial 散布（无完整存档记录，或 partial=true，或多人游戏）
  │     └── 按螺旋环形路径计算位置，随机偏移后逐一放置碎片
  └── 分支 B：从存档记录恢复（有 this.record 且非 partial）
        └── 按存档中记录的坐标/角度/分组直接还原各碎片位置
```

---

## 3. 分支 A：新游戏散布的布局算法（核心）

### 3.1 单元尺寸计算

```js
var h = 2 * s[0].image.bounds.margin; // 碎片间距（边缘留白）
s.forEach(e => { p += e.width - h; g += e.height - h; });
p *= 1.05 / s.length; // 平均碎片宽度（含5%扩展）
g *= 1.05 / s.length; // 平均碎片高度（含5%扩展）
```

- `p`：单个碎片的**平均宽度单元**
- `g`：单个碎片的**平均高度单元**
- 在此基础上派生出边距系数：`l = p/4`, `c = g/4`, `u = p/8`, `d = g/8`

### 3.2 紧凑模式（Compact Mode）判断

```js
var y = o.compactMode || (_.boxTop.isShowing() && !o.showEdgesOnly() && o.percentComplete() <= 50);
```

**紧凑模式**在以下条件下激活：
- 用户手动切换了紧凑模式（连续双击间隔 <600ms）
- **碎片盒显示中** 且 **非仅显示边缘碎片** 且 **完成度 ≤ 50%**

紧凑模式下，碎片的随机偏移量减半（`Q = 0.03125` vs 正常的 `0.0625`），布局更加紧凑。

### 3.3 网格行列数计算

```js
var w = (n.width - b) / p;  // 横向可放碎片数（浮点）
var P = n.height / g;       // 纵向可放碎片数（浮点）
// 根据小数部分决定是否向上取整
var E = (w - Math.floor(w)) >= 0.5 ? 1 : 0;
var k = (P - Math.floor(P)) >= 0.5 ? 1 : 0;
// 调整后的单元格尺寸（均匀铺满画布）
var S = p * (w / (Math.floor(w) + E)); // 实际列宽
var C = g * (P / (Math.floor(P) + k)); // 实际行高
```

- `b`：左侧为碎片盒预留的偏移量（`Ge` 为碎片盒宽度）
- 通过四舍五入列/行数，确保碎片均匀铺满整个画布区域

### 3.4 边缘碎片优先模式下的额外边距

当满足以下条件时，在画布四周留出额外边距，将散布区域**向内缩进**：
```
!紧凑模式 && 碎片数量 >= 35 && (仅显示边缘碎片 || 边缘碎片已完成)
```

```js
I += Ge ? 0 : u;  // 起始X右移 p/8
L += d;           // 起始Y下移 g/8
O = n.width - u;  // 右边界缩进
M = n.height - d; // 下边界缩进
```

这样边缘碎片完成后，剩余碎片会散布在**稍小的中心区域**，避免碎片落在边缘影响拼边工作。

### 3.5 螺旋环形布局路径（核心算法）

碎片的放置顺序遵循一个**由外向内的螺旋矩形路径**，方向状态用变量 `j` 控制：

```
j=3: 向右（→）
j=1: 向下（↓）
j=2: 向左（←）
j=0: 向上（↑）
```

初始位置 `(I, L)` 为画布中的起点，每放一个碎片后，当前坐标沿当前方向移动一个单元格（`S` 或 `C`）。到达边界后转向，同时缩小可用范围（`N--` 或 `R--` 计数剩余可用行/列），形成由外向内的螺旋收缩布局。

**方向切换逻辑摘要：**

```
→ 超出右边界 → 转向↓，右边界缩进 S
↓ 超出下边界 → 转向←，下边界缩进 C
← 超出左边界 → 转向↑，左边界缩进 S
↑ 超出上边界 → 转向→，上边界缩进 C
```

### 3.6 碰撞检测与重试

每次尝试放置碎片时，会检查目标位置是否已被占用：

```js
var Y = (function() {
  // 1. 检查是否与碎片盒（boxTop）重叠
  if (_.boxTop.isShowing() && _.boxTop.containsPoint(I, L, padding)) return true;
  // 2. 检查是否与已固定/已移动的碎片组（B数组）重叠
  for (var o of B) {
    if (Math.abs(I - o.x) < halfWidthSum && Math.abs(L - o.y) < halfHeightSum) return true;
  }
  return false;
})();
```

- 若位置被占用（`Y = true`），该碎片**不放置**，但仍推进路径坐标到下一格
- 若位置空闲（`X = true`，含方向有效判断），执行放置并记录 `homePos`

### 3.7 随机偏移量

每个碎片放置时加上随机扰动，避免排列过于整齐：

```js
var J = Math.random() >= 0.5 ? 1 : -1; // X方向随机正负
var K = Math.random() >= 0.5 ? 1 : -1; // Y方向随机正负
var Q = y ? 0.03125 : 0.0625;           // 紧凑模式下偏移量减半
var Z = J * Math.random() * p * Q;      // X偏移（最大 p * Q）
var $ = K * Math.random() * g * Q;      // Y偏移（最大 g * Q）
// 放置位置：(I + Z, L + $)
```

- 正常模式：偏移最大约为碎片宽/高的 **6.25%**
- 紧凑模式：偏移最大约为 **3.125%**

### 3.8 碎片分组：哪些碎片参与散布

```js
// q = 所有符合状态的单独碎片
// H = q 中未曾被移动过的碎片（hasMoved === false）
// B = 已成组 或 已移动 的碎片（保持原位，参与碰撞检测）
// m = 实际参与本次散布的碎片列表
```

**m 的选取规则：**

```
if (shift || (q.length <= 10 && q.length !== H.length && 边缘完成))
  m = q  → 全部单独碎片都重新散布，并重置 hasMoved=false
else
  m = H  → 仅散布从未移动过的碎片
```

- 已成组的碎片（`group != null`）不参与散布，维持当前位置
- 已被玩家移动过的碎片（`hasMoved = true`）默认不重新散布（除非 `shift=true`）
- `unmovedPiecesOnly=true` 时，仅处理 `H` 中的碎片

### 3.9 散布顺序：getScatterSequence()

碎片按 `getScatterSequence()` 返回的顺序依次处理，该序列决定了哪块碎片先被放置到螺旋路径的外圈，哪些放在内圈，影响最终视觉分布效果。

---

## 4. 分支 B：从存档恢复的碎片布局

当存在完整存档（`this.record`）且非 `partial` 模式时：

```js
var ie = this.record.pcs; // 存档中的碎片列表
for (ce = ie.length - 1; ce >= 0; ce--) {
  ne = ie[ce];
  t = this.pieces.getPiece(ne.id);
  t.angle = ne.a;      // 还原旋转角度
  t.hasMoved = ne.m;   // 还原移动标记
  t.tuple = ne;
  // 若属于同一组（ne.g），累积到 oe 数组，最后调用 fn(oe) 建立 Group
  // 若宽高比翻转（le），对未移动碎片标记 re=true，后续触发 partial scatter
  t.position.assignNorm(ne.x, ne.y); // 按归一化坐标还原位置
  t.raise();
}
// 若存在翻转碎片，对未移动部分重新散布
if (re) o.scatter({ partial: true, unmovedPiecesOnly: true });
```

**宽高比翻转检测：**
```js
var ae = n.width / n.height;     // 当前画布宽高比
var se = this.record.asp;        // 存档时的宽高比
var le = (ae < 1 && se > 1) || (ae > 1 && se < 1); // 竖横比互换
```

若画布从横向变为纵向（或反之），存档中未移动的碎片将重新触发 `partial scatter`，以适应新的屏幕方向。

---

## 5. 辅助函数 fn（Group 建立逻辑）

```js
var fn = function(e) {
  // 从碎片数组中找出距离画布中心最近的碎片 o，移至数组首位
  for (var t, n, i, o = null, r = Infinity, a = e.length - 1; a >= 0; a--)
    (n = (t = e[a]).position.distanceFrom(M)) < r && (r = n, o = t, i = a);
  i && (e.splice(i, 1), e.unshift(o));
  o.position.assignNorm(o.tuple.x, o.tuple.y); // 以归一化坐标重置代表碎片位置
  new _.Group(e); // 建立碎片组
};
```

- 选取**距画布中心最近**的碎片作为组的代表碎片（`refPiece`）
- 以该碎片的归一化坐标作为组的锚点位置

---

## 6. homePos 的意义

```js
t.homePos = { x: I + Z, y: L + $ };
```

每个被散布的碎片会记录其 `homePos`（散布后的目标位置）。这个位置在后续的 **防误触保护逻辑**（`xn` 函数）中使用：

```js
// 若碎片仍在 homePos 附近（偏移小于核心宽/高的 1/3），视为"未真正移动"
!(i.homePos &&
  Math.abs(i.homePos.x - i.position.x) <= i.spec.core.width / 3 &&
  Math.abs(i.homePos.y - i.position.y) <= i.spec.core.height / 3)
```

即玩家轻微拖动碎片但未明显偏离散布位置时，不更新 `hasMoved` 状态。

---

## 7. 总结：布局流程图

```
scatter(options)
│
├─ byCommand? → 检测紧凑模式双击
│
├─ [有完整存档且非partial] → 按记录坐标/角度/分组还原
│    └─ 宽高比翻转? → 对未移动碎片重新 partial scatter
│
└─ [新游戏 / partial / 多人游戏]
     ├─ 计算平均碎片尺寸 (p, g)
     ├─ 判断紧凑模式 (y)
     ├─ 计算网格行列数和单元格尺寸 (S, C)
     ├─ 边缘碎片模式? → 缩小散布区域
     ├─ 确定参与散布的碎片集合 (m)
     └─ 按螺旋路径逐一放置
          ├─ 碰撞检测（与盒子/已有碎片）
          ├─ 添加随机偏移 (Z, $)
          ├─ 记录 homePos
          └─ 方向推进 → 到达边界时转向并缩小范围
```

## 8. 碎片尺寸的两层推导链

### 8.1 第一层：`core.width` 的均摊计算

`core.width` 是碎片中央图片区域的宽度，由 `knife.cut` 函数计算。图片总宽除以列数往往除不尽，余数需要均摊：

```js
f = size                         // 目标边长（由 cutChoices 确定）
k = 图片宽 % f                  // 横向余数
C = Math.floor(k / cols)        // 每列平均多分几px（通常为0，因 k < cols）
z = k % cols                    // 还剩几px，逐列 +1 消化

// 对每一列：
y = f                            // 先从基础值开始
if (k > 0) { k -= C; y += C }  // 均摊整除部分
if (z > 0) { y++; z-- }        // 把零头逐列 +1 消化

v.core.width = y                // 该碎片的 core.width
```

**结论：** 大多数列 `core.width = size`，前「余数」列 = `size + 1`，差值最多 **1px**。所有列 core.width 加总恰好等于图片宽，无浪费。

`cutChoices` 中 `size` 的确定方式：

```js
// 用户选碎片数（如100片） → 推算 rows, cols
cols = round(sqrt(count * 图片宽/图片高))
rows = round(count / cols)
size = min(floor(图片宽/cols), floor(图片高/rows))  // 取短边，保证正方形核心
```

### 8.2 第二层：锯齿厚度（`edges.thickness`）

每条边要么是凸起（tab）要么是凹口（hole），相邻碎片必须互补：

```js
当前块.left.tab = !左侧块.right.tab   // 取反，保证一凸一凹
当前块.top.tab  = !上方块.bottom.tab
```

`thickness` 的值**不是固定的**，而是以 `core.width` 为下标查预先测量好的表格：

```js
if (L.tab) {
  L.thickness = L.curves.tabHeights[side][core.width]
} else {
  L.thickness = L.curves.holeHeights[side][core.width]
}
if (L.border) L.thickness = 0   // 最外圈平边，无锯齿
```

**`tabHeights` / `holeHeights` 表格的建立过程（`buildMask` 初始化阶段）：**

1. 在隐藏 canvas 上用贝塞尔曲线绘制 tab 或 hole 的轮廓（画布尺寸 = `core.width × core.width`）
2. 用 `getImageData` 读取像素数据，沿曲线垂直方向扫描，数出伸出/缩进的像素数 `g`
3. 写入查表数组：`tabHeights[side][n] = g`；下次遇到相同 `core.width` 直接查表，无需重绘

**方向与查表下标对应：**

| side | 方向 | 查表时用的下标 |
|------|------|----------------|
| 0 | 左边 | `core.height`（B） |
| 1 | 下边 | `core.width`（j） |
| 2 | 右边 | `core.height`（B） |
| 3 | 上边 | `core.width`（j） |

**最终 `piece.width` 公式：**

```
piece.width = margin(7) + left.thickness + core.width + right.thickness + margin(7)
            = 14 + left.thickness + core.width + right.thickness
```

thickness 约为 `core.width × 22%`，故 `piece.width ≈ core.width × 1.44 + 14`。

**完整五层推导链：**

```
用户选碎片数
  → cutChoices：rows, cols, size = min(图片宽/cols, 图片高/rows)
  → knife.cut：core.width = size + 余数均摊（各列差值 ≤ 1px）
  → buildMask：绘制贝塞尔曲线 → 像素测量 → 存入 tabHeights/holeHeights
  → piece.width = 14 + left.thickness + core.width + right.thickness
  → scatter：p += piece.width - 14（还原净宽后平均 × 1.05）
```

---

## 9. 画布空间分配：为什么碎片永远放得下

### 9.1 `rescale()`：主体强制压入双重约束

散布碎片前，程序调用 `Subject.prototype.rescale()`，循环调整缩放比例：

```js
const Me = 0.9;
// 缩小循环（任一条件不满足则持续缩小）
while (图片面积/画布面积 > 0.35 || 图片宽 > 画布宽*Me || 图片高 > 画布高*Me) {
  scale -= 0.01
}
// 放大循环（图片太小且未触发缩小时）
if (!shrunk) {
  while (图片面积/画布面积 < 0.35 && 图片宽 < 画布宽*Me && 图片高 < 画布高*Me) {
    scale += 0.01
  }
  scale -= 0.01   // 退一步确保不超界
}
subject.width  = round(原始宽 × scale)
subject.height = round(原始高 × scale)
```

两个约束同时满足才停止：

- **面积约束：** 主体面积 ÷ 画布面积 ≈ **35%**（临界点）
- **边长约束：** 主体宽 ≤ 画布宽 × 0.9，主体高 ≤ 画布高 × 0.9

`0.35` 不只是视觉美观，更是关键的数学保证：

```
散布格位数 / 碎片数 ≈ 四周面积 / 主体面积 = 65% / 35% ≈ 1.86
```

即散布空间永远是碎片数量的 **1.86 倍**，不可能放不下。

### 9.2 `G`、`V`、`N`、`R` 的计算

```js
G = n.width  - this.subject.width    // 左右两侧可用宽度之和（≥ 画布宽 × 10%）
V = n.height - this.subject.height   // 上下两侧可用高度之和（≥ 画布高 × 10%）

if (G < V) {
  R = Math.floor(G / S)   // 水平方向更窄 → 限制垂直折返配额
} else {
  N = Math.floor(V / C)   // 垂直方向更窄 → 限制水平折返配额
}
// 另一个保持 999（原始设计，无限）
```

`N` 和 `R` 的语义：

- **`N`（水平配额）：** 控制 `j=3（→）` 和 `j=2（←）` 方向的转弯次数。每次右→下或左→上折返时 `N--`，降至 0 后这两个方向的 `X = false`，不再放置碎片。
- **`R`（垂直配额）：** 控制 `j=1（↓）` 和 `j=0（↑）` 方向的转弯次数。每次下→左或上→右折返时 `R--`，降至 0 后同理停止。

配额耗尽时螺旋停止深入，从而将碎片限制在 subject 外侧的环形区域。

### 9.3 `B` 数组是实际屏障，`N/R` 是粗略上界

原始游戏中 `B` 数组存放**已被玩家移动过的碎片**。游戏开始时，这些碎片已在画布四周，它们物理上占据了螺旋路径的格位，使螺旋扫到被占用格位时 `Y = true` 自动跳过，实际上永远不会把碎片放入 subject 区域。

`N = floor(V/C)` 只是粗略上界，并不精确保证螺旋恰好停在 subject 外侧。在无 `B` 阻挡的场景（如可视化工具）中，必须显式加入 subject 边界检测：

```js
// 若碎片中心 (I, L) 落在 subject 矩形内，视为被占用
const halfPW = spec.width  / 2;
const halfPH = spec.height / 2;
Y = (I + halfPW > sx && I - halfPW < sx + subjectW &&
     L + halfPH > sy && L - halfPH < sy + subjectH);
```

---

## 10. 螺旋起点与边界初始化精确值

原始代码中各关键变量的精确初始值（常见错误来源）：

| 变量 | 原始值 | 说明 |
|------|--------|------|
| `I` | `b + p/2` | 起始X用**碎片均宽 p**，而非格子宽 S |
| `L` | `g/2` | 起始Y用**碎片均高 g**，而非格子高 C |
| `O` | `n.width` | 右边界（画布右边缘） |
| `A` | `C`（一个格子高）| 上边界初始为 C；第一次向上折返时才开始收缩 |
| `M` | `n.height` | 下边界（画布下边缘） |
| `j` | `3` | 初始方向：向右 |

**转弯时的边界更新（原始逻辑一比一）：**

```js
case 3: 右→下  N--;  I = O - p/2;  if (R > 0) O -= S
case 1: 下→左  R--;  L = M - g/2;  if (N > 0) M -= C
case 2: 左→上  N--;  I = b + p/2;  if (R > 0) b += S
case 0: 上→右  R--;  L = A + g/2;  if (N > 0) A += C
```

注意：`I`/`L` 在折返后也使用 `p/2`、`g/2`（碎片单元），而不是 `S/2`、`C/2`（格子单元）。

**Edge mode 下的额外调整（碎片数 ≥ 35 且边缘已完成时）：**

```js
I += u        // 右移 p/8（将起点向内推）
L += d        // 下移 g/8
b  = u        // 左边界内移
O  = n.width - u
A  = C + d    // 上边界多收 d
M  = n.height - d
```

---

## 11. `getScatterSequence()` 的排序策略

散布序列不是简单随机打乱，而是按 `sortOrder`（游戏初始化时以随机种子生成的稳定值）排序，并尽量避免相邻碎片连续出现：

```js
n.sort((a, b) => a.sortOrder - b.sortOrder)  // 先按 sortOrder 稳定排序
// 逐一弹出；若与上一块是邻居（neighbors 数组中），推回队首重试，最多 5 次
while (n.length) {
  r = n.pop()
  if (i && r.piece.neighbors.indexOf(i.piece) !== -1 && o < 5) {
    n.unshift(r); o++
  } else {
    mn.push(r.piece.id); i = r; o = 0
  }
}
```

**效果：** 拼图上在空间上相邻的碎片，在螺旋路径上会被间隔开，避免玩家轻易找到匹配对。散布完成后，编号小的碎片在螺旋内圈（最后放置），编号大的在外圈（最先放置）。

---

*文档最后更新：2026-03-03*
