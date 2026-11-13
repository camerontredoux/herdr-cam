// Harbor: client requests as voyages on a live map, in a side panel beside Files and
// Changes (layouts/cam.json's "panel-body" stack; the tab bar's Harbor button opens it).
// A cam module: cam's "harbor" role (mods/cam/main.js). It imports only ../ui and Herdr's
// own modules, never cam's parts or another module (mods/cam/check-boundaries.sh).
// UI mockup only: everything comes from data.js, and clicks change shared state
// (state.js) and post toasts. Nothing is fetched or run.
//
// Three views in one panel, picked in the header:
//   Manifest  incoming requests (manifest.js)
//   Chart     the voyages on their line (chart.js); a station opens its Log
//   Log       the selected voyage's trace (log.js)
// Two fixed widths, switched by the header's expand button: the Log's (LOG_W), one view at
// a time; or expanded, the Chart (CHART_W) with its Log beside it. Harbor's width is its
// own, not the panel's: cam sizes the panel to Harbor.width() and keeps its grip still.
import { View, div, svg } from "gpui-kit";
import { props, shared, setShared } from "herdr";
import { h_flex, v_flex } from "gpui-base";
import { colors, alpha, TEXT, ICONS } from "./theme.js";
import { TILE, ICON, bar, barButton, segments, segment } from "../ui/index.js";
import { manifest, voyages, selection, select, charter, dismiss, resolve } from "./state.js";
import { renderManifest, manifestKeys } from "./manifest.js";
export { ManifestConfirm, CONFIRM_SIZE } from "./manifest.js";
import { renderChart } from "./chart.js";
import { renderLog } from "./log.js";

/** @typedef {import("./theme.js").Theme} Theme */

// The Log's width, beside the Chart or on its own. Beside the Chart its column is 1px
// wider for the divider on its left, so the Log itself is LOG_W either way.
export const LOG_W = 360;
const LOG_COL = LOG_W + 1;
// The Chart's width beside the Log.
const CHART_W = 360;
// Expanded or not: shared state, not localStorage, which is each block's own. cam's tab bar
// reads it too, to size the panel.
const EXPANDED = "harbor.expanded";
export class Harbor extends View {
  // Sizes the panel to Harbor.width(). The layout is cam's, so cam's main.js sets this;
  // without it the header has no expand button.
  /** @type {(() => void) | null} */
  static fit = null;
  // Opens the confirm for a Manifest card's Charter or Dismiss (ManifestConfirm). The dialog
  // is a cam overlay, so cam's main.js sets this; without it they act at once.
  /** @type {((ask: { action: "charter" | "dismiss" | "decide", id: string, choice?: string }) => void) | null} */
  static confirm = null;

  static expanded() { return shared(EXPANDED) === true; }
  // Harbor's width, inside the panel card's border.
  static width() { return Harbor.expanded() ? CHART_W + LOG_COL : LOG_W; }

  /** @param {any} _props @param {any} cx */
  init(_props, cx) {
    /** @type {"manifest" | "chart" | "log"} */
    // A block or pane can pick the first view with props {view}; else the last one shown.
    // Props {voyage, station} select one, as a click on the Chart would.
    const p = props();
    this.view = p?.view ?? /** @type {any} */ (localStorage.getItem("harbor.view")) ?? "chart";
    if (p?.voyage) select(p.voyage, p.station ?? null);
    this.handle = cx.focus_handle();
    // The Log's open rows and folded turns; reset when the selection moves.
    /** @type {Set<string>} */
    this.open = new Set();
    /** @type {Set<string>} */
    this.folded = new Set();
    this.selKey = "";
    this.hot = null;
    // Props {open: ["turn.call", ...]} start those Log rows open (for screenshots).
    if (p?.open) { const sel = selection(); this.selKey = `${sel.voyage}|${sel.station}`; for (const k of p.open) this.open.add(k); }
  }

  // A decision's answer asks too: id is the voyage, choice the answer.
  /** @param {"charter" | "dismiss" | "decide"} action @param {string} id @param {string} [choice] */
  ask(action, id, choice) {
    if (Harbor.confirm) Harbor.confirm({ action, id, choice });
    else if (action === "decide") resolve(id, choice ?? "");
    else (action === "charter" ? charter : dismiss)(id);
  }

