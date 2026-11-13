// Workspace spaces: stable colored avatars, worktrees under their checkout,
// grouped by machine when more than one is known. After a space's name, the repo
// its first terminal is in now, only where unusual: branch, ahead/behind. Agent state lives in the agents list, not here. Click to
// switch, right-click for its menu, drag to reorder.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, spaces, machines, panes, run, openOverlay, exec, hc, shared, setShared, watchFolder, window, setAgentOrder } from "herdr";
import { narrow, agentName, spaceMark, SPACE_ORDER, RAIL_PR } from "./shared.js";
import { TILE, spinner, colors, mono } from "./modules/ui/index.js";

/** @typedef {import("./shared.js").Theme} Theme */
/** @typedef {import("./shared.js").Color} Color */
/** @typedef {import("./shared.js").Cx} Cx */
/** @typedef {import("./shared.js").Space} Space */
/** @typedef {import("herdr").PaneInfo} Pane */
/** A place's git (null: not a repo). `repo`: JSON [machine, the repo's git folder].
 * @typedef {{ name: string, branch: string | null, ahead: number, behind: number, repo: string, linked: boolean }} Git */
/** @typedef {import("./shared.js").Machine} Machine */
/** A reconnect in progress (kept in localStorage across reloads).
 * @typedef {{ machine: Machine, removed: boolean, busy?: boolean, error?: string | null }} Reconnect */
/** One space in the list: its index in spaces(), its git, and its tree branch when nested.
 * @typedef {{ w: Space, i: number, g: Git | null, tree?: string | null }} SpaceRow */


// Where a space is now: its first terminal's live folder, else where it was made.
// `ps`: panes(), read once by the caller (each read copies every pane).
/** @param {Space} s @param {Pane[]} ps */
function place(s, ps) {
  const tabs = new Set((s.tabs ?? []).map((c) => c.id));
  return ps.find((p) => tabs.has(p.tab) && p.cwd)?.cwd || s.folder;
}
/** @param {Space} s @param {Pane[]} ps */
const where = (s, ps) => JSON.stringify([s.machine ?? null, place(s, ps)]);
/** @param {string} path */
const base = (path) => path.replace(/\/+$/, "").split("/").pop();
// Changes made outside Herdr (an editor's save, a commit in another app): looked
// for this often, in repos the list shows, while the window is in front.
const FALLBACK = 60000;

/** @param {Theme} t @param {string | null} status @returns {Color} */
export function tone(t, status) {
  return t[status] ?? t.unknown;
}

// A space's row (and its rail tile): SPACE_H tall, its MARK-sized creature PAD in. Its rows
// put their names under its name (PAD, the mark, GAP_NAME), and a worktree's or project's
// past their branch icon (13px, 7 gap).
const SPACE_H = TILE, MARK = 16, PAD = (SPACE_H - MARK) / 2, GAP_NAME = 6;
const NAME_IN = PAD + MARK + GAP_NAME, BRANCH_IN = 20, CHILD_H = TILE - 2;

export class Sidebar extends View {
  /** @param {import("./shared.js").CamProps} _props @param {import("./shared.js").AsyncCx} cx */
  init(_props, cx) {
    /** @type {Record<string, Git | null>} */
    this.git = {}; // where() -> { name, branch, ahead, behind, repo, linked }, null: not a repo
    /** @type {Record<string, number>} */
    this.checked = {}; // where() -> when it was last looked at
    /** @type {Set<string>} */
    this.unsure = new Set(); // where()s git couldn't answer for (a machine away)
    /** @type {Set<string>} */
    this.pending = new Set(); // where()s to look at next
    /** @type {Record<string, boolean>} */
    this.busy = {}; // pane -> an agent working or a program in front of its shell
    /** @type {Record<string, boolean>} */
    this.ready = {}; // machine -> its layout was readable at the last look
    /** @type {Record<string, string>} */
    this.at = {}; // space -> its where() at the last look
    /** @type {Set<string>} */
    this.watching = new Set(); // local repos' git folders
    // Spaces made while this runs wait (at most a moment) for their git, so a
    // worktree appears under its repo instead of jumping there.
    this.shown = new Set(spaces().map((s) => s.id));
    /** @type {Record<string, number>} */
    this.born = {};
    /** @type {number | null} */
    this.pressed = null;
    /** @type {number | null} */
    this.over = null;
    // The space whose row the pointer is on: its whole group shows the hover (grouped()).
    /** @type {string | null} */
    this.hot = null;
    // The machine header under the pointer: it shows its chevron (grouped()).
    /** @type {string | null} */
    this.hotMachine = null;
    // Per space, its rows' panes in order: a click on the space you're in goes to the next.
    /** @type {Record<string, { pane: string, focused: boolean }[]>} */
    this.cycle = {};
    /** @type {Machine[]} */
    this.machines = [];
    /** @type {Record<string, Reconnect>} */
    this.reconnecting = JSON.parse(localStorage.getItem("machines.reconnecting") ?? "{}");
    for (const state of Object.values(this.reconnecting)) state.busy = false;
    /** @type {Set<string | null>} */
    this.folded = new Set(JSON.parse(localStorage.getItem("machines.folded") ?? "[]"));
    // Folding spaces is gone: drop what it saved.
    localStorage.removeItem("spaces.folded");
    this.refreshMachines(cx);
    cx.timer.every(15000, cx => this.refreshMachines(cx));
    // `git status` walks the whole tree, on another machine a process there:
    // only when its answer could have changed (see `due`).
    cx.timer.every(250, (cx) => this.checkNew(cx));
  }

