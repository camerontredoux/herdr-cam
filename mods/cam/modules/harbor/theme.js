// Harbor's own look, on top of the ui module (sizes, colors, rows and bars come from
// there, so Harbor sits in cam's quiet, dense language): its icons, status colors,
// client tiles, badges, chips and buttons. 13px text, 16px notched letter tiles.
import { div, svg, PathBuilder } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { shared, spaces } from "herdr";
import { TILE, ICON, RADIUS, mono } from "../ui/index.js";
import { CLIENTS } from "./data.js";

export { colors } from "../ui/index.js";
/** @typedef {import("gpui-kit").Color} Color */
/** @typedef {import("../ui/index.js").Theme} Theme */

// ---- Sizes Harbor adds to the ui module's.
export const CARD_RADIUS = 8;
export const TEXT = 13;     // body text
export const SMALL = 11.5;  // hints, headings
export { mono };

// ---- Icons. Harbor's own are lucide glyphs in ./icons; a few come from Herdr's chrome.
export const ICONS = {
  gmail: "mods/cam/modules/harbor/icons/mail.svg",
  fathom: "mods/cam/modules/harbor/icons/video.svg",
  slack: "mods/cam/modules/harbor/icons/hash.svg",
  issue: "mods/cam/modules/harbor/icons/circle-dot.svg",
  newIssue: "mods/cam/modules/harbor/icons/circle-plus.svg",
  anchor: "mods/cam/modules/harbor/icons/anchor.svg",
  expand: "mods/cam/modules/harbor/icons/maximize-2.svg",
  shrink: "mods/cam/modules/harbor/icons/minimize-2.svg",
  loop: "mods/cam/modules/harbor/icons/repeat.svg",
  storm: "mods/cam/modules/harbor/icons/cloud-lightning.svg",
  tokens: "mods/cam/modules/harbor/icons/flame.svg",
  alert: "mods/cam/modules/harbor/icons/alert.svg",
  reset: "mods/cam/modules/harbor/icons/rotate-ccw.svg",
  terminal: "mods/workspace-chrome/terminal.svg",
  x: "mods/workspace-chrome/x.svg",
  check: "mods/workspace-chrome/check.svg",
  clock: "mods/workspace-chrome/clock.svg",
  chevronDown: "mods/workspace-chrome/chevron-down.svg",
  chevronRight: "mods/workspace-chrome/chevron-right.svg",
  branch: "mods/workspace-chrome/branch.svg",
  // Log tools
  Bash: "mods/workspace-chrome/terminal.svg",
  Read: "mods/workspace-chrome/file-text.svg",
  Edit: "mods/cam/modules/harbor/icons/file-diff.svg",
  Write: "mods/workspace-chrome/files.svg",
  Grep: "mods/cam/icons/search.svg",
  Agent: "mods/cam/modules/harbor/icons/bot.svg",
  WebFetch: "mods/cam/modules/harbor/icons/globe.svg",
};

// ---- Status: what a voyage or a station is doing, and its color.
// Change a status's look here; data.js only names it. Each sits on its own hue so a
// glance tells them apart: blue working, red blocked, amber decision, green done. (The
// theme's own working color is an orange too close to its blocked red to share a map.)
/** @param {Theme} t @returns {Record<string, { color: Color, label: string }>} */
export const STATUS = (t) => ({
  working: { color: t.ansi4, label: "Working" },
  blocked: { color: t.blocked, label: "Blocked" },
  decision: { color: t.accent, label: "Needs decision" },
  done: { color: t.ansi2, label: "Done" },
  waiting: { color: t.muted, label: "Waiting on client" },
});
/** @param {Theme} t @param {string} s */
export const statusColor = (t, s) => STATUS(t)[s]?.color ?? t.dim;

// A color at an alpha (`#rrggbb` + `aa`), for tints behind chips and lines.
/** @param {Color} c @param {number} a 0..1 */
// `a` of c over `under`, as one solid color: lines that cross or meet don't double up the
// way two see-through ones do.
/** @param {Color} c @param {Color} under @param {number} a */
export const mix = (c, under, a) => {
  const ch = (/** @type {Color} */ x, /** @type {number} */ i) => parseInt(String(x).slice(1 + i * 2, 3 + i * 2), 16);
  return /** @type {Color} */ ("#" + [0, 1, 2].map((i) => Math.round(ch(c, i) * a + ch(under, i) * (1 - a)).toString(16).padStart(2, "0")).join(""));
};
export const alpha = (c, a) => /** @type {Color} */ (`${String(c).slice(0, 7)}${Math.round(a * 255).toString(16).padStart(2, "0")}`);

