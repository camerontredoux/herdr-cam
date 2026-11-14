// What cam's own parts agree on: the side cards' sizes and how they open, collapse and
// resize; layout lookups; space colors, navigation and agent names. One place, so a size
// changes once. The look is the ui module's (./modules/ui/index.js).
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { layout, run, shared, spaces, terminals, window } from "herdr";
import { TILE } from "./modules/ui/index.js";

/** @typedef {import("gpui-kit").Color} Color */
/** @typedef {import("gpui-kit").NativeElement} El */
/** @typedef {import("gpui-kit").Context} Cx */
/** @typedef {import("gpui-kit").AsyncContext} AsyncCx */
/** @typedef {import("herdr").SpaceInfo} Space */
/** @typedef {import("herdr").TabInfo} Tab */
/** @typedef {import("herdr").AgentInfo} Agent */
/** Every theme color by name (the ui module's). @typedef {import("./modules/ui/index.js").Theme} Theme */
/** A node of the shown layout (layouts/<name>.json), as far as cam reads it.
 * @typedef {{ id?: string, type?: string, hidden?: boolean, active?: string,
 *   size?: { px?: number, weight?: number }, children?: LayoutNode[], traffic_lights?: number[] }} LayoutNode */

/** A core terminal, as much of `hc ls --json` as cam reads (herdr.d.ts gives `any[]`).
 * @typedef {{ address: string, name?: string, state?: string, parent?: string | null,
 *   labels?: Record<string, string> }} Terminal */
/** A machine as `hc machine ls --json` lists it.
 * @typedef {{ name: string, state?: string, why?: string, via?: string, target?: string, session?: string,
 *   version?: string, temporary?: boolean }} Machine */
/** A click handler, as elements take one. @typedef {(event: import("gpui-kit").ClickEvent, cx: Cx) => void} ClickHandler */
/** An app command and its arguments, for `run`. @typedef {{ name: string, args?: Record<string, unknown> }} Command */
/** A sidebar drag: the pointer's x and the width at the press, the last width set.
 * @typedef {{ x0: number, w0: number, t0?: number, last?: number, edge?: EdgeId }} Drag */
/** What a right-click menu acts on. @typedef {{ id?: string, space?: string, pane?: string, terminal?: string }} Target */
/** An agent the + menu can start (`knownAgents()`). @typedef {import("herdr").Program & { run: string[], installed: boolean }} KnownAgent */
/** The props a cam block or overlay is given (its role picks the part; the rest is that part's).
 * @typedef {{ role?: string, edge?: EdgeId, overlay?: string, titlebar?: boolean, drag?: Drag, tab?: string, target?: Target,
 *   section?: string, title?: string, detail?: string, yes?: string, value?: string, hint?: string,
 *   command?: Command }} CamProps */


// The collapsed sidebar (the rail) and the narrowest open width. The look (tiles, rows,
// bars, colors) is the ui module's: ./modules/ui/index.js.
// The sidebar's left and right padding, open or rail: the one place they're tuned. The
// layout's root has no padding (the sidebar and the main area meet at one full-height
// hairline and run to the window's edges), so the sidebar pads its own left. In a window
// macOS draws its 1px border over the left edge, so the left takes 5 there; fullscreen
// has no border, so it takes 4. The right is 4 in both.
// The rail has one fixed width (RAIL_W), so it and the main area beside it never move when
// you enter or leave fullscreen. In fullscreen it splits the room evenly, 4.5 each side,
// like the open sidebar's equal sides (a half point is one pixel on a Retina screen).
/** @param {boolean} [onRail] */
export const sidebarPl = (onRail = false) => (!window()?.fullscreen ? 5 : onRail ? 4.5 : 4);
/** @param {boolean} [onRail] */
export const sidebarPr = (onRail = false) => (window()?.fullscreen && onRail ? 4.5 : 4);
// The sidebar draws the 1px hairline at its right edge itself (ui's sidebarEdge), inside
// its width; the right padding is measured from that line.
export const HAIRLINE = 1;
// The rail: one square RAIL_TILE, the sidebar's padding and its hairline, as wide as the
// tab bar is tall. Its creatures (RAIL_MARK) nearly fill the tile, so they're easy to tell apart.
export const RAIL_TILE = TILE, RAIL_MARK = 20;
// The window's padding (5 and 4) around the tile, in or out of fullscreen.
export const RAIL_W = 5 + RAIL_TILE + 4 + HAIRLINE;
export const rail = () => RAIL_W;
export const FULL = 160;
export const MAX = 480;
// The width the sidebar opens to: wide enough that a full-screen terminal keeps its columns.
export const OPEN = 254;
// The width the right panel (Files, Changes, Harbor) opens to: Harbor's Log on its own
// (its LOG_W, 360) plus the card's 1px border each side.
export const PANEL = 362;

