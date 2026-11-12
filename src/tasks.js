import * as THREE from 'three';
import { makeLabelSprite } from './world.js';

// ─────────────────────────────────────────────────────────────
// Daily maintenance tasks.
//
// Every room owns a pool of three tasks, one per day, built at
// the start of the shift and disassembled at night. Three task
// archetypes keep the rooms mechanically distinct:
//   sequence - activate units in a displayed order
//   count    - service every unit in the room
//   cycle    - step each unit through states until it reads OK
// ─────────────────────────────────────────────────────────────

export const ROOM_META = {
  reactor: { name: 'REACTOR BAY', short: 'REACTOR', tint: '#ff9a6c' },
  med: { name: 'HYDRO BAY', short: 'HYDRO', tint: '#8dffcb' },
  nav: { name: 'NAV / COMMS', short: 'NAV', tint: '#a9bbff' },
};

// ─────────────────────────────────────────────────────────────
// Resource loop.
//
// Every repair step burns one unit of the reserve produced by
// another compartment, and pays out one unit of this room's own
// reserve. Finishing a task pays a bonus. The refill is slow and
// the ship leaks reserves at night, so a shift that skips a room
// starves the room downstream of it.
//
//   reactor  burns BIOMASS  → makes POWER
//   nav      burns POWER    → makes DATA
//   hydro    burns DATA     → makes BIOMASS
// ─────────────────────────────────────────────────────────────

export const RESOURCE_META = {
  power: { label: 'POWER', short: 'PWR', source: 'REACTOR BAY', room: 'reactor' },
  biomass: { label: 'BIOMASS', short: 'BIO', source: 'HYDRO BAY', room: 'med' },
  data: { label: 'DATA', short: 'DATA', source: 'NAV / COMMS', room: 'nav' },
};

export const RESOURCE_FLOW = {
  reactor: { cost: 'biomass', yields: 'power' },
  nav: { cost: 'power', yields: 'data' },
  med: { cost: 'data', yields: 'biomass' },
};

export const STEP_COST = 1;
export const COMPLETION_BONUS = 4;

// ─────────────────────────────────────────────────────────────
// Tools and supply lockers.
//
// A repair step is not only a reserve: it needs the right tool in
// the backpack. Every bay is serviced with a tool that is stocked
// in a different bay, so each step is a round trip across the ship.
// The tool is spent by the step and nothing refills it that day.
// ─────────────────────────────────────────────────────────────

export const TOOL_META = {
  wrench: { label: 'WRENCH', short: 'WRE', color: '#8fe3ff', store: 'nav', storeName: 'ANTENNA RACK' },
  filter: { label: 'FILTER', short: 'FIL', color: '#8dffcb', store: 'reactor', storeName: 'COOLANT LOCKER' },
  probe: { label: 'PROBE', short: 'PRO', color: '#a9bbff', store: 'med', storeName: 'HYDRO CABINET' },
};

// Which tool each compartment's work demands, and which locker stocks it.
export const ROOM_TOOL = { reactor: 'wrench', med: 'filter', nav: 'probe' };
export const LOCKER_TOOL = { nav: 'wrench', reactor: 'filter', med: 'probe' };

const metal = (color = 0x1a222b, metalness = 0.7, roughness = 0.42) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });

const glow = (color, intensity = 1.2) =>
  new THREE.MeshStandardMaterial({ color: 0x0a0f14, emissive: color, emissiveIntensity: intensity, roughness: 0.45, metalness: 0.3 });

const darkGlass = new THREE.MeshStandardMaterial({
  color: 0x8fd4ff,
  transparent: true,
  opacity: 0.22,
  roughness: 0.12,
  metalness: 0.6,
  side: THREE.DoubleSide,
});

function addMesh(parent, geo, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

// ─────────────────────────────────────────────────────────────
// item factories — each returns { group, setState(state) }
// ─────────────────────────────────────────────────────────────

function makeConduit() {
  const group = new THREE.Group();
  addMesh(group, new THREE.BoxGeometry(0.66, 1.42, 0.38), metal(0x1a232d), 0, 0.82, 0);
  addMesh(group, new THREE.BoxGeometry(0.76, 0.1, 0.48), metal(0x0d1218), 0, 1.58, 0);
  addMesh(group, new THREE.BoxGeometry(0.94, 0.07, 0.7), metal(0x0a0e13), 0, 0.035, 0);
  addMesh(group, new THREE.BoxGeometry(0.5, 0.06, 0.42), metal(0x222c37), 0, 1.45, 0.02);

  const slats = [];
  for (let i = 0; i < 3; i += 1) {
    const mat = glow(0x3fa8d6, 0.9);
    addMesh(group, new THREE.BoxGeometry(0.44, 0.08, 0.04), mat, 0, 0.56 + i * 0.25, 0.205);
    slats.push(mat);
  }

  const switchMat = glow(0x9c2b2b, 0.85);
  addMesh(group, new THREE.BoxGeometry(0.18, 0.14, 0.07), switchMat, 0, 1.33, 0.215);
  addMesh(group, new THREE.TorusGeometry(0.13, 0.018, 6, 16), metal(0x2a3541), 0, 1.33, 0.23);

  return {
    group,
    setState(state) {
      const hex = state === 'done' ? 0x45ffb0 : state === 'wrong' ? 0xff3b3b : 0x3fa8d6;
      slats.forEach((m) => m.emissive.setHex(hex));
      switchMat.emissive.setHex(state === 'done' ? 0x2b9f78 : 0x9c2b2b);
    },
  };
}

function makeValve() {
  const group = new THREE.Group();
  addMesh(group, new THREE.CylinderGeometry(0.09, 0.09, 1.5, 10), metal(0x2b333d, 0.85, 0.35), 0, 0.75, 0);
  addMesh(group, new THREE.CylinderGeometry(0.2, 0.24, 0.18, 12), metal(0x161d24), 0, 1.36, 0);
  addMesh(group, new THREE.BoxGeometry(0.52, 0.14, 0.3), metal(0x1e262f), 0, 0.32, 0);

  const wheelMat = glow(0xb03a2e, 0.8);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 8, 22), wheelMat);
  wheel.position.set(0, 1.05, 0.06);
  group.add(wheel);
  for (let i = 0; i < 3; i += 1) {
    const spoke = addMesh(group, new THREE.BoxGeometry(0.56, 0.035, 0.035), wheelMat, 0, 1.05, 0.06);
    spoke.rotation.z = (i / 3) * Math.PI;
  }
  addMesh(group, new THREE.SphereGeometry(0.07, 10, 8), metal(0x3a4652, 0.9, 0.3), 0, 1.05, 0.06);

  return {
    group,
    setState(state) {
      wheelMat.emissive.setHex(state === 'done' ? 0x45ffb0 : 0xb03a2e);
      wheelMat.emissiveIntensity = state === 'done' ? 1.5 : 0.8;
    },
  };
}

