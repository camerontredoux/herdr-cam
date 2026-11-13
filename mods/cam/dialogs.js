// The cam layout's dialogs, in its look (shared.js): rows a tile tall, insets of 4, corners
// of 6, dim 11.5 titles. Herdr draws the frame; each fills it with `panel`.
//   picker       Go to… (mod.open:cam, or the top bar's search button)
//   menu         right-click menus: props { tab: "tab" | "space" | "pane" | "global", target }
//   new-menu     the tab bar's +
//   quit         asks before quitting (cmd+q; a second cmd+q or Enter quits)
//   close-pane   cmd+w twice closes the focused pane

import { div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { View } from "gpui-kit";
import {
  agents, spaces, terminals, panes, run, hc, exec, settings, props, closeOverlay, openOverlay,
  keys, window, knownAgents, shared, setShared, focused, nextCommand, notify,
} from "herdr";
import { spaceMark } from "./shared.js";
import { TILE, ICON, INSET, GAP, row, heading, hint, divider, panel, spinner, colors, titleBar, dialogButton as button } from "./modules/ui/index.js";

/** @typedef {import("./shared.js").Theme} Theme */
/** @typedef {import("./shared.js").El} El */
/** @typedef {import("./shared.js").AsyncCx} AsyncCx */
/** @typedef {import("./shared.js").Space} Space */
/** @typedef {import("./shared.js").Tab} Tab */
/** @typedef {import("./shared.js").Agent} Agent */
/** @typedef {import("./shared.js").Terminal} Terminal */
/** @typedef {import("./shared.js").CamProps} CamProps */
/** @typedef {import("./shared.js").KnownAgent} KnownAgent */
/** @typedef {import("herdr").Status} Status */
/** @typedef {import("herdr").OverlaySpec} OverlaySpec */
/** One line of Go to…: a space's heading, one of its tabs, the "earlier" fold, or a New row.
 * @typedef {{ kind: "head", w: Space }
 *   | { kind: "ctx", w: Space, ctx: Tab, mine: Agent[], team: number }
 *   | { kind: "earlier", count: number }
 *   | { kind: "new" }
 *   | { kind: "space", machine: string | null }} PickRow */
/** A menu's arguments: what its command acts on.
 * @typedef {{ id?: string, space?: string, pane?: string, terminal?: string, to?: string, direction?: string, action?: string }} MenuArgs */
/** A menu item: [label, command, args]. @typedef {[string, string, MenuArgs]} MenuItem */

const ICONS = "mods/workspace-chrome";

// The key bound to a command, as the keyboard shows it (⌘⇧T, Ctrl+Shift+T).
/** @param {string} name @param {Record<string, unknown>} [args] */
export function shortcut(name, args) {
  const value = args && Object.values(args)[0];
  const k = keys().find(b => b.section === "global" && (b.action === name || b.action === `${name}:${value}`));
  if (!k?.keys.trim()) return "";
  const mac = window()?.platform === "macos";
  /** @type {Record<string, string>} */
  const names = mac ? { ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘" } : { ctrl: "Ctrl", alt: "Alt", shift: "Shift", cmd: "Super" };
  return k.keys.trim().split(/\s+/).map(stroke => {
    const parts = stroke.split("-");
    let key = parts.pop();
    if (key === "") { key = "-"; parts.pop(); }
    const held = new Set(parts.map(m => m.toLowerCase()));
    const label = key.length === 1 ? key.toUpperCase() : key[0].toUpperCase() + key.slice(1).toLowerCase();
    return [...Object.keys(names).filter(m => held.has(m)).map(m => names[m]), label].join(mac ? "" : "+");
  }).join(" ");
}

// ---------------------------------------------------------------------------------------
// Go to…: tabs grouped by space, busy spaces first, quiet ones folded into "earlier".
// Type to filter, ↑/↓ and Enter to go, ctrl+d to close a tab, Esc to leave.

const STEP = TILE + GAP;
const H = { head: TILE, earlier: TILE, new: TILE, space: TILE, ctx: TILE };
const LIST_MAX = 340;

export class Picker extends View {
  /** @param {CamProps} _props @param {AsyncCx} cx */
  init(_props, cx) {
    this.filter = "";
    this.input = InputState.new({ placeholder: "Go to a tab, space or agent…" });
    this.input.on("change", (_e, cx) => { this.filter = this.input.value(); this.at = 0; cx.notify(); });
    this.input.on("submit", () => this.go(this.pickable(this.rows())[this.at]));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.at = null;
    this.scroll = 0;
    this.showEarlier = false;
    /** @type {string[]} */
    this.machines = [];
    this.handle = cx.focus_handle();
    cx.spawn(async cx => {
      try {
        const r = await hc(["machine", "ls", "--json"]);
        if (r.code === 0) this.machines = (/** @type {{ machines?: { name: string, state: string, temporary?: boolean }[] }} */ (JSON.parse(r.stdout)).machines ?? []).filter(m => m.state === "connected" && !m.temporary).map(m => m.name);
      } catch {}
      cx.notify();
    });
  }

  close() { closeOverlay(props().overlay); }

  /** @param {PickRow[]} rows */
  pickable(rows) { return rows.filter(r => r.kind === "ctx" || r.kind === "new" || r.kind === "space"); }

  rows() {
    const f = this.filter.toLowerCase();
    const all = agents();
    const live = /** @type {Terminal[]} */ (terminals()).filter(x => x.state === "live");
    /** @param {string[]} addrs */
    const teamOf = addrs => {
      let n = 0;
      /** @param {string} a */
      const walk = a => live.filter(x => x.parent === a).forEach(k => (n++, walk(k.address)));
      addrs.forEach(walk);
      return n;
    };
    const groups = spaces().map(w => {
      const ctxs = w.tabs
        .map(ctx => {
          const mine = all.filter(a => a.tab === ctx.id);
          return { w, ctx, mine, team: teamOf(mine.map(a => a.address)) };
        })
        .filter(c => !f || [w.name, c.ctx.name, ...c.mine.map(a => a.program?.name ?? "")].join(" ").toLowerCase().includes(f));
      return { w, ctxs };
    });
    const busy = groups.filter(p => p.w.status && p.ctxs.length);
    const quiet = groups.filter(p => !p.w.status && p.ctxs.length);
    busy.sort((a, b) => Number(b.w.status === "blocked") - Number(a.w.status === "blocked"));
    /** @type {PickRow[]} */
    const out = [];
    /** @param {{ w: Space, ctxs: { w: Space, ctx: Tab, mine: Agent[], team: number }[] }} p */
    const add = p => {
      out.push({ kind: "head", w: p.w });
      for (const c of p.ctxs) out.push({ kind: "ctx", ...c });
    };
    busy.forEach(add);
    if (quiet.length) {
      out.push({ kind: "earlier", count: quiet.length });
      if (this.showEarlier || f) quiet.forEach(add);
    }
    out.push({ kind: "new" });
    out.push({ kind: "space", machine: null });
    for (const m of this.machines) out.push({ kind: "space", machine: m });
    return out;
  }

  /** @param {PickRow} r */
  go(r) {
    if (!r) return;
    this.close();
    if (r.kind === "ctx") run("tab.select", { id: r.ctx.id });
    else if (r.kind === "new") run("tab.new");
    else if (r.kind === "space") run("space.new", { machine: r.machine ?? "" });
  }

  /** @param {Theme} t @param {Status | null} st */
  glyph(t, st) {
    if (st === "working") return spinner(t.working);
    return div().w(12).flex_none().text_size(11).text_color(t[st] ?? t.dim).child(st === "idle" ? "○" : st ? "●" : "·");
  }

  /** @param {Theme} t @param {PickRow} r @param {boolean} on */
  line(t, r, on) {
    if (r.kind === "head") {
      return h_flex().h(TILE).flex_none().px((TILE - ICON) / 2 - 1).gap(8).items_center().text_size(11.5).text_color(t.dim)
        .child(spaceMark(t, r.w)).child(div().truncate().child(r.w.name));
    }
    if (r.kind === "earlier") {
      return h_flex().id("pks-earlier").h(TILE).flex_none().px(10 - INSET).items_center().rounded(6).text_size(11.5).text_color(t.dim)
        .cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => { this.showEarlier = !this.showEarlier; cx.notify(); })
        .child(`Earlier: ${r.count} quiet space${r.count > 1 ? "s" : ""} ${this.showEarlier ? "▴" : "▾"}`);
    }
    if (r.kind === "new" || r.kind === "space") {
      const label = r.kind === "new" ? "New tab" : r.machine ? `New space on ${r.machine}` : "New space";
      return row(t, r.kind === "new" ? "pks-new" : `pks-space-${r.machine ?? "here"}`, on).text_color(t.muted)
        .on_click(() => this.go(r))
        .child(svg(`${ICONS}/plus.svg`).size(ICON).flex_none()).child(div().flex_1().child(label))
        .when(r.kind === "new", el => el.child(hint(t, shortcut("tab.new"))));
    }
    const who = r.mine.map(a => a.program?.name ?? "agent").join(" · ");
    const here = r.w.active && r.ctx.active;
    return row(t, `pk-${r.ctx.id}`, on)
      .on_click(() => this.go(r))
      .child(h_flex().w(ICON).flex_none().justify_center().child(this.glyph(t, r.ctx.status)))
      .child(div().flex_1().min_w(0).truncate().when(here, d => d.font_semibold()).child(r.ctx.name))
      .when(r.ctx.status === "blocked", el => el.child(div().flex_none().text_size(11.5).text_color(t.blocked).child("needs you")))
      .when(r.ctx.status === "done", el => el.child(div().flex_none().text_size(11.5).text_color(t.done).child("finished")))
      .child(hint(t, who + (r.team ? `  +${r.team}` : "")));
  }

  render() {
    const t = colors();
    const rows = this.rows();
    const pickable = this.pickable(rows);
    // Opens on where you are.
    if (this.at === null) this.at = Math.max(0, pickable.findIndex(r => r.kind === "ctx" && r.w.active && r.ctx.active));
    this.at = Math.min(this.at, pickable.length - 1);
    const sel = pickable[this.at];
    // One strip, each row at a fixed y, a step apart. Scrolling moves the strip only as far
    // as it takes to keep the selected row in view.
    const tops = rows.map((_r, i) => i * STEP);
    const total = rows.length * STEP - GAP;
    const height = Math.min(LIST_MAX, this.listHeight ?? LIST_MAX);
    const fixed = total > height;
    const maxScroll = Math.max(0, total - height);
    this.scroll = Math.max(0, Math.min(this.scroll, maxScroll));
    const si = rows.indexOf(sel);
    if (si >= 0) {
      if (tops[si] < this.scroll) this.scroll = tops[si];
      if (tops[si] + TILE > this.scroll + height) this.scroll = tops[si] + TILE - height;
    }
    /** @param {number} i */
    const visible = i => !fixed || (tops[i] + TILE > this.scroll && tops[i] < this.scroll + height);
    /** @param {El} el @param {number} i */
    const place = (el, i) => fixed ? el.absolute().left(0).right(0).top(tops[i] - this.scroll) : el;

    return panel(t, "picker")
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (k === "down") this.at = (this.at + 1) % pickable.length;
        else if (k === "up") this.at = (this.at + pickable.length - 1) % pickable.length;
        else if (k === "d" && e.modifiers.control) {
          if (sel?.kind === "ctx") { this.close(); closeTab(sel.ctx.id); }
        } else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(titleBar(t, "Go to"))
      .child(h_flex().h(28).flex_none().px((TILE - ICON) / 2).gap(8).items_center().rounded(6).border_1().border_color(t.input).bg(t.background)
        .child(svg(`${ICONS}/search.svg`).size(ICON).flex_none().text_color(t.dim))
        .child(Input.new(this.input).flex_1().h_full().text_size(13).text_color(t.foreground)))
      .child(v_flex().id("pk-list").relative().mt(GAP)
        .on_size_change((size, cx) => { this.listHeight = size.height / (/** @type {number} */ (settings().zoom) || 1); cx.notify(); })
        .h(Math.min(LIST_MAX, total)).min_h(0).gap(GAP)
        .when(fixed, el => el.overflow_hidden().on_scroll_wheel((e, cx) => {
          this.scroll = Math.max(0, Math.min(this.scroll - e.delta.y, maxScroll));
          // The selection follows the wheel, so the next frame doesn't scroll back to it.
          while (this.at < pickable.length - 1 && tops[rows.indexOf(pickable[this.at])] < this.scroll) this.at++;
          while (this.at > 0 && tops[rows.indexOf(pickable[this.at])] + TILE > this.scroll + height) this.at--;
          cx.notify();
        }))
        .children(rows.map((r, i) => (visible(i) ? place(this.line(t, r, r === sel), i) : null)).filter(Boolean)));
  }
}

// ---------------------------------------------------------------------------------------
// Right-click menus. ↑/↓ move, Enter runs, Esc closes. An item is [label, command, args];
// the command "worktree" opens Herdr's worktree dialog instead.

/** @param {Space} s */
function placeOf(s) {
  const tabs = new Set((s.tabs ?? []).map(c => c.id));
  return panes().find(p => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}

// A space's checkout: "main" (a repo's own), "linked" (a worktree), or null.
/** @param {string} folder @param {string | null} on @returns {Promise<"main" | "linked" | null>} */
async function checkout(folder, on) {
  const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: folder, on });
  const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder, on });
  if (top.code !== 0 || common.code !== 0) return null;
  return common.stdout.trim() === `${top.stdout.trim()}/.git` ? "main" : "linked";
}

