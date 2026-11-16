// Server usage (role "sysmon", cmd+h): RAM, swap and CPU per thread on one machine,
// in the palette's look: dim section titles, tile rows, value chips. Esc closes it.
// Off until data/cam/sysmon.json (in Herdr's folder) names what to run:
//   { "machine": "my-server", "sysmon": "/path/to/sysmon", "muse": "/path/to/muse-usage" }
// `machine` is a herdr-core machine name (absent: this computer). It runs `<sysmon> --json`
// there every 2 s. With `muse`, a Muse row at the bottom shows `<muse>`'s spend and tokens
// every 10 s (Meta's API has no usage endpoint; that script adds up the plugin's stats files).
// Both programs print JSON in the shapes of Sample and Muse below.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, props, closeOverlay, appHome, readTextFile } from "herdr";
import { TILE, INSET, GAP, RADIUS, heading, panel, spinner, colors, mono } from "./modules/ui/index.js";

/** @typedef {import("./modules/ui/index.js").Theme} Theme */
/** @typedef {import("./modules/ui/index.js").El} El */
/** @typedef {{ host: string, mem: { total: number, used: number, available: number, cache: number, swap_total: number, swap_used: number },
 *   cpu: { percent: number, cores: number[], load: number[] }, threads: { total: number, running: number } }} Sample */
/** @typedef {{ in: number, cacheRead: number, out: number, cost: number, calls: number }} Muse */

/** @typedef {{ machine: string | null, sysmon: string, muse: string | null }} Config */

const EVERY = 2000;
const MUSE_EVERY = 10000;

/** data/cam/sysmon.json, or null when it's absent or names no `sysmon` (the monitor is off).
 *  @returns {Promise<Config | null>} */
export async function sysmonConfig() {
  try {
    const c = JSON.parse((await readTextFile(`${appHome()}/data/cam/sysmon.json`)) ?? "null");
    if (typeof c?.sysmon !== "string" || !c.sysmon) return null;
    const str = (/** @type {unknown} */ v) => (typeof v === "string" && v ? v : null);
    return { machine: str(c.machine), sysmon: c.sysmon, muse: str(c.muse) };
  } catch { return null; }
}
// CPU threads per row of the grid.
const COLS = 4;
const LABEL_W = 64;
// Ticks in a meter: the big rows', and each CPU thread's in the grid.
const TICKS = 38;
const CORE_TICKS = 11;

/** @param {number} n */
const human = (n) => {
  const u = ["B", "K", "M", "G", "T"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return i >= 3 ? `${n.toFixed(1)}${u[i]}` : `${Math.round(n)}${u[i]}`;
};
/** @param {Theme} t @param {number} pct */
// Calm to alarming, in the theme's terminal colors: cyan, green, yellow, orange, red.
const STOPS = /** @type {const} */ ([[30, "ansi6"], [60, "ansi2"], [75, "ansi11"], [90, "ansi3"], [Infinity, "ansi1"]]);
const level = (t, pct) => t[(STOPS.find(([top]) => pct < top) ?? STOPS[STOPS.length - 1])[1]];
// A value set like the palette's key chips.
/** @param {Theme} t @param {string} text */
const chip = (t, text) => div().flex_none().px(4).rounded(4).bg(t.raised).text_size(11).text_color(t.dim).font_family(mono()).child(text);
// Used out of total in one chip: "9.5G / 30.3G", the used part brighter.
/** @param {Theme} t @param {string} used @param {string} total */
const ratio = (t, used, total) => h_flex().flex_none().px(4).gap(4).rounded(4).bg(t.raised).text_size(11).font_family(mono())
  .child(div().text_color(t.foreground).child(used)).child(div().text_color(t.dim).child(`/ ${total}`));
// A value and what it counts in one chip: "2.09M in", the value brighter.
/** @param {Theme} t @param {string} value @param {string} label */
const stat = (t, value, label) => h_flex().flex_none().px(4).gap(4).rounded(4).bg(t.raised).text_size(11).font_family(mono())
  .child(div().text_color(t.foreground).child(value)).child(div().text_color(t.dim).child(label));
// Token counts: 812, 704K, 2.09M.
/** @param {number} n */
const count = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n));
// An htop-style meter: `[||||||    ]`, drawn, not typed, so the brackets are as tall as
// the ticks (in a font, `|` outgrows `[`). Each tick takes the color of its own place
// (cyan at the left, red at the right), so a low bar stays calm; empty ticks are the track.
// With `fill`, the meter takes the width it is given and spreads its ticks across it.
/** @param {Theme} t @param {string} id @param {number} pct @param {number} ticks @param {number} h @param {number} gap @param {boolean} [fill] */
const meter = (t, id, pct, ticks, h, gap, fill = false) => {
  const filled = Math.round((ticks * Math.min(100, Math.max(0, pct))) / 100);
  /** @param {"l" | "r"} side */
  const bracket = (side) => div().w(3).h(h + 2).flex_none().border_t(1).border_b(1).border_color(t.dim)
    .when(side === "l", el => el.border_l(1).mr(gap)).when(side === "r", el => el.border_r(1).ml(gap));
  const marks = Array.from({ length: ticks }, (_, i) =>
    div().w(2).h(h).flex_none().bg(i < filled ? level(t, (100 * (i + 1)) / ticks) : t.border));
  return h_flex().id(id).items_center().gap(gap).when(fill, el => el.flex_1().min_w(0)).when(!fill, el => el.flex_none())
    .child(bracket("l"))
    .when(fill, el => el.child(h_flex().flex_1().min_w(0).items_center().justify_between().children(marks)))
    .when(!fill, el => el.children(marks))
    .child(bracket("r"));
};
// A row the size of the palette's, for reading, not clicking.
/** @param {Theme} t @param {string} id @param {string} label */
const line = (t, id, label) => h_flex().id(id).h(TILE).flex_none().px(10 - INSET).gap(8).items_center().rounded(RADIUS)
  .child(div().w(LABEL_W).flex_none().text_color(t.muted).child(label));

