import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { props, spaces, panes, agents, run, openOverlay, window, layout, settings, shared, setShared, nextCommand } from "herdr";
import { find, agentName, toggleSidebar, toggleSidebarHidden, togglePanel, fitPanel, syncPaneArea, navigate, cardWidth, narrow } from "./shared.js";
import { TILE, ICON, INSET, spinner, colors, bar, barButton, sidebarEdge } from "./modules/ui/index.js";
import { QUIT, CLOSE_PANE, newMenuHeight, closeTab, renameTab, renameSpace } from "./dialogs.js";
import { openSettings } from "./settings.js";
import { ensureToast } from "./toast.js";
import { movePane } from "./move-pane.js";
import { startClock, clockBar, railBattery } from "./clock.js";

// The tab bar's + and Harbor buttons; false hides them (their keys still work).
const SHOW_EXTRAS = false;

/** @typedef {import("./shared.js").LayoutNode} LayoutNode */
/** @typedef {import("./shared.js").El} El */
/** @typedef {import("./shared.js").KnownAgent} KnownAgent */

export class Tabs extends View {
  /** @param {import("./shared.js").CamProps} _props @param {import("./shared.js").AsyncCx} cx */
  init(_props, cx) {
    /** @type {number | null} */
    this.pressed = null;
    /** @type {Record<string, string | null>} */
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
    if (props()?.titlebar) startClock(this, cx);
    // Keys (cam.*): the sidebar toggles, Harbor's panel, the dialogs, renames and closes.
    // Only the tab bar's copy answers: it is always shown, while the titlebar strip sits in
    // the sidebar, which can be hidden (and a hidden copy gets no commands).
    // Herdr restores its own toast on every start; put cam's back (toast.js).
    if (!props()?.titlebar) cx.spawn(async () => { try { await ensureToast(); } catch (e) { console.log("cam toast:", e); } });
    if (!props()?.titlebar) cx.spawn(async () => {
      for (;;) {
        const c = await nextCommand();
        // Space and tab keys in the sidebar's order (shared.js).
        if (navigate(c)) continue;
        // The sidebar button's toggle (to the rail and back), and hiding it outright (unbound).
        if (c === "collapse-sidebar") toggleSidebar();
        else if (c === "toggle-sidebar") toggleSidebarHidden();
        // Harbor's panel, open or closed (cmd+shift+e).
        else if (c === "toggle-harbor") togglePanel("harbor");
        // cmd+q / cmd+w open the confirms; a second press inside them is "confirm" (mod:cam).
        else if (c === "palette") { setShared("cam.overlay", { role: "palette", at: Date.now() }); run("mod.open", { name: "cam" }); }
        else if (c === "close-tab") { const tab = spaces().find(s => s.active)?.tabs.find(x => x.active); if (tab) closeTab(tab.id); }
        else if (c === "settings") openSettings();
        else if (c === "rename-tab") { const tab = spaces().find(s => s.active)?.tabs.find(x => x.active); if (tab) renameTab(tab.id); }
        else if (c === "rename-space") { const s = spaces().find(x => x.active); if (s) renameSpace(s.id); }
        else if (c === "quit") openOverlay({ mod: "cam", ...QUIT, props: { role: "quit" } });
        else if (c === "close-pane") openOverlay({ mod: "cam", ...CLOSE_PANE, props: { role: "close-pane" } });
        // cmd+alt+shift+arrows: swap with the pane that way, or move to that side (move-pane.js).
        else if (c?.startsWith("move-pane-")) {
          const dir = /** @type {"left" | "right" | "up" | "down"} */ (c.slice("move-pane-".length));
          try { await movePane(dir, (ms) => new Promise(r => cx.timer.after(ms, () => r(undefined)))); }
          catch (e) { console.log("cam move-pane:", e); }
        }
      }
    });
  }