function makeRod(states) {
  const group = new THREE.Group();
  addMesh(group, new THREE.CylinderGeometry(0.36, 0.44, 0.22, 16), metal(0x121820), 0, 0.11, 0);
  addMesh(group, new THREE.CylinderGeometry(0.31, 0.31, 0.1, 16), metal(0x232c36), 0, 1.16, 0);
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    addMesh(group, new THREE.BoxGeometry(0.06, 1.0, 0.06), metal(0x161d25), Math.cos(a) * 0.3, 0.65, Math.sin(a) * 0.3);
  }

  const rodGroup = new THREE.Group();
  addMesh(rodGroup, new THREE.CylinderGeometry(0.075, 0.075, 1.0, 12), metal(0x495765, 0.9, 0.22), 0, 0, 0);
  const capMat = glow(0xff5a2a, 1.5);
  addMesh(rodGroup, new THREE.SphereGeometry(0.11, 12, 10), capMat, 0, 0.52, 0);
  rodGroup.position.y = 0.7;
  group.add(rodGroup);

  return {
    group,
    setState(state) {
      const idx = Math.max(0, states.indexOf(state));
      rodGroup.position.y = [1.02, 0.78, 0.54][idx] ?? 0.7;
      capMat.emissive.setHex([0xff5a2a, 0xffb45e, 0x45ffb0][idx] ?? 0xff5a2a);
    },
  };
}

function makeCryoPod() {
  const group = new THREE.Group();
  addMesh(group, new THREE.BoxGeometry(1.0, 0.28, 1.0), metal(0x141c24), 0, 0.14, 0);
  addMesh(group, new THREE.CylinderGeometry(0.42, 0.42, 1.5, 16, 1, true), darkGlass, 0, 1.03, 0);
  addMesh(group, new THREE.CylinderGeometry(0.5, 0.5, 0.8, 16), metal(0x161f28), 0, 0.52, 0);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a9aa2, roughness: 0.9, metalness: 0.05, emissive: 0x0a1a20, emissiveIntensity: 0.4 });
  const silhouette = addMesh(group, new THREE.CapsuleGeometry(0.17, 0.76, 4, 8), bodyMat, 0, 1.02, 0);
  silhouette.rotation.z = 0.02;

  addMesh(group, new THREE.CylinderGeometry(0.47, 0.47, 0.1, 16), metal(0x2a353f), 0, 1.84, 0);

  const panelMat = glow(0x2a7f97, 0.9);
  addMesh(group, new THREE.BoxGeometry(0.34, 0.26, 0.04), panelMat, 0, 1.18, 0.44);

  return {
    group,
    setState(state) {
      const done = state === 'done';
      bodyMat.emissive.setHex(done ? 0x1f8f68 : 0x0a1a20);
      bodyMat.emissiveIntensity = done ? 0.8 : 0.4;
      panelMat.emissive.setHex(done ? 0x45ffb0 : 0x2a7f97);
    },
  };
}

function makeSterilizer(states) {
  const group = new THREE.Group();
  addMesh(group, new THREE.BoxGeometry(0.78, 1.3, 0.26), metal(0x1b232c), 0, 1.02, 0);
  addMesh(group, new THREE.BoxGeometry(0.86, 0.1, 0.32), metal(0x0f151b), 0, 1.71, 0);
  addMesh(group, new THREE.BoxGeometry(0.86, 0.08, 0.32), metal(0x0f151b), 0, 0.33, 0);

  const tubeMats = [];
  [-0.2, 0.2].forEach((x) => {
    const mat = glow(0xff3b3b, 1.1);
    addMesh(group, new THREE.CylinderGeometry(0.035, 0.035, 0.98, 8), mat, x, 1.02, 0.17);
    tubeMats.push(mat);
  });

  const panelMat = glow(0xff3b3b, 0.9);
  addMesh(group, new THREE.BoxGeometry(0.3, 0.12, 0.03), panelMat, 0, 0.55, 0.145);

  const colorFor = (state) => ({ CONTAMINATED: 0xff3b3b, CYCLING: 0xffb45e, CLEAN: 0x45ffb0 })[state] ?? 0xff3b3b;

  return {
    group,
    setState(state) {
      const hex = colorFor(state);
      tubeMats.forEach((m) => m.emissive.setHex(hex));
      panelMat.emissive.setHex(hex);
    },
  };
}