/** @param {number} cores */
const height = (cores) => {
  const gridRows = Math.max(1, Math.ceil(cores / COLS));
  // 3 titles, 6 rows, 8 of space, the grid and its bottom pad; GAP between each of the 10.
  return 2 * INSET + 8 + GAP + 3 * TILE + 6 * TILE + gridRows * TILE + (gridRows - 1) * GAP + 9 * GAP;
};
/** @type {import("herdr").OverlaySpec} */
export const SYSMON = { kind: "dialog", width: 560, height: height(24) };

export class Sysmon extends View {
  /** @param {unknown} _props @param {import("./shared.js").AsyncCx} cx */
  init(_props, cx) {
    /** @type {Sample | null} */
    this.data = null;
    /** @type {string | null} */
    this.error = null;
    this.busy = false;
    /** @type {Muse | null} */
    this.muse = null;
    this.museBusy = false;
    // Only as the dialog: `herdr-app check` renders every part without one, and focus,
    // polling or an endless spinner there runs its render budget out (render draws nothing).
    this.live = Boolean(props()?.overlay);
    /** @type {Config | null} */
    this.config = null;
    if (!this.live) return;
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.spawn(async (cx) => {
      this.config = await sysmonConfig();
      if (!this.config) { this.error = "No data/cam/sysmon.json: see the top of mods/cam/sysmon.js"; cx.notify(); return; }
      this.poll(cx);
      cx.timer.every(EVERY, (cx) => this.poll(cx));
      if (!this.config.muse) return;
      this.pollMuse(cx);
      cx.timer.every(MUSE_EVERY, (cx) => this.pollMuse(cx));
    });
  }

