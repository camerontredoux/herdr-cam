// The cam layout's terminal right-click menu (layouts/cam.json `terminal_menu`).
// Herdr sizes this popup from mod.json, so it hands off at once to the cam mod's own
// `menu` role, opened at the pointer and sized to its rows, like the tab and space menus.
import { View, div } from "gpui-kit";
import { props, terminals, openOverlay, closeOverlay } from "herdr";

// FRAME: the 1px border Herdr draws top and bottom, inside the popup's height.
const ROW = 22, GAP = 2, PAD = 4 * 2, DIVIDER = 5, FRAME = 2;

export default class CamMenu extends View {
  /** @param {unknown} _props @param {import("gpui-kit").AsyncContext} cx */
  init(_props, cx) {
    /** @type {{ overlay?: string, target?: { pane?: string, terminal?: string } }} */
    const p = props() ?? {};
    // `herdr-app check` passes no props: nothing to open.
    if (!p.overlay) return;
    const target = p.target ?? {};
    /** @type {{ address: string, parent?: string | null }[]} */
    const all = terminals();
    const term = all.find((x) => x.address === target.terminal);
    // Split right, Split down, Zoom, Close pane; right-click routing with a terminal;
    // Send back with a parent.
    const rows = 4 + (term ? 1 : 0) + (term?.parent ? 1 : 0);
    // After this popup is up: opening one from init is lost, and closing this one first
    // would end the click that opened it.
    cx.spawn(async () => {
      openOverlay({ mod: "cam", kind: "popup", width: 200, height: PAD + rows * ROW + rows * GAP + DIVIDER + FRAME,
        props: { role: "menu", tab: "pane", target } });
      closeOverlay(/** @type {string} */ (p.overlay));
    });
  }

  render() {
    return div();
  }
}
