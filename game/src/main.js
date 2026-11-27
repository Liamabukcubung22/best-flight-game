// Nusantara Sky Courier — game loop, screens and wiring.
// One job: own the state machine (menu / flying / paused / ended) and call
// the plane, missions, renderer and HUD in the right order, every frame.

import { MISSIONS, RUNWAYS, WORLD } from './config.js';
import { Plane } from './plane.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { Camera, makeClouds, groundHeight } from './terrain.js';
import { Renderer } from './render.js';
import { Hud } from './hud.js';
import { Mission, Wind, Autopilot, missionById } from './missions.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const params = new URLSearchParams(window.location.search);
const SHOT = params.get('shot');
const SELFTEST = params.get('selftest') === '1';

function loadBest() {
  try {
    return JSON.parse(window.localStorage.getItem('nsc-best-v1') || '{}');
  } catch (err) {
    return {};
  }
}

function saveBest(best) {
  try {
    window.localStorage.setItem('nsc-best-v1', JSON.stringify(best));
  } catch (err) {
    /* storage unavailable (file://, private mode) — best scores just reset */
  }
}

export class Game {
  constructor() {
    this.canvas = canvas;
    this.camera = new Camera(canvas.width, canvas.height);
    this.renderer = new Renderer(canvas, this.camera);
    this.hud = new Hud(canvas);
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.plane = new Plane();
    this.clouds = makeClouds(4242, 42);
    this.missionsDef = MISSIONS;
    this.state = 'menu'; // menu | flying | paused | ended
    this.selected = 0;
    this.mission = null;
    this.wind = new Wind(2, 99);
    this.cameraMode = 'chase';
    this.best = loadBest();
    this.end = null;
    this.time = 0;
    this.last = performance.now();
    this.autopilot = new Autopilot();
    this.frozen = false; // screenshot mode: render, don't simulate
    window.__game = this;
  }

  startMission(def) {
    this.mission = new Mission(def);
    this.plane.resetToRunway(def.startRunway);
    this.wind = new Wind(def.wind, def.id.length * 131 + 7);
    this.cameraMode = 'chase';
    this.end = null;
    this.state = 'flying';
    this.camera.follow(this.plane, 0, true);
    this.audio.ensure();
    this.hud.showMessage(def.name + ' — full throttle (W) to take off!', 4, this.time);
  }

  startFreeFlight() {
    this.mission = null;
    this.plane.resetToRunway('banda');
    this.wind = new Wind(2, 99);
    this.cameraMode = 'chase';
    this.end = null;
    this.state = 'flying';
    this.camera.follow(this.plane, 0, true);
    this.audio.ensure();
    this.hud.showMessage('Free Flight — explore the islands', 4, this.time);
  }

  endMission(title, lines, accent) {
    this.state = 'ended';
    this.end = { title, lines, accent };
    if (this.mission && this.mission.finished) {
      const prev = this.best[this.mission.def.id] || 0;
      if (this.mission.score > prev) {
        this.best[this.mission.def.id] = this.mission.score;
        saveBest(this.best);
      }
    }
  }

  handleMenuKeys() {
    const input = this.input;
    if (input.take('ArrowDown')) this.selected = (this.selected + 1) % MISSIONS.length;
    if (input.take('ArrowUp')) this.selected = (this.selected - 1 + MISSIONS.length) % MISSIONS.length;
    if (input.take('Enter')) {
      this.startMission(MISSIONS[this.selected]);
      return;
    }
    for (let i = 0; i < MISSIONS.length; i++) {
      if (input.take(String(i + 1))) {
        this.startMission(MISSIONS[i]);
        return;
      }
    }
    if (input.take('0')) this.startFreeFlight();
  }

