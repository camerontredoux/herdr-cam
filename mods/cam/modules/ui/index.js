// The ui module: the look every cam part and every module shares. The bottom layer: it
// imports only gpui-kit, gpui-base and herdr, never cam's parts or another module
// (check-boundaries.sh enforces this).
//
// Rows are a tile tall with corners of 6; a 14px icon sits 4 in, where the rail puts it.
// Containers inset 4 all round; rows 2 apart; titles 11.5 dim, 10 in from the edge.
// Headers and footers are bars: one tile tall plus INSET above and below and a 1px line
// on the side facing the content, so every bar is BAR px and they all line up.
import { div, PathBuilder, Background } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, settings } from "herdr";

// The terminals' font, for numbers, durations and labels set in mono: settings.json's
// font_family, or the app's default when it names none (settings.rs).
export const mono = () => settings().font_family ?? "JetBrains Mono";

/** @typedef {import("gpui-kit").Color} Color */
/** @typedef {import("gpui-kit").NativeElement} El */
/** Every theme color by name, as element colors (herdr.d.ts types them as plain strings).
 * @typedef {Record<string, Color>} Theme */

// theme(), typed as element colors: every value is a `#rrggbb[aa]` color.
export const colors = () => /** @type {Theme} */ (theme());

// ---- Sizes.
export const TILE = 22;
export const ICON = 14;
export const RADIUS = 6;
export const INSET = 4;
export const GAP = 2;
// A header's or footer's height, its line included. layouts/cam.json sizes the tab bar
// and status bar blocks to match ("tabs" and "status", 31).
export const BAR = TILE + 2 * INSET + 1;
// A pane's header (cam's pane.js), shown when a tab is split: one tile tall, a label
// strip rather than a bar. An unfocused pane's header fades its name to this.
export const PANE_HEAD = TILE;
export const PANE_HEAD_FADE = 0.5;
// A text footer's side padding (the status bar's), for bars of words rather than tiles.
export const TEXT_BAR_PAD = 14;

// ---- Building blocks.
// One clickable row; `on` paints it selected (keyboard), hover paints it lighter.
/** @param {Theme} t @param {string} id @param {boolean} [on] */
export const row = (t, id, on = false) => h_flex().id(id).h(TILE).flex_none().px((TILE - ICON) / 2).gap(8).items_center().rounded(RADIUS)
  .text_color(t.foreground).cursor_pointer().when(on, el => el.bg(t.selected)).hover(s => s.bg(t.hover));
// A section title, like the sidebar's "Spaces".
/** @param {Theme} t @param {string} text */
export const heading = (t, text) => h_flex().h(TILE).flex_none().px(10 - INSET).items_center().text_size(11.5).text_color(t.dim).child(text);
// Dim text on a row's right: a key, a count, a state.
/** @param {Theme} t @param {string} text */
export const hint = (t, text) => div().flex_none().text_size(11.5).text_color(t.dim).child(text);
/** @param {Theme} t */
export const divider = t => div().h(1).flex_none().mx(2).my(2).bg(t.border);
// The sidebar's right edge, drawn by each sidebar block: the 1px hairline where it meets
// the main area, and the main area's shadow on the sidebar: soft strips darkest at the
// hairline. Each block draws its own (not the layout's divider) so a block can leave it
// out: over the rail, the window buttons' strip has none, so no line crosses the buttons. Four equal faint ramps, each half as wide as the last,
// stack into a curve that steepens toward the edge like a blurred shadow; one ramp, or a
// strong narrow one, reads as a hard line. The layout's own `shadow`
// is too faint to see on a dark canvas. First child of a relative() block, so it paints
// under the rows and a row's highlight covers it (rows keep clear of the hairline); it
// has no handlers, so clicks and hovers go through.
export const SHADE = 24;
const RECT = () => PathBuilder.fill().move_to("0%", "0%").line_to("100%", "0%").line_to("100%", "100%").line_to("0%", "100%").close().build();
/** @param {number} w @param {import("gpui-kit").Color} edge */
const shadeLayer = (w, edge) => window.paint_path(RECT(), Background.linear_gradient(90, "#00000000", edge)).absolute().top(0).right(1).h_full().w(w);
/** @param {Theme} t */
export const sidebarEdge = t => div().absolute().top(0).right(0).h_full().w(SHADE + 1)
  .children([SHADE, SHADE / 2, SHADE / 4, SHADE / 8].map(w => shadeLayer(w, "#0000000d")))
  .child(div().absolute().top(0).right(0).h_full().w(1).bg(t.border));