function makeJar() {
  const group = new THREE.Group();
  addMesh(group, new THREE.CylinderGeometry(0.18, 0.24, 0.16, 12), metal(0x1a222b), 0, 0.08, 0);
  addMesh(group, new THREE.CylinderGeometry(0.055, 0.055, 0.72, 8), metal(0x2a333d), 0, 0.5, 0);
  addMesh(group, new THREE.CylinderGeometry(0.22, 0.2, 0.5, 14, 1, true), darkGlass, 0, 1.02, 0);

  const fillMat = new THREE.MeshStandardMaterial({ color: 0x1c2a24, emissive: 0x2f8f6a, emissiveIntensity: 0.5, roughness: 0.6 });
  addMesh(group, new THREE.SphereGeometry(0.13, 12, 10), fillMat, 0, 0.98, 0);
  addMesh(group, new THREE.CylinderGeometry(0.21, 0.21, 0.05, 12), metal(0x39424a), 0, 1.28, 0);

  return {
    group,
    setState(state) {
      const done = state === 'done';
      fillMat.emissive.setHex(done ? 0x45ffb0 : 0x2f8f6a);
      fillMat.emissiveIntensity = done ? 1.5 : 0.5;
    },
  };
}

function makeAntenna() {
  const group = new THREE.Group();
  addMesh(group, new THREE.CylinderGeometry(0.28, 0.36, 0.16, 14), metal(0x151c23), 0, 0.08, 0);
  addMesh(group, new THREE.CylinderGeometry(0.06, 0.07, 1.35, 10), metal(0x39434e), 0, 0.75, 0);

  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.46, 0.3, 20, 1, true), metal(0x4a5560, 0.85, 0.3));
  dish.position.set(0, 1.5, 0.03);
  dish.rotation.x = -Math.PI / 2;
  group.add(dish);

  addMesh(group, new THREE.TorusGeometry(0.45, 0.018, 6, 26), metal(0x6b7883, 0.9, 0.3), 0, 1.5, 0.18);

  const tipMat = glow(0x3fa8d6, 1.2);
  addMesh(group, new THREE.SphereGeometry(0.05, 8, 8), tipMat, 0, 1.5, 0.22);

  return {
    group,
    setState(state) {
      const done = state === 'done';
      tipMat.emissive.setHex(done ? 0x45ffb0 : 0x3fa8d6);
      tipMat.emissiveIntensity = done ? 2 : 1.2;
    },
  };
}

function makeSensor() {
  const group = new THREE.Group();
  addMesh(group, new THREE.BoxGeometry(0.56, 0.78, 0.18), metal(0x1a232c), 0, 1.12, 0);
  addMesh(group, new THREE.BoxGeometry(0.64, 0.08, 0.24), metal(0x0f151b), 0, 1.55, 0);
  addMesh(group, new THREE.BoxGeometry(0.64, 0.08, 0.24), metal(0x0f151b), 0, 0.7, 0);

  const lensMat = glow(0x6fd8ff, 1.3);
  addMesh(group, new THREE.SphereGeometry(0.11, 12, 10), lensMat, 0, 1.15, 0.11);
  addMesh(group, new THREE.TorusGeometry(0.16, 0.02, 6, 20), metal(0x3a4652, 0.9, 0.3), 0, 1.15, 0.1);

  return {
    group,
    setState(state) {
      const done = state === 'done';
      lensMat.emissive.setHex(done ? 0x45ffb0 : 0x6fd8ff);
      lensMat.emissiveIntensity = done ? 2 : 1.3;
    },
  };
}

function makeCommsConsole(states) {
  const group = new THREE.Group();
  addMesh(group, new THREE.BoxGeometry(0.98, 0.76, 0.62), metal(0x19222b), 0, 0.44, 0);
  addMesh(group, new THREE.BoxGeometry(0.78, 0.6, 0.08), metal(0x0d1319), 0, 1.0, 0.12).rotation.x = -0.5;

  const screenMat = glow(0x2f7d94, 1.1);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), screenMat);
  screen.position.set(0, 1.04, 0.2);
  screen.rotation.x = -0.5;
  group.add(screen);

  const keyMat = glow(0x2f7d94, 0.7);
  for (let i = 0; i < 3; i += 1) {
    addMesh(group, new THREE.BoxGeometry(0.14, 0.04, 0.06), keyMat, -0.24 + i * 0.24, 0.84, 0.28);
  }
  addMesh(group, new THREE.BoxGeometry(1.06, 0.06, 0.72), metal(0x0b1015), 0, 0.03, 0);

  const colorFor = (state) => ({ NOISE: 0x6280ff, WAVEFORM: 0xffb45e, LOCKED: 0x45ffb0 })[state] ?? 0x2f7d94;

  return {
    group,
    setState(state) {
      const hex = colorFor(state);
      screenMat.emissive.setHex(hex);
      keyMat.emissive.setHex(hex);
      screenMat.emissiveIntensity = state === 'LOCKED' ? 1.7 : 1.1;
    },
  };
}

