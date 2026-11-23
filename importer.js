(function (global) {
  'use strict';

  const StackStudio = (global.StackStudio = global.StackStudio || {});

  function rgbToHex(r, g, b) {
    const toHex = (n) => Math.max(0, Math.min(255, n | 0)).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }

  function colorDistSq(r1, g1, b1, r2, g2, b2) {
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
  }

  function getWorkingPixels(img, maxDim = 320) {
    const natW = img.naturalWidth || img.width;
    const natH = img.naturalHeight || img.height;
    const scale = Math.min(1, maxDim / Math.max(natW, natH));
    const w = Math.max(8, Math.round(natW * scale));
    const h = Math.max(8, Math.round(natH * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return { w, h, data: ctx.getImageData(0, 0, w, h).data };
  }

  function floodEraseFromPoint(rgba, mask, w, h, startX, startY, tolSq) {
    const sx = Math.max(0, Math.min(w - 1, startX | 0));
    const sy = Math.max(0, Math.min(h - 1, startY | 0));
    const sIdx = sy * w + sx;
    if (!mask[sIdx]) return;

    const sr = rgba[sIdx * 4];
    const sg = rgba[sIdx * 4 + 1];
    const sb = rgba[sIdx * 4 + 2];

    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let qHead = 0;
    let qTail = 0;

    visited[sIdx] = 1;
    mask[sIdx] = 0;
    queue[qTail++] = sIdx;

    while (qHead < qTail) {
      const idx = queue[qHead++];
      const x = idx % w;
      const y = (idx / w) | 0;
      const cr = rgba[idx * 4];
      const cg = rgba[idx * 4 + 1];
      const cb = rgba[idx * 4 + 2];

      const tryN = (nIdx) => {
        if (visited[nIdx] || !mask[nIdx]) return;
        const nr = rgba[nIdx * 4];
        const ng = rgba[nIdx * 4 + 1];
        const nb = rgba[nIdx * 4 + 2];
        if (
          colorDistSq(nr, ng, nb, sr, sg, sb) <= tolSq ||
          colorDistSq(nr, ng, nb, cr, cg, cb) <= tolSq * 0.42
        ) {
          visited[nIdx] = 1;
          mask[nIdx] = 0;
          queue[qTail++] = nIdx;
        }
      };

      if (x > 0) tryN(idx - 1);
      if (x < w - 1) tryN(idx + 1);
      if (y > 0) tryN(idx - w);
      if (y < h - 1) tryN(idx + w);
    }
  }

  function computeForegroundMask(rgba, w, h, removeBg, tolerance) {
    const mask = new Uint8Array(w * h);
    let transparentCount = 0;

    for (let i = 0; i < w * h; i++) {
      if (rgba[i * 4 + 3] >= 110) {
        mask[i] = 1;
      } else {
        transparentCount++;
      }
    }

    let borderTrans = 0;
    const borderTotal = w * 2 + h * 2;
    for (let x = 0; x < w; x++) {
      if (!mask[x]) borderTrans++;
      if (!mask[(h - 1) * w + x]) borderTrans++;
    }
    for (let y = 0; y < h; y++) {
      if (!mask[y * w]) borderTrans++;
      if (!mask[y * w + (w - 1)]) borderTrans++;
    }

    if (!removeBg || borderTrans > borderTotal * 0.25 || transparentCount > w * h * 0.12) {
      return mask;
    }

    const seeds = [
      0,
      w - 1,
      (h - 1) * w,
      (h - 1) * w + (w - 1),
      Math.floor(w * 0.5),
      (h - 1) * w + Math.floor(w * 0.5),
    ];

    const tolSq = tolerance * tolerance * 1.15;
    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let qHead = 0;
    let qTail = 0;

    const seedColors = seeds.map((idx) => [rgba[idx * 4], rgba[idx * 4 + 1], rgba[idx * 4 + 2]]);
    const matchesSeed = (idx) => {
      const r = rgba[idx * 4];
      const g = rgba[idx * 4 + 1];
      const b = rgba[idx * 4 + 2];
      for (let s = 0; s < seedColors.length; s++) {
        const sc = seedColors[s];
        if (colorDistSq(r, g, b, sc[0], sc[1], sc[2]) <= tolSq) return true;
      }
      return false;
    };

    const enqueue = (idx) => {
      if (!visited[idx] && mask[idx] && matchesSeed(idx)) {
        visited[idx] = 1;
        mask[idx] = 0;
        queue[qTail++] = idx;
      }
    };

    for (let x = 0; x < w; x++) {
      enqueue(x);
      enqueue((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      enqueue(y * w);
      enqueue(y * w + (w - 1));
    }

    while (qHead < qTail) {
      const idx = queue[qHead++];
      const x = idx % w;
      const y = (idx / w) | 0;
      const cr = rgba[idx * 4];
      const cg = rgba[idx * 4 + 1];
      const cb = rgba[idx * 4 + 2];

      const tryNeighbor = (nIdx) => {
        if (visited[nIdx] || !mask[nIdx]) return;
        const nr = rgba[nIdx * 4];
        const ng = rgba[nIdx * 4 + 1];
        const nb = rgba[nIdx * 4 + 2];
        if (matchesSeed(nIdx) || colorDistSq(cr, cg, cb, nr, ng, nb) <= tolSq * 0.45) {
          visited[nIdx] = 1;
          mask[nIdx] = 0;
          queue[qTail++] = nIdx;
        }
      };

      if (x > 0) tryNeighbor(idx - 1);
      if (x < w - 1) tryNeighbor(idx + 1);
      if (y > 0) tryNeighbor(idx - w);
      if (y < h - 1) tryNeighbor(idx + w);
    }

    return mask;
  }

  function downsampleSubject(rgba, mask, w, h, targetSize, extraEraseSeeds, tolerance) {
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (mask[row + x]) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX < minX) {
      minX = 0; minY = 0; maxX = w - 1; maxY = h - 1;
      mask.fill(1);
    }

    // Apply user magic-wand clicks mapped into the cropped subject box!
    if (extraEraseSeeds && extraEraseSeeds.length > 0) {
      const tolSq = Math.max(14, tolerance) * Math.max(14, tolerance) * 1.15;
      const cropW0 = maxX - minX + 1;
      const cropH0 = maxY - minY + 1;
      for (let s = 0; s < extraEraseSeeds.length; s++) {
        const pt = extraEraseSeeds[s];
        const wx = Math.round(minX + pt.nx * (cropW0 - 1));
        const wy = Math.round(minY + pt.ny * (cropH0 - 1));
        floodEraseFromPoint(rgba, mask, w, h, wx, wy, tolSq);
      }
    }

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;
    const scale = targetSize / Math.max(cropW, cropH);
    const outW = Math.max(6, Math.round(cropW * scale));
    const outH = Math.max(6, Math.round(cropH * scale));

    const outR = new Uint8Array(outW * outH);
    const outG = new Uint8Array(outW * outH);
    const outB = new Uint8Array(outW * outH);
    const outMask = new Uint8Array(outW * outH);

    for (let oy = 0; oy < outH; oy++) {
      const sy0 = minY + (oy / outH) * cropH;
      const sy1 = minY + ((oy + 1) / outH) * cropH;
      const iy0 = Math.max(0, Math.floor(sy0));
      const iy1 = Math.min(h - 1, Math.floor(sy1));

      for (let ox = 0; ox < outW; ox++) {
        const sx0 = minX + (ox / outW) * cropW;
        const sx1 = minX + ((ox + 1) / outW) * cropW;
        const ix0 = Math.max(0, Math.floor(sx0));
        const ix1 = Math.min(w - 1, Math.floor(sx1));

        let rSum = 0, gSum = 0, bSum = 0, fgCount = 0, totalCount = 0;
        for (let sy = iy0; sy <= iy1; sy++) {
          const sRow = sy * w;
          for (let sx = ix0; sx <= ix1; sx++) {
            const sIdx = sRow + sx;
            totalCount++;
            if (mask[sIdx]) {
              fgCount++;
              rSum += rgba[sIdx * 4];
              gSum += rgba[sIdx * 4 + 1];
              bSum += rgba[sIdx * 4 + 2];
            }
          }
        }

        const oIdx = oy * outW + ox;
        if (fgCount > 0 && fgCount >= totalCount * 0.42) {
          outMask[oIdx] = 1;
          outR[oIdx] = Math.round(rSum / fgCount);
          outG[oIdx] = Math.round(gSum / fgCount);
          outB[oIdx] = Math.round(bSum / fgCount);
        }
      }
    }

    // Despeckle isolated 1px noise
    const cleaned = new Uint8Array(outMask);
    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const i = y * outW + x;
        if (!outMask[i]) continue;
        let neighbors = 0;
        if (x > 0 && outMask[i - 1]) neighbors++;
        if (x < outW - 1 && outMask[i + 1]) neighbors++;
        if (y > 0 && outMask[i - outW]) neighbors++;
        if (y < outH - 1 && outMask[i + outW]) neighbors++;
        if (neighbors === 0) cleaned[i] = 0;
      }
    }

    return { outW, outH, outR, outG, outB, outMask: cleaned };
  }

  // Fast O(N log K) Median-Cut Color Quantization (handles 112x112 & 96+ colors in < 8ms!)
  function quantizeMedianCut(outR, outG, outB, outMask, count, maxColors) {
    const fgIndices = [];
    for (let i = 0; i < count; i++) {
      if (outMask[i]) fgIndices.push(i);
    }
    if (fgIndices.length === 0) {
      return { palette: [null, { hex: '#38bdf8', group: 1 }], indices: new Uint8Array(count) };
    }

    const K = Math.min(240, Math.min(maxColors, Math.max(2, fgIndices.length)));

    function makeBox(items) {
      let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
      for (let i = 0; i < items.length; i++) {
        const idx = items[i];
        const r = outR[idx], g = outG[idx], b = outB[idx];
        if (r < rMin) rMin = r;
        if (r > rMax) rMax = r;
        if (g < gMin) gMin = g;
        if (g > gMax) gMax = g;
        if (b < bMin) bMin = b;
        if (b > bMax) bMax = b;
      }
      const rSpan = (rMax - rMin) * 1.05;
      const gSpan = (gMax - gMin) * 1.25;
      const bSpan = (bMax - bMin) * 0.90;
      const maxSpan = Math.max(rSpan, gSpan, bSpan);
      const axis = maxSpan === gSpan ? 1 : maxSpan === rSpan ? 0 : 2;
      // Score mixes color spread and pixel volume so small eye/highlight accents stay sharp!
      const score = maxSpan * Math.pow(items.length, 0.35);
      return { items, axis, maxSpan, score };
    }

    const boxes = [makeBox(fgIndices)];

    while (boxes.length < K) {
      let bestIdx = -1;
      let bestScore = -1;
      for (let i = 0; i < boxes.length; i++) {
        if (boxes[i].items.length > 1 && boxes[i].maxSpan > 6 && boxes[i].score > bestScore) {
          bestScore = boxes[i].score;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) break;

      const box = boxes.splice(bestIdx, 1)[0];
      const axis = box.axis;
      const arr = box.items;
      arr.sort((a, b) =>
        axis === 0 ? outR[a] - outR[b] : axis === 1 ? outG[a] - outG[b] : outB[a] - outB[b]
      );
      const mid = arr.length >> 1;
      boxes.push(makeBox(arr.slice(0, mid)));
      boxes.push(makeBox(arr.slice(mid)));
    }

    const palette = [null];
    const indices = new Uint8Array(count);

    for (let b = 0; b < boxes.length; b++) {
      const items = boxes[b].items;
      let sR = 0, sG = 0, sB = 0;
      for (let i = 0; i < items.length; i++) {
        const idx = items[i];
        sR += outR[idx];
        sG += outG[idx];
        sB += outB[idx];
      }
      const r = Math.round(sR / items.length);
      const g = Math.round(sG / items.length);
      const bl = Math.round(sB / items.length);

      // Subtle vibrancy lift for crisp pixel-art look
      const avg = (r + g + bl) / 3;
      const boost = 1.06;
      const br = Math.max(0, Math.min(255, Math.round(avg + (r - avg) * boost)));
      const bg = Math.max(0, Math.min(255, Math.round(avg + (g - avg) * boost)));
      const bb = Math.max(0, Math.min(255, Math.round(avg + (bl - avg) * boost)));

      const palIdx = b + 1;
      palette.push({ hex: rgbToHex(br, bg, bb), group: palIdx });
      for (let i = 0; i < items.length; i++) {
        indices[items[i]] = palIdx;
      }
    }

    return { palette, indices };
  }

  function computeDistanceTransform(mask, w, h) {
    const dist = new Float32Array(w * h);
    const INF = 1e6;
    for (let i = 0; i < w * h; i++) {
      dist[i] = mask[i] ? INF : 0;
    }

    for (let x = 0; x < w; x++) {
      if (mask[x]) dist[x] = 1;
      if (mask[(h - 1) * w + x]) dist[(h - 1) * w + x] = 1;
    }
    for (let y = 0; y < h; y++) {
      if (mask[y * w]) dist[y * w] = 1;
      if (mask[y * w + (w - 1)]) dist[y * w + (w - 1)] = 1;
    }

    for (let y = 1; y < h - 1; y++) {
      const row = y * w;
      for (let x = 1; x < w - 1; x++) {
        const i = row + x;
        if (dist[i] === 0) continue;
        let d = dist[i];
        d = Math.min(d, dist[i - 1] + 1);
        d = Math.min(d, dist[i - w] + 1);
        d = Math.min(d, dist[i - w - 1] + 1.414);
        d = Math.min(d, dist[i - w + 1] + 1.414);
        dist[i] = d;
      }
    }
    for (let y = h - 2; y >= 1; y--) {
      const row = y * w;
      for (let x = w - 2; x >= 1; x--) {
        const i = row + x;
        if (dist[i] === 0) continue;
        let d = dist[i];
        d = Math.min(d, dist[i + 1] + 1);
        d = Math.min(d, dist[i + w] + 1);
        d = Math.min(d, dist[i + w - 1] + 1.414);
        d = Math.min(d, dist[i + w + 1] + 1.414);
        dist[i] = d;
      }
    }

    let maxD = 1;
    for (let i = 0; i < w * h; i++) {
      if (dist[i] > maxD && dist[i] < INF * 0.5) maxD = dist[i];
    }
    return { dist, maxD };
  }

  // Compute clean dominant back color per horizontal row (so faces don't repeat on the back of heads!)
  function computeSmartBackColors(indices, outMask, outW, outH, paletteLen) {
    const rowBackColor = new Uint8Array(outH);
    const counts = new Int32Array(paletteLen + 1);

    for (let y = 0; y < outH; y++) {
      counts.fill(0);
      // Find row horizontal span
      let rowMinX = outW, rowMaxX = -1;
      for (let x = 0; x < outW; x++) {
        if (outMask[y * outW + x]) {
          if (x < rowMinX) rowMinX = x;
          if (x > rowMaxX) rowMaxX = x;
        }
      }
      if (rowMaxX < rowMinX) continue;
      const span = Math.max(1, rowMaxX - rowMinX);

      // Weight outer border pixels (hair/hood/shoulders/clothes) higher than center facial features!
      const y0 = Math.max(0, y - 3);
      const y1 = Math.min(outH - 1, y + 3);
      for (let sy = y0; sy <= y1; sy++) {
        const row = sy * outW;
        for (let sx = rowMinX; sx <= rowMaxX; sx++) {
          const ci = indices[row + sx];
          if (!ci) continue;
          const rel = (sx - rowMinX) / span; // 0..1 across silhouette
          const edgeWeight = rel < 0.28 || rel > 0.72 ? 4 : 1;
          counts[ci] += edgeWeight;
        }
      }

      let bestC = 0;
      let bestCnt = 0;
      for (let c = 1; c < paletteLen; c++) {
        if (counts[c] > bestCnt) {
          bestCnt = counts[c];
          bestC = c;
        }
      }
      rowBackColor[y] = bestC;
    }

    return rowBackColor;
  }

  function imageToSpriteStack(img, options) {
    const opts = Object.assign(
      {
        name: 'Mon Perso HD',
        resolution: 76,
        colors: 36,
        depthScale: 18,
        mode: 'puffy',
        orientation: 'standing',
        removeBg: true,
        bgTolerance: 36,
        smartBack: true,
        extraEraseSeeds: [],
      },
      options || {}
    );

    const { w, h, data } = getWorkingPixels(img, 320);
    const rawMask = computeForegroundMask(data, w, h, opts.removeBg, opts.bgTolerance);
    const { outW, outH, outR, outG, outB, outMask } = downsampleSubject(
      data,
      rawMask,
      w,
      h,
      opts.resolution,
      opts.extraEraseSeeds,
      opts.bgTolerance
    );
    const { palette, indices } = quantizeMedianCut(
      outR,
      outG,
      outB,
      outMask,
      outW * outH,
      opts.colors
    );
    const { dist, maxD } = computeDistanceTransform(outMask, outW, outH);

    // Scale 3D depth proportionally with resolution so HD models stay nicely plump!
    const effDepth = Math.max(4, Math.round(opts.depthScale * (opts.resolution / 44)));
    const maxHalf = Math.max(1.5, effDepth * 0.5);
    const halfThick = new Float32Array(outW * outH);

    for (let i = 0; i < outW * outH; i++) {
      if (!outMask[i]) continue;
      const dn = Math.min(1, dist[i] / Math.max(1, maxD));
      const lum = (outR[i] * 0.299 + outG[i] * 0.587 + outB[i] * 0.114) / 255;

      if (opts.mode === 'bevel') {
        const edge = Math.min(1, dist[i] / Math.max(2.2, opts.resolution * 0.06));
        halfThick[i] = Math.max(1.0, maxHalf * (0.45 + 0.55 * edge));
      } else if (opts.mode === 'relief') {
        const dome = Math.sqrt(Math.max(0.06, 1 - (1 - dn) * (1 - dn)));
        halfThick[i] = Math.max(1.0, maxHalf * dome * (0.72 + 0.42 * lum));
      } else {
        const dome = Math.sqrt(Math.max(0.05, 1 - Math.pow(1 - dn, 2.2)));
        halfThick[i] = Math.max(1.0, maxHalf * dome);
      }
    }

    let volW, volD, volH, layers;

    if (opts.mode === 'lathe') {
      volW = outW + 2;
      volD = outW + 2;
      volH = outH;
      layers = new Array(volH);
      const cx = (volW - 1) * 0.5;
      const cy = (volD - 1) * 0.5;
      const srcCx = (outW - 1) * 0.5;

      for (let z = 0; z < volH; z++) {
        const sy = outH - 1 - z;
        const sl = new Uint8Array(volW * volD);
        let maxR = 0;
        for (let sx = 0; sx < outW; sx++) {
          if (outMask[sy * outW + sx]) {
            const r = Math.abs(sx - srcCx);
            if (r > maxR) maxR = r;
          }
        }
        if (maxR > 0) {
          for (let y = 0; y < volD; y++) {
            const dy = y - cy;
            const row = y * volW;
            for (let x = 0; x < volW; x++) {
              const dx = x - cx;
              const r = Math.hypot(dx, dy);
              if (r <= maxR + 0.35) {
                const sampleX = Math.max(
                  0,
                  Math.min(outW - 1, Math.round(srcCx + (dx >= 0 ? r : -r)))
                );
                const ci = indices[sy * outW + sampleX] || indices[sy * outW + Math.round(srcCx)];
                if (ci) sl[row + x] = ci;
              }
            }
          }
        }
        layers[z] = sl;
      }
    } else if (opts.orientation === 'standing') {
      const pad = 2;
      volW = outW + pad * 2;
      volD = Math.max(14, effDepth + 6);
      volH = outH;
      layers = new Array(volH);
      const midY = (volD - 1) * 0.5;

      const rowBackColor = opts.smartBack
        ? computeSmartBackColors(indices, outMask, outW, outH, palette.length)
        : null;

      for (let z = 0; z < volH; z++) {
        const sy = outH - 1 - z;
        const sl = new Uint8Array(volW * volD);
        const backCol = rowBackColor ? rowBackColor[sy] : 0;

        for (let sx = 0; sx < outW; sx++) {
          const i = sy * outW + sx;
          const ci = indices[i];
          if (!ci) continue;
          const ht = halfThick[i];
          const y0 = Math.max(0, Math.round(midY - ht));
          const y1 = Math.min(volD - 1, Math.round(midY + ht));
          const vx = sx + pad;

          // Keep front pixels crisp; replace rear interior half with clean dominant back color when smartBack is ON!
          const backCutoff = Math.round(midY - Math.max(0.5, ht * 0.15));
          for (let vy = y0; vy <= y1; vy++) {
            if (opts.smartBack && backCol && vy < backCutoff && dist[i] > 2.2) {
              sl[vy * volW + vx] = backCol;
            } else {
              sl[vy * volW + vx] = ci;
            }
          }
        }
        layers[z] = sl;
      }
    } else {
      volW = outW + 2;
      volD = outH + 2;
      volH = Math.max(10, effDepth + 4);
      layers = new Array(volH);
      const midZ = (volH - 1) * 0.5;

      for (let z = 0; z < volH; z++) {
        layers[z] = new Uint8Array(volW * volD);
      }

      for (let sy = 0; sy < outH; sy++) {
        for (let sx = 0; sx < outW; sx++) {
          const i = sy * outW + sx;
          const ci = indices[i];
          if (!ci) continue;
          const ht = halfThick[i];
          const z0 = Math.max(0, Math.round(midZ - ht));
          const z1 = Math.min(volH - 1, Math.round(midZ + ht));
          const idx = (sy + 1) * volW + (sx + 1);
          for (let z = z0; z <= z1; z++) {
            layers[z][idx] = ci;
          }
        }
      }
    }

    // Crisp 2D pixel preview canvas
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = outW;
    previewCanvas.height = outH;
    const pCtx = previewCanvas.getContext('2d');
    const pImg = pCtx.createImageData(outW, outH);
    for (let i = 0; i < outW * outH; i++) {
      const ci = indices[i];
      if (!ci || !palette[ci]) continue;
      const hex = palette[ci].hex.replace('#', '');
      const num = parseInt(hex, 16);
      pImg.data[i * 4] = (num >> 16) & 255;
      pImg.data[i * 4 + 1] = (num >> 8) & 255;
      pImg.data[i * 4 + 2] = num & 255;
      pImg.data[i * 4 + 3] = 255;
    }
    pCtx.putImageData(pImg, 0, 0);

    const maxDim = Math.max(volW, volD, volH);
    const idealZoom = Math.max(2.1, Math.min(6.0, +(255 / Math.max(36, maxDim)).toFixed(1)));

    return {
      model: {
        id: 'img-' + Date.now(),
        name: opts.name,
        subtitle: `${volH} couches HD · Image → 3D`,
        icon: '🖼️',
        width: volW,
        depth: volD,
        height: volH,
        layers,
        palette,
        defaultAnim: opts.orientation === 'standing' ? 'turntable' : 'hover',
        defaultYaw: -0.35,
        defaultPitch: opts.orientation === 'standing' ? 16 : 32,
        defaultZoom: idealZoom,
        pivotZ: volH - 1,
        particleTheme: 'sparkles',
      },
      previewCanvas,
    };
  }

  StackStudio.imageToSpriteStack = imageToSpriteStack;
})(window);