// A dialog's body: the sidebar's surface inside Herdr's frame.
/** @param {Theme} t @param {string} id */
export const panel = (t, id) => v_flex().id(id).w_full().min_h(0).p(INSET).gap(GAP).bg(t.chrome).text_size(13);
// A dialog's title row, with Esc on the right, for dialogs you can leave.
/** @param {Theme} t @param {string} text */
export const titleBar = (t, text) => h_flex().h(TILE).flex_none().pl(10 - INSET).pr(10 - INSET).items_center()
  .child(div().flex_1().text_size(11.5).text_color(t.dim).child(text)).child(hint(t, "Esc"));
// A dialog's button; `primary` is filled (the answer Enter gives).
/** @param {Theme} t @param {string} id @param {string} label @param {boolean} primary @param {() => void} onClick */
export const dialogButton = (t, id, label, primary, onClick) => h_flex().id(id).h(TILE).px(10).items_center().rounded(6).cursor_pointer()
  .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground).hover(s => s.opacity(0.88))
  .on_click(onClick).child(label);

// A working spinner: braille frames swapped natively (`.frames`), not `.spin()`,
// which the engine caps at ~30 fps and looks choppy.
const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
/** @param {Color} color @param {number} [size] */
export const spinner = (color, size = 12) => div().w(size).flex_none().text_size(size).text_color(color).frames(SPIN, 80).child(SPIN[0]);

// ---- Bars.
// A header (line "below") or footer (line "above"): BAR tall, INSET in, tiles GAP+1 apart.
// Fill it with tiles (barButton, rows) or override the padding for words (TEXT_BAR_PAD).
/** @param {Theme} t @param {"below" | "above"} line */
export const bar = (t, line) => h_flex().h(BAR).w_full().min_w(0).flex_none().px(INSET).gap(GAP + 1).items_center()
  .border_color(t.border).when(line === "below", el => el.border_b(1)).when(line === "above", el => el.border_t(1));

// A bar's button: a tile with an icon and/or label, like the tab bar's Files / Changes /
// Harbor. `on` paints it selected. Give it .child(svg(…).size(ICON)) and .child(label).
/** @param {Theme} t @param {string} id @param {boolean} [on] */
export const barButton = (t, id, on = false) => h_flex().id(id).h(TILE).px((TILE - ICON) / 2).gap(5).flex_none().items_center().rounded(RADIUS)
  .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
  .hover(s => s.bg(t.hover));

// A tab group: a sunken pill of segments, one selected (raised, outlined), 2px apart. 24
// tall, so it sits in a bar with 3px above and below. Fill it with segment()s.
/** @param {Theme} t */
export const segments = (t) => h_flex().h(24).p(1).gap(2).flex_none().items_center().rounded(RADIUS)
  .bg(t.surface).border_1().border_color(t.border);

// One segment of a tab group: the tab (background, 1px outline) around a row that fills it
// and holds the children (a label, a count). Switch on on_mouse_down, not on_click: a
// click lands on release. The outline is always there, clear when not selected, so
// selecting a tab moves nothing. The text color is set on the inner row, not inherited
// from the tab: inherited, the tab you left kept its white text until the mouse moved.
/** @param {Theme} t @param {string} id @param {boolean} on @param {...(El | string)} children */
export const segment = (t, id, on, ...children) => h_flex().id(id).h(20).flex_none().rounded(RADIUS - 1).cursor_pointer()
  .border_1().border_color(on ? t.border : "#00000000").bg(on ? t.raised : "#00000000")
  .child(h_flex().id(`${id}-row`).h_full().px(8).gap(5).items_center().text_size(12)
    .text_color(on ? t.foreground : t.muted).hover(s => s.text_color(t.foreground))
    .children(children));