/** @param {CamProps} p @param {string | null} git @returns {MenuItem[]} */
function menuItems(p, git) {
  p = p ?? {};
  const tg = p.target ?? {};
  switch (p.tab) {
    case "pane": {
      /** @type {Terminal[]} */
      const all = terminals();
      const term = all.find(x => x.address === tg.terminal);
      const parent = term?.parent && all.find(x => x.address === term.parent);
      const toProgram = term?.labels?.["herdr.right-click"] === "program";
      return [
        ["Split right", "pane.split", { direction: "right", pane: tg.pane }],
        ["Split down", "pane.split", { direction: "down", pane: tg.pane }],
        ["Zoom", "pane.zoom", { pane: tg.pane }],
        ...(term ? /** @type {MenuItem[]} */ ([toProgram
          ? ["Right-clicks to menu", "terminal.right_click", { terminal: term.address, to: "menu" }]
          : ["Right-clicks to program", "terminal.right_click", { terminal: term.address, to: "program" }]]) : []),
        ...(parent ? /** @type {MenuItem[]} */ ([[`Send back to ${parent.name || parent.address}`, "terminal.park", { terminal: term.address }]]) : []),
        ["Close pane", "pane.close", { pane: tg.pane }],
      ];
    }
    case "tab":
      return [
        ["Rename", "tab.rename", { id: tg.id }],
        ["New tab", "tab.new", { space: tg.space }],
        ["Close", "tab.close", { id: tg.id }],
      ];
    case "space":
      return [
        ["Rename", "space.rename", { id: tg.id }],
        ...(git ? /** @type {MenuItem[]} */ ([["New worktree", "worktree", { space: tg.id, action: "new" }], ["Open worktree", "worktree", { space: tg.id, action: "open" }]]) : []),
        ...(git === "linked" ? /** @type {MenuItem[]} */ ([["Remove worktree", "worktree", { space: tg.id, action: "remove" }]]) : []),
        ["Close", "space.close", { id: tg.id }],
      ];
    default:
      return [
        ["New space", "space.new", {}],
        ["Keybinds", "app.help", {}],
      ];
  }
}

