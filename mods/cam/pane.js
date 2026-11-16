// cam's `pane` role: a pane's header, for the layout's tab blocks:
//   { "tab": "active", "pane": { "header": { "content": { "mod": "cam", "props": { "role": "pane" } } } } }
// From Herdr's shipped `pane` mod (0.1.15), cut down: the program's icon (lit while
// focused, dim otherwise), the agent's name or the terminal's title, expand arrows while
// it fills the tab (zoomed), and the agent's status; on hover, buttons split, zoom and
// close this pane. Herdr adds { pane, terminal } to its props.
// Click: focus the pane. A canvas pane's name is followed by the canvas's size on disk
// (drawing.json and its pasted images), dim, read again whenever the canvas folder changes.
// It's also the focus mark (Herdr can't dim an unfocused pane, herdr-app#315): the focused
// pane's header has brighter text and its icon lit; the others keep the terminal's color
// but fade their name and icon (hover lifts them). Its height
// is ui's PANE_HEAD; layouts/cam.json sizes the header to match (22).

import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { panes, props, run, theme, appHome, checking, exec, watchFolder } from "herdr";
import { spinner, PANE_HEAD_FADE } from "./modules/ui/index.js";

/** The canvas's bytes on disk: its drawing and pasted images (view.json and bad copies left out). */
// Herdr's fs has no stat, so macOS's stat lists the sizes (missing files print nothing).
async function canvasBytes() {
  const r = await exec("/bin/sh", ["-c", 'cd "$1" && /usr/bin/stat -f %z drawing.json images/* 2>/dev/null; true', "sh",
    `${appHome()}/data/canvas`], { timeout: 5000 });
  return r.stdout.split("\n").reduce((a, l) => a + (Number(l) || 0), 0);
}

/** 1234 -> "1.2 KB", 5.4e6 -> "5.4 MB". */
function bytes(n) {
  if (n < 1000) return `${n} B`;
  const [v, u] = n < 1e6 ? [n / 1e3, "KB"] : n < 1e9 ? [n / 1e6, "MB"] : [n / 1e9, "GB"];
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${u}`;
}

export class Pane extends View {
  /** @param {unknown} _props @param {import("./shared.js").AsyncCx} cx */
  init(_props, cx) {
    this.hovered = false;
    /** @type {number | null} */ this.canvasSize = null;
    // No disk reads in a check (checking()), and none for panes that aren't the canvas.
    if (checking() || this.me()?.mod !== "canvas") return;
    // Measure once, then again after each change in the folder (a save, a pasted image).
    // Closing the pane cancels the pending watch.
    cx.spawn(async (cx) => {
      for (;;) {
        const n = await canvasBytes().catch(() => null);
        if (n !== null && n !== this.canvasSize) { this.canvasSize = n; cx.notify(); }
        await watchFolder(`${appHome()}/data/canvas`);
      }
    });
  }

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
      .text_size(11.5)
      .on_hover((hovered, cx) => { this.hovered = hovered; cx.notify(); })
      .on_click(() => run("pane.focus", { pane }))
      .when(Boolean(mark), el => el.child(mark))
      .child(h_flex().flex_1().min_w(0).gap(6).items_center()
        .when(!(p.focused || this.hovered), el => el.opacity(PANE_HEAD_FADE))
        .child(div().min_w(0).truncate().text_color(p.focused ? t.foreground : t.muted).child(name))
        .when(p.mod === "canvas" && this.canvasSize !== null, el => el
          .child(div().flex_none().text_color(t.dim).child(`(${bytes(this.canvasSize ?? 0)})`)))
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
