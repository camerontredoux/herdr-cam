// Harbor's state and the model the views draw from. Clicks only ever change the shared
// keys below (mock: nothing leaves this mod); every view re-renders from them.
import { shared, setShared, notify } from "herdr";
import { STATIONS, VOYAGES, MANIFEST, TRACES, NOW } from "./data.js";

// Shared keys: every Harbor copy (and any other mod) sees them.
const K = {
  sel: "harbor.sel",             // { voyage, station } the Log shows
  card: "harbor.card",           // the Manifest card selected
  chartered: "harbor.chartered", // card ids made into voyages
  dismissed: "harbor.dismissed", // card ids dismissed
  resolved: "harbor.resolved",   // { voyageId: choice } decisions answered inline
};
/** @param {string} k @param {any} fallback */
const get = (k, fallback) => shared(k) ?? fallback;

// ---- Clock: minutes since midnight.
/** @param {string} hm "HH:MM" or "HH:MM:SS" */
export const toMin = (hm) => { const [h, m, s = 0] = hm.split(":").map(Number); return h * 60 + m + s / 60; };
/** @param {number} min */
export const clock = (min) => {
  const h = Math.floor(min / 60), m = Math.floor(min % 60);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")}`;
};
/** A duration in seconds, short: "42s", "3m 28s", "1h 10m". @param {number} s */
export const dur = (s) => s < 1 ? `${Math.round(s * 10) / 10}s` : s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m${s % 60 >= 1 ? ` ${Math.round(s % 60)}s` : ""}` : `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
/** Minutes, short: "14m", "2h 5m". @param {number} m */
export const ago = (m) => m < 60 ? `${Math.max(1, Math.round(m))}m` : `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
/** @param {number} n */
export const tokens = (n) => n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
/** @param {number} n */
export const money = (n) => `$${n < 0.1 ? n.toFixed(3) : n.toFixed(2)}`;

export const END = toMin(NOW);

// ---- Reading and writing the shared keys.
/** The minute the views show: always now (the mock's NOW). */
export const time = () => END;

/** @returns {{ voyage: string, station: string | null }} */
export const selection = () => get(K.sel, { voyage: VOYAGES[0].id, station: null });
/** @param {string} voyage @param {string | null} [station] */
export const select = (voyage, station = null) => setShared(K.sel, { voyage, station });

export const selectedCard = () => /** @type {string | null} */ (get(K.card, null));
/** @param {string | null} id */
export const selectCard = (id) => setShared(K.card, id);

// The Manifest: cards neither chartered nor dismissed.
export const manifest = () => {
  const gone = new Set([...get(K.chartered, []), ...get(K.dismissed, [])]);
  return MANIFEST.filter((m) => !gone.has(m.id));
};

/** Charter a card: it leaves the Manifest and becomes a voyage at Request. @param {string} id */
export function charter(id) {
  const card = MANIFEST.find((m) => m.id === id);
  if (!card) return;
  setShared(K.chartered, [...get(K.chartered, []), id]);
  select(`v-${id}`, "Request");
  nextCard(id);
  notify({ title: "Chartered", body: `${card.title} is on the Chart at Request (mock).`, level: "success", timeout: 3000 });
}
/** @param {string} id */
export function dismiss(id) {
  const card = MANIFEST.find((m) => m.id === id);
  setShared(K.dismissed, [...get(K.dismissed, []), id]);
  nextCard(id);
  notify({ title: "Dismissed", body: card?.title ?? id, level: "info", timeout: 2500 });
}
// Moves the Manifest selection to the card after `id` (or before it, at the end).
/** @param {string} id */
function nextCard(id) {
  const list = manifest(), i = list.findIndex((m) => m.id === id);
  const rest = list.filter((m) => m.id !== id);
  selectCard(rest[Math.min(Math.max(i, 0), rest.length - 1)]?.id ?? null);
}

/** Answer a needs-decision station inline (mock). @param {string} voyage @param {string} choice */
export function resolve(voyage, choice) {
  setShared(K.resolved, { ...get(K.resolved, {}), [voyage]: choice });
  notify({ title: "Decision sent", body: `“${choice}” (mock: the crewmate would pick this up).`, level: "success", timeout: 3000 });
}

// Puts every key back as data.js left it.
export function reset() {
  for (const k of Object.values(K)) setShared(k, null);
}

// ---- The model at a minute (the views always ask for now).
/** @typedef {{ name: string, from: string, to: string | null, start: string, end: string | null }} Fork */
/** @typedef {{ id: string, title: string, client: string, issue: number | null, branch: string, crewmate: string,
 *   station: number, status: string, since: number, forks: (Fork & { running: boolean })[], weather: any[],
 *   files: string[], decision?: any, visited: Record<number, number> }} Voyage */

// Voyages as they were at minute `at` (default: now). A voyage not yet
// chartered then isn't there.
/** @param {number} [at] @returns {Voyage[]} */
export function voyages(at = time()) {
  const resolved = get(K.resolved, {});
  const chartered = /** @type {string[]} */ (get(K.chartered, []));
  const extra = chartered.map((id) => {
    const m = MANIFEST.find((x) => x.id === id);
    return m && { id: `v-${id}`, title: m.title, client: m.client, issue: m.match?.issue ?? null, branch: `fm-${id.slice(2)}`,
      crewmate: "new", history: [[NOW, "Request"]], forks: [], weather: [], files: [] };
  }).filter(Boolean);
  /** @type {Voyage[]} */
  const out = [];
  for (const v of [...extra, ...VOYAGES]) {
    const seen = v.history.filter(([t]) => toMin(t) <= at);
    if (!seen.length) continue;
    const [t, station, status = "working"] = seen[seen.length - 1];
    /** @type {Record<number, number>} */
    const visited = {};
    for (const [ht, hs] of seen) visited[STATIONS.findIndex((s) => s.key === hs)] ??= toMin(ht);
    const answered = status === "decision" && resolved[v.id] && at >= END - 0.5;
    out.push({
      ...v,
      station: STATIONS.findIndex((s) => s.key === station),
      status: answered ? "working" : status,
      since: toMin(t),
      visited,
      forks: (v.forks ?? []).filter((f) => toMin(f.start) <= at).map((f) => ({ ...f, running: !f.end || toMin(f.end) > at })),
      weather: (v.weather ?? []).filter((w) => toMin(w.since) <= at),
    });
  }
  return out;
}

// A voyage's trace up to minute `at`: turns and calls that had started by then.
/** @param {string} id @param {number} [at] */
export function trace(id, at = time()) {
  return (TRACES[id] ?? [])
    .filter((turn) => toMin(turn.at) <= at)
    .map((turn) => ({ ...turn, calls: turn.calls.filter((c) => toMin(c.at) <= at) }));
}
