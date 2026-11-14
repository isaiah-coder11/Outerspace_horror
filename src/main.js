import * as THREE from 'three';
import { AudioEngine } from './audio.js';
import { createWorld, createSleepPod, createEscapePod, WALKABLE, LAYOUT, roomAt, outCoord } from './world.js';
import {
  buildTask,
  TASK_POOL,
  ROOM_META,
  RESOURCE_FLOW,
  RESOURCE_META,
  TOOL_META,
  ROOM_TOOL,
  LOCKER_TOOL,
  createHydroponics,
  createSupplyLocker,
} from './tasks.js';
import { readSave, writeSave, clearSave } from './save.js';

// ─────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────

const $ = (selector) => document.querySelector(selector);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const pick = (list) => list[Math.floor(Math.random() * list.length)];

// The way off the ship. 40 reserves, split so every bay contributes, and
// the clamps only release after a run of shifts on a sound hull.
const ESCAPE_COST = { power: 14, biomass: 13, data: 13 };
const ESCAPE_TOTAL = Object.values(ESCAPE_COST).reduce((sum, value) => sum + value, 0);
const POD_MIN_SHIFTS = 10;

// The task panel doubles as a locator: a compartment's row points at the
// bay that produces the reserve that compartment burns.
const TASK_ROW_KEYS = { reactor: '1', med: '2', nav: '3' };
const TASK_KEYS = { Digit1: 'reactor', Digit2: 'med', Digit3: 'nav' };
const POD_MIN_SECURITY = 30;

const ESCAPE_LINES = [
  'The pod punches clear of the hull. Erebus-9 shrinks to a light, then nothing.',
  'The clamps let go. The ship falls away behind you, still breathing.',
  'Acceleration presses you into the seat. Whatever was walking the corridors stays with the ship.',
];

const FLAVOUR_LINES = [
  'Something moved at the end of the corridor.',
  'The hull is breathing. You can hear it.',
  'Someone is counting in the vents. They keep starting over at one.',
  'The lights report no fault. The lights are wrong.',
  'A door closes in a room you already left.',
  'The air smells like static and copper.',
  'Your footsteps come back a half second late.',
  'The manifest said fourteen. It still says fourteen.',
];

const NIGHT_DONE_LINES = [
  'You seal the pod. The ship is quiet. Too quiet.',
  'Maintenance complete. Something stood outside the pod all night.',
  'The lights die one by one. You count them. You wish you had not.',
];

const NIGHT_FAIL_LINES = [
  'You seal the pod with work unfinished.',
  'It was in the corridor when you woke. It did not run.',
  'The ship groans all night, and something groans with it.',
];

const NIGHT_AMBIENT_LINES = [
  'At 03:14 the proximity alarm sounds once, then stops.',
  'You dream of a corridor that is longer than the ship.',
  'The cryo pod reads a second heartbeat.',
];

const NIGHT_GRACE_LINES = [
  'You seal the pod. The ship holds its breath.',
  'Ship control holds. The hull is patient.',
  'Nothing scratches at the pod tonight. Nothing you can hear.',
];

const WAKE_DONE_LINES = [
  'You wake with your hands shaking. All systems nominal.',
  'You wake. The corridor light is on again. You did not leave it on.',
];

const WAKE_FAIL_LINES = [
  'You wake. Something was in the room while you slept.',
  'You wake. There are wet footprints by the pod. They are not yours.',
];

const GO_LINES = [
  'The corridor is quiet now. It has what it came for.',
  'The manifest still says fourteen. It is lying.',
  'Somewhere below deck, the hull takes one more breath.',
];

const SHIFT_SECONDS = 240;

// The ship starts flush with reserves. They leak every night from
// day three, so a station you skip eventually starves the next one.
const START_RESOURCES = { power: 30, biomass: 30, data: 30 };

// The leak follows the shift arc: nothing while the ship is still teaching
// you, a background hiss through the first cracks, a real squeeze once the
// novelty is gone, and a losing battle after the second week.
const RESOURCE_LEAK_TABLE = [0, 0, 0, 0, 2, 3, 4, 5, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

function reserveLeakFor(day) {
  const index = clamp(Math.floor(day), 0, RESOURCE_LEAK_TABLE.length - 1);
  return RESOURCE_LEAK_TABLE[index];
}

// Hull cracks open from this day on. Every crack costs its own severity in
// ship control each night and widens until somebody welds it shut.
const CRACK_START_DAY = 5;
const CRACK_MAX = 5;

// Tools live in the supply lockers. Every morning each locker is
// restocked with one less tool than the morning before, so the
// first shifts have spares to waste and the late ones do not.
const BACKPACK_SIZE = 4;
const TOOL_RESTOCK_BASE = 5;
const storeStockForDay = (day) => Math.max(1, TOOL_RESTOCK_BASE - (day - 1));

// One press per unit, except a cycle task, which takes a press for every
// state after the first. Restocking below this makes a bay impossible to
// finish however well the walk is planned.
function taskPresses(task) {
  if (!task) return 0;
  if (task.type === 'cycle') return task.total * Math.max(1, (task.def.states?.length ?? 2) - 1);
  return task.total;
}

const WATCHER_LINES = [
  'It is standing at the end of the corridor.',
  'A shape waits between the lights. It does not move.',
  'Something tall is watching from the dark.',
];

const CORRIDOR_ROOMS = ['corridorN', 'corridorE', 'corridorW', 'corridorS'];

// Where each cabin's door meets the north corridor. The one-time scare puts
// the thing in one of these, facing whoever walks out.
const CABIN_DOORS = {
  // It stands a couple of metres inside the cabin, so the door frame reads
  // around it instead of its face filling the visor.
  cabinA: { x: -4.4, z: -10.5 },
  cabinB: { x: -4.4, z: -23.7 },
};

const CORRIDOR_LINES = [
  'The corridor is one shade dimmer than it was yesterday.',
  'Something keeps pace with you past the last fixture, then stops.',
  'The red strip by your boot is wet. It is not water.',
  'You can hear the hull breathing. Ships do not breathe.',
  'The far end of the corridor is further away than the corridor is long.',
  'A vent cover is lying on the floor. The screws are on the inside.',
];

const VENT_LINES = [
  'The vent is breathing. It wants you to lean closer.',
  'Something behind the slats shifts its weight.',
  'The grate is warm. Something inside it is alive.',
];

const TASK_EERIE_LINES = [
  'The compartment goes quiet — the kind of quiet that is listening.',
  'Something in the wall taps back, once, in the same rhythm.',
  'The unit is fixed. The reflection in it is still working.',
  'The lights hold. The thing in the vent does not.',
];

// ─────────────────────────────────────────────────────────────
// DOM
// ─────────────────────────────────────────────────────────────

const hud = $('#hud');
const startScreen = $('#startScreen');
const pauseScreen = $('#pauseScreen');
const wakeScene = $('#wakeScene');
const wakeBtn = $('#wakeBtn');
const alarmWash = $('#alarmWash');
const tutorialScreen = $('#tutorial');
const tutTitle = $('#tutTitle');
const tutText = $('#tutText');
const tutStepLabel = $('#tutStep');
const tutNext = $('#tutNext');
const tutSkip = $('#tutSkip');
const modal = $('#modal');
const nightScreen = $('#nightScreen');
const gameOverScreen = $('#gameOver');
const lifeFill = $('#lifeFill');
const lifeValue = $('#lifeValue');
const dayLabel = $('#dayLabel');
const taskCount = $('#taskCount');
const taskList = $('#taskList');
const markEscapeBtn = $('#markEscape');
const markCracksBtn = $('#markCracks');
const markCracksCount = $('#markCracksCount');
const crosshair = $('#crosshair');
const interactPrompt = $('#interactPrompt');
const interactText = $('#interactText');
const logEl = $('#log');
const struggleEl = $('#struggle');
const struggleFillEl = $('#struggleFill');
const struggleCostEl = $('#struggleCost');
const strugglePressEl = $('#strugglePress');
const roomBanner = $('#roomBanner');
const roomBannerText = roomBanner.querySelector('span');
const vignette = $('#vignette');
const nightDay = $('#nightDay');
const nightLifeFill = $('#nightLifeFill');
const nightLifeValue = $('#nightLifeValue');
const nightLine1 = $('#nightLine1');
const nightLine2 = $('#nightLine2');
const nightDrain = $('#nightDrain');
const modalSummary = $('#modalSummary');
const modalWarn = $('#modalWarn');
const goStats = $('#goStats');
const goLine = $('#goLine');
const startBtn = $('#startBtn');
const restartBtn = $('#restartBtn');
const resumePanel = $('#resumePanel');
const noteScreen = $('#noteScreen');
const noteEyebrow = $('#noteEyebrow');
const noteTitle = $('#noteTitle');
const noteBody = $('#noteBody');
const noteCount = $('#noteCount');
const resumeBtn = $('#resumeBtn');
const resumeMeta = $('#resumeMeta');
const resetBtn = $('#resetBtn');
const waypointsLayer = $('#waypoints');
const decayHint = $('#decayHint');
const energyFill = $('#energyFill');
const energyValue = $('#energyValue');
const hungerFill = $('#hungerFill');
const hungerValue = $('#hungerValue');
const shiftTimer = $('#shiftTimer');
const timerValue = $('#timerValue');
const timerFill = $('#timerFill');
const scareFlash = $('#scareFlash');
const ventFx = $('#ventFx');
const app = $('#app');
const reserveChips = {
  power: $('#resPower'),
  biomass: $('#resBiomass'),
  data: $('#resData'),
};
const reserveNext = {
  power: $('#resPowerNext'),
  biomass: $('#resBiomassNext'),
  data: $('#resDataNext'),
};
const reserveForecast = $('#reserveForecast');
const backpackCount = $('#bpCount');
const backpackSlots = $('#bpSlots');
const storeLine = $('#storeLine');
const goEyebrow = $('#goEyebrow');
const goTitle = $('#goTitle');

// ─────────────────────────────────────────────────────────────
// renderer / world
// ─────────────────────────────────────────────────────────────

const canvas = $('#scene');
const nativePixelRatio = window.devicePixelRatio || 1;

// The scene is lit by many point lights, so every extra pixel costs. Cap
// the internal resolution and let adaptQuality() trade it for frame rate.
const MAX_PIXEL_RATIO = Math.min(nativePixelRatio, 1.5);
const MIN_PIXEL_RATIO = 0.7;
let pixelRatio = MAX_PIXEL_RATIO;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: nativePixelRatio < 1.5,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';
scene.add(camera);

scene.add(new THREE.AmbientLight(0x2c3f52, 0.5));
scene.add(new THREE.HemisphereLight(0x22384a, 0x020305, 0.55));

const flashlight = new THREE.SpotLight(0xfff1dc, 48, 28, 0.52, 0.65, 1.5);
flashlight.position.set(0.16, -0.12, 0);
camera.add(flashlight);
const flashlightTarget = new THREE.Object3D();
flashlightTarget.position.set(0, 0, -1);
camera.add(flashlightTarget);
flashlight.target = flashlightTarget;

const world = createWorld(scene);

// ─────────────────────────────────────────────────────────────
// state
// ─────────────────────────────────────────────────────────────

const audio = new AudioEngine();

let pendingSave = null;
// Set once the escape pod exists, so setLife() can refresh its seal state
// without touching the pod before it is built.
let refreshPodHandle = () => {};
let resetArmed = false;
let resetTimer = 0;

const state = {
  started: false,
  phase: 'idle', // idle | day | night | over
  day: 1,
  life: 100, // ship control; the save key keeps its original name
  energy: 100,
  hunger: 100,
  timeLeft: SHIFT_SECONDS,
  resources: { ...START_RESOURCES },
  backpack: { wrench: 0, filter: 0, probe: 0 },
  lockers: { reactor: TOOL_RESTOCK_BASE, med: TOOL_RESTOCK_BASE, nav: TOOL_RESTOCK_BASE },
  harvestedToday: false,
  lowEnergyWarned: false,
  lowHungerWarned: false,
  timerWarned: false,
  forcedSleep: false,
  monsterPhase: 0,
  huntActive: false,
  huntNode: null,
  huntPlayerNode: null,
  huntPath: [],
  nextWatcher: 12,
  nextScare: 22,
  nextDoor: 20,
  nextScurry: 8,
  nextVentPeek: 22,
  nextCorridorPeek: 32,
  ventPeek: null,
  corridorPeek: null,
  firstSighting: false,
  firstSightingTimer: 0,
  standRoom: null,
  standCooldown: 0,
  ventCooldown: 0,
  ventEvent: null,
  doorScare: null,
  ventHuntPending: 0,
  ventAmbient: 18,
  corridorRoom: null,
  corridorTimer: 0,
  escape: null,
  podBuilt: false,
  cracks: [],
  patches: [],
  shake: 0,
  tasks: {},
  focusTask: null,
  // 'unit' marks the next thing to press; 'source' marks what that press is
  // short of once it has been tried.
  markPhase: 'unit',
  completedCount: 0,
  lastPicks: {},
  uiBlocking: null, // null | 'modal' | 'night' | 'gameover'
  runId: 0,
  hadLock: false,
};

const player = {
  pos: new THREE.Vector3(0, 0, 3.4),
  yaw: 0,
  pitch: 0,
  yawTarget: 0,
  pitchTarget: 0,
  vel: new THREE.Vector2(0, 0),
  roll: 0,
  height: 1.62,
  bob: 0,
  fov: 72,
};

const keys = new Set();
let dragging = false;
let hovered = null;
let lastRoom = null;
let roomBannerTimer = null;
let waypointEls = new Map();
let waypointTimer = 0;
let reservePointer = null;
let interactTimer = 0;

// ─────────────────────────────────────────────────────────────
// interactables
// ─────────────────────────────────────────────────────────────

const interactRoot = new THREE.Group();
interactRoot.name = 'interactables';
scene.add(interactRoot);

const interactables = [];
const raycaster = new THREE.Raycaster();

function registerInteractable(group, options) {
  const handle = {
    group,
    enabled: true,
    ...options,
    setEnabled(value) {
      handle.enabled = !!value;
      if (!value && hovered === handle) setHovered(null);
    },
  };

  group.userData.interact = handle;
  group.traverse((node) => {
    if (node.isMesh) node.userData.interact = handle;
  });
  interactRoot.add(group);
  interactables.push(handle);
  return handle;
}

function removeInteractable(handle) {
  handle.enabled = false;

  if (handle.group.parent) handle.group.parent.remove(handle.group);
  handle.group.traverse((node) => {
    if (node.isMesh || node.isSprite) {
      if (node.geometry) node.geometry.dispose();
      const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : [];
      materials.forEach((material) => {
        if (material.map) material.map.dispose();
        material.dispose();
      });
    }
  });

  const index = interactables.indexOf(handle);
  if (index >= 0) interactables.splice(index, 1);
  if (hovered === handle) setHovered(null);
}

// the cryo pod lives in the hub and ends the day
const sleepPod = createSleepPod();
sleepPod.position.set(0, 0, 6.1);
sleepPod.rotation.y = Math.PI;
registerInteractable(sleepPod, {
  room: 'hub',
  label: 'Enter cryo pod — end shift',
  onInteract: openEndModal,
});

// the escape pod waits in the south bay; assembling it is the way out
const escapePod = createEscapePod();
escapePod.group.position.set(0, 0, outCoord(28));
const escapeHandle = registerInteractable(escapePod.group, {
  room: 'escape',
  label: `Build escape pod — ${ESCAPE_TOTAL} reserves`,
  onInteract: useEscapePod,
});
refreshPodHandle = refreshEscapePod;

// one meal per day grows in the east bay
const hydro = createHydroponics();
hydro.position.set(outCoord(31.3), 0, 0);
hydro.rotation.y = -Math.PI / 2;
const hydroHandle = registerInteractable(hydro, {
  room: 'med',
  label: 'Harvest hydroponics — eat',
  onInteract: harvestFood,
});

// ─────────────────────────────────────────────────────────────
// supply lockers
//
// Every repair step needs a tool in the backpack, and each bay's
// tool is kept in a different bay's locker.
// ─────────────────────────────────────────────────────────────

const LOCKER_SPOTS = [
  { room: 'reactor', x: 8.4, z: outCoord(-32.4), ry: 0 },
  { room: 'med', x: outCoord(32.4), z: 3.6, ry: -Math.PI / 2 },
  { room: 'nav', x: outCoord(-32.4), z: -4.0, ry: Math.PI / 2 },
];

const lockers = {};

LOCKER_SPOTS.forEach((spot) => {
  const toolKey = LOCKER_TOOL[spot.room];
  const built = createSupplyLocker(toolKey);
  built.group.position.set(spot.x, 0, spot.z);
  built.group.rotation.y = spot.ry;

  const handle = registerInteractable(built.group, {
    room: spot.room,
    label: `Take ${TOOL_META[toolKey].label} — ${TOOL_META[toolKey].storeName}`,
    onInteract: () => takeTool(spot.room),
  });

  lockers[spot.room] = { ...spot, built, handle, toolKey };
});

// ─────────────────────────────────────────────────────────────
// crew notes
//
// The cabins off the north corridor still hold the crew's paper: one page on
// each desk, one taped to a wall. Reading them is the only record of what the
// last shift understood before it ended.
// ─────────────────────────────────────────────────────────────

const notesRead = new Set();

// A note is read off the page, not shouted down the intercom: the room stops,
// the shift clock stops, and you get the whole sheet.
function openNote(note) {
  const total = world.notes.length;
  const index = world.notes.findIndex((entry) => entry.id === note.id);
  const room = LAYOUT[note.room];

  noteEyebrow.textContent = `CREW NOTE \u00b7 ${room ? room.label : 'CABIN'}`;
  noteTitle.textContent = note.title;
  noteBody.replaceChildren(
    ...(note.body || []).map((line) => {
      const p = document.createElement('p');
      p.textContent = line;
      return p;
    }),
  );
  noteCount.textContent = `NOTE ${String(index + 1).padStart(2, '0')} OF ${String(total).padStart(2, '0')} \u00b7 ${notesRead.size} READ`;

  state.uiBlocking = 'note';
  noteScreen.classList.remove('hidden');
  setHovered(null);
  audio.beep(420, 0.08, 'sine', 0.04);
}

function closeNote() {
  if (state.uiBlocking !== 'note') return;

  noteScreen.classList.add('hidden');
  state.uiBlocking = null;
  audio.beep(230, 0.07, 'sine', 0.035);
  if (state.hadLock && !document.pointerLockElement) showPause();
}

if (noteScreen) noteScreen.addEventListener('click', () => closeNote());

function readCrewNote(note) {
  if (state.phase !== 'day' || state.uiBlocking) return;

  notesRead.add(note.id);
  openNote(note);
  world.flicker(1.2);

  log(`READ — ${note.title.toUpperCase()}.`, 'ghostly');
  window.setTimeout(() => {
    if (notesRead.size >= world.notes.length) {
      log('That is every note they left. Not one of them signed off.', 'warn');
    } else {
      log(`NOTES READ — ${notesRead.size}/${world.notes.length}.`, 'ghostly');
    }
  }, 900);
}

world.notes.forEach((note) => {
  const group = new THREE.Group();
  group.position.set(note.x, note.y, note.z);

  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.5, 0.24),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  group.add(hit);

  registerInteractable(group, {
    room: note.room,
    label: `Read ${note.title}`,
    onInteract: () => readCrewNote(note),
  });
});