// ---- Clients: their tile color follows the real space's color in cam's sidebar when
// the space exists (shared "space.colors"), else data.js's own.
const MARK = { ansi6: "#22a99a", ansi3: "#e3814f", ansi4: "#5b8def", ansi5: "#8b7cf6", ansi2: "#3fae6a", ansi1: "#d9649a" };
/** @param {string} key @returns {Color} */
export function clientColor(key) {
  const c = CLIENTS[key];
  const space = spaces().find(s => s.name === c?.space);
  const named = space && /** @type {Record<string, string>} */ (shared("space.colors") ?? {})[space.id];
  return /** @type {Color} */ ((named && (named.startsWith("#") ? named : MARK[named])) || c?.color || "#7e858f");
}
// ---- Notched shapes: a box with its top-left and bottom-right corners cut at 45°, `c` in.
// Harbor's marks (client tiles, badges) use it instead of rounding.
/** @param {number} w @param {number} h @param {number} c @param {number} [o] inset, for a stroke */
const notchPoints = (w, h, c, o = 0) => /** @type {[number, number][]} */ ([
  [c + o / 2, o], [w - o, o], [w - o, h - c - o / 2], [w - c - o / 2, h - o], [o, h - o], [o, c + o / 2]]);
/** A notched fill behind its parent's content. @param {number} w @param {number} h @param {number} c @param {any} color */
const notchFill = (w, h, c, color) => window.paint_path(PathBuilder.fill().add_polygon(notchPoints(w, h, c), true).build(), color)
  .absolute().top(0).left(0).size_full();

// A client's mark: its letter, mono and dark, on a notched tile of its color. The tile is
// `size` wide and TILE_H tall, like a badge: the cut corners make a square read tall.
export const TILE_H = 14;
/** @param {string} key @param {number} [size] */
export const clientTile = (key, size = 16) => h_flex().relative().w(size).h(TILE_H).flex_none().items_center().justify_center()
  .child(notchFill(size, TILE_H, size / 4, clientColor(key)))
  .child(div().text_size(size * 0.7).font_family(mono()).font_bold().text_color("#101010").child(CLIENTS[key]?.letter ?? "?"));

// A notched background, any width, for a relative() parent `h` tall: a cap at each end holds
// the cut corner (a path needs its size, and only the caps' is known) and the middle
// stretches. `line` adds a 1px outline.
//
// Each cap's outline is one filled shape, not a stroke: a 45° line 1px wide is smoothed across
// its neighbors and reads lighter than the straight edges, so the diagonal is DIAG thick
// across, and the shape runs E into the middle, where the middle's top and bottom lines start,
// so no two see-through lines overlap and brighten a seam.
const DIAG = 1.7, E = DIAG - 1;
/** @param {number} h @param {number} c @param {any} fill @param {any} [line] */
export const notchBack = (h, c, fill, line) => {
  /** @param {[number, number][]} pts */
  const shape = (pts, color) => window.paint_path(PathBuilder.fill().add_polygon(pts, true).build(), color)
    .absolute().top(0).left(0).size_full();
  // Fills first, then the outline on a layer above, so no fill paints over a cap's ring
  // where it runs into the middle.
  /** @param {[number, number][] | null} pts @param {any} color */
  const cap = (pts, color) => div().relative().w(c).h_full().flex_none().when(Boolean(pts), (el) => el.child(shape(/** @type {any} */ (pts), color)));
  /** @param {"t" | "b"} v */
  const edge = (v) => (v === "t" ? div().absolute().top(0) : div().absolute().bottom(0)).left(E).right(E).h(1).bg(line);
  const fills = h_flex().absolute().top(0).left(0).size_full()
    .child(cap([[c, 0], [c, h], [0, h], [0, c]], fill))
    .child(div().flex_1().h_full().bg(fill))
    .child(cap([[0, 0], [c, 0], [c, h - c], [0, h]], fill));
  if (!line) return fills;
  return div().absolute().top(0).left(0).size_full().child(fills)
    .child(h_flex().absolute().top(0).left(0).size_full()
      .child(cap([[c + E, 0], [c, 0], [0, c], [0, h], [c + E, h], [c + E, h - 1], [1, h - 1], [1, c + E], [c + E, 1]], line))
      .child(div().relative().flex_1().h_full().child(edge("t")).child(edge("b")))
      .child(cap([[-E, 0], [c, 0], [c, h - c], [0, h], [-E, h], [-E, h - 1], [c - 1, h - c - E], [c - 1, 1], [-E, 1]], line)));
};