/** @param {string} command */
function menuIcon(command) {
  const name = command.endsWith(".close") ? "x" : command.endsWith(".rename") ? "square-pen" : command.endsWith(".new") ? "plus"
    : command === "worktree" ? "git-branch" : command === "pane.split" ? "panel-right" : command === "pane.zoom" ? "square" : "terminal";
  return `${ICONS}/${name}.svg`;
}

export class Menu extends View {
  /** @param {CamProps} _props @param {AsyncCx} cx */
  init(_props, cx) {
    this.at = 0;
    this.git = null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    /** @type {CamProps} */
    const p = props();
    const space = p?.tab === "space" && spaces().find(s => s.id === p.target?.id);
    const folder = space && placeOf(space);
    if (folder) cx.spawn(async cx => {
      this.git = await checkout(folder, /** @type {Space} */ (space).machine).catch(() => null);
      cx.notify();
    });
  }

  /** @param {number} i */
  choose(i) {
    const it = menuItems(props(), this.git)[i];
    if (!it) return;
    closeOverlay(props()?.overlay);
    if (it[1] === "tab.rename") renameTab(it[2].id);
    else if (it[1] === "space.rename") renameSpace(it[2].id);
    else if (it[1] === "tab.close") closeTab(it[2].id);
    else if (it[1] === "space.close") closeSpace(it[2].id);
    // The last pane closes its tab, and the last tab its space: cam's confirm, not Herdr's.
    else if (it[1] === "pane.close") closePane(it[2].pane);
    else if (it[1] === "worktree") openOverlay({ mod: "worktree", kind: "dialog", ...(it[2].action === "open" ? { width: 560, height: 480 } : { width: 440, height: 260 }), props: it[2] });
    else run(it[1], it[2]);
    // From here on a plain right-click goes to the program, so this menu is hidden behind
    // Shift+right-click: say so, and let the toast undo it.
    if (it[1] === "terminal.right_click" && it[2].to === "program") notify({
      title: "Right-clicks go to the program", timeout: 8000,
      body: "Shift+right-click opens this menu again. Click here to undo.",
      action: { name: "terminal.right_click", args: { terminal: it[2].terminal, to: "menu" } },
    });
  }

