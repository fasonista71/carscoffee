/*
  The arcade top five: three characters and a distance.

  The store is deliberately an interface rather than localStorage
  calls written inline. Local play keeps the board on the device; a
  shared board later swaps in a network store whose load and save
  return promises, and nothing outside this file changes. Both store
  methods are async for exactly that reason, while entries() stays
  synchronous, so drawing a frame never waits on IO.
*/

export const BOARD_SIZE = 5;
export const NAME_LENGTH = 3;

/* The font only has A to Z and digits, so the board only takes those. */
export function cleanName(raw) {
  const up = String(raw == null ? '' : raw).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (up.slice(0, NAME_LENGTH) || 'AAA').padEnd(NAME_LENGTH, 'A');
}

export function localStore(key) {
  return {
    load() {
      try {
        const raw = localStorage.getItem(key);
        return Promise.resolve(raw ? JSON.parse(raw) : []);
      } catch (e) {
        /* private mode, blocked storage, or corrupt json: start empty */
        return Promise.resolve([]);
      }
    },
    save(entries) {
      try {
        localStorage.setItem(key, JSON.stringify(entries));
      } catch (e) { /* nothing to do; the run still counted on screen */ }
      return Promise.resolve();
    }
  };
}

/* Anything read back from storage is untrusted: a hand edited entry
   must not be able to break a render. */
function sanitize(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (let i = 0; i < list.length; i += 1) {
    const e = list[i];
    if (!e || typeof e !== 'object') continue;
    const meters = Math.floor(Number(e.meters));
    if (!Number.isFinite(meters) || meters < 0) continue;
    out.push({ name: cleanName(e.name), meters, vehicle: typeof e.vehicle === 'string' ? e.vehicle : '' });
  }
  out.sort((a, b) => b.meters - a.meters);
  return out.slice(0, BOARD_SIZE);
}

export function createLeaderboard(store) {
  let entries = [];
  return {
    load() {
      return store.load().then((list) => {
        entries = sanitize(list);
        return entries;
      });
    },
    entries() {
      return entries;
    },
    /* A run earns a place by beating the last row, or by there being
       a free row at all. Zero never qualifies. */
    qualifies(meters) {
      if (!Number.isFinite(meters) || meters <= 0) return false;
      if (entries.length < BOARD_SIZE) return true;
      return meters > entries[entries.length - 1].meters;
    },
    submit(name, meters, vehicle) {
      entries = sanitize(entries.concat([{ name: cleanName(name), meters, vehicle }]));
      return store.save(entries).then(() => entries);
    }
  };
}