  // The side panel is remembered per space: switching shows that space's choice
  // (closed if it never had one), and opening or closing it records it.
  /** @param {import("./shared.js").Space} space @param {LayoutNode} panel @param {LayoutNode} body @param {string[]} enabled */
  syncPanel(space, panel, body, enabled) {
    if (!space || !panel) return;
    const now = panel.hidden ? null : body?.active ?? null;
    if (space.id !== this.space) {
      const first = this.space === undefined;
      /** @type {string} */
      this.space = space.id;
      /** @type {{ want: string | null, until: number } | null} */
      this.pending = null;
      if (!(first && !(space.id in this.panels))) {
        const stored = this.panels[space.id] ?? null, want = enabled.includes(stored) ? stored : null;
        if (want !== now) {
          this.pending = { want, until: Date.now() + 1000 };
          if (want) { run("layout.select", { stack: "panel-body", child: want }); run("layout.show", { id: "panel" }); }
          else run("layout.hide", { id: "panel" });
          return;
        }
      }
    }
    // Until the restore lands (or something else won), the old state isn't a choice.
    if (this.pending) {
      if (this.pending.want !== now && Date.now() < this.pending.until) return;
      this.pending = null;
    }
    if (this.panels[space.id] === now) return;
    this.panels[space.id] = now;
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  render() {
    const t = colors();
    const space = spaces().find(p => p.active);
    const shown = space?.tabs ?? [];
    /** @param {unknown} _e @param {import("./shared.js").Cx} cx */
    const stop = (_e, cx) => cx.stop_propagation();
    /** @param {string} id @param {El | string} label @param {() => void} action */
    const button = (id, label, action) => div().id(id).size(TILE).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).hover(s => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action).child(label);
    /** @param {import("./shared.js").Tab} c @param {number} i */
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      // Unnamed: its agent's name, as the sidebar shows it (the focused one in a split).
      const tabAgents = agents().filter(a => a.tab === c.id), agent = tabAgents.find(a => a.focused) ?? tabAgents[0];
      // Pane headers show on every pane of the shown split tab, zoomed or not (pane.js):
      // they carry each pane's status, so the tab drops its own (a hidden tab keeps it).
      const headers = c.active && c.panes > 1;
      const name = c.named ? c.name : agent ? agentName(agent) : program?.name ?? c.name;
      return h_flex().id(`tab-${c.id}`).h(TILE).px((TILE - 14) / 2).gap(6).rounded(6).items_center().flex_none().text_size(12)
        .border(1).border_color(c.active ? t.raised : t.chrome).bg(c.active ? t.raised : t.chrome).text_color(c.active ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover))
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) renameTab(c.id); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: space.tabs.findIndex(x => x.id === c.id) + 1 });
          else run("tab.select", { id: c.id });
        })
        .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "cam", kind: "popup", width: 200, height: 4 * 2 + 3 * 22 + 2 * 2 + 5, props: { role: "menu", tab: "tab", target: { id: c.id, space: space.id } } }); })
        // A split tab's pane headers each show their program's icon, so the tab doesn't,
        // selected or not (it'd jump in width as you switched to it).
        .when(Boolean(program?.icon) && c.panes < 2, el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(name))
        // The shown tab's pane headers already show each pane's status when it's split.
        .when(c.status === "working" && !headers, el => el.child(spinner(t.working)))
        .when((c.status === "blocked" || c.status === "done") && !headers, el => el.child(div().size(6).rounded(3).bg(t[c.status])))
        .when(c.active, el => el.child(div().id(`close-${c.id}`).text_color(t.dim).on_mouse_down("left", stop).on_click((_e, cx) => { cx.stop_propagation(); closeTab(c.id); }).child(svg("mods/pane/close.svg").size(12))));
    };
    const root = /** @type {LayoutNode} */ (layout()), w = window();
    // In a window macOS draws its 1px border over the bar's top, so the gap above the tabs
    // looks 1 smaller than the gap below; move the contents down 1 to even them out
    // (as sidebarPr does on the right, shared.js). Fullscreen has no border.
    const topInset = w?.platform === "macos" && !w.fullscreen ? 1 : 0;
    // A split tab shows its panes in main-split (hairlines between them); a single or
    // zoomed pane in main.
    if (!props()?.titlebar) {
      const tab = space?.tabs.find(c => c.active);
      syncPaneArea(Boolean(tab && !tab.zoomed && panes().filter(p => p.tab === tab.id).length > 1));
    }
    const windowButtons = () => [
      button("minimize", w.platform === "windows" ? svg("mods/cam/icons/win-min.svg").size(16) : "−", () => run("window.minimize")),
      button("maximize", w.platform === "windows" ? svg(`mods/cam/icons/${w.maximized ? "win-restore" : "win-max"}.svg`).size(16) : "□", () => run("window.maximize")),
      button("tabbar-close-window", w.platform === "windows" ? svg("mods/cam/icons/win-close.svg").size(16) : svg("mods/pane/close.svg").size(13), () => run("window.close")),
    ];
    // Two roles, both at the window's top edge (to drag the window by), side by side like
    // the columns under them. Over the sidebar: an empty strip under the macOS window
    // buttons. Over the main area: the tabs, with the drawn window buttons (Linux, Windows).
    // Where the tabs may start, in window px: past the macOS window buttons (52 wide) by
    // their own left inset, so the gap after the green button matches the window edge's.
    const lights = w?.platform === "macos" && !w.fullscreen && root?.traffic_lights;
    const lightsEnd = lights ? root.traffic_lights[0] + 52 / (/** @type {number} */ (settings().zoom) || 1) + root.traffic_lights[0] + 1 : 0;
    const side = find(root, "sidebar"), sideShown = Boolean(side && !side.hidden);
    const underLights = Boolean(lights && narrow());
    if (props()?.titlebar) {
      // Over the rail, under the window buttons: the tab bar carried across (its color and
      // its bottom line), with no hairline or shadow to cross the buttons.
      if (underLights) return div().size_full().bg(t.chrome).border_b(1).border_color(t.border);
      // In fullscreen (no window buttons, no menu bar): the clock and battery; over the
      // rail, too narrow for them, the battery icon alone.
      return div().relative().size_full().child(sidebarEdge(t))
        .when(Boolean(w?.fullscreen), el => el.child(narrow() ? railBattery(t, this.battery) : clockBar(t, this.battery)));
    }
    const panel = find(root, "panel"), body = find(root, "panel-body");
    const enabled = [.../** @type {string[]} */ (shared("workspace.panels") ?? ["files", "changes"]), "harbor"];
    this.syncPanel(space, panel, body, enabled);
    fitPanel();
    /** @param {string} id @param {string} label @param {string} icon */
    const panelButton = (id, label, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return barButton(t, `panel-${id}`, Boolean(on)).on_mouse_down("left", stop)
        .on_click(() => togglePanel(id)).child(svg(icon).size(ICON)).child(label);
    };
    // The tabs start after the window buttons when the main area runs under them (the rail
    // or the sidebar hidden): the main area starts after the shown sidebar (its hairline is
    // inside its width).
    const workLeft = sideShown ? (cardWidth("sidebar") ?? 0) : 0;
    return bar(t, "below").pt(topInset).pl(Math.max(INSET, lightsEnd - workLeft))
      .on_mouse_up("left", () => { this.pressed = null; })
      .child(h_flex().id("tabbar-scroll").flex_1().min_w(0).h_full().items_center().gap(3).overflow_x_scrollbar().children(shown.map(item)))
      .when(SHOW_EXTRAS, el => el.child(button("tabbar-new", svg("mods/workspace-chrome/plus.svg").size(14), () => openOverlay({ mod: "cam", kind: "popup", width: 250, height: newMenuHeight((/** @type {Record<string, KnownAgent[]>} */ (shared("new-menu.agents")) ?? {})[space?.machine ?? ""]?.length ?? 1), props: { role: "new-menu" } }))))
      .when(enabled.includes("files"), el => el.child(panelButton("files", "Files", "mods/files/file.svg")))
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .when(SHOW_EXTRAS, el => el.child(panelButton("harbor", "Harbor", "mods/cam/modules/harbor/icons/anchor.svg")))
      .when(Boolean(w?.buttons), el => el.children(windowButtons()));
  }
}