// ─────────────────────────────────────────────────────────────
// task definitions
// ─────────────────────────────────────────────────────────────

const REACTOR_CONDUITS = {
  id: 'reactor-conduits',
  title: 'Reroute the power conduits',
  hint: 'Press E on the conduits in the order the panel shows.',
  why: 'Arcing conduits break the power route, and the reactor cannot make POWER through a broken route.',
  type: 'sequence',
  spots: [
    { x: -7.2, z: -21.0, ry: 0 },
    { x: 0, z: -22.8, ry: 0 },
    { x: 7.2, z: -21.0, ry: 0 },
  ],
  labels: ['1', '2', '3'],
  labelColor: '#8fe3ff',
  make: makeConduit,
  interactLabel: (i) => `Reroute power conduit ${i + 1}`,
  completeLine: 'Power rerouted. The core steadies.',
};

const REACTOR_COOLANT = {
  id: 'reactor-coolant',
  title: 'Close the coolant valves',
  hint: 'Press E on all four valves.',
  why: 'The core is venting coolant. Without it the reactor cannot hold pressure or make POWER.',
  type: 'count',
  spots: [
    { x: -8.2, z: -24.0, ry: 0.25 },
    { x: -3.4, z: -22.6, ry: 0 },
    { x: 3.4, z: -22.6, ry: 0 },
    { x: 8.2, z: -24.0, ry: -0.25 },
  ],
  labels: ['1', '2', '3', '4'],
  make: makeValve,
  interactLabel: (i) => `Seal coolant valve ${i + 1}`,
  stepLine: (i) => `Valve ${i + 1} sealed.`,
  completeLine: 'Leaks sealed. The hissing stops.',
};

const REACTOR_RODS = {
  id: 'reactor-rods',
  title: 'Seat the control rods',
  hint: 'Press E on each rod until it reads SEATED (two presses each).',
  why: 'The core runs hot until all three rods are seated, and only then does POWER stabilise.',
  type: 'cycle',
  states: ['RAISED', 'HALF', 'SEATED'],
  stateLabels: ['RAISED', 'HALF', 'SEATED'],
  spots: [
    { x: -6.0, z: -25.8, ry: 0 },
    { x: 0, z: -24.9, ry: 0 },
    { x: 6.0, z: -25.8, ry: 0 },
  ],
  labelColor: '#ffcf8a',
  make: (i) => makeRod(REACTOR_RODS.states),
  interactLabel: (i) => `Cycle control rod ${i + 1}`,
  stepLine: (i, state) => (state === 'SEATED' ? `Rod ${i + 1} seated.` : ''),
  completeLine: 'Rods seated. Output is stable. For now.',
};

const MED_PODS = {
  id: 'med-pods',
  title: 'Pick the growth pods',
  hint: 'Press E on all three pods.',
  why: 'These pods are your food and the ship\'s BIOMASS. Miss one and both run short.',
  type: 'count',
  spots: [
    { x: 22.5, z: -6.0, ry: 0 },
    { x: 26.0, z: -6.4, ry: 0 },
    { x: 29.5, z: -6.0, ry: 0 },
  ],
  labels: ['A', 'B', 'C'],
  labelColor: '#8dffcb',
  make: makeCryoPod,
  interactLabel: (i) => `Harvest growth pod ${'ABC'[i]}`,
  stepLine: (i) => `Pod ${'ABC'[i]}: yield logged.`,
  completeLine: 'Harvest complete. The bay smells of green.',
};

const MED_STERILIZERS = {
  id: 'med-sterilizers',
  title: 'Clean the nutrient lines',
  hint: 'Press E on each line until it reads CLEAN (two presses each).',
  why: 'Dirty lines poison the crop, and HYDRO stops making BIOMASS until they run clean.',
  type: 'cycle',
  states: ['CONTAMINATED', 'CYCLING', 'CLEAN'],
  stateLabels: ['DIRTY', 'CYCLING', 'CLEAN'],
  spots: [
    { x: 22.5, z: 6.3, ry: Math.PI },
    { x: 26.0, z: 6.7, ry: Math.PI },
    { x: 29.5, z: 6.3, ry: Math.PI },
  ],
  labelColor: '#ffcf8a',
  make: (i) => makeSterilizer(MED_STERILIZERS.states),
  interactLabel: (i) => `Cycle nutrient line ${i + 1}`,
  stepLine: (i, state) => (state === 'CLEAN' ? `Line ${i + 1} clean.` : ''),
  completeLine: 'Nutrient lines clean. The plants lean toward you.',
};

const MED_SAMPLES = {
  id: 'med-samples',
  title: 'Pollinate the trays',
  hint: 'Press the trays in the order the panel shows.',
  why: 'Without pollination the crop never sets, so there is no next BIOMASS harvest.',
  type: 'sequence',
  spots: [
    { x: 23.2, z: 5.2, ry: Math.PI },
    { x: 26.0, z: 5.4, ry: Math.PI },
    { x: 28.8, z: 5.2, ry: Math.PI },
  ],
  labels: ['1', '2', '3'],
  labelColor: '#8dffcb',
  make: makeJar,
  interactLabel: (i) => `Pollinate tray ${i + 1}`,
  completeLine: 'Pollination complete. Something moved under the leaves.',
};