  render() {
    const t = colors();
    const list = menuItems(props(), this.git);
    // Fill the popup and center the rows, so any spare height splits evenly above and below.
    return panel(t, "menu").h_full().justify_center()
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % list.length;
        else if (e.key === "up") this.at = (this.at + list.length - 1) % list.length;
        else if (e.key === "enter") this.choose(this.at);
        else if (e.key === "escape") closeOverlay(props().overlay);
        else return;
        cx.notify();
      })
      .children(list.flatMap((it, i) => [
        // A line before the ones that end something.
        ...(i > 0 && (it[1].endsWith(".close") || it[1] === "app.help") ? [divider(t)] : []),
        row(t, `mi-${i}`, i === this.at)
          .on_click(() => this.choose(i))
          .child(svg(menuIcon(it[1])).size(ICON).flex_none().text_color(it[1].endsWith(".close") ? t.blocked : t.muted))
          .child(div().flex_1().child(it[0]))
          .child(hint(t, shortcut(it[1], it[2]))),
      ]));
  }
}

// ---------------------------------------------------------------------------------------
// The tab bar's +: a terminal, an installed agent (1–9 picks one), a space, a worktree.

const KNOWN = "new-menu.agents";

export class NewMenu extends View {
  /** @param {CamProps} _props @param {AsyncCx} cx */
  init(_props, cx) {
    const machine = spaces().find(s => s.active)?.machine;
    const where = machine ?? "";
    /** @type {KnownAgent[]} */
    this.agents = /** @type {Record<string, KnownAgent[]>} */ (shared(KNOWN))?.[where] ?? [];
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.spawn(async cx => {
      try {
        this.agents = await knownAgents({ on: machine });
        setShared(KNOWN, { .../** @type {Record<string, KnownAgent[]>} */ (shared(KNOWN)), [where]: this.agents });
      } catch { this.failed = true; }
      cx.notify();
    });
  }