  // A failed read keeps the last numbers; with none yet, the row says "unavailable".
  /** @param {import("./shared.js").AsyncCx} cx */
  pollMuse(cx) {
    const c = this.config;
    if (this.museBusy || !c?.muse) return;
    this.museBusy = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec(c.muse, [], { on: c.machine, timeout: 10000 });
        if (r.code === 0) this.muse = JSON.parse(r.stdout);
      } catch { /* keep the last numbers */ }
      this.museBusy = false;
      cx.notify();
    });
  }

  /** @param {import("./shared.js").AsyncCx} cx */
  poll(cx) {
    const c = this.config;
    if (this.busy || !c) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec(c.sysmon, ["--json"], { on: c.machine, timeout: 10000 });
        if (r.code === 0) { this.data = JSON.parse(r.stdout); this.error = null; }
        else this.error = (r.stderr || r.stdout || `exit ${r.code}`).trim();
      } catch (e) {
        this.error = String(/** @type {Error} */ (e)?.message ?? e);
      }
      this.busy = false;
      cx.notify();
    });
  }

  render() {
    // Outside the dialog (`herdr-app check`), nothing: the check's budget is shared.
    if (!this.live) return div().id("sysmon");
    const t = colors();
    const d = this.data;
    const root = panel(t, "sysmon").size_full()
      .track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(props()?.overlay); cx.stop_propagation(); } });
    // Before the first numbers: cam's spinner in the middle (or why it failed).
    if (!d) return root.child(v_flex().id("sysmon-wait").flex_1().min_h(0).gap(8).items_center().justify_center().px(16)
      .when(!this.error, el => el.child(spinner(t.dim, 16)))
      .child(div().text_size(11.5).text_color(this.error ? t.blocked : t.dim).child(this.error ?? `Reading ${this.config?.machine ?? "this computer"}…`)));
    const m = d.mem, c = d.cpu;
    const memPct = (100 * m.used) / m.total;
    const swapPct = m.swap_total ? (100 * m.swap_used) / m.swap_total : 0;
    /** @param {string} id @param {string} label @param {number} pct @param {El} value */
    const usage = (id, label, pct, value) => line(t, id, label)
      .child(meter(t, `${id}-meter`, pct, TICKS, 12, 4))
      .child(div().w(44).flex_none().text_size(12).font_family(mono()).text_color(level(t, pct)).child(`${pct.toFixed(0)}%`))
      .child(div().flex_1())
      .child(value);
    /** @type {[number, number][][]} */
    const rows = [];
    for (let i = 0; i < c.cores.length; i += COLS) rows.push(c.cores.slice(i, i + COLS).map((p, j) => [i + j, p]));
    return root
      // A failed refresh keeps the last numbers and says so beside the first title.
      .child(heading(t, "Memory").when(Boolean(this.error), el => el.child(div().flex_1()).child(div().text_color(t.blocked).child("stale"))))
      .child(usage("sysmon-ram", "RAM", memPct, ratio(t, human(m.used), human(m.total))))
      .child(usage("sysmon-swap", "Swap", swapPct, ratio(t, human(m.swap_used), human(m.swap_total))))
      .child(heading(t, "CPU"))
      .child(usage("sysmon-cpu", "Usage", c.percent, chip(t, `${c.cores.length} threads`)))
      .child(line(t, "sysmon-load", "Load").child(div().flex_1()).child(h_flex().gap(2).children(c.load.map(x => chip(t, x.toFixed(2))))))
      .child(line(t, "sysmon-threads", "Threads").child(div().flex_1())
        .child(h_flex().gap(2).child(chip(t, `${d.threads.total} total`)).child(chip(t, `${d.threads.running} running`))))
      .child(v_flex().id("sysmon-grid").flex_1().mt(8).pb(GAP).min_h(0).gap(GAP).overflow_y_scrollbar()
        .children(rows.map((r, n) => h_flex().id(`sysmon-grid-${n}`).h(TILE).flex_none().px(10 - INSET).gap(12).items_center()
          .children(r.map(([i, p]) => h_flex().id(`sysmon-core-${i}`).flex_1().gap(4).items_center().font_family(mono()).text_size(11.5)
            .child(div().w(16).flex_none().text_color(t.dim).child(String(i)))
            .child(meter(t, `sysmon-core-meter-${i}`, p, CORE_TICKS, 11, 3, true))
            .child(h_flex().w(28).flex_none().justify_end().text_color(t.muted).child(`${Math.round(p)}%`)))))))
      .when(Boolean(this.config?.muse), el => el.child(heading(t, "Muse"))
        .child(line(t, "sysmon-muse", "Usage").child(div().flex_1()).child(this.muse
          ? h_flex().gap(2)
            .child(stat(t, `$${this.muse.cost.toFixed(2)}`, "spend"))
            .child(stat(t, count(this.muse.in), "in"))
            .child(stat(t, count(this.muse.cacheRead), "cache read"))
            .child(stat(t, count(this.muse.out), "out"))
          : chip(t, "unavailable"))));
  }
}
