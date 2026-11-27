// Nusantara Sky Courier — all drawing: sky, sea, terrain, runway, rings,
// clouds, the aircraft and particles. One job: make the world look alive.

import { COLOURS, WORLD } from './config.js';
import { clamp, lerp } from './random.js';
import { groundHeight, runwayCorners } from './terrain.js';
import { RUNWAYS } from './config.js';

function hexToRgb(c) {
  // Colours come as hex ('#5da24a') or as the rgb() string mix() returns
  // — the fog pass mixes an already-mixed colour, and feeding 'rgb(..)'
  // into parseInt used to yield [0,0,0], painting all grass, forest and
  // sea quads black.
  if (c.startsWith('rgb')) return c.match(/\d+/g).slice(0, 3).map(Number);
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return `rgb(${Math.round(lerp(ca[0], cb[0], t))},${Math.round(lerp(ca[1], cb[1], t))},${Math.round(lerp(ca[2], cb[2], t))})`;
}

export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;
    this.particles = [];
  }

  addBurst(x, y, z, colour, n) {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        z: z + (Math.random() - 0.5) * 6,
        life: 0.7 + Math.random() * 0.5,
        colour,
      });
    }
  }

  drawSky(dusk) {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    const horizon = this.camera.horizonY();
    const top = dusk ? '#2b2a55' : COLOURS.skyTop;
    const mid = dusk ? '#b65a4e' : COLOURS.skyMid;
    const low = dusk ? '#f2a35e' : COLOURS.skyLow;
    const g = ctx.createLinearGradient(0, 0, 0, height);
    g.addColorStop(0, top);
    g.addColorStop(Math.max(0, horizon / height - 0.12), mid);
    g.addColorStop(Math.min(1, horizon / height + 0.02), low);
    g.addColorStop(1, dusk ? '#3a2f4d' : COLOURS.seaDeep);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    // Sun (or low dusk sun) with a soft halo.
    const sunY = dusk ? horizon - 40 : 110;
    const sunX = width * 0.76;
    const halo = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 130);
    halo.addColorStop(0, dusk ? 'rgba(255,190,90,0.95)' : 'rgba(255,246,200,0.95)');
    halo.addColorStop(0.25, dusk ? 'rgba(255,150,70,0.45)' : 'rgba(255,240,170,0.4)');
    halo.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(sunX - 140, sunY - 140, 280, 280);
    ctx.fillStyle = dusk ? '#ffd27a' : '#fff7cf';
    ctx.beginPath();
    ctx.arc(sunX, sunY, dusk ? 30 : 26, 0, Math.PI * 2);
    ctx.fill();
  }

  drawTerrain(plane, dusk) {
    const ctx = this.ctx;
    const cam = this.camera;
    const cell = 130;
    const half = 20; // 41 x 41 cells around the plane
    const cx0 = Math.floor(plane.x / cell) * cell - half * cell;
    const cz0 = Math.floor(plane.z / cell) * cell - half * cell;
    // Collect quads with a depth key, far first.
    const quads = [];
    for (let j = 0; j < half * 2; j++) {
      for (let i = 0; i < half * 2; i++) {
        const x0 = cx0 + i * cell;
        const z0 = cz0 + j * cell;
        const pts = [
          { x: x0, y: groundHeight(x0, z0), z: z0 },
          { x: x0 + cell, y: groundHeight(x0 + cell, z0), z: z0 },
          { x: x0 + cell, y: groundHeight(x0 + cell, z0 + cell), z: z0 + cell },
          { x: x0, y: groundHeight(x0, z0 + cell), z: z0 + cell },
        ];
        const midX = x0 + cell / 2 - cam.pos.x;
        const midZ = z0 + cell / 2 - cam.pos.z;
        const depth = midX * midX + midZ * midZ;
        quads.push({ pts, depth, avgH: (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4 });
      }
    }
    quads.sort((a, b) => b.depth - a.depth);
    for (const q of quads) {
      const sp = q.pts.map((p) => cam.project(p));
      if (sp.some((p) => p === null)) continue;
      if (sp.every((p) => p.x < -80 || p.x > this.canvas.width + 80 || p.y < -80 || p.y > this.canvas.height + 80)) {
        continue;
      }
      const h = q.avgH;
      let colour;
      if (h < 1.5) colour = mix(COLOURS.seaShallow, COLOURS.seaDeep, clamp(h / 1.5 + 0.5, 0, 1));
      else if (h < 4) colour = COLOURS.sand;
      else if (h < 90) colour = mix(COLOURS.grass, COLOURS.forest, clamp((h - 40) / 90, 0, 1));
      else if (h < 220) colour = mix(COLOURS.forest, COLOURS.rock, clamp((h - 140) / 120, 0, 1));
      else if (h < 330) colour = COLOURS.rock;
      else colour = COLOURS.snow;
      if (h < 1.5) {
        // Water: darker with distance, with a faint sparkle by position.
        const fog = clamp(q.depth / (5200 * 5200), 0, 0.55);
        colour = mix(colour, dusk ? '#2c3a5e' : COLOURS.skyLow, fog);
      } else {
        const fog = clamp(q.depth / (6000 * 6000), 0, 0.5);
        colour = mix(colour, dusk ? '#4a4468' : '#bcd8ee', fog);
      }
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.moveTo(sp[0].x, sp[0].y);
      for (let k = 1; k < 4; k++) ctx.lineTo(sp[k].x, sp[k].y);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawRunway(key, dusk) {
    const ctx = this.ctx;
    const cam = this.camera;
    const corners = runwayCorners(key).map((p) => cam.project(p));
    if (corners.some((p) => p === null)) return;
    ctx.fillStyle = dusk ? '#2c2f36' : COLOURS.runway;
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let k = 1; k < 4; k++) ctx.lineTo(corners[k].x, corners[k].y);
    ctx.closePath();
    ctx.fill();
    // Centreline dashes.
    const r = RUNWAYS[key];
    const ax = Math.sin(r.heading);
    const az = -Math.cos(r.heading);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    for (let d = -r.length / 2 + 40; d < r.length / 2 - 20; d += 80) {
      const p1 = cam.project({ x: r.x + ax * d, y: r.elev + 0.7, z: r.z + az * d });
      const p2 = cam.project({ x: r.x + ax * (d + 38), y: r.elev + 0.7, z: r.z + az * (d + 38) });
      if (!p1 || !p2) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    // Threshold bars and edge lights.
    for (const side of [-1, 1]) {
      for (let d = -r.length / 2 + 20; d <= r.length / 2 - 20; d += 60) {
        const bx = Math.cos(r.heading) * side * (WORLD.runwayWidth / 2 - 2);
        const bz = Math.sin(r.heading) * side * (WORLD.runwayWidth / 2 - 2);
        const p = cam.project({ x: r.x + ax * d + bx, y: r.elev + 1, z: r.z + az * d + bz });
        if (!p) continue;
        ctx.fillStyle = dusk ? '#7dff9a' : '#b6ff9a';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.5, 260 / p.depth), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawDropZone(zone) {
    if (!zone) return;
    const ctx = this.ctx;
    const cam = this.camera;
    ctx.strokeStyle = 'rgba(255,70,60,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    let started = false;
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 24) {
      const p = cam.project({
        x: zone.x + Math.cos(a) * zone.r,
        y: 2,
        z: zone.z + Math.sin(a) * zone.r,
      });
      if (!p) continue;
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  drawRing(ring, passed, isNext, time) {
    const ctx = this.ctx;
    const cam = this.camera;
    const R = 26;
    const c = cam.project(ring);
    if (!c) return;
    const scale = c.scale;
    const radiusPx = R * scale;
    if (radiusPx < 2 || radiusPx > 4000) return;
    // Ring faces the incoming aircraft: draw as a circle in the plane
    // perpendicular to the line from the camera, approximated in screen space.
    ctx.save();
    ctx.translate(c.x, c.y);
    const pulse = isNext ? 1 + Math.sin(time * 4) * 0.06 : 1;
    ctx.scale(pulse, pulse);
    ctx.lineWidth = Math.max(2, radiusPx * 0.09);
    ctx.strokeStyle = passed ? 'rgba(120,220,120,0.75)' : isNext ? COLOURS.ring : 'rgba(255,180,0,0.55)';
    ctx.shadowColor = isNext ? COLOURS.ringGlow : 'transparent';
    ctx.shadowBlur = isNext ? 18 : 0;
    ctx.beginPath();
    ctx.arc(0, 0, radiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = passed ? 'rgba(120,220,120,0.25)' : 'rgba(255,180,0,0.10)';
    ctx.beginPath();
    ctx.arc(0, 0, radiusPx, 0, Math.PI * 2);
    ctx.fill();
    if (isNext) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(12, radiusPx * 0.28)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('NEXT', 0, 0);
    }
    ctx.restore();
  }

  drawClouds(clouds, dusk) {
    const ctx = this.ctx;
    const cam = this.camera;
    const list = [];
    for (const cl of clouds) {
      const p = cam.project({ x: cl.x, y: cl.y, z: cl.z });
      if (!p || p.depth < 50) continue;
      list.push({ cl, p });
    }
    list.sort((a, b) => b.p.depth - a.p.depth);
    for (const { cl, p } of list) {
      const s = p.scale;
      const r = cl.r * s;
      if (r < 2) continue;
      ctx.fillStyle = dusk ? 'rgba(214,178,196,0.55)' : 'rgba(255,255,255,0.75)';
      for (let k = 0; k < cl.puffs; k++) {
        const ang = (k / cl.puffs) * Math.PI * 2 + cl.seed;
        const ox = Math.cos(ang) * r * 0.55;
        const oy = Math.sin(ang) * r * 0.22;
        ctx.beginPath();
        ctx.ellipse(p.x + ox, p.y + oy, r * 0.55, r * 0.26, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawParticles(dt) {
    const ctx = this.ctx;
    const cam = this.camera;
    this.particles = this.particles.filter((pt) => (pt.life -= dt) > 0);
    for (const pt of this.particles) {
      const p = cam.project(pt);
      if (!p) continue;
      ctx.globalAlpha = clamp(pt.life, 0, 1);
      ctx.fillStyle = pt.colour;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.5, 300 / p.depth), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // The aircraft, drawn in screen space from directly behind (chase view).
  drawPlane(plane, time) {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    const cx = width / 2;
    const cy = height * 0.60;
    const scale = 1.15;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(plane.roll * 0.9);
    ctx.scale(scale, scale);
    // Soft shadow blob under the plane on the ground is skipped: the chase
    // camera is close, so draw the plane itself, banked with the roll.
    // Wings (far wing first).
    ctx.fillStyle = '#c33d2e';
    ctx.beginPath();
    ctx.moveTo(-150, 6);
    ctx.lineTo(150, 6);
    ctx.lineTo(128, 26);
    ctx.lineTo(-128, 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8e2d4';
    ctx.fillRect(-150, 6, 300, 5);
    // Tailplane.
    ctx.fillStyle = '#a93226';
    ctx.beginPath();
    ctx.moveTo(-52, -52);
    ctx.lineTo(52, -52);
    ctx.lineTo(40, -38);
    ctx.lineTo(-40, -38);
    ctx.closePath();
    ctx.fill();
    // Fuselage: tapered body with a red cheatline and round windows.
    const body = ctx.createLinearGradient(0, -70, 0, 40);
    body.addColorStop(0, '#f7f3ea');
    body.addColorStop(0.55, '#efe7d6');
    body.addColorStop(1, '#d8cdb4');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -78);
    ctx.quadraticCurveTo(26, -60, 24, -10);
    ctx.quadraticCurveTo(22, 30, 12, 52);
    ctx.quadraticCurveTo(0, 62, -12, 52);
    ctx.quadraticCurveTo(-22, 30, -24, -10);
    ctx.quadraticCurveTo(-26, -60, 0, -78);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c33d2e';
    ctx.fillRect(-24, -18, 48, 7);
    // Cockpit windows.
    ctx.fillStyle = '#16324a';
    ctx.beginPath();
    ctx.moveTo(-14, -58);
    ctx.lineTo(14, -58);
    ctx.lineTo(18, -34);
    ctx.lineTo(-18, -34);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(-12, -56);
    ctx.lineTo(-2, -56);
    ctx.lineTo(-2, -38);
    ctx.lineTo(-12, -38);
    ctx.closePath();
    ctx.fill();
    // Vertical fin.
    ctx.fillStyle = '#c33d2e';
    ctx.beginPath();
    ctx.moveTo(0, -66);
    ctx.lineTo(16, -30);
    ctx.lineTo(6, -26);
    ctx.lineTo(-2, -34);
    ctx.closePath();
    ctx.fill();
    // Propeller disc + spinner (spins with time and throttle).
    const propSpeed = 0.4 + plane.throttle * 2.2;
    ctx.save();
    ctx.translate(0, 58);
    ctx.rotate(Math.sin(time * propSpeed * 9) * 0.12);
    ctx.fillStyle = 'rgba(40,40,50,0.28)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 46, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#8a2f22';
    ctx.beginPath();
    ctx.arc(0, 58, 6, 0, Math.PI * 2);
    ctx.fill();
    // Navigation lights.
    ctx.fillStyle = '#ff4040';
    ctx.beginPath();
    ctx.arc(-150, 14, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#40ff70';
    ctx.beginPath();
    ctx.arc(150, 14, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Cockpit view: nose cone + lit instrument panel across the bottom.
  drawCockpit(plane, hud) {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    // Nose cone at the bottom centre.
    ctx.fillStyle = '#e9e2d2';
    ctx.beginPath();
    ctx.moveTo(width / 2 - 260, height);
    ctx.quadraticCurveTo(width / 2, height - 190, width / 2 + 260, height);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c33d2e';
    ctx.fillRect(width / 2 - 260, height - 26, 520, 26);
    // Instrument panel.
    const panelH = 168;
    const panelY = height - panelH;
    const g = ctx.createLinearGradient(0, panelY, 0, height);
    g.addColorStop(0, '#23272e');
    g.addColorStop(1, '#101216');
    ctx.fillStyle = g;
    ctx.fillRect(0, panelY, width, panelH);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, panelY + 4, width - 8, panelH - 8);
    hud.drawGauges(ctx, plane, width / 2, panelY + panelH / 2);
  }
}