  /** @param {Theme} t @param {string} id @param {El} icon @param {string} name @param {() => void} action
   *  @param {string} [right] @param {boolean} [enabled] */
  item(t, id, icon, name, action, right = "", enabled = true) {
    return row(t, id).when(!enabled, el => el.text_color(t.dim).cursor_default().hover(s => s.bg(t.chrome)))
      .on_click(() => { if (enabled) { closeOverlay(props().overlay); action(); } })
      .child(h_flex().w(ICON).flex_none().justify_center().child(icon)).child(div().flex_1().truncate().child(name)).child(hint(t, right));
  }

  render() {
    const t = colors();
    const space = spaces().find(s => s.active);
    const installed = this.agents.filter(a => a.installed);
    const choices = [...installed, ...this.agents.filter(a => !a.installed).slice(0, 2)];
    const cwd = panes().find(p => p.focused)?.cwd;
    /** @param {string} action @param {number} width @param {number} height */
    const worktree = (action, width, height) => () => openOverlay({ mod: "worktree", kind: "dialog", width, height, props: { space: space?.id, folder: cwd, action } });
    return panel(t, "new-menu")
      .track_focus(this.handle)
      .on_key_down(e => {
        if (e.modifiers.control || e.modifiers.platform || e.modifiers.alt) return;
        const agent = /^[1-9]$/.test(e.key) ? installed[Number(e.key) - 1] : null;
        if (!agent) return;
        closeOverlay(props().overlay);
        run("tab.new", { name: agent.name, space: space?.id, argv: agent.run });
      })
      .child(this.item(t, "nms-terminal", svg("icons/shell.svg").size(ICON), "Terminal", () => run("tab.new", { space: space?.id }), shortcut("tab.new")))
      .child(heading(t, "Start an agent"))
      .children(choices.map((a, i) => this.item(t, `nm-${a.key}`, a.tint ? svg(a.icon).size(ICON).text_color(t.foreground) : image(a.icon).size(ICON), a.name,
        () => run("tab.new", { name: a.name, space: space?.id, argv: a.run }), a.installed ? (i < 9 ? String(i + 1) : "") : "not installed", a.installed)))
      .when(this.agents.length === 0, el => el.child(h_flex().h(TILE).px(10 - INSET).items_center().text_color(t.dim)
        .child(this.failed ? "Could not load agents" : "Checking installed agents…")))
      .child(divider(t))
      .child(this.item(t, "nms-space", svg(`${ICONS}/plus.svg`).size(ICON), "New space", () => run("space.new"), shortcut("space.new")))
      .child(this.item(t, "nms-worktree", svg(`${ICONS}/branch.svg`).size(ICON), "New worktree…", worktree("new", 460, 280), "", Boolean(space)))
      .child(this.item(t, "nms-worktree-open", svg(`${ICONS}/branch.svg`).size(ICON), "Open worktree…", worktree("open", 560, 480), "", Boolean(space)));
  }
}

