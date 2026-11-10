// ─────────────────────────────────────────────────────────────
// Run persistence. Kept deliberately small and defensive:
// malformed or half-written saves are discarded rather than
// restored into a broken shift.
// ─────────────────────────────────────────────────────────────

const KEY = 'voidshift.save.v1';
const VERSION = 1;
const ROOM_IDS = ['reactor', 'med', 'nav'];

export function readSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (!data || data.v !== VERSION) return null;

    const day = Number(data.day);
    const life = Number(data.life);
    if (!Number.isInteger(day) || day < 1) return null;
    if (!Number.isFinite(life) || life <= 0 || life > 100) return null;
    if (!data.tasks || typeof data.tasks !== 'object') return null;

    for (const roomId of ROOM_IDS) {
      const snapshot = data.tasks[roomId];
      if (!snapshot || typeof snapshot !== 'object' || typeof snapshot.defId !== 'string') return null;
    }

    const number = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback);
    const energy = Math.min(100, Math.max(0, number(data.energy, 100)));
    const hunger = Math.min(100, Math.max(0, number(data.hunger, 100)));
    const timeLeft = Math.min(240, Math.max(0, number(data.timeLeft, 240)));

    // Reserves are optional so older saves keep working.
    const resources = {};
    if (data.resources && typeof data.resources === 'object') {
      for (const key of ['power', 'biomass', 'data']) {
        const value = Number(data.resources[key]);
        if (Number.isFinite(value)) resources[key] = Math.min(999, Math.max(0, Math.round(value)));
      }
    }

    return {
      ...data,
      day,
      life,
      energy,
      hunger,
      timeLeft,
      resources,
      harvestedToday: data.harvestedToday === true,
    };
  } catch (_) {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...data, v: VERSION }));
    return true;
  } catch (_) {
    // Private mode, blocked storage or quota: the game remains playable.
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch (_) {
    /* nothing to do */
  }
}