function backpackTotal() {
  return Object.keys(TOOL_META).reduce((total, key) => total + (state.backpack[key] || 0), 0);
}

function hasTool(toolKey) {
  return (state.backpack[toolKey] || 0) > 0;
}

function takeTool(roomId) {
  if (state.phase !== 'day' || state.uiBlocking) return;

  const locker = lockers[roomId];
  if (!locker) return;

  const meta = TOOL_META[locker.toolKey];
  const stock = state.lockers[roomId] ?? 0;

  if (stock <= 0) {
    log(`THE ${meta.storeName} IS EMPTY — NO ${meta.label} UNTIL MORNING.`, 'bad');
    audio.deny();
    world.flicker(1.2);
    return;
  }

  if (backpackTotal() >= BACKPACK_SIZE) {
    log(`BACKPACK FULL (${BACKPACK_SIZE}) — USE A TOOL BEFORE TAKING ANOTHER.`, 'warn');
    audio.deny();
    return;
  }

  state.lockers[roomId] = stock - 1;
  state.backpack[locker.toolKey] = (state.backpack[locker.toolKey] || 0) + 1;
  refreshToolsUI();
  saveProgress();
  audio.beep(560, 0.08, 'sine', 0.05);
  log(`TOOK ${meta.label} — ${state.lockers[roomId]} LEFT IN THE ${meta.storeName}.`, 'good');
}

function spendTool(toolKey) {
  if (!hasTool(toolKey)) return false;
  state.backpack[toolKey] -= 1;
  refreshToolsUI();
  saveProgress();
  audio.beep(360, 0.06, 'square', 0.035);
  return true;
}

function needTool(toolKey) {
  const meta = TOOL_META[toolKey];
  if (!meta) return;
  log(`NEED A ${meta.label} — ${meta.storeName}, ${ROOM_META[meta.store].name}.`, 'bad');
  audio.deny();
  world.flicker(1.3);
  state.shake = Math.max(state.shake, 0.16);
}

function refreshToolsUI() {
  Object.entries(lockers).forEach(([room, locker]) => {
    locker.built.setStock(state.lockers[room] ?? 0);

    const meta = TOOL_META[locker.toolKey];
    const stock = state.lockers[room] ?? 0;
    locker.handle.label = stock > 0
      ? `Take ${meta.label} — ${stock} left in ${meta.storeName}`
      : `${meta.storeName} empty — restocks in the morning`;
  });

  if (backpackSlots) {
    backpackSlots.replaceChildren();
    const held = Object.keys(TOOL_META).filter((key) => hasTool(key));

    if (!held.length) {
      const empty = document.createElement('span');
      empty.className = 'bp-empty';
      empty.textContent = 'EMPTY — TOOLS ARE IN THE LOCKERS';
      backpackSlots.append(empty);
    } else {
      held.forEach((key) => {
        const meta = TOOL_META[key];

        const slot = document.createElement('span');
        slot.className = 'bp-slot';
        slot.style.setProperty('--bp-color', meta.color);

        const name = document.createElement('span');
        name.textContent = meta.label;
        const count = document.createElement('b');
        count.textContent = `×${state.backpack[key]}`;

        slot.append(name, count);
        backpackSlots.append(slot);
      });
    }
  }

  if (backpackCount) backpackCount.textContent = `${backpackTotal()}/${BACKPACK_SIZE}`;

  if (storeLine) {
    const stores = Object.entries(LOCKER_TOOL).map(([room, key]) => ({ key, stock: state.lockers[room] ?? 0 }));
    storeLine.textContent = `STORES · ${stores.map((entry) => `${TOOL_META[entry.key].short} ${entry.stock}`).join(' · ')}`;

    const emptiest = Math.min(...stores.map((entry) => entry.stock));
    storeLine.dataset.level = emptiest <= 0 ? 'empty' : emptiest <= 1 ? 'low' : 'ok';
  }

  if (hovered && Object.values(lockers).some((locker) => locker.handle === hovered)) {
    interactText.textContent = hovered.label;
  }
}

function restockLockers() {
  const base = storeStockForDay(state.day);
  const required = {};

  // A locker's stock serves the bay that uses its tool, so pair them up
  // before deciding how much each shelf needs this morning.
  Object.entries(ROOM_TOOL).forEach(([roomId, toolKey]) => {
    const presses = taskPresses(state.tasks[roomId]);
    const lockerRoom = TOOL_META[toolKey].store;
    required[lockerRoom] = Math.max(required[lockerRoom] ?? 0, presses);
  });

  Object.keys(LOCKER_TOOL).forEach((room) => {
    state.lockers[room] = Math.max(base, required[room] ?? 0);
  });

  refreshToolsUI();
  return { base, min: Math.min(...Object.values(state.lockers)) };
}

// ─────────────────────────────────────────────────────────────
// HUD
// ─────────────────────────────────────────────────────────────

function log(message, tone = '') {
  const entry = document.createElement('div');
  entry.className = `entry ${tone}`.trim();
  entry.textContent = message;
  logEl.appendChild(entry);

  while (logEl.children.length > 4) logEl.removeChild(logEl.firstChild);

  window.setTimeout(() => {
    entry.style.transition = 'opacity 1.4s ease';
    entry.style.opacity = '0';
    window.setTimeout(() => entry.remove(), 1500);
  }, 9000);
}

function lifeLevel(value) {
  return value > 60 ? 'ok' : value > 30 ? 'warn' : 'crit';
}

function setLife(value) {
  state.life = clamp(value, 0, 100);
  lifeFill.style.width = `${state.life}%`;
  lifeFill.dataset.level = lifeLevel(state.life);
  lifeValue.textContent = `${Math.round(state.life)}%`;
  vignette.classList.toggle('critical', state.life <= 25);
  refreshPodHandle();
}

function renderNightLife(value) {
  nightLifeFill.style.width = `${clamp(value, 0, 100)}%`;
  nightLifeFill.dataset.level = lifeLevel(value);
  nightLifeValue.textContent = `${Math.round(value)}%`;
}

function vitalsLevel(value) {
  return value > 55 ? 'ok' : value > 25 ? 'warn' : 'crit';
}

function setVitalsUI() {
  energyFill.style.width = `${clamp(state.energy, 0, 100)}%`;
  energyFill.dataset.level = vitalsLevel(state.energy);
  energyValue.textContent = `${Math.round(state.energy)}%`;

  hungerFill.style.width = `${clamp(state.hunger, 0, 100)}%`;
  hungerFill.dataset.level = vitalsLevel(state.hunger);
  hungerValue.textContent = `${Math.round(state.hunger)}%`;

  vignette.classList.toggle('exhausted', state.energy <= 14);
  vignette.classList.toggle('starving', state.hunger <= 14);
}

function updateTimerUI() {
  const total = Math.max(0, Math.ceil(state.timeLeft));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  timerValue.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  timerFill.style.width = `${clamp((state.timeLeft / SHIFT_SECONDS) * 100, 0, 100)}%`;
  shiftTimer.classList.toggle('danger', state.timeLeft <= 30);
}

function refreshHydroLabel() {
  if (!hydroHandle) return;
  hydroHandle.label = state.harvestedToday
    ? 'Hydroponics harvested — grows back tomorrow'
    : 'Harvest hydroponics — eat (+45 hunger)';
  if (hovered === hydroHandle) interactText.textContent = hydroHandle.label;
}

function harvestFood() {
  if (state.phase !== 'day' || state.uiBlocking) return;

  if (state.harvestedToday) {
    log('The hydroponics are spent until tomorrow.', 'warn');
    audio.deny();
    return;
  }

  state.harvestedToday = true;
  state.hunger = clamp(state.hunger + 45, 0, 100);
  state.energy = clamp(state.energy + 25, 0, 100);
  setVitalsUI();
  refreshHydroLabel();
  saveProgress();
  audio.success();
  log('You harvest and eat. Hunger +45, energy +25.', 'good');
}

// ─────────────────────────────────────────────────────────────
// compartment reserves
// ─────────────────────────────────────────────────────────────

function setResourcesUI() {
  Object.entries(RESOURCE_META).forEach(([key, meta]) => {
    const el = reserveChips[key];
    if (!el) return;

    const value = Math.max(0, Math.floor(state.resources[key] ?? 0));
    el.textContent = String(value);

    const chip = el.closest('.reserve');
    if (chip) {
      chip.dataset.level = value <= 0 ? 'empty' : value <= 4 ? 'low' : 'ok';
      chip.title = `${meta.label} — produced in ${meta.source}`;
    }
  });

  updateReserveForecast();
}

// How much every reserve will lose when this shift ends. Tasks finished
// reduce the hull leak, so the forecast follows task completion.
function nextNightReserveDrain() {
  return reserveLeakFor(state.day);
}

function updateReserveForecast() {
  if (!reserveForecast) return;

  const drain = nextNightReserveDrain();
  const keys = Object.keys(RESOURCE_META);
  const after = {};
  keys.forEach((key) => {
    after[key] = Math.max(0, (state.resources[key] ?? 0) - drain);
  });

  keys.forEach((key) => {
    const el = reserveNext[key];
    if (!el) return;
    el.textContent = drain > 0 ? `−${drain}` : '';
    el.hidden = drain <= 0;
    el.dataset.level = after[key] <= 0 ? 'empty' : after[key] <= 2 ? 'low' : 'ok';
  });

  if (drain <= 0) {
    reserveForecast.textContent = 'NEXT NIGHT · NO LEAK — RESERVES HOLD';
    reserveForecast.dataset.level = 'ok';
    return;
  }

  const dry = keys.filter((key) => after[key] <= 0);
  const low = keys.filter((key) => after[key] > 0 && after[key] <= 2);
  const labels = (list) => list.map((key) => RESOURCE_META[key].label).join(' & ');
  const consumers = (list) => list
    .map((key) => Object.keys(RESOURCE_FLOW).find((room) => RESOURCE_FLOW[room].cost === key))
    .filter(Boolean)
    .map((room) => ROOM_META[room].short)
    .join(' & ');

  if (dry.length) {
    reserveForecast.textContent = `${labels(dry)} DRY BY MORNING — ${consumers(dry)} ${dry.length > 1 ? 'STALL' : 'STALLS'}`;
    reserveForecast.dataset.level = 'critical';
    return;
  }

  if (low.length) {
    reserveForecast.textContent = `${labels(low)} LOW — PRODUCE MORE BEFORE SLEEP`;
    reserveForecast.dataset.level = 'warn';
    return;
  }

  reserveForecast.textContent = `NEXT NIGHT · LEAK −${drain} EACH — ALL BAYS FED`;
  reserveForecast.dataset.level = 'ok';
}

function canAfford(key, amount = 1) {
  return (state.resources[key] ?? 0) >= amount;
}

function spendResource(key, amount = 1) {
  if (!canAfford(key, amount)) return false;
  state.resources[key] = Math.max(0, (state.resources[key] ?? 0) - amount);
  setResourcesUI();
  saveProgress();
  return true;
}

function gainResource(key, amount = 1) {
  state.resources[key] = clamp((state.resources[key] ?? 0) + amount, 0, 999);
  setResourcesUI();
  saveProgress();
}

function lockedResource(key) {
  const meta = RESOURCE_META[key] || { label: key, source: 'the ship' };
  log(`NO ${meta.label} LEFT — ${meta.source} HAS TO PRODUCE MORE.`, 'bad');
  audio.deny();
  world.flicker(1.8);
  state.shake = Math.max(state.shake, 0.24);
}

// ─────────────────────────────────────────────────────────────
// escape pod
//
// The south bay holds the only way off Erebus-9. Assembling the pod costs
// 40 reserves (14 power, 13 biomass, 13 data), and the clamps will not
// release before six shifts, while maintenance is unfinished, or while a
// crack is open.
// ─────────────────────────────────────────────────────────────

function podSealBlocker() {
  const shifts = Math.max(0, state.day - 1);
  if (shifts < POD_MIN_SHIFTS) {
    log(
      `ESCAPE POD UNBUILT — CLAMPS NEED ${POD_MIN_SHIFTS} SHIFTS OF PRESSURE (${shifts}/${POD_MIN_SHIFTS}).`,
      'bad',
    );
    audio.deny();
    world.flicker(1.4);
    return true;
  }

  if (state.life < POD_MIN_SECURITY) {
    log(
      `ESCAPE POD SEALED — HUB SECURITY ${Math.round(state.life)}% (MINIMUM ${POD_MIN_SECURITY}%). RESTORE SHIP CONTROL FIRST.`,
      'bad',
    );
    audio.deny();
    world.flicker(1.4);
    return true;
  }

  if (state.cracks.length) {
    const open = crackDamage();
    log(`ESCAPE POD REFUSED — HULL CRACK OPEN (${open}%). WELD IT SHUT FIRST.`, 'bad');
    audio.deny();
    world.flicker(1.6);
    state.shake = Math.max(state.shake, 0.22);
    return true;
  }

  if (state.completedCount < 3) {
    log(
      `ESCAPE POD REFUSED — MAINTENANCE INCOMPLETE (${state.completedCount}/3). THE CLAMPS WILL NOT RELEASE ON A FAILING SHIP.`,
      'bad',
    );
    audio.deny();
    world.flicker(1.4);
    return true;
  }

  return false;
}

function podShortfall() {
  return Object.entries(ESCAPE_COST)
    .filter(([key, amount]) => Math.floor(state.resources[key] ?? 0) < amount)
    .map(([key, amount]) => `${RESOURCE_META[key].short} ${Math.floor(state.resources[key] ?? 0)}/${amount}`);
}