// How tall the + menu is for a number of agent rows: rows, title, divider, insets.
/** @param {number} agentRows */
export const newMenuHeight = agentRows => INSET * 2 + (5 + Math.max(1, agentRows)) * TILE + (5 + Math.max(1, agentRows)) * GAP + 5;

// ---------------------------------------------------------------------------------------
// Confirms. Quit: Enter or a second cmd+q quits, Esc cancels.
// Close pane: a second cmd+w within 1.5 s closes the pane that was focused; anything else cancels.

export class QuitConfirm extends View {
  /** @param {CamProps} _props @param {AsyncCx} cx */
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.spawn(async () => { for (;;) if ((await nextCommand()) === "confirm") this.yes(); });
  }

  yes() { closeOverlay(props().overlay); run("app.quit"); }
  no() { closeOverlay(props().overlay); }

  render() {
    const t = colors();
    return panel(t, "quit").size_full()
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "enter") this.yes();
        else if (e.key === "escape") this.no();
        else return;
        cx.stop_propagation();
      })
      .child(titleBar(t, "Quit Herdr?"))
      .child(div().flex_1().min_h(0).px(10 - INSET).text_color(t.muted).child("Your terminals and agents keep running."))
      .child(h_flex().justify_end().gap(4).child(button(t, "quit-no", "Cancel", false, () => this.no())).child(button(t, "quit-yes", "Quit", true, () => this.yes())));
  }
}