  /** @param {Cx} cx */
  checkNew(cx) {
    const now = Date.now();
    const sp = spaces();
    for (const s of sp) if (!this.shown.has(s.id)) this.born[s.id] ??= now;
    const due = this.due(now, sp, panes());
    if (due.size) this.refreshGit(due, cx);
    if (sp.some((s) => !this.shown.has(s.id))) cx.notify();
  }

  // Places whose git could have changed: new ones (a new space, a cd), where a
  // command or an agent's turn just ended (a checkout, a commit, edits), those on
  // a machine that is back, and repos in view whose fallback is due.
  /** @param {number} now @param {Space[]} sp @param {Pane[]} ps */
  due(now, sp, ps) {
    // Moved there: what it knew of that place may be old.
    /** @type {Record<string, string>} */
    const at = {};
    for (const s of sp) at[s.id] = where(s, ps);
    const keys = new Set(Object.values(at).filter((k) => JSON.parse(k)[1]));
    const due = new Set([...keys].filter((k) => !(k in this.git)));
    for (const [id, k] of Object.entries(at)) if (this.at[id] && this.at[id] !== k && keys.has(k)) due.add(k);
    this.at = at;
    /** @type {Record<string, Space>} */
    const spaceOf = {};
    for (const s of sp) for (const t of s.tabs ?? []) spaceOf[t.id] = s;
    /** @type {Record<string, boolean>} */
    const busy = {};
    for (const p of ps) {
      if (!p.terminal || !spaceOf[p.tab]) continue;
      busy[p.pane] = p.status === "working" || !(p.program?.shell || p.program?.agent);
      if (this.busy[p.pane] && !busy[p.pane]) this.sameRepo(at[spaceOf[p.tab].id], keys).forEach((k) => due.add(k));
    }
    this.busy = busy;
    for (const m of machines()) {
      const ready = m.layout === "ready";
      if (ready && this.ready[m.name] === false) for (const k of keys) if (JSON.parse(k)[0] === m.name) due.add(k);
      this.ready[m.name] = ready;
    }
    if (window().active) {
      for (const k of keys) {
        const asks = this.git[k] || this.unsure.has(k);
        if (asks && !this.folded.has(JSON.parse(k)[0]) && now - (this.checked[k] ?? 0) > FALLBACK) due.add(k);
      }
    }
    return due;
  }

  // `key` and the other places in its repo (a commit there moves their ahead/behind).
  /** @param {string} key @param {Set<string>} keys */
  sameRepo(key, keys) {
    const repo = this.git[key]?.repo;
    return [key, ...(repo ? [...keys].filter((k) => this.git[k]?.repo === repo) : [])];
  }

  /** @param {Cx} cx */
  refreshMachines(cx) {
    cx.spawn(async cx => {
      try { const r = await hc(["machine", "ls", "--json"]); if (r.code === 0) this.machines = (/** @type {{ machines?: Machine[] }} */ (JSON.parse(r.stdout)).machines ?? []).filter((m) => !m.temporary); } catch {}
      cx.notify();
    });
  }

  /** @param {Machine} machine */
  rebuilt(machine) {
    return machine?.state === "unreachable" && /^a different core answers there \("[^"]+"\)$/.test(machine.why ?? "");
  }

