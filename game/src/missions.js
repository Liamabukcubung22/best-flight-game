// Nusantara Sky Courier — missions, scoring and the autopilot used by the
// self-test. One job: know what the pilot still has to do, and pay them.

import { MISSIONS, RUNWAYS, SCORE, WORLD } from './config.js';
import { clamp, angleDiff, makeRng } from './random.js';
import { groundHeight } from './terrain.js';

export class Mission {
  constructor(def) {
    this.def = def;
    this.ringIndex = 0;
    this.ringsPassed = 0;
    this.dropped = false;
    this.score = 0;
    this.timeLeft = def.timeLimit;
    this.events = [];
    this.finished = false;
    this.failed = false;
    this.ringTimes = [];
  }

  get nextRing() {
    return this.def.rings[this.ringIndex] || null;
  }

  get ringsTotal() {
    return this.def.rings.length;
  }

  get objective() {
    if (this.ringIndex < this.def.rings.length) {
      return `Ring ${this.ringIndex + 1} of ${this.def.rings.length}`;
    }
    if (this.def.dropZone && !this.dropped) return 'Drop the mail (B)';
    return `Land at ${RUNWAYS[this.def.endRunway].name}`;
  }

  // Check the plane against the next ring / drop zone. Returns a message
  // when something happened, else null.
  update(dt, plane, now) {
    if (this.finished || this.failed) return null;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.failed = true;
      return 'Out of time — mission failed';
    }
    const ring = this.nextRing;
    if (ring) {
      const dx = plane.x - ring.x;
      const dy = plane.y - ring.y;
      const dz = plane.z - ring.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < 40) {
        this.ringIndex++;
        this.ringsPassed++;
        const bonus = Math.max(0, Math.round(SCORE.ringTimeBonus - this.elapsed() * 0.4));
        const gained = SCORE.ring + bonus;
        this.score += gained;
        this.ringTimes.push(now);
        this.events.push({ type: 'ring', at: now, gained });
        return `Ring ${this.ringsPassed}/${this.ringsTotal}! +${gained}`;
      }
    }
    return null;
  }

  elapsed() {
    return this.def.timeLimit - this.timeLeft;
  }

  tryDrop(plane, now) {
    if (!this.def.dropZone || this.dropped || this.ringIndex < this.def.rings.length) {
      return null;
    }
    const dz = this.def.dropZone;
    const dx = plane.x - dz.x;
    const dz2 = plane.z - dz.z;
    const dist = Math.sqrt(dx * dx + dz2 * dz2);
    if (dist < dz.r && plane.y < 320 && plane.y > groundHeight(plane.x, plane.z) + 40) {
      this.dropped = true;
      this.score += SCORE.drop;
      this.events.push({ type: 'drop', at: now, gained: SCORE.drop });
      return `Mail delivered! +${SCORE.drop}`;
    }
    return 'Not over the drop zone yet';
  }

  completeLanding(plane, now) {
    if (this.finished) return 0;
    this.finished = true;
    let gained = SCORE.landing + SCORE.mission;
    if (plane.landedSmooth) gained += SCORE.smoothLanding;
    const timeBonus = Math.max(0, Math.round(this.timeLeft * 2));
    gained += timeBonus;
    this.score += gained;
    this.events.push({ type: 'landing', at: now, gained });
    return gained;
  }

  medal() {
    if (this.score >= 4200) return 'GOLD';
    if (this.score >= 3200) return 'SILVER';
    if (this.score >= 2200) return 'BRONZE';
    return 'COMPLETED';
  }
}

export function missionById(id) {
  const def = MISSIONS.find((m) => m.id === id);
  return def ? new Mission(def) : null;
}

// Wind: steady breeze plus slow gusts, seeded per mission so the storm
// sortie is the same storm every time.
export class Wind {
  constructor(strength, seed) {
    this.strength = strength;
    this.rng = makeRng(seed);
    this.phase = this.rng() * 10;
    this.x = 0;
    this.z = 0;
  }

  update(dt, now) {
    const gust = Math.sin(now * 0.35 + this.phase) * 0.6 + Math.sin(now * 0.13 + this.phase * 2) * 0.4;
    const s = this.strength * (0.7 + 0.5 * gust);
    this.x = s * 0.8;
    this.z = s * 0.6;
    return this;
  }
}

// --- Autopilot (drives the self-test and the attract mode) ------------------

