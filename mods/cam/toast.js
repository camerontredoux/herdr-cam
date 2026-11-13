// Toasts, cam's own. Herdr draws every notification with the shipped mods/toast and
// restores that folder on each start (moving an edited one to toast-edited), and a layout
// can't pick another toast mod. So the top bar puts this version back whenever Herdr
// starts, and removes the toast-edited copies Herdr leaves.
import { readTextFile, writeTextFile, appHome, exec } from "herdr";
import { readdir } from "fs/promises";

// The file Herdr loads for every toast. It can't import cam's shared.js (another mod's
// folder), so cam's sizes are written out: a 14px mark 8 in (a row's 4 inside a 4 inset),
// 13/11.5 text. Herdr sets the toast's size (about 340 x 70): the space above and below is its.
const SOURCE = `// cam's toast (written by mods/cam/toast.js on every start; edit it there).
// In the cam layout it hands the notification to cam (shared "cam.toasts"), which draws
// it in its own floating stack, and closes at once. Elsewhere it draws itself.

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, closeOverlay, run, theme, shared, setShared } from "herdr";

const DOT = { error: "blocked", warning: "working", success: "done", info: "accent" };

export default class Toast extends View {
  init() {
    const p = props() ?? {};
    if (shared("layout") !== "cam" || !p.overlay) return;
    const note = { id: \`\${p.overlay}-\${Date.now()}\`, at: Date.now(), title: p.title ?? "", body: p.body ?? null,
      level: p.level ?? "info", icon: p.icon ?? null, action: p.action ?? null, timeout: p.timeout ?? null };
    setShared("cam.toasts", [...(shared("cam.toasts") ?? []), note].slice(-5));
    this.handed = true;
    closeOverlay(p.overlay);
  }

  render(cx) {
    if (this.handed) return div();
    const t = theme();
    const p = props() ?? {};
    return h_flex()
      .id("toast")
      .size_full()
      .px(8)
      .gap(8)
      .items_center()
      .bg(t.chrome)
      .cursor_pointer()
      .hover((s) => s.bg(t.hover))
      .on_click(() => {
        if (p.action?.name) run(p.action.name, p.action.args ?? {});
        closeOverlay(p.overlay);
      })
      .child(div().size(14).flex_none().flex().items_center().justify_center()
        .child(p.icon ? image(p.icon).size(14) : div().size(6).rounded(3).bg(t[DOT[p.level] ?? "accent"])))
      .child(
        v_flex()
          .flex_1()
          .min_w(0)
          .gap(2)
          .child(div().truncate().text_size(13).text_color(t.foreground).child(p.title ?? ""))
          .when(Boolean(p.body), (el) => el.child(div().truncate().text_size(11.5).text_color(t.dim).child(p.body ?? ""))),
      );
  }
}
`;

export async function ensureToast() {
  const home = appHome();
  const file = `${home}/mods/toast/main.js`;
  const now = await readTextFile(file);
  if (now !== null && now !== SOURCE) await writeTextFile(file, SOURCE, now);
  // Herdr's copies of an edited toast: toast-edited, toast-edited-2, ...
  for (const name of await readdir(`${home}/mods`)) {
    if (/^toast-edited(-\d+)?$/.test(name)) await exec("rm", ["-rf", `${home}/mods/${name}`]);
  }
}