  /** @param {Machine} machine @param {Cx} cx */
  reconnect(machine, cx) {
    const name = machine.name;
    if (this.reconnecting[name]?.busy) return;
    const state = this.reconnecting[name] ??= { machine, removed: false };
    state.busy = true;
    state.error = null;
    localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
    cx.notify();
    cx.spawn(async cx => {
      try {
        /** @param {string[]} args */
        const ask = async args => {
          const r = await hc([...args, "--json"]);
          if (r.code !== 0) {
            let error;
            try { error = JSON.parse(r.stdout || r.stderr).error?.message; } catch {}
            throw new Error(error || r.stderr || r.stdout || "Couldn't connect.");
          }
        };
        if (!state.removed) {
          await ask(["machine", "rm", name]);
          state.removed = true;
          localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
        }
        const args = ["machine", "add"];
        if (machine.via) args.push("--via", machine.target);
        else args.push(machine.target);
        args.push("--name", name);
        if (machine.session) args.push("--session", machine.session);
        if (machine.temporary) args.push("--temp");
        await ask(args);
        this.folded.delete(name);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        delete this.reconnecting[name];
      } catch (e) {
        state.error = String(/** @type {Error} */ (e).message ?? e);
        state.busy = false;
      }
      localStorage.setItem("machines.reconnecting", JSON.stringify(this.reconnecting));
      this.refreshMachines(cx);
      cx.notify();
    });
  }

  // One look at a time, each place once however often it was asked for meanwhile.
  /** @param {Iterable<string>} keys @param {Cx} cx */
  refreshGit(keys, cx) {
    for (const k of keys) this.pending.add(k);
    if (this.refreshing) return;
    this.refreshing = true;
    cx.spawn(async (cx) => {
      while (this.pending.size) {
        const keys = [...this.pending];
        this.pending.clear();
        for (const key of keys) await this.check(key, cx);
      }
      const used = new Set(Object.values(this.git).filter(Boolean).map((g) => JSON.parse(g.repo)).filter(([on]) => !on).map(([, repo]) => repo));
      for (const repo of this.watching) if (!used.has(repo)) this.watching.delete(repo);
      this.refreshing = false;
      cx.notify();
    });
  }

