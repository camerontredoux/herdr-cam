// cam's `pane` role: a pane's header, for the layout's tab blocks:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "cam", "props": { "role": "pane" } } } } }
// From Herdr's shipped `pane` mod (0.1.15), cut down: the program's icon (lit while
// focused, dim otherwise), the agent's name or the terminal's title, expand arrows while
// it fills the tab (zoomed), and the agent's status; on hover, buttons split, zoom and
// close this pane. Herdr adds { pane, terminal } to its props.
// Click: focus the pane.
// It's also the focus mark (Herdr can't dim an unfocused pane, herdr-app#315): the focused
// pane's header has brighter text and its icon lit; the others keep the terminal's color
// but fade their name and icon (hover lifts them). Its height
// is ui's PANE_HEAD; layouts/cam.json sizes the header to match (22).

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, layout } from "herdr";
import { spinner, PANE_HEAD_FADE } from "./modules/ui/index.js";

// Match the first visible tab frame, including the active child of a stack.
function paneFrame(node) {
  if (!node || node.hidden) return null;
  if (node.content?.tab && node.content.pane) return node.content.pane;
  let children = node.children ?? [];
  if (node.type === "stack") {
    const visible = children.filter(child => !child.hidden);
    children = [visible.find(child => child.id === node.active) ?? visible[0]];
  }
  for (const child of children) {
    const frame = paneFrame(child);
    if (frame) return frame;
  }
  return null;
}

export class Pane extends View {
  init() { this.hovered = false; }

  me() {
    return panes().find((p) => p.pane === props()?.pane);
  }

  button(t, id, icon, command, args) {
    return div()
      .id(id)
      .p(2)
      .rounded(4)
      .text_color(t.dim)
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        run(command, args);
      })
      .child(svg(`mods/cam/icons/pane/${icon}.svg`).size(12));
  }

  render(cx) {
    const t = theme();
    const p = this.me();
    if (!p) return div();
    const name = ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell";
    const st = p.status;
    const pane = p.pane;
    const bottom = paneFrame(layout())?.header?.position === "bottom";
    // The focus mark: the program's icon (Claude, bash...). Focused, in its own colors
    // (Claude's orange), or a one-color icon (bash's) in muted gray. In other panes,
    // the sidebar's idle look, one color and dim, faded as their name is. (Outside the
    // name's fade, so a focused icon isn't faded.)
    const icon = p.program?.icon, lit = p.focused || this.hovered;
    const mark = !icon ? null
      : lit && !p.program.tint ? image(icon).size(12).flex_none()
      : svg(icon).size(12).flex_none().text_color(lit ? t.muted : t.dim).when(!lit, el => el.opacity(PANE_HEAD_FADE));
    // Just the name, and the status mark when there is one: the tab and the sidebar already
    // say where the pane is, so the icon and the folder were noise at every split.
    return h_flex()
      .id(`pane-head-${pane}`)
      .size_full()
      // 4 on the left, 6 on the right: pr(4) plus a button's p(2) before its icon.
      .pl(4)
      .pr(4)
      .gap(6)
      .items_center()
      .bg(t.background)
      .when(bottom, el => el.border_t(1))
      .when(!bottom, el => el.border_b(1))
      // Test: the line hidden in the header's own color (kept 1px, so nothing moves).
      .border_color(t.background)
      .text_size(11.5)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(mark), el => el.child(mark))
      .child(h_flex().flex_1().min_w(0).gap(6).items_center()
        .when(!(p.focused || this.hovered), el => el.opacity(PANE_HEAD_FADE))
        .child(div().min_w(0).truncate().text_color(p.focused ? t.foreground : t.muted).child(name))
        // After the name, the zoom button's expand arrows, small and dim: zoomed, filling the
        // tab and hiding the others (the tab doesn't say so).
        .when(p.zoomed, el => el.child(svg("mods/cam/icons/pane/zoom.svg").size(11).flex_none().text_color(t.dim))))
      .when(st === "working", el => el.child(spinner(t.working)))
      .when(st === "blocked", el => el.child(div().flex_none().text_size(10.5).font_semibold().text_color(t.blocked).child("Needs you")))
      .when(st === "done", el => el.child(div().size(6).flex_none().rounded(3).bg(t.done)))
      .when(this.hovered, el => el
        .child(this.button(t, `ph-r-${pane}`, "split-right", "pane.split", { direction: "right", pane }))
        .child(this.button(t, `ph-d-${pane}`, "split-down", "pane.split", { direction: "down", pane }))
        .child(this.button(t, `ph-z-${pane}`, p.zoomed ? "unzoom" : "zoom", "pane.zoom", { pane }))
        .child(this.button(t, `ph-x-${pane}`, "close", "pane.close", { pane })));
  }
}