  handleFlyingKeys(dt) {
    const input = this.input;
    if (input.take('p') || input.take('P') || input.take('Escape')) {
      this.state = 'paused';
      return;
    }
    if (input.take('c') || input.take('C')) {
      this.cameraMode = this.cameraMode === 'chase' ? 'cockpit' : 'chase';
    }
    if (input.take('x') || input.take('X')) {
      input.mouseSteer = !input.mouseSteer;
      this.hud.showMessage(input.mouseSteer ? 'Mouse steer ON — hold pointer off-centre' : 'Mouse steer OFF', 2.5, this.time);
    }
    if (input.take('m') || input.take('M')) {
      this.audio.setMuted(!this.audio.muted);
    }
    if (input.take('f') || input.take('F')) {
      this.plane.flaps = !this.plane.flaps;
      this.hud.showMessage(this.plane.flaps ? 'Flaps down' : 'Flaps up', 1.5, this.time);
    }
    if (input.take('g') || input.take('G')) {
      this.plane.gearDown = !this.plane.gearDown;
      this.hud.showMessage(this.plane.gearDown ? 'Gear down' : 'Gear up', 1.5, this.time);
    }
    if (input.take('r') || input.take('R')) {
      if (this.mission) this.startMission(this.mission.def);
      else this.startFreeFlight();
      return;
    }
    if (input.take('b') || input.take('B')) {
      if (this.mission) {
        const msg = this.mission.tryDrop(this.plane, this.time);
        if (msg) this.hud.showMessage(msg, 2.5, this.time);
      }
    }
  }

  step(dt) {
    this.time += dt;
    this.input.poll();
    if (this.state === 'menu') {
      this.handleMenuKeys();
      // Attract mode: slow orbit over the islands behind the menu.
      const t = this.time * 0.02;
      this.plane.x = 3000 + Math.sin(t) * 2200;
      this.plane.z = -5000 + Math.cos(t) * 2200;
      this.plane.y = 320;
      this.plane.heading = t + Math.PI / 2;
      this.plane.speed = 60;
      this.camera.follow(this.plane, dt, false);
      return;
    }
    if (this.state === 'paused') {
      if (this.input.take('p') || this.input.take('P') || this.input.take('Escape') || this.input.take('Enter')) {
        this.state = 'flying';
      }
      return;
    }
    if (this.state === 'ended') {
      if (this.input.take('r') || this.input.take('R')) {
        if (this.mission) this.startMission(this.mission.def);
        else this.startFreeFlight();
      }
      if (this.input.take('m') || this.input.take('M') || this.input.take('Escape')) {
        this.state = 'menu';
      }
      return;
    }
    // Flying.
    this.handleFlyingKeys(dt);
    if (this.state !== 'flying') return;
    this.wind.update(dt, this.time);
    const prevState = this.plane.state;
    this.plane.update(dt, this.input, this.wind);
    this.audio.update(this.plane.throttle, this.plane.speed, this.plane.state === 'flying');
    if (this.cameraMode === 'chase') this.camera.follow(this.plane, dt, false);
    else this.camera.cockpit(this.plane);

    if (this.mission) {
      const msg = this.mission.update(dt, this.plane, this.time);
      if (msg) {
        this.hud.showMessage(msg, 2.5, this.time);
        this.audio.ringChime();
        const ring = this.mission.def.rings[this.mission.ringIndex - 1];
        if (ring) this.renderer.addBurst(ring.x, ring.y, ring.z, '#ffd27a', 26);
      }
      if (this.mission.failed) {
        this.audio.alarm();
        this.endMission('OUT OF TIME', [`Score ${this.mission.score.toLocaleString()} — the courier window closed.`], '#ff8a7a');
        return;
      }
    }
    if (this.plane.state === 'landed' && prevState !== 'landed') {
      this.audio.thud();
      if (this.mission) {
        const ready =
          this.mission.ringIndex >= this.mission.def.rings.length &&
          (!this.mission.def.dropZone || this.mission.dropped);
        if (ready) {
          const gained = this.mission.completeLanding(this.plane, this.time);
          this.endMission('MISSION COMPLETE!', [
            `${this.mission.def.name} — all rings flown, smooth landing`,
            `Medal: ${this.mission.medal()}  •  Score ${this.mission.score.toLocaleString()}`,
            `Landing bonus +${gained.toLocaleString()} (incl. time bonus)`,
          ], '#8dff9a');
        } else {
          this.endMission('LANDED EARLY', [
            `You landed with ${this.mission.def.rings.length - this.mission.ringIndex} ring(s) still to fly.`,
            `Score ${this.mission.score.toLocaleString()} — press R and finish the route.`,
          ], '#ffd27a');
        }
      } else {
        this.endMission('LANDED', ['Nice touchdown. Press R to fly again.'], '#8dff9a');
      }
      return;
    }
    if ((this.plane.state === 'crashed' || this.plane.state === 'ditched') && prevState !== this.plane.state) {
      this.audio.alarm();
      this.renderer.addBurst(this.plane.x, this.plane.y + 2, this.plane.z, '#ff5a4a', 40);
      const score = this.mission ? this.mission.score : 0;
      this.endMission(this.plane.state === 'ditched' ? 'DITCHED!' : 'CRASHED!', [
        this.plane.crashedReason,
        `Score ${score.toLocaleString()} — press R to try again.`,
      ], '#ff6a5a');
    }
  }

