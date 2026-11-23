(function (global) {
  'use strict';

  const StackStudio = (global.StackStudio = global.StackStudio || {});

  function createVolume(width, depth, height, palette) {
    const layers = new Array(height);
    for (let z = 0; z < height; z++) {
      layers[z] = new Uint8Array(width * depth);
    }
    return {
      width,
      depth,
      height,
      layers,
      palette,
      set(x, y, z, c) {
        const ix = Math.round(x);
        const iy = Math.round(y);
        const iz = Math.round(z);
        if (ix < 0 || ix >= width || iy < 0 || iy >= depth || iz < 0 || iz >= height) return;
        layers[iz][iy * width + ix] = c;
      },
      get(x, y, z) {
        const ix = Math.round(x);
        const iy = Math.round(y);
        const iz = Math.round(z);
        if (ix < 0 || ix >= width || iy < 0 || iy >= depth || iz < 0 || iz >= height) return 0;
        return layers[iz][iy * width + ix];
      },
      box(x0, y0, z0, x1, y1, z1, c) {
        const ax = Math.max(0, Math.floor(Math.min(x0, x1)));
        const bx = Math.min(width - 1, Math.ceil(Math.max(x0, x1)));
        const ay = Math.max(0, Math.floor(Math.min(y0, y1)));
        const by = Math.min(depth - 1, Math.ceil(Math.max(y0, y1)));
        const az = Math.max(0, Math.floor(Math.min(z0, z1)));
        const bz = Math.min(height - 1, Math.ceil(Math.max(z0, z1)));
        for (let z = az; z <= bz; z++) {
          const sl = layers[z];
          for (let y = ay; y <= by; y++) {
            const row = y * width;
            for (let x = ax; x <= bx; x++) {
              sl[row + x] = c;
            }
          }
        }
      },
      ellipsoid(cx, cy, cz, rx, ry, rz, colorFn) {
        const ax = Math.max(0, Math.floor(cx - rx - 1));
        const bx = Math.min(width - 1, Math.ceil(cx + rx + 1));
        const ay = Math.max(0, Math.floor(cy - ry - 1));
        const by = Math.min(depth - 1, Math.ceil(cy + ry + 1));
        const az = Math.max(0, Math.floor(cz - rz - 1));
        const bz = Math.min(height - 1, Math.ceil(cz + rz + 1));
        for (let z = az; z <= bz; z++) {
          const dz = (z - cz) / rz;
          const dz2 = dz * dz;
          const sl = layers[z];
          for (let y = ay; y <= by; y++) {
            const dy = (y - cy) / ry;
            const dy2 = dy * dy;
            const row = y * width;
            for (let x = ax; x <= bx; x++) {
              const dx = (x - cx) / rx;
              const d = dx * dx + dy2 + dz2;
              if (d <= 1.0) {
                const c = typeof colorFn === 'function' ? colorFn(x, y, z, d) : colorFn;
                if (c !== null && c !== undefined) sl[row + x] = c;
              }
            }
          }
        }
      },
      cylinderZ(cx, cy, z0, z1, r, c) {
        const az = Math.max(0, Math.floor(z0));
        const bz = Math.min(height - 1, Math.ceil(z1));
        const ax = Math.max(0, Math.floor(cx - r - 1));
        const bx = Math.min(width - 1, Math.ceil(cx + r + 1));
        const ay = Math.max(0, Math.floor(cy - r - 1));
        const by = Math.min(depth - 1, Math.ceil(cy + r + 1));
        const r2 = r * r;
        for (let z = az; z <= bz; z++) {
          const sl = layers[z];
          for (let y = ay; y <= by; y++) {
            const dy = y - cy;
            const row = y * width;
            for (let x = ax; x <= bx; x++) {
              const dx = x - cx;
              if (dx * dx + dy * dy <= r2) sl[row + x] = c;
            }
          }
        }
      },
      line3D(x0, y0, z0, x1, y1, z1, c, thick = 0) {
        const dist = Math.max(
          Math.abs(x1 - x0),
          Math.abs(y1 - y0),
          Math.abs(z1 - z0),
          1
        );
        const steps = Math.ceil(dist * 2.5);
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = x0 + (x1 - x0) * t;
          const y = y0 + (y1 - y0) * t;
          const z = z0 + (z1 - z0) * t;
          if (thick <= 0) {
            this.set(x, y, z, c);
          } else {
            for (let dz = -thick; dz <= thick; dz++) {
              for (let dy = -thick; dy <= thick; dy++) {
                for (let dx = -thick; dx <= thick; dx++) {
                  if (dx * dx + dy * dy + dz * dz <= thick * thick + 0.35) {
                    this.set(x + dx, y + dy, z + dz, c);
                  }
                }
              }
            }
          }
        }
      },
    };
  }

  /* =========================================================================
     1. REQUIN PELUCHE SUSPENDU HD (Blåhaj Homage — 92 × 60 × 84 couches!)
     ========================================================================= */
  function buildSharkModel() {
    const palette = [
      null,
      { hex: '#6c9ac0', group: 1 }, // 1: Blåhaj slate blue
      { hex: '#90bce0', group: 1 }, // 2: Soft back highlight
      { hex: '#4d7699', group: 1 }, // 3: Deep fin / gill blue
      { hex: '#f0f6fc', group: 2 }, // 4: Plush white belly
      { hex: '#cfdde9', group: 2 }, // 5: Belly shadow
      { hex: '#f495aa', group: 3 }, // 6: Mouth pink
      { hex: '#c85874', group: 3 }, // 7: Deep throat pink
      { hex: '#ffffff', group: 4 }, // 8: Crisp teeth & eye shine
      { hex: '#181c2b', group: 4 }, // 9: Glossy eyes
      { hex: '#df3346', group: 5 }, // 10: Vivid crimson rope
      { hex: '#a61c2e', group: 5 }, // 11: Dark crimson rope shade
      { hex: '#c68852', group: 6 }, // 12: Wooden peg
      { hex: '#8b552b', group: 6 }, // 13: Dark wood grain
      { hex: '#e2a973', group: 6 }, // 14: Wood top highlight
    ];

    const W = 92;
    const D = 60;
    const H = 84;
    const v = createVolume(W, D, H, palette);
    const cy = 30;

    // Smooth high-res Blåhaj cross-section profile along X (x = 9..80)
    function bodyProfile(x) {
      if (x < 9 || x > 80) return null;
      const t = (x - 9) / 71;
      let rxY, rxZ, centerZ;
      if (t < 0.27) {
        const k = Math.pow(t / 0.27, 0.58);
        rxY = 2.6 + k * 10.6;
        rxZ = 2.2 + k * 9.2;
        centerZ = 29.2 + Math.sin(t * Math.PI) * 2.2;
      } else if (t < 0.68) {
        const k = (t - 0.27) / 0.41;
        const bulge = Math.sin(k * Math.PI);
        rxY = 13.2 - k * 4.5 + bulge * 1.4;
        rxZ = 11.4 - k * 3.8 + bulge * 1.1;
        centerZ = 31.2 - k * 1.2;
      } else {
        const k = (t - 0.68) / 0.32;
        rxY = Math.max(2.0, 8.7 * (1 - k * 0.74));
        rxZ = Math.max(2.2, 7.6 * (1 - k * 0.68));
        centerZ = 30.0 + k * 4.2;
      }
      return { rxY, rxZ, centerZ };
    }

    // 1. Sculpt smooth rounded plush body
    for (let x = 9; x <= 80; x++) {
      const p = bodyProfile(x);
      if (!p) continue;
      const z0 = Math.max(2, Math.floor(p.centerZ - p.rxZ - 1));
      const z1 = Math.min(H - 1, Math.ceil(p.centerZ + p.rxZ + 1));
      const y0 = Math.max(2, Math.floor(cy - p.rxY - 1));
      const y1 = Math.min(D - 1, Math.ceil(cy + p.rxY + 1));

      for (let z = z0; z <= z1; z++) {
        const dz = (z - p.centerZ) / p.rxZ;
        const dz2 = dz * dz;
        for (let y = y0; y <= y1; y++) {
          const dy = (y - cy) / p.rxY;
          const d = dy * dy + dz2;
          if (d <= 1.0) {
            // Smooth two-tone Blåhaj split curving gently around snout & belly
            const bellySplit = p.centerZ - (x < 28 ? 1.0 + (28 - x) * 0.04 : 1.5);
            let col;
            if (z < bellySplit) {
              col = dz < -0.62 ? 5 : 4;
            } else {
              col = dz > 0.68 && Math.abs(dy) < 0.52 ? 2 : 1;
            }
            v.set(x, y, z, col);
          }
        }
      }
    }

    // 2. Carve expressive open pink mouth & individual triangular white teeth!
    for (let x = 11; x <= 27; x++) {
      const k = (x - 11) / 16;
      const halfW = 2.5 + Math.pow(k, 0.85) * 6.4;
      const zBot = Math.round(23.5 - k * 2.2);
      const zTop = Math.round(28.5 - k * 1.1);

      for (let z = zBot; z <= zTop; z++) {
        for (let y = Math.floor(cy - halfW); y <= Math.ceil(cy + halfW); y++) {
          const distSide = Math.abs(y - cy);
          if (x <= 24 && z > zBot + 1 && z < zTop && distSide < halfW - 1.1) {
            v.set(x, y, z, 0); // hollow open mouth interior
          } else if (z <= zBot + 1 && x >= 12 && x <= 25 && distSide < halfW - 0.5) {
            // Soft pink plush tongue/floor
            v.set(x, y, z, x > 19 ? 7 : 6);
          } else if (x >= 23 && z > zBot && z < zTop && distSide < halfW - 0.6) {
            // Deep pink back of mouth
            v.set(x, y, z, 7);
          }
        }
      }

      // Crisp individual white triangular teeth hanging from upper jaw lip!
      if (x >= 12 && x <= 25 && (x % 3 === 0 || x % 3 === 1)) {
        const lipY = Math.round(halfW - 0.5);
        const toothLen = x % 3 === 0 ? 1 : 0;
        for (let dt = 0; dt <= toothLen; dt++) {
          v.set(x, cy - lipY, zTop - dt, 8);
          v.set(x, cy + lipY, zTop - dt, 8);
        }
      }

      // Clean white lower jaw rim
      const jawY = Math.round(halfW - 0.2);
      v.set(x, cy - jawY, zBot, 4);
      v.set(x, cy + jawY, zBot, 4);
      v.set(x, cy - jawY, zBot - 1, 4);
      v.set(x, cy + jawY, zBot - 1, 4);
    }
    // Front tip teeth
    v.set(12, cy - 2, 27, 8);
    v.set(12, cy + 2, 27, 8);
    v.set(11, cy, 27, 8);

    // 3. Cute glossy round eyes on both sides of head
    for (const side of [-1, 1]) {
      const pEye = bodyProfile(23);
      const ey = Math.round(cy + side * (pEye.rxY - 0.8));
      v.ellipsoid(23, ey, 33.5, 2.1, 1.4, 2.1, 9);
      // Bright white eye sparkle
      v.set(22, ey + side * 1, 34, 8);
      v.set(23, ey + side * 1, 35, 8);
    }

    // 4. Three subtle stitched gill slits on each side of neck (authentic Blåhaj detail!)
    for (const side of [-1, 1]) {
      for (const gx of [30, 33, 36]) {
        const pG = bodyProfile(gx);
        if (!pG) continue;
        const gy = Math.round(cy + side * (pG.rxY - 0.1));
        for (let gz = 27; gz <= 32; gz++) {
          v.set(gx, gy, gz, 3);
        }
      }
    }

    // 5. Sleek Curved Dorsal Fin
    for (let z = 39; z <= 56; z++) {
      const k = (z - 39) / 17;
      const xStart = Math.round(40 + Math.pow(k, 1.15) * 13);
      const xEnd = Math.round(56 - k * 1.4 + Math.sin(k * Math.PI) * 1.5);
      const halfThick = Math.max(0.7, 2.2 * (1 - k * 0.65));
      for (let x = xStart; x <= xEnd; x++) {
        for (let y = Math.floor(cy - halfThick); y <= Math.ceil(cy + halfThick); y++) {
          v.set(x, y, z, z > 51 ? 2 : 1);
        }
      }
    }

    // 6. Gracefully Swept Pectoral Fins (left & right)
    for (const side of [-1, 1]) {
      for (let i = 0; i <= 17; i++) {
        const k = i / 17;
        const fy = cy + side * (10 + i);
        const fx0 = Math.round(35 + Math.pow(k, 1.1) * 13);
        const fx1 = Math.round(47 + k * 7 - k * k * 5);
        const fz = Math.round(25.5 - k * 7.2);
        const thickZ = k < 0.5 ? 2 : 1;
        for (let x = fx0; x <= fx1; x++) {
          for (let dz = -thickZ; dz <= thickZ; dz++) {
            const col = dz > 0 ? (k < 0.45 ? 2 : 1) : dz < 0 ? 3 : 1;
            v.set(x, fy, fz + dz, col);
          }
        }
      }
    }

    // 7. Sharp Forked Crescent Tail Fin
    for (let i = 0; i <= 16; i++) {
      const k = i / 16;
      const ux = Math.round(74 + i * 0.85);
      const uz = Math.round(34 + i * 1.18);
      const halfW = Math.round(2.8 * (1 - k * 0.65));
      const halfT = k < 0.65 ? 1 : 0;
      for (let dx = -halfW; dx <= halfW; dx++) {
        for (let dy = -halfT; dy <= halfT; dy++) {
          v.set(ux + dx, cy + dy, uz, k > 0.7 ? 2 : 1);
        }
      }
      if (i <= 10) {
        const lk = i / 10;
        const lx = Math.round(76 + i * 0.78);
        const lz = Math.round(31 - i * 0.98);
        const lw = Math.round(2.2 * (1 - lk * 0.65));
        for (let dx = -lw; dx <= lw; dx++) {
          v.set(lx + dx, cy, lz, lk > 0.5 ? 3 : 1);
          if (lk < 0.5) {
            v.set(lx + dx, cy - 1, lz, 1);
            v.set(lx + dx, cy + 1, lz, 1);
          }
        }
      }
    }

    // 8. Crisp Continuous Crimson Crisscross Harness Cords hugging the exact surface!
    function wrapRingHD(xCenter, slantX, col) {
      for (let a = 0; a < 180; a++) {
        const ang = (a / 180) * Math.PI * 2;
        const x = Math.round(xCenter + Math.sin(ang) * slantX);
        const p = bodyProfile(x);
        if (!p) continue;
        const y = Math.round(cy + Math.cos(ang) * (p.rxY + 0.85));
        const z = Math.round(p.centerZ + Math.sin(ang) * (p.rxZ + 0.85));
        v.set(x, y, z, col);
        v.set(x + 1, y, z, col);
        v.set(x, y, z + 1, col);
      }
    }

    wrapRingHD(34, 4.4, 10);
    wrapRingHD(36, -4.4, 11);
    wrapRingHD(48, 5.0, 10);
    wrapRingHD(50, -5.0, 10);
    wrapRingHD(62, 4.0, 11);
    wrapRingHD(64, -3.8, 10);

    // Side longitudinal connecting cords
    for (const side of [-1, 1]) {
      for (let x = 34; x <= 64; x++) {
        const p = bodyProfile(x);
        if (!p) continue;
        const y = Math.round(cy + side * (p.rxY + 0.9));
        const z = Math.round(p.centerZ);
        v.set(x, y, z, 10);
        v.set(x, y, z + 1, 11);
      }
    }

    // 9. Taut Continuous Suspension Ropes converging neatly to the wooden peg at top
    const pegX = 46;
    const pegY = cy;
    const pegZ = 74;
    v.line3D(35, cy - 10, 41, pegX, pegY, pegZ, 10, 0.95);
    v.line3D(35, cy + 10, 41, pegX, pegY, pegZ, 10, 0.95);
    v.line3D(61, cy - 8, 39, pegX, pegY, pegZ, 11, 0.95);
    v.line3D(61, cy + 8, 39, pegX, pegY, pegZ, 11, 0.95);

    // Rope knot collar right under wooden peg
    v.cylinderZ(pegX, pegY, pegZ - 2, pegZ + 1, 2.3, 11);
    v.cylinderZ(pegX, pegY, pegZ - 1, pegZ, 2.6, 10);

    // 10. Detailed Cylindrical Wooden Anchor Peg at top
    v.cylinderZ(pegX, pegY, pegZ + 2, 82, 2.6, 12);
    v.cylinderZ(pegX, pegY, 82, 82, 2.4, 14);
    v.line3D(pegX - 2, pegY - 1, pegZ + 2, pegX - 2, pegY - 1, 81, 13);
    v.line3D(pegX + 1, pegY + 2, pegZ + 3, pegX + 1, pegY + 2, 81, 13);

    return {
      id: 'shark',
      name: 'Requin Peluche HD',
      subtitle: '84 couches HD · Hommage Blåhaj',
      icon: '🦈',
      width: W,
      depth: D,
      height: H,
      layers: v.layers,
      palette,
      defaultAnim: 'pendulum',
      defaultYaw: -0.42,
      defaultPitch: 20,
      defaultZoom: 2.9,
      pivotZ: 78,
      particleTheme: 'sparkles',
    };
  }

  /* =========================================================================
     2. SANCTUAIRE TORII KYOTO (42 × 42 × 40)
     ========================================================================= */
  function buildToriiModel() {
    const palette = [
      null,
      { hex: '#639b56', group: 1 }, // 1: Moss grass
      { hex: '#82bc6e', group: 1 }, // 2: Bright grass
      { hex: '#94a3b8', group: 2 }, // 3: Stone tile
      { hex: '#64748b', group: 2 }, // 4: Dark stone
      { hex: '#38bdf8', group: 3 }, // 5: Koi pond water
      { hex: '#7dd3fc', group: 3 }, // 6: Water ripple
      { hex: '#e03e2d', group: 4 }, // 7: Torii vermilion
      { hex: '#b42318', group: 4 }, // 8: Deep vermilion
      { hex: '#262d3d', group: 5 }, // 9: Dark roof / base stone
      { hex: '#3e485e', group: 5 }, // 10: Roof highlight
      { hex: '#fde047', group: 6, emissive: true }, // 11: Lantern warm glow
      { hex: '#fb923c', group: 6, emissive: true }, // 12: Lantern amber
      { hex: '#f9a8d4', group: 7 }, // 13: Sakura blossom
      { hex: '#fbcfe8', group: 7 }, // 14: Light sakura
      { hex: '#6b442a', group: 8 }, // 15: Tree trunk
    ];

    const W = 42;
    const D = 42;
    const H = 40;
    const v = createVolume(W, D, H, palette);
    const cx = 21;
    const cy = 21;

    // Rounded mossy garden island base (z = 0..3)
    for (let z = 0; z <= 3; z++) {
      const r = z === 0 ? 17.5 : 18.5;
      for (let y = 0; y < D; y++) {
        for (let x = 0; x < W; x++) {
          const dx = x - cx;
          const dy = y - cy;
          if (dx * dx + dy * dy <= r * r) {
            if (z < 2) {
              v.set(x, y, z, 4);
            } else if (x > 26 && y > 22 && dx * dx + dy * dy <= 16.5 * 16.5) {
              // Tiny tranquil koi pond
              v.set(x, y, z, z === 3 && (x + y) % 5 === 0 ? 6 : 5);
            } else {
              v.set(x, y, z, (x * 3 + y * 5) % 7 === 0 ? 2 : 1);
            }
          }
        }
      }
    }

    // Stepping stones path along Y through the gate
    for (let y = 7; y <= 35; y += 5) {
      v.box(cx - 2, y - 1, 3, cx + 2, y + 1, 4, 3);
    }

    // Two Torii Pillar Stone Bases (Kamebara)
    v.cylinderZ(cx - 9, cy, 4, 7, 2.2, 9);
    v.cylinderZ(cx + 9, cy, 4, 7, 2.2, 9);

    // Two Tall Vermilion Pillars (Hashira)
    v.cylinderZ(cx - 9, cy, 8, 32, 1.55, 7);
    v.cylinderZ(cx + 9, cy, 8, 32, 1.55, 7);

    // Lower Crossbeam (Nuki)
    v.box(cx - 14, cy - 1, 26, cx + 14, cy + 1, 28, 7);
    v.box(cx - 14, cy - 1, 26, cx - 14, cy + 1, 28, 9);
    v.box(cx + 14, cy - 1, 26, cx + 14, cy + 1, 28, 9);

    // Central Plaque (Gakuzuka)
    v.box(cx - 2, cy - 1, 28, cx + 2, cy + 1, 32, 9);
    v.set(cx, cy - 1, 30, 11);
    v.set(cx, cy + 1, 30, 11);

    // Upper Curved Lintel (Kasagi + Shimaki)
    for (let x = cx - 17; x <= cx + 17; x++) {
      const dist = Math.abs(x - cx);
      const lift = dist > 10 ? Math.floor(((dist - 10) * (dist - 10)) * 0.065) : 0;
      const zBase = 32 + lift;
      v.box(x, cy - 1, zBase, x, cy + 1, zBase + 1, 8);
      v.box(x, cy - 2, zBase + 2, x, cy + 2, zBase + 2, 9);
      v.box(x, cy - 1, zBase + 3, x, cy + 1, zBase + 3, 10);
    }

    // Hanging Glowing Paper Lantern (Chochin) under center beam
    v.line3D(cx, cy, 25, cx, cy, 23, 9);
    v.box(cx - 1, cy - 1, 22, cx + 1, cy + 1, 22, 9);
    v.box(cx - 1, cy - 1, 19, cx + 1, cy + 1, 21, 11);
    v.set(cx, cy, 20, 12);
    v.box(cx - 1, cy - 1, 18, cx + 1, cy + 1, 18, 9);

    // Stone Garden Lantern (Toro) on front-left
    const lx = 10;
    const ly = 30;
    v.box(lx - 1, ly - 1, 4, lx + 1, ly + 1, 5, 4);
    v.box(lx, ly, 6, lx, ly, 9, 3);
    v.box(lx - 1, ly - 1, 10, lx + 1, ly + 1, 11, 11);
    v.box(lx - 2, ly - 2, 12, lx + 2, ly + 2, 12, 4);
    v.box(lx - 1, ly - 1, 13, lx + 1, ly + 1, 13, 3);

    // Small Bonsai Sakura Tree on back-left
    v.line3D(9, 12, 4, 11, 11, 14, 15, 0.7);
    v.line3D(11, 11, 12, 14, 10, 16, 15);
    v.ellipsoid(11, 11, 17, 5.2, 4.8, 3.4, (x, y, z) => (z > 18 || (x + y) % 3 === 0 ? 14 : 13));
    v.ellipsoid(15, 10, 16, 3.4, 3.2, 2.5, (x, y, z) => (z > 17 ? 14 : 13));

    return {
      id: 'torii',
      name: 'Sanctuaire Torii Kyoto',
      subtitle: '40 couches · Sakura & Lanterne',
      icon: '⛩️',
      width: W,
      depth: D,
      height: H,
      layers: v.layers,
      palette,
      defaultAnim: 'turntable',
      defaultYaw: 0.65,
      defaultPitch: 28,
      defaultZoom: 5.2,
      pivotZ: 0,
      particleTheme: 'sakura',
    };
  }

  /* =========================================================================
     3. KEI DRIFT RÉTRO (44 × 24 × 20)
     ========================================================================= */
  function buildCarModel() {
    const palette = [
      null,
      { hex: '#f1f5f9', group: 1 }, // 1: Panda white body
      { hex: '#cbd5e1', group: 1 }, // 2: White shadow
      { hex: '#232a3b', group: 2 }, // 3: Lower charcoal trim & tires
      { hex: '#475569', group: 2 }, // 4: Bumper / rim accent
      { hex: '#94a3b8', group: 3 }, // 5: Alloy wheel hub
      { hex: '#38bdf8', group: 4 }, // 6: Windshield glass
      { hex: '#0284c7', group: 4 }, // 7: Deep glass
      { hex: '#fef08a', group: 5, emissive: true }, // 8: Headlights
      { hex: '#fb3758', group: 6, emissive: true }, // 9: Tail lights
      { hex: '#f59e0b', group: 7 }, // 10: Turn signals / roof box
      { hex: '#1e293b', group: 8 }, // 11: Spoiler & rack
    ];

    const W = 44;
    const D = 24;
    const H = 20;
    const v = createVolume(W, D, H, palette);

    // 4 chunky pixel wheels (left/right, front/rear)
    const wheelXs = [10, 33];
    const wheelYs = [4, 19];
    for (const wx of wheelXs) {
      for (const wy of wheelYs) {
        for (let z = 0; z <= 5; z++) {
          for (let dx = -3; dx <= 3; dx++) {
            const dz = z - 2.5;
            if (dx * dx + dz * dz <= 9.5) {
              v.box(wx + dx, wy - 1, z, wx + dx, wy + 1, z, 3);
              if (dx * dx + dz * dz <= 2.6) {
                v.set(wx + dx, wy < 12 ? wy - 1 : wy + 1, z, 5);
              }
            }
          }
        }
      }
    }

    // Lower chassis & black panda skirt (z = 2..5)
    v.box(4, 5, 2, 39, 18, 5, 3);
    v.box(3, 6, 3, 40, 17, 4, 4); // front/rear bumpers

    // Main White Body (z = 6..10)
    v.box(4, 5, 6, 39, 18, 9, 1);
    // Classic black racing side stripe along doors
    v.box(5, 5, 7, 38, 5, 7, 3);
    v.box(5, 18, 7, 38, 18, 7, 3);
    // Sloped front hood
    v.box(5, 6, 10, 15, 17, 10, 1);

    // Pop-up Headlights (front x = 4..6)
    v.box(4, 6, 8, 6, 8, 9, 8);
    v.box(4, 15, 8, 6, 17, 9, 8);
    // Front amber blinkers
    v.box(3, 6, 5, 4, 8, 5, 10);
    v.box(3, 15, 5, 4, 17, 5, 10);

    // Rear glowing crimson tail lights
    v.box(39, 6, 7, 39, 9, 8, 9);
    v.box(39, 14, 7, 39, 17, 8, 9);
    // License plate
    v.box(39, 10, 5, 39, 13, 6, 1);

    // Cabin Greenhouse (sloped windshield & hatchback rear, z = 10..15)
    for (let z = 10; z <= 15; z++) {
      const k = (z - 10) / 5;
      const x0 = Math.round(14 + k * 4.5);
      const x1 = Math.round(36 - k * 4.5);
      const y0 = Math.round(6 + k * 1.2);
      const y1 = Math.round(17 - k * 1.2);
      v.box(x0, y0, z, x1, y1, z, z === 15 ? 1 : 6);
      if (z < 15) {
        // Pillars (A, B, C)
        v.box(x0, y0, z, x0 + 1, y0, z, 1);
        v.box(x0, y1, z, x0 + 1, y1, z, 1);
        v.box(24, y0, z, 25, y0, z, 1);
        v.box(24, y1, z, 25, y1, z, 1);
        v.box(x1 - 1, y0, z, x1, y0, z, 1);
        v.box(x1 - 1, y1, z, x1, y1, z, 1);
        // Glass sheen
        v.box(x0 + 1, y0 + 2, z, x0 + 1, y1 - 2, z, 7);
      }
    }

    // Roof Rack + Retro Amber Cargo Box
    v.box(20, 8, 16, 29, 15, 16, 11);
    v.box(21, 9, 16, 28, 14, 16, 1);
    v.box(22, 9, 17, 27, 13, 18, 10);

    // Rear Drift Spoiler Wing
    v.box(36, 6, 10, 38, 7, 12, 11);
    v.box(36, 16, 10, 38, 17, 12, 11);
    v.box(36, 5, 13, 39, 18, 13, 11);

    return {
      id: 'car',
      name: 'Kei Drift Rétro',
      subtitle: '20 couches · Panda AE86',
      icon: '🚗',
      width: W,
      depth: D,
      height: H,
      layers: v.layers,
      palette,
      defaultAnim: 'turntable',
      defaultYaw: -0.6,
      defaultPitch: 28,
      defaultZoom: 6.0,
      pivotZ: 0,
      particleTheme: 'sparks',
    };
  }

  /* =========================================================================
     4. NEKO-BOT RÉTRO (34 × 34 × 38)
     ========================================================================= */
  function buildMechModel() {
    const palette = [
      null,
      { hex: '#e6eff8', group: 1 }, // 1: White armor
      { hex: '#b8cbe0', group: 1 }, // 2: Armor shade
      { hex: '#14b8a6', group: 2 }, // 3: Teal accent
      { hex: '#0f766e', group: 2 }, // 4: Dark teal
      { hex: '#1b2234', group: 3 }, // 5: Visor screen / joints
      { hex: '#38f9ff', group: 4, emissive: true }, // 6: Glowing cyan eyes
      { hex: '#fb7185', group: 5, emissive: true }, // 7: Cute blush
      { hex: '#fb923c', group: 6, emissive: true }, // 8: Thruster flame orange
      { hex: '#fef08a', group: 6, emissive: true }, // 9: Thruster core yellow
      { hex: '#475569', group: 7 }, // 10: Jetpack metal
    ];

    const W = 34;
    const D = 34;
    const H = 38;
    const v = createVolume(W, D, H, palette);
    const cx = 17;
    const cy = 17;

    // Thruster flames at bottom (z = 2..7)
    for (const sx of [-4, 4]) {
      v.ellipsoid(cx + sx, cy + 4, 5, 2.2, 2.2, 3.2, (x, y, z) => (z > 5 ? 9 : 8));
      v.cylinderZ(cx + sx, cy + 4, 8, 12, 2.3, 10);
    }

    // Floating little feet
    v.ellipsoid(cx - 5, cy - 1, 9, 2.6, 3.2, 2.0, 3);
    v.ellipsoid(cx + 5, cy - 1, 9, 2.6, 3.2, 2.0, 3);

    // Chubby rounded robot torso (z = 10..21)
    v.ellipsoid(cx, cy, 15, 7.2, 6.2, 5.5, (x, y, z) => (z < 12 ? 2 : z > 18 ? 3 : 1));
    // Chest core badge
    v.box(cx - 2, cy - 6, 14, cx + 2, cy - 6, 16, 5);
    v.box(cx - 1, cy - 6, 15, cx + 1, cy - 6, 15, 6);

    // Rear Jetpack housing
    v.box(cx - 6, cy + 4, 11, cx + 6, cy + 8, 19, 10);
    v.box(cx - 4, cy + 8, 13, cx + 4, cy + 8, 17, 3);

    // Stubby cute arms
    v.ellipsoid(cx - 9, cy - 1, 15, 2.4, 2.5, 3.5, 1);
    v.ellipsoid(cx + 9, cy - 1, 15, 2.4, 2.5, 3.5, 1);
    v.ellipsoid(cx - 9, cy - 2, 12, 2.0, 2.0, 1.8, 3);
    v.ellipsoid(cx + 9, cy - 2, 12, 2.0, 2.0, 1.8, 3);

    // Big Expressive TV/Helmet Head (z = 21..32)
    v.ellipsoid(cx, cy, 26.5, 8.6, 7.6, 5.8, (x, y, z) => (z < 23 ? 2 : 1));
    // Teal headphones on sides
    v.ellipsoid(cx - 9, cy, 26, 1.5, 3.2, 3.2, 3);
    v.ellipsoid(cx + 9, cy, 26, 1.5, 3.2, 3.2, 3);

    // Dark Visor Screen (front face y = cy - 7)
    v.box(cx - 6, cy - 7, 23, cx + 6, cy - 6, 29, 5);
    // Glowing Cyan Happy Cat Eyes (^ ^)
    v.box(cx - 4, cy - 7, 26, cx - 2, cy - 7, 27, 6);
    v.box(cx + 2, cy - 7, 26, cx + 4, cy - 7, 27, 6);
    // Cute cat mouth 'w'
    v.set(cx - 1, cy - 7, 24, 6);
    v.set(cx + 1, cy - 7, 24, 6);
    v.set(cx, cy - 7, 25, 6);
    // Blush pixels
    v.set(cx - 5, cy - 7, 24, 7);
    v.set(cx + 5, cy - 7, 24, 7);

    // Mechanical Cat Ears on top (z = 31..37)
    for (const side of [-1, 1]) {
      for (let i = 0; i <= 5; i++) {
        const z = 32 + i;
        const w = Math.max(0, 2 - Math.floor(i / 2));
        const ex = cx + side * (5 + Math.floor(i * 0.25));
        v.box(ex - w, cy - 1, z, ex + w, cy + 1, z, i === 5 ? 6 : 3);
        if (i >= 1 && i <= 3) v.set(ex, cy - 1, z, 6);
      }
    }

    return {
      id: 'mech',
      name: 'Neko-Bot Rétro',
      subtitle: '38 couches · Lévitation',
      icon: '🤖',
      width: W,
      depth: D,
      height: H,
      layers: v.layers,
      palette,
      defaultAnim: 'hover',
      defaultYaw: 0.35,
      defaultPitch: 24,
      defaultZoom: 5.6,
      pivotZ: 0,
      particleTheme: 'sparks',
    };
  }

  /* =========================================================================
     5. RELIQUE ALCHIMIQUE (36 × 36 × 42)
     ========================================================================= */
  function buildCrystalModel() {
    const palette = [
      null,
      { hex: '#334155', group: 1 }, // 1: Dark slate altar
      { hex: '#475569', group: 1 }, // 2: Slate highlight
      { hex: '#1e293b', group: 1 }, // 3: Deep altar
      { hex: '#f59e0b', group: 2 }, // 4: Gold filigree
      { hex: '#fde047', group: 2 }, // 5: Bright gold
      { hex: '#7c3aed', group: 3 }, // 6: Deep violet crystal
      { hex: '#a855f7', group: 3 }, // 7: Violet crystal
      { hex: '#38bdf8', group: 4, emissive: true }, // 8: Arcane cyan glow
      { hex: '#bae6fd', group: 4, emissive: true }, // 9: Bright crystal core
    ];

    const W = 36;
    const D = 36;
    const H = 42;
    const v = createVolume(W, D, H, palette);
    const cx = 18;
    const cy = 18;

    // Stepped octagonal rune altar base (z = 0..7)
    for (let z = 0; z <= 7; z++) {
      const rad = z < 3 ? 13 : z < 6 ? 11 : 8;
      for (let y = 0; y < D; y++) {
        for (let x = 0; x < W; x++) {
          const ax = Math.abs(x - cx);
          const ay = Math.abs(y - cy);
          if (ax <= rad && ay <= rad && ax + ay <= rad * 1.42) {
            const isRim = ax === rad || ay === rad || Math.abs(ax + ay - Math.floor(rad * 1.42)) <= 1;
            v.set(x, y, z, z === 7 && isRim ? 4 : z < 2 ? 3 : isRim ? 2 : 1);
          }
        }
      }
    }
    // Glowing arcane pool in center of altar
    v.cylinderZ(cx, cy, 7, 7, 4.5, 8);
    v.cylinderZ(cx, cy, 7, 7, 2.2, 9);

    // Four hovering runic obelisk shards around corners
    const corners = [
      [cx - 10, cy - 10],
      [cx + 10, cy - 10],
      [cx - 10, cy + 10],
      [cx + 10, cy + 10],
    ];
    for (const [ox, oy] of corners) {
      for (let z = 11; z <= 21; z++) {
        const w = z === 11 || z === 21 ? 0 : 1;
        v.box(ox - w, oy - w, z, ox + w, oy + w, z, z === 16 ? 8 : 2);
      }
      v.set(ox, oy, 22, 4);
    }

    // Large Central Faceted Levitating Diamond Crystal (z = 13..39)
    for (let z = 13; z <= 39; z++) {
      const dist = Math.abs(z - 26) / 13;
      const r = Math.max(0.6, (1 - dist) * 7.8);
      for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
        for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
          const manhattan = Math.abs(x - cx) + Math.abs(y - cy);
          if (manhattan <= r) {
            let col = 7;
            if (manhattan <= r * 0.45 && z > 20 && z < 33) col = 9;
            else if (x - cx > 0 && y - cy < 0) col = 8;
            else if (x - cx < 0 && y - cy > 0) col = 6;
            v.set(x, y, z, col);
          }
        }
      }
    }

    // Floating Golden Halo Ring around crystal
    for (let a = 0; a < 48; a++) {
      const ang = (a / 48) * Math.PI * 2;
      const rx = Math.round(cx + Math.cos(ang) * 10.5);
      const ry = Math.round(cy + Math.sin(ang) * 10.5);
      const rz = Math.round(26 + Math.sin(ang * 2) * 2);
      v.set(rx, ry, rz, a % 4 === 0 ? 5 : 4);
    }

    return {
      id: 'crystal',
      name: 'Relique Alchimique',
      subtitle: '42 couches · Cristal & Runes',
      icon: '💎',
      width: W,
      depth: D,
      height: H,
      layers: v.layers,
      palette,
      defaultAnim: 'hover',
      defaultYaw: 0.5,
      defaultPitch: 25,
      defaultZoom: 5.4,
      pivotZ: 0,
      particleTheme: 'runes',
    };
  }

  /* =========================================================================
     6. BLANK TEMPLATE FOR CUSTOM SCULPTING
     ========================================================================= */
  function buildBlankModel() {
    const palette = [
      null,
      { hex: '#eef4fa', group: 1 },
      { hex: '#94a3b8', group: 1 },
      { hex: '#334155', group: 2 },
      { hex: '#ef4444', group: 3 },
      { hex: '#f97316', group: 3 },
      { hex: '#facc15', group: 4 },
      { hex: '#22c55e', group: 5 },
      { hex: '#14b8a6', group: 5 },
      { hex: '#38bdf8', group: 6 },
      { hex: '#3b82f6', group: 6 },
      { hex: '#a855f7', group: 7 },
      { hex: '#ec4899', group: 7 },
      { hex: '#b47846', group: 8 },
      { hex: '#67e8f9', group: 9, emissive: true },
    ];
    const W = 32;
    const D = 32;
    const H = 28;
    const v = createVolume(W, D, H, palette);
    // Give a small starter pedestal voxel block so the user sees where center is
    v.box(13, 13, 0, 18, 18, 2, 9);
    v.box(14, 14, 3, 17, 17, 5, 1);

    return {
      id: 'custom',
      name: 'Création Libre',
      subtitle: '32×32 · 28 couches',
      icon: '✨',
      width: W,
      depth: D,
      height: H,
      layers: v.layers,
      palette,
      defaultAnim: 'turntable',
      defaultYaw: -0.5,
      defaultPitch: 28,
      defaultZoom: 6.2,
      pivotZ: 0,
      particleTheme: 'sparkles',
    };
  }

  StackStudio.PRESETS = [
    { id: 'shark', build: buildSharkModel },
    { id: 'torii', build: buildToriiModel },
    { id: 'car', build: buildCarModel },
    { id: 'mech', build: buildMechModel },
    { id: 'crystal', build: buildCrystalModel },
  ];

  StackStudio.buildBlankModel = buildBlankModel;

  StackStudio.serializeModel = function (model) {
    return JSON.stringify({
      format: 'stackcraft-v1',
      name: model.name,
      icon: model.icon || '✨',
      width: model.width,
      depth: model.depth,
      height: model.height,
      palette: model.palette,
      defaultAnim: model.defaultAnim || 'turntable',
      pivotZ: model.pivotZ || 0,
      particleTheme: model.particleTheme || 'sparkles',
      layers: model.layers.map((sl) => Array.from(sl)),
    });
  };

  StackStudio.deserializeModel = function (jsonStr) {
    const data = JSON.parse(jsonStr);
    if (!data || !Array.isArray(data.layers) || !data.width || !data.depth) {
      throw new Error('Format JSON StackCraft invalide.');
    }
    return {
      id: 'imported-' + Date.now(),
      name: data.name || 'Modèle Importé',
      subtitle: `${data.layers.length} couches · Importé`,
      icon: data.icon || '📦',
      width: data.width,
      depth: data.depth,
      height: data.layers.length,
      palette: data.palette,
      defaultAnim: data.defaultAnim || 'turntable',
      defaultYaw: -0.45,
      defaultPitch: 26,
      defaultZoom: 3.4,
      pivotZ: data.pivotZ || 0,
      particleTheme: data.particleTheme || 'sparkles',
      layers: data.layers.map((arr) => new Uint8Array(arr)),
    };
  };
})(window);
