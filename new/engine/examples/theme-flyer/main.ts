/**
 * Theme Flyer — Part 4 demo.
 *
 * Loads a small SVG (rendered as PNG via canvas) as a Texture, creates
 * a few animated Clips on different layers, and shows theme switching
 * and context-loss recovery.
 */
import { Engine, Clip, ThemeState, THEME_PRESETS, Tweener2, EASE_IN_OUT, injectTheme, type Theme, Vec2 } from '../../src/index';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const themePicker = document.getElementById('theme-picker') as HTMLElement;
const statusEl = document.getElementById('status') as HTMLElement;
const fpsEl = document.getElementById('fps') as HTMLElement;
const addBtn = document.getElementById('add-clip') as HTMLButtonElement;
const spinBtn = document.getElementById('toggle-spin') as HTMLButtonElement;
const lossBtn = document.getElementById('trigger-context-loss') as HTMLButtonElement;

function setStatus(msg: string): void {
  statusEl.textContent = msg;
}

/* ——— Engine bootstrap ——— */

let engine: Engine;
try {
  engine = new Engine(canvas, { layers: 5, clearColor: '#7390aa' });
  engine.resize(800, 500);
  engine.projector.attachContextLossHandlers();
  engine.projector.onBenchmark = (fps) => {
    fpsEl.textContent = `${fps} fps`;
  };
  setStatus('Engine ready (WebGL2, 5 layers).');
} catch (e) {
  setStatus(`Engine init failed: ${(e as Error).message}`);
  throw e;
}

/* ——— Theme picker ——— */

function buildThemePicker(): void {
  themePicker.innerHTML = '';
  for (const name of Object.keys(THEME_PRESETS)) {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.dataset.theme = name;
    if (ThemeState.val.val?.name === name) btn.classList.add('active');
    btn.addEventListener('click', () => {
      const t = ThemeState.getThemeFromName(name);
      if (t) {
        ThemeState.val.val = t;
      }
    });
    themePicker.appendChild(btn);
  }
  ThemeState.val.addListener((next: Theme) => {
    engine.setClearColor(next.color.background);
    injectTheme(next, document.documentElement);
    for (const b of themePicker.querySelectorAll('button')) {
      b.classList.toggle('active', (b as HTMLElement).dataset.theme === next.name);
    }
    setStatus(`Theme → ${next.name} (bg: ${next.color.background})`);
  });
  // apply initial
  const initial = ThemeState.val.val;
  if (initial) {
    injectTheme(initial, document.documentElement);
  }
}
buildThemePicker();

/* ——— Procedural texture: a colored "tile" with a label ——— */

function makeTileTexture(label: string, color: [number, number, number]): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  // gradient background
  const g = ctx.createLinearGradient(0, 0, 128, 128);
  g.addColorStop(0, `rgb(${Math.min(255, color[0] + 40)}, ${Math.min(255, color[1] + 40)}, ${Math.min(255, color[2] + 40)})`);
  g.addColorStop(1, `rgb(${color[0]}, ${color[1]}, ${color[2]})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  // border
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 124);
  // label
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 48px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 64, 64);
  return c;
}

function loadImageFromCanvas(c: HTMLCanvasElement): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = c.toDataURL('image/png');
  });
}

/* ——— Create the demo clips ——— */

interface DemoClip {
  clip: Clip;
  spin: boolean;
  phase: number;
  base: Vec2;
}

const flyingClips: DemoClip[] = [];

async function bootstrapClips(): Promise<void> {
  const tileSpec: Array<[string, [number, number, number], string]> = [
    ['A', [220, 90, 90], 'top-layer'],
    ['B', [90, 200, 130], 'pieces-layer'],
    ['C', [220, 200, 90], 'bottom-layer'],
    ['D', [120, 130, 220], 'bkgd-layer'],
    ['E', [220, 150, 200], 'primer-layer'],
  ];
  let i = 0;
  for (const [label, color, layer] of tileSpec) {
    const c = makeTileTexture(label, color);
    const img = await loadImageFromCanvas(c);
    const tex = engine.loadTexture(img, `tile-${label}`);
    const clip = engine.createClip({
      layer,
      name: `tile-${label}`,
      image: { data: tex, bounds: { x: 0, y: 0, width: 128, height: 128 } },
      position: {
        x: 120 + (i % 3) * 220,
        y: 120 + Math.floor(i / 3) * 180,
      },
      angle: 0,
      opacity: 1,
    });
    flyingClips.push({
      clip,
      spin: true,
      phase: (i / tileSpec.length) * Math.PI * 2,
      base: new Vec2(clip.x, clip.y),
    });
    i++;
  }
  setStatus(`Bootstrapped ${flyingClips.length} clips.`);
}

bootstrapClips().then(() => {
  engine.projector.start();
});

/* ——— Per-frame animation: gentle floating + optional spin ——— */

let spinEnabled = true;
const startMs = performance.now();
function frameAnimation(): void {
  if (!engine.projector.isRunning()) return;
  const t = (performance.now() - startMs) / 1000;
  for (const dc of flyingClips) {
    const cx = dc.base.x + Math.cos(t * 0.6 + dc.phase) * 30;
    const cy = dc.base.y + Math.sin(t * 0.8 + dc.phase) * 20;
    dc.clip.moveTo(cx, cy);
    if (spinEnabled && dc.spin) {
      const a = (dc.phase * 180) / Math.PI + t * 60;
      dc.clip.angle = ((a % 360) + 360) % 360;
    }
  }
  requestAnimationFrame(frameAnimation);
}
requestAnimationFrame(frameAnimation);

/* ——— Controls ——— */

addBtn.addEventListener('click', async () => {
  const idx = flyingClips.length;
  const labels = ['X', 'Y', 'Z'];
  const label = labels[idx % labels.length]!;
  const c = makeTileTexture(label, [180 + idx * 20, 120, 220 - idx * 30]);
  const img = await loadImageFromCanvas(c);
  const tex = engine.loadTexture(img, `tile-${label}-${idx}`);
  const clip = engine.createClip({
    layer: 'pieces-layer',
    name: `tile-${label}-${idx}`,
    image: { data: tex, bounds: { x: 0, y: 0, width: 128, height: 128 } },
    position: { x: 400, y: 250 },
    opacity: 0,
  });
  // fade in
  clip.opacity = new Tweener2('opacity', 1, 800);
  flyingClips.push({
    clip,
    spin: true,
    phase: Math.random() * Math.PI * 2,
    base: new Vec2(400, 250),
  });
  setStatus(`Added clip "tile-${label}-${idx}". Total: ${flyingClips.length}`);
});

spinBtn.addEventListener('click', () => {
  spinEnabled = !spinEnabled;
  spinBtn.textContent = spinEnabled ? 'Stop spin' : 'Start spin';
});

lossBtn.addEventListener('click', () => {
  const ext = engine.gl.getExtension('WEBGL_lose_context');
  if (ext) {
    setStatus('Simulating context loss…');
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 600);
  } else {
    setStatus('WEBGL_lose_context not supported in this browser.');
  }
});

/* ——— expose for debugging ——— */
(window as unknown as { engine: Engine }).engine = engine;