const NAV_ANTENNAS = {
  id: 'nav-antennas',
  title: 'Point the antennas',
  hint: 'Press the dishes in the order the panel shows.',
  why: 'With the array down the ship is flying blind and NAV / COMMS makes no DATA.',
  type: 'sequence',
  spots: [
    { x: -23.4, z: -5.6, ry: 0.15 },
    { x: -26.6, z: -6.2, ry: 0 },
    { x: -29.8, z: -5.6, ry: -0.15 },
  ],
  labels: ['1', '2', '3'],
  labelColor: '#a9bbff',
  make: makeAntenna,
  interactLabel: (i) => `Align antenna ${i + 1}`,
  completeLine: 'Array aligned. The signal gets louder.',
};

const NAV_SENSORS = {
  id: 'nav-sensors',
  title: 'Read the drift sensors',
  hint: 'Press E on all three sensors.',
  why: 'The ship does not know where it is. Every reading restores the DATA Nav runs on.',
  type: 'count',
  spots: [
    { x: -23.5, z: 7.2, ry: Math.PI },
    { x: -26.5, z: 7.4, ry: Math.PI },
    { x: -29.5, z: 7.2, ry: Math.PI },
  ],
  labels: ['1', '2', '3'],
  labelColor: '#a9bbff',
  make: makeSensor,
  interactLabel: (i) => `Read drift sensor ${i + 1}`,
  stepLine: (i) => `Sector ${i + 1} logged. Nothing should be out there.`,
  completeLine: 'Drift logged. The stars have moved since yesterday.',
};

const NAV_CONSOLES = {
  id: 'nav-consoles',
  title: 'Lock the transmission',
  hint: 'Press E on each console until it reads LOCKED (two presses each).',
  why: 'A locked signal is the only way NAV / COMMS produces DATA. It is also a voice.',
  type: 'cycle',
  states: ['NOISE', 'WAVEFORM', 'LOCKED'],
  stateLabels: ['NOISE', 'WAVEFORM', 'LOCKED'],
  spots: [
    { x: -23.6, z: 2.6, ry: Math.PI / 2 },
    { x: -26.5, z: 2.9, ry: Math.PI / 2 },
    { x: -29.4, z: 2.6, ry: Math.PI / 2 },
  ],
  labelColor: '#ffcf8a',
  make: (i) => makeCommsConsole(NAV_CONSOLES.states),
  interactLabel: (i) => `Cycle comms console ${i + 1}`,
  stepLine: (i, state) => (state === 'LOCKED' ? 'Console locked. It is still talking.' : ''),
  completeLine: 'Transmission locked. It is a voice. It is saying your name.',
};

// ─────────────────────────────────────────────────────────────
// hydroponics harvest station (persistent, one harvest per day)
// ─────────────────────────────────────────────────────────────

export function createHydroponics() {
  const group = new THREE.Group();
  const frameMat = metal(0x1b2a24, 0.45, 0.6);
  const trayMat = metal(0x22352b, 0.35, 0.7);
  const leafMat = new THREE.MeshStandardMaterial({
    color: 0x0d2e1c,
    emissive: 0x2dff92,
    emissiveIntensity: 0.75,
    roughness: 0.62,
    metalness: 0.1,
  });
  const stemMat = new THREE.MeshStandardMaterial({
    color: 0x194e31,
    emissive: 0x0f5f38,
    emissiveIntensity: 0.35,
    roughness: 0.9,
  });

  addMesh(group, new THREE.BoxGeometry(1.55, 0.12, 0.78), frameMat, 0, 0.06, 0);
  [-0.68, 0.68].forEach((x) => {
    addMesh(group, new THREE.BoxGeometry(0.09, 2.05, 0.09), frameMat, x, 1.08, -0.29);
    addMesh(group, new THREE.BoxGeometry(0.09, 2.05, 0.09), frameMat, x, 1.08, 0.29);
  });

  for (let row = 0; row < 3; row += 1) {
    const y = 0.42 + row * 0.58;
    addMesh(group, new THREE.BoxGeometry(1.42, 0.08, 0.66), trayMat, 0, y, 0);
    addMesh(
      group,
      new THREE.BoxGeometry(1.28, 0.05, 0.54),
      new THREE.MeshStandardMaterial({ color: 0x233b2d, emissive: 0x1f6f47, emissiveIntensity: 0.35, roughness: 0.8 }),
      0,
      y + 0.06,
      0.02,
    );

    for (let i = 0; i < 4; i += 1) {
      const x = -0.48 + i * 0.32;
      const stem = addMesh(group, new THREE.CylinderGeometry(0.018, 0.025, 0.2, 5), stemMat, x, y + 0.18, 0.02);
      stem.rotation.z = (i - 1.5) * 0.1;
      const leaf = addMesh(group, new THREE.SphereGeometry(0.1, 7, 5), leafMat, x + (i - 1.5) * 0.02, y + 0.31, 0.04);
      leaf.scale.set(1.25, 0.7, 1);
      leaf.rotation.y = i * 0.7;
      if (i % 2 === 0) {
        const berry = addMesh(group, new THREE.SphereGeometry(0.075, 6, 4), leafMat, x + 0.11, y + 0.27, 0.08);
        berry.scale.set(1, 0.65, 1);
      }
    }
  }

  addMesh(group, new THREE.BoxGeometry(1.32, 0.05, 0.14), glow(0x5dffb0, 1.1), 0, 2.02, 0.18);
  addMesh(group, new THREE.BoxGeometry(0.09, 0.55, 0.09), frameMat, 0, 2.22, 0);

  const label = makeLabelSprite('HYDRO', '#8dffcb', 1.25);
  label.position.set(0, 2.72, 0);
  group.add(label);

  // Lit by the bay fixture and its own emissive leaves; a second point
  // light here only added shader cost.

  return group;
}

