// Nusantara Sky Courier — terrain, runways and the 3D camera.
// One job: turn world coordinates into screen coordinates, and answer
// "how high is the ground here?" for physics, rendering and landing.

import { RUNWAYS, WORLD } from './config.js';
import { makeNoise, makeRng, clamp, lerp } from './random.js';

const noise = makeNoise(20261126);
const noise2 = makeNoise(777);

// Island bumps: gaussian hills scattered along the flight corridor.
const ISLANDS = [
  { x: 0, z: 0, r: 1400, h: 55 },
  { x: 1800, z: -2200, r: 1700, h: 260 },
  { x: 3600, z: -3600, r: 1500, h: 200 },
  { x: 5200, z: -4600, r: 1800, h: 190 },
  { x: 7000, z: -6200, r: 1600, h: 190 },
  { x: 8800, z: -8200, r: 1900, h: 280 },
  { x: 10600, z: -10000, r: 1700, h: 150 },
  { x: 12400, z: -11800, r: 2000, h: 220 },
  { x: 14300, z: -13600, r: 1800, h: 240 },
  { x: 15800, z: -15200, r: 1600, h: 240 },
  { x: -900, z: -1200, r: 900, h: 90 },
  { x: 2600, z: -800, r: 800, h: 70 },
  { x: 9800, z: -6800, r: 900, h: 150 },
];

function runwayAt(x, z) {
  for (const key of Object.keys(RUNWAYS)) {
    const r = RUNWAYS[key];
    const dx = x - r.x;
    const dz = z - r.z;
    // Runway heading is clockwise from north (-z). Its along-axis is
    // (sin h, -cos h) in (x, z); across-axis is (cos h, sin h).
    const along = dx * Math.sin(r.heading) + dz * -Math.cos(r.heading);
    const across = dx * Math.cos(r.heading) + dz * Math.sin(r.heading);
    const halfLen = r.length / 2;
    const halfWid = WORLD.runwayWidth / 2;
    // Flatten a generous apron around each strip so takeoffs and
    // landings never meet a hill right at the threshold.
    const apron = 320;
    if (Math.abs(along) < halfLen + apron && Math.abs(across) < halfWid + apron) {
      const edge = Math.max(
        0,
        (Math.abs(along) - halfLen) / apron,
        (Math.abs(across) - halfWid) / apron,
      );
      return { runway: r, key, along, across, blend: clamp(edge, 0, 1) };
    }
  }
  return null;
}

// Raw island height, before runway flattening.
export function groundHeight(x, z) {
  let h = -18; // sea floor
  for (const isl of ISLANDS) {
    const dx = (x - isl.x) / isl.r;
    const dz = (z - isl.z) / isl.r;
    const d2 = dx * dx + dz * dz;
    if (d2 < 4) h += isl.h * Math.exp(-d2 * 1.6);
  }
  // Rolling detail, stronger on land.
  const n = noise(x * 0.0016, z * 0.0016);
  const n2 = noise2(x * 0.006, z * 0.006);
  const land = clamp((h + 18) / 60, 0, 1);
  h += (n - 0.5) * 70 * land + (n2 - 0.5) * 14 * land;
  const flat = runwayAt(x, z);
  if (flat) h = lerp(flat.runway.elev, h, flat.blend);
  return h;
}

export function isOnRunway(x, z) {
  const flat = runwayAt(x, z);
  if (!flat) return null;
  if (Math.abs(flat.along) < flat.runway.length / 2 && Math.abs(flat.across) < WORLD.runwayWidth / 2) {
    return flat;
  }
  return null;
}

export function runwayCorners(key) {
  const r = RUNWAYS[key];
  const halfLen = r.length / 2;
  const halfWid = WORLD.runwayWidth / 2;
  const ax = Math.sin(r.heading);
  const az = -Math.cos(r.heading);
  const bx = Math.cos(r.heading);
  const bz = Math.sin(r.heading);
  const corner = (a, b) => ({
    x: r.x + ax * a + bx * b,
    y: r.elev + 0.4,
    z: r.z + az * a + bz * b,
  });
  return [
    corner(-halfLen, -halfWid),
    corner(halfLen, -halfWid),
    corner(halfLen, halfWid),
    corner(-halfLen, halfWid),
  ];
}