function refreshEscapePod() {
  escapePod.setBuilt(state.podBuilt);
  escapeHandle.label = state.life < POD_MIN_SECURITY
    ? `Escape pod sealed — hub security ${Math.round(state.life)}% (min ${POD_MIN_SECURITY}%)`
    : state.podBuilt
      ? 'Launch escape pod — leave EREBUS-9'
      : state.day - 1 < POD_MIN_SHIFTS
        ? `Build escape pod — clamps release after shift ${POD_MIN_SHIFTS}`
        : `Build escape pod — ${ESCAPE_TOTAL} reserves`;

  const entry = waypointEls.get('escape');
  if (entry) entry.nameEl.textContent = state.podBuilt ? 'ESCAPE POD' : 'ESCAPE BAY';
}

function buildEscapePod() {
  if (state.podBuilt) return;
  if (podSealBlocker()) return;

  const missing = podShortfall();
  if (missing.length) {
    log(
      `ESCAPE POD UNBUILT — NEEDS ${ESCAPE_TOTAL} RESERVES (${ESCAPE_COST.power} PWR · ${ESCAPE_COST.biomass} BIO · ${ESCAPE_COST.data} DATA). MISSING: ${missing.join(' · ')}.`,
      'bad',
    );
    audio.deny();
    return;
  }

  Object.entries(ESCAPE_COST).forEach(([key, amount]) => {
    state.resources[key] = Math.max(0, (state.resources[key] ?? 0) - amount);
  });
  setResourcesUI();

  state.podBuilt = true;
  refreshEscapePod();
  saveProgress();
  audio.success();
  world.flicker(2.2);
  log(`ESCAPE POD ASSEMBLED — ${ESCAPE_TOTAL} RESERVES SPENT. PRESS E AGAIN TO LAUNCH.`, 'good');
}

async function launchEscapePod() {
  if (!state.podBuilt || state.phase === 'over') return;
  if (podSealBlocker()) return;

  state.phase = 'over';
  state.runId += 1;
  state.huntActive = false;
  state.uiBlocking = 'gameover';
  state.escape = null;
  clearSave();
  setHovered(null);
  world.setHunterActive(false);
  world.hideLurker();
  world.hideGhost();
  audio.success();

  scareFlash.classList.remove('flash', 'final');
  void scareFlash.offsetWidth;
  scareFlash.classList.add('flash');

  await wait(900);

  goEyebrow.textContent = 'ESCAPE POD · CYCLE COMPLETE';
  goTitle.innerHTML = 'YOU LEFT<br />EREBUS-9';
  goLine.textContent = pick(ESCAPE_LINES);
  goStats.textContent = `SHIFTS SURVIVED: ${Math.max(0, state.day - 1)}`;
  gameOverScreen.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  audio.powerDown();
}

function useEscapePod() {
  if (state.podBuilt) {
    launchEscapePod();
    return;
  }
  buildEscapePod();
}

// ─────────────────────────────────────────────────────────────
// hull cracks
//
// From day 5 the hull opens a crack on a wall or the floor. It is always
// marked with a waypoint, costs its severity in ship control every night,
// and widens by a point a night until it is welded. Welding costs one
// reserve of any kind and takes a point off it; a 1% crack closes for good.
// ─────────────────────────────────────────────────────────────

let crackHandles = new Map();

function crackDamage() {
  return state.cracks.reduce((sum, crack) => sum + crack.severity, 0);
}

function crackLabel(crack) {
  return `WELD HULL CRACK ${crack.severity}% — 1 RESERVE`;
}

// Any reserve works, so the driest bay never traps the repair.
function crackReserveKey() {
  let key = 'power';
  ['power', 'biomass', 'data'].forEach((candidate) => {
    if ((state.resources[candidate] ?? 0) > (state.resources[key] ?? 0)) key = candidate;
  });
  return key;
}

function resetCracks() {
  state.cracks = [];
  state.patches = [];
  crackHandles.forEach((handle) => removeInteractable(handle));
  crackHandles.clear();
  world.setCracks([]);
  world.setPatches([]);
}

function patchCrack(slot) {
  const crack = state.cracks.find((entry) => entry.slot === slot);
  if (!crack) return;

  const key = crackReserveKey();
  if (!canAfford(key, 1)) {
    lockedResource(key);
    return;
  }

  spendResource(key, 1);
  crack.severity -= 1;
  world.flicker(1.4);
  audio.beep(560, 0.09, 'square', 0.04);

  if (crack.severity <= 0) {
    state.cracks = state.cracks.filter((entry) => entry.slot !== slot);
    if (!state.patches.includes(slot)) state.patches.push(slot);
    audio.success();
    log('HULL CRACK WELDED SHUT.', 'good');
  } else {
    log(`HULL CRACK PATCHED — ${crack.severity}% STILL OPEN.`, 'warn');
  }

  syncCracks();
  saveProgress();
}

function spawnCrack() {
  const used = new Set(state.cracks.map((crack) => crack.slot));
  const free = world.crackSlots
    .map((slot) => slot.index)
    .filter((index) => !used.has(index));
  if (!free.length) return null;

  const slot = free[Math.floor(Math.random() * free.length)];
  state.patches = state.patches.filter((index) => index !== slot);

  const crack = { slot, severity: 1 };
  state.cracks.push(crack);
  return crack;
}

function syncCrackTargets() {
  const active = new Set(state.cracks.map((crack) => crack.slot));

  crackHandles.forEach((handle, slot) => {
    if (active.has(slot)) return;
    removeInteractable(handle);
    crackHandles.delete(slot);
  });

  state.cracks.forEach((crack) => {
    const slot = world.crackSlots[crack.slot];
    if (!slot) return;

    let handle = crackHandles.get(crack.slot);
    if (!handle) {
      // An invisible box over the crack so the crosshair can find it.
      const proxy = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 1.2, 0.18),
        new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
      );
      proxy.position.set(slot.x, slot.y, slot.z);
      if (slot.floor) proxy.rotation.x = -Math.PI / 2;
      else proxy.rotation.y = slot.ry || 0;

      handle = registerInteractable(proxy, {
        room: roomAt(slot.x, slot.z),
        label: crackLabel(crack),
        onInteract: () => patchCrack(crack.slot),
      });
      crackHandles.set(crack.slot, handle);
    } else {
      handle.label = crackLabel(crack);
    }
  });
}

function syncCracks() {
  world.setCracks(state.cracks);
  world.setPatches(state.patches);
  syncCrackTargets();
  buildWaypoints();
  updateDecayHint();
  if (typeof refreshTasks === 'function') refreshTasks();
}

// Every open crack widens by a point a night. One already at its widest
// tears a second crack open somewhere else on the hull.
function growCracks() {
  let maxed = false;

  state.cracks.forEach((crack) => {
    if (crack.severity >= CRACK_MAX) maxed = true;
    else crack.severity += 1;
  });

  if (maxed) spawnCrack();
}

function setHovered(next) {
  if (next === hovered) return;
  hovered = next;

  if (next) {
    interactText.textContent = next.label;
    interactPrompt.classList.remove('hidden');
    crosshair.classList.add('hot');
  } else {
    interactPrompt.classList.add('hidden');
    crosshair.classList.remove('hot');
  }
}

function refreshTasks() {
  let done = 0;
  taskList.replaceChildren();

  ['reactor', 'med', 'nav'].forEach((roomId) => {
    const task = state.tasks[roomId];
    const meta = ROOM_META[roomId];
    const li = document.createElement('li');
    li.className = `task${task && task.complete ? ' done' : ''}${state.focusTask === roomId ? ' focused' : ''}`;

    const head = document.createElement('div');
    head.className = 'task-head';
    const roomName = document.createElement('span');
    roomName.textContent = meta.short;
    const progress = document.createElement('span');
    progress.className = 'task-progress';
    progress.textContent = task ? (task.complete ? 'OK' : `${task.progress}/${task.total}`) : '—';
    head.append(roomName, progress);

    const title = document.createElement('div');
    title.className = 'task-title';
    title.textContent = task ? task.title : '—';

    const why = document.createElement('div');
    why.className = 'task-why';
    why.textContent = task ? task.def.why || '' : '';

    const hint = document.createElement('div');
    hint.className = 'task-hint';
    if (task && !task.complete && RESOURCE_FLOW[roomId]) {
      // The task hint already carries the sequence order or the cycle count,
      // so only the reserve cost is added here.
      const flow = RESOURCE_FLOW[roomId];
      hint.textContent = `${task.hint} · −1 ${RESOURCE_META[flow.cost].short} / +1 ${RESOURCE_META[flow.yields].short} PER PRESS`;
    } else {
      hint.textContent = '';
    }

    const toolKey = ROOM_TOOL[roomId];
    const toolMeta = TOOL_META[toolKey];
    const toolLine = document.createElement('div');
    toolLine.className = 'task-tool';

    if (task && !task.complete) {
      const held = state.backpack[toolKey] || 0;
      toolLine.textContent = held
        ? `TOOL READY · ${toolMeta.label} ×${held}`
        : `GET TOOL · ${toolMeta.label} · ${toolMeta.storeName} (${ROOM_META[toolMeta.store].short})`;
      toolLine.dataset.level = held ? 'ok' : 'need';
    }

    const flow = RESOURCE_FLOW[roomId];
    if (flow) {
      const meta = RESOURCE_META[flow.cost];
      const source = document.createElement('div');
      source.className = 'task-source';
      source.textContent = `⌖ ${meta.short} FROM ${ROOM_META[meta.room].short} — PRESS E THERE`;

      li.append(head, title, why, hint, toolLine, source);
      li.classList.add('clickable');
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.title = `Show one waypoint for this task — click or press ${TASK_ROW_KEYS[roomId]}`;
      li.addEventListener('click', () => focusReserve(roomId));
      li.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        focusReserve(roomId);
      });
    } else {
      li.append(head, title, why, hint, toolLine);
    }
    taskList.append(li);

    if (task && task.complete) done += 1;
  });

  state.completedCount = done;
  taskCount.textContent = `${done}/3 TASKS`;
  updateReserveForecast();

  if (markEscapeBtn) {
    markEscapeBtn.dataset.active = String(state.focusTask === 'escape');
  }
  if (markCracksBtn) {
    markCracksBtn.dataset.active = String(state.focusTask === 'cracks');
    markCracksBtn.disabled = state.cracks.length === 0;
  }
  if (markCracksCount) {
    markCracksCount.textContent = String(state.cracks.length);
  }
}

function updateRoom() {
  const roomId = roomAt(player.pos.x, player.pos.z);
  if (roomId === lastRoom) return;
  const previous = lastRoom;
  lastRoom = roomId;

  // Leaving the cabin that was picked for the scare: it is in the doorway
  // behind you, turned to watch you go.
  const scare = state.doorScare;
  if (scare && !scare.done && previous === scare.room && roomId === 'corridorN') {
    const door = CABIN_DOORS[scare.room];
    if (door) {
      scare.done = true;
      world.doorPeek(door.x, door.z, player.pos);
      world.flicker(2.6);
      audio.whisper();
      state.shake = Math.max(state.shake, 0.45);
      log('SOMETHING IS STANDING IN THE DOORWAY. IT IS LOOKING AT YOU.', 'bad');
      window.setTimeout(() => world.hidePeek(), 4600);
    }
  }

  roomBannerText.textContent = LAYOUT[roomId].label;
  roomBanner.classList.remove('hidden');
  window.clearTimeout(roomBannerTimer);
  roomBannerTimer = window.setTimeout(() => roomBanner.classList.add('hidden'), 2400);
}

// ─────────────────────────────────────────────────────────────
// tasks / day cycle
// ─────────────────────────────────────────────────────────────

function allowedTaskTypes(day) {
  if (day <= 1) return ['count'];
  if (day <= 2) return ['count', 'sequence'];
  return ['count', 'sequence', 'cycle'];
}

// Nightly ship-control loss no longer includes a flat slice for a stable
// hull: from day 5 the loss is the sum of the open cracks (crackDamage()),
// and unfinished maintenance adds five on top of that.
function decayFor(day, allDone) {
  const grace = day <= 2;
  const tier = grace ? 0 : Math.min(5, Math.floor((day - 3) / 2));

  return {
    grace,
    tier,
    completeDrain: 0,
    unfinishedDrain: grace ? 0 : 10,
    drain: grace || allDone ? 0 : 10,
  };
}

function updateDecayHint() {
  if (!decayHint) return;

  const { grace, tier } = decayFor(state.day, false);
  const open = crackDamage();

  if (grace) {
    decayHint.textContent = 'HULL STABLE · NO NIGHTLY LOSS';
    decayHint.className = 'decay-hint grace';
  } else if (open > 0) {
    decayHint.textContent = `OPEN CRACKS −${open}% NIGHTLY · +10% IF UNFINISHED`;
    decayHint.className = `decay-hint ${open >= CRACK_MAX || tier > 0 ? 'crit' : 'warn'}`;
  } else {
    decayHint.textContent = 'NO OPEN CRACKS · −10% ONLY IF UNFINISHED';
    decayHint.className = `decay-hint ${tier > 0 ? 'crit' : 'warn'}`;
  }
}

function pickTaskDef(roomId) {
  const pool = TASK_POOL[roomId];
  const allowed = allowedTaskTypes(state.day);
  const easyPool = pool.filter((def) => allowed.includes(def.type));
  const last = state.lastPicks[roomId];
  const options = easyPool.filter((def) => def.id !== last);
  const available = options.length ? options : easyPool.length ? easyPool : pool;
  const def = available[Math.floor(Math.random() * available.length)];
  state.lastPicks[roomId] = def.id;
  return def;
}

function startTask(roomId, def) {
  const owned = [];

  const api = {
    addInteractable(group, options) {
      const handle = registerInteractable(group, { ...options, room: roomId });
      owned.push(handle);
      return handle;
    },
    audio,
    log,
    scare() {
      world.flicker(1.5);
      if (Math.random() < 0.4) audio.whisper();
    },
    canAfford: (key, amount) => canAfford(key, amount),
    spend: (key, amount) => spendResource(key, amount),
    hasTool: (tool) => hasTool(tool),
    useTool: (tool) => spendTool(tool),
    needTool: (tool) => needTool(tool),
    gain: (key, amount) => gainResource(key, amount),
    locked: (key) => lockedResource(key),
    onProgress(task) {
      refreshTasks();
      saveProgress();

      // Working a compartment in the dark does not go unnoticed.
      if (task && !task.complete && Math.random() < 0.22) {
        audio.whisper();
        world.flicker(1.4);
      }
    },
    onComplete(task) {
      onTaskComplete(task);
    },
  };

  const task = buildTask(def, roomId, api);
  task.dispose = () => {
    owned.splice(0).forEach(removeInteractable);
  };
  return task;
}

// Clicking a row (or pressing its number) is the waypoint control: it marks
// that task only — the next unit to work on and the locker that stocks its
// tool — and marks nothing else on the ship.
function focusReserve(roomId) {
  if (state.phase !== 'day' || state.uiBlocking) return;

  if (state.focusTask === roomId) {
    state.focusTask = null;
    audio.beep(420, 0.07, 'sine', 0.04);
    log('WAYPOINTS CLEARED.', 'ghostly');
    refreshTasks();
    return;
  }

  const task = state.tasks[roomId];
  if (!task || task.complete) return;

  state.focusTask = roomId;
  state.markPhase = 'unit';
  audio.beep(660, 0.08, 'sine', 0.045);

  log(`WAYPOINT SET — ${ROOM_META[roomId].name.toUpperCase()}.`, 'warn');
  refreshTasks();
}

// The escape bay and the hull cracks have no row of their own, so they get
// a button each. Same rule as the jobs: one mark at a time, and pressing it
// again clears it.
function focusMark(kind) {
  if (state.phase !== 'day' || state.uiBlocking) return;

  if (state.focusTask === kind) {
    state.focusTask = null;
    audio.beep(420, 0.07, 'sine', 0.04);
    log('WAYPOINTS CLEARED.', 'ghostly');
    refreshTasks();
    return;
  }

  if (kind === 'cracks' && !state.cracks.length) {
    log('No open hull cracks to mark.', 'ghostly');
    return;
  }

  state.focusTask = kind;
  state.markPhase = 'unit';
  audio.beep(660, 0.08, 'sine', 0.045);

  if (kind === 'escape') {
    log(state.podBuilt ? 'WAYPOINT SET \u2014 ESCAPE POD.' : 'WAYPOINT SET \u2014 ESCAPE BAY.', 'warn');
  } else {
    const open = state.cracks.length;
    log(`WAYPOINTS SET \u2014 ${open} OPEN HULL CRACK${open === 1 ? '' : 'S'}.`, 'warn');
  }
  refreshTasks();
}