  render() {
    const ctx = this.renderer.ctx;
    const dusk = this.mission ? this.mission.def.dusk : false;
    this.renderer.drawSky(dusk);
    this.renderer.drawTerrain(this.plane, dusk);
    for (const key of Object.keys(RUNWAYS)) this.renderer.drawRunway(key, dusk);
    if (this.mission && this.mission.def.dropZone) {
      this.renderer.drawDropZone(this.mission.def.dropZone);
    }
    if (this.mission) {
      this.mission.def.rings.forEach((ring, i) => {
        this.renderer.drawRing(ring, i < this.mission.ringIndex, i === this.mission.ringIndex, this.time);
      });
    }
    this.renderer.drawClouds(this.clouds, dusk);
    this.renderer.drawParticles(1 / 60);
    if (this.cameraMode === 'cockpit' && this.state !== 'menu') {
      this.renderer.drawCockpit(this.plane, this.hud);
    } else if (this.state !== 'menu') {
      this.renderer.drawPlane(this.plane, this.time);
    }
    if (this.state === 'menu') {
      this.hud.drawMenu(MISSIONS, this.selected, this.best);
    } else if (this.state === 'ended' && this.end) {
      this.hud.drawEnd(this.end.title, this.end.lines, this.end.accent);
    } else if (this.state === 'paused') {
      ctx.fillStyle = 'rgba(6,14,26,0.55)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 40px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillText('Press P to resume', canvas.width / 2, canvas.height / 2 + 40);
    } else {
      const timeLeft = this.mission ? this.mission.timeLeft : Infinity;
      this.hud.drawFlightHud(this.plane, this.mission ? this.mission.def : null, this.mission ? this.mission.score : 0, timeLeft, this.time);
    }
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016);
    this.last = now;
    if (!this.frozen) this.step(dt);
    this.render();
    requestAnimationFrame((t) => this.frame(t));
  }
}

