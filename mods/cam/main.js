// The cam layout's own parts, one mod: each block picks its part with `props.role`.
//   tabs     the tab bar (`titlebar: true`: the window's top strip instead)
//   sidebar  the spaces list, with Settings under it
//   grip     a side card's resize edge, by `edge` (and, with `drag`, its drag overlay)
//   status   the status bar
//   picker, menu, new-menu, quit, close-pane   the dialogs (dialogs.js)
//   harbor   the Harbor panel (modules/harbor); harbor-confirm, its Charter/Dismiss confirm
//
// The composition root: the only file that imports a module's entry point. Modules live
// in ./modules: `ui` (the shared look, everyone's bottom layer) and feature modules like
// `harbor`, which build on ui only. Removing one is its folder, its line here, and its
// block in the layout. mods/cam/check-boundaries.sh checks the import rules.
// Shared sizes and the sidebar toggles live in shared.js. Blocks paint no background of
// their own: the layout's nodes do, so corners and cards stay theirs.
import { View } from "gpui-kit";
import { v_flex } from "gpui-base";
import { props as herdrProps, shared, setShared, openOverlay } from "herdr";
import { Tabs } from "./tabs.js";
import { Sidebar } from "./sidebar.js";
import { Grip } from "./grip.js";
import { Pane } from "./pane.js";
import { Status } from "./status.js";
import { Picker, Menu, NewMenu, QuitConfirm, ClosePane, Confirm, Prompt } from "./dialogs.js";
import { Palette } from "./palette.js";
import { Settings } from "./settings.js";
import { Toasts } from "./toasts.js";
import { Harbor, ManifestConfirm, CONFIRM_SIZE } from "./modules/harbor/main.js";
import { FIXED, fitPanel } from "./shared.js";

// Harbor sets its own width (its expand button): the panel card is that plus its 1px
// border each side, and the expand button refits the panel.
FIXED.harbor = () => Harbor.width() + 2;
Harbor.fit = fitPanel;
// Harbor's Charter and Dismiss ask in a cam dialog.
Harbor.confirm = (ask) => openOverlay({ mod: "cam", kind: "dialog", ...CONFIRM_SIZE, props: { role: "harbor-confirm", ...ask } });

/** @typedef {import("./shared.js").CamProps} CamProps */

/** @type {Record<string, import("gpui-kit").ViewClass>} */
const ROLES = {
  tabs: Tabs, sidebar: Sidebar, grip: Grip, status: Status, pane: Pane,
  // Modules (./modules).
  harbor: Harbor, "harbor-confirm": ManifestConfirm,
  // Dialogs (dialogs.js). `mod.open:cam` opens the picker with mod.json's overlay spot.
  picker: Picker, palette: Palette, settings: Settings, toasts: Toasts, menu: Menu, "new-menu": NewMenu, quit: QuitConfirm, confirm: Confirm, prompt: Prompt, "close-pane": ClosePane,
};

export default class Cam extends View {
  /** @param {CamProps} initProps @param {import("./shared.js").AsyncCx} cx */
  init(initProps, cx) {
    // Herdr hands a block its props through props(), not init's argument.
    // No role (`herdr-app check`, which passes no props): every part, stacked, so the
    // check loads and renders them all.
    /** @type {CamProps} */
    const props = herdrProps() ?? initProps;
    // Opened by mod.open (no props but its overlay): the role a key asked for just before
    // (shared "cam.overlay", so both share mod.json's spot at the top), else the picker.
    let role = props?.role;
    if (!role && props?.overlay) {
      // Only a fresh ask counts: mod.open closes an open cam overlay instead of opening one,
      // and a stale ask would turn the next Go to into the palette.
      const ask = /** @type {{ role?: string, at: number } | null} */ (shared("cam.overlay"));
      role = ask?.role && Date.now() - ask.at < 1000 ? ask.role : "picker";
      if (ask) setShared("cam.overlay", null);
    }
    const roles = role ? [role] : Object.keys(ROLES);
    this.parts = roles.map(role => {
      const Role = ROLES[role];
      if (!Role) throw new Error(`cam: unknown role ${JSON.stringify(role)} (one of ${Object.keys(ROLES).join(", ")})`);
      const part = new Role(props);
      part.init?.(props, cx);
      return part;
    });
  }

  /** @param {import("./shared.js").Cx} cx */
  render(cx) {
    if (this.parts.length === 1) return this.parts[0].render(cx);
    return v_flex().size_full().children(this.parts.map(part => part.render(cx)));
  }
}
