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
     1. REQUIN PELUCHE SUSPENDU (Blåhaj Homage — Ryu's Tweet!)
     ========================================================================= */
  function buildSharkModel() {
    const palette = [
      null,
      { hex: '#6c98bc', group: 1 }, // 1: Blåhaj slate blue
      { hex: '#8db7d8', group: 1 }, // 2: Light blue top highlight
      { hex: '#4f7799', group: 1 }, // 3: Deep blue fin/shadow
      { hex: '#eef4fa', group: 2 }, // 4: Plush white belly
      { hex: '#d1deeb', group: 2 }, // 5: Belly shadow
      { hex: '#f292a6', group: 3 }, // 6: Mouth pink
      { hex: '#c85b74', group: 3 }, // 7: Deep mouth pink
      { hex: '#ffffff', group: 4 }, // 8: Teeth & eye shine
      { hex: '#1b2030', group: 4 }, // 9: Eyes
      { hex: '#dc3244', group: 5 }, // 10: Red harness cord
      { hex: '#a41c2c', group: 5 }, // 11: Dark red cord
      { hex: '#c0824d', group: 6 }, // 12: Wooden peg
      { hex: '#88532a', group: 6 }, // 13: Dark wood peg
    ];

    const W = 48;
    const D = 32;
    const H = 44;
    const v = createVolume(W, D, H, palette);
    const cy = 16;

    // Cross-section profile of the Blåhaj plushie along X (x = 5..42)
    function bodyProfile(x) {
      if (x < 5 || x > 42) return null;
      const t = (x - 5) / 37; // 0 = snout tip, 1 = tail base
      let rxY, rxZ, centerZ;
      if (t < 0.28) {
        // Snout to head
        const k = Math.pow(t / 0.28, 0.62);
        rxY = 1.6 + k * 5.2;
        rxZ = 1.4 + k * 4.5;
        centerZ = 15.2 + Math.sin(t * Math.PI) * 1.2;
      } else if (t < 0.68) {
        // Chubby torso
        const k = (t - 0.28) / 0.40;
        const bulge = Math.sin(k * Math.PI);
        rxY = 6.8 - k * 2.2 + bulge * 0.7;
        rxZ = 5.9 - k * 1.9 + bulge * 0.6;
        centerZ = 16.0 - k * 0.5;
      } else {
        // Tapering tail stock curving slightly up
        const k = (t - 0.68) / 0.32;
        rxY = Math.max(1.2, 4.6 * (1 - k * 0.72));
        rxZ = Math.max(1.3, 4.0 * (1 - k * 0.66));
        centerZ = 15.5 + k * 2.2;
      }
      return { rxY, rxZ, centerZ };
    }

    // 1. Sculpt main plushie body
    for (let x = 5; x <= 42; x++) {
      const p = bodyProfile(x);
      if (!p) continue;
      for (let z = 6; z <= 27; z++) {
        const dz = (z - p.centerZ) / p.rxZ;
        for (let y = 4; y <= 28; y++) {
          const dy = (y - cy) / p.rxY;
          const d = dy * dy + dz * dz;
          if (d <= 1.0) {
            // Belly curve rises slightly near the snout
            const bellySplit = p.centerZ - (x < 15 ? 0.5 : 0.7);
            let col;
            if (z < bellySplit) {
              col = dz < -0.55 ? 5 : 4;
            } else {
              col = dz > 0.65 && Math.abs(dy) < 0.55 ? 2 : 1;
            }
            v.set(x, y, z, col);
          }
        }
      }
    }

    // 2. Carve cute open mouth & pink interior + white triangular teeth
    for (let x = 6; x <= 14; x++) {
      const k = (x - 6) / 8;
      const halfW = 1.5 + k * 3.1;
      const zBot = Math.round(12.2 - k * 1.0);
      const zTop = Math.round(14.8 - k * 0.4);
      for (let z = zBot; z <= zTop; z++) {
        for (let y = Math.floor(cy - halfW); y <= Math.ceil(cy + halfW); y++) {
          if (x <= 12 && z > zBot && z < zTop && Math.abs(y - cy) < halfW - 0.8) {
            // hollow inner mouth
            v.set(x, y, z, 0);
          } else if (z === zBot && x >= 7 && x <= 13) {
            // pink lower tongue/mouth floor
            v.set(x, y, z, x > 10 ? 7 : 6);
          } else if (x >= 12 && z > zBot && z < zTop) {
            // back of throat pink
            v.set(x, y, z, 7);
          }
        }
      }
      // Crisp white teeth along upper lip edge
      if (x >= 7 && x <= 13 && x % 2 === 1) {
        const lipY = Math.round(halfW - 0.3);
        v.set(x, cy - lipY, zTop, 8);
        v.set(x, cy + lipY, zTop, 8);
      }
    }
    // Front snout teeth
    v.set(7, cy - 1, 14, 8);
    v.set(7, cy + 1, 14, 8);
    // Lower jaw lip white rim
    for (let x = 7; x <= 13; x++) {
      const w = 1.4 + ((x - 7) / 6) * 2.8;
      v.set(x, cy - Math.round(w), 11, 4);
      v.set(x, cy + Math.round(w), 11, 4);
    }

    // 3. Cute shiny eyes on both sides of head
    for (const side of [-1, 1]) {
      const ey = cy + side * 5;
      v.set(12, ey, 17, 9);
      v.set(13, ey, 17, 9);
      v.set(12, ey, 18, 9);
      v.set(13, ey, 18, 8); // bright eye glint
    }

    // 4. Dorsal Fin (sweeping gracefully backward)
    for (let z = 20; z <= 29; z++) {
      const k = (z - 20) / 9;
      const xStart = Math.round(21 + k * 6.5);
      const xEnd = Math.round(29 - k * 0.6);
      const halfThick = k > 0.7 ? 0.6 : 1.1;
      for (let x = xStart; x <= xEnd; x++) {
        for (let y = Math.floor(cy - halfThick); y <= Math.ceil(cy + halfThick); y++) {
          v.set(x, y, z, z > 26 ? 2 : 1);
        }
      }
    }

    // 5. Pectoral Fins (left & right swept back and slightly downward)
    for (const side of [-1, 1]) {
      for (let i = 0; i <= 9; i++) {
        const k = i / 9;
        const fy = cy + side * (5 + i);
        const fx0 = Math.round(18 + k * 7);
        const fx1 = Math.round(24 + k * 4.5 - k * k * 2.5);
        const fz = Math.round(13.5 - k * 3.8);
        for (let x = fx0; x <= fx1; x++) {
          v.set(x, fy, fz, 1);
          v.set(x, fy, fz + 1, k < 0.5 ? 2 : 1);
          if (k < 0.7) v.set(x, fy, fz - 1, 3);
        }
      }
    }

    // 6. Forked Crescent Tail Fin (classic Blåhaj silhouette!)
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      // Upper tail lobe (taller)
      const ux = Math.round(39 + i * 0.75);
      const uz = Math.round(18 + i * 1.15);
      for (let dx = -1; dx <= 1; dx++) {
        v.set(ux + dx, cy, uz, 1);
        v.set(ux + dx, cy - 1, uz, k < 0.6 ? 1 : 0);
        v.set(ux + dx, cy + 1, uz, k < 0.6 ? 1 : 0);
      }
      // Lower tail lobe (shorter)
      if (i <= 5) {
        const lx = Math.round(40 + i * 0.7);
        const lz = Math.round(16 - i * 0.95);
        v.set(lx, cy, lz, 3);
        v.set(lx + 1, cy, lz, 1);
      }
    }

    // 7. Decorative Red Crisscross Harness Cords hugging the shark's torso!
    function wrapRing(xCenter, slantX, col) {
      for (let a = 0; a < 72; a++) {
        const ang = (a / 72) * Math.PI * 2;
        const x = Math.round(xCenter + Math.sin(ang) * slantX);
        const p = bodyProfile(x);
        if (!p) continue;
        const y = Math.round(cy + Math.cos(ang) * (p.rxY + 0.55));
        const z = Math.round(p.centerZ + Math.sin(ang) * (p.rxZ + 0.55));
        v.set(x, y, z, col);
      }
    }

    // Three crisscross diamond bands around the plush body
    wrapRing(18, 2.2, 10);
    wrapRing(19, -2.2, 11);
    wrapRing(25, 2.6, 10);
    wrapRing(26, -2.6, 10);
    wrapRing(32, 2.2, 11);
    wrapRing(33, -2.0, 10);

    // Side longitudinal connecting cords
    for (const side of [-1, 1]) {
      for (let x = 18; x <= 33; x++) {
        const p = bodyProfile(x);
        if (!p) continue;
        const y = Math.round(cy + side * (p.rxY + 0.55));
        const z = Math.round(p.centerZ);
        v.set(x, y, z, 10);
      }
    }

    // 8. Suspension Ropes converging from torso harness up to the top wooden peg!
    const pegX = 24;
    const pegY = cy;
    const pegZ = 39;
    v.line3D(18, cy - 5, 21, pegX, pegY, pegZ, 10);
    v.line3D(18, cy + 5, 21, pegX, pegY, pegZ, 10);
    v.line3D(31, cy - 4, 20, pegX, pegY, pegZ, 11);
    v.line3D(31, cy + 4, 20, pegX, pegY, pegZ, 11);
    // Knot right under peg
    v.box(pegX - 1, pegY - 1, pegZ - 1, pegX + 1, pegY + 1, pegZ, 11);

    // 9. Wooden Anchor Peg at top
    v.cylinderZ(pegX, pegY, pegZ + 1, 43, 1.5, 12);
    v.set(pegX - 1, pegY - 1, 42, 13);
    v.set(pegX - 1, pegY - 1, 41, 13);

    return {
      id: 'shark',
      name: 'Requin Peluche Suspendu',
      subtitle: '44 couches · Hommage Blåhaj',
      icon: '🦈',
      width: W,
      depth: D,
      height: H,
      layers: v.layers,
      palette,
      defaultAnim: 'pendulum',
      defaultYaw: -0.42,
      defaultPitch: 22,
      defaultZoom: 5.5,
      pivotZ: 41,
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