// --- Self-test ---------------------------------------------------------------
// ?selftest=1 runs the autopilot through mission 1 in a fixed-step loop
// (no rendering) and writes PASS/FAIL JSON into #selftest + document.title,
// so headless Chrome can read the verdict from the dumped DOM.
function runSelfTest() {
  const out = { checks: [], pass: false };
  const check = (name, ok, detail) => {
    out.checks.push({ name, ok: !!ok, detail: detail || '' });
  };
  try {
    // Projection sanity: a point ahead of the camera must land on screen.
    const game = new Game();
    game.camera.follow(game.plane, 0, true);
    const ahead = game.camera.project({ x: game.plane.x, y: game.plane.y + 10, z: game.plane.z - 500 });
    check('projection-ahead-onscreen', ahead && ahead.x > 0 && ahead.x < 1280 && ahead.y > 0 && ahead.y < 800, JSON.stringify(ahead));
    check('terrain-finite', Number.isFinite(groundHeight(1000, -2000)) && groundHeight(1000, -2000) > -50, String(groundHeight(1000, -2000)));
    // Fly mission 1 with the autopilot.
    const mission = new Mission(MISSIONS[0]);
    const plane = new Plane();
    plane.resetToRunway('banda');
    const wind = new Wind(MISSIONS[0].wind, 42);
    const ap = new Autopilot();
    const dt = 1 / 60;
    let tookOff = false;
    let maxAlt = 0;
    let steps = 0;
    const maxSteps = 60 * 420;
    while (steps < maxSteps && plane.state !== 'landed' && plane.state !== 'crashed' && plane.state !== 'ditched') {
      const t = steps * dt;
      wind.update(dt, t);
      let target;
      let landing = false;
      if (mission.nextRing) {
        target = mission.nextRing;
      } else {
        target = { runway: RUNWAYS[mission.def.endRunway] };
        landing = true;
        const r = target.runway;
        if (Math.hypot(plane.x - r.x, plane.z - r.z) < 1200) {
          plane.gearDown = true;
          plane.flaps = true;
        }
      }
      const input = ap.steer(plane, target, landing, wind);
      plane.update(dt, input, wind);
      mission.update(dt, plane, t);
      if (plane.y > 60) tookOff = true;
      maxAlt = Math.max(maxAlt, plane.y);
      steps++;
    }
    check('takeoff', tookOff, `maxAlt=${Math.round(maxAlt)}m`);
    check('rings-passed', mission.ringsPassed >= 5, `${mission.ringsPassed}/5 rings`);
    check('landing-or-flying', plane.state === 'landed' || plane.state === 'flying', `state=${plane.state} after ${steps} steps`);
    if (plane.state === 'landed') {
      const gained = mission.completeLanding(plane, steps * dt);
      check('mission-complete', mission.finished && mission.score > 2000, `score=${mission.score} gained=${gained}`);
    } else {
      check('mission-complete', false, `state=${plane.state} rings=${mission.ringsPassed}`);
    }
    check('no-nan', Number.isFinite(plane.x) && Number.isFinite(plane.y) && Number.isFinite(plane.z) && Number.isFinite(plane.speed), `pos=(${plane.x.toFixed(0)},${plane.y.toFixed(0)},${plane.z.toFixed(0)}) speed=${plane.speed.toFixed(1)}`);
    out.score = mission.score;
    out.rings = mission.ringsPassed;
    out.finalState = plane.state;
    out.pass = out.checks.every((c) => c.ok);
  } catch (err) {
    out.error = String(err && err.stack || err);
    out.pass = false;
  }
  const el = document.getElementById('selftest');
  el.style.display = 'block';
  el.textContent = JSON.stringify(out);
  document.title = (out.pass ? 'SELFTEST PASS ' : 'SELFTEST FAIL ') + JSON.stringify(out);
}

// --- Boot --------------------------------------------------------------------

const game = new Game();

if (SELFTEST) {
  runSelfTest();
} else if (SHOT) {
  const preset = applyShot(game, SHOT);
  if (preset) {
    game.mission = preset.mission;
    game.cameraMode = preset.camera;
    game.state = preset.end ? 'ended' : 'flying';
    game.end = preset.end;
    game.frozen = true;
    game.time = 12;
    if (preset.camera === 'chase') game.camera.follow(game.plane, 0, true);
    else game.camera.cockpit(game.plane);
    if (preset.message) game.hud.showMessage(preset.message, 9999, game.time);
    game.render();
  } else {
    game.render();
  }
} else {
  requestAnimationFrame((t) => {
    game.last = t;
    game.frame(t);
  });
}
