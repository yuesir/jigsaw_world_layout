# 工业级拼图引擎 · 开发方案

> 范围：Part 4（渲染与主题）
> 项目根：`D:\code\jigsaw_world_layout\new\engine\`
> 技术栈：TypeScript (strict) + WebGL2 + Vite + Vitest

---

## 0. 目标与边界

- **本阶段交付**：渲染管线 + Clip 体系 + Tweener + Theme
- **不在本阶段**：piece 拼图逻辑、knife 切片算法、Photon 多人、UI 工具栏、jQuery 兼容层
- **可独立运行**：能加载图片、用主题背景渲染、几个动画 Clip 在 5 个 layer 间飞、context lost 自动恢复的 demo

---

## 1. 技术选型

| 项 | 选择 | 理由 |
|---|---|---|
| 语言 | TypeScript（strict） | 行业标准 2026、类型即文档 |
| 渲染 | **WebGL2** | 兼容性好，贴近原源码 |
| 构建 | Vite 5 | 启动快、HMR、ESM 原生 |
| 测试 | Vitest | Vite 生态零成本 |
| 状态原语 | 自研 Variant/Sym | 还原原设计思路（响应式 + 序数枚举） |
| 包管理 | **npm** | Node 自带、零配置 |
| 格式化 | ESLint + Prettier | 标配 |

---

## 2. 项目结构

```
new\engine\
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── .eslintrc.cjs
├── .prettierrc
├── index.html                 # demo 入口
├── README.md
├── src/
│   ├── index.ts               # 公共 API 出口
│   ├── core/
│   │   ├── engine.ts          # 顶层 Engine 装配
│   │   ├── context.ts         # WebGL2 context + 探测
│   │   ├── errors.ts          # EngineError、ShaderError 等
│   │   └── clock.ts           # 性能时钟
│   ├── math/
│   │   ├── vec2.ts
│   │   ├── mat3.ts            # 2D 仿射
│   │   ├── color.ts           # RGBA + hex
│   │   ├── easing.ts          # 6 种 ease
│   │   └── aabb.ts
│   ├── reactive/
│   │   ├── sym.ts             # 带 ordinal 的枚举
│   │   ├── variant.ts         # 响应式变量
│   │   └── state-cell.ts      # 显式 FSM
│   ├── gl/
│   │   ├── shader.ts          # 编译/链接/attrib 缓存
│   │   ├── program.ts
│   │   ├── buffer.ts          # VBO 包装
│   │   ├── vertex-manager.ts  # vertMngr
│   │   ├── texture.ts         # 引用计数纹理池
│   │   ├── projector.ts       # RAF 主循环
│   │   └── shaders/           # GLSL 源
│   ├── scene/
│   │   ├── clip.ts            # 6 属性 + 6 layer
│   │   ├── clips.ts           # 多层 list
│   │   ├── pos-point.ts       # 逻辑↔OGL 坐标
│   │   └── animator.ts        # 精灵帧动画
│   ├── tween/
│   │   ├── tweener.ts         # 旧版（保留兼容）
│   │   ├── tweener2.ts        # 主用
│   │   └── tween-update.ts    # updateTweeners 调度
│   ├── theme/
│   │   ├── types.ts
│   │   ├── presets.ts         # 12 个主题
│   │   ├── state.ts           # ThemeVariant
│   │   └── injection.ts       # 写 CSS 变量
│   └── utils/
│       ├── list.ts            # 双向链表 + free pool
│       ├── random.ts          # Mulberry32
│       ├── web-req.ts         # XHR/Image 加载
│       └── log.ts             # 轻量 console 门面
├── examples/
│   └── theme-flyer/           # demo 程序
│       ├── main.ts
│       └── style.css
└── tests/
    ├── math.test.ts
    ├── easing.test.ts
    ├── variant.test.ts
    ├── tweener.test.ts
    └── vertex-manager.test.ts
```

---

## 3. 开发顺序（11 个 milestone）

| # | 模块 | 验收标准 | 估时 |
|---|---|---|---|
| M0 | 脚手架 | `npm run dev` 起 Vite、ESLint、TS strict 通过 | 0.5d |
| M1 | 数学 + reactive | Vec2/Mat3/Easing/Variant/Sym 全部单测覆盖 | 1d |
| M2 | WebGL context + Shader | 画一个纯色矩形到 canvas，捕获 context lost | 1d |
| M3 | VertexManager | register/move/rotate/setSize/commit 全通 | 2d |
| M4 | Texture 池 | 引用计数、复用、context restore | 0.5d |
| M5 | Clip + Clips | 6 layer 各自 addLast/moveToTop/drawAll | 1.5d |
| M6 | PosPoint + Tweener2 | 5 种 ease、extend/kill/finish 全通 | 1.5d |
| M7 | Animator | 帧率独立、autoStart/pause | 0.5d |
| M8 | Projector | benchmark、autoStart、stop、resize | 1d |
| M9 | Theme | 12 预设、Variant 响应式、CSS 变量注入 | 1d |
| M10 | Demo 集成 | 主题切换、5 个 Clip 飘动、context lost 提示 | 1d |

合计 ~11.5d，分 3 个 sprint：

```
Sprint 1（M0-M3）：脚手架 + 基础 + 渲染内核
Sprint 2（M4-M7）：纹理 + Clip + 补间
Sprint 3（M8-M10）：循环 + 主题 + 集成
```

---

## 4. 关键设计决策

| 项 | 决定 |
|---|---|
| Vertex 布局 | 沿用 15-float/quad（pos/scale/trans/rot/state/color/opacity/tex0/tex1） |
| 双 VBO ping-pong | 必须保留 |
| Reactive | 自研 Variant + Sym（不引第三方） |
| clip.active 模型 | `null === node` 判断 |
| Tweener 状态机 | 5 态 not_queued/pending/active/completed/delayed |
| Texture 池上限 | 32 |
| Easing | 6 种 NONE/IN/IN_SLOW/OUT/OUT_SLOW/IN_OUT |

---

## 5. 公共 API 草稿

```ts
import { Engine, Variant, ThemeState, Tweener2 } from '@jigsaw/engine';

const engine = new Engine(canvas, { layers: 5, clearColor: '#7390aa' });
ThemeState.val = ThemeState.getThemeFromOrdinal(2);

const tex = await engine.textures.load(url);
const clip = engine.clips.add('pieces-layer', {
  name: 'hero',
  image: { data: tex, bounds: { x: 0, y: 0, width: 512, height: 512 } },
  position: { x: 100, y: 100 },
});

clip.opacity = new Tweener2('opacity', 0, 600);
engine.projector.autoStart();
```

---

## 6. 测试策略

- **单测**：math、easing、variant、tweener、vertex-manager 逻辑
- **视觉快照**：gl.readPixels 抓像素对比
- **手动验收**：context lost 恢复、长时间 RAF 内存

---

## 7. 风险

| 风险 | 缓解 |
|---|---|
| WebGL2 context lost 测试覆盖不足 | 主动用 `WEBGL_lose_context` 扩展触发 |
| 移动端 Safari 早期 iOS bug | 启动探测 + 降级 + 上报 |
| Variant 引用循环 → 内存泄漏 | 暴露 dispose()，所有 Variant 必走 dispose |
| VBO 上传频次 | commit 时上传、track dirty 范围、bufferSubData |

---

## 8. 不做的事

- piece 拼图主体、knife、Photon、UI 工具栏、openConsole 错误上报
- 后续按相同模式接力开发
