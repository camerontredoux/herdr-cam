// Every Harbor view is a page, the way a router layout frames its routes: an optional
// fixed top, a scrolling list of rows, an optional footer. The page owns the frame, so
// every view shares it; a view only supplies the parts.
//
//   panel edge ─ INSET (4) ─ row edge ─ INNER (6) ─ content      rows GAP (2) apart
//
// A row is the hover/selection surface (a voyage block, a turn, a call, the back button);
// its content sits INNER inside it, so text lines up 10px from the panel edge on every page.
import { div, list } from "gpui-kit";
import { h_flex, v_flex, Scrollbar } from "gpui-base";
import { INSET, GAP, divider } from "../ui/index.js";
import { SMALL, NOTCH_PL, NOTCH_PR, alpha, grayLine, notchBack, TILE_H } from "./theme.js";

/** @typedef {import("./theme.js").Theme} Theme */

export { INSET, GAP };
export const INNER = 6;
// A row that leads with a title (a voyage, a request): its title row is TITLE_H tall, its
// client tile, badges and chips CHIP. The row's top padding is ROW_Y, so the tile sits INNER
// from the row's top edge, as far as from its side.
export const TITLE_H = 22;
export const CHIP = 16;
export const ROW_Y = INNER - (TITLE_H - CHIP) / 2;
// The gap you see above the client tile (ROW_Y, then the room the title row leaves around
// the TILE_H tile). A row's last mark (its chips, the track's lowest dot) sits this far from
// the row's bottom edge too, so the space reads the same top and bottom.
export const EDGE = ROW_Y + (TITLE_H - TILE_H) / 2;

// A choice under a row (a decision's answers, a request's Charter and Dismiss): a chip
// CHIP + 2 tall, notched like the badges. `tint` marks the suggested one with its color; the
// rest are quiet outlines. Hover lifts the label, since the notched shape can't take a style.
/** @param {Theme} t @param {string} id @param {string} label @param {any} [tint] */
export const chip = (t, id, label, tint) => h_flex().id(id).relative().h(CHIP + 2).pl(NOTCH_PL).pr(NOTCH_PR).flex_none().items_center()
  .text_size(SMALL).text_color(tint ?? t.muted).cursor_pointer().hover((s) => s.text_color(t.foreground))
  .child(notchBack(CHIP + 2, 3, tint ? alpha(tint, 0.15) : "#00000000", tint ? alpha(tint, 0.4) : grayLine(t)))
  .child(div().child(label));

// Put in a page's rows for an edge-to-edge rule between two groups of rows.
export const RULE = Symbol("rule");

// A lazy row, for a page whose rows go in Herdr's `list` (o.lazy): only the rows on screen are
// laid out each frame, where a scroll area lays out every row, off screen or not. draw()
// builds the row when it comes on screen and may not register handlers; the list's one
// on_item_click runs its click(cx). after: the space under it (GAP).
/** @typedef {{ key: string, draw: () => any, click?: (cx: any) => void, after?: number }} LazyRow */

/**
 * @param {Theme} t
 * @param {{ id: string, top?: any, rows: any[], empty?: any, foot?: any, rules?: boolean, gap?: number, lazy?: boolean }} o
 *   top: fixed above the list, set off by a rule. rows: the list (falsy entries skipped).
 *   empty: shown when there are no rows. foot: a bar() under the list.
 *   rules: an edge-to-edge rule between rows. gap: between rows (GAP). A RULE in rows is
 *   one rule there.
 */
// lazy: rows are LazyRows (and RULEs).
export function page(t, o) {
  const rows = o.rows.filter(Boolean);
  return v_flex().flex_1().min_h(0)
    .when(Boolean(o.top), (el) => el.child(v_flex().flex_none().p(INSET).border_b(1).border_color(t.border).child(o.top)))
    .when(Boolean(o.lazy) && rows.length > 0, (el) => el.child(lazyList(t, o.id, rows)))
    .when(!o.lazy || !rows.length, (el) => el.child(v_flex().id(o.id).flex_1().min_h(0).overflow_y_scrollbar().py(INSET).gap(o.gap ?? GAP)
      .children(rows.flatMap((r, i) => {
        if (r === RULE) return [divider(t).mx(0)];
        const row = v_flex().flex_none().px(INSET).child(r);
        return i && o.rules ? [divider(t).mx(0), row] : [row];
      }))
      .when(!rows.length && Boolean(o.empty), (el) => el.child(o.empty))))
    .when(Boolean(o.foot), (el) => el.child(o.foot));
}

// The same frame as the scroll area's: INSET round the list, rows INSET from the sides.
/** @param {Theme} t @param {string} id @param {any[]} given */
function lazyList(t, id, given) {
  /** @type {LazyRow[]} */
  const rows = given.map((r, i) => (r === RULE ? { key: `rule-${i}`, draw: () => divider(t).mx(0), edge: true } : r));
  const by = new Map(rows.map((r) => [r.key, r]));
  const last = rows.length - 1;
  return div().relative().flex_1().min_h(0)
    .child(list(id, rows.length, (i) => rows[i].key, (i) => {
      const r = /** @type {any} */ (rows[i]), after = r.after ?? GAP;
      return v_flex().when(!r.edge, (el) => el.px(INSET)).pt(i ? 0 : INSET).pb(i === last ? after - GAP + INSET : after).child(r.draw());
    }).size_full()
      .on_item_click((key, cx) => by.get(key)?.click?.(cx)))
    .child(Scrollbar.vertical(id).absolute().inset_0());
}
