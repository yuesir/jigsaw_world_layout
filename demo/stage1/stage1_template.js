(() => {
  'use strict';

  class SubjectImage {
    constructor() {
      this.img = null;
      this.ready = false;
      this.naturalWidth = 0;
      this.naturalHeight = 0;
    }

    async load(url) {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      this.img = img;
      this.ready = true;
      this.naturalWidth = img.naturalWidth;
      this.naturalHeight = img.naturalHeight;
    }
  }

  class PuzzleStage1Runtime {
    constructor({ canvas, statusEl }) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.statusEl = statusEl;

      this.subject = new SubjectImage();
      this.fitMode = 'contain'; // contain | cover
      this.lastFrameAt = 0;
      this.running = false;

      this.world = {
        width: 0,
        height: 0,
        dpr: Math.max(1, window.devicePixelRatio || 1),
      };

      this.subjectRect = { x: 0, y: 0, w: 0, h: 0 };

      this.onResize = this.onResize.bind(this);
      this.tick = this.tick.bind(this);

      window.addEventListener('resize', this.onResize);
      this.onResize();
    }

    destroy() {
      this.running = false;
      window.removeEventListener('resize', this.onResize);
    }

    onResize() {
      const parent = this.canvas.parentElement;
      const dpr = Math.max(1, window.devicePixelRatio || 1);

      const cssW = Math.max(320, Math.floor(parent.clientWidth));
      const cssH = Math.max(320, Math.floor(parent.clientHeight));

      this.canvas.width = Math.floor(cssW * dpr);
      this.canvas.height = Math.floor(cssH * dpr);
      this.canvas.style.width = `${cssW}px`;
      this.canvas.style.height = `${cssH}px`;

      this.world.width = cssW;
      this.world.height = cssH;
      this.world.dpr = dpr;

      this.computeSubjectRect();
      this.render();
    }

    async loadSubject(url) {
      await this.subject.load(url);
      this.computeSubjectRect();
      this.render();
    }

    toggleFitMode() {
      this.fitMode = this.fitMode === 'contain' ? 'cover' : 'contain';
      this.computeSubjectRect();
      this.render();
    }

    computeSubjectRect() {
      const { width: vw, height: vh } = this.world;

      if (!this.subject.ready) {
        this.subjectRect = { x: 0, y: 0, w: 0, h: 0 };
        return;
      }

      const iw = this.subject.naturalWidth;
      const ih = this.subject.naturalHeight;
      //缩放逻辑（图片有可能比画布宽或者高）
      const scaleX = vw / iw;
      const scaleY = vh / ih;
      const scale = this.fitMode === 'contain' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);

      const w = Math.round(iw * scale);
      const h = Math.round(ih * scale);
      //这里相当于居中对齐的逻辑
      const x = Math.round((vw - w) / 2);
      const y = Math.round((vh - h) / 2);

      this.subjectRect = { x, y, w, h };
    }

    start() {
      if (this.running) return;
      this.running = true;
      requestAnimationFrame(this.tick);
    }

    tick(ts) {
      if (!this.running) return;
      const dt = this.lastFrameAt ? ts - this.lastFrameAt : 0;
      this.lastFrameAt = ts;

      // 第1阶段保留更新循环骨架，后续阶段可接入动画/输入/物理
      this.update(dt);
      this.render();

      requestAnimationFrame(this.tick);
    }

    update(_dt) {}

    renderBackground(ctx, vw, vh) {
      ctx.fillStyle = '#20283a';
      ctx.fillRect(0, 0, vw, vh);

      const grid = 28;
      for (let y = 0; y < vh; y += grid) {
        for (let x = 0; x < vw; x += grid) {
          const isDark = ((x / grid + y / grid) | 0) % 2 === 0;
          ctx.fillStyle = isDark ? '#243147' : '#273650';
          ctx.fillRect(x, y, grid, grid);
        }
      }
    }

    renderSubject(ctx) {
      if (!this.subject.ready) return;
      const r = this.subjectRect;
      ctx.drawImage(this.subject.img, r.x, r.y, r.w, r.h);

      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }

    render() {
      const ctx = this.ctx;
      const { width: vw, height: vh, dpr } = this.world;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.renderBackground(ctx, vw, vh);
      this.renderSubject(ctx);

      this.statusEl.textContent = [
        `Canvas: ${vw} x ${vh} @dpr ${dpr.toFixed(2)}`,
        `Fit: ${this.fitMode}`,
        `Image: ${this.subject.ready ? `${this.subject.naturalWidth} x ${this.subject.naturalHeight}` : '未加载'}`,
        `Stage-1: 画布稳定 + 图片居中缩放`,
      ].join('\n');
    }
  }

  const canvas = document.getElementById('gameCanvas');
  const statusEl = document.getElementById('status');
  const imageUrl = document.getElementById('imageUrl');
  const loadBtn = document.getElementById('loadBtn');
  const fitBtn = document.getElementById('fitBtn');

  const runtime = new PuzzleStage1Runtime({ canvas, statusEl });
  runtime.start();

  // 默认示例图（可替换）
  imageUrl.value =
    'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=1400&q=80';

  loadBtn.addEventListener('click', async () => {
    const url = imageUrl.value.trim();
    if (!url) return;

    loadBtn.disabled = true;
    loadBtn.textContent = '加载中...';

    try {
      await runtime.loadSubject(url);
    } catch (err) {
      window.alert('图片加载失败：请确认 URL 可访问且允许跨域。');
      console.error(err);
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = '加载题图';
    }
  });

  fitBtn.addEventListener('click', () => {
    runtime.toggleFitMode();
  });
})();