if (markEscapeBtn) markEscapeBtn.addEventListener('click', () => focusMark('escape'));
if (markCracksBtn) markCracksBtn.addEventListener('click', () => focusMark('cracks'));

// The one pointer follows the work. Pressing a job's unit hands the mark to
// whatever the next press is short of; pressing anything in that bay hands it
// back to the unit, so the ship never needs more than one marker at a time.
function noteInteract(roomId) {
  const focus = state.focusTask;
  if (!focus || focus === 'escape' || focus === 'cracks') return;

  const flow = RESOURCE_FLOW[focus];
  const sourceRoom = flow ? RESOURCE_META[flow.cost].room : null;
  const toolKey = ROOM_TOOL[focus];
  const storeRoom = toolKey ? TOOL_META[toolKey].store : null;

  if (state.markPhase === 'source') {
    // Either stop ends the detour: the bay that makes the reserve, or the
    // locker the tool comes from.
    if (roomId === sourceRoom || roomId === storeRoom) {
      state.markPhase = 'unit';
      log(`WAYPOINT BACK ON ${ROOM_META[focus].short} — PRESS E THERE.`, 'ghostly');
    }
    return;
  }

  if (roomId !== focus) return;

  state.markPhase = 'source';

  if (toolKey && !hasTool(toolKey)) {
    const meta = TOOL_META[toolKey];
    log(`WAYPOINT — ${meta.storeName} (${ROOM_META[meta.store].short}) · ${meta.label}.`, 'ghostly');
  } else if (flow) {
    log(`WAYPOINT — ${ROOM_META[sourceRoom].short} · ${RESOURCE_META[flow.cost].short}.`, 'ghostly');
  }
}

function onTaskComplete(task) {
  log(task.def.completeLine, 'good');
  world.flicker(1.6);
  audio.whisper();

  if (Math.random() < 0.45) {
    window.setTimeout(() => log(pick(TASK_EERIE_LINES), 'ghostly'), 900);
  }

  if (state.phase === 'day' && controlPhase() >= 2 && Math.random() < 0.35) {
    world.showWatcher(player.pos);
    audio.whisper();
  }

  refreshTasks();

  if (state.completedCount === 3) {
    log('All compartments stable. The escape pod bay is south of the hub.', 'warn');
    audio.beep(1040, 0.4, 'sine', 0.028);
  }
}

function startDay(savedTasks = null, options = {}) {
  const { keepTime = false, keepHarvest = false } = options;

  reservePointer = null;
  state.focusTask = null;
  state.markPhase = 'unit';
  state.ventEvent = null;
  state.ventPeek = null;
  state.corridorPeek = null;
  state.nextVentPeek = 20 + Math.random() * 14;
  state.nextCorridorPeek = 30 + Math.random() * 18;
  if (world.hidePeek) world.hidePeek();
  state.ventCooldown = 0;
  state.ventHuntPending = 0;
  state.ventAmbient = 18;
  state.corridorRoom = null;
  state.corridorTimer = 0;
  ventFx.classList.remove('on');
  Object.values(state.tasks).forEach((task) => task && task.dispose && task.dispose());
  state.tasks = {};
  state.phase = 'day';
  state.uiBlocking = null;

  if (!keepTime) {
    state.timeLeft = SHIFT_SECONDS;
    state.timerWarned = false;
    state.forcedSleep = false;
  } else if (state.timeLeft <= 30) {
    state.timerWarned = true;
  }

  if (keepTime) refreshToolsUI();

  if (!keepHarvest) state.harvestedToday = false;
  if (!keepTime) state.nextScurry = 7 + Math.random() * 9;
  state.lowEnergyWarned = false;
  state.lowHungerWarned = false;

  ['reactor', 'med', 'nav'].forEach((roomId) => {
    const saved = savedTasks && savedTasks[roomId];
    const savedDef = saved && typeof saved.defId === 'string'
      ? TASK_POOL[roomId].find((entry) => entry.id === saved.defId)
      : null;
    const def = savedDef || pickTaskDef(roomId);
    const task = startTask(roomId, def);
    state.tasks[roomId] = task;
    if (savedDef && saved) task.restore(saved);
  });

  // A shift opens with one mark on it: the first job that still needs work,
  // so the first look down a corridor already has somewhere to point.
  const firstOpen = ['reactor', 'med', 'nav'].find(
    (roomId) => state.tasks[roomId] && !state.tasks[roomId].complete,
  );
  state.focusTask = firstOpen || null;
  state.markPhase = 'unit';

  // Restock once the day's tasks exist: the shelves have to cover the
  // presses they will actually be asked for.
  if (!keepTime) {
    const stock = restockLockers();
    if (stock.min < TOOL_RESTOCK_BASE) {
      log(
        `SUPPLY STORES RESTOCKED — WRE ${state.lockers.nav} · FIL ${state.lockers.reactor} · PRO ${state.lockers.med}.`,
        stock.min <= 1 ? 'bad' : 'warn',
      );
    }
  }

  // No morning refill: the tanks only hold what the bays produced and the
  // night's leak left behind, so a shift has to earn its own repairs.
  setResourcesUI();

  dayLabel.textContent = `DAY ${String(state.day).padStart(2, '0')}`;
  refreshTasks();
  if (state.day >= CRACK_START_DAY && state.cracks.length === 0) {
    const crack = spawnCrack();
    if (crack) {
      const slot = world.crackSlots[crack.slot];
      const room = slot ? roomAt(slot.x, slot.z) : 'hub';
      const label = (ROOM_META[room] && ROOM_META[room].short) || 'THE HULL';
      log(`HULL FRACTURE OPEN — ${label} · 1% · WAYPOINT SET.`, 'bad');
    }
  }
  syncCracks();
  if (state.cracks.length) {
    log(`OPEN HULL CRACKS — ${crackDamage()}% TOTAL · WELD ONE WITH 1 RESERVE.`, 'warn');
  }
  updateDecayHint();
  setVitalsUI();
  updateTimerUI();
  refreshHydroLabel();
  applyMonsterPhase();
  setHovered(null);
  log(`DAY ${state.day} — three compartments need attention.`, 'warn');
  if (firstOpen) {
    log(`WAYPOINT SET — ${ROOM_META[firstOpen].name.toUpperCase()}.`, 'warn');
  }

  if (state.day === 3) {
    log('HULL DECAY BEGINS — ship control will fall every night now.', 'bad');
  } else if (state.day === 4) {
    log('HAIRLINE FRACTURES SPREAD ACROSS THE HULL.', 'bad');
  } else if (state.day > 4) {
    log('THE HULL CRACKS ARE WIDENING.', 'bad');
  }

  if (state.day > 3 && (state.day - 3) % 3 === 0) {
    log('THE HULL IS FAILING FASTER — nightly decay increases.', 'bad');
  }

  saveProgress();
}

function respawnPlayer() {
  player.pos.set(0, 0, 3.4);
  player.yaw = 0;
  player.pitch = 0;
  player.yawTarget = 0;
  player.pitchTarget = 0;
  player.vel.set(0, 0);
  player.roll = 0;
  player.bob = 0;
  player.fov = 72;
  keys.clear();
  camera.fov = 72;
  camera.updateProjectionMatrix();
  camera.position.set(0, player.height, player.pos.z);
  camera.rotation.set(0, 0, 0);
  lastRoom = null;
  updateRoom();
}

// ─────────────────────────────────────────────────────────────
// persistence
// ─────────────────────────────────────────────────────────────

function saveProgress() {
  if (!state.started || state.phase !== 'day') return;

  const reactor = state.tasks.reactor;
  const med = state.tasks.med;
  const nav = state.tasks.nav;
  if (!reactor || !med || !nav) return;

  writeSave({
    savedAt: Date.now(),
    day: state.day,
    life: state.life,
    energy: state.energy,
    hunger: state.hunger,
    timeLeft: state.timeLeft,
    resources: { ...state.resources },
    backpack: { ...state.backpack },
    lockers: { ...state.lockers },
    harvestedToday: state.harvestedToday,
    cracks: state.cracks.map((crack) => ({ ...crack })),
    patches: [...state.patches],
    podBuilt: !!state.podBuilt,
    lastPicks: { ...state.lastPicks },
    tasks: {
      reactor: reactor.snapshot(),
      med: med.snapshot(),
      nav: nav.snapshot(),
    },
  });
}

function configureStartScreen() {
  pendingSave = readSave();

  if (pendingSave) {
    startBtn.classList.add('hidden');
    resumePanel.classList.remove('hidden');
    resumeMeta.textContent = `DAY ${String(pendingSave.day).padStart(2, '0')} · SHIP CONTROL ${Math.round(pendingSave.life)}%`;
  } else {
    startBtn.classList.remove('hidden');
    resumePanel.classList.add('hidden');
  }
}

function resumeGame() {
  if (state.started || !pendingSave) return;

  const save = pendingSave;
  pendingSave = null;

  state.started = true;
  state.runId += 1;
  state.day = Math.max(1, Math.floor(save.day));
  state.life = clamp(save.life, 1, 100);
  state.energy = clamp(save.energy ?? 100, 0, 100);
  state.hunger = clamp(save.hunger ?? 100, 0, 100);
  state.timeLeft = clamp(save.timeLeft ?? SHIFT_SECONDS, 0, SHIFT_SECONDS);
  state.harvestedToday = save.harvestedToday === true;
  state.resources = { ...START_RESOURCES };
  if (save.resources && typeof save.resources === 'object') {
    Object.keys(START_RESOURCES).forEach((key) => {
      const value = Number(save.resources[key]);
      if (Number.isFinite(value)) state.resources[key] = clamp(Math.round(value), 0, 999);
    });
  }

  state.backpack = { wrench: 0, filter: 0, probe: 0 };
  if (save.backpack && typeof save.backpack === 'object') {
    Object.keys(TOOL_META).forEach((key) => {
      const value = Number(save.backpack[key]);
      if (Number.isFinite(value)) state.backpack[key] = clamp(Math.round(value), 0, BACKPACK_SIZE);
    });
  }

  Object.keys(LOCKER_TOOL).forEach((room) => {
    const value = Number(save.lockers && save.lockers[room]);
    state.lockers[room] = Number.isFinite(value)
      ? clamp(Math.round(value), 0, TOOL_RESTOCK_BASE)
      : storeStockForDay(state.day);
  });
  refreshToolsUI();
  setResourcesUI();
  state.lowEnergyWarned = false;
  state.lowHungerWarned = false;    state.monsterPhase = 0;
    state.huntActive = false;
    state.huntPath = [];
    state.firstSighting = false;
    state.firstSightingTimer = 0;
    state.nextDoor = 24;
  state.standRoom = null;
  state.standCooldown = 0;
  state.escape = null;
  struggleEl.classList.add('hidden');
  world.hideLurker();

  resetCracks();
  state.podBuilt = !!save.podBuilt;
  refreshEscapePod();
  if (Array.isArray(save.cracks)) {
    save.cracks.forEach((entry) => {
      const slot = Number(entry && entry.slot);
      const severity = Number(entry && entry.severity);
      if (!Number.isInteger(slot) || slot < 0 || slot >= world.crackSlots.length) return;
      if (!Number.isFinite(severity) || severity <= 0) return;
      if (state.cracks.some((crack) => crack.slot === slot)) return;
      state.cracks.push({ slot, severity: clamp(Math.round(severity), 1, CRACK_MAX) });
    });
  }
  if (Array.isArray(save.patches)) {
    save.patches.forEach((value) => {
      const slot = Number(value);
      if (!Number.isInteger(slot) || slot < 0 || slot >= world.crackSlots.length) return;
      if (!state.patches.includes(slot)) state.patches.push(slot);
    });
  }

  state.lastPicks = save.lastPicks && typeof save.lastPicks === 'object' ? { ...save.lastPicks } : {};
  state.tasks = {};
  state.completedCount = 0;

  audio.start();
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');
  setLife(state.life);
  respawnPlayer();
  startDay(save.tasks, { keepTime: true, keepHarvest: true });
  log(`SHIFT RESUMED — DAY ${String(state.day).padStart(2, '0')}.`, 'ghostly');
  requestLock();
}

function disarmReset() {
  resetArmed = false;
  window.clearTimeout(resetTimer);
  resetBtn.textContent = 'Reset shift';
  resetBtn.classList.remove('danger');
}

// ─────────────────────────────────────────────────────────────
// end shift / night
// ─────────────────────────────────────────────────────────────

function openEndModal() {
  if (state.phase !== 'day' || state.uiBlocking) return;

  state.uiBlocking = 'modal';
  const done = state.completedCount;
  const allDone = done === 3;

  const decay = decayFor(state.day, allDone);
  const open = crackDamage();
  const tonight = decay.grace ? 0 : open + (allDone ? 0 : 10);

  modalSummary.textContent = `Maintenance ${done}/3 complete — ship control −${tonight}% tonight.`;
  modalWarn.textContent = decay.grace
    ? 'HULL STABLE — the first two nights are grace; no ship control is lost, even with tasks unfinished.'
    : allDone
      ? open > 0
        ? `ALL TASKS COMPLETE — the only loss is ${open}% from the open hull cracks.`
        : 'ALL TASKS COMPLETE — no open cracks; ship control holds tonight.'
      : open > 0
        ? `TASKS UNFINISHED — 10% for skipped maintenance plus ${open}% of cracks, so −${tonight}% tonight.`
        : 'TASKS UNFINISHED — 10% ship control tonight. Finish all three tasks to stop it.';
  modalWarn.classList.toggle('safe', decay.grace || (allDone && open <= 0));
  modal.classList.remove('hidden');
  setHovered(null);
  audio.beep(360, 0.1, 'sine', 0.05);
}

function cancelModal() {
  if (state.uiBlocking !== 'modal') return;
  modal.classList.add('hidden');
  state.uiBlocking = null;
  audio.beep(220, 0.09, 'sine', 0.04);
  if (state.hadLock && !document.pointerLockElement) showPause();
}

function confirmSleep() {
  if (state.uiBlocking !== 'modal') return;
  modal.classList.add('hidden');
  state.uiBlocking = null;
  runNight();
}

async function runNight() {
  if (state.phase !== 'day') return;

  state.phase = 'night';
  state.uiBlocking = 'night';
  const runId = state.runId;

  const allDone = Object.values(state.tasks).every((task) => task && task.complete);
  const decay = decayFor(state.day, allDone);
  const crackLoss = crackDamage();
  const drain = decay.grace ? 0 : crackLoss + (allDone ? 0 : 10);
  const reserveDrain = reserveLeakFor(state.day);
  const before = state.life;
  const after = Math.max(0, before - drain);

  setHovered(null);
  stopHunt();

  nightDay.textContent = `NIGHT ${String(state.day).padStart(2, '0')}`;
  renderNightLife(before);
  nightLine1.classList.remove('show');
  nightLine2.classList.remove('show');
  nightLine1.textContent = state.forcedSleep
    ? 'The shift clock hits zero. The pod seals itself around you.'
    : pick(decay.grace ? NIGHT_GRACE_LINES : allDone ? NIGHT_DONE_LINES : NIGHT_FAIL_LINES);
  state.forcedSleep = false;
  nightLine2.textContent = decay.grace
    ? 'Ship control is holding. Nothing is draining tonight.'
    : decay.tier > 0
      ? 'The hull is losing control. Repairs only slow it.'
      : pick(NIGHT_AMBIENT_LINES);
  const drainLine = decay.grace
    ? 'HULL STABLE — SHIP CONTROL HOLDS'
    : drain <= 0
      ? 'NO OPEN CRACKS — SHIP CONTROL HOLDS'
      : allDone
        ? `HULL CRACKS — SHIP CONTROL −${drain}%`
        : `INCOMPLETE MAINTENANCE −10% + CRACKS −${crackLoss}% · TOTAL −${drain}%`;
  nightDrain.textContent = reserveDrain > 0 ? `${drainLine} · RESERVES −${reserveDrain}` : drainLine;
  nightDrain.className = `night-drain ${decay.grace || drain <= 0 ? 'good' : 'bad'}`;
  nightDrain.classList.remove('show');

  nightScreen.classList.remove('hidden');
  audio.setNight(true);
  audio.nightSting();
  world.hideGhost();
  world.setHunterActive(false);

  await wait(1400);
  if (runId !== state.runId) return;
  nightLine1.classList.add('show');
  audio.whisper();

  await wait(2100);
  if (runId !== state.runId) return;
  nightLine2.classList.add('show');
  world.flicker(1.2);

  await wait(1500);
  if (runId !== state.runId) return;
  nightDrain.classList.add('show');
  renderNightLife(after);
  audio.powerDown();
  setLife(after);
  growCracks();

  if (reserveDrain > 0) {
    Object.keys(START_RESOURCES).forEach((key) => {
      state.resources[key] = Math.max(0, (state.resources[key] ?? 0) - reserveDrain);
    });
    setResourcesUI();
  }

  if (after > 0) applyMonsterPhase();

  await wait(2700);
  if (runId !== state.runId) return;

  nightScreen.classList.add('hidden');
  audio.setNight(false);

  if (after <= 0) {
    gameOver('control');
    return;
  }

  state.energy = clamp(state.energy + 45, 0, 100);
  state.hunger = clamp(state.hunger - 12, 0, 100);
  state.day += 1;
  respawnPlayer();
  startDay();
  log(
    decay.grace ? 'You wake. Ship control held through the night.' : pick(allDone ? WAKE_DONE_LINES : WAKE_FAIL_LINES),
    decay.grace ? 'good' : allDone ? 'good' : 'bad',
  );
}

