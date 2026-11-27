// Nusantara Sky Courier — heads-up display, gauges and screens.
// One job: every number and label the pilot reads, drawn legibly.

import { clamp } from './random.js';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(8,18,32,0.62)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.message = '';
    this.messageUntil = 0;
  }

  showMessage(text, seconds, now) {
    this.message = text;
    this.messageUntil = now + seconds;
  }

  drawBar(ctx, x, y, w, h, frac, colour, label) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.roundRect(x, y, w * clamp(frac, 0, 1), h, 4);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 6, y + h / 2);
  }

  drawFlightHud(plane, mission, score, timeLeft, now) {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.textBaseline = 'alphabetic';
    // Top-left: speed, altitude, vertical speed.
    panel(ctx, 16, 14, 218, 108);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = '#9fd0ff';
    ctx.fillText('AIRSPEED', 30, 38);
    ctx.fillText('ALTITUDE', 30, 66);
    ctx.fillText('VERT SPD', 30, 94);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`${plane.speedKts} kt`, 130, 40);
    ctx.fillText(`${plane.altitudeFt.toLocaleString()} ft`, 130, 68);
    const vs = Math.round(plane.vspeed * 196.85);
    ctx.fillStyle = vs > 100 ? '#8dff9a' : vs < -100 ? '#ff9a8a' : '#fff';
    ctx.fillText(`${vs > 0 ? '+' : ''}${vs} fpm`, 130, 96);
    // Top-centre: heading compass tape.
    const tapeW = 420;
    const tapeX = width / 2 - tapeW / 2;
    panel(ctx, tapeX, 14, tapeW, 54);
    ctx.save();
    ctx.beginPath();
    ctx.rect(tapeX, 14, tapeW, 54);
    ctx.clip();
    const deg = plane.headingDeg;
    for (let d = -60; d <= 60; d += 5) {
      const h = (deg + d + 360) % 360;
      const x = tapeX + tapeW / 2 + d * 3.2;
      const major = h % 30 === 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, 56);
      ctx.lineTo(x, major ? 36 : 46);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[h] || String(h).padStart(3, '0');
        ctx.fillText(label, x, 30);
      }
    }
    ctx.restore();
    ctx.fillStyle = '#ffb400';
    ctx.beginPath();
    ctx.moveTo(width / 2 - 7, 14);
    ctx.lineTo(width / 2 + 7, 14);
    ctx.lineTo(width / 2, 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${String(deg).padStart(3, '0')}°`, width / 2, 62);
    // Top-right: mission, score, timer.
    panel(ctx, width - 268, 14, 252, 108);
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = '#ffd27a';
    ctx.fillText(mission ? mission.name.toUpperCase() : 'FREE FLIGHT', width - 254, 38);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText(`SCORE  ${score.toLocaleString()}`, width - 254, 66);
    if (Number.isFinite(timeLeft)) {
      const mm = Math.floor(Math.max(0, timeLeft) / 60);
      const ss = Math.floor(Math.max(0, timeLeft) % 60);
      ctx.fillStyle = timeLeft < 60 ? '#ff8a7a' : '#fff';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText(`TIME  ${mm}:${String(ss).padStart(2, '0')}`, width - 254, 94);
    } else {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText('TIME  --:--', width - 254, 94);
    }
    // Bottom-left: throttle + fuel.
    panel(ctx, 16, height - 96, 250, 80);
    this.drawBar(ctx, 30, height - 82, 222, 18, plane.throttle, '#ffb400', `THR ${Math.round(plane.throttle * 100)}%`);
    this.drawBar(ctx, 30, height - 56, 222, 18, plane.fuel / 100, plane.fuel < 20 ? '#ff5a4a' : '#4ac96a', `FUEL ${Math.round(plane.fuel)}%`);
    ctx.fillStyle = '#fff';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(
      `${plane.flaps ? 'FLAPS ' : ''}${plane.gearDown ? 'GEAR DOWN' : 'GEAR UP'}${plane.state === 'flying' && plane.speed < 30 ? '  • STALL!' : ''}`,
      30,
      height - 26,
    );
    // Bottom-right: controls reminder + mouse steer state.
    panel(ctx, width - 316, height - 96, 300, 80);
    ctx.fillStyle = '#cfe4ff';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('W/S throttle • Arrows pitch & roll', width - 302, height - 72);
    ctx.fillText('A/D rudder • F flaps • G gear • B drop', width - 302, height - 52);
    ctx.fillText('C camera • X mouse steer • P pause', width - 302, height - 32);
    // Centre message.
    if (this.message && now < this.messageUntil) {
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      const w = ctx.measureText(this.message).width + 36;
      ctx.beginPath();
      ctx.roundRect(width / 2 - w / 2, height * 0.30 - 24, w, 48, 10);
      ctx.fill();
      ctx.fillStyle = '#ffe08a';
      ctx.fillText(this.message, width / 2, height * 0.30 + 8);
    }
    // Stall / low-fuel warnings.
    if (plane.state === 'flying' && plane.speed < 30) {
      ctx.font = 'bold 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff6a5a';
      ctx.fillText('⚠ STALL — NOSE DOWN, FULL THROTTLE', width / 2, height * 0.22);
    }
  }

  // Round cockpit gauges: artificial horizon, airspeed, altimeter, fuel.
  drawGauges(ctx, plane, cx, cy) {
    const drawDial = (x, y, r, label, value, max, unit, colour) => {
      ctx.fillStyle = '#0d1117';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a4350';
      ctx.lineWidth = 2;
      ctx.stroke();
      const a = -Math.PI * 0.75 + (clamp(value / max, 0, 1) * Math.PI * 1.5);
      ctx.strokeStyle = colour;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, y, r - 6, -Math.PI * 0.75, a);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(Math.round(value)), x, y + 5);
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = '#9fb2c8';
      ctx.fillText(label, x, y + r - 10);
      ctx.fillText(unit, x, y - r + 16);
    };
    // Artificial horizon.
    const hx = cx - 210;
    const hy = cy;
    const hr = 52;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(hx, hy);
    ctx.rotate(-plane.roll);
    ctx.translate(0, plane.pitch * 130);
    ctx.fillStyle = '#3f8fd2';
    ctx.fillRect(-hr, -hr * 2, hr * 2, hr * 2);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-hr, 0, hr * 2, hr * 2);
    ctx.restore();
    ctx.strokeStyle = '#c8d4e0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ffd27a';
    ctx.beginPath();
    ctx.moveTo(hx - 18, hy);
    ctx.lineTo(hx + 18, hy);
    ctx.stroke();
    ctx.fillStyle = '#9fb2c8';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATTITUDE', hx, hy + hr + 14);
    drawDial(cx - 60, cy, 46, 'AIRSPEED', plane.speedKts, 180, 'kt', '#4ac96a');
    drawDial(cx + 60, cy, 46, 'ALTITUDE', plane.altitudeFt, 12000, 'ft', '#4aa8ff');
    drawDial(cx + 200, cy, 46, 'FUEL', plane.fuel, 100, '%', plane.fuel < 20 ? '#ff5a4a' : '#ffb400');
    // Heading readout under the horizon.
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText(`HDG ${String(plane.headingDeg).padStart(3, '0')}°`, hx, hy - hr - 10);
  }

  drawMenu(missions, selected, best) {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.fillStyle = 'rgba(6,14,26,0.55)';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd27a';
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillText('NUSANTARA SKY COURIER', width / 2, 120);
    ctx.fillStyle = '#eaf4ff';
    ctx.font = '20px system-ui, sans-serif';
    ctx.fillText('Island-hopping courier flights across the Indonesian archipelago', width / 2, 156);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = '#9fd0ff';
    ctx.fillText('Take off • thread the golden rings • land gently • mind your fuel', width / 2, 184);
    missions.forEach((m, i) => {
      const y = 250 + i * 92;
      const sel = i === selected;
      ctx.fillStyle = sel ? 'rgba(255,180,0,0.22)' : 'rgba(8,18,32,0.6)';
      ctx.beginPath();
      ctx.roundRect(width / 2 - 360, y, 720, 76, 12);
      ctx.fill();
      ctx.strokeStyle = sel ? '#ffb400' : 'rgba(255,255,255,0.25)';
      ctx.lineWidth = sel ? 3 : 1;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${m.short}. ${m.name}`, width / 2 - 336, y + 32);
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillStyle = '#cfe4ff';
      ctx.fillText(m.briefing, width / 2 - 336, y + 58);
      if (best[m.id] !== undefined) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#8dff9a';
        ctx.font = 'bold 15px system-ui, sans-serif';
        ctx.fillText(`BEST ${best[m.id].toLocaleString()}`, width / 2 + 336, y + 32);
      }
    });
    const fy = 250 + missions.length * 92 + 18;
    ctx.fillStyle = '#fff';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Press 1–3 to fly a sortie, or 0 for Free Flight • ↑↓ to choose • Enter to start', width / 2, fy);
    ctx.fillStyle = '#9fd0ff';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('W/S throttle • Arrow keys pitch & roll • A/D rudder • F flaps • G gear • C camera • X mouse steer', width / 2, fy + 26);
    ctx.fillText('Land on the runway, gear down, slow and level — a smooth landing pays extra.', width / 2, fy + 50);
  }

  drawEnd(title, lines, accent) {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.fillStyle = 'rgba(6,14,26,0.62)';
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = 'bold 48px system-ui, sans-serif';
    ctx.fillText(title, width / 2, height / 2 - 90);
    ctx.fillStyle = '#fff';
    ctx.font = '20px system-ui, sans-serif';
    lines.forEach((line, i) => {
      ctx.fillText(line, width / 2, height / 2 - 40 + i * 34);
    });
    ctx.fillStyle = '#9fd0ff';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('Press R to fly again • M for the mission menu', width / 2, height / 2 + 90);
  }
}
