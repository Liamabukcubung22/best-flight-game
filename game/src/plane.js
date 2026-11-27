// Nusantara Sky Courier — the aeroplane and its flight model.
// One job: turn throttle, stick and wind into position, speed and attitude.

import { WORLD } from './config.js';
import { RUNWAYS } from './config.js';
import { clamp, angleDiff } from './random.js';
import { groundHeight, isOnRunway } from './terrain.js';

export class Plane {
  constructor() {
    this.resetToRunway('banda');
    this.throttle = 0;
    this.flaps = false;
    this.gearDown = true;
    this.fuel = WORLD.fuelCapacity;
    this.damage = 0;
    this.state = 'parked'; // parked | flying | landed | crashed | ditched
    this.vspeed = 0;
    this.groundSpeed = 0;
    this.crashedReason = '';
    this.landedSmooth = false;
  }

  resetToRunway(key) {
    const r = RUNWAYS[key];
    this.x = r.x - Math.sin(r.heading) * (r.length / 2 - 60);
    this.z = r.z + Math.cos(r.heading) * (r.length / 2 - 60);
    this.y = r.elev + 1.6;
    this.heading = r.heading;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.vspeed = 0;
    this.throttle = 0;
    this.flaps = false;
    this.gearDown = true;
    this.fuel = WORLD.fuelCapacity;
    this.damage = 0;
    this.state = 'parked';
    this.crashedReason = '';
    this.landedSmooth = false;
  }

  get altitudeFt() {
    return Math.round((this.y - WORLD.seaLevel) * 3.28084);
  }

  get speedKts() {
    return Math.round(this.speed * 1.94384);
  }

  get headingDeg() {
    let d = (this.heading * 180) / Math.PI;
    d %= 360;
    if (d < 0) d += 360;
    return Math.round(d);
  }

  // inputs: { pitch: -1..1 (stick back = climb), roll: -1..1, yaw: -1..1,
  //   throttleDelta, brake } — wind: { x, z } gust vector in m/s.
  update(dt, inputs, wind) {
    if (this.state === 'crashed' || this.state === 'landed' || this.state === 'ditched') {
      return;
    }
    // Throttle.
    this.throttle = clamp(this.throttle + inputs.throttleDelta * dt, 0, 1);
    if (this.fuel <= 0) this.throttle = 0;
    this.fuel = Math.max(0, this.fuel - this.throttle * WORLD.fuelBurn * dt);

    const onGround = this.state === 'parked' || this.y <= groundHeight(this.x, this.z) + 1.7;

    // Stick: pitch toward target, roll toward target, with authority that
    // fades at low speed so the plane feels heavy on the ground.
    const authority = clamp(this.speed / 40, 0.25, 1);
    const targetPitch = clamp(inputs.pitch * 0.5, -0.5, 0.5);
    const targetRoll = clamp(inputs.roll * 0.9, -0.9, 0.9);
    this.pitch += (targetPitch - this.pitch) * (1 - Math.exp(-dt * 2.2 * authority));
    this.roll += (targetRoll - this.roll) * (1 - Math.exp(-dt * 2.6 * authority));
    // Banking right (positive roll) turns the nose right: heading grows.
    this.heading +=
      (Math.sin(this.roll) * WORLD.turnRate * clamp(this.speed / WORLD.cruiseSpeed, 0, 1) +
        inputs.yaw * 0.12) *
      dt;

    // Speed: thrust minus drag, plus a push downhill / pull uphill.
    const thrust = this.throttle * 26;
    const drag = 0.0038 * this.speed * this.speed + (this.flaps ? 3.2 : 0) + (inputs.brake ? 9 : 0);
    const slope = -Math.sin(this.pitch) * WORLD.gravity * 0.9;
    this.speed = Math.max(0, this.speed + (thrust - drag + slope) * dt);

    const flying = this.speed > WORLD.stallSpeed || this.y > groundHeight(this.x, this.z) + 4;
    if (flying && this.state === 'parked') this.state = 'flying';

    if (this.state === 'flying') {
      // Lift holds us up above stall; below stall we sink, nose drops.
      const stalled = this.speed < WORLD.stallSpeed && !this.flaps;
      const liftFactor = stalled ? 0.25 : 1;
      const targetVspeed =
        Math.sin(this.pitch) * this.speed * liftFactor -
        (stalled ? 6 : 0) -
        (this.speed < WORLD.stallSpeed * 0.7 ? 4 : 0);
      this.vspeed += (targetVspeed - this.vspeed) * (1 - Math.exp(-dt * 2.4));
      this.y += this.vspeed * dt;
    } else {
      // Rolling on the runway.
      this.y = groundHeight(this.x, this.z) + 1.6;
      this.vspeed = 0;
      this.pitch *= 0.9;
      this.roll *= 0.9;
    }

    // Wind gusts push the whole aircraft sideways.
    this.x += (Math.sin(this.heading) * this.speed + wind.x) * dt;
    this.z += (-Math.cos(this.heading) * this.speed + wind.z) * dt;
    this.groundSpeed = this.speed;

    // Ground contact.
    const ground = groundHeight(this.x, this.z);
    if (this.y <= ground + 1.6 && this.state === 'flying') {
      const runway = isOnRunway(this.x, this.z);
      const vertical = Math.abs(this.vspeed);
      const aligned = runway
        ? Math.abs(angleDiff(this.heading, runway.runway.heading)) < 0.35
        : false;
      if (runway && aligned && vertical < 4.5 && this.speed < 55 && this.gearDown) {
        this.state = 'landed';
        this.landedSmooth = vertical < 2.2 && this.speed < 42;
        this.y = ground + 1.6;
        this.speed = Math.max(0, this.speed - 18 * dt);
      } else if (ground < 2 && !runway) {
        this.state = 'ditched';
        this.crashedReason = 'Ditched in the sea';
      } else {
        this.state = 'crashed';
        this.crashedReason = runway
          ? 'Hard landing — too fast, too steep, or gear up'
          : 'Crashed into terrain';
      }
      this.y = ground + 1.6;
    }
    // World bounds: clamp position at the map edge.
    if (this.x < -4000 || this.x > 20000 || this.z < -19000 || this.z > 4000) {
      this.x = clamp(this.x, -4000, 20000);
      this.z = clamp(this.z, -19000, 4000);
    }
  }
}