// ─────────────────────────────────────────────────────────────
// pause / game over / start
// ─────────────────────────────────────────────────────────────

const pauseScreenEl = pauseScreen;

function showPause() {
  if (!state.started || state.phase === 'over') return;
  pauseScreenEl.classList.remove('hidden');
}

function hidePause() {
  pauseScreenEl.classList.add('hidden');
}

// The closing scare: the thing rushes the lens, the screen tears,
// then the failure card fades in once the player has caught their breath.
function playEndJumpscare() {
  state.shake = Math.max(state.shake, 0.92);
  world.finalScare(camera);

  scareFlash.classList.remove('flash', 'final');
  void scareFlash.offsetWidth;
  scareFlash.classList.add('final');

  app.classList.remove('end-shake', 'ending');
  void app.offsetWidth;
  app.classList.add('end-shake', 'ending');

  audio.screech();
  audio.nightSting();
  audio.whisper();

  return new Promise((resolve) => {
    window.setTimeout(() => {
      app.classList.remove('end-shake', 'ending');
      scareFlash.classList.remove('final');
      resolve();
    }, 2400);
  });
}

async function gameOver(reason = 'control') {
  if (state.phase === 'over') return;

  state.runId += 1;
  state.phase = 'over';
  state.uiBlocking = 'gameover';
  state.huntActive = false;
  clearSave();
  nightScreen.classList.add('hidden');
  audio.setNight(false);
  world.setHunterActive(false);
  world.hideGhost();
  world.hideLurker();
  state.escape = null;
  state.standRoom = null;
  struggleEl.classList.add('hidden');
  app.classList.remove('ending');
  setHovered(null);

  if (reason === 'eaten') {
    goEyebrow.textContent = 'CREW LOST';
    goTitle.innerHTML = 'IT FOUND<br />YOU';
    goLine.textContent = 'The vent closes behind it. The corridor is quiet again.';
  } else {
    goEyebrow.textContent = 'SHIP CONTROL FAILURE';
    goTitle.innerHTML = 'THE HULL<br />GAVE OUT';
    goLine.textContent = pick(GO_LINES);
  }

  goStats.textContent = `SHIFTS SURVIVED: ${Math.max(0, state.day - 1)}`;

  await playEndJumpscare();

  audio.powerDown();
  gameOverScreen.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}

function restart() {
  state.runId += 1;
  pendingSave = null;
  clearSave();
  gameOverScreen.classList.add('hidden');
  nightScreen.classList.add('hidden');
  audio.resume();
  audio.setNight(false);
  state.started = true;
  state.phase = 'day';
  state.uiBlocking = null;
  state.day = 1;
  state.energy = 100;
  state.hunger = 100;
  state.timeLeft = SHIFT_SECONDS;
  state.resources = { ...START_RESOURCES };
  state.backpack = { wrench: 0, filter: 0, probe: 0 };
  setResourcesUI();
  state.harvestedToday = false;
  state.timerWarned = false;
  state.forcedSleep = false;    state.monsterPhase = 0;
    state.huntActive = false;
    state.huntPath = [];
    state.firstSighting = false;
    state.firstSightingTimer = 0;
    state.nextDoor = 24;
  state.standRoom = null;
  state.standCooldown = 0;
  state.escape = null;
  struggleEl.classList.add('hidden');
  world.hideLurker();
  resetCracks();
  state.podBuilt = false;
  refreshEscapePod();
  state.lastPicks = {};
  setLife(100);
  respawnPlayer();
  startDay();
  log('Shift log: EREBUS-9 adrift. Crew manifest empty.', 'ghostly');
  requestLock();
}

function startGame() {
  if (state.started) return;
  state.started = true;
  state.runId += 1;
  pendingSave = null;
  clearSave();

  audio.start();
  startScreen.classList.add('hidden');
  hud.classList.remove('hidden');

  state.day = 1;
  state.energy = 100;
  state.hunger = 100;
  state.timeLeft = SHIFT_SECONDS;
  state.resources = { ...START_RESOURCES };
  state.backpack = { wrench: 0, filter: 0, probe: 0 };
  setResourcesUI();
  state.harvestedToday = false;
  state.timerWarned = false;
  state.forcedSleep = false;    state.monsterPhase = 0;
    state.huntActive = false;
    state.huntPath = [];
    state.firstSighting = false;
    state.firstSightingTimer = 0;
    state.nextDoor = 24;
  state.standRoom = null;
  state.standCooldown = 0;
  state.escape = null;
  struggleEl.classList.add('hidden');
  world.hideLurker();
  resetCracks();
  state.podBuilt = false;
  refreshEscapePod();
  state.lastPicks = {};
  state.tasks = {};
  state.completedCount = 0;
  // One cabin a run gets the doorway. It is not every room, and it happens
  // once, on the way out.
  state.doorScare = { room: Math.random() < 0.5 ? 'cabinA' : 'cabinB', done: false };
  notesRead.clear();
  setLife(100);
  respawnPlayer();
  startDay();

  log('Shift 1. Three jobs on the board — Reactor, then Hydro, then Nav.', 'warn');
  log('Reactor north. Hydro east. Nav west. The job panel says what to press and why.', 'ghostly');
  log('Sleep in the hub cryo pod to end the shift. Miss a job and ship control falls.', 'bad');
  log('The pod is south: 40 reserves, 10 shifts, no open cracks.', 'warn');
  beginRedAlert(26);

  showTutorial();
  window.setTimeout(() => {
    if (state.started && !state.uiBlocking && !document.pointerLockElement) {
      log('Pointer lock unavailable — hold left click and drag to look.', 'warn');
    }
  }, 1400);
}

function requestLock() {
  if (!canvas.requestPointerLock) return;
  try {
    const result = canvas.requestPointerLock();
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch (_) {
    /* drag-look fallback covers this */
  }
}

// ─────────────────────────────────────────────────────────────
// input
// ─────────────────────────────────────────────────────────────

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked) {
    state.hadLock = true;
    player.yawTarget = player.yaw;
    player.pitchTarget = player.pitch;
    hidePause();
    return;
  }
  if (state.started && state.phase === 'day' && !state.uiBlocking && state.hadLock) {
    showPause();
  }
});

canvas.addEventListener('mousedown', () => {
  audio.resume();
  if (state.started && state.phase === 'day' && !state.uiBlocking) dragging = true;
});


window.addEventListener('mouseup', () => {
  dragging = false;
});

window.addEventListener('mousemove', (event) => {
  if (!state.started || state.phase !== 'day' || state.uiBlocking) return;
  if (!document.pointerLockElement && !dragging) return;

  const lookX = event.movementX;
  const lookY = event.movementY;
  if (!Number.isFinite(lookX) || !Number.isFinite(lookY)) return;

  // Some browsers emit one enormous movement delta when pointer lock engages.
  // Drop it instead of snapping the helmet to the ceiling.
  if (Math.abs(lookX) > 220 || Math.abs(lookY) > 220) return;

  const sensitivity = 0.0021;
  player.yawTarget -= lookX * sensitivity;
  player.pitchTarget = clamp(player.pitchTarget - lookY * sensitivity, -1.35, 1.35);
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;

  // A note on the page owns the keyboard until it is put down.
  if (state.uiBlocking === 'note') {
    if (['KeyE', 'Escape', 'Enter', 'Space'].includes(event.code)) {
      event.preventDefault();
      closeNote();
    }
    return;
  }

  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
    event.preventDefault();
  }

  if (state.escape && event.code === 'Space') {
    mashEscape();
    return;
  }

  if (state.started && state.phase === 'day' && !state.uiBlocking && TASK_KEYS[event.code]) {
    focusReserve(TASK_KEYS[event.code]);
    return;
  }

  if (event.code === 'KeyE') {
    if (state.uiBlocking === 'modal') {
      confirmSleep();
      return;
    }
    if (state.started && state.phase === 'day' && !state.uiBlocking) {
      // Something standing in the corridor takes the interact key: E is how
      // you shift past it.
      if (shoveCorridorPeek()) return;
      if (hovered) {
        const room = hovered.room;
        hovered.onInteract();
        noteInteract(room);
      }
    }
    return;
  }

  if (event.code === 'KeyQ' && state.uiBlocking === 'modal') {
    cancelModal();
    return;
  }

  if (event.code === 'Escape' && state.uiBlocking === 'modal') {
    cancelModal();
    return;
  }

  if (!state.started && (event.code === 'Enter' || event.code === 'Space')) {
    startGame();
    return;
  }

  keys.add(event.code);
});

window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
});

window.addEventListener('blur', () => {
  keys.clear();
  dragging = false;
});

pauseScreenEl.addEventListener('click', () => {
  audio.resume();
  hidePause();
  requestLock();
});

// ─────────────────────────────────────────────────────────────
// orientation tutorial
//
// Six cards shown once, at the top of a new run. Each card highlights its
// room on a schematic so a first-time passenger knows which corridor leads
// where before the shift clock starts eating the day.
// ─────────────────────────────────────────────────────────────

const TUTORIAL_STEPS = [
  {
    loc: 'hub',
    title: 'YOU ARE HERE — THE HUB',
    text: 'Berth 14 sits at the centre of Erebus-9. The cryo pod behind you ends a shift, and the three corridors lead to the three bays that keep the ship alive.',
  },
  {
    loc: 'reactor',
    title: 'REACTOR BAY — NORTH',
    text: 'Up the north corridor. It makes POWER and burns BIOMASS. The wrench its work needs is stocked in Nav\'s antenna rack, so every job is a walk across the ship.',
  },
  {
    loc: 'med',
    title: 'HYDRO BAY — EAST',
    text: 'Down the east corridor. Food grows here — harvest one meal per shift. It makes BIOMASS, and its filters are stocked in Reactor\'s coolant locker.',
  },
  {
    loc: 'nav',
    title: 'NAV / COMMS — WEST',
    text: 'Down the west corridor. It turns POWER into DATA and holds the escape telemetry. Its probes are stocked in Hydro\'s cabinet.',
  },
  {
    loc: 'escape',
    title: 'ESCAPE BAY — SOUTH',
    text: 'The pod waits at the end of the south corridor: 40 reserves, ten shifts logged, and a hull with no open cracks. That is the way off Erebus-9.',
  },
  {
    loc: 'panel',
    title: 'THE JOB PANEL — TOP LEFT',
    text: 'Each job says why it matters, what to press, and which tool and reserve it needs. Click a job — or press 1, 2 or 3 — to mark the bay that supplies it.',
  },
];

let tutStep = 0;

function renderTutStep() {
  const step = TUTORIAL_STEPS[tutStep];
  if (!step || !tutorialScreen) return;

  tutTitle.textContent = step.title;
  tutText.textContent = step.text;
  tutStepLabel.textContent = `${tutStep + 1} / ${TUTORIAL_STEPS.length}`;
  tutNext.textContent = tutStep === TUTORIAL_STEPS.length - 1 ? 'START SHIFT' : 'NEXT';

  tutorialScreen.querySelectorAll('.ship-map .cell').forEach((cell) => {
    cell.classList.toggle('active', cell.dataset.loc === step.loc);
  });
  // The panel card dims the backdrop so the real job panel can be seen
  // behind it while its outline pulses.
  tutorialScreen.classList.toggle('panel-step', step.loc === 'panel');
  taskPanel.classList.toggle('tut-highlight', step.loc === 'panel');
}

function showTutorial() {
  if (!tutorialScreen) {
    requestLock();
    return;
  }

  tutStep = 0;
  state.uiBlocking = 'tutorial';
  tutorialScreen.classList.remove('hidden');
  renderTutStep();
  setHovered(null);

  if (document.pointerLockElement) document.exitPointerLock();
}

function nextTutorial() {
  if (tutStep < TUTORIAL_STEPS.length - 1) {
    tutStep += 1;
    renderTutStep();
    audio.beep(520, 0.06, 'sine', 0.03);
    return;
  }
  endTutorial();
}

function endTutorial() {
  tutorialScreen.classList.add('hidden');
  tutorialScreen.classList.remove('panel-step');
  taskPanel.classList.remove('tut-highlight');
  if (state.uiBlocking === 'tutorial') state.uiBlocking = null;
  audio.success();
  requestLock();
}

if (tutNext) tutNext.addEventListener('click', nextTutorial);
if (tutSkip) tutSkip.addEventListener('click', endTutorial);

// The pod opens first: siren, red strobe, and the realisation that the
// person waking up is a passenger, not crew.
let alarmTimer = 0;
let alarmBurst = 0;

function beginRedAlert(seconds) {
  if (!alarmWash) return;
  alarmWash.classList.remove('hidden');
  window.clearTimeout(alarmTimer);
  window.clearInterval(alarmBurst);
  alarmBurst = window.setInterval(() => audio.beep(520, 0.16, 'sawtooth', 0.045), 2600);
  alarmTimer = window.setTimeout(() => {
    alarmWash.classList.add('hidden');
    window.clearInterval(alarmBurst);
  }, seconds * 1000);
}

function wakeUp() {
  wakeScene.classList.add('hidden');
  audio.start();
  audio.siren(2);
  beginRedAlert(7);
}

wakeBtn.addEventListener('click', wakeUp);
startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', restart);
resumeBtn.addEventListener('click', resumeGame);

resetBtn.addEventListener('click', () => {
  if (!resetArmed) {
    resetArmed = true;
    resetBtn.textContent = 'Confirm: erase this shift';
    resetBtn.classList.add('danger');
    window.clearTimeout(resetTimer);
    resetTimer = window.setTimeout(disarmReset, 4200);
    return;
  }

  disarmReset();
  pendingSave = null;
  clearSave();
  resumePanel.classList.add('hidden');
  startBtn.classList.remove('hidden');
  startGame();
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    keys.clear();
    saveProgress();
    audio.suspend();
  } else if (state.started) {
    audio.resume();
  }
});

window.addEventListener('pagehide', saveProgress);

// ─────────────────────────────────────────────────────────────
// movement / interaction / ambience
// ─────────────────────────────────────────────────────────────

function canStand(x, z) {
  const radius = 0.34;
  for (let i = 0; i < WALKABLE.length; i += 1) {
    const rect = WALKABLE[i];
    if (x > rect.minX + radius && x < rect.maxX - radius && z > rect.minZ + radius && z < rect.maxZ - radius) {
      return true;
    }
  }
  return false;
}

