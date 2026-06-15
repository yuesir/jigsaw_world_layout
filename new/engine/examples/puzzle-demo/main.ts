/**
 * Puzzle demo — Part 7: piece / group / knife.
 *
 * Builds a small jigsaw puzzle from a procedurally-generated image,
 * scatters the pieces on the canvas, and lets the user drag them.
 * Pieces snap to neighbors within snapDistance.
 */
import { Engine, Puzzle, type InputEvent } from '../../src/index';

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const statusEl = document.getElementById('status') as HTMLElement;
const statusBlock = document.getElementById('status-block') as HTMLElement;
const rotatableEl = document.getElementById('rotatable') as HTMLInputElement;
const rowsEl = document.getElementById('rows') as HTMLInputElement;
const colsEl = document.getElementById('cols') as HTMLInputElement;
const imageSel = document.getElementById('image') as HTMLSelectElement;
const newBtn = document.getElementById('new-puzzle') as HTMLButtonElement;
const scatterBtn = document.getElementById('scatter') as HTMLButtonElement;

let engine: Engine;
let puzzle: Puzzle | null = null;

try {
  engine = new Engine(canvas, { layers: 5, clearColor: '#0c0f17' });
  engine.resize(800, 500);
  engine.projector.attachContextLossHandlers();
  engine.setInputHandler((e: InputEvent) => {
    puzzle?.handleEvent(e);
  });
  statusEl.textContent = 'Engine ready.';
} catch (err) {
  statusEl.textContent = `Engine init failed: ${(err as Error).message}`;
  throw err;
}

/* ——— Image generators ——— */

function makeGradientImage(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 360;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 480, 360);
  g.addColorStop(0, '#ff8a4a');
  g.addColorStop(0.5, '#f0c54a');
  g.addColorStop(1, '#4a8aff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 480, 360);
  // Add a sun
  ctx.fillStyle = '#fff5a0';
  ctx.beginPath();
  ctx.arc(360, 100, 60, 0, Math.PI * 2);
  ctx.fill();
  // Add a mountain
  ctx.fillStyle = '#2c3e5a';
  ctx.beginPath();
  ctx.moveTo(0, 360);
  ctx.lineTo(160, 200);
  ctx.lineTo(280, 280);
  ctx.lineTo(380, 180);
  ctx.lineTo(480, 360);
  ctx.closePath();
  ctx.fill();
  // Add a tree
  ctx.fillStyle = '#1d3a1a';
  ctx.fillRect(80, 240, 16, 100);
  ctx.beginPath();
  ctx.arc(88, 240, 40, 0, Math.PI * 2);
  ctx.fill();
  return c;
}

function makeCheckerImage(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 360;
  const ctx = c.getContext('2d')!;
  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c'];
  for (let r = 0; r < 6; r++) {
    for (let c2 = 0; c2 < 8; c2++) {
      ctx.fillStyle = colors[(r + c2) % colors.length]!;
      ctx.fillRect(c2 * 60, r * 60, 60, 60);
    }
  }
  return c;
}

function makeCirclesImage(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 360;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 480, 360);
  const cx = 240;
  const cy = 180;
  for (let r = 12; r > 0; r--) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * 18, 0, Math.PI * 2);
    const hue = (r * 30) % 360;
    ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;
    ctx.fill();
  }
  // Add a black square to break symmetry
  ctx.fillStyle = '#000';
  ctx.fillRect(40, 40, 60, 60);
  return c;
}

function makeImage(kind: string): HTMLCanvasElement {
  switch (kind) {
    case 'checker':
      return makeCheckerImage();
    case 'circles':
      return makeCirclesImage();
    default:
      return makeGradientImage();
  }
}

/* ——— Puzzle lifecycle ——— */

function startNewPuzzle(): void {
  if (puzzle) {
    puzzle.dispose();
    puzzle = null;
  }
  const rows = parseInt(rowsEl.value, 10) || 3;
  const cols = parseInt(colsEl.value, 10) || 3;
  const rotatable = rotatableEl.checked;
  const image = makeImage(imageSel.value);
  puzzle = new Puzzle(engine, {
    source: image,
    name: `puzzle-${rows}x${cols}`,
    rows,
    cols,
    rotatable,
  });
  puzzle.onComplete = () => {
    statusEl.textContent = '🎉 Puzzle complete!';
    statusBlock.textContent = `Puzzle "${puzzle!.name}" completed. Pieces: ${puzzle!.pieces.length}.`;
  };
  // Wire input handler to forward to the active puzzle
  // (already set in engine.setInputHandler; we just update statusBlock)
  statusBlock.textContent = `Puzzle "${puzzle.name}" cut. ${puzzle.pieces.length} pieces scattered. Drag to play.`;
  statusEl.textContent = `Ready: ${rows}×${cols}, ${puzzle.pieces.length} pieces.`;
}

/* ——— Controls ——— */

newBtn.addEventListener('click', startNewPuzzle);
scatterBtn.addEventListener('click', () => {
  if (puzzle) {
    puzzle.scatter();
    statusEl.textContent = 'Re-scattered.';
  }
});

rotatableEl.addEventListener('change', startNewPuzzle);
rowsEl.addEventListener('change', startNewPuzzle);
colsEl.addEventListener('change', startNewPuzzle);
imageSel.addEventListener('change', startNewPuzzle);

engine.projector.start();
startNewPuzzle();