// --- Camera ----------------------------------------------------------------

export class Camera {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.focal = (height / 2) / Math.tan((62 * Math.PI) / 360);
    this.pos = { x: 0, y: 0, z: 0 };
    this.heading = 0;
    this.pitch = 0;
    this.roll = 0;
  }

  // Chase the plane from behind and slightly above it.
  follow(plane, dt, snap) {
    const back = 26;
    const up = 7.5;
    const fx = Math.sin(plane.heading);
    const fz = -Math.cos(plane.heading);
    const tx = plane.x - fx * back;
    const ty = plane.y + up + plane.pitch * 6;
    const tz = plane.z - fz * back;
    if (snap) {
      this.pos.x = tx;
      this.pos.y = ty;
      this.pos.z = tz;
    } else {
      const k = 1 - Math.exp(-dt * 7);
      this.pos.x += (tx - this.pos.x) * k;
      this.pos.y += (ty - this.pos.y) * k;
      this.pos.z += (tz - this.pos.z) * k;
    }
    this.heading = plane.heading;
    this.pitch = -0.06 + plane.pitch * 0.45;
    this.roll = plane.roll * 0.35;
  }

  // Cockpit: sit at the nose, look straight out.
  cockpit(plane) {
    const fx = Math.sin(plane.heading);
    const fz = -Math.cos(plane.heading);
    this.pos.x = plane.x + fx * 3;
    this.pos.y = plane.y + 1.2;
    this.pos.z = plane.z + fz * 3;
    this.heading = plane.heading;
    this.pitch = plane.pitch;
    this.roll = plane.roll;
  }

  // Project a world point. Returns null when behind the camera.
  project(p) {
    const dx = p.x - this.pos.x;
    const dy = p.y - this.pos.y;
    const dz = p.z - this.pos.z;
    const ch = Math.cos(this.heading);
    const sh = Math.sin(this.heading);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    // Forward basis (heading, pitch), right, up — roll applied to screen.
    const fx = sh * cp;
    const fy = sp;
    const fz = -ch * cp;
    const rx = ch;
    const rz = sh;
    // up = right x forward
    const ux = -sh * sp;
    const uy = cp;
    const uz = ch * sp;
    const cx = dx * rx + dz * rz;
    const cy = dx * ux + dy * uy + dz * uz;
    const cz = dx * fx + dy * fy + dz * fz;
    if (cz < 2) return null;
    const s = this.focal / cz;
    let sx = this.width / 2 + cx * s;
    let sy = this.height * 0.52 - cy * s;
    if (this.roll) {
      const cr = Math.cos(-this.roll);
      const sr = Math.sin(-this.roll);
      const ox = sx - this.width / 2;
      const oy = sy - this.height * 0.52;
      sx = this.width / 2 + ox * cr - oy * sr;
      sy = this.height * 0.52 + ox * sr + oy * cr;
    }
    return { x: sx, y: sy, depth: cz, scale: s };
  }

  // Screen y of the horizon line for the current pitch.
  horizonY() {
    return this.height * 0.52 + Math.tan(this.pitch) * this.focal;
  }
}

// --- Clouds ----------------------------------------------------------------

export function makeClouds(seed, count) {
  const rng = makeRng(seed);
  const clouds = [];
  for (let i = 0; i < count; i++) {
    clouds.push({
      x: -1500 + rng() * 19000,
      y: 380 + rng() * 320,
      z: -17000 + rng() * 17500,
      r: 90 + rng() * 190,
      puffs: 3 + Math.floor(rng() * 4),
      seed: rng() * 100,
    });
  }
  return clouds;
}