// ---- The side cards and their grips. Each side is a wrapper row in layouts/cam.json:
// [sidebar-card | sidebar-grip] on the left, [panel-grip | panel-card] on the right. The
// wrapper is what's sized, shown and hidden (so the grip goes with its card), and its
// width is the card's plus GRIP. Every width in cam's code is the card's.
export const GRIP = 4;

/** @typedef {"sidebar" | "panel"} EdgeId */
/** A side card's sizes. `grip` is the side of the card its grip is on; `rail`, if set, is the
 * collapsed width a drag snaps to below the midpoint between it and `min`; double-clicking
 * the grip resizes the card to `reset`; `remember` is the shared key that keeps the last
 * open width.
 * @typedef {{ grip: "left" | "right", reset: number, min: number, max: number, rail?: number, remember?: string }} Edge */
/** @type {Record<EdgeId, Edge>} */
export const EDGES = {
  sidebar: { grip: "right", reset: OPEN, min: FULL, max: MAX, get rail() { return rail(); }, remember: "sidebar.width" },
  panel: { grip: "left", reset: PANEL, min: 280, max: 900, remember: "panel.width" },
};

/** The card's width (its wrapper's less the grip), or null before the layout has one.
 * @param {EdgeId} id @returns {number | null} */
export function cardWidth(id) {
  const px = find(layout(), id)?.size?.px;
  return typeof px === "number" ? px - gripOf(id) : null;
}

// A card may have no grip (the sidebar's was removed): then the wrapper is the card.
/** @param {EdgeId} id */
const gripOf = (id) => find(layout(), `${id}-grip`) ? GRIP : 0;

/** Size a side card: its wrapper gets the card's width plus the grip.
 * @param {EdgeId} id @param {number} px */
export const resizeCard = (id, px) => run("layout.resize", { id, px: Math.round(px) + gripOf(id) });

