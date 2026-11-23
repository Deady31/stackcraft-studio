(function (global) {
  'use strict';

  const StackStudio = (global.StackStudio = global.StackStudio || {});

  class SliceEditor {
    constructor(canvas, onModelChange, onColorPicked) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.onModelChange = onModelChange;
      this.onColorPicked = onColorPicked;

      this.model = null;
      this.currentZ = 0;
      this.tool = 'brush'; // 'brush' | 'eraser' | 'fill' | 'picker'
      this.brushSize = 1;
      this.selectedColor = 1;
      this.symX = false;
      this.symY = false;
      this.onionSkin = true;

      this.isDrawing = false;
      this.hoverCell = null;
      this.undoStack = [];
      this.redoStack = [];
      this._strokeSnapshot = null;

      this._bindEvents();
    }

    setModel(model) {
      this.model = model;
      this.currentZ = Math.floor(model.height * 0.4);
      this.selectedColor = 1;
      this.undoStack = [];
      this.redoStack = [];
      this.render();
    }

    setLayer(z) {
      if (!this.model) return;
      this.currentZ = Math.max(0, Math.min(this.model.height - 1, z | 0));
      this.render();
    }

    _cellFromPointer(ev) {
      if (!this.model) return null;
      const rect = this.canvas.getBoundingClientRect();
      const nx = (ev.clientX - rect.left) / rect.width;
      const ny = (ev.clientY - rect.top) / rect.height;
      const { width, depth } = this.model;
      const maxDim = Math.max(width, depth);
      const cellPx = this.canvas.width / maxDim;
      const ox = (this.canvas.width - width * cellPx) * 0.5;
      const oy = (this.canvas.height - depth * cellPx) * 0.5;

      const x = Math.floor((nx * this.canvas.width - ox) / cellPx);
      const y = Math.floor((ny * this.canvas.height - oy) / cellPx);
      if (x < 0 || x >= width || y < 0 || y >= depth) return null;
      return { x, y };
    }

    _bindEvents() {
      const coordsEl = document.getElementById('sliceCoords');

      this.canvas.addEventListener('pointerdown', (ev) => {
        if (!this.model) return;
        this.canvas.setPointerCapture(ev.pointerId);
        const cell = this._cellFromPointer(ev);
        if (!cell) return;

        if (this.tool === 'picker') {
          const val = this.model.layers[this.currentZ][cell.y * this.model.width + cell.x];
          if (val > 0) {
            this.selectedColor = val;
            if (this.onColorPicked) this.onColorPicked(val);
          }
          return;
        }

        if (this.tool === 'fill') {
          this._pushUndo();
          this._floodFill(cell.x, cell.y, this.selectedColor);
          this._notifyChange();
          return;
        }

        this.isDrawing = true;
        this._strokeSnapshot = {
          z: this.currentZ,
          data: new Uint8Array(this.model.layers[this.currentZ]),
        };
        this._applyBrush(cell.x, cell.y, ev.button === 2);
      });

      this.canvas.addEventListener('pointermove', (ev) => {
        const cell = this._cellFromPointer(ev);
        this.hoverCell = cell;
        if (coordsEl) {
          coordsEl.textContent = cell
            ? `X: ${cell.x} · Y: ${cell.y} · Z: ${this.currentZ}`
            : `X: — · Y: — · Z: ${this.currentZ}`;
        }
        if (this.isDrawing && cell) {
          this._applyBrush(cell.x, cell.y, (ev.buttons & 2) !== 0);
        } else {
          this.render();
        }
      });

      const finishStroke = () => {
        if (this.isDrawing && this._strokeSnapshot) {
          this.undoStack.push(this._strokeSnapshot);
          if (this.undoStack.length > 40) this.undoStack.shift();
          this.redoStack = [];
          this._strokeSnapshot = null;
        }
        this.isDrawing = false;
      };

      this.canvas.addEventListener('pointerup', finishStroke);
      this.canvas.addEventListener('pointercancel', finishStroke);
      this.canvas.addEventListener('pointerleave', () => {
        this.hoverCell = null;
        this.render();
      });
      this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    _pushUndo() {
      if (!this.model) return;
      this.undoStack.push({
        z: this.currentZ,
        data: new Uint8Array(this.model.layers[this.currentZ]),
      });
      if (this.undoStack.length > 40) this.undoStack.shift();
      this.redoStack = [];
    }

    undo() {
      if (!this.model || this.undoStack.length === 0) return false;
      const snap = this.undoStack.pop();
      this.redoStack.push({
        z: snap.z,
        data: new Uint8Array(this.model.layers[snap.z]),
      });
      this.model.layers[snap.z].set(snap.data);
      this.currentZ = snap.z;
      this._notifyChange();
      return true;
    }

    redo() {
      if (!this.model || this.redoStack.length === 0) return false;
      const snap = this.redoStack.pop();
      this.undoStack.push({
        z: snap.z,
        data: new Uint8Array(this.model.layers[snap.z]),
      });
      this.model.layers[snap.z].set(snap.data);
      this.currentZ = snap.z;
      this._notifyChange();
      return true;
    }

    _paintPoint(x, y, val) {
      const { width, depth } = this.model;
      const sl = this.model.layers[this.currentZ];
      const half = Math.floor(this.brushSize / 2);
      for (let dy = -half; dy <= half; dy++) {
        for (let dx = -half; dx <= half; dx++) {
          if (this.brushSize === 2 && (dx > 0 || dy > 0)) continue;
          const px = x + dx;
          const py = y + dy;
          if (px >= 0 && px < width && py >= 0 && py < depth) {
            sl[py * width + px] = val;
          }
        }
      }
    }

    _applyBrush(x, y, forceErase) {
      const val = forceErase || this.tool === 'eraser' ? 0 : this.selectedColor;
      const { width, depth } = this.model;
      this._paintPoint(x, y, val);
      if (this.symX) this._paintPoint(width - 1 - x, y, val);
      if (this.symY) this._paintPoint(x, depth - 1 - y, val);
      if (this.symX && this.symY) this._paintPoint(width - 1 - x, depth - 1 - y, val);
      this._notifyChange();
    }

    _floodFill(sx, sy, targetColor) {
      const { width, depth } = this.model;
      const sl = this.model.layers[this.currentZ];
      const startColor = sl[sy * width + sx];
      if (startColor === targetColor) return;

      const stack = [[sx, sy]];
      while (stack.length > 0) {
        const [x, y] = stack.pop();
        if (x < 0 || x >= width || y < 0 || y >= depth) continue;
        const idx = y * width + x;
        if (sl[idx] !== startColor) continue;
        sl[idx] = targetColor;
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
      }
    }

    duplicateLayer(dir) {
      if (!this.model) return false;
      const targetZ = this.currentZ + dir;
      if (targetZ < 0 || targetZ >= this.model.height) return false;
      this.undoStack.push({
        z: targetZ,
        data: new Uint8Array(this.model.layers[targetZ]),
      });
      this.redoStack = [];
      this.model.layers[targetZ].set(this.model.layers[this.currentZ]);
      this.currentZ = targetZ;
      this._notifyChange();
      return true;
    }

    mirrorLayerX() {
      if (!this.model) return;
      this._pushUndo();
      const { width, depth } = this.model;
      const sl = this.model.layers[this.currentZ];
      const copy = new Uint8Array(sl);
      for (let y = 0; y < depth; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
          sl[row + x] = copy[row + (width - 1 - x)];
        }
      }
      this._notifyChange();
    }

    clearLayer() {
      if (!this.model) return;
      this._pushUndo();
      this.model.layers[this.currentZ].fill(0);
      this._notifyChange();
    }

    _notifyChange() {
      this.render();
      if (this.onModelChange) this.onModelChange();
    }

    render() {
      const ctx = this.ctx;
      const W = this.canvas.width;
      const H = this.canvas.height;
      ctx.clearRect(0, 0, W, H);

      if (!this.model) return;

      const { width, depth, height, layers, palette } = this.model;
      const maxDim = Math.max(width, depth);
      const cellPx = W / maxDim;
      const ox = (W - width * cellPx) * 0.5;
      const oy = (H - depth * cellPx) * 0.5;

      // Dark checkerboard backdrop inside active grid
      ctx.fillStyle = '#0e1420';
      ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < depth; y++) {
        for (let x = 0; x < width; x++) {
          ctx.fillStyle = (x + y) % 2 === 0 ? '#161e2e' : '#1b2436';
          ctx.fillRect(ox + x * cellPx, oy + y * cellPx, cellPx + 0.4, cellPx + 0.4);
        }
      }

      // Onion skin: layer below (cyan tint) & layer above (amber tint)
      if (this.onionSkin) {
        if (this.currentZ > 0) {
          const prev = layers[this.currentZ - 1];
          ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
          for (let y = 0; y < depth; y++) {
            const row = y * width;
            for (let x = 0; x < width; x++) {
              if (prev[row + x] !== 0) {
                ctx.fillRect(ox + x * cellPx, oy + y * cellPx, cellPx, cellPx);
              }
            }
          }
        }
        if (this.currentZ < height - 1) {
          const next = layers[this.currentZ + 1];
          ctx.fillStyle = 'rgba(251, 191, 36, 0.16)';
          for (let y = 0; y < depth; y++) {
            const row = y * width;
            for (let x = 0; x < width; x++) {
              if (next[row + x] !== 0) {
                ctx.fillRect(ox + x * cellPx, oy + y * cellPx, cellPx, cellPx);
              }
            }
          }
        }
      }

      // Active slice voxels
      const slice = layers[this.currentZ];
      for (let y = 0; y < depth; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
          const ci = slice[row + x];
          if (ci === 0 || !palette[ci]) continue;
          ctx.fillStyle = palette[ci].hex;
          ctx.fillRect(ox + x * cellPx, oy + y * cellPx, cellPx + 0.35, cellPx + 0.35);
        }
      }

      // Symmetry guide lines
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      if (this.symX) {
        const mx = ox + width * 0.5 * cellPx;
        ctx.beginPath();
        ctx.moveTo(mx, oy);
        ctx.lineTo(mx, oy + depth * cellPx);
        ctx.stroke();
      }
      if (this.symY) {
        const my = oy + depth * 0.5 * cellPx;
        ctx.beginPath();
        ctx.moveTo(ox, my);
        ctx.lineTo(ox + width * cellPx, my);
        ctx.stroke();
      }
      ctx.restore();

      // Hover brush cursor
      if (this.hoverCell) {
        const { x, y } = this.hoverCell;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(
          ox + x * cellPx + 0.5,
          oy + y * cellPx + 0.5,
          cellPx - 1,
          cellPx - 1
        );
      }

      // Outer grid frame
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox, oy, width * cellPx, depth * cellPx);
    }
  }

  StackStudio.SliceEditor = SliceEditor;
})(window);