// ─────────────────────────────────────────────────────────────
// supply locker: a wall cabinet with the tools still in it
// ─────────────────────────────────────────────────────────────

export function createSupplyLocker(toolKey) {
  const meta = TOOL_META[toolKey];
  const group = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: 0x1d2730, metalness: 0.18, roughness: 0.86 });
  const shelf = new THREE.MeshStandardMaterial({ color: 0x141c24, metalness: 0.2, roughness: 0.9 });

  // An open-front cabinet: back panel, sides, top, bottom and one shelf.
  addMesh(group, new THREE.BoxGeometry(1.34, 2.14, 0.08), metal(0x0a1016), 0, 1.07, -0.21);
  addMesh(group, new THREE.BoxGeometry(0.08, 2.14, 0.46), frame, -0.63, 1.07, 0);
  addMesh(group, new THREE.BoxGeometry(0.08, 2.14, 0.46), frame, 0.63, 1.07, 0);
  addMesh(group, new THREE.BoxGeometry(1.34, 0.12, 0.46), frame, 0, 2.08, 0);
  addMesh(group, new THREE.BoxGeometry(1.34, 0.16, 0.46), frame, 0, 0.08, 0);
  addMesh(group, new THREE.BoxGeometry(1.18, 0.05, 0.4), shelf, 0, 0.62, 0);
  addMesh(group, new THREE.BoxGeometry(1.18, 0.05, 0.4), shelf, 0, 1.28, 0);
  addMesh(group, new THREE.BoxGeometry(1.16, 0.02, 0.03), glow(0x63d7ff, 0.9), 0, 0.6, 0.2);
  addMesh(group, new THREE.BoxGeometry(1.16, 0.02, 0.03), glow(0x63d7ff, 0.9), 0, 1.26, 0.2);
  addMesh(group, new THREE.BoxGeometry(0.44, 0.3, 0.03), glow(0x63d7ff, 0.5), 0, 0.55, 0.22);

  const tools = [];
  for (let i = 0; i < 5; i += 1) {
    const tool = new THREE.Group();

    if (toolKey === 'wrench') {
      addMesh(tool, new THREE.BoxGeometry(0.05, 0.26, 0.05), metal(0x9aa9b4, 0.9, 0.25), 0, 0, 0);
      const head = addMesh(tool, new THREE.TorusGeometry(0.062, 0.019, 6, 10), metal(0x9aa9b4, 0.9, 0.25), 0, 0.16, 0);
      head.rotation.y = Math.PI / 2;
    } else if (toolKey === 'filter') {
      addMesh(tool, new THREE.CylinderGeometry(0.055, 0.055, 0.24, 10), glow(0x59f0b0, 0.75), 0, 0, 0);
      addMesh(tool, new THREE.CylinderGeometry(0.062, 0.062, 0.03, 10), metal(0x5d6a74, 0.85, 0.3), 0, 0.13, 0);
    } else {
      addMesh(tool, new THREE.CylinderGeometry(0.02, 0.02, 0.3, 6), metal(0x8fa2b0, 0.85, 0.3), 0, 0, 0);
      addMesh(tool, new THREE.SphereGeometry(0.045, 8, 6), glow(0x8fb4ff, 1.2), 0, 0.17, 0);
    }

    // Two on the upper shelf, three below, all facing the open front.
    const top = i < 2;
    tool.position.set(top ? -0.18 + i * 0.36 : -0.36 + (i - 2) * 0.36, top ? 1.4 : 0.74, 0.02);
    tool.rotation.x = 0.06;
    group.add(tool);
    tools.push(tool);
  }

  const label = makeLabelSprite(`${meta.label} · 5`, meta.color, 1.05);
  label.position.set(0, 2.36, 0);
  group.add(label);

  // The emissive shelf strips read the stock without another point light.

  return {
    group,
    label,
    setStock(stock) {
      const shown = Math.max(0, Math.min(tools.length, Math.floor(stock)));
      tools.forEach((tool, index) => {
        tool.visible = index < shown;
      });
      label.setText(`${meta.label} · ${shown}`, shown > 0 ? meta.color : '#ff6a72');
    },
  };
}

export const TASK_POOL = {
  reactor: [REACTOR_CONDUITS, REACTOR_COOLANT, REACTOR_RODS],
  med: [MED_PODS, MED_STERILIZERS, MED_SAMPLES],
  nav: [NAV_ANTENNAS, NAV_SENSORS, NAV_CONSOLES],
};

// ─────────────────────────────────────────────────────────────
// build
// ─────────────────────────────────────────────────────────────

function clampInt(value, min, max) {
  const number = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, number));
}