/** @param {unknown} root @param {string} id @returns {LayoutNode | null} */
export function find(root, id) {
  const node = /** @type {LayoutNode} */ (root);
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The rail goes by the sidebar's width, not a flag: dragging its edge narrows it too.
export const narrow = () => (cardWidth("sidebar") ?? Infinity) < FULL;

// To the rail, or back open at OPEN; a hidden sidebar is shown first.
// Dragging the edge is the grip's.
export function toggleSidebar() {
  if (find(layout(), "sidebar")?.hidden) { run("layout.show", { id: "sidebar" }); return; }
  resizeCard("sidebar", (cardWidth("sidebar") ?? Infinity) < FULL ? OPEN : rail());
}

// The rail's width follows fullscreen (rail()), so a rail sized before the switch is
// resized to match. Every width below FULL is the rail (the grip snaps there).
export function syncRail() {
  const w = cardWidth("sidebar");
  if (w !== null && w < FULL && w !== rail()) resizeCard("sidebar", rail());
}

// The pane area: a 4px gap around the panes always (so nothing moves on a tab switch),
// the card's grey around a single pane and the darker canvas around a split tab's, like
// the gaps between them. A layout can't color by split, so it keeps two copies of the
// tab block in the "panes" stack (main, main-split) and this shows the right one: a
// live select, no file write. It lands a frame after the switch; only the color changes.
/** @param {boolean} split */
export function syncPaneArea(split) {
  const want = split ? "main-split" : "main";
  const stack = find(layout(), "panes");
  if (stack && stack.active !== want) run("layout.select", { stack: "panes", child: want });
}

// Open the right panel on one page (files, changes, harbor), or close it if it's already
// showing that page: the tab bar's panel buttons and cmd+shift+e (Harbor) both use this.
/** @param {string} id */
export function togglePanel(id) {
  const panel = find(layout(), "panel"), body = find(layout(), "panel-body");
  if (panel && !panel.hidden && body?.active === id) { run("layout.hide", { id: "panel" }); return; }
  run("layout.select", { stack: "panel-body", child: id });
  run("layout.show", { id: "panel" });
}

// The right panel's width goes by its page. A page in FIXED has its own width (main.js
// fills it in: Harbor's, which its expand button switches) and its grip doesn't drag.
// Any other page (Files, Changes) takes the width its grip was last dragged to, or PANEL,
// so dragging one never leaves Harbor at an odd width.
/** @type {Record<string, () => number>} page id -> its card width */
export const FIXED = {};

/** The page the right panel shows, or null when it's closed. @returns {string | null} */
export function panelPage() {
  const panel = find(layout(), "panel");
  return panel && !panel.hidden ? find(layout(), "panel-body")?.active ?? null : null;
}

/** Whether the right panel shows a page with a fixed width. */
export const panelFixed = () => { const page = panelPage(); return page != null && page in FIXED; };

// Size the right panel for its page. The tab bar calls this on every layout change, so a
// switch of page, space or a restart lands at the right width; it does nothing when the
// width is already right, or mid-drag (the drag owns the width until it lets go).
export function fitPanel() {
  const page = panelPage();
  if (page == null || shared("panel.dragging") === true) return;
  const want = FIXED[page]?.() ?? (Number(shared("panel.width")) || PANEL);
  if (cardWidth("panel") !== want) resizeCard("panel", want);
}

// Hide or show the sidebar; its grip is inside the same wrapper, so it goes too.
// Unbound (cmd+shift+e is Harbor's now) but still a command: cam.toggle-sidebar.
export function toggleSidebarHidden() {
  run(find(layout(), "sidebar")?.hidden ? "layout.show" : "layout.hide", { id: "sidebar" });
}

// Space colors, kept by id in shared "space.colors" (the sidebar assigns them).
/** @type {Record<string, Color>} */
// Six hues spread round the wheel, so no two spaces look alike (teal sat beside green).
export const MARK = { ansi6: "#d8b04a", ansi3: "#e07f4f", ansi4: "#5b8ff0", ansi5: "#9a78ea", ansi2: "#55ad62", ansi1: "#e0699e" };
/** @param {Theme} t @param {Space} s @returns {Color} */
export function spaceColor(t, s) {
  if (s.name === "~") return t.dim;
  const c = (/** @type {Record<string, string>} */ (shared("space.colors")) ?? {})[s.id] ?? "ansi6";
  return c.startsWith("#") ? /** @type {Color} */ (c) : (MARK[c] ?? t[c]);
}
// A space's mark: a little creature in its color, its silhouette picked by its color, two
// eyes high on its body. Given `busy` (an element id no other mark on screen has), the eyes
// dart side to side. `size`: its box; the shape, eyes and dart scale with it (16 is an icon's).
// Silhouettes are SVGs (icons/creatures, each filling the same 15px square of a 16 box)
// tinted the space's color; `eyes` is where
// the eyes' top sits in that box, so they sit high on each body.
const CREATURES = [
  { file: "ball", eyes: 5 },
  { file: "gumdrop", eyes: 5.5 },
  { file: "squircle", eyes: 4.5 },
  { file: "egg", eyes: 6.5 },
  { file: "dome", eyes: 5 },
  { file: "triangle", eyes: 8.5 },
];
// Each palette color's silhouette (CREATURES' order), so spaces apart in color are apart in shape.
/** @type {Record<string, number>} */
const SHAPE_OF = { ansi6: 0, ansi1: 5, ansi5: 2, ansi3: 1, ansi2: 4, ansi4: 3 };
/** @param {Theme} t @param {Space} s @param {string} [busy] @param {number} [size] */
export function spaceMark(t, s, busy, size = 16) {
  const k = size / 16;
  // A picked hex color, or none, falls back to a hash of the id.
  const c = (/** @type {Record<string, string>} */ (shared("space.colors")) ?? {})[s.id];
  const n = c && c in SHAPE_OF ? SHAPE_OF[c] : [...s.id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const shape = CREATURES[n % CREATURES.length];
  // The eyes: two small ovals tilted like a highlight, a little right of center and high
  // on the body (icons/creatures/eyes.svg, an 8x6 box), as in the reference creatures.
  // A busy space's eyes dart left and back, never right of their spot, so they stay on the body.
  return div().relative().size(size).flex_none()
    .child(svg(`mods/cam/icons/creatures/${shape.file}.svg`).absolute().top(0).left(0).size(size).text_color(spaceColor(t, s)))
    .child(h_flex().absolute().left(0).right(0).top((shape.eyes - 2.5) * k).justify_center().pl(4.5 * k)
      .child(svg("mods/cam/icons/creatures/eyes.svg").w(8 * k).h(6 * k).text_color("#161616")
        .when(Boolean(busy), el => el.id(/** @type {string} */ (busy)).relative().loop("left", { from: -2.5 * k, to: 0, period: 700 }))));
}

// The New space mark's outline: the old rounded ghost, drawn as a box so it can be dashed.
/** @param {import("gpui-kit").Element} el @param {number} k */
const GHOST = (el, k) => el.w(15 * k).h(16 * k).rounded_t(8 * k).rounded_b(3 * k);

// The creature for a space that isn't there yet ("New space"): the ghost shape as a dashed
// outline in `color`, no fill, a + in the same color where its eyes go. The outline is its
// own layer, so the + centers on the whole shape (a border would push it off by its width);
// the + is 7 across with a 1 stroke, so it lands on whole pixels.
/** @param {Color} color @param {number} [size] */
export function newMark(color, size = 16) {
  const k = size / 16, arm = 7 * k, w = k;
  const bar = (/** @type {boolean} */ across) => div().absolute().bg(color)
    .when(across, el => el.w(arm).h(w).left(0).top((arm - w) / 2))
    .when(!across, el => el.w(w).h(arm).top(0).left((arm - w) / 2));
  const shape = GHOST;
  return h_flex().size(size).flex_none().items_center().justify_center()
    .child(shape(h_flex().relative().items_center().justify_center(), k)
      .child(shape(div().absolute().top(0).left(0).border(1.5 * k).border_dashed().border_color(color), k))
      .child(div().relative().size(arm).child(bar(true)).child(bar(false))));
}

// The sidebar's space order, worktrees right after their repo's space: [{ id, group }],
// group being the top-level space a worktree is drawn under (else its own id).
export const SPACE_ORDER = "cam.space-order";
/** @typedef {{ id: string, group: string }} OrderedSpace */

// Space and tab keys in the sidebar's order (Herdr's own follow creation order).
// space-next/prev and space-N step through the sidebar's list; tab-next/prev step through
// the tabs of a space and its worktrees as one run, wrapping inside it.
/** @param {string} c @returns {boolean} whether it was one of these */
export function navigate(c) {
  const order = /** @type {OrderedSpace[]} */ (shared(SPACE_ORDER)) ?? [];
  const sp = spaces(), active = sp.find(s => s.active);
  const at = order.findIndex(o => o.id === active?.id);
  const select = (/** @type {string} */ id) => run("space.select", { id });
  if (c === "space-next" || c === "space-prev") {
    if (at < 0 || !order.length) { run(c === "space-next" ? "space.next" : "space.prev"); return true; }
    select(order[(at + (c === "space-next" ? 1 : order.length - 1)) % order.length].id);
    return true;
  }
  const n = /^space-(\d)$/.exec(c);
  if (n) {
    const o = order[Number(n[1]) - 1];
    if (o) select(o.id); else if (!order.length) run("space.select", { index: Number(n[1]) });
    return true;
  }
  if (c === "tab-next" || c === "tab-prev") {
    const step = c === "tab-next" ? 1 : -1;
    if (at < 0 || !active) { run(step > 0 ? "tab.next" : "tab.prev"); return true; }
    const group = order.filter(o => o.group === order[at].group).map(o => sp.find(s => s.id === o.id)).filter(Boolean);
    const run_ = group.flatMap(s => s.tabs.filter(t => !t.settled || t.active).map(t => ({ space: s.id, tab: t.id })));
    const i = run_.findIndex(x => x.space === active.id && active.tabs.find(t => t.id === x.tab)?.active);
    if (i < 0 || run_.length < 2) { run(step > 0 ? "tab.next" : "tab.prev"); return true; }
    const next = run_[(i + step + run_.length) % run_.length];
    if (next.space !== active.id) select(next.space);
    run("tab.select", { id: next.tab });
    return true;
  }
  return false;
}

// An agent's name, the same in the sidebar and the tab bar: a task worker's task
// (its agent.task label, "fm-birch-referral" -> "Birch referral"), else its title with
// leading symbols dropped, else its program's name.
/** @param {Agent} a */
export function agentName(a) {
  const task = terminals().find(term => term.address === a.address)?.labels?.["agent.task"];
  if (task) return task.replace(/^fm-/, "").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
  return (a.title || "").replace(/^[^\p{L}\p{N}]+/u, "").trim() || a.program?.name || "Agent";
}