export class Autopilot {
  constructor() {
    this.enabled = false;
  }

  // Steer toward a target point, then land: returns the input state the
  // plane should see this frame. When landing, `target` is the destination
  // runway's definition { runway } — fly a fixed glide slope to its
  // threshold instead of chasing a moving point. `wind` is the current
  // wind vector { x, z } in m/s; the heading is crabbed into it so the
  // ground track — not just the nose — follows the aim point.
  steer(plane, target, landing, wind) {
    wind = wind || { x: 0, z: 0 };
    const out = { pitch: 0, roll: 0, yaw: 0, throttleDelta: 0, brake: false };
    let aim = target;
    let wantAlt = target.y;
    let wantSpeed = 66;
    let approachGround = null;
    let branch = 'ring';
    let landingS = null;
    if (landing) {
      const r = target.runway;
      const ax = Math.sin(r.heading);
      const az = -Math.cos(r.heading);
      // Threshold point (approach end of the strip) and the Final Approach
      // Fix: a point on the extended centreline 900 m before it. Joining
      // the centreline at the FAF keeps the final leg aligned with the
      // runway instead of cutting across it at an angle.
      const thrX = r.x - ax * (r.length / 2);
      const thrZ = r.z - az * (r.length / 2);
      const fafX = thrX - ax * 1200;
      const fafZ = thrZ - az * 1200;
      // s: signed distance along the runway axis from the threshold.
      // Negative while still approaching, 0 at the threshold.
      const s = (plane.x - thrX) * ax + (plane.z - thrZ) * az;
      landingS = s;
      // Lateral offset from the extended centreline, and heading error.
      const lateral =
        (plane.x - thrX) * Math.cos(r.heading) + (plane.z - thrZ) * Math.sin(r.heading);
      const misaligned = Math.abs(angleDiff(plane.heading, r.heading)) > 0.7;
      // Bad intercept: too far off the centreline, or pointing across it,
      // with too little room left to fix it — go around instead of forcing
      // a steep, misaligned final.
      const badIntercept = s > -700 && (Math.abs(lateral) > 180 || misaligned);
      // Final is only final when the aircraft is actually on it: heading
      // along the runway and close to the centreline. Otherwise it is
      // still rejoining, and must keep flying to the FAF — aiming at the
      // threshold from a wrong heading just spins it in circles.
      const aligned = Math.abs(angleDiff(plane.heading, r.heading)) < 0.6;
      const onCentreline = Math.abs(lateral) < 150;
      // Go around only when it is too high to land, or it has floated
      // past the runway's far end without touching down. A low aircraft
      // just past the threshold is about to touch — let it.
      const tooHighToLand = s > 60 && plane.y > r.elev + 45;
      if (s > r.length / 2 || tooHighToLand || badIntercept) {
        // Overshot or bad intercept: go around — climb first, then
        // rejoin at the FAF.
        aim = { x: fafX, y: r.elev + 220, z: fafZ };
        wantAlt = r.elev + 220;
        wantSpeed = 55;
        branch = 'go-around';
      } else if (!aligned || !onCentreline) {
        // Rejoining: fly to the FAF on the extended centreline.
        aim = { x: fafX, y: r.elev + 130, z: fafZ };
        wantAlt = r.elev + 130;
        wantSpeed = 55;
        branch = 'rejoin';
      } else {
        // On final: glide slope ~9 degrees down to the threshold, and
        // right onto the runway surface — a floor above the strip would
        // leave the aircraft floating past it forever. The aim point
        // stays ahead of the aircraft, down the runway, so it never has
        // to turn back toward the threshold it just passed. Inside the
        // last 50 m the target sits 3 m BELOW the strip: a controller
        // that aims exactly at the surface approaches it asymptotically
        // and never touches down.
        wantAlt = s > -50 ? r.elev - 3 : r.elev + Math.max(0, -s * 0.16);
        const ahead = clamp(s + 150, 0, 400);
        aim = { x: thrX + ax * ahead, y: wantAlt, z: thrZ + az * ahead };
        wantSpeed = s < -500 ? 46 : 34;
        branch = 'final';
      }
      // Terrain clearance along the actual line to the aim point, not
      // 300 m ahead of wherever the nose happens to point. Only ground
      // more than 300 m before the threshold counts: near the strip the
      // glide slope is the authority (the apron is flat), and counting
      // the runway's own ground + margin would floor the approach at
      // 115 m and strand the aircraft above the runway forever.
      let mg = -Infinity;
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const sx = plane.x + (aim.x - plane.x) * t;
        const sz = plane.z + (aim.z - plane.z) * t;
        const ss = (sx - thrX) * ax + (sz - thrZ) * az;
        if (ss < -300) mg = Math.max(mg, groundHeight(sx, sz));
      }
      approachGround = mg;
    }
    const dx0 = aim.x - plane.x;
    const dz0 = aim.z - plane.z;
    const dist0 = Math.hypot(dx0, dz0);
    if (!landing && dist0 < 400) {
      // Close to a ring: fly straight THROUGH it. Aiming at the ring's
      // centre from here makes the plane chase the point and orbit it
      // (its turn radius is wider than the ring); aiming 300 m past the
      // ring, on the same line, keeps the pass straight.
      const inv = 1 / Math.max(1, Math.hypot(dx0, aim.y - plane.y, dz0));
      aim = {
        x: aim.x + dx0 * inv * 300,
        y: aim.y + (aim.y - plane.y) * inv * 300,
        z: aim.z + dz0 * inv * 300,
      };
      wantSpeed = 46;
    } else if (!landing && dist0 < 900) {
      wantSpeed = 56;
    }
    const dx = aim.x - plane.x;
    const dz = aim.z - plane.z;
    const dist = Math.hypot(dx, dz);
    // Wind correction: the ground track must point at the aim, so the
    // air velocity we need is (ground velocity - wind). Without this a
    // crosswind shoves the aircraft off the centreline on final.
    const gs = Math.max(20, plane.speed);
    const ux = dx / Math.max(1, dist);
    const uz = dz / Math.max(1, dist);
    const vx = ux * gs - wind.x;
    const vz = uz * gs - wind.z;
    const wantHeading = Math.atan2(vx, -vz);
    const dh = angleDiff(plane.heading, wantHeading);
    out.roll = clamp(dh * 1.6, -1, 1);
    out.yaw = clamp(dh * 0.4, -0.5, 0.5);
    // Altitude: hold the target height — and never fly below the terrain
    // ahead plus a safety margin, so hills never surprise us. On final
    // approach the margin follows the approach line instead.
    if (approachGround !== null && approachGround > -Infinity) {
      wantAlt = Math.max(wantAlt, approachGround + 30);
    } else if (!landing) {
      // Ring chasing only: never fly below the terrain 300 m ahead.
      // On a landing leg this must NOT run — 300 m ahead on final is
      // the runway itself, and its ground + 45 would floor the whole
      // approach at 100 m and strand the aircraft above the strip.
      const aheadX = plane.x + Math.sin(plane.heading) * 300;
      const aheadZ = plane.z - Math.cos(plane.heading) * 300;
      wantAlt = Math.max(wantAlt, groundHeight(aheadX, aheadZ) + 45);
    }
    const altErr = wantAlt - plane.y;
    // Vertical-speed controller: aim for a climb/descent rate proportional
    // to the altitude error, and pitch to hold that rate. (Damping raw
    // vspeed toward zero instead would fight every climb and dive.)
    let targetVspeed = clamp(altErr * 0.5, -16, 20);
    if (landing && landingS !== null && landingS > -60 && plane.y - target.runway.elev < 25) {
      // Flare: close to the ground AND close to the threshold, sink
      // gently so the touchdown is soft (the landing check needs
      // |vspeed| under 4.5 m/s). Keyed on height above the strip and on
      // distance to the threshold — a flare that starts while still
      // 90 m up, or 300 m out, strands the aircraft floating past the
      // runway's far end.
      targetVspeed = Math.max(targetVspeed, -4.0);
    }
    out.pitch = clamp((targetVspeed - plane.vspeed) * 0.12, -0.7, 0.7);
    // Debug hook for the self-test: what the autopilot decided this frame.
    this.debug = {
      wantAlt, wantSpeed, targetVspeed,
      aim: { x: aim.x, y: aim.y, z: aim.z },
      branch,
    };
    // Throttle: ease off toward the target speed.
    out.throttleDelta = plane.speed < wantSpeed ? 0.55 : plane.speed > wantSpeed + 6 ? -0.55 : 0;
    if (landing && dist < 250) out.brake = plane.speed > 40;
    return out;
  }
}