  // One place's git: branch, ahead/behind, its repo.
  /** @param {string} key @param {Cx} cx */
  async check(key, cx) {
    const [on, cwd] = JSON.parse(key);
    this.checked[key] = Date.now();
    this.unsure.delete(key);
    try {
      // No optional locks: a status that touched the index would wake the watch again.
      // Writes nothing under .git (index lock, fsmonitor cookie): watch() would wake on it.
      const r = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v2", "--branch"], { cwd, on });
      if (r.code !== 0) {
        // Only git's own "no" is remembered as no repo; anything else is asked again.
        if (!/not a git repository/i.test(r.stderr)) this.unsure.add(key);
        this.git[key] = null;
        return;
      }
      // The repo's own .git folder names it; a worktree's top differs from it.
      const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
      const common = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd, on });
      const repo = common.stdout.trim();
      const name = repo.endsWith("/.git") ? base(repo.slice(0, -5)) : base(repo).replace(/\.git$/, "");
      /** @type {Git} */
      const info = { name, branch: null, ahead: 0, behind: 0, repo: JSON.stringify([on, repo]), linked: repo !== `${top.stdout.trim()}/.git` };
      for (const line of r.stdout.split("\n")) {
        if (line.startsWith("# branch.head ")) info.branch = line.slice(14);
        else if (line.startsWith("# branch.ab ")) {
          const [a, b] = line.slice(12).split(" ");
          info.ahead = Math.abs(parseInt(a, 10)) || 0;
          info.behind = Math.abs(parseInt(b, 10)) || 0;
        }
      }
      this.git[key] = info;
      if (!on) this.watch(repo, cx);
    } catch {
      // Couldn't ask (the machine is away): keep what it showed, look again later.
      this.git[key] ??= null;
      this.unsure.add(key);
    }
  }

  /** @param {string} repo @param {Cx} cx */
  watch(repo, cx) {
    if (this.watching.has(repo)) return;
    this.watching.add(repo);
    cx.spawn(async (cx) => {
      try {
        while (this.watching.has(repo)) {
          await watchFolder(repo);
          const mine = JSON.stringify([null, repo]);
          if (this.watching.has(repo)) this.refreshGit(Object.keys(this.git).filter((k) => this.git[k]?.repo === mine), cx);
        }
      } catch { this.watching.delete(repo); }
    });
  }

  /** @param {Space} w */
  menu(w) {
    // A popup is as tall as its items; height is only the most.
    openOverlay({ mod: "cam", kind: "popup", width: 200, height: 4 * 2 + 5 * 22 + 5 * 2 + 5, props: { role: "menu", tab: "space", target: { id: w.id } } });
  }

  // Spaces in order, each worktree space moved under its main checkout's.
  ordered() {
    const sp = spaces(), ps = panes();
    /** @param {Space} w */
    const ready = (w) => this.shown.has(w.id) || where(w, ps) in this.git || Date.now() - (this.born[w.id] ??= Date.now()) > 1500;
    for (const w of sp) if (!this.shown.has(w.id) && ready(w)) this.shown.add(w.id);
    const list = sp.map((w, i) => ({ w, i, g: this.git[where(w, ps)] ?? null })).filter((r) => this.shown.has(r.w.id));
    const mains = new Set(list.filter((r) => r.g && !r.g.linked).map((r) => r.g.repo));
    /** @param {SpaceRow} r */
    const nested = (r) => r.g?.linked && mains.has(r.g.repo);
    /** @type {SpaceRow[]} */
    const out = [];
    const placed = new Set(); // repos whose worktrees are listed (under the first of its spaces)
    for (const r of list) {
      if (nested(r)) continue;
      out.push({ ...r, tree: null });
      if (!r.g || r.g.linked || placed.has(r.g.repo)) continue;
      placed.add(r.g.repo);
      const kids = list.filter((k) => nested(k) && k.g.repo === r.g.repo);
      kids.forEach((k, n) => out.push({ ...k, tree: n === kids.length - 1 ? "└─" : "├─" }));
    }
    return out;
  }

  // A space's agents and shells, indented under its row, in tab
  // order. A shell (a terminal with no agent status) shows its program (and folder). Task workers
  // (terminals labelled agent.task) go under a row per project, after the other agents:
  // the project row (branch icon, the repo its folder is in), then its workers, named by task.
  /** @param {Space} w @param {Theme} t @param {boolean} [nested] under a worktree row @param {boolean} [hot] the pointer is on the space's row */
  agentRows(w, t, nested = false, hot = false) {
    /** @type {Record<string, [string, Color]>} */
    const L = { blocked: ["!", t.blocked] };
    /** @type {Record<string, string>} */
    const tasks = {};
    for (const term of terminals()) {
      const task = term?.labels?.["agent.task"];
      if (task && term.address) tasks[term.address] = task;
    }
    const ps = panes();
    const mine = agents().filter(a => a.space === w.id);
    const plain = mine.filter(a => !tasks[a.address]);
    // Each row's click target (the pane it focuses), for the space's row to cycle through.
    /** @type {Map<object, { pane: string, focused: boolean }>} */
    const targets = new Map();
    /** @type {Map<string, import("herdr").AgentInfo[]>} */
    const byProject = new Map();
    for (const a of mine.filter(a => tasks[a.address])) {
      const cwd = ps.find(p => p.pane === a.pane)?.cwd || "";
      const project = cwd.match(/\/\.treehouse\/[^/]+\/[^/]+\/([^/]+)/)?.[1] || base(cwd) || "worker";
      if (!byProject.has(project)) byProject.set(project, []);
      byProject.get(project).push(a);
    }
    // At a row's right, per pane: its program's icon (Claude, bash...), in one quiet color,
    // or its own colors while it works (Claude's orange). Blocked and done show their mark.
    /** @param {string} status @param {any} p its program */
    const markFor = (status, p) => {
      const working = status === "working";
      return status === "done" ? div().size(6).rounded_full().bg(t.done)
        : L[status] ? div().text_size(11).font_semibold().font_family(mono()).text_color(L[status][1]).child(L[status][0])
        : !p?.icon ? (working ? spinner(t.working) : div().text_size(11).text_color(t.dim).child("\u00b7"))
        : working && !p.tint ? image(p.icon).size(12).flex_none()
        : svg(p.icon).size(12).flex_none().text_color(working ? t.working : t.dim);
    };
    /** @param {Pane} pn */
    const statusOf = pn => byPane.get(pn.pane)?.status ?? "idle";
    /**
     * @param {import("herdr").AgentInfo} a @param {string} name @param {boolean} deep @param {any} p its program
     * @param {number} [count] shells sharing the row @param {Pane[]} [split] a split tab's panes, the row standing for them all
     */
    const lineEl = (a, name, deep, p, count = 1, split) => {
      const mark = split ? h_flex().gap(5).items_center().children(split.map(pn => markFor(statusOf(pn), pn.program)))
        : h_flex().gap(5).items_center()
          .when(count > 1, el => el.child(div().text_size(11).text_color(t.dim).child(String(count))))
          .child(markFor(a.status, p));
      // No tree line: the name lines up with the space's name (the mark is 3 in,
      // 16 wide, GAP_NAME before the name), or under a worktree or project row with that row's.
      return h_flex().id(`sp-ag-${a.address}`).relative().h(CHILD_H).flex_none().pl(deep ? NAME_IN + BRANCH_IN : NAME_IN).pr(8).rounded(6).items_center()
        .when(a.focused && w.active, el => el.bg(t.selected))
        // hot: the pointer is on the group, so every row of it shows the hover shade, and the
        // row under the pointer in the focused row's shade, so you still see which one. The row you're in
        // has no hover: there's nowhere for its click to go. (One .hover per row: a second
        // one replaces the first.)
        .when(hot && !(a.focused && w.active), el => el.bg(t.hover))
        .when(!(a.focused && w.active), el => el.hover(s => s.bg(hot ? t.selected : t.hover))).cursor_pointer()
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.muted).child(name))
        .child(h_flex().min_w(14).flex_none().justify_center().child(mark));
    };
    /** @type {typeof lineEl} */
    const line = (a, ...rest) => {
      const el = lineEl(a, ...rest);
      targets.set(el, { pane: a.pane, focused: Boolean(a.focused) });
      return el;
    };
    const tabIds = new Set(w.tabs.map(tb => tb.id));
    /** @type {Map<string, import("herdr").AgentInfo>} */
    const byPane = new Map(plain.map(a => [a.pane, a]));
    /** @type {any[]} */
    const rows = [];
    // The panes a row shows: agents (not a task's, under its project below) and shells.
    /** @param {Pane} pn */
    const shown = pn => byPane.has(pn.pane) || Boolean(pn.terminal && !pn.status && !tasks[/** @type {string} */ (pn.terminal)]);
    /** @param {Pane} pn */
    const nameOf = pn => {
      const a = byPane.get(pn.pane);
      if (a) return agentName(a);
      // Its folder only when it isn't the space's own: under "work", a shell there is just "bash".
      const where = pn.cwd ? base(pn.cwd) || "/" : "";
      return [pn.program?.name || "shell", where !== w.name && where].filter(Boolean).join(" \u00b7 ");
    };
    /** @param {Pane} pn @returns {any} */
    const shellOf = pn => ({ address: pn.terminal, pane: pn.pane, status: "idle", focused: pn.focused, shell: true });
    /** @type {Map<string, Pane[]>} */
    const byTab = new Map();
    for (const pn of ps) {
      if (!tabIds.has(pn.tab) || !shown(pn)) continue;
      if (!byTab.has(pn.tab)) byTab.set(pn.tab, []);
      /** @type {Pane[]} */ (byTab.get(pn.tab)).push(pn);
    }
    // One row per tab, as the tab bar has. A split tab's row is named for its focused pane
    // (else its first agent) and carries every pane's icon; a click goes to that pane.
    // A tab of one shell: shells with the same name share one row, where the first sits,
    // with their count; a click goes to the next of them after the focused one.
    /** @type {Map<string, Pane[]>} */
    const shells = new Map();
    for (const list of byTab.values()) {
      if (list.length > 1) {
        const lead = list.find(pn => pn.focused) ?? list.find(pn => byPane.has(pn.pane)) ?? list[0];
        const a = byPane.get(lead.pane) ?? shellOf(lead);
        rows.push(line(a, nameOf(lead), nested, lead.program, 1, list));
        continue;
      }
      const pn = list[0], a = byPane.get(pn.pane);
      if (a) { rows.push(line(a, agentName(a), nested, a.program)); continue; }
      const name = nameOf(pn);
      if (!shells.has(name)) { shells.set(name, []); rows.push(name); }
      /** @type {Pane[]} */ (shells.get(name)).push(pn);
    }
    for (const [name, group] of shells) {
      const at = group.findIndex(pn => pn.focused);
      const shell = { ...shellOf(group[(at + 1) % group.length]), address: group[0].terminal, focused: at >= 0 };
      rows[rows.indexOf(name)] = line(shell, name, nested, group[0].program, group.length);
    }
    for (const [project, workers] of byProject) {
      rows.push(h_flex().id(`sp-fm-${w.id}/${project}`).h(CHILD_H).flex_none().pl(NAME_IN).pr(8).gap(7).items_center()
        .child(svg("mods/workspace-chrome/branch.svg").size(13).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(project)));
      for (const a of workers) {
        rows.push(line(a, agentName(a), true, a.program));
      }
    }
    this.cycle[w.id] = rows.map(r => targets.get(r)).filter(x => x !== undefined);
    return rows;
  }

  // The rows, under a header per machine once one isn't this computer.
  /** @param {Theme} t @param {boolean} collapsed */
  grouped(t, collapsed) {
    const rows = this.ordered();
    // An opened space (one showing its agents) gets 4px after its group instead of the list's 2.
    /** @param {SpaceRow} r */
    const draw = (r) => {
      if (collapsed) return [this.compact(r, t)];
      const kids = this.agentRows(r.w, t, Boolean(r.tree), this.hot === r.w.id);
      if (!kids.length) return [this.row(r, t)];
      // A space with several rows: plain rows, each its own button, hover and highlight
      // (only the focused row's, while it's the active space). Flush against its rows,
      // which are CHILD_H: shorter than the space's row, so they sit close under its name.
      const head = this.row(r, t);
      // Pointer anywhere on the group (this.hot): each of its rows gets the hover shade,
      // square so they join into one block, and the row you're in keeps its highlight (never
      // stacked: the colors are see-through). Pointer elsewhere: only that highlight.
      if (kids.length > 1) {
        const hot = this.hot === r.w.id;
        return [v_flex().id(`grp-space-${r.w.id}`).flex_none().mb(2).rounded(6)
          .on_hover((over, cx) => { const next = over ? r.w.id : this.hot === r.w.id ? null : this.hot; if (next !== this.hot) { this.hot = next; cx.notify(); } })
          // The space's row stands for the group: no step of its own, its hover the group's shade.
          .child(head.when(hot, el => el.bg(t.hover).hover(s => s.bg(t.hover)).rounded(0).rounded_t(6)))
          .children(hot ? kids.map((k, j) => j === kids.length - 1 ? k.rounded(0).rounded_b(6) : k.rounded(0)) : kids)];
      }
      // A space with one row: the two are one button. One highlight while it's the active
      // space, one hover, and either half's click lands in the same place (its only row).
      // Their own highlights and hovers go (the color is see-through: it would double up).
      const clear = /** @type {Color} */ ("#00000000");
      return [v_flex().id(`grp-space-${r.w.id}`).flex_none().mb(2).rounded(6)
        .when(r.w.active, el => el.bg(t.selected)).when(!r.w.active, el => el.hover(s => s.bg(t.hover)))
        .child(head.bg(clear).hover(s => s.bg(clear)))
        .child(kids[0].bg(clear).hover(s => s.bg(clear)))];
    };
    const remote = [...new Set([...rows.map(r => r.w.machine).filter(Boolean), ...this.machines.map(m => m.name), ...Object.keys(this.reconnecting)])].sort();
    /** @param {string | null} m */
    const loading = m => {
      const layout = machines().find(k => k.name === m)?.layout;
      return layout === "loading" || (!layout && this.machines.some(k => k.name === m && k.state === "connected"))
        || spaces().some(s => (s.machine ?? null) === m && !this.shown.has(s.id));
    };
    /** @param {string | null} m */
    const loadingRow = m => div().id(`machines-loading-${m ?? "local"}`).h(TILE).flex_none().px(4).text_size(12).text_color(t.dim).child(collapsed ? "…" : "Loading…");
    if (!remote.length) return loading(null) && !rows.length ? [loadingRow(null)] : rows.flatMap(draw);
    const machineNames = [null, ...remote];
    return machineNames.flatMap((m) => {
      const mine = rows.filter((r) => (r.w.machine ?? null) === m);
      const repair = this.reconnecting[m];
      const machine = this.machines.find(k => k.name === m) ?? repair?.machine;
      const connected = !m || machine?.state === "connected";
      const rebuilt = this.rebuilt(machine) || !!repair;
      const folded = this.folded.has(m);
      const id = m ? `machine-${m}` : "machines-local";
      const hover = this.hotMachine === id;
      const fold = (_e, cx) => {
        folded ? this.folded.delete(m) : this.folded.add(m);
        localStorage.setItem("machines.folded", JSON.stringify([...this.folded]));
        cx.notify();
      };
      // A machine with no spaces (and none on the way): a row that makes one there.
      const empty = !mine.length && !loading(m) && connected && !rebuilt;
      const add = () => run("space.new", { machine: m ?? "" });
      const where = m ?? "this computer";
      // An empty creature's spot: a solid MARK-sized block like the creatures, a + in it.
      // Under the pointer its row turns the block's own shade, so the block steps up a shade.
      const newId = `machine-new-${m ?? "local"}`;
      const newHot = this.hotMachine === newId;
      const onNewHover = (over, cx) => { const next = over ? newId : this.hotMachine === newId ? null : this.hotMachine; if (next !== this.hotMachine) { this.hotMachine = next; cx.notify(); } };
      // The sidebar's row is CHILD_H, so the block sits as far in from the left as from the
      // top and bottom; the gap takes up the difference, so "New space" still lines up.
      const INSET_NEW = (CHILD_H - MARK) / 2;
      const slot = () => h_flex().size(MARK).flex_none().justify_center().items_center().rounded(5).bg(newHot ? t.selected : t.hover)
        .child(svg("mods/workspace-chrome/plus.svg").size(12).text_color(newHot ? t.foreground : t.muted));
      // Rail: no labels, so no header for the first group and a short rule before each
      // next one (its machine in the tooltip). Folding is the sidebar's: the rail shows all.
      if (collapsed) {
        const plus = h_flex().id(newId).size(SPACE_H).flex_none().justify_center().items_center().rounded(6)
          .text_color(t.dim).cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground))
          .tooltip(`New space on ${where}`).on_click(add).on_hover(onNewHover)
          .child(slot());
        const rule = h_flex().id(id).w(SPACE_H).h(9).flex_none().justify_center().items_center().tooltip(m ?? "This computer")
          .child(div().w(12).h(1).bg(t.border));
        return [...(m ? [rule] : []), ...(mine.length ? mine.flatMap(draw) : loading(m) ? [loadingRow(m)] : empty ? [plus] : [])];
      }
      // Sidebar: a section label, not a row. Bold dim text lined up with the creatures, no
      // icon, no hover box, a little space above every group but the first, and the chevron
      // only while folded or under the pointer.
      const head = h_flex().id(id).h(TILE).flex_none().px(PAD).gap(6).items_center().when(m !== null, el => el.mt(4))
          .text_size(11.5).font_semibold().text_color(hover ? t.muted : t.dim)
          .cursor_pointer().on_click(fold)
          .on_hover((over, cx) => { const next = over ? id : this.hotMachine === id ? null : this.hotMachine; if (next !== this.hotMachine) { this.hotMachine = next; cx.notify(); } })
          .child(div().flex_1().truncate().when(!connected, el => el.opacity(0.5)).child(m ?? "This computer"))
          .when(rebuilt, el => el.child(h_flex().flex_none().gap(3).items_center().font_normal().text_color(t.dim)
            .child(div().max_w(140).truncate().child(repair?.error || "rebuilt ·"))
            .child(div().id(`machine-connect-${m}`).text_color(repair?.error ? t.blocked : t.muted)
              .hover(s => s.text_color(t.foreground))
              .tooltip(repair?.error || "This machine was rebuilt or replaced. Click to connect to the new one.")
              .on_click((_e, cx) => { cx.stop_propagation(); this.reconnect(machine, cx); })
              .child(repair?.busy ? "Connecting…" : "Connect"))))
          .when(folded || hover, el => el
            .child(svg(`mods/workspace-chrome/chevron-${folded ? "right" : "down"}.svg`).size(11).flex_none().text_color(t.dim)));
      if (rebuilt) return [head];
      const newRow = h_flex().id(newId).h(CHILD_H).flex_none().mb(2).pl(INSET_NEW).pr(PAD).gap(GAP_NAME + PAD - INSET_NEW).items_center().rounded(6)
        .text_size(12.5).text_color(t.muted).cursor_pointer().hover(s => s.bg(t.hover))
        .on_click(add).on_hover(onNewHover)
        .child(slot())
        .child(div().flex_1().truncate().child("New space"));
      return [head, ...(folded ? [] : mine.length ? mine.flatMap(draw) : loading(m) ? [loadingRow(m)] : empty ? [newRow] : [])];
    });
  }

  // How far a space's branch is off its upstream: "↑2 ↓1", or nothing.
  /** @param {Git} g @param {Theme} t */
  gitCounts(g, t) {
    return h_flex().flex_none().gap(5).items_center().text_size(11.5)
      .when(g.ahead > 0, (el) => el.child(div().text_color(t.ansi2).child(`\u2191${g.ahead}`)))
      .when(g.behind > 0, (el) => el.child(div().text_color(t.ansi1).child(`\u2193${g.behind}`)));
  }

  /** @param {SpaceRow} r @param {Theme} t */
  row({ w, i, g, tree }, t) {
    const on = w.active;
    const ps = panes();
    const tabIds = new Set(w.tabs.map(tb => tb.id));
    // Highlighted only when none of its rows below is: those are its terminals.
    const kidFocused = ps.some(p => p.focused && p.terminal && tabIds.has(p.tab));
    return v_flex()
      .relative()
      .id(`space-${w.id}`)
      // Padded so the mark sits where the rail's tile puts it.
      .px(PAD)
      .h(TILE)
      .flex_none()
      .justify_center()
      .rounded(6)
      .when(on && (Boolean(tree) || !kidFocused), (el) => el.bg(t.selected))
      // A hover unless it's the highlighted row (in the space you're in, its click folds it).
      .when(!(on && (Boolean(tree) || !kidFocused)), (el) => el.hover((s) => s.bg(t.hover)))
      .cursor_pointer()
      .when(this.pressed === i && this.over !== i, (el) => el.opacity(0.5))
      .when(this.pressed !== null && this.over === i && this.pressed !== i, (el) => el.child(
        div().absolute().left(0).right(0).h(2).bg(t.accent)
          .when(this.pressed < i, line => line.bottom(0))
          .when(this.pressed > i, line => line.top(0)),
      ))
      .on_mouse_down("left", () => {
        this.pressed = i;
        this.over = i;
      })
      .on_mouse_move((_e, cx) => {
        const source = spaces()[this.pressed];
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? i : null;
        if (this.pressed !== null && this.over !== over) {
          this.over = over;
          cx.notify();
        }
      })
      .on_mouse_up("left", (_e, cx) => {
        const from = this.pressed;
        const over = this.over;
        this.pressed = null;
        this.over = null;
        if (from !== null && over === i && from !== i) run("space.move", { id: spaces()[from].id, index: i + 1 });
        // The space you're in: on to its next row (from the one you're in, round to the first).
        else if (from === i && w.active && this.cycle[w.id]?.length) {
          const list = this.cycle[w.id], at = list.findIndex(x => x.focused);
          run("pane.focus", { pane: list[(at + 1) % list.length].pane });
        } else if (from === i) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => this.menu(w))
      .child(tree
        // A worktree: drawn like the agent rows beside it (its branch icon where their names
        // start, 12.5px text); its branch is its name, so only ↑↓.
        ? h_flex().h_full().pl(NAME_IN - PAD).gap(7).items_center()
          .child(svg("mods/workspace-chrome/branch.svg").size(13).flex_none().text_color(t.muted))
          .child(div().flex_1().min_w(0).truncate().text_size(12.5).text_color(t.foreground).child(w.name))
          .when(Boolean(g), el => el.child(this.gitCounts(/** @type {Git} */ (g), t)))
        : h_flex()
          .gap(GAP_NAME)
          .items_center()
          .child(spaceMark(t, w, w.status === "working" ? `row-eyes-${w.id}` : undefined, MARK))
          .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(w.name))
          .when(Boolean(g), el => el.child(this.gitCounts(/** @type {Git} */ (g), t)))
      );
  }

  // The rail: the full list's rows with only their marks, the same sizes, corners and
  // highlight, so collapsing changes the width and nothing else. Working: its eyes
  // dart. A dot when it needs you or is done.
  /** @param {SpaceRow} r @param {Theme} t */
  compact({ w }, t) {
    const working = w.status === "working";
    const dot = w.status === "blocked" || w.status === "done";
    return h_flex()
      .id(`space-${w.id}`)
      .size(SPACE_H)
      .flex_none()
      .items_center()
      .justify_center()
      .rounded(6)
      .when(w.active, (el) => el.bg(t.selected))
      .when(!w.active, (el) => el.hover((s) => s.bg(t.hover)))
      .tooltip(w.name)
      .on_click(() => run("space.select", { id: w.id }))
      .child(div().relative()
        .child(spaceMark(t, w, working ? `rail-eyes-${w.id}` : undefined, MARK))
        .when(dot, (el) => el.child(div().absolute().right(-3).top(-3).size(7).rounded_full().bg(tone(t, w.status)).border(1.5).border_color(w.active ? t.selected : t.chrome))));
  }

  render() {
    const t = colors();
    const collapsed = narrow();
    const palette = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
    const sp = spaces();
    const ids = new Set(sp.map(p => p.id));
    const kept = Object.fromEntries(Object.entries(shared("space.colors") ?? {}).filter(([id]) => ids.has(id)));
    let changed = Object.keys(kept).length !== Object.keys(shared("space.colors") ?? {}).length;
    for (const p of sp) {
      if (kept[p.id] || p.name === "~") continue;
      /** @param {string} c */
      const uses = c => Object.values(kept).filter(v => v === c).length;
      kept[p.id] = palette.reduce((best, c) => uses(c) < uses(best) ? c : best);
      changed = true;
    }
    if (changed) setShared("space.colors", kept);
    // agent.next / agent.prev follow the agents in the order this list shows them.
    const rows = this.ordered(), remote = [...new Set(rows.map(r => r.w.machine).filter(Boolean))].sort();
    const all = agents();
    setAgentOrder([null, ...remote].flatMap(m => rows.filter(r => (r.w.machine ?? null) === m))
      .flatMap(r => all.filter(a => a.space === r.w.id).map(a => a.address)));
    // The space keys (tabs.js) follow this list too: each space with its group, the
    // top-level space a worktree is drawn under (its own id otherwise).
    let group = "";
    const order = [null, ...remote].flatMap(m => rows.filter(r => (r.w.machine ?? null) === m))
      .map(r => ({ id: r.w.id, group: r.tree ? group : (group = r.w.id) }));
    if (JSON.stringify(order) !== JSON.stringify(shared(SPACE_ORDER) ?? [])) setShared(SPACE_ORDER, order);
    return v_flex().size_full().min_h(0).text_size(13)
      // RAIL_PR in on the right only, open or rail: the window's edge gives the left its 4,
      // part of it under the macOS border.
      // Open: no top padding, so the first row (its label) starts at the main card's top edge.
      // Rail: 4, the same as its sides, so the first tile's highlight isn't flush with the top.
      .child(v_flex().pt(collapsed ? 4 : 0).flex_1().min_h(0).pr(RAIL_PR).pb(10).gap(2).when(collapsed, el => el.items_center()).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .children(this.grouped(t, collapsed)));
  }
}