function shuffledIndices(count) {
  const array = Array.from({ length: count }, (_, i) => i);
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function buildTask(def, roomId, api) {
  const runtime = {
    def,
    room: roomId,
    title: def.title,
    hint: def.hint,
    type: def.type,
    total: def.spots.length,
    progress: 0,
    complete: false,
    sequence: null,
    tool: null,
  };

  const flow = RESOURCE_FLOW[roomId] || null;
  const costKey = flow ? flow.cost : null;
  const yieldKey = flow ? flow.yields : null;
  const costTag = costKey ? `  ·  −${STEP_COST} ${RESOURCE_META[costKey].short}` : '';

  const toolKey = def.tool || ROOM_TOOL[roomId] || null;
  const toolMeta = toolKey ? TOOL_META[toolKey] : null;
  const toolTag = toolMeta ? `  ·  NEEDS ${toolMeta.label}` : '';
  runtime.tool = toolKey;

  const items = [];
  const states = def.states || null;
  let handler = () => {};
  let sequenceStep = 0;

  def.spots.forEach((spot, index) => {
    const built = def.make(index);
    const holder = new THREE.Group();
    holder.position.set(spot.x, 0, spot.z);
    holder.rotation.y = spot.ry || 0;
    holder.add(built.group);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.44, 0.54, 26),
      new THREE.MeshBasicMaterial({
        color: 0x63d7ff,
        transparent: true,
        opacity: 0.14,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: true,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    holder.add(ring);

    const initialLabel = states ? def.stateLabels?.[0] ?? states[0] : def.labels?.[index] ?? String(index + 1);
    const label = makeLabelSprite(initialLabel, def.labelColor ?? '#8fe3ff', 1.25);
    label.position.set(0, 1.98, 0);
    holder.add(label);

    const interactable = api.addInteractable(holder, {
      room: roomId,
      label: `${def.interactLabel ? def.interactLabel(index) : def.title}${costTag}${toolTag}`,
      onInteract: () => {
        if (runtime.complete) return;

        // A press only spends if it can actually take the step. A wrong
        // sequence press still rejects the order below, but it must not
        // eat a reserve and a tool on the way out.
        if (!accepts(index)) {
          if (def.type === 'sequence') handler(index);
          return;
        }

        // No reserve, no repair: this unit waits on another bay.
        if (costKey && typeof api.canAfford === 'function' && !api.canAfford(costKey, STEP_COST)) {
          if (typeof api.locked === 'function') api.locked(costKey);
          return;
        }

        // The right tool has to be in the backpack, and the step spends it.
        if (toolKey) {
          if (typeof api.hasTool === 'function' && !api.hasTool(toolKey)) {
            if (typeof api.needTool === 'function') api.needTool(toolKey);
            return;
          }
          if (typeof api.useTool === 'function' && !api.useTool(toolKey)) return;
        }

        if (costKey && typeof api.spend === 'function') api.spend(costKey, STEP_COST);

        const before = runtime.progress;
        handler(index);
        if (yieldKey && runtime.progress > before && typeof api.gain === 'function') {
          api.gain(yieldKey, STEP_COST);
        }
      },
    });

    if (states) built.setState(states[0]);

    items.push({ built, holder, label, interactable, ring, index, done: false, stateIndex: 0, atEnd: false });
  });

  // Whether pressing this unit would count as a step right now. Sequence
  // tasks only accept the next unit in the logged order; count tasks accept
  // units that are not yet serviced; cycle tasks accept units short of the
  // final state.
  function accepts(index) {
    if (runtime.complete) return false;

    const item = items[index];
    if (!item) return false;

    if (def.type === 'sequence') return !!runtime.sequence && runtime.sequence[sequenceStep] === index;
    if (def.type === 'cycle') return !item.atEnd;
    return !item.done;
  }

  function complete() {
    runtime.complete = true;
    runtime.progress = items.length;
    items.forEach((item) => item.interactable.setEnabled(false));
    if (typeof api.audio.success === 'function') api.audio.success();
    if (yieldKey && typeof api.gain === 'function') api.gain(yieldKey, COMPLETION_BONUS);
    api.onProgress(runtime);
    api.onComplete(runtime);
  }

  function markDone(item) {
    item.done = true;
    item.built.setState('done');
    item.label.setText(def.labels?.[item.index] ?? String(item.index + 1), '#6fffc4');
    item.interactable.setEnabled(false);
    item.ring.material.opacity = 0.34;
  }

  function resetItem(item) {
    item.done = false;
    item.atEnd = false;
    item.stateIndex = 0;
    item.built.setState('idle');
    item.label.setText(def.labels?.[item.index] ?? String(item.index + 1), def.labelColor ?? '#8fe3ff');
    item.interactable.setEnabled(true);
    item.ring.material.opacity = 0.14;
  }

  if (def.type === 'sequence') {
    runtime.sequence = shuffledIndices(items.length);
    runtime.hint = `ACTIVATE IN ORDER: ${runtime.sequence.map((i) => i + 1).join(' → ')}`;

    handler = (index) => {
      const item = items[index];
      if (item.done) return;

      if (runtime.sequence[sequenceStep] === index) {
        sequenceStep += 1;
        markDone(item);
        runtime.progress = sequenceStep;
        api.audio.beep(430 + sequenceStep * 120, 0.1, 'sine', 0.055);
        if (sequenceStep === items.length) complete();
        api.onProgress(runtime);
      } else {
        sequenceStep = 0;
        runtime.progress = 0;
        items.forEach(resetItem);
        api.audio.deny();
        api.scare();
        api.log('Sequence rejected. The array resets.', 'bad');
        api.onProgress(runtime);
      }
    };
  } else if (def.type === 'count') {
    handler = (index) => {
      const item = items[index];
      if (item.done) return;
      markDone(item);
      runtime.progress = items.filter((it) => it.done).length;
      api.audio.beep(520 + index * 55, 0.09, 'sine', 0.05);
      if (def.stepLine) {
        const line = def.stepLine(index);
        if (line) api.log(line, 'good');
      }
      if (runtime.progress === items.length) complete();
      api.onProgress(runtime);
    };
  } else if (def.type === 'cycle') {
    handler = (index) => {
      const item = items[index];
      if (item.atEnd) return;

      item.stateIndex = Math.min(states.length - 1, item.stateIndex + 1);
      const state = states[item.stateIndex];
      item.built.setState(state);
      const atEnd = item.stateIndex === states.length - 1;
      item.label.setText(def.stateLabels?.[item.stateIndex] ?? state, atEnd ? '#6fffc4' : '#ffcf8a');
      item.atEnd = atEnd;
      if (atEnd) item.interactable.setEnabled(false);
      item.ring.material.opacity = atEnd ? 0.34 : 0.2;
      runtime.progress = items.filter((it) => it.atEnd).length;
      api.audio.beep(300 + item.stateIndex * 95 + index * 15, 0.09, 'square', 0.04);
      if (def.stepLine) {
        const line = def.stepLine(index, state);
        if (line) api.log(line, 'good');
      }
      if (runtime.progress === items.length) complete();
      api.onProgress(runtime);
    };
  }

  // Snapshot/restore exist so a refresh can rebuild the same shift:
  // sequence order, which units were serviced, and every cycle state.
  runtime.snapshot = () => ({
    defId: def.id,
    progress: runtime.progress,
    complete: runtime.complete,
    sequence: runtime.sequence ? runtime.sequence.slice() : null,
    done: items.filter((item) => item.done).map((item) => item.index),
    states: items.map((item) => item.stateIndex),
  });

  runtime.restore = (snapshot) => {
    if (!snapshot || typeof snapshot !== 'object') return;

    const complete = snapshot.complete === true;
    const restoredDone = Array.isArray(snapshot.done) ? snapshot.done.filter(Number.isInteger) : [];
    const restoredStates = Array.isArray(snapshot.states) ? snapshot.states : [];

    if (def.type === 'sequence') {
      const savedOrder = snapshot.sequence;
      const orderValid = Array.isArray(savedOrder)
        && savedOrder.length === items.length
        && savedOrder.every((value) => Number.isInteger(value) && value >= 0 && value < items.length)
        && new Set(savedOrder).size === items.length;

      if (orderValid) {
        runtime.sequence = savedOrder.slice();
        runtime.hint = `ACTIVATE IN ORDER: ${runtime.sequence.map((i) => i + 1).join(' → ')}`;
      }

      sequenceStep = complete ? items.length : clampInt(snapshot.progress, 0, items.length);
      runtime.progress = sequenceStep;

      items.forEach((item) => {
        const position = runtime.sequence.indexOf(item.index);
        if (complete || (position >= 0 && position < sequenceStep)) {
          markDone(item);
        } else {
          resetItem(item);
        }
      });
    } else if (def.type === 'count') {
      const doneSet = new Set(restoredDone);
      items.forEach((item) => {
        if (complete || doneSet.has(item.index)) markDone(item);
        else resetItem(item);
      });
      runtime.progress = items.filter((item) => item.done).length;
    } else if (def.type === 'cycle') {
      items.forEach((item) => {
        const stateIndex = complete
          ? states.length - 1
          : clampInt(restoredStates[item.index], 0, states.length - 1);
        const state = states[stateIndex];
        const atEnd = stateIndex === states.length - 1;

        item.stateIndex = stateIndex;
        item.atEnd = atEnd;
        item.built.setState(state);
        item.label.setText(def.stateLabels?.[stateIndex] ?? state, atEnd ? '#6fffc4' : '#ffcf8a');
        item.interactable.setEnabled(!atEnd);
        item.ring.material.opacity = atEnd ? 0.34 : 0.14;
      });
      runtime.progress = items.filter((item) => item.atEnd).length;
    }

    if (complete || runtime.progress >= items.length) {
      runtime.complete = true;
      runtime.progress = items.length;
      items.forEach((item) => item.interactable.setEnabled(false));
    }

    if (typeof api.onProgress === 'function') api.onProgress(runtime);
  };

  // Anchors for the helmet's task pointers. Only units that still need
  // attention are active; a sequence points at the next unit only.
  runtime.getTargets = () => items.map((item) => {
    let label = def.labels?.[item.index] ?? String(item.index + 1);
    if (def.type === 'cycle') {
      label = def.stateLabels?.[item.stateIndex] ?? states?.[item.stateIndex] ?? label;
    }

    let active = false;
    if (!runtime.complete) {
      if (def.type === 'sequence') active = runtime.sequence[sequenceStep] === item.index;
      else if (def.type === 'count') active = !item.done;
      else if (def.type === 'cycle') active = !item.atEnd;
    }

    return {
      index: item.index,
      x: item.holder.position.x,
      y: 2.12,
      z: item.holder.position.z,
      label,
      active,
    };
  });

  return runtime;
}