  /** @param {"manifest" | "chart" | "log"} v */
  show(v) {
    this.view = v;
    localStorage.setItem("harbor.view", v);
  }

  // Wide: expanded, the Chart with its Log beside it. Every width below comes from these
  // constants, not a measurement, so a click draws the new layout at once; the panel
  // catches up a frame later (Harbor clips or leaves blank space for that frame).
  get wide() { return Harbor.expanded(); }
  get logWidth() { return LOG_W; }
  get chartWidth() { return this.wide ? CHART_W : LOG_W; }

  // The header: the expand button, then the view switcher, in a header bar.
  /** @param {Theme} t */
  header(t) {
    const nCards = manifest().length;
    const vs = voyages();
    const needs = vs.filter((v) => v.status === "blocked" || v.status === "decision").length;
    /** @param {"manifest" | "chart" | "log"} id @param {string} label @param {number} [count] @param {boolean} [alert] */
    const seg = (id, label, count, alert) => {
      const on = this.view === id || (this.wide && id === "chart" && this.view === "log");
      return segment(t, `seg-${id}`, on, label,
        ...(count ? [div().text_size(10.5).font_semibold().text_color(alert ? t.blocked : t.dim).child(String(count))] : []))
        .on_mouse_down("left", (_e, cx) => { this.show(id); cx.notify(); });
    };
    // A header bar, like the tab bar beside it: the expand button where a tile sits, and the
    // views as a tab group. Expanded is wide: the Chart with its Log beside it.
    const fit = Harbor.fit;
    return bar(t, "below")
      .when(fit !== null, (el) => el.child(barButton(t, "harbor-expand")
        .child(svg(this.wide ? ICONS.shrink : ICONS.expand).size(ICON).flex_none())
        .tooltip(this.wide ? "Show the Log only" : "Show the Chart and Log side by side")
        // Both ways land on the Log: beside the Chart, or on its own (the Manifest stays put
        // when shrinking).
        .on_click((_e, cx) => {
          if (!this.wide || this.view !== "manifest") this.show("log");
          setShared(EXPANDED, !this.wide);
          fit?.();
          cx.notify();
        })))
      .child(div().flex_1())
      .child(segments(t)
        .child(seg("manifest", "Manifest", nCards))
        .child(seg("chart", "Chart", needs, true))
        .when(!this.wide, (el) => el.child(seg("log", "Log"))));
  }

  /** @param {any} cx */
  render(cx) {
    const t = colors();
    // The Log follows the selection: open rows and folds start over when it moves.
    const sel = selection(), key = `${sel.voyage}|${sel.station}`;
    if (key !== this.selKey) { this.selKey = key; this.open.clear(); this.folded.clear(); }

    let body;
    if (this.view === "manifest") body = renderManifest(this, t);
    // The Log keeps its place when the panel widens or narrows: the panel takes its new
    // width a frame after Harbor draws for it. The Log is pinned to the right at the same
    // width in both, so in that frame only the space beside it changes: the Chart clipped
    // to nothing before the panel widens, or blank space before it narrows.
    else if (this.wide || this.view === "log") body = h_flex().flex_1().min_h(0).justify_end()
      .when(this.wide, (el) => el.child(v_flex().flex_1().min_w(0).h_full().overflow_hidden().child(renderChart(this, t))))
      .child(v_flex().id("log-col").w(this.wide ? LOG_COL : LOG_W).flex_none().h_full()
        .when(this.wide, (el) => el.border_l(1).border_color(t.border)).child(renderLog(this, t)));
    else body = renderChart(this, t);

    // The card itself (border, corners, chrome) is the layout's "panel-card", like the
    // sidebar's; Harbor fills it and paints no background of its own.
    return v_flex().id("harbor").size_full().min_h(0).text_color(t.foreground).text_size(TEXT)
      .track_focus(this.handle)
      .on_key_down((e, cx) => { if (this.view === "manifest" && manifestKeys(this, e)) { cx.stop_propagation(); cx.notify(); } })
      .child(this.header(t))
      .child(body);
  }
}
