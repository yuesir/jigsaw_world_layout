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

  class PuzzleStage2Runtime {
    constructor({ canvas, statusEl }) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.statusEl = statusEl;

      this.subject = new SubjectImage();
      this.fitMode = 'contain';
      this.lastFrameAt = 0;
      this.running = false;

      this.world = {
        width: 0,
        height: 0,
        dpr: Math.max(1, window.devicePixelRatio || 1),
      };

      this.subjectRect = { x: 0, y: 0, w: 0, h: 0 };
      this.rows = 4;
      this.cols = 6;
      this.pieces = [];

      this.drag = {
        active: false,
        piece: null,
        offsetX: 0,
        offsetY: 0,
      };

      this.onResize = this.onResize.bind(this);
      this.tick = this.tick.bind(this);
      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerMove = this.onPointerMove.bind(this);
      this.onPointerUp = this.onPointerUp.bind(this);

      window.addEventListener('resize', this.onResize);
      this.canvas.addEventListener('pointerdown', this.onPointerDown);
      window.addEventListener('pointermove', this.onPointerMove);
      window.addEventListener('pointerup', this.onPointerUp);

      this.onResize();
    }

    destroy() {
      this.running = false;
      window.removeEventListener('resize', this.onResize);
      this.canvas.removeEventListener('pointerdown', this.onPointerDown);
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUp);
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
      this.relayoutPiecesToBoard();
      this.render();
    }

    async loadSubject(url) {
      await this.subject.load(url);
      this.computeSubjectRect();
      this.buildRectPieces(this.rows, this.cols);
      this.render();
    }

    setGrid(rows, cols) {
      this.rows = Math.max(2, Math.min(20, rows | 0));
      this.cols = Math.max(2, Math.min(20, cols | 0));
    }

    toggleFitMode() {
      this.fitMode = this.fitMode === 'contain' ? 'cover' : 'contain';
      this.computeSubjectRect();
      this.relayoutPiecesToBoard();
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
      const scaleX = vw / iw;
      const scaleY = vh / ih;
      const scale = this.fitMode === 'contain' ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);

      const w = Math.round(iw * scale);
      const h = Math.round(ih * scale);
      const x = Math.round((vw - w) / 2);
      const y = Math.round((vh - h) / 2);
      this.subjectRect = { x, y, w, h };
    }

    buildRectPieces(rows, cols) {
      if (!this.subject.ready) return;

      this.setGrid(rows, cols);
      const pieces = [];

      const sw = this.subject.naturalWidth / this.cols;
      const sh = this.subject.naturalHeight / this.rows;
      const pw = this.subjectRect.w / this.cols;
      const ph = this.subjectRect.h / this.rows;

      let id = 0;
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          const sx = c * sw;
          const sy = r * sh;
          const homeX = this.subjectRect.x + c * pw;
          const homeY = this.subjectRect.y + r * ph;

          pieces.push({
            id: id++,
            row: r,
            col: c,
            sx,   //图片对应的宽度起点位置
            sy,   //图片对应的高度起点位置
            sw,   //块对应的图片宽度
            sh,   //块对应的图片高度
            w: pw,  //canvas 区域的宽度
            h: ph,  //canvas 区域的高度
            homeX,  //
            homeY,
            x: homeX,
            y: homeY,
            placed: true,
          });
        }
      }

      this.pieces = pieces;
    }

    relayoutPiecesToBoard() {
      if (!this.pieces.length || !this.subject.ready) return;

      const pw = this.subjectRect.w / this.cols;
      const ph = this.subjectRect.h / this.rows;
      for (const p of this.pieces) {
        p.w = pw;
        p.h = ph;
        p.homeX = this.subjectRect.x + p.col * pw;
        p.homeY = this.subjectRect.y + p.row * ph;

        if (p.placed) {
          p.x = p.homeX;
          p.y = p.homeY;
        }
      }
    }

    scatterPieces() {
      if (!this.pieces.length) return;

      const { width: vw, height: vh } = this.world;
      //这里说明了 this.subjectRect 就是中心放置物体的宽度和高度
      const center = this.subjectRect;

      for (const p of this.pieces) {
        let tries = 0;
        let x = 0;
        let y = 0;

        while (tries++ < 80) {
          x = Math.random() * (vw - p.w);
          y = Math.random() * (vh - p.h);

          //这里是碰撞检测，检测是否和中心的图片产生了碰撞
          const overlapX = x < center.x + center.w && x + p.w > center.x;
          const overlapY = y < center.y + center.h && y + p.h > center.y;
          const overlapsCenter = overlapX && overlapY;

          if (!overlapsCenter) break;
        }

        p.x = x;
        p.y = y;
        p.placed = false;
      }
    }

    resetPiecesHome() {
      for (const p of this.pieces) {
        p.x = p.homeX;
        p.y = p.homeY;
        p.placed = true;
      }
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

    renderBoardGhost(ctx) {
      if (!this.subject.ready) return;
      const r = this.subjectRect;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.drawImage(this.subject.img, r.x, r.y, r.w, r.h);
      ctx.restore();

      ctx.strokeStyle = '#93c5fd';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }

    renderPieces(ctx) {
      if (!this.subject.ready || !this.pieces.length) return;

      for (const p of this.pieces) {
        ctx.drawImage(this.subject.img, p.sx, p.sy, p.sw, p.sh, p.x, p.y, p.w, p.h);

        ctx.strokeStyle = p.placed ? '#10b981' : '#2f3c54';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(p.x, p.y, p.w, p.h);
      }
    }

    render() {
      const ctx = this.ctx;
      const { width: vw, height: vh, dpr } = this.world;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.renderBackground(ctx, vw, vh);
      this.renderBoardGhost(ctx);
      this.renderPieces(ctx);

      const placedCount = this.pieces.reduce((sum, p) => sum + (p.placed ? 1 : 0), 0);
      this.statusEl.textContent = [
        `Canvas: ${vw} x ${vh} @dpr ${dpr.toFixed(2)}`,
        `Fit: ${this.fitMode}`,
        `Grid: ${this.rows} x ${this.cols} (${this.pieces.length} 块)`,
        `Placed: ${placedCount}/${this.pieces.length}`,
        'Stage-2 MVP: 矩形切块 + 拖拽 + 近位吸附',
      ].join('\n');
    }

    getCanvasPoint(evt) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top,
      };
    }

    pickTopPieceAt(x, y) {
      for (let i = this.pieces.length - 1; i >= 0; i--) {
        const p = this.pieces[i];
        if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) {
          return p;
        }
      }
      return null;
    }

    bringPieceToTop(piece) {
      const idx = this.pieces.indexOf(piece);
      if (idx < 0) return;
      this.pieces.splice(idx, 1);
      this.pieces.push(piece);
    }

    onPointerDown(evt) {
      if (!this.pieces.length) return;
      const pt = this.getCanvasPoint(evt);
      const piece = this.pickTopPieceAt(pt.x, pt.y);
      if (!piece) return;

      this.bringPieceToTop(piece);
      this.drag.active = true;
      this.drag.piece = piece;
      this.drag.offsetX = pt.x - piece.x;
      this.drag.offsetY = pt.y - piece.y;
      this.canvas.classList.add('dragging');
      this.canvas.setPointerCapture(evt.pointerId);
    }

    onPointerMove(evt) {
      if (!this.drag.active || !this.drag.piece) return;
      const pt = this.getCanvasPoint(evt);
      const p = this.drag.piece;

      p.x = pt.x - this.drag.offsetX;
      p.y = pt.y - this.drag.offsetY;
      p.placed = false;
    }

    onPointerUp(evt) {
      if (!this.drag.active || !this.drag.piece) return;
      const p = this.drag.piece;

      const dx = p.x - p.homeX;
      const dy = p.y - p.homeY;
      const dist = Math.hypot(dx, dy);
      if (dist < Math.max(18, Math.min(p.w, p.h) * 0.25)) {
        p.x = p.homeX;
        p.y = p.homeY;
        p.placed = true;
      }

      this.drag.active = false;
      this.drag.piece = null;
      this.canvas.classList.remove('dragging');
      if (this.canvas.hasPointerCapture(evt.pointerId)) {
        this.canvas.releasePointerCapture(evt.pointerId);
      }
    }
  }

  const canvas = document.getElementById('gameCanvas');
  const statusEl = document.getElementById('status');
  const imageUrl = document.getElementById('imageUrl');
  const loadBtn = document.getElementById('loadBtn');
  const fitBtn = document.getElementById('fitBtn');
  const cutBtn = document.getElementById('cutBtn');
  const scatterBtn = document.getElementById('scatterBtn');
  const resetBtn = document.getElementById('resetBtn');
  const rowsInput = document.getElementById('rows');
  const colsInput = document.getElementById('cols');

  const runtime = new PuzzleStage2Runtime({ canvas, statusEl });
  runtime.start();

  imageUrl.value =
    'https://images.unsplash.com/photo-1472396961693-142e6e269027?auto=format&fit=crop&w=1400&q=80';

  loadBtn.addEventListener('click', async () => {
    const url = imageUrl.value.trim();
    if (!url) return;

    loadBtn.disabled = true;
    loadBtn.textContent = '加载中...';

    try {
      await runtime.loadSubject(url);
      runtime.scatterPieces();
    } catch (err) {
      window.alert('图片加载失败：请确认 URL 可访问且允许跨域。');
      console.error(err);
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = '加载题图';
    }
  });

  cutBtn.addEventListener('click', () => {
    if (!runtime.subject.ready) {
      window.alert('请先加载题图。');
      return;
    }

    runtime.buildRectPieces(Number(rowsInput.value), Number(colsInput.value));
    runtime.scatterPieces();
  });

  scatterBtn.addEventListener('click', () => {
    runtime.scatterPieces();
  });

  resetBtn.addEventListener('click', () => {
    runtime.resetPiecesHome();
  });

  fitBtn.addEventListener('click', () => {
    runtime.toggleFitMode();
  });
})();