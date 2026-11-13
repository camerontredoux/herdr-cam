import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, run } from "herdr";
import { shortcut } from "./dialogs.js";
import { colors, bar, TEXT_BAR_PAD } from "./modules/ui/index.js";

export class Status extends View {
  // The palette key as bound (cam's, else Herdr's); without one, just "commands".
  hint() {
    const key = shortcut("cam.palette") || shortcut("app.palette");
    return key ? `${key}  commands` : "commands";
  }

  render() {
    const t = colors();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    /** @param {string} icon @param {string} text */
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return bar(t, "above").px(TEXT_BAR_PAD).gap(16).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .child(div().id("status-palette").text_color(t.dim).on_click(() => run("cam.palette")).child(this.hint()));
  }
}
