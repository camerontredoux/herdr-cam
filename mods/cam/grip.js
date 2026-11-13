// The resize edge of a side card: the sidebar's (with VS Code-style snapping to the rail)
// and the right panel's. The layout's own divider is off (body row `resizable: false`): it
// draws the cursor's width first and any snap after, which flickers. Here the width is
// snapped before it is set, so every frame is final.
//
// Which card a grip resizes is its `edge` prop (default "sidebar"); the card's sizes, and
// which side of it the grip is on, are EDGES in shared.js. Double-clicking a grip resets its
// card to that edge's `reset` width. The panel's grip is inert while the panel shows a page
// with a fixed width (FIXED in shared.js, Harbor's): it stays as the gap, nothing more.
//
// Two roles, by props:
// - In the layout (inside the card's wrapper row): the grip. A press opens a transparent
//   overlay over the whole window so the drag keeps getting moves wherever the pointer goes.
// - As that overlay (props().drag): follows the pointer until the release, then closes.

import { View, div } from "gpui-kit";
import { v_flex } from "gpui-base";
import { props, openOverlay, closeOverlay, shared, setShared, settings } from "herdr";
import { EDGES, cardWidth, resizeCard, panelFixed } from "./shared.js";
import { colors } from "./modules/ui/index.js";

/** @typedef {import("./shared.js").Drag} Drag */
/** @typedef {import("./shared.js").CamProps} CamProps */
/** @typedef {import("./shared.js").EdgeId} EdgeId */

// How far the line fades in and out at its ends.
const FADE = 40;
const STEPS = 20;
// Two presses this close (ms) are a double-click, wherever the second one lands.
const DOUBLE = 400;

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// The width a drag asks for, as the card allows: below the midpoint to its rail (if it has
// one) it snaps shut, above it snaps open.
/** @param {EdgeId} id @param {number} raw */
function allowed(id, raw) {
  const e = EDGES[id];
  if (e.rail != null && raw < (e.rail + e.min) / 2) return e.rail;
  return clamp(raw, e.min, e.max);
}

// One drag step: the width the pointer asks for, snapped, applied only when it changes.
// Snapping shut doesn't end the drag: dragging back out reopens it before the release.
/** @param {Drag} drag @param {number} x */
function follow(drag, x) {
  const id = drag.edge ?? "sidebar", e = EDGES[id];
  const zoom = Number(settings().zoom) || 1;
  const dx = (x - drag.x0) / zoom * (e.grip === "right" ? 1 : -1);
  const px = Math.round(allowed(id, drag.w0 + dx));
  if (px === drag.last) return;
  drag.last = px;
  resizeCard(id, px);
}

// On release: remember the open width, if the edge keeps one, and drop the drag flag.
/** @param {Drag} drag */
function finish(drag) {
  const id = drag.edge ?? "sidebar", e = EDGES[id];
  if (e.remember) {
    const px = drag.last ?? drag.w0, rail = e.rail ?? 0;
    if (px > rail) setShared(e.remember, px);
    else if (drag.w0 > rail) setShared(e.remember, drag.w0);
  }
  setShared(`${id}.dragging`, false);
}

// Double-click: the card back to its default width.
/** @param {EdgeId} id */
function reset(id) {
  const e = EDGES[id];
  resizeCard(id, e.reset);
  if (e.remember) setShared(e.remember, e.reset);
}

export class Grip extends View {
  init() {
    /** @type {Drag | null} */
    this.drag = props()?.drag ? { ...props().drag } : null;
    /** @type {EdgeId} */
    this.edge = props()?.edge === "panel" ? "panel" : "sidebar";
    // The flag that lights this grip's line; each edge has its own.
    this.flag = `${this.edge}.dragging`;
    this.lastDown = 0;
    // A drag cut short by a reload must not leave the line lit.
    if (!this.drag && shared(this.flag)) setShared(this.flag, false);
  }

  render() {
    const t = colors();
    /** @type {CamProps} */
    const p = props() ?? {};

    if (p.drag) {
      const drag = /** @type {Drag} */ (this.drag);
      const end = () => { finish(drag); closeOverlay(p.overlay); };
      return div().id("grip-drag").size_full().cursor_col_resize()
        .on_mouse_move(e => follow(drag, e.position.x))
        .on_mouse_up("left", end)
        // A release outside the window never arrives; the next press ends the drag instead.
        // If that press comes right after the first one, without a move, it's a double-click.
        .on_mouse_down("left", (_e, cx) => {
          cx.stop_propagation();
          const double = drag.last == null && Date.now() - (drag.t0 ?? 0) < DOUBLE;
          end();
          if (double) reset(drag.edge ?? "sidebar");
        });
    }

    if (this.edge === "panel" && panelFixed()) { this.hot = false; return div().id("panel-grip").size_full(); }

    // The 4px gap is the hit area; all that shows is a hairline down its middle,
    // soft and translucent, the card's full height, on hover or while dragging.
    const dragging = shared(this.flag) === true;
    // A drag that ends with a snap moves the edge away from the pointer, and hover only
    // updates on the next move: drop it now so the line goes out with the drag.
    if (this.wasDragging && !dragging) this.hot = false;
    this.wasDragging = dragging;
    const lit = this.hot || dragging;
    // Solid in the middle, fading to nothing over FADE px at each end. `.bg()` takes no
    // gradient, so each fade is STEPS thin bands, each a little more opaque.
    const solid = /** @type {import("./shared.js").Color} */ (t.dim.slice(0, 7));
    /** @param {number} i */
    const band = i => div().h(FADE / STEPS).flex_none()
      .bg(`${solid}${Math.round(255 * (i + 0.5) / STEPS).toString(16).padStart(2, "0")}`);
    const ramp = Array.from({ length: STEPS }, (_, i) => i);
    const line = v_flex().w(2).h_full().opacity(0.4)
      .children(ramp.map(band))
      .child(div().flex_1().bg(solid))
      .children(ramp.reverse().map(band));
    return div().id(`${this.edge}-grip`).size_full().flex().justify_center().cursor_col_resize()
      .on_hover((hot, cx) => { this.hot = hot; cx.notify(); })
      .when(lit, el => el.child(line))
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        // A double-click (counted by the app, or two presses DOUBLE apart if the drag
        // overlay took the first release) resets the card instead of starting a drag.
        const now = Date.now(), double = e.click_count >= 2 || now - this.lastDown < DOUBLE;
        this.lastDown = double ? 0 : now;
        if (double) { this.end(); reset(this.edge); return; }
        const w0 = cardWidth(this.edge) ?? EDGES[this.edge].reset;
        const drag = { x0: e.position.x, w0, t0: now, edge: this.edge };
        this.drag = { ...drag };
        setShared(this.flag, true);
        this.overlay = openOverlay({
          mod: "cam", kind: "window", frame: "none",
          width: 1, height: 1, at: { x: 0, y: 0 },
          props: { role: "grip", drag },
        });
      })
      // Moves and a release that land before the overlay is drawn.
      // The overlay usually takes the release, so the grip hears of it only through the shared flag.
      .on_mouse_move(e => {
        if (this.drag && shared(this.flag) !== true) this.drag = null;
        if (this.drag) follow(this.drag, e.position.x);
      })
      .on_mouse_up("left", () => this.end());
  }

  end() {
    if (!this.drag) return;
    finish(this.drag);
    this.drag = null;
    if (this.overlay) closeOverlay(this.overlay);
  }
}
