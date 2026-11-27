// Nusantara Sky Courier — screenshot presets.
// One job: put the game into a fixed, photogenic state for each of the
// 3–4 hand-in screenshots, so the cover shows the whole game at a glance.

import { RUNWAYS } from './config.js';
import { Mission } from './missions.js';
import { groundHeight } from './terrain.js';

// Each preset returns { plane, mission, camera, message, end } for main.js.
export function applyShot(game, name) {
  const plane = game.plane;
  const setFlight = (x, y, z, heading, speed, pitch, roll) => {
    plane.x = x;
    plane.y = y;
    plane.z = z;
    plane.heading = heading;
    plane.speed = speed;
    plane.pitch = pitch;
    plane.roll = roll;
    plane.state = 'flying';
    plane.throttle = 0.75;
    plane.fuel = 78;
    plane.gearDown = true;
    plane.flaps = false;
    plane.vspeed = 2;
    // Never place the plane inside a hill: keep it above the terrain.
    plane.y = Math.max(y, groundHeight(x, z) + 55);
  };

  if (name === 'cover') {
    // Chase view mid-flight: ring ahead, blue sea below, green islands
    // ahead — the plane flies the strait between Banda and the next
    // island, so the shot reads as a tropical archipelago, not bare rock.
    const mission = new Mission(game.missionsDef[0]);
    mission.ringIndex = 1;
    mission.ringsPassed = 1;
    mission.score = 620;
    mission.timeLeft = 295;
    setFlight(600, 240, -700, 0.75, 62, 0.06, 0.18);
    return { mission, camera: 'chase', message: 'Ring 2 of 5 — follow the gold', end: null };
  }

  if (name === 'cockpit') {
    // Cockpit view with lit instruments, ring dead ahead.
    const mission = new Mission(game.missionsDef[0]);
    mission.ringIndex = 2;
    mission.ringsPassed = 2;
    mission.score = 940;
    mission.timeLeft = 262;
    setFlight(2700, 300, -3000, 1.05, 64, 0.04, -0.1);
    return { mission, camera: 'cockpit', message: '', end: null };
  }

  if (name === 'landing') {
    // Final approach to Ternate Strip: gear down, flaps, low and level.
    const mission = new Mission(game.missionsDef[0]);
    mission.ringIndex = 5;
    mission.ringsPassed = 5;
    mission.score = 2180;
    mission.timeLeft = 148;
    const r = RUNWAYS.ternate;
    const ax = Math.sin(r.heading);
    const az = -Math.cos(r.heading);
    const dist = 420;
    const x = r.x - ax * dist;
    const z = r.z - az * dist;
    setFlight(x, r.elev + 55, z, r.heading, 42, -0.06, 0.02);
    plane.flaps = true;
    plane.gearDown = true;
    plane.throttle = 0.4;
    return { mission, camera: 'chase', message: 'Final approach — gear down, flaps set', end: null };
  }

  if (name === 'complete') {
    // Mission complete: landed at Ternate, medal screen over the scene.
    const mission = new Mission(game.missionsDef[0]);
    mission.ringIndex = 5;
    mission.ringsPassed = 5;
    mission.score = 3860;
    mission.timeLeft = 121;
    mission.finished = true;
    const r = RUNWAYS.ternate;
    plane.resetToRunway('ternate');
    plane.state = 'landed';
    plane.landedSmooth = true;
    plane.speed = 0;
    plane.throttle = 0;
    return {
      mission,
      camera: 'chase',
      message: '',
      end: {
        title: 'MISSION COMPLETE!',
        lines: [
          'Island Hop — all 5 rings, smooth landing',
          'Medal: SILVER  •  Score 3,860',
          'Landing bonus +500  •  Smooth +300  •  Time +242',
        ],
        accent: '#8dff9a',
      },
    };
  }
  return null;
}

export function shotNames() {
  return ['cover', 'cockpit', 'landing', 'complete'];
}