export class ClosePane extends View {
  /** @param {CamProps} _props @param {AsyncCx} cx */
  init(_props, cx) {
    this.pane = focused()?.pane ?? null;
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(1500, () => this.cancel());
    cx.spawn(async () => { for (;;) if ((await nextCommand()) === "confirm") this.confirm(); });
  }

  confirm() {
    closeOverlay(props().overlay);
    if (this.pane) closePane(this.pane);
  }

  cancel() { closeOverlay(props().overlay); }

  render() {
    const t = colors();
    return panel(t, "close-pane").size_full().justify_center()
      .track_focus(this.handle)
      // The second cmd+w arrives as "confirm" (mod:cam); any other key cancels.
      .on_key_down((e, cx) => {
        if (e.keystroke === "cmd-w") return;
        this.cancel();
        cx.stop_propagation();
      })
      .child(h_flex().h(TILE).px(10 - INSET).items_center()
        .child(div().flex_1().text_color(t.foreground).child(`Press ${shortcut("cam.close-pane") || "⌘W"} again to close pane`))
        .child(hint(t, "Esc")));
  }
}

// Opening them, from the top bar's command loop and the parts' buttons.
/** @type {OverlaySpec} */
export const QUIT = { kind: "dialog", width: 320, height: 2 * INSET + 3 * TILE + 2 * GAP + 8 };
/** @type {OverlaySpec} */
export const CLOSE_PANE = { kind: "dialog", width: 300, height: 2 * INSET + TILE };

// ---------------------------------------------------------------------------------------
// Closing, asked in cam's look. Herdr asks with its own dialog when a command closes a
// space unconfirmed; cam asks first and sends `confirmed: true`, so Herdr's never shows.
// props { title, detail, yes, command: { name, args } }. Enter confirms, Esc cancels.

export class Confirm extends View {
  /** @param {CamProps} _props @param {AsyncCx} cx */
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  yes() {
    /** @type {CamProps} */
    const p = props();
    closeOverlay(p.overlay);
    run(p.command.name, p.command.args ?? {});
  }

  render() {
    const t = colors();
    /** @type {CamProps} */
    const p = props() ?? {};
    return panel(t, "confirm").size_full()
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "enter") this.yes();
        else if (e.key === "escape") closeOverlay(p.overlay);
        else return;
        cx.stop_propagation();
      })
      .child(titleBar(t, p.title ?? "Are you sure?"))
      .child(div().flex_1().min_h(0).px(10 - INSET).text_color(t.muted).truncate().child(p.detail ?? ""))
      .child(h_flex().justify_end().gap(4)
        .child(button(t, "confirm-no", "Cancel", false, () => closeOverlay(p.overlay)))
        .child(button(t, "confirm-yes", p.yes ?? "Confirm", true, () => this.yes())));
  }
}