function updatePlayer(dt, time) {
  const active = state.phase === 'day' && !state.uiBlocking && !isPaused();

  // The suit has mass: the view eases toward the intended heading.
  const lookBlend = 1 - Math.exp(-11 * dt);
  player.yaw += (player.yawTarget - player.yaw) * lookBlend;
  player.pitch += (player.pitchTarget - player.pitch) * lookBlend;

  let moving = false;
  let sprinting = false;

  if (active) {
    const forwardX = -Math.sin(player.yawTarget);
    const forwardZ = -Math.cos(player.yawTarget);
    const rightX = Math.cos(player.yawTarget);
    const rightZ = -Math.sin(player.yawTarget);

    let mx = 0;
    let mz = 0;

    if (keys.has('KeyW') || keys.has('ArrowUp')) {
      mx += forwardX;
      mz += forwardZ;
    }
    if (keys.has('KeyS') || keys.has('ArrowDown')) {
      mx -= forwardX;
      mz -= forwardZ;
    }
    if (keys.has('KeyD') || keys.has('ArrowRight')) {
      mx += rightX;
      mz += rightZ;
    }
    if (keys.has('KeyA') || keys.has('ArrowLeft')) {
      mx -= rightX;
      mz -= rightZ;
    }

    const length = Math.hypot(mx, mz);
    if (length > 0) {
      mx /= length;
      mz /= length;
      moving = true;
    }

    const exhausted = state.energy <= 8 || state.hunger <= 4;
    sprinting = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && state.energy > 8 && state.hunger > 4;
    // Shifting past it means moving slow, so it follows you with its eyes
    // and does nothing else.
    const creeping = state.corridorPeek && state.corridorPeek.turned;
    const maxSpeed = (exhausted ? 2.15 : sprinting ? 4.8 : 3.05) * (creeping ? 0.4 : 1);
    const targetVx = mx * maxSpeed;
    const targetVz = mz * maxSpeed;

    // Low-friction acceleration: heavy to start, slow to coast down.
    const responsiveness = moving ? 2.1 : 3.1;
    const blend = 1 - Math.exp(-responsiveness * dt);
    player.vel.x += (targetVx - player.vel.x) * blend;
    player.vel.y += (targetVz - player.vel.y) * blend;

    if (!moving && player.vel.lengthSq() < 0.0004) player.vel.set(0, 0);

    // Whatever stands in the corridor does not let you walk through it: you
    // stop against it and have to go round, or shove.

    const stepX = player.vel.x * dt;
    const stepZ = player.vel.y * dt;

    if (stepX !== 0) {
      if (canStand(player.pos.x + stepX, player.pos.z)) player.pos.x += stepX;
      else player.vel.x = 0;
    }
    if (stepZ !== 0) {
      if (canStand(player.pos.x, player.pos.z + stepZ)) player.pos.z += stepZ;
      else player.vel.y = 0;
    }

    // It holds its ground — but only on the side it faces. Come at it from
    // behind or from the side and it is just something standing in a room.
    if (state.corridorPeek && !state.corridorPeek.pushed) {
      const px = player.pos.x - state.corridorPeek.x;
      const pz = player.pos.z - state.corridorPeek.z;
      const gap = Math.hypot(px, pz) || 0.001;
      // fx/fz point down the corridor away from the player who met it, so
      // the side it blocks is the opposite of that.
      const facing = -(px * (state.corridorPeek.fx || 0) + pz * (state.corridorPeek.fz || 0)) / gap;
      if (facing > 0.25 && gap < 1.45) {
        const nx = px / gap;
        const nz = pz / gap;
        // Head-on it stops you dead. From behind or the side it does not
        // lean on you at all.
        player.vel.set(0, 0);
        if (gap < 1.15) {
          const outX = state.corridorPeek.x + nx * 1.15;
          const outZ = state.corridorPeek.z + nz * 1.15;
          if (canStand(outX, outZ)) {
            player.pos.x = outX;
            player.pos.z = outZ;
          }
        }
      }
    }

    const speed = player.vel.length();
    if (speed > 0.35) {
      player.bob += dt * (3.6 + speed * 1.6);
      audio.step();
    }
    updateRoom();

    const targetFov = sprinting && speed > 2.6 ? 77 : 72;
    if (Math.abs(player.fov - targetFov) > 0.02) {
      player.fov += (targetFov - player.fov) * Math.min(1, dt * 2.8);
      camera.fov = player.fov;
      camera.updateProjectionMatrix();
    }
  } else {
    player.vel.multiplyScalar(Math.max(0, 1 - dt * 4.5));
  }

  updateVitals(dt, active && moving, active && sprinting);

  const speed = player.vel.length();
  const bobAmount = active ? Math.min(1, speed / 3.05) : 0;
  const bobOffset = Math.sin(player.bob * 2) * 0.034 * bobAmount;
  const sway = Math.cos(player.bob) * 0.02 * bobAmount;
  const breath = Math.sin(time * 1.12) * 0.006;

  // Lateral drift and helmet lag produce a slow suit roll.
  const lateral = player.vel.x * Math.cos(player.yaw) - player.vel.y * Math.sin(player.yaw);
  const turnLean = clamp((player.yawTarget - player.yaw) * 0.22, -0.055, 0.055);
  const targetRoll = clamp(-lateral * 0.018 + turnLean, -0.08, 0.08);
  player.roll += (targetRoll - player.roll) * Math.min(1, dt * 4.5);

  camera.position.set(
    player.pos.x + Math.cos(player.yaw) * sway,
    player.height + bobOffset + breath,
    player.pos.z - Math.sin(player.yaw) * sway,
  );
  if (state.shake > 0) {
    const power = state.shake * 0.075;
    camera.position.x += (Math.random() - 0.5) * power;
    camera.position.y += (Math.random() - 0.5) * power;
    camera.position.z += (Math.random() - 0.5) * power;
  }

  camera.rotation.set(player.pitch, player.yaw, player.roll);
}

function updateInteraction() {
  if (state.phase !== 'day' || state.uiBlocking || !state.started) {
    if (hovered) setHovered(null);
    return;
  }

  raycaster.far = 3.2;
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const hits = raycaster.intersectObjects(interactRoot.children, true);

  let target = null;
  for (let i = 0; i < hits.length; i += 1) {
    const hit = hits[i];
    if (!hit.object.isMesh) continue;

    let node = hit.object;
    while (node && !node.userData.interact) node = node.parent;
    const handle = node ? node.userData.interact : null;

    if (handle && handle.enabled) {
      target = handle;
      break;
    }
  }

  setHovered(target);
}

let eventTimer = 24;
let heartTimer = 1.5;

// Corridors are never neutral ground: entering one kills a light, and
// standing in one long enough invites something to share the walk.
function updateCorridors(dt) {
  if (!state.started || state.phase !== 'day' || state.uiBlocking || isPaused()) return;

  const room = roomAt(player.pos.x, player.pos.z);

  if (!CORRIDOR_ROOMS.includes(room)) {
    state.corridorRoom = null;
    state.corridorTimer = 0;
    return;
  }

  if (state.corridorRoom !== room) {
    state.corridorRoom = room;
    state.corridorTimer = 5 + Math.random() * 5;
    audio.creak();
    world.flicker(1.8);
    if (Math.random() < 0.55) log(pick(CORRIDOR_LINES), 'ghostly');
    return;
  }

  state.corridorTimer -= dt;
  if (state.corridorTimer > 0) return;

  const pressure = Math.min(1, (100 - state.life) / 100 + state.day * 0.04);
  state.corridorTimer = 16 - pressure * 8 + Math.random() * 8;

  world.flicker(2.2);
  audio.whisper();

  const roll = Math.random();
  if (roll < 0.34) {
    world.showWatcher(player.pos);
    log(pick(CORRIDOR_LINES), 'bad');
  } else if (roll < 0.62) {
    audio.clunk();
    audio.step();
    window.setTimeout(() => audio.step(), 420);
    log('Footsteps behind you, keeping your pace. They stop when you do.', 'ghostly');
  } else if (roll < 0.85) {
    log(pick(CORRIDOR_LINES), 'ghostly');
  } else {
    state.shake = Math.max(state.shake, 0.22);
    audio.breathe(0.8);
    log('The air in the corridor turns warm and wet, once.', 'bad');
  }
}

// Something small lives in the walls. It moves when the ship is quiet,
// more often as control falls, and it is always just out of sight.
function updateScurry(dt) {
  if (!state.started || state.phase !== 'day' || state.uiBlocking || isPaused()) return;

  state.nextScurry -= dt;
  if (state.nextScurry > 0) return;

  const pressure = 1 - state.life / 100;
  state.nextScurry = 9 + Math.random() * 15 - pressure * 4;

  const room = roomAt(player.pos.x, player.pos.z);
  const inCorridor = CORRIDOR_ROOMS.includes(room);
  const pan = Math.random() * 2 - 1;

  audio.scurry(pan, inCorridor ? 0.085 : 0.03 + Math.random() * 0.02);

  if (inCorridor && Math.random() < 0.35) {
    log('Something small skitters along the wall behind you.', 'ghostly');
  }
}

// How hard the vents work on the player, keyed to controlPhase():
//   100-80  they only watch; the grates do not move
//   80-50   they breathe while you stand close and fog the visor, and
//           nothing comes out — tense, never a jumpscare
//   50-20   a jump scare can land, and it never costs ship control
//   20-0    the thing pulls itself out of the wall and hunts
const VENT_COOLDOWNS = [0, 14, 20, 24];

function nearestVentIndex(maxDist = 16) {
  const vents = world.vents || [];
  let index = -1;
  let best = maxDist;

  vents.forEach((vent, i) => {
    const dist = Math.hypot(vent.x - player.pos.x, vent.z - player.pos.z);
    if (dist < best) {
      best = dist;
      index = i;
    }
  });

  return index;
}

function huntNodeForPoint(x, z) {
  let best = 'n';
  let bestDist = Infinity;

  Object.entries(HUNT_WAYPOINTS).forEach(([id, point]) => {
    const dist = Math.hypot(point.x - x, point.z - z);
    if (dist < bestDist) {
      bestDist = dist;
      best = id;
    }
  });

  return best;
}

// 20-0: it stops lurking in doorways and comes out of the nearest vent.
function emergeFromVent(index) {
  const vents = world.vents || [];
  const vent = vents[index] || vents[0] || null;
  const at = vent ? (vents[index] ? index : 0) : -1;

  state.ventHuntPending = 0;
  state.ventEvent = null;
  state.ventCooldown = 30;
  ventFx.classList.remove('on');

  if (at >= 0) {
    world.stirVent(at, 1);
    world.ventScareAt(at, player.pos, camera);
  }

  world.flicker(3.4);
  audio.screech();
  audio.nightSting();
  state.shake = Math.max(state.shake, 1);

  scareFlash.classList.remove('flash');
  void scareFlash.offsetWidth;
  scareFlash.classList.add('flash');
  window.setTimeout(() => scareFlash.classList.remove('flash'), 470);

  log('IT CAME OUT OF THE VENT. IT IS COMING AFTER YOU.', 'bad');
  startHunt(vent ? huntNodeForPoint(vent.x, vent.z) : 'n');
}

function updateVentHazard(dt) {
  if (!state.started || state.phase !== 'day' || state.uiBlocking || isPaused()) return;

  if (state.ventHuntPending > 0) {
    state.ventHuntPending -= dt;
    if (state.ventHuntPending <= 0) {
      emergeFromVent(nearestVentIndex(18));
      return;
    }
  }

  if (state.ventCooldown > 0) state.ventCooldown = Math.max(0, state.ventCooldown - dt);

  const tier = controlPhase();
  const vents = world.vents || [];
  let nearest = null;
  let nearestDist = 6;

  vents.forEach((vent, index) => {
    const dist = Math.hypot(vent.x - player.pos.x, vent.z - player.pos.z);
    if (dist < nearestDist) {
      nearest = { index, dist };
      nearestDist = dist;
    }
  });

  if (!nearest) {
    state.ventEvent = null;
    ventFx.classList.remove('on');
    return;
  }

  world.stirVent(nearest.index, clamp(1 - nearest.dist / 6, 0, 1));

  // The visor only reddens when there is actually something in the grate:
  // proximity alone is not a scare, and being near a vent all day is not
  // either.
  const faceOut = world.ventFace(nearest.index) > 0.55;
  ventFx.classList.toggle('on', faceOut && nearest.dist < 3.4);

  // 80-50: the vents breathe on their own now and then, so a corridor is
  // never quiet — but nothing comes out of them.
  if (tier === 1) {
    state.ventAmbient -= dt;
    if (state.ventAmbient <= 0) {
      state.ventAmbient = 26 + Math.random() * 18;
      const index = nearestVentIndex(9);
      if (index >= 0) {
        world.stirVent(index, 0.55);
        audio.breathe(0.55);
        if (Math.random() < 0.35) log(pick(VENT_LINES), 'ghostly');
      }
    }
  }

  if (tier === 0) return;

  if (state.ventEvent) {
    if (state.ventEvent.index !== nearest.index || nearest.dist > 3.1) {
      state.ventEvent = null;
    } else {
      state.ventEvent.time += dt;
      state.shake = Math.max(state.shake, 0.2 + state.ventEvent.time * 0.12);

      // Only from 50% down can it actually lunge out.
      if (tier >= 2 && nearest.dist < 1.7 && state.ventEvent.time > 0.9) {
        burstVent(nearest.index);
        return;
      }

      if (state.ventEvent.time > (tier >= 2 ? 3.4 : 2.6)) {
        state.ventEvent = null;
        state.ventCooldown = VENT_COOLDOWNS[tier] || 12;
      }
      return;
    }
  }

  if (nearest.dist < 2.5 && state.ventCooldown <= 0) {
    state.ventEvent = { index: nearest.index, time: 0 };
    audio.breathe(1);
    audio.whisper();
    world.flicker(2.6);
    state.shake = Math.max(state.shake, 0.3);
    log(pick(VENT_LINES), 'bad');
  }
}

// 50-20: the jumpscare is real, the damage is not. It cannot end the run.
function burstVent(index) {
  state.ventEvent = null;
  state.ventCooldown = 20;
  ventFx.classList.remove('on');
  // (the visor class is re-derived every frame from what is in the grate)

  world.stirVent(index, 1);
  world.flicker(3.2);
  world.ventScareAt(index, player.pos, camera);
  audio.screech();
  audio.whisper();
  state.shake = Math.max(state.shake, 0.95);

  scareFlash.classList.remove('flash');
  void scareFlash.offsetWidth;
  scareFlash.classList.add('flash');
  window.setTimeout(() => scareFlash.classList.remove('flash'), 470);

  log('IT LUNGED OUT OF THE VENT AND WAS GONE. IT DID NOT TAKE YOU — THIS TIME.', 'bad');
}

function updateAmbient(dt) {
  if (!state.started) return;

  if (state.phase === 'day' && !state.uiBlocking) {
    eventTimer -= dt;
    if (eventTimer <= 0) {
      eventTimer = 24 + Math.random() * 22;
      world.flicker();
      if (Math.random() < 0.7) audio.creak();
      if (Math.random() < 0.45) audio.whisper();
      if (Math.random() < 0.5) {
        log(pick(FLAVOUR_LINES), 'ghostly');
      }
    }
  }

  heartTimer -= dt;
  if (heartTimer <= 0) {
    if (state.phase === 'night') {
      audio.heartbeat(1.25);
      heartTimer = 1.05;
    } else if (state.life <= 30 || state.huntActive || state.energy <= 14 || state.hunger <= 10) {
      audio.heartbeat(0.85);
      heartTimer = 1.55;
    } else {
      heartTimer = 2.6;
    }
  }
}

function updatePod(time) {
  const halo = sleepPod.userData.halo;
  const beam = sleepPod.userData.beam;
  if (halo) halo.material.opacity = 0.3 + Math.sin(time * 1.8) * 0.12;
  if (beam) beam.material.opacity = 0.035 + (Math.sin(time * 1.4) * 0.5 + 0.5) * 0.035;
}

// ─────────────────────────────────────────────────────────────
// crew vitals / shift clock
// ─────────────────────────────────────────────────────────────

function isPaused() {
  return !pauseScreen.classList.contains('hidden');
}

function updateVitals(dt, moving, sprinting) {
  if (!state.started || state.phase !== 'day' || state.uiBlocking || isPaused()) return;

  // The suit burns power when it moves; the body burns food all the time.
  if (moving) state.energy -= (sprinting ? 5.0 : 0.18) * dt;
  else state.energy += 1.6 * dt;

  state.hunger -= 0.05 * dt;
  state.energy = clamp(state.energy, 0, 100);
  state.hunger = clamp(state.hunger, 0, 100);

  if (!state.lowEnergyWarned && state.energy <= 20) {
    state.lowEnergyWarned = true;
    log('Suit power low. Stand still to recharge, or eat in Hydro Bay.', 'warn');
  } else if (state.energy > 38) {
    state.lowEnergyWarned = false;
  }

  if (!state.lowHungerWarned && state.hunger <= 20) {
    state.lowHungerWarned = true;
    log('Hunger low. Hydro Bay grows one meal a day.', 'bad');
  } else if (state.hunger > 38) {
    state.lowHungerWarned = false;
  }

  setVitalsUI();
}

function updateShiftTimer(dt) {
  if (!state.started || state.phase !== 'day' || state.uiBlocking || isPaused()) return;

  state.timeLeft = Math.max(0, state.timeLeft - dt);
  updateTimerUI();

  if (!state.timerWarned && state.timeLeft <= 30) {
    state.timerWarned = true;
    log('SHIFT CLOCK — 30 SECONDS. The pod will seal itself.', 'bad');
    audio.beep(880, 0.25, 'square', 0.03);
  }

  if (state.timeLeft <= 0) {
    state.forcedSleep = true;
    log('The shift clock hits zero. The ship walks you to the pod.', 'bad');
    runNight();
  }
}

