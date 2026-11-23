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
    const len = model.palette.length;
    const palR = new Uint8Array(len);
    const palG = new Uint8Array(len);
    const palB = new Uint8Array(len);
    const palGrp = new Uint8Array(len);
    const palEm = new Uint8Array(len);
    const cache = new Array(len);
    cache[0] = null;

    for (let i = 1; i < len; i++) {
      const entry = model.palette[i];
      if (!entry) {
        cache[i] = null;
        continue;
      }
      const rgb = hexToRgb(entry.hex);
      palR[i] = rgb.r;
      palG[i] = rgb.g;
      palB[i] = rgb.b;
      palGrp[i] = entry.group != null ? entry.group & 255 : i & 255;
      palEm[i] = entry.emissive ? 1 : 0;
      cache[i] = {
        r: rgb.r,
        g: rgb.g,
        b: rgb.b,
        group: palGrp[i],
        emissive: Boolean(entry.emissive),
      };
    }
    model._palCache = cache;
    model._palR = palR;
    model._palG = palG;
    model._palB = palB;
    model._palGrp = palGrp;
    model._palEm = palEm;
    return cache;
  }

  class SpriteStackEngine {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });

      // Offscreen virtual pixel buffer (scales up cleanly for HD 96-112px models!)
      this.bufCanvas = document.createElement('canvas');
      this.bufCtx = this.bufCanvas.getContext('2d');
      this.bufW = 240;
      this.bufH = 240;
      this.imageData = null;
      this.u32 = null;
      this.zBuf = null;
      this.groupBuf = null;
      this.emissiveBuf = null;
      this.depthBuf = null; // screen-facing depth for directional 3D cel-shading!

      // Camera & render settings
      this.model = null;
      this.yaw = -0.45;
      this.pitch = 24;
      this.zoom = 5.0;
      this.spread = 1.0;
      this.sliceCut = 96;

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
      this.smoothDisplay = false; // Crisp pixel art by default; optional smooth HD scaling

      this.highlightSlice = -1;

      this.particles = [];
      this._initParticles();

      this.fps = 60;
      this._frames = 0;
      this._fpsTime = performance.now();

      this.resize();
    }

    _initParticles() {
      this.particles = [];
      for (let i = 0; i < 18; i++) {
        this.particles.push({
          angle: (i / 18) * Math.PI * 2 + Math.random() * 0.4,
          radiusFrac: 0.46 + Math.random() * 0.36,
          heightFrac: 0.14 + Math.random() * 0.80,
          phase: Math.random() * Math.PI * 2,
          speed: 0.6 + Math.random() * 1.05,
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
        this.pitch = model.defaultPitch != null ? model.defaultPitch : 24;
        this.zoom = model.defaultZoom != null ? model.defaultZoom : this._autoZoomFor(model);
        this.spread = 1.0;
        this.sliceCut = model.height;
        this.time = 0;
      } else {
        this.sliceCut = Math.min(this.sliceCut, model.height);
      }
      this._ensureBufferSize();
    }

    _autoZoomFor(model) {
      const maxSpan = Math.max(model.width, model.depth, model.height);
      return Math.max(2.2, Math.min(6.2, +(260 / Math.max(32, maxSpan)).toFixed(1)));
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
      return Math.max(1.5, this.zoom * viewportFactor);
    }

    _ensureBufferSize() {
      const scale = this._getEffectiveScale();
      // Allow higher virtual resolution (up to 420x380) so HD 96-112px models never clip!
      const minNeed = this.model
        ? Math.ceil(Math.max(this.model.width, this.model.depth, this.model.height) * 1.65)
        : 140;
      const targetW = Math.min(420, Math.max(minNeed, Math.min(340, Math.ceil(this.displayW / scale) + 12)));
      const targetH = Math.min(380, Math.max(minNeed, Math.min(320, Math.ceil(this.displayH / scale) + 12)));

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
        this.depthBuf = new Int16Array(len);
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
      const hScale = this.model ? this.model.height / 44 : 1;

      let yawOffset = 0;
      let floatY = 0;
      let swingAngle = 0;
      let spreadMult = 1.0;
      let waveAmp = 0;

      if (mode === 'pendulum') {
        swingAngle = Math.sin(t * 2.15) * 0.14 * amp;
        yawOffset = Math.sin(t * 2.15 - 0.55) * 0.48 * amp;
        waveAmp = 0.3 * amp;
      } else if (mode === 'turntable') {
        yawOffset = t * 1.15 * amp;
        floatY = Math.sin(t * 2.2) * 0.7 * hScale * amp;
      } else if (mode === 'hover') {
        floatY = Math.sin(t * 2.7) * 3.4 * hScale * amp;
        yawOffset = Math.sin(t * 1.1) * 0.38 * amp;
        waveAmp = 0.18 * amp;
      } else if (mode === 'bounce') {
        const hop = Math.abs(Math.sin(t * 3.5));
        floatY = hop * 5.8 * hScale * amp;
        spreadMult = 1.0 + (hop - 0.45) * 0.13 * amp;
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

      this._drawBackground(ctx, W, H);

      const anim = this._getAnimState();
      const pitchRad = (this.pitch * Math.PI) / 180;
      const squashY = Math.max(0.09, Math.sin(pitchRad));
      const baseLayerStep = Math.cos(pitchRad) * this.spread * anim.spreadMult;

      const pixelScale = this._getEffectiveScale();
      const stageCx = W * 0.5;
      const stageCy = H * 0.56;

      if (this.showPedestal) {
        this._drawPedestal(ctx, stageCx, stageCy, squashY, anim, pixelScale);
      }

      this._rasterizeModel(anim, squashY, baseLayerStep);

      this.bufCtx.putImageData(this.imageData, 0, 0);

      const drawW = this.bufW * pixelScale;
      const drawH = this.bufH * pixelScale;
      const drawX = Math.round(stageCx - drawW * 0.5);
      const drawY = Math.round(stageCy - drawH * 0.56);

      ctx.imageSmoothingEnabled = this.smoothDisplay;
      if (this.smoothDisplay) {
        ctx.imageSmoothingQuality = 'high';
      }
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

      const grad = ctx.createRadialGradient(
        W * 0.5,
        H * 0.48,
        Math.min(W, H) * 0.18,
        W * 0.5,
        H * 0.5,
        Math.max(W, H) * 0.72
      );
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, vignette);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    _drawPedestal(ctx, cx, cy, squashY, anim, pixelScale) {
      const m = this.model;
      const baseRadius = Math.max(m.width, m.depth) * 0.54 * pixelScale;
      const rx = Math.max(58, baseRadius);
      const ry = Math.max(16, rx * squashY);
      const totalStackPx = m.height * Math.cos((this.pitch * Math.PI) / 180) * this.spread;
      const py = cy + totalStackPx * 0.30 * pixelScale + 4 * pixelScale * 0.25;

      ctx.save();

      ctx.beginPath();
      ctx.ellipse(cx, py + 7, rx * 1.07, ry * 1.12, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.bgMode === 'paper' ? 'rgba(30, 48, 78, 0.16)' : 'rgba(0, 0, 0, 0.45)';
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(cx, py + 5, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#26384f';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#182233';
      ctx.stroke();

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

      ctx.beginPath();
      ctx.ellipse(cx, py, rx * 0.86, ry * 0.86, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.bgMode === 'paper' ? '#cdd9e8' : '#182234';
      ctx.fill();
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = '#67e8f9';
      ctx.stroke();

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

      const swingShiftX = Math.sin(anim.swingAngle) * (m.height * 0.42) * pixelScale * 0.42;
      const hNorm = anim.floatY / Math.max(1, m.height);
      const shadowScale = Math.max(0.45, 1.0 - hNorm * 1.4);
      const srx = rx * 0.55 * shadowScale;
      const sry = ry * 0.48 * shadowScale;
      ctx.beginPath();
      ctx.ellipse(cx + swingShiftX, py + 1, srx, sry, 0, 0, Math.PI * 2);
      ctx.fillStyle = this.bgMode === 'paper' ? 'rgba(25, 38, 60, 0.25)' : 'rgba(2, 6, 16, 0.55)';
      ctx.fill();

      ctx.restore();
    }

    _rasterizeModel(anim, squashY, layerStep) {
      const m = this.model;
      const { width, depth, height, layers, layerBounds } = m;
      const palR = m._palR;
      const palG = m._palG;
      const palB = m._palB;
      const palGrp = m._palGrp;
      const palEm = m._palEm;

      const bufW = this.bufW;
      const bufH = this.bufH;
      const u32 = this.u32;
      const zBuf = this.zBuf;
      const groupBuf = this.groupBuf;
      const emissiveBuf = this.emissiveBuf;
      const depthBuf = this.depthBuf;

      u32.fill(0);
      zBuf.fill(-1);
      groupBuf.fill(0);
      emissiveBuf.fill(0);
      depthBuf.fill(-32000);

      const maxVisibleZ = Math.min(height, this.sliceCut);
      const halfW = width * 0.5;
      const halfD = depth * 0.5;
      const totalYaw = this.yaw + anim.yawOffset;

      const baseCenterX = bufW * 0.5;
      const totalStackPx = height * layerStep;
      const baseCenterY = bufH * 0.56 + totalStackPx * 0.30 - anim.floatY;

      const pivotZ = m.pivotZ != null ? m.pivotZ : height - 1;
      const showShading = this.showShading;
      const highlightSlice = this.highlightSlice;
      const t = this.time;
      const invSquash = 1.0 / squashY;
      const maxZ = Math.max(1, height - 1);

      for (let z = 0; z < maxVisibleZ; z++) {
        const b = layerBounds[z];
        if (!b) continue;

        const slice = layers[z];
        const nextSlice = z + 1 < maxVisibleZ ? layers[z + 1] : null;

        let sliceYaw = totalYaw;
        let offsetX = 0;
        let offsetY = -z * layerStep;

        if (anim.swingAngle !== 0) {
          const dist = pivotZ - z;
          if (dist > 0) {
            offsetX += Math.sin(anim.swingAngle) * dist * 0.76;
            offsetY -= (1 - Math.cos(anim.swingAngle)) * dist * 0.48;
          }
        }
        if (anim.waveAmp > 0) {
          sliceYaw += Math.sin(t * 3.2 - z * (6.2 / height)) * 0.05 * anim.waveAmp;
        }

        const cosA = Math.cos(sliceYaw);
        const sinA = Math.sin(sliceYaw);
        const scx = baseCenterX + offsetX;
        const scy = baseCenterY + offsetY;

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

        const heightRatio = z / maxZ;
        const heightLight = showShading ? 0.87 + heightRatio * 0.19 : 1.0;
        const isHighlighted = z === highlightSlice;
        const bMinX = b.minX;
        const bMaxX = b.maxX;
        const bMinY = b.minY;
        const bMaxY = b.maxY;

        for (let by = minBy; by <= maxBy; by++) {
          const dy = (by - scy) * invSquash;
          const rowBase = by * bufW;
          const dySin = dy * sinA + halfW;
          const dyCos = dy * cosA + halfD;
          // Screen-facing depth metric (higher = closer to viewer)
          const camDepth = (dy * 10 + z * 6) | 0;

          for (let bx = minBx; bx <= maxBx; bx++) {
            const dx = bx - scx;
            const u = (dx * cosA + dySin) | 0;
            if (u < bMinX || u > bMaxX) continue;
            const v = (-dx * sinA + dyCos) | 0;
            if (v < bMinY || v > bMaxY) continue;

            const vIdx = v * width + u;
            const cIdx = slice[vIdx];
            if (cIdx === 0) continue;

            const bufIdx = rowBase + bx;
            let r = palR[cIdx];
            let g = palG[cIdx];
            let bl = palB[cIdx];
            const em = palEm[cIdx];

            if (!em && showShading) {
              const exposedTop = !nextSlice || nextSlice[vIdx] === 0;
              const mult = heightLight * (exposedTop ? 1.07 : 0.97);
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
            groupBuf[bufIdx] = palGrp[cIdx];
            emissiveBuf[bufIdx] = em;
            depthBuf[bufIdx] = camDepth;
          }
        }
      }

      // Post-process Pass 0: Screen-Space 3D Directional Cel-Shading & Soft Rim Light!
      if (showShading) {
        for (let y = 1; y < bufH - 1; y++) {
          const row = y * bufW;
          for (let x = 1; x < bufW - 1; x++) {
            const idx = row + x;
            const z = zBuf[idx];
            if (z < 0 || emissiveBuf[idx]) continue;

            const dC = depthBuf[idx];
            const dL = zBuf[idx - 1] >= 0 ? depthBuf[idx - 1] : dC - 18;
            const dR = zBuf[idx + 1] >= 0 ? depthBuf[idx + 1] : dC - 18;
            const dU = zBuf[idx - bufW] >= 0 ? depthBuf[idx - bufW] : dC - 18;
            const dD = zBuf[idx + bufW] >= 0 ? depthBuf[idx + bufW] : dC - 18;

            // Approximate 3D surface slope facing top-left key light (-0.65, -0.75)
            const gx = dR - dL;
            const gy = dD - dU;
            const lightDot = (-gx * 0.55 - gy * 0.65) * 0.012;

            // Subtle crisp cel-shading ramp + gentle top-left rim light on silhouette edge
            let shade = 1.0;
            if (lightDot > 0.14) shade = 1.09;
            else if (lightDot > 0.04) shade = 1.03;
            else if (lightDot < -0.16) shade = 0.86;
            else if (lightDot < -0.05) shade = 0.93;

            const isTopEdge = zBuf[idx - bufW] < 0 || zBuf[idx - 1] < 0;
            if (isTopEdge && lightDot >= -0.02) {
              shade += 0.06; // subtle rim highlight
            }

            if (shade !== 1.0) {
              const col = u32[idx];
              const cr = col & 255;
              const cg = (col >> 8) & 255;
              const cb = (col >> 16) & 255;
              // Slightly warm highlight, slightly cool shadow
              const nr = clampByte(cr * shade);
              const ng = clampByte(cg * shade);
              const nb = clampByte(cb * (shade < 1 ? shade + 0.035 : shade));
              u32[idx] = packRgba(nr, ng, nb, 255);
            }
          }
        }
      }

      // Post-process Pass 1: Internal Depth & Material Crevice Outlines
      if (this.showCrevice) {
        const inkR = 24;
        const inkG = 28;
        const inkB = 44;
        // Scale depth-jump threshold with model height so HD models stay crisp & clean!
        const zJump = Math.max(3, Math.round(height * 0.075));

        for (let y = 1; y < bufH - 1; y++) {
          const row = y * bufW;
          for (let x = 1; x < bufW - 1; x++) {
            const idx = row + x;
            const z = zBuf[idx];
            if (z < 0 || emissiveBuf[idx]) continue;

            const grp = groupBuf[idx];
            const nUp = idx - bufW;
            const nDn = idx + bufW;
            const nLt = idx - 1;
            const nRt = idx + 1;

            let edgeStrength = 0;
            if (
              zBuf[nUp] >= z + zJump ||
              zBuf[nDn] >= z + zJump ||
              zBuf[nLt] >= z + zJump ||
              zBuf[nRt] >= z + zJump
            ) {
              edgeStrength = 0.54;
            } else if (
              // Only outline distinct material groups (keep rich HD image palettes clean!)
              m.palette.length <= 28 && (
                (zBuf[nUp] >= z && groupBuf[nUp] !== grp) ||
                (zBuf[nDn] >= z && groupBuf[nDn] !== grp) ||
                (zBuf[nLt] >= z && groupBuf[nLt] !== grp) ||
                (zBuf[nRt] >= z && groupBuf[nRt] !== grp)
              )
            ) {
              edgeStrength = 0.38;
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
        const outlineColor =
          this.bgMode === 'dark'
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
        const radiusBase = Math.max(width, depth) * 0.72;
        this._drawPixelParticles(
          baseCenterX,
          baseCenterY,
          totalStackPx,
          radiusBase,
          squashY,
          m.particleTheme || 'sparkles'
        );
      }
    }

    _drawPixelParticles(cx, baseY, stackPx, radiusBase, squashY, theme) {
      const u32 = this.u32;
      const bufW = this.bufW;
      const bufH = this.bufH;
      const t = this.time;
      const pScale = radiusBase > 42 ? 2 : 1;

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
        const r = p.radiusFrac * radiusBase;

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
          const col =
            theme === 'runes'
              ? i % 2 === 0
                ? packRgba(103, 232, 249, 255)
                : packRgba(196, 181, 253, 255)
              : i % 2 === 0
                ? packRgba(103, 232, 249, 255)
                : packRgba(253, 224, 71, 255);
          setPx(px, py, col);
          if (twinkle > 0.45) {
            setPx(px - 1, py, col);
            setPx(px + 1, py, col);
            setPx(px, py - 1, col);
            setPx(px, py + 1, col);
          }
          continue;
        }

        const twinkle = Math.sin(t * 4.2 * p.speed + p.phase);
        if (twinkle < 0.15) continue;
        const px = cx + Math.cos(a) * r;
        const py = baseY - stackPx * p.heightFrac + Math.sin(a) * r * squashY * 0.35;
        const core = packRgba(255, 252, 224, 255);
        const ray = packRgba(255, 224, 92, 255);
        const rim = packRgba(218, 168, 36, 255);

        setPx(px, py, core);
        if (twinkle > 0.42) {
          for (let d = 1; d <= pScale; d++) {
            setPx(px - d, py, ray);
            setPx(px + d, py, ray);
            setPx(px, py - d, ray);
            setPx(px, py + d, ray);
          }
        }
        if (twinkle > 0.74 && p.size >= 2) {
          const d2 = pScale + 1;
          setPx(px - d2, py, rim);
          setPx(px + d2, py, rim);
          setPx(px, py - d2, rim);
          setPx(px, py + d2, rim);
        }
      }
    }

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