/** @type {OverlaySpec} */
const CONFIRM = { kind: "dialog", width: 320, height: 2 * INSET + 3 * TILE + 2 * GAP + 8 };
/** @param {number} n @param {string} word */
const count = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Close a space, asking first: "herdr-app · 2 tabs, 3 terminals".
/** @param {string} id */
export function closeSpace(id) {
  const s = spaces().find(x => x.id === id);
  if (!s) return;
  const tabs = new Set(s.tabs.map(c => c.id));
  const terms = panes().filter(p => tabs.has(p.tab) && p.terminal).length;
  openOverlay({ mod: "cam", ...CONFIRM, props: {
    role: "confirm", title: "Close space?", yes: "Close space",
    detail: `${s.name} · ${count(s.tabs.length, "tab")}, ${count(terms, "terminal")}`,
    command: { name: "space.close", args: { id, confirmed: true } },
  } });
}

// Close a pane; the only pane of a space's last tab closes the space, so that one asks.
/** @param {string} id */
export function closePane(id) {
  const tab = panes().find(p => p.pane === id)?.tab;
  if (tab && panes().filter(p => p.tab === tab).length === 1) closeTab(tab);
  else run("pane.close", { pane: id });
}

// Close a tab; its space's last tab closes the space, so that one asks.
/** @param {string} id */
export function closeTab(id) {
  const s = spaces().find(x => x.tabs.some(c => c.id === id));
  if (s && s.tabs.length === 1) closeSpace(s.id);
  else run("tab.close", { id });
}

// ---------------------------------------------------------------------------------------
// Renaming, asked in cam's look. Herdr asks with its own prompt when a rename comes
// without a name; cam asks first and sends the name.
// props { title, value, hint, command: { name, args } }. Enter saves, Esc cancels.

export class Prompt extends View {
  /** @param {CamProps} _props @param {AsyncCx} cx */
  init(_props, cx) {
    /** @type {string} */
    this.text = props()?.value ?? "";
    /** @type {import("gpui-base").InputState} */
    this.input = InputState.new({ value: this.text });
    if (this.text) this.input.set_selected_range({ start: 0, end: this.text.length });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); cx.notify(); });
    this.input.on("submit", () => this.submit());
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  submit() {
    /** @type {CamProps} */
    const p = props();
    closeOverlay(p.overlay);
    run(p.command.name, { ...(p.command.args ?? {}), name: this.text });
  }

  render() {
    const t = colors();
    /** @type {CamProps} */
    const p = props() ?? {};
    return panel(t, "prompt").size_full()
      .track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .child(titleBar(t, p.title ?? "Rename"))
      .child(h_flex().h(28).flex_none().px((TILE - ICON) / 2).items_center().rounded(6).border_1().border_color(t.input).bg(t.background)
        .child(Input.new(this.input).flex_1().h_full().text_size(13).text_color(t.foreground)))
      .when(Boolean(p.hint), el => el.child(div().px(10 - INSET).text_size(11.5).text_color(t.dim).child(p.hint)))
      .child(div().flex_1())
      .child(h_flex().justify_end().gap(4)
        .child(button(t, "pm-cancel", "Cancel", false, () => closeOverlay(p.overlay)))
        .child(button(t, "pm-save", "Save", true, () => this.submit())));
  }
}

// Title, field, hint (16), buttons; insets and gaps.
/** @type {OverlaySpec} */
export const PROMPT = { kind: "dialog", width: 320, height: 2 * INSET + 2 * TILE + 28 + 16 + 4 * GAP };

/** @param {string} id */
export function renameTab(id) {
  const tab = spaces().flatMap(s => s.tabs).find(c => c.id === id);
  if (!tab) return;
  openOverlay({ mod: "cam", ...PROMPT, props: { role: "prompt", title: "Rename tab", value: tab.named ? tab.name : "",
    hint: "Empty: back to its number.", command: { name: "tab.rename", args: { id } } } });
}

/** @param {string} id */
export function renameSpace(id) {
  const s = spaces().find(x => x.id === id);
  if (!s) return;
  openOverlay({ mod: "cam", ...PROMPT, props: { role: "prompt", title: "Rename space", value: s.named ? s.name : "",
    hint: `Empty: named after where it is (${s.name}).`, command: { name: "space.rename", args: { id } } } });
}
