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
    // Perceptual weighted Euclidean distance
    return dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114;
  }

  // Extract raw RGBA pixels from an HTMLImageElement, scaled to a clean working canvas
  function getWorkingPixels(img, maxDim = 256) {
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const w = Math.max(8, Math.round((img.naturalWidth || img.width) * scale));
    const h = Math.max(8, Math.round((img.naturalHeight || img.height) * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    return { w, h, data: ctx.getImageData(0, 0, w, h).data };
  }

  // Detect if image already has meaningful transparency; otherwise flood-fill remove background from borders
  function computeForegroundMask(rgba, w, h, removeBg, tolerance) {
    const mask = new Uint8Array(w * h);
    let transparentCount = 0;

    for (let i = 0; i < w * h; i++) {
      const a = rgba[i * 4 + 3];
      if (a >= 110) {
        mask[i] = 1;
      } else {
        transparentCount++;
      }
    }

    // If image already has transparent background (>8% transparent border pixels), respect existing alpha
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

    // Sample corner colors to estimate background
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

    // Seed from all 4 edges if pixel matches any corner seed color
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

    // BFS flood fill background removal
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
        // Match either seed palette or smooth local gradient from current bg pixel
        if (
          matchesSeed(nIdx) ||
          colorDistSq(cr, cg, cb, nr, ng, nb) <= tolSq * 0.45
        ) {
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

  // Crop & downsample foreground to crisp pixel-art grid
  function downsampleSubject(rgba, mask, w, h, targetSize) {
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
      // Fallback: keep whole image if mask removed everything
      minX = 0; minY = 0; maxX = w - 1; maxY = h - 1;
      mask.fill(1);
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

    // Area-averaged sampling with majority alpha coverage for crisp edges
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

    // Remove isolated 1-pixel stray dust speckles
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

  // Deterministic K-Means color quantization for vibrant, crisp pixel-art palettes
  function quantizePalette(outR, outG, outB, outMask, count, maxColors) {
    const fgPixels = [];
    for (let i = 0; i < count; i++) {
      if (outMask[i]) fgPixels.push(i);
    }
    if (fgPixels.length === 0) {
      return { palette: [null, { hex: '#38bdf8', group: 1 }], indices: new Uint8Array(count) };
    }

    const K = Math.min(maxColors, Math.max(2, fgPixels.length));

    // Deterministic farthest-point seeding (gives crisp highlight + accent colors!)
    const centroids = [];
    const first = fgPixels[Math.floor(fgPixels.length * 0.5)];
    centroids.push([outR[first], outG[first], outB[first]]);

    while (centroids.length < K) {
      let bestIdx = fgPixels[0];
      let bestDist = -1;
      for (let p = 0; p < fgPixels.length; p++) {
        const idx = fgPixels[p];
        const r = outR[idx], g = outG[idx], b = outB[idx];
        let minD = Infinity;
        for (let c = 0; c < centroids.length; c++) {
          const d = colorDistSq(r, g, b, centroids[c][0], centroids[c][1], centroids[c][2]);
          if (d < minD) minD = d;
        }
        if (minD > bestDist) {
          bestDist = minD;
          bestIdx = idx;
        }
      }
      if (bestDist <= 4) break;
      centroids.push([outR[bestIdx], outG[bestIdx], outB[bestIdx]]);
    }

    const actualK = centroids.length;
    const assign = new Uint8Array(fgPixels.length);

    // 7 iterations of K-Means refinement
    for (let iter = 0; iter < 7; iter++) {
      const sumR = new Float64Array(actualK);
      const sumG = new Float64Array(actualK);
      const sumB = new Float64Array(actualK);
      const cnt = new Int32Array(actualK);

      for (let p = 0; p < fgPixels.length; p++) {
        const idx = fgPixels[p];
        const r = outR[idx], g = outG[idx], b = outB[idx];
        let bestC = 0;
        let bestD = Infinity;
        for (let c = 0; c < actualK; c++) {
          const d = colorDistSq(r, g, b, centroids[c][0], centroids[c][1], centroids[c][2]);
          if (d < bestD) {
            bestD = d;
            bestC = c;
          }
        }
        assign[p] = bestC;
        sumR[bestC] += r;
        sumG[bestC] += g;
        sumB[bestC] += b;
        cnt[bestC]++;
      }

      for (let c = 0; c < actualK; c++) {
        if (cnt[c] > 0) {
          centroids[c][0] = sumR[c] / cnt[c];
          centroids[c][1] = sumG[c] / cnt[c];
          centroids[c][2] = sumB[c] / cnt[c];
        }
      }
    }

    // Build StackCraft palette (index 0 = transparent)
    const palette = [null];
    for (let c = 0; c < actualK; c++) {
      const r = Math.round(centroids[c][0]);
      const g = Math.round(centroids[c][1]);
      const b = Math.round(centroids[c][2]);
      // Slight saturation boost for lively pixel-art look
      const avg = (r + g + b) / 3;
      const boost = 1.08;
      const br = Math.max(0, Math.min(255, Math.round(avg + (r - avg) * boost)));
      const bg = Math.max(0, Math.min(255, Math.round(avg + (g - avg) * boost)));
      const bb = Math.max(0, Math.min(255, Math.round(avg + (b - avg) * boost)));
      palette.push({ hex: rgbToHex(br, bg, bb), group: c + 1 });
    }

    const indices = new Uint8Array(count);
    for (let p = 0; p < fgPixels.length; p++) {
      indices[fgPixels[p]] = assign[p] + 1;
    }

    return { palette, indices };
  }

  // Exact 2D Euclidean distance to nearest silhouette edge (powers rounded plushie 3D inflation!)
  function computeDistanceTransform(mask, w, h) {
    const dist = new Float32Array(w * h);
    const INF = 1e6;
    for (let i = 0; i < w * h; i++) {
      dist[i] = mask[i] ? INF : 0;
    }

    // Also treat outer image border as edge so cropped sides still round slightly
    for (let x = 0; x < w; x++) {
      if (mask[x]) dist[x] = 1;
      if (mask[(h - 1) * w + x]) dist[(h - 1) * w + x] = 1;
    }
    for (let y = 0; y < h; y++) {
      if (mask[y * w]) dist[y * w] = 1;
      if (mask[y * w + (w - 1)]) dist[y * w + (w - 1)] = 1;
    }

    // Two-pass Chamfer 3-4 distance approximation (fast, smooth, exact enough for pixel art!)
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

  /**
   * Convert an HTMLImageElement into a full playable StackCraft pseudo-3D Sprite Stack model!
   * options:
   *  - name: string
   *  - resolution: 24..48 (pixel grid size)
   *  - colors: 6..24 (palette color count)
   *  - depthScale: 4..20 (3D thickness)
   *  - mode: 'puffy' | 'relief' | 'bevel' | 'lathe'
   *  - orientation: 'standing' | 'flat'
   *  - removeBg: boolean
   *  - bgTolerance: 10..85
   */
  function imageToSpriteStack(img, options) {
    const opts = Object.assign(
      {
        name: 'Mon Perso 3D',
        resolution: 38,
        colors: 14,
        depthScale: 12,
        mode: 'puffy',
        orientation: 'standing',
        removeBg: true,
        bgTolerance: 36,
      },
      options || {}
    );

    const { w, h, data } = getWorkingPixels(img, 240);
    const rawMask = computeForegroundMask(data, w, h, opts.removeBg, opts.bgTolerance);
    const { outW, outH, outR, outG, outB, outMask } = downsampleSubject(
      data,
      rawMask,
      w,
      h,
      opts.resolution
    );
    const { palette, indices } = quantizePalette(
      outR,
      outG,
      outB,
      outMask,
      outW * outH,
      opts.colors
    );
    const { dist, maxD } = computeDistanceTransform(outMask, outW, outH);

    // Compute per-pixel 3D half-thickness in voxels
    const maxHalf = Math.max(1.5, opts.depthScale * 0.5);
    const halfThick = new Float32Array(outW * outH);

    for (let i = 0; i < outW * outH; i++) {
      if (!outMask[i]) continue;
      const dn = Math.min(1, dist[i] / Math.max(1, maxD));
      const lum = (outR[i] * 0.299 + outG[i] * 0.587 + outB[i] * 0.114) / 255;

      if (opts.mode === 'bevel') {
        // Chunky acrylic figurine / enamel charm with clean beveled rim
        const edge = Math.min(1, dist[i] / 2.2);
        halfThick[i] = Math.max(1.0, maxHalf * (0.45 + 0.55 * edge));
      } else if (opts.mode === 'relief') {
        // Rounded plushie + subtle luminance sculpt (bright features pop forward)
        const dome = Math.sqrt(Math.max(0.06, 1 - (1 - dn) * (1 - dn)));
        halfThick[i] = Math.max(1.0, maxHalf * dome * (0.72 + 0.42 * lum));
      } else {
        // 'puffy' (default): smooth organic plushie / chibi toy inflation!
        const dome = Math.sqrt(Math.max(0.05, 1 - Math.pow(1 - dn, 2.2)));
        halfThick[i] = Math.max(1.0, maxHalf * dome);
      }
    }

    // Build final 3D Sprite Stack Volume!
    let volW, volD, volH, layers;

    if (opts.mode === 'lathe') {
      // 360-degree surface of revolution around center vertical axis
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
        // Find outermost radius on this horizontal row
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
                const sampleX = Math.max(0, Math.min(outW - 1, Math.round(srcCx + (dx >= 0 ? r : -r))));
                const ci = indices[sy * outW + sampleX] || indices[sy * outW + Math.round(srcCx)];
                if (ci) sl[row + x] = ci;
              }
            }
          }
        }
        layers[z] = sl;
      }
    } else if (opts.orientation === 'standing') {
      // STANDING UPRIGHT: image X -> X, image Y (bottom-up) -> Z (slices!), inflated thickness -> Y (front-back)
      const pad = 2;
      volW = outW + pad * 2;
      volD = Math.max(12, Math.ceil(opts.depthScale) + 6);
      volH = outH;
      layers = new Array(volH);
      const midY = (volD - 1) * 0.5;

      for (let z = 0; z < volH; z++) {
        const sy = outH - 1 - z; // bottom row of image = z=0 (feet on pedestal!)
        const sl = new Uint8Array(volW * volD);
        for (let sx = 0; sx < outW; sx++) {
          const i = sy * outW + sx;
          const ci = indices[i];
          if (!ci) continue;
          const ht = halfThick[i];
          const y0 = Math.max(0, Math.round(midY - ht));
          const y1 = Math.min(volD - 1, Math.round(midY + ht));
          const vx = sx + pad;
          for (let vy = y0; vy <= y1; vy++) {
            sl[vy * volW + vx] = ci;
          }
        }
        layers[z] = sl;
      }
    } else {
      // FLAT ON PEDESTAL: image X,Y -> slice X,Y, inflated thickness -> Z layers!
      volW = outW + 2;
      volD = outH + 2;
      volH = Math.max(8, Math.ceil(opts.depthScale) + 4);
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

    // Also render a quick 2D pixel-art preview canvas for the importer modal
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

    return {
      model: {
        id: 'img-' + Date.now(),
        name: opts.name,
        subtitle: `${volH} couches · Image → 3D`,
        icon: '🖼️',
        width: volW,
        depth: volD,
        height: volH,
        layers,
        palette,
        defaultAnim: opts.orientation === 'standing' ? 'turntable' : 'hover',
        defaultYaw: -0.35,
        defaultPitch: opts.orientation === 'standing' ? 18 : 34,
        defaultZoom: Math.max(3.8, Math.min(6.4, 210 / Math.max(volW, volH))),
        pivotZ: volH - 1,
        particleTheme: 'sparkles',
      },
      previewCanvas,
    };
  }

  StackStudio.imageToSpriteStack = imageToSpriteStack;
})(window);
