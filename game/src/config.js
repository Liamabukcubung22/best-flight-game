// Nusantara Sky Courier — shared tuning and mission data.
// One job: every number the game balances on, in one place.

export const WORLD = {
  seaLevel: 0,
  gravity: 9.81,
  stallSpeed: 26, // m/s — below this the wing stops flying
  maxSpeed: 96, // m/s at full throttle, level flight
  cruiseSpeed: 62,
  climbRate: 9, // m/s at full throttle, nose up
  turnRate: 0.75, // rad/s at full bank
  fuelCapacity: 100,
  fuelBurn: 0.22, // units/s at full throttle — a full tank lasts a sortie
  runwayLength: 640,
  runwayWidth: 34,
};

export const COLOURS = {
  skyTop: '#2f6fc4',
  skyMid: '#7fb2e5',
  skyLow: '#cfe8f7',
  seaDeep: '#14507e',
  seaShallow: '#2f8fb5',
  sand: '#e8d29a',
  grass: '#5da24a',
  forest: '#2f7a37',
  rock: '#8a7f72',
  snow: '#f2f6f8',
  runway: '#3a3f46',
  ring: '#ffb400',
  ringGlow: '#ffe08a',
};

export const MISSIONS = [
  {
    id: 'island-hop',
    name: 'Island Hop',
    short: '1',
    briefing:
      'Take off from Banda Airstrip, thread 5 golden rings over the islands, and land on Ternate Strip. Smooth landings pay extra.',
    startRunway: 'banda',
    endRunway: 'ternate',
    rings: [
      { x: 900, y: 170, z: -1400 },
      { x: 2100, y: 325, z: -2600 },
      { x: 3400, y: 320, z: -3400 },
      { x: 4700, y: 370, z: -4100 },
      { x: 5800, y: 335, z: -4800 },
    ],
    wind: 2,
    dusk: false,
    timeLimit: 480,
  },
  {
    id: 'mail-run',
    name: 'Mail Run',
    short: '2',
    briefing:
      'Six rings across the strait, then drop the mail sack (B) over the red drop zone on Seram, and land at Ambon Field.',
    startRunway: 'ternate',
    endRunway: 'ambon',
    rings: [
      { x: 6600, y: 195, z: -5600 },
      { x: 7400, y: 295, z: -6600 },
      { x: 8300, y: 345, z: -7600 },
      { x: 9200, y: 435, z: -8600 },
      { x: 10100, y: 370, z: -9500 },
      { x: 10900, y: 385, z: -10300 },
    ],
    dropZone: { x: 11500, y: 0, z: -10900, r: 160 },
    wind: 4,
    dusk: false,
    timeLimit: 600,
  },
  {
    id: 'storm-rescue',
    name: 'Storm Rescue',
    short: '3',
    briefing:
      'Dusk storm over the ridge. Gusts will shove you sideways. Thread 4 rings, reach the short mountain strip at Halmahera, and put her down gently.',
    startRunway: 'ambon',
    endRunway: 'halmahera',
    rings: [
      { x: 12400, y: 485, z: -11800 },
      { x: 13300, y: 440, z: -12700 },
      { x: 14200, y: 570, z: -13600 },
      { x: 15000, y: 480, z: -14400 },
    ],
    wind: 9,
    dusk: true,
    timeLimit: 480,
  },
];

// Runways sit on flattened ground. Heading is radians clockwise from north.
export const RUNWAYS = {
  banda: { name: 'Banda Airstrip', x: 0, z: 0, heading: 0.35, elev: 42, length: 640 },
  ternate: { name: 'Ternate Strip', x: 6400, z: -5200, heading: 0.5, elev: 55, length: 640 },
  ambon: { name: 'Ambon Field', x: 11800, z: -11200, heading: 0.42, elev: 38, length: 700 },
  halmahera: { name: 'Halmahera Ridge', x: 15500, z: -14900, heading: 0.6, elev: 210, length: 520 },
};

export const SCORE = {
  ring: 250,
  ringTimeBonus: 120,
  drop: 400,
  landing: 500,
  smoothLanding: 300,
  mission: 1000,
  crashPenalty: 0,
};
