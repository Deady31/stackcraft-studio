(function (global) {
  'use strict';

  const StackStudio = (global.StackStudio = global.StackStudio || {});

  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  }

  function packRgba(r, g, b, a) {
    return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
  }

  function clampByte(v) {
    return v < 0 ? 0 : v > 255 ? 255 : v | 0;
  }

  function computeLayerBounds(model) {
    const { width, depth, height, layers } = model;
    const bounds = new Array(height);
    let totalVoxels = 0;

    for (let z = 0; z < height; z++) {
      const slice = layers[z];
      let minX = width;
      let minY = depth;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < depth; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
          if (slice[row + x] !== 0) {
            totalVoxels++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      bounds[z] = maxX >= minX ? { minX, minY, maxX, maxY } : null;
    }
    model.layerBounds = bounds;
    model.voxelCount = totalVoxels;
    return bounds;
  }

  function preparePaletteCache(model) {
    const cache = new Array(model.palette.length);
    cache[0] = null;
    for (let i = 1; i < model.palette.length; i++) {
      const entry = model.palette[i];
      if (!entry) {
        cache[i] = null;
        continue;
      }
      const rgb = hexToRgb(entry.hex);
      cache[i] = {
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        group: entry.group != null ? entry.group : i,
        emissive: Boolean(entry.emissive),
      };
    }
    model._palCache = cache;
    return cache;
  }

  class SpriteStackEngine {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });

      // Offscreen crisp low-res pixel buffer
      this.bufCanvas = document.createElement('canvas');
      this.bufCtx = this.bufCanvas.getContext('2d');
      this.bufW = 200;
      this.bufH = 200;
      this.imageData = null;
      this.u32 = null;
      this.zBuf = null;
      this.groupBuf = null;
      this.emissiveBuf = null;

      // Camera & render settings
      this.model = null;
      this.yaw = -0.45;
      this.pitch = 26; // degrees
      this.zoom = 5.4;
      this.spread = 1.0;
      this.sliceCut = 48;

      this.animMode = 'pendulum';
      this.playing = true;
      this.speed = 1.0;
      this.amplitude = 1.0;
      this.time = 0;

      this.bgMode = 'paper'; // 'paper' | 'dark' | 'blueprint'
      this.showOutline = true;
      this.showCrevice = true;
      this.showShading = true;
      this.showPedestal = true;
      this.showParticles = true;

      // Highlighted slice (when editing in split mode)
      this.highlightSlice = -1;

      // Procedural ambient particles
      this.particles = [];
      this._initParticles();

      // FPS tracking
      this.fps = 60;
      this._frames = 0;
      this._fpsTime = performance.now();

      this.resize();
    }

    _initParticles() {
      this.particles = [];
      for (let i = 0; i < 16; i++) {
        this.particles.push({
          angle: (i / 16) * Math.PI * 2 + Math.random() * 0.4,
          radius: 14 + Math.random() * 18,
          heightFrac: 0.12 + Math.random() * 0.82,
          phase: Math.random() * Math.PI * 2,
          speed: 0.6 + Math.random() * 1.1,
          size: i % 3 === 0 ? 2 : 1,
        });
      }
    }

    setModel(model, applyDefaults = true) {
      this.model = model;
      computeLayerBounds(model);
      preparePaletteCache(model);
      if (applyDefaults) {
        this.animMode = model.defaultAnim || 'turntable';
        this.yaw = model.defaultYaw != null ? model.defaultYaw : -0.45;
        this.pitch = model.defaultPitch != null ? model.defaultPitch : 26;
        this.zoom = model.defaultZoom != null ? model.defaultZoom : 3.2;
        this.spread = 1.0;
        this.sliceCut = model.height;
        this.time = 0;
      } else {
        this.sliceCut = Math.min(this.sliceCut, model.height);
      }
    }

    markModelDirty() {
      if (!this.model) return;
      computeLayerBounds(this.model);
      preparePaletteCache(this.model);
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = this.canvas.parentElement.getBoundingClientRect();
      const w = Math.max(300, Math.floor(rect.width));
      const h = Math.max(240, Math.floor(rect.height));
      this.displayW = w;
      this.displayH = h;
      this.dpr = dpr;
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this._ensureBufferSize();
    }

    _getEffectiveScale() {
      const ref = Math.min(this.displayW || 800, this.displayH || 700);
      const viewportFactor = Math.max(0.85, Math.min(1.65, ref / 680));
      return Math.max(2.0, this.zoom * viewportFactor);
    }

    _ensureBufferSize() {
      // Virtual pixel buffer scaled inversely by effective pixel scale
      const scale = this._getEffectiveScale();
      const targetW = Math.min(240, Math.max(110, Math.ceil(this.displayW / scale) + 10));
      const targetH = Math.min(230, Math.max(110, Math.ceil(this.displayH / scale) + 10));
      if (targetW !== this.bufW || targetH !== this.bufH || !this.imageData) {
        this.bufW = targetW;
        this.bufH = targetH;
        this.bufCanvas.width = targetW;
        this.bufCanvas.height = targetH;
        this.imageData = this.bufCtx.createImageData(targetW, targetH);
        this.u32 = new Uint32Array(this.imageData.data.buffer);
        const len = targetW * targetH;
        this.zBuf = new Int16Array(len);
        this.groupBuf = new Uint8Array(len);
        this.emissiveBuf = new Uint8Array(len);
      }
    }

    step(dt) {
      if (this.playing) {
        this.time += dt * this.speed;
      }
      this._frames++;
      const now = performance.now();
      if (now - this._fpsTime >= 450) {
        this.fps = Math.round((this._frames * 1000) / (now - this._fpsTime));
        this._frames = 0;
        this._fpsTime = now;
      }
    }

    _getAnimState() {
      const t = this.time;
      const amp = this.amplitude;
      const mode = this.animMode;

      let yawOffset = 0;
      let floatY = 0;
      let swingAngle = 0;
      let spreadMult = 1.0;
      let waveAmp = 0;

      if (mode === 'pendulum') {
        swingAngle = Math.sin(t * 2.15) * 0.145 * amp;
        yawOffset = Math.sin(t * 2.15 - 0.55) * 0.52 * amp;
        waveAmp = 0.35 * amp;
      } else if (mode === 'turntable') {
        yawOffset = t * 1.15 * amp;
        floatY = Math.sin(t * 2.2) * 0.6 * amp;
      } else if (mode === 'hover') {
        floatY = Math.sin(t * 2.7) * 3.4 * amp;
        yawOffset = Math.sin(t * 1.1) * 0.38 * amp;
        waveAmp = 0.2 * amp;
      } else if (mode === 'bounce') {
        const s = Math.sin(t * 3.5);
        const hop = Math.abs(s);
        floatY = hop * 6.0 * amp;
        spreadMult = 1.0 + (hop - 0.45) * 0.14 * amp;
        yawOffset = t * 0.75 * amp;
      }

      return { yawOffset, floatY, swingAngle, spreadMult, waveAmp };
    }

    render() {
      if (!this.model) return;
      this._ensureBufferSize();

      const ctx = this.ctx;
      const dpr = this.dpr;
      const W = this.displayW;
      const H = this.displayH;

      ctx.save();
      ctx.scale(dpr, dpr);

      // 1. Draw Background Grid
      this._drawBackground(ctx, W, H);

      const anim = this._getAnimState();
      const pitchRad = (this.pitch * Math.PI) / 180;
      const squashY = Math.max(0.09, Math.sin(pitchRad));
      const baseLayerStep = Math.cos(pitchRad) * this.spread * anim.spreadMult;

      // Center of stage in display coordinates
      const pixelScale = this._getEffectiveScale();
      const stageCx = W * 0.5;
      const stageCy = H * 0.56;

      // 2. Draw Circular Turntable Pedestal + Dynamic Shadow underneath
      if (this.showPedestal) {
        this._drawPedestal(ctx, stageCx, stageCy, squashY, anim, pixelScale);
      }

      // 3. Rasterize Sprite Stack into low-res pixel buffer
      this._rasterizeModel(anim, squashY, baseLayerStep);

      // 4. Composite low-res pixel buffer crisply onto main canvas
      this.bufCtx.putImageData(this.imageData, 0, 0);

      const drawW = this.bufW * pixelScale;
      const drawH = this.bufH * pixelScale;
      const drawX = Math.round(stageCx - drawW * 0.5);
      const drawY = Math.round(stageCy - drawH * 0.56);

      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.bufCanvas, drawX, drawY, drawW, drawH);

      ctx.restore();
    }

    _drawBackground(ctx, W, H) {
      let bgFill = '#e8eef5';
      let gridMinor = '#dce4ef';
      let gridMajor = '#cfd9e8';
      let vignette = 'rgba(130, 155, 190, 0.14)';

      if (this.bgMode === 'dark') {
        bgFill = '#101520';
        gridMinor = '#182032';
        gridMajor = '#222d45';
        vignette = 'rgba(0, 0, 0, 0.42)';
      } else if (this.bgMode === 'blueprint') {
        bgFill = '#12315c';
        gridMinor = 'rgba(147, 197, 253, 0.11)';
        gridMajor = 'rgba(147, 197, 253, 0.24)';
        vignette = 'rgba(4, 15, 36, 0.35)';
      }

      ctx.fillStyle = bgFill;
      ctx.fillRect(0, 0, W, H);

      const step = 22;
      const ox = (W * 0.5) % step;
      const oy = (H * 0.5) % step;

      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.strokeStyle = gridMinor;
      for (let x = ox; x < W; x += step) {
        const px = Math.floor(x) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, H);
      }
      for (let y = oy; y < H; y += step) {
        const py = Math.floor(y) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(W, py);
      }
      ctx.stroke();

      const majorStep = step * 4;
      const mox = (W * 0.5) % majorStep;
      const moy = (H * 0.5) % majorStep;
      ctx.beginPath();
      ctx.strokeStyle = gridMajor;
      for (let x = mox; x < W; x += majorStep) {
        const px = Math.floor(x) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, H);
      }
      for (let y = moy; y < H; y += majorStep) {
        const py = Math.floor(y) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(W, py);
      }
      ctx.stroke();

      // Subtle radial studio vignette
      const grad = ctx.createRadialGradient(W * 0.5, H * 0.48, Math.min(W, H) * 0.18, W * 0.5, H * 0.5, Math.max(W, H) * 0.72);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, vignette);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    _drawPedestal(ctx, cx, cy, squashY, anim, pixelScale) {
      const m = this.model;
      const baseRadius = Math.max(m.width, m.depth) * 0.54 * pixelScale;
      const rx = Math.max(54, baseRadius);
      const ry = Math.max(16, rx * squashY);
      const totalStackPx = m.height * Math.cos((this.pitch * Math.PI) / 180) * this.spread;
      const py = cy + totalStackPx * 0.30 * pixelScale + 4 * pixelScale * 0.25;

      ctx.save();

      // Soft outer floor shadow
      ctx.beginPath();
      ctx.ellipse(cx, py + 7, rx * 1.07, ry * 1.12, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.bgMode === 'paper' ? 'rgba(30, 48, 78, 0.16)' : 'rgba(0, 0, 0, 0.45)';
      ctx.fill();

      // Metallic rim thickness (3D lip)
      ctx.beginPath();
      ctx.ellipse(cx, py + 5, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#26384f';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#182233';
      ctx.stroke();

      // Top metallic ring surface
      const ringGrad = ctx.createLinearGradient(cx - rx, py - ry, cx + rx, py + ry);
      ringGrad.addColorStop(0, '#6285a8');
      ringGrad.addColorStop(0.5, '#3b5675');
      ringGrad.addColorStop(1, '#5d83aa');
      ctx.beginPath();
      ctx.ellipse(cx, py, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = ringGrad;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#182233';
      ctx.stroke();

      // Inner glowing cyan track
      ctx.beginPath();
      ctx.ellipse(cx, py, rx * 0.86, ry * 0.86, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.bgMode === 'paper' ? '#cdd9e8' : '#182234';
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#67e8f9';
      ctx.stroke();

      // Subtle inner tick marks rotating with yaw
      const totalYaw = this.yaw + anim.yawOffset;
      ctx.strokeStyle = 'rgba(103, 232, 249, 0.45)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        const a = totalYaw + (i * Math.PI) / 4;
        const x1 = cx + Math.cos(a) * rx * 0.87;
        const y1 = py + Math.sin(a) * ry * 0.87;
        const x2 = cx + Math.cos(a) * rx * 0.96;
        const y2 = py + Math.sin(a) * ry * 0.96;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // Dynamic cast shadow of object inside the pedestal
      const swingShiftX = Math.sin(anim.swingAngle) * 18 * pixelScale * 0.4;
      const shadowScale = Math.max(0.45, 1.0 - anim.floatY * 0.035);
      const srx = rx * 0.55 * shadowScale;
      const sry = ry * 0.48 * shadowScale;
      ctx.beginPath();
      ctx.ellipse(cx + swingShiftX, py + 1, srx, sry, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.bgMode === 'paper' ? 'rgba(25, 38, 60, 0.26)' : 'rgba(2, 6, 16, 0.55)';
      ctx.fill();

      ctx.restore();
    }

    _rasterizeModel(anim, squashY, layerStep) {
      const m = this.model;
      const { width, depth, height, layers, layerBounds } = m;
      const pal = m._palCache;
      const bufW = this.bufW;
      const bufH = this.bufH;
      const u32 = this.u32;
      const zBuf = this.zBuf;
      const groupBuf = this.groupBuf;
      const emissiveBuf = this.emissiveBuf;

      // Clear buffers
      u32.fill(0);
      zBuf.fill(-1);
      groupBuf.fill(0);
      emissiveBuf.fill(0);

      const maxVisibleZ = Math.min(height, this.sliceCut);
      const halfW = width * 0.5;
      const halfD = depth * 0.5;
      const totalYaw = this.yaw + anim.yawOffset;

      const baseCenterX = bufW * 0.5;
      // Anchor bottom of model cleanly onto the pedestal plane
      const totalStackPx = height * layerStep;
      const baseCenterY = bufH * 0.56 + totalStackPx * 0.30 - anim.floatY;

      const pivotZ = m.pivotZ != null ? m.pivotZ : height - 1;
      const showShading = this.showShading;
      const highlightSlice = this.highlightSlice;
      const t = this.time;

      for (let z = 0; z < maxVisibleZ; z++) {
        const b = layerBounds[z];
        if (!b) continue;

        const slice = layers[z];
        const nextSlice = z + 1 < maxVisibleZ ? layers[z + 1] : null;

        // Per-slice animation deformation
        let sliceYaw = totalYaw;
        let offsetX = 0;
        let offsetY = -z * layerStep;

        if (anim.swingAngle !== 0) {
          const dist = pivotZ - z;
          if (dist > 0) {
            offsetX += Math.sin(anim.swingAngle) * dist * 0.78;
            offsetY -= (1 - Math.cos(anim.swingAngle)) * dist * 0.5;
          }
        }
        if (anim.waveAmp > 0) {
          sliceYaw += Math.sin(t * 3.2 - z * 0.14) * 0.055 * anim.waveAmp;
        }

        const cosA = Math.cos(sliceYaw);
        const sinA = Math.sin(sliceYaw);
        const scx = baseCenterX + offsetX;
        const scy = baseCenterY + offsetY;

        // Project 4 tight bounding box corners to find screen rect
        const u0 = b.minX - halfW - 0.5;
        const u1 = b.maxX - halfW + 1.5;
        const v0 = b.minY - halfD - 0.5;
        const v1 = b.maxY - halfD + 1.5;

        const c1x = u0 * cosA - v0 * sinA;
        const c1y = (u0 * sinA + v0 * cosA) * squashY;
        const c2x = u1 * cosA - v0 * sinA;
        const c2y = (u1 * sinA + v0 * cosA) * squashY;
        const c3x = u0 * cosA - v1 * sinA;
        const c3y = (u0 * sinA + v1 * cosA) * squashY;
        const c4x = u1 * cosA - v1 * sinA;
        const c4y = (u1 * sinA + v1 * cosA) * squashY;

        let minBx = Math.floor(scx + Math.min(c1x, c2x, c3x, c4x));
        let maxBx = Math.ceil(scx + Math.max(c1x, c2x, c3x, c4x));
        let minBy = Math.floor(scy + Math.min(c1y, c2y, c3y, c4y));
        let maxBy = Math.ceil(scy + Math.max(c1y, c2y, c3y, c4y));

        if (minBx < 1) minBx = 1;
        if (maxBx > bufW - 2) maxBx = bufW - 2;
        if (minBy < 1) minBy = 1;
        if (maxBy > bufH - 2) maxBy = bufH - 2;

        // Height shading multiplier
        const heightRatio = height > 1 ? z / (height - 1) : 1;
        const heightLight = showShading ? 0.85 + heightRatio * 0.22 : 1.0;
        const invSquash = 1.0 / squashY;
        const isHighlighted = z === highlightSlice;

        for (let by = minBy; by <= maxBy; by++) {
          const dy = (by - scy) * invSquash;
          const rowBase = by * bufW;
          const dySin = dy * sinA;
          const dyCos = dy * cosA;

          for (let bx = minBx; bx <= maxBx; bx++) {
            const dx = bx - scx;
            const u = Math.floor(dx * cosA + dySin + halfW);
            if (u < b.minX || u > b.maxX) continue;
            const v = Math.floor(-dx * sinA + dyCos + halfD);
            if (v < b.minY || v > b.maxY) continue;

            const vIdx = v * width + u;
            const cIdx = slice[vIdx];
            if (cIdx === 0) continue;

            const p = pal[cIdx];
            if (!p) continue;

            const bufIdx = rowBase + bx;
            let r = p.r;
            let g = p.g;
            let bl = p.b;

            if (!p.emissive && showShading) {
              // Subtle top-surface catch light when exposed above
              const exposedTop = !nextSlice || nextSlice[vIdx] === 0;
              const mult = heightLight * (exposedTop ? 1.08 : 0.96);
              r = clampByte(r * mult);
              g = clampByte(g * mult);
              bl = clampByte(bl * mult);
            }

            if (isHighlighted) {
              r = clampByte(r * 0.65 + 90);
              g = clampByte(g * 0.65 + 150);
              bl = clampByte(bl * 0.65 + 220);
            }

            u32[bufIdx] = packRgba(r, g, bl, 255);
            zBuf[bufIdx] = z;
            groupBuf[bufIdx] = p.group;
            emissiveBuf[bufIdx] = p.emissive ? 1 : 0;
          }
        }
      }

      // Post-process Pass 1: Internal Depth & Material Crevice Outlines
      if (this.showCrevice) {
        const inkR = 24;
        const inkG = 28;
        const inkB = 44;
        for (let y = 1; y < bufH - 1; y++) {
          const row = y * bufW;
          for (let x = 1; x < bufW - 1; x++) {
            const idx = row + x;
            const z = zBuf[idx];
            if (z < 0 || emissiveBuf[idx]) continue;

            const grp = groupBuf[idx];
            // Check neighbors for foreground step or distinct foreground material
            const nUp = idx - bufW;
            const nDn = idx + bufW;
            const nLt = idx - 1;
            const nRt = idx + 1;

            let edgeStrength = 0;
            if (
              (zBuf[nUp] >= z + 3) ||
              (zBuf[nDn] >= z + 3) ||
              (zBuf[nLt] >= z + 3) ||
              (zBuf[nRt] >= z + 3)
            ) {
              edgeStrength = 0.56;
            } else if (
              (zBuf[nUp] >= z && groupBuf[nUp] !== grp) ||
              (zBuf[nDn] >= z && groupBuf[nDn] !== grp) ||
              (zBuf[nLt] >= z && groupBuf[nLt] !== grp) ||
              (zBuf[nRt] >= z && groupBuf[nRt] !== grp)
            ) {
              edgeStrength = 0.42;
            }

            if (edgeStrength > 0) {
              const col = u32[idx];
              const cr = col & 255;
              const cg = (col >> 8) & 255;
              const cb = (col >> 16) & 255;
              const keep = 1 - edgeStrength;
              u32[idx] = packRgba(
                clampByte(cr * keep + inkR * edgeStrength),
                clampByte(cg * keep + inkG * edgeStrength),
                clampByte(cb * keep + inkB * edgeStrength),
                255
              );
            }
          }
        }
      }

      // Post-process Pass 2: Crisp 1px Silhouette Pixel Outline
      if (this.showOutline) {
        const outlineColor = this.bgMode === 'dark'
          ? packRgba(12, 16, 26, 255)
          : packRgba(26, 31, 46, 255);

        for (let y = 1; y < bufH - 1; y++) {
          const row = y * bufW;
          for (let x = 1; x < bufW - 1; x++) {
            const idx = row + x;
            if (zBuf[idx] >= 0) continue;
            if (
              zBuf[idx - 1] >= 0 ||
              zBuf[idx + 1] >= 0 ||
              zBuf[idx - bufW] >= 0 ||
              zBuf[idx + bufW] >= 0
            ) {
              u32[idx] = outlineColor;
            }
          }
        }
      }

      // Post-process Pass 3: Crisp Pixel Sparkles / Theme Particles
      if (this.showParticles) {
        this._drawPixelParticles(baseCenterX, baseCenterY, totalStackPx, squashY, m.particleTheme || 'sparkles');
      }
    }

    _drawPixelParticles(cx, baseY, stackPx, squashY, theme) {
      const u32 = this.u32;
      const bufW = this.bufW;
      const bufH = this.bufH;
      const t = this.time;

      const setPx = (x, y, col) => {
        const ix = x | 0;
        const iy = y | 0;
        if (ix >= 1 && ix < bufW - 1 && iy >= 1 && iy < bufH - 1) {
          u32[iy * bufW + ix] = col;
        }
      };

      for (let i = 0; i < this.particles.length; i++) {
        const p = this.particles[i];
        const a = p.angle + t * 0.45 * p.speed;
        const r = p.radius;

        if (theme === 'sakura') {
          const fall = ((t * 0.35 * p.speed + p.phase) % 1 + 1) % 1;
          const px = cx + Math.cos(a) * r * 1.1 + Math.sin(t * 2 + p.phase) * 4;
          const py = baseY - stackPx * (1.15 - fall * 1.25);
          const col = i % 2 === 0 ? packRgba(255, 183, 210, 255) : packRgba(255, 224, 236, 255);
          setPx(px, py, col);
          setPx(px + 1, py, col);
          continue;
        }

        if (theme === 'sparks' || theme === 'runes') {
          const rise = ((t * 0.45 * p.speed + p.phase) % 1 + 1) % 1;
          const px = cx + Math.cos(a) * (r * 0.9);
          const py = baseY - stackPx * (0.1 + rise * 0.95);
          const twinkle = Math.sin(t * 6 + p.phase);
          if (twinkle < -0.25) continue;
          const col = theme === 'runes'
            ? (i % 2 === 0 ? packRgba(103, 232, 249, 255) : packRgba(196, 181, 253, 255))
            : (i % 2 === 0 ? packRgba(103, 232, 249, 255) : packRgba(253, 224, 71, 255));
          setPx(px, py, col);
          if (twinkle > 0.45) {
            setPx(px - 1, py, col);
            setPx(px + 1, py, col);
            setPx(px, py - 1, col);
            setPx(px, py + 1, col);
          }
          continue;
        }

        // Default: cute 4-point twinkling pixel sparkles (matching Ryu's tweet!)
        const twinkle = Math.sin(t * 4.2 * p.speed + p.phase);
        if (twinkle < 0.15) continue;
        const px = cx + Math.cos(a) * r;
        const py = baseY - stackPx * p.heightFrac + Math.sin(a) * r * squashY * 0.35;
        const core = packRgba(255, 252, 220, 255);
        const ray = packRgba(255, 224, 92, 255);
        const rim = packRgba(212, 165, 36, 255);

        setPx(px, py, core);
        if (twinkle > 0.45) {
          setPx(px - 1, py, ray);
          setPx(px + 1, py, ray);
          setPx(px, py - 1, ray);
          setPx(px, py + 1, ray);
        }
        if (twinkle > 0.78 && p.size >= 2) {
          setPx(px - 2, py, rim);
          setPx(px + 2, py, rim);
          setPx(px, py - 2, rim);
          setPx(px, py + 2, rim);
        }
      }
    }

    // Export all slices as a horizontal PNG sprite-sheet (standard sprite-stacking format)
    exportSpriteSheetDataURL() {
      const m = this.model;
      if (!m) return null;
      const { width, depth, height, layers } = m;
      const pal = m._palCache;
      const c = document.createElement('canvas');
      c.width = width * height;
      c.height = depth;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(c.width, c.height);
      const out = new Uint32Array(img.data.buffer);

      for (let z = 0; z < height; z++) {
        const slice = layers[z];
        const xOff = z * width;
        for (let y = 0; y < depth; y++) {
          const row = y * width;
          const outRow = y * c.width + xOff;
          for (let x = 0; x < width; x++) {
            const ci = slice[row + x];
            if (ci === 0) continue;
            const p = pal[ci];
            if (!p) continue;
            out[outRow + x] = packRgba(p.r, p.g, p.b, 255);
          }
        }
      }
      ctx.putImageData(img, 0, 0);
      return c.toDataURL('image/png');
    }

    exportSnapshotDataURL() {
      return this.canvas.toDataURL('image/png');
    }
  }

  StackStudio.SpriteStackEngine = SpriteStackEngine;
  StackStudio.computeLayerBounds = computeLayerBounds;
  StackStudio.preparePaletteCache = preparePaletteCache;
})(window);