// ─────────────────────────────────────────────────────────────
// monster phases
// ─────────────────────────────────────────────────────────────

const HUNT_WAYPOINTS = {
  hub: { x: 0, z: 0 },
  n: { x: 0, z: outCoord(-13) },
  reactor: { x: 0, z: outCoord(-26) },
  e: { x: outCoord(13), z: 0 },
  hydro: { x: outCoord(26), z: 0 },
  w: { x: outCoord(-13), z: 0 },
  nav: { x: outCoord(-26), z: 0 },
  s: { x: 0, z: outCoord(13) },
  escape: { x: 0, z: outCoord(26) },
};

const HUNT_EDGES = {
  hub: ['n', 'e', 'w', 's'],
  n: ['hub', 'reactor'],
  reactor: ['n'],
  e: ['hub', 'hydro'],
  hydro: ['e'],
  w: ['hub', 'nav'],
  nav: ['w'],
  s: ['hub', 'escape'],
  escape: ['s'],
};

// 100-80: quiet. 80-50: it comes out of the doorways. 50-20: it stands
// in the corridors and grabs. 20-0: it stops pretending and hunts.
function controlPhase() {
  if (state.life > 80) return 0;
  if (state.life > 50) return 1;
  if (state.life > 20) return 2;
  return 3;
}

function huntNodeForRoom(roomId) {
  if (roomId === 'reactor') return 'reactor';
  if (roomId === 'med') return 'hydro';
  if (roomId === 'nav') return 'nav';
  if (roomId === 'escape') return 'escape';
  if (roomId === 'corridorS') return 's';
  return 'hub';
}

function findHuntPath(from, to) {
  if (!from || !to) return [from || to || 'hub'];
  if (from === to) return [from];

  const queue = [[from]];
  const seen = new Set([from]);

  while (queue.length) {
    const path = queue.shift();
    const last = path[path.length - 1];
    const neighbours = HUNT_EDGES[last] || [];

    for (let i = 0; i < neighbours.length; i += 1) {
      const next = neighbours[i];
      if (seen.has(next)) continue;
      const grown = [...path, next];
      if (next === to) return grown;
      seen.add(next);
      queue.push(grown);
    }
  }

  return [from];
}

function startHunt(spawnNode = 'n') {
  if (state.huntActive) return;

  state.huntActive = true;
  state.huntPath = [];
  state.huntPlayerNode = null;

  // It comes out of the north corridor, where the lights are weakest —
  // unless it just pulled itself out of a vent somewhere else.
  state.huntNode = HUNT_WAYPOINTS[spawnNode] ? spawnNode : 'n';
  const spawn = HUNT_WAYPOINTS[state.huntNode];
  world.hunter.position.set(spawn.x, 0, spawn.z);
  world.setHunterActive(true);

  log('Something is walking the corridors. It is looking for you.', 'bad');
  audio.nightSting();
}

function stopHunt() {
  state.huntActive = false;
  state.huntNode = null;
  state.huntPlayerNode = null;
  state.huntPath = [];
  world.setHunterActive(false);
}

function updateHunt(dt) {
  if (!state.huntActive) return;

  const hunter = world.hunter;
  if (!state.huntNode) state.huntNode = 'n';

  const playerNode = huntNodeForRoom(roomAt(player.pos.x, player.pos.z));
  state.huntPlayerNode = playerNode;

  const path = findHuntPath(state.huntNode, playerNode);
  state.huntPath = path;

  const chasing = path.length <= 1;
  const target = chasing ? player.pos : HUNT_WAYPOINTS[path[1]] || HUNT_WAYPOINTS[playerNode];
  if (!target) return;

  const dx = target.x - hunter.position.x;
  const dz = target.z - hunter.position.z;
  const distance = Math.hypot(dx, dz);
  // It gets faster the closer the hull is to failing: 1.32 m/s at 20%
  // control, almost 3 m/s as the last of it goes.
  const speed = 1.32 + (1 - clamp(state.life / 20, 0, 1)) * 1.7;
  const step = speed * dt;

  if (distance <= step) {
    hunter.position.x = target.x;
    hunter.position.z = target.z;
    if (!chasing && path[1]) state.huntNode = path[1];
  } else {
    hunter.position.x += (dx / distance) * step;
    hunter.position.z += (dz / distance) * step;
  }

  hunter.rotation.y = Math.atan2(player.pos.x - hunter.position.x, player.pos.z - hunter.position.z);

  const proximity = Math.hypot(player.pos.x - hunter.position.x, player.pos.z - hunter.position.z);
  state.shake = Math.max(state.shake, clamp(1 - proximity / 9, 0, 0.55));

  if (proximity < 1.15) {
    gameOver('eaten');
  }
}

// ── the corridor grab ────────────────────────────────────────
// In the 50-20% band it does not chase. It stands in a doorway and waits
// for you to walk into it. Getting close starts a mash-out that costs a
// reserve; with nothing left in the tanks, it simply does not let go.

const ESCAPE_RESOURCES = ['power', 'biomass', 'data'];

function escapeCost() {
  let key = ESCAPE_RESOURCES[0];
  ESCAPE_RESOURCES.forEach((candidate) => {
    if ((state.resources[candidate] ?? 0) > (state.resources[key] ?? 0)) key = candidate;
  });

  const stock = Math.floor(state.resources[key] ?? 0);
  return { key, cost: Math.min(10, Math.max(0, stock)) };
}

function startEscape() {
  if (state.escape || state.phase !== 'day' || state.uiBlocking) return;

  const { key, cost } = escapeCost();

  if (cost <= 0) {
    // nothing left to burn: it takes the crew instead
    world.hideLurker();
    state.standRoom = null;
    gameOver('eaten');
    return;
  }

  state.escape = { key, cost, progress: 0, time: 0, window: 4.2 };
  state.uiBlocking = 'escape';
  keys.clear();
  state.shake = Math.max(state.shake, 0.8);

  world.grabLurker(camera);
  audio.screech();
  audio.heartbeat(1.4);

  app.classList.add('ending');
  window.setTimeout(() => {
    if (!state.escape) app.classList.remove('ending');
  }, 900);

  struggleEl.classList.remove('hidden');
  struggleFillEl.style.width = '0%';
  strugglePressEl.textContent = '0';
  struggleCostEl.textContent = `COSTS ${cost} ${RESOURCE_META[key].label.toUpperCase()}`;

  log('IT HAS YOU. MASH SPACE TO BREAK FREE.', 'bad');
}

function mashEscape() {
  const esc = state.escape;
  if (!esc) return;

  esc.progress += 0.085;
  struggleFillEl.style.width = `${Math.min(100, esc.progress * 100)}%`;
  strugglePressEl.textContent = String(Math.min(100, Math.floor(esc.progress * 100)));
  state.shake = Math.max(state.shake, 0.55);
  audio.beep(220 + Math.random() * 180, 0.05, 'square', 0.03);

  if (esc.progress >= 1) finishEscape(true);
}

function finishEscape(success) {
  const esc = state.escape;
  if (!esc) return;

  state.escape = null;
  state.uiBlocking = null;
  struggleEl.classList.add('hidden');
  app.classList.remove('ending');
  world.hideLurker();
  state.standRoom = null;
  state.standCooldown = 18 + Math.random() * 10;

  if (!success) {
    gameOver('eaten');
    return;
  }

  state.resources[esc.key] = Math.max(0, (state.resources[esc.key] ?? 0) - esc.cost);
  setResourcesUI();
  state.shake = Math.max(state.shake, 0.4);
  audio.success();
  log(`You tear free. The suit burns ${esc.cost} ${RESOURCE_META[esc.key].label.toLowerCase()}.`, 'warn');
}

function updateEscape(dt) {
  const esc = state.escape;
  if (!esc) return;

  esc.time += dt;
  esc.progress = Math.max(0, esc.progress - dt * 0.16);
  struggleFillEl.style.width = `${Math.min(100, esc.progress * 100)}%`;

  if (esc.time >= esc.window) finishEscape(false);
}

// It takes up a post in the corridor as soon as the player arrives, and
// keeps it until they get close enough to be grabbed.
function updateLurkerStand(dt) {
  const room = roomAt(player.pos.x, player.pos.z);

  if (state.standRoom && state.standRoom !== room) {
    world.hideLurker();
    state.standRoom = null;
    state.standCooldown = 2.4 + Math.random() * 2.2;
    return;
  }

  if (!state.standRoom) {
    state.standCooldown -= dt;
    if (state.standCooldown > 0) return;

    if (world.showLurker(player.pos, camera, 'stand')) {
      state.standRoom = room;
      audio.creak();
      audio.whisper();
      log('It is standing in the corridor. It has not moved.', 'bad');
    } else {
      state.standCooldown = 1.2;
    }
    return;
  }

  if (!world.lurker.visible) return;

  const proximity = Math.hypot(
    player.pos.x - world.lurker.position.x,
    player.pos.z - world.lurker.position.z,
  );

  state.shake = Math.max(state.shake, clamp(1 - proximity / 8, 0, 0.35));
  if (proximity < 2.3) startEscape();
}

function triggerVentScare() {
  if (!state.started || state.phase !== 'day' || state.uiBlocking) return;

  world.ventScare(player.pos, camera);
  world.flicker(2.2);
  audio.nightSting();
  audio.whisper();
  state.shake = Math.max(state.shake, 0.7);

  scareFlash.classList.remove('flash');
  void scareFlash.offsetWidth;
  scareFlash.classList.add('flash');
  window.setTimeout(() => scareFlash.classList.remove('flash'), 470);

  log('IT CAME OUT OF THE VENT.', 'bad');
}

function applyMonsterPhase() {
  const phase = controlPhase();
  const previous = state.monsterPhase;
  state.monsterPhase = phase;

  world.setDread(state.life);

  if (phase === 0) {
    stopHunt();
    world.hideLurker();
    state.standRoom = null;
    state.nextWatcher = 26 + Math.random() * 16;
    state.nextDoor = 24 + Math.random() * 12;
    state.nextVentPeek = 14 + Math.random() * 12;
  } else if (phase === 1) {
    stopHunt();
    world.hideLurker();
    state.standRoom = null;
    state.nextWatcher = 34 + Math.random() * 16;
    state.nextDoor = 13 + Math.random() * 8;
    state.nextVentPeek = 18 + Math.random() * 14;
    state.nextCorridorPeek = 24 + Math.random() * 16;
  } else if (phase === 2) {
    stopHunt();
    state.standRoom = null;
    state.standCooldown = 2.6 + Math.random() * 2.2;
    state.nextWatcher = 999;
    state.nextDoor = 999;
    state.nextCorridorPeek = 26 + Math.random() * 16;
  } else {
    world.hideLurker();
    state.standRoom = null;
    state.nextWatcher = 999;
    state.nextDoor = 999;

    // Below 20% it does not just appear in the corridor: it has to come
    // out of the vents first, and the gate below times that emergence.
    if (!state.huntActive && state.ventHuntPending <= 0) {
      state.ventHuntPending = 1.6;
      audio.creak();
    }
  }

  // The peeks belong to the open, quiet ship; once it is coming out of the
  // vents properly, half-seen things are no longer the point.
  if (phase >= 2 && (state.ventPeek || state.corridorPeek)) {
    world.hidePeek();
    state.ventPeek = null;
    state.corridorPeek = null;
  }

  if (state.started && phase !== previous) {
    if (phase === 1) {
      log('It keeps appearing in the doorways. It never stays long.', 'bad');
      log('The vents are breathing louder than they were.', 'ghostly');
    } else if (phase === 2) {
      log('It is standing in the corridor. Do not get close.', 'bad');
      log('The vents are not closed. They are only shut.', 'bad');
    } else if (phase === 3) {
      log('SHIP CONTROL CRITICAL — the vents are opening.', 'bad');
    }
  }
}

// ── peeking scares ──────────────────────────────────────────
// Two things the ship does with the corner of your eye: a face in the vent
// that leaves when you look right at it, and a shoulder around the far
// doorway that is only there while you are walking toward it.

const gazeVector = new THREE.Vector3();

function gazeDot(pos) {
  camera.getWorldDirection(gazeVector);
  const dx = pos.x - camera.position.x;
  const dz = pos.z - camera.position.z;
  const dist = Math.hypot(dx, dz) || 1;
  return (dx * gazeVector.x + dz * gazeVector.z) / dist;
}

// Stereo position of a sound that is over there rather than in front.
function panFor(pos) {
  camera.getWorldDirection(gazeVector);
  const dx = pos.x - camera.position.x;
  const dz = pos.z - camera.position.z;
  const dist = Math.hypot(dx, dz) || 1;
  return clamp((dx * -gazeVector.z + dz * gazeVector.x) / dist, -1, 1);
}

function updateVentPeek(dt) {
  const peek = state.ventPeek;
  if (!peek) return;

  peek.life += dt;

  if (peek.life > peek.duration) {
    world.hidePeek();
    state.ventPeek = null;
    if (Math.random() < 0.5) audio.scurry(panFor(peek), 0.05);
    return;
  }

  if (peek.visible) {
    // Meet its eyes and it is gone, feet first, into the duct.
    if (peek.life > 0.18 && gazeDot(peek) > 0.9) {
      world.hidePeek();
      state.ventPeek = null;
      audio.scurry(panFor(peek), 0.11);
      return;
    }

    // It does not hold still: a face for a moment, then nothing.
    if (peek.life >= peek.showUntil) {
      peek.visible = false;
      peek.hideUntil = peek.life + 0.5 + Math.random() * 2.3;
      world.setPeekVisible(false);
      if (Math.random() < 0.75) audio.scurry(panFor(peek), 0.055);
    }
    return;
  }

  if (peek.life >= peek.hideUntil) {
    // Mostly it comes back, at whichever grate is in front of you now —
    // and sometimes it does not come back at all.
    if (Math.random() < 0.18) {
      world.hidePeek();
      state.ventPeek = null;
      return;
    }

    const spot = world.showVentPeek(player.pos, camera);
    if (!spot) {
      world.hidePeek();
      state.ventPeek = null;
      return;
    }

    peek.x = spot.x;
    peek.y = spot.y;
    peek.z = spot.z;
    peek.index = spot.index;
    peek.visible = true;
    peek.showUntil = peek.life + 0.8 + Math.random() * 2.6;
    audio.creak();
  }
}

function updateCorridorPeek(dt) {
  const peek = state.corridorPeek;
  if (!peek) return;

  peek.life += dt;

  // Track where it actually is: it drifts out of the frame as you watch.
  const pos = world.peekPos();
  peek.x = pos.x;
  peek.z = pos.z;

  const gap = Math.hypot(peek.x - player.pos.x, peek.z - player.pos.z);
  const near = gap < 2.3;

  // After E it does nothing but watch you go, and you can only move slowly.
  if (peek.turned) {
    peek.turnFor = (peek.turnFor || 0) + dt;
    world.setPeekVisible(true);
    if (peek.turnFor > 3.4 || gap > 4.2) {
      world.hidePeek();
      state.corridorPeek = null;
      audio.scurry(panFor(peek), 0.09);
    }
    return;
  }

  peek.blocked = near ? (peek.blocked || 0) + dt : 0;

  // Contact. The hand goes flat on the chest, the frame knocks, and you are
  // put back half a step — but it never follows up.
  if (!peek.contacted && gap < 1.5) {
    peek.contacted = true;
    world.peekLunge();
    audio.thud(0.9);
    audio.whisper();
    world.flicker(0.5);
    state.shake = Math.max(state.shake, 0.66);
    player.pitchTarget = clamp(player.pitchTarget - 0.17, -1.2, 1.2);
    player.bob += 0.8;
    const nx = (player.pos.x - peek.x) / (gap || 1);
    const nz = (player.pos.z - peek.z) / (gap || 1);
    player.vel.x += nx * 2.4;
    player.vel.y += nz * 2.4;
    log('A hand lands flat on your chest. It does not push. It holds.', 'bad');
  }

  const moving = player.vel.length() > 0.65;
  const staring = gazeDot(peek) > 0.985;
  peek.stare = staring ? (peek.stare || 0) + dt : 0;

  if (near && !peek.hinted) {
    peek.hinted = true;
    state.shake = Math.max(state.shake, 0.16);
    log('It fills the corridor. PRESS E to shift past — and move slowly.', 'bad');
  }

  if (peek.life > 9 || peek.blocked > 6) {
    world.hidePeek();
    state.corridorPeek = null;
    audio.scurry(panFor(peek), 0.1);
    return;
  }

  // Staring it down works from a distance. Once it is in the doorway in
  // front of you, looking at it is the only thing you can do.
  if (peek.stare > 0.3 && !near) {
    world.hidePeek();
    state.corridorPeek = null;
    audio.whisper();
    return;
  }

  // It only exists in motion: stop walking and the doorway is empty —
  // unless it has planted itself in front of you.
  if (!moving && !near) {
    world.hidePeek();
    state.corridorPeek = null;
    audio.scurry(panFor(peek), 0.08);
    return;
  }

  world.setPeekVisible(true);
}