// A notched background for a relative() parent of any size, for boxes whose height comes
// from their content (notchBack needs its height). Only the two cut corners are drawn
// shapes, each c (+E) square; the rest are plain divs, so nothing needs the box's size.
// The outline is built like notchBack's: thick diagonals, edges that meet without overlapping.
/** @param {number} c @param {any} fill @param {any} line */
export const notchBox = (c, fill, line) => {
  /** @param {[number, number][]} pts @param {any} color */
  const shape = (pts, color) => window.paint_path(PathBuilder.fill().add_polygon(pts, true).build(), color)
    .absolute().top(0).left(0).size_full();
  const k = c + E;
  const fills = v_flex().absolute().top(0).left(0).size_full()
    .child(h_flex().h(c).flex_none()
      .child(div().relative().w(c).h_full().flex_none().child(shape([[c, 0], [c, c], [0, c]], fill)))
      .child(div().flex_1().h_full().bg(fill)))
    .child(div().flex_1().bg(fill))
    .child(h_flex().h(c).flex_none()
      .child(div().flex_1().h_full().bg(fill))
      .child(div().relative().w(c).h_full().flex_none().child(shape([[0, 0], [c, 0], [0, c]], fill))));
  const outline = div().absolute().top(0).left(0).size_full()
    .child(div().absolute().top(0).left(0).size(k).child(shape([[k, 0], [c, 0], [0, c], [0, k], [1, k], [k, 1]], line)))
    .child(div().absolute().top(0).left(k).right(1).h(1).bg(line))
    .child(div().absolute().top(0).right(0).bottom(k).w(1).bg(line))
    .child(div().absolute().bottom(0).right(0).size(k).child(shape([[k - 1, 0], [k, 0], [k, E], [E, k], [0, k], [0, k - 1]], line)))
    .child(div().absolute().bottom(0).left(1).right(k).h(1).bg(line))
    .child(div().absolute().top(k).left(0).bottom(0).w(1).bg(line));
  return div().absolute().top(0).left(0).size_full().child(fills).child(outline);
};

// A notched shape's padding: 1px more on the left than the right. The cut top-left corner
// takes room from the left side, so even padding looks tighter there.
export const NOTCH_PL = 7, NOTCH_PR = 6;

// A status badge: its label in mono capitals on a notched tint of its color with an outline.
// Every badge is this one size.
/** @param {any} c @param {string} text */
export const badge = (c, text) => {
  const h = 16;
  return h_flex().relative().h(h).pl(NOTCH_PL).pr(NOTCH_PR).flex_none().items_center()
    .child(notchBack(h, 3, alpha(c, 0.14), alpha(c, 0.55)))
    .child(div().text_size(10).font_family(mono()).font_semibold().text_color(c).child(text.toUpperCase()));
};

// The outline of a gray badge or chip (a turn tag, Terminal and Open, a choice that isn't the
// suggested one): brighter than the theme's border, so it reads at badge size.
/** @param {Theme} t */
export const grayLine = (t) => alpha(t.foreground, 0.22);

// A gray badge, sized and set like the status badges: a notched gray outline, 16px, 6px sides,
// 10px mono capitals in `color` (muted). `id` makes it clickable, for the actions that use it.
// `tint` marks the suggested action in its color, as a tinted choice chip (Charter).
/** @param {Theme} t @param {string} text @param {{ id?: string, color?: any, tint?: any }} [o] */
export const grayBadge = (t, text, o = {}) => (o.id ? h_flex().id(o.id) : h_flex()).relative().h(16).pl(NOTCH_PL).pr(NOTCH_PR).flex_none().items_center()
  .text_size(10).font_family(mono()).font_semibold().text_color(o.tint ?? o.color ?? t.muted)
  .child(notchBack(16, 3, o.tint ? alpha(o.tint, 0.15) : "#00000000", o.tint ? alpha(o.tint, 0.4) : grayLine(t))).child(div().child(text.toUpperCase()));

// A highlighted row's corners: four L-shaped marks, `len` long, in `c`. Children of a
// relative() row, laid over it.
/** @param {any} c @param {number} [len] */
export const brackets = (c, len = 7) => [["t", "l"], ["t", "r"], ["b", "l"], ["b", "r"]].map(([v, h]) => {
  let d = div().absolute().size(len).border_color(c);
  d = v === "t" ? d.top(0).border_t(1.5) : d.bottom(0).border_b(1.5);
  return h === "l" ? d.left(0).border_l(1.5) : d.right(0).border_r(1.5);
});

// ---- Building blocks Harbor adds.
// An icon in the current text color.
/** @param {string} path @param {number} [size] */
export const icon = (path, size = ICON) => svg(path).size(size).flex_none();
// A key chip, like the palette's shortcuts.
/** @param {Theme} t @param {string} k */
export const keyChip = (t, k) => div().flex_none().px(4).rounded(4).bg(t.raised).text_size(11).text_color(t.dim).child(k);
// A quiet button: dim until hovered, like the tab bar's tools. `primary` fills it.
/** @param {Theme} t @param {string} id @param {string} label @param {{ icon?: string, primary?: boolean, key?: string }} [o] */
export const button = (t, id, label, o = {}) => h_flex().id(id).h(TILE).flex_none().px(8).gap(6).items_center().rounded(RADIUS)
  .text_size(12).cursor_pointer()
  .when(Boolean(o.primary), el => el.bg(t.solid).text_color(t.solid_foreground).hover(s => s.opacity(0.9)))
  .when(!o.primary, el => el.border_1().border_color(t.border).text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground)))
  .when(Boolean(o.icon), el => el.child(icon(/** @type {string} */ (o.icon), 13)))
  .child(label)
  .when(Boolean(o.key), el => el.child(div().text_size(11).opacity(0.6).child(/** @type {string} */ (o.key))));
