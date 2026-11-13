// cam's notifications: a floating stack at the bottom right of the layout, in cam's look.
// Herdr opens mods/toast for every notification; cam's version (toast.js) hands it over
// in shared "cam.toasts" and closes, so the size and spacing here are cam's, not Herdr's.
// Click one to run its action (go to the agent); × or the timeout dismisses it.
import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { shared, setShared, run, agents } from "herdr";
import { ICON, INSET, GAP, row, colors } from "./modules/ui/index.js";

/** A notification cam keeps (shared "cam.toasts", written by toast.js).
 * @typedef {{ id: string, at: number, title: string, body: string | null, level: string, icon: string | null,
 *   action: import("./shared.js").Command | null, timeout: number | null }} Note */

const KEY = "cam.toasts";
const LIFE = 6000;
// The title line's height; the icon box matches it.
const TITLE_H = 18;
// An icon per kind, drawn in the text color.
/** @type {Record<string, string>} */
const KIND = { success: "circle-check", error: "square-pen", warning: "clock", info: "terminal" };

// Herdr writes an agent's toast body as "<tab name> / <title>", each cut short. A tab named
// after its agent's title then shows the same text twice, once cut with "…" and once
// mid-word. Join two parts, keeping only the longer when one starts the other.
/** @param {string} a @param {string} b */
const join = (a, b) => {
  const x = a.replace(/…$/, "").trim(), y = b.replace(/…$/, "").trim();
  if (!x) return b;
  if (!y) return a;
  if (x.startsWith(y) || y.startsWith(x)) return x.length >= y.length ? a : b;
  return `${a} / ${b}`;
};
// The detail line: the agent's live, uncut tab name and title when the toast points at one,
// else Herdr's body with the repeat taken out.
/** @param {Note} n */
const detail = n => {
  const args = /** @type {Record<string, unknown>} */ (n.action?.args ?? {});
  const addr = args.terminal ?? args.address;
  const a = addr ? agents().find(a => a.address === addr) : null;
  if (a) return join(a.tab_name, a.title);
  const parts = n.body?.split(" / ") ?? [];
  return parts.length === 2 ? join(parts[0], parts[1]) : n.body;
};

const list = () => /** @type {Note[]} */ (shared(KEY)) ?? [];
/** @param {string} id */
const drop = id => setShared(KEY, list().filter(n => n.id !== id));

export class Toasts extends View {
  /** @param {import("./shared.js").CamProps} _props @param {import("./shared.js").AsyncCx} cx */
  init(_props, cx) {
    // Herdr starts a floating block's copy only once it shows, and one that draws
    // nothing never shows: draw a dot until started, then nothing while empty.
    cx.timer.after(50, (cx) => { this.started = true; cx.notify(); });
    // Timeouts: data, checked once a second (a no-op while empty). Pruned at start too,
    // so toasts saved before a restart don't flash back.
    const prune = () => {
      const now = Date.now(), all = list();
      const live = all.filter(n => now - n.at < (n.timeout ?? LIFE));
      if (live.length !== all.length) setShared(KEY, live);
    };
    prune();
    cx.timer.every(1000, prune);
  }

  // One row like the menus': an icon (the program's, else one for the kind, in the muted
  // text color, no colored dots), the title, the detail as a dim line under it, and ×.
  /** @param {import("./shared.js").Theme} t @param {Note} n */
  item(t, n) {
    const body = detail(n);
    const icon = n.icon
      ? image(n.icon).size(ICON)
      : svg(`mods/workspace-chrome/${KIND[n.level] ?? "terminal"}.svg`).size(ICON).text_color(t.muted);
    // A row like the menus', taller when the detail sits under the title.
    return row(t, `toast-${n.id}`).w(320).when(Boolean(body), el => el.h_auto().py(6).items_start())
      .on_click(() => { drop(n.id); if (n.action?.name) run(n.action.name, n.action.args ?? {}); })
      // As tall as the title line, so the icon centers on the title, not the whole toast.
      .child(h_flex().w(ICON).h(TITLE_H).flex_none().items_center().justify_center().child(icon))
      // The detail goes under the title, wrapped, so neither is cut off.
      .child(v_flex().flex_1().min_w(0)
        .child(h_flex().h(TITLE_H).items_center().child(div().truncate().child(n.title)))
        .when(Boolean(body), el => el.child(div().text_size(11.5).text_color(t.dim).child(body ?? ""))))
      .child(h_flex().h(TITLE_H).flex_none().items_center()
        .child(div().id(`toastx-${n.id}`).size(16).flex_none().flex().items_center().justify_center().rounded(4)
          .text_color(t.dim).hover(s => s.bg(t.raised).text_color(t.foreground))
          .on_click((_e, cx) => { cx.stop_propagation(); drop(n.id); })
          .child(svg("mods/pane/close.svg").size(10))));
  }

  render() {
    const t = colors();
    const all = list();
    // Nothing to show: nothing drawn, and Herdr hides the floating block.
    if (!all.length) return this.started ? div() : div().size(1);
    return v_flex().px(INSET).gap(GAP).text_size(13).children(all.map(n => this.item(t, n)));
  }
}