// E in the corridor: shift round the thing that will not let you past.
function shoveCorridorPeek() {
  const peek = state.corridorPeek;
  if (!peek || peek.pushed) return false;

  const gap = Math.hypot(peek.x - player.pos.x, peek.z - player.pos.z);
  if (gap > 2.6) return false;

  // No jumpscare: it just turns its head and watches you squeeze past.
  peek.pushed = true;
  peek.turned = true;
  peek.turnFor = 0;
  peek.contacted = true;
  player.vel.set(0, 0);
  world.peekTurnHead();
  audio.whisper();
  audio.creak();
  state.shake = Math.max(state.shake, 0.2);

  log('It turns to watch you. Keep moving slowly and it stays put.', 'ghostly');
  return true;
}

function updateMonster(dt) {
  if (!state.started || state.phase !== 'day' || state.uiBlocking || isPaused()) return;

  const phase = state.monsterPhase;

  if (phase === 0) {
    // The opening nights are quiet, but the ship shows itself once: a
    // figure at the far end of a corridor, gone when you look again.
    if (!state.firstSighting && state.day >= 4 && state.day <= 6) {
      state.firstSightingTimer += dt;
      if (state.firstSightingTimer > 26) {
        state.firstSighting = true;
        world.showWatcher(player.pos);
        world.flicker(1.2);
        audio.whisper();
        log('Something is standing at the end of the corridor. When you look again, it is not.', 'ghostly');
      }
    }
  }

  if (phase === 1) {
    // It pops out of a door frame, holds for two seconds, and is gone.
    state.nextDoor -= dt;
    if (state.nextDoor <= 0) {
      state.nextDoor = 19 + Math.random() * 13;
      if (world.showLurker(player.pos, camera, 'door')) {
        audio.creak();
        audio.whisper();
        log('A shape fills the doorway. It does not come through.', 'bad');
      }
    }

    state.nextWatcher -= dt;
    if (state.nextWatcher <= 0) {
      state.nextWatcher = 38 + Math.random() * 18;
      world.showWatcher(player.pos);
      audio.whisper();
      log(pick(WATCHER_LINES), 'ghostly');
    }
  }

  if (phase === 2) updateLurkerStand(dt);

  if (phase === 3) updateHunt(dt);

  updateVentPeek(dt);
  updateCorridorPeek(dt);

  // A face in the vent at high control: it watches until watched.
  if (phase <= 1) {
    state.nextVentPeek -= dt;
    if (state.nextVentPeek <= 0) {
      state.nextVentPeek = 16 + Math.random() * 26;
      if (!state.ventPeek && !state.corridorPeek) {
        const spot = world.showVentPeek(player.pos, camera);
        if (spot) {
          state.ventPeek = {
            ...spot,
            life: 0,
            duration: 8 + Math.random() * 7,
            visible: true,
            showUntil: 1 + Math.random() * 2.4,
          };
          audio.creak();
        }
      }
    }
  }

  // A head and shoulder around the far door, only while you are walking.
  if (phase >= 1 && phase <= 2) {
    state.nextCorridorPeek -= dt;
    if (state.nextCorridorPeek <= 0) {
      state.nextCorridorPeek = 30 + Math.random() * 20;
      const inCorridor = CORRIDOR_ROOMS.includes(roomAt(player.pos.x, player.pos.z));
      if (inCorridor && player.vel.length() > 0.8 && !state.ventPeek && !state.corridorPeek) {
        const spot = world.showCorridorPeek(player.pos, camera);
        if (spot) state.corridorPeek = { ...spot, life: 0, stare: 0 };
      }
    }
  }

  // Watch the figures go: if the player met its eyes, it slips away audibly.
  if (world.consumeGhostVanish && world.consumeGhostVanish()) {
    audio.scurry(panFor(world.ghost.group.position), 0.09);
    audio.whisper();
  }

  if (world.consumeLurkerVanish && world.consumeLurkerVanish()) {
    audio.scurry(panFor(world.lurker.position), 0.09);
  }

  if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.6);
}

// ─────────────────────────────────────────────────────────────
// suit task pointers
// ─────────────────────────────────────────────────────────────

const ROOM_POINTER_ANCHORS = {
  reactor: { x: 0, y: 1.9, z: outCoord(-22.8) },
  med: { x: outCoord(26), y: 1.9, z: 0 },
  nav: { x: outCoord(-26), y: 1.9, z: 0 },
};

const POD_POINTER = { x: 0, y: 1.85, z: 6.1 };

const STORE_ANCHORS = Object.fromEntries(
  Object.entries(lockers).map(([room, locker]) => [room, { x: locker.x, y: 2.05, z: locker.z }]),
);

function createWaypointEntry(kind, name, color) {
  const el = document.createElement('div');
  el.className = `wp ${kind}`;
  el.style.setProperty('--wp-color', color);

  const arrow = document.createElement('span');
  arrow.className = 'wp-arrow';

  const marker = document.createElement('span');
  marker.className = 'wp-marker';

  const tag = document.createElement('span');
  tag.className = 'wp-tag';

  const nameEl = document.createElement('span');
  nameEl.className = 'wp-name';
  nameEl.textContent = name;

  const distEl = document.createElement('span');
  distEl.className = 'wp-dist';

  tag.append(nameEl, distEl);
  el.append(arrow, marker, tag);
  el.style.display = 'none';
  waypointsLayer.append(el);

  return { el, nameEl, distEl };
}

function buildWaypoints() {
  if (!waypointsLayer) return;

  waypointEls = new Map();
  waypointsLayer.replaceChildren();

  ['reactor', 'med', 'nav'].forEach((roomId) => {
    const task = state.tasks[roomId];
    if (!task || typeof task.getTargets !== 'function') return;

    const meta = ROOM_META[roomId];
    task.getTargets().forEach((target) => {
      waypointEls.set(`${roomId}:${target.index}`, createWaypointEntry('unit', target.label, meta.tint));
    });
  });

  Object.keys(LOCKER_TOOL).forEach((room) => {
    waypointEls.set(`store:${room}`, createWaypointEntry('unit', ROOM_META[room].short, '#ffcf8a'));
  });

  state.cracks.forEach((crack) => {
    const slot = world.crackSlots[crack.slot];
    if (!slot) return;
    waypointEls.set(`crack:${crack.slot}`, createWaypointEntry('unit', `CRACK ${crack.severity}%`, '#ff8a6a'));
  });

  waypointEls.set('pod', createWaypointEntry('pod', 'CRYO POD', '#7fe4ff'));
  waypointEls.set('reserve', createWaypointEntry('unit', 'RESERVE', '#ffcf8a'));
  waypointEls.set(
    'escape',
    createWaypointEntry('pod', state.podBuilt ? 'ESCAPE POD' : 'ESCAPE BAY', '#a8e6ff'),
  );
}

function drawWaypoint(entry, target, cameraPos, width, height, isPod) {
  const worldPos = new THREE.Vector3(target.x, target.y, target.z);
  const camSpace = worldPos.clone().applyMatrix4(camera.matrixWorldInverse);
  const projected = worldPos.clone().project(camera);

  let sx = (projected.x * 0.5 + 0.5) * width;
  let sy = (-projected.y * 0.5 + 0.5) * height;
  const behind = camSpace.z > 0;
  const onScreen = !behind
    && projected.x > -0.97 && projected.x < 0.97
    && projected.y > -0.97 && projected.y < 0.97;

  const edge = !onScreen;

  if (edge) {
    let dx = camSpace.x;
    let dy = camSpace.y;

    if (behind) {
      dx = -dx;
      dy = -dy;
    }

    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4)) {
      dx = 0;
      dy = behind ? -1 : 1;
    }

    const angle = Math.atan2(-dy, dx);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const halfW = width / 2 - 64;
    const halfH = (height - 216) / 2;
    const reach = Math.min(halfW / Math.max(Math.abs(cos), 1e-4), halfH / Math.max(Math.abs(sin), 1e-4));

    sx = width / 2 + cos * reach;
    sy = (height + 24) / 2 + sin * reach;
    entry.el.style.setProperty('--angle', `${angle}rad`);
  }

  // The job panel covers the left of the screen; a task marker hiding
  // behind it is the same as no marker at all.
  let minX = 50;
  if (taskPanel) {
    const panelRect = taskPanel.getBoundingClientRect();
    const panelVisible = panelRect.width > 0 && panelRect.height > 0;
    if (panelVisible && sy > panelRect.top - 24 && sy < panelRect.bottom + 24) {
      minX = panelRect.right + 46;
    }
  }

  entry.el.style.left = `${clamp(sx, minX, width - 50)}px`;
  entry.el.style.top = `${clamp(sy, 118, height - 88)}px`;
  entry.el.style.display = 'flex';
  entry.el.classList.toggle('edge', edge);
  entry.el.classList.toggle('pod', !!isPod);

  const distance = Math.max(1, Math.round(cameraPos.distanceTo(worldPos)));
  entry.distEl.textContent = `${distance}m`;

  if (entry.nameEl.textContent !== String(target.label)) {
    entry.nameEl.textContent = String(target.label);
  }

  entry.el.style.opacity = String(clamp(1.35 - distance / 60, 0.42, 1));
}

function updateWaypoints(dt) {
  if (!waypointsLayer) return;

  waypointTimer -= dt;
  if (waypointTimer > 0) return;
  waypointTimer = 0.07;

  camera.updateMatrixWorld();

  const width = window.innerWidth;
  const height = window.innerHeight;
  const active = state.started
    && state.phase === 'day'
    && !state.uiBlocking
    && pauseScreen.classList.contains('hidden');
  const currentRoom = roomAt(player.pos.x, player.pos.z);
  const cameraPos = camera.position;

  waypointEls.forEach((entry) => {
    entry.el.style.display = 'none';
  });

  if (!active) return;

  // One task at a time, and one marker at a time. Pressing a task on the panel
  // marks the next unit it wants; after that unit is pressed the marker moves
  // to what the press was short of. The rest of the ship stays unmarked so the
  // screen is never a field of pointers.
  const roomId = state.focusTask;
  if (!roomId) return;

  // Two marks that are not jobs: the way off the ship, and the hull.
  if (roomId === 'escape') {
    const entry = waypointEls.get('escape');
    if (entry) {
      entry.el.classList.add('next');
      drawWaypoint(
        entry,
        { x: 0, y: 2.4, z: outCoord(26.4), label: state.podBuilt ? 'ESCAPE POD' : 'ESCAPE BAY' },
        cameraPos,
        width,
        height,
        true,
      );
    }
    return;
  }

  if (roomId === 'cracks') {
    state.cracks.forEach((crack) => {
      const slot = world.crackSlots[crack.slot];
      const entry = waypointEls.get(`crack:${crack.slot}`);
      if (!slot || !entry) return;

      entry.el.classList.add('next');
      drawWaypoint(
        entry,
        { x: slot.x, y: slot.y, z: slot.z, label: `CRACK ${crack.severity}%` },
        cameraPos,
        width,
        height,
        false,
      );
    });
    return;
  }

  const task = state.tasks[roomId];
  const meta = ROOM_META[roomId];
  if (!task || !meta || task.complete) return;

  // One marker, never two. Until the unit is worked the mark sits on the next
  // thing to press; once it has been pressed the mark moves to whatever that
  // press was short of — the tool locker, or the bay that makes the reserve.
  if (state.markPhase === 'source') {
    const toolKey = ROOM_TOOL[roomId];
    const flow = RESOURCE_FLOW[roomId];
    let point = null;

    if (toolKey && !hasTool(toolKey)) {
      const storeRoom = TOOL_META[toolKey].store;
      const anchor = STORE_ANCHORS[storeRoom];
      if (anchor) point = { ...anchor, label: `TOOL · ${TOOL_META[toolKey].label}` };
    } else if (flow) {
      const cost = RESOURCE_META[flow.cost];
      const anchor = cost && ROOM_POINTER_ANCHORS[cost.room];
      if (anchor) point = { ...anchor, label: `${cost.short} · ${ROOM_META[cost.room].short}` };
    }

    const entry = waypointEls.get('reserve');
    if (point && entry) {
      entry.el.classList.add('next');
      drawWaypoint(entry, point, cameraPos, width, height, false);
    }
    return;
  }

  if (typeof task.getTargets === 'function') {
    const pending = task.getTargets().filter((target) => target.active);
    if (pending.length) {
      const nearest = pending.reduce((best, target) => {
        const distance = cameraPos.distanceTo(new THREE.Vector3(target.x, target.y, target.z));
        return !best || distance < best.distance ? { target, distance } : best;
      }, null);

      const entry = waypointEls.get(`${roomId}:${nearest.target.index}`);
      if (entry) {
        entry.el.classList.add('next');
        drawWaypoint(
          entry,
          { ...nearest.target, label: `${meta.short} · ${nearest.target.unit ?? nearest.target.label}` },
          cameraPos,
          width,
          height,
          false,
        );
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// loop
// ─────────────────────────────────────────────────────────────

const clock = new THREE.Clock();

function animate() {
  window.requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  if (!state.started) {
    // slow, uneasy drift behind the title screen
    camera.position.set(Math.sin(time * 0.12) * 0.5, 1.66, 3.0 + Math.sin(time * 0.09) * 0.4);
    camera.rotation.set(0.015 * Math.sin(time * 0.2), Math.sin(time * 0.07) * 0.22, 0);
  } else {
    updatePlayer(dt, time);
    updateShiftTimer(dt);
    updateEscape(dt);
    updateMonster(dt);
    updateCorridors(dt);
    updateScurry(dt);
    updateVentHazard(dt);

    // The hover raycast is the most expensive per-frame query; 16 Hz is
    // indistinguishable from every frame when the camera moves this slowly.
    interactTimer -= dt;
    if (interactTimer <= 0) {
      interactTimer = 0.06;
      updateInteraction();
    }

    updateWaypoints(dt);
    world.setAmbience(Math.max(0.12, state.life / 100));
  }

  adaptQuality();

  world.update(dt, camera);
  updatePod(time);
  updateAmbient(dt);

  renderer.render(scene, camera);
}

function applyPixelRatio() {
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  applyPixelRatio();
});

// Resolution scaling: if the scene cannot hold ~50 fps the internal buffer
// shrinks in steps, and it climbs back once there is headroom again.
let qualityFrames = 0;
let qualityWindowStart = performance.now();
let qualityCooldownUntil = 0;

function adaptQuality() {
  if (!state.started || state.phase !== 'day' || state.uiBlocking || isPaused()) {
    qualityFrames = 0;
    qualityWindowStart = performance.now();
    return;
  }

  // Wall-clock timing, not the clamped frame delta, so a machine running
  // at 10 fps still reacts within a second or two.
  qualityFrames += 1;
  const now = performance.now();
  const elapsed = (now - qualityWindowStart) / 1000;
  if (elapsed < 1.2) return;

  const fps = qualityFrames / elapsed;
  qualityFrames = 0;
  qualityWindowStart = now;

  if (now < qualityCooldownUntil) return;

  if (fps < 50 && pixelRatio > MIN_PIXEL_RATIO + 0.01) {
    pixelRatio = Math.max(MIN_PIXEL_RATIO, Number((pixelRatio - 0.15).toFixed(2)));
    applyPixelRatio();
    qualityCooldownUntil = now + 1200;
  } else if (fps > 58 && pixelRatio < MAX_PIXEL_RATIO - 0.01) {
    pixelRatio = Math.min(MAX_PIXEL_RATIO, Number((pixelRatio + 0.1).toFixed(2)));
    applyPixelRatio();
    qualityCooldownUntil = now + 3000;
  }
}

// ─────────────────────────────────────────────────────────────
// boot
// ─────────────────────────────────────────────────────────────

setLife(100);
setVitalsUI();
setResourcesUI();
refreshToolsUI();
updateTimerUI();
refreshHydroLabel();
world.setCracks([]);
world.setPatches([]);
world.setDread(100);
refreshTasks();
respawnPlayer();
configureStartScreen();
animate();
