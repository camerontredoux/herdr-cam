// The Log: a Langfuse-style trace of the selected voyage. Turns hold tool calls; each call
// is a bar on its turn's timeline with its duration, tokens, cost and an error flag.
// Sub-agents nest under their Agent call. "Where it went wrong" points at the
// first error and any retry loop. Click a call for its input and output.
import { div, svg } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { CLIENTS, STATIONS } from "./data.js";
import { ICONS, mono, SMALL, alpha, badge, clientTile, grayBadge, icon, mix, notchBox, statusColor, STATUS } from "./theme.js";
import { RADIUS } from "../ui/index.js";
import { page, INNER, GAP, RULE, TITLE_H, ROW_Y } from "./page.js";
import { track, stationXs } from "./chart.js";
import { voyages, selection, select, trace, time, toMin, dur, tokens, money, clock } from "./state.js";

/** @typedef {import("./theme.js").Theme} Theme */

// Each tool's color on the timeline.
/** @param {Theme} t @param {string} tool */
// An Agent call's label is "<sub-agent type>: <description>"; its row shows only the type.
const agentName = (label) => label.split(":")[0];
const toolColor = (t, tool) => ({ Bash: t.ansi2, Read: t.ansi4, Edit: t.ansi3, Write: t.ansi5, Grep: t.ansi6, Agent: t.accent, WebFetch: t.ansi12 })[tool] ?? t.muted;

// A call as of a minute: cut short (and still running) if it ends later.
/** @param {any} c @param {number} now minutes */
function asOf(c, now) {
  const start = toMin(c.at) * 60, end = start + c.dur, cut = now * 60;
  return end > cut ? { ...c, dur: Math.max(1, cut - start), running: true, err: false } : c;
}

// Every call of a trace, flat, with where it sits: [turn index, key, call].
/** @param {any[]} turns */
function flat(turns) {
  /** @type {{ ti: number, key: string, c: any }[]} */
  const out = [];
  turns.forEach((turn, ti) => turn.calls.forEach((c, ci) => {
    out.push({ ti, key: `${ti}.${ci}`, c });
    (c.kids ?? []).forEach((k, ki) => out.push({ ti, key: `${ti}.${ci}.${ki}`, c: k }));
  }));
  return out;
}

// Where it went wrong: the first failed call, and the worst retry loop (one command
// failing again and again within a turn).
/** @param {any[]} turns */
function diagnose(turns) {
  const calls = flat(turns);
  const first = calls.find((x) => x.c.err) ?? null;
  /** @type {{ ti: number, label: string, keys: string[], fails: number, seconds: number } | null} */
  let loop = null;
  turns.forEach((turn, ti) => {
    /** @type {Record<string, any[]>} */
    const by = {};
    calls.filter((x) => x.ti === ti && x.c.err).forEach((x) => (by[x.c.label] ??= []).push(x));
    for (const [label, xs] of Object.entries(by)) {
      if (xs.length < 2 || (loop && loop.fails >= xs.length)) continue;
      const same = calls.filter((x) => x.ti === ti && x.c.label === label);
      const last = same[same.length - 1].c;
      const seconds = toMin(last.at) * 60 + last.dur - toMin(xs[0].c.at) * 60;
      loop = { ti, label, keys: same.map((x) => x.key), fails: xs.length, seconds };
    }
  });
  return { first, loop };
}

/** @param {any} host @param {Theme} t */
export function renderLog(host, t) {
  const sel = selection();
  const v = voyages().find((x) => x.id === sel.voyage);
  const now = time();
  if (!v) return page(t, { id: "log-scroll", rows: [], empty: v_flex().p(24).items_center().gap(8).text_color(t.dim)
    .child(div().text_size(12.5).child(`This voyage hadn't sailed by ${clock(now)}.`)) });

  const turns = trace(v.id, now).map((turn) => ({ ...turn, calls: turn.calls.map((c) => ({ ...asOf(c, now), kids: c.kids?.filter((k) => toMin(k.at) <= now).map((k) => asOf(k, now)) })) }));
  const all = flat(turns).map((x) => x.c);
  const spent = { tok: all.reduce((n, c) => n + c.tok, 0), cost: all.reduce((n, c) => n + c.cost, 0), errs: all.filter((c) => c.err).length };
  const first = turns[0] && toMin(turns[0].at), lastCall = all[all.length - 1];
  const span = first !== undefined && lastCall ? Math.max(...all.map((c) => toMin(c.at) * 60 + c.dur)) - first * 60 : 0;
  const { first: firstErr, loop } = diagnose(turns);
  const color = statusColor(t, v.status);

  // A turn is folded when a station is picked and it's another station's; a click flips that.
  /** @param {number} ti */
  const folded = (ti) => (Boolean(sel.station) && turns[ti].station !== sel.station) !== host.folded.has(`t${ti}`);
  /** @param {number} ti */
  const fold = (ti) => { host.folded.has(`t${ti}`) ? host.folded.delete(`t${ti}`) : host.folded.add(`t${ti}`); };
  // Jump to a call, for the "where it went wrong" rows. Herdr can't scroll a `list` from
  // code, so: fold every other turn, unfold its own, open only it, and start the list over
  // at the top (a new id is a new scroll position). It lands a few rows under the problems.
  /** @param {string} key */
  const reveal = (key) => {
    const ti = Number(key.split(".")[0]);
    turns.forEach((_, i) => { if (folded(i) !== (i !== ti)) fold(i); });
    host.open.clear();
    host.open.add(key);
    host.jumps = (host.jumps ?? 0) + 1;
  };

  // ---- Who and what.
  // A page top: the page sets it INSET from the edge and rules it off. Its first line is a
  // row (the back button), flush with that INSET edge like a Chart block; the lines under it
  // are content, INNER in. 5 apart: the 26px row leaves 2 more round its text than 22 did.
  const head = v_flex().pb(INNER).gap(5)
    // Narrow, the whole row is the back button, one hover target: the title and its status
    // badge. It has no chevron, so it looks the same beside the Chart, where it isn't a button.
    // It's laid out like a Chart block's title row, so opening a voyage moves nothing: content
    // INNER in on both sides, 8 between, and as tall as the block's top padding round its
    // title row, so the title's center lands where it was.
    .child(h_flex().id("log-back").h(TITLE_H + 2 * ROW_Y).px(INNER).gap(8).items_center().rounded(6)
      .when(!host.wide, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).tooltip("Back to the Chart")
        .on_click((_e, cx) => { host.show("chart"); cx.notify(); }))
      .child(clientTile(v.client))
      .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.foreground).child(v.title))
      .child(div().flex_none().child(badge(color, STATUS(t)[v.status]?.label ?? v.status))))
    .child(h_flex().px(INNER).gap(4).items_center().text_size(SMALL).text_color(t.dim)
      // "Birch #41 · fm-birch-referral": the number opens its PR on GitHub. /pull/N is safe for
      // an issue number too, since GitHub redirects it to the issue.
      .child(div().flex_none().child(CLIENTS[v.client]?.name ?? v.client))
      .when(Boolean(v.issue && CLIENTS[v.client]?.repo), (el) => el.child(div().id("log-pr").flex_none().cursor_pointer()
        .hover((s) => s.text_color(t.foreground).underline())
        .on_click((_e, cx) => cx.open_url(`https://github.com/${CLIENTS[v.client].repo}/pull/${v.issue}`))
        .child(`#${v.issue}`)))
      .child(div().flex_none().child("·"))
      .child(div().min_w(0).truncate().child(v.branch)))
    // Stats, like a trace's summary line.
    .child(h_flex().px(INNER).gap(14).items_center().text_size(SMALL).font_family(mono()).text_color(t.muted)
      .child(stat(t, ICONS.clock, dur(span)))
      .child(div().child(`${tokens(spent.tok)} tok`))
      .child(div().child(money(spent.cost)))
      .child(div().text_color(spent.errs ? t.blocked : t.dim).child(`${spent.errs} err`))
      .child(div().flex_1())
      .when(Boolean(sel.station), (el) => el.child(h_flex().id("clear-station").h(18).px(6).gap(4).items_center().rounded(5)
        .border_1().border_color(t.border).font_family(".SystemUIFont").text_size(11).text_color(t.foreground).cursor_pointer()
        .hover((s) => s.bg(t.hover)).tooltip("Show every station")
        .on_click((_e, cx) => { select(v.id, null); cx.notify(); })
        .child(sel.station).child(icon(ICONS.x, 10).text_color(t.dim)))))
    // Its line, as on the Chart, last before the rule. The Log is the whole panel, or LOG_W
    // of it beside the Chart; a station opens the Log there.
    .child(div().px(INNER).child(track(host, t, v, ...Object.values(stationXs(host.logWidth)), "log-", true)));

  // ---- Where it went wrong.
  // Page rows, like the Chart's weather notes: an icon, then what happened; a click opens
  // the call. A rule sets them off from the turns.
  const wrong = [
    firstErr && jump(t, "wrong-first", ICONS.alert, `First error · ${firstErr.c.at.slice(0, 5)}`,
      `${firstErr.c.label}: ${(firstErr.c.output ?? "").split("\n").find((l) => /Error|FAIL|Expected/.test(l)) ?? "failed"}`,
      (cx) => { reveal(firstErr.key); cx.notify(); }),
    loop && jump(t, "wrong-loop", ICONS.loop, `Retry loop · ${dur(loop.seconds)}`,
      `${loop.label} failed ${loop.fails}× in turn ${loop.ti + 1}`,
      (cx) => { reveal(loop.keys[loop.keys.length - 1]); cx.notify(); }),
  ].filter(Boolean);

  // ---- The turns.
  const loopKeys = new Set(loop?.keys ?? []);
  let tries = 0;
  // Lazy rows (page.js): a turn's calls sit flush, so the tree's lines run on unbroken.
  const body = turns.flatMap((turn, ti) => {
    const start = toMin(turn.at) * 60;
    const end = Math.max(start + 1, ...turn.calls.map((c) => toMin(c.at) * 60 + c.dur));
    const isFolded = folded(ti);
    const tok = turn.calls.reduce((n, c) => n + c.tok, 0), cost = turn.calls.reduce((n, c) => n + c.cost, 0);
    const errs = flat([turn]).filter((x) => x.c.err).length;
    const here = sel.station === turn.station;
    const header = { key: `turn-${ti}`, click: (/** @type {any} */ cx) => { fold(ti); cx.notify(); }, draw: () => h_flex().id(`turn-${ti}`).h(26).flex_none().px(INNER).gap(6).items_center().rounded(6).cursor_pointer()
      .when(here, (el) => el.bg(alpha(t.accent, 0.08))).hover((s) => s.bg(t.hover))
      .child(svg(isFolded ? ICONS.chevronRight : ICONS.chevronDown).size(11).flex_none().text_color(t.dim))
      .child(div().flex_none().text_size(12).font_medium().text_color(t.foreground).child(`Turn ${ti + 1}`))
      .child(grayBadge(t, turn.station, { color: here ? t.accent : t.muted }))
      .child(div().flex_1())
      .when(errs > 0, (el) => el.child(div().flex_none().size(6).rounded_full().bg(t.blocked)))
      .child(div().flex_none().text_size(11).font_family(mono()).text_color(t.dim).child(dur(end - start))) };
    if (isFolded) return [header];
    // When the model was working before each call: from the previous call's end (or the
    // turn's start) to this call's start. No tool runs then; the model reads, thinks, writes.
    let prevEnd = start;
    const rows = turn.calls.flatMap((c, ci) => {
      const key = `${ti}.${ci}`;
      // A retry shows the loop icon (as on the track and in "where it went wrong") and its count.
      const tag = loopKeys.has(key) && c.err ? { loop: true, text: `${++tries}/${loop.fails}` }
        : loopKeys.has(key) && c.running ? { loop: true, text: "" } : null;
      const last = ci === turn.calls.length - 1;
      const at = toMin(c.at) * 60;
      const out = [callRow(host, t, c, key, 0, start, end, tag, c.kids?.length ? false : null, { last, first: ci === 0 }, Math.min(prevEnd, at))];
      let kidEnd = at;
      if (c.kids?.length) c.kids.forEach((k, ki) => {
        const kAt = toMin(k.at) * 60;
        out.push(callRow(host, t, k, `${key}.${ki}`, 1, start, end, null, null, { last: ki === c.kids.length - 1, outer: !last }, Math.min(kidEnd, kAt)));
        kidEnd = kAt + k.dur;
      });
      prevEnd = Math.max(prevEnd, at + c.dur);
      return out;
    });
    if (!rows.length) return [header];
    rows[rows.length - 1].after = 6 + GAP;
    return [header, ...rows];
  });

  const empty = sel.station && !turns.some((turn) => turn.station === sel.station);
  const rows = [
    ...wrong, wrong.length && RULE,
    empty && { key: "no-station", draw: () => h_flex().px(INNER).py(4).gap(6).items_center().text_size(12).text_color(t.dim)
      .child(icon(ICONS.clock, 12)).child(v.station < STATIONS.findIndex((s) => s.key === sel.station)
        ? `Not at ${sel.station} yet.` : `Nothing logged at ${sel.station}.`) },
    ...body,
  ].filter(Boolean);
  return page(t, { id: `log-list-${host.jumps ?? 0}`, top: head, lazy: true, rows,
    empty: v_flex().p(24).gap(8).items_center().text_color(t.dim)
      .child(icon(ICONS.anchor, 18)).child(div().text_size(12.5).child("No turns yet. The crewmate is reading the request.")) });
}

/** @param {Theme} t @param {string} path @param {string} text */
const stat = (t, path, text) => h_flex().gap(4).items_center().child(icon(path, 11).text_color(t.dim)).child(text);

// A row in "where it went wrong": the icon in a 16px column (like a weather note's), the
// title in the error color, the detail on one line under it. Clicking opens the call.
/** @param {Theme} t @param {string} id @param {string} path @param {string} title @param {string} detail @param {(cx: any) => void} go */
const jump = (t, id, path, title, detail, go) => ({ key: id, click: go, draw: () => h_flex().id(id).px(INNER).py(4).gap(8).items_start().rounded(RADIUS)
  .cursor_pointer().hover((s) => s.bg(t.hover))
  .child(h_flex().w(16).h(16).flex_none().justify_center().items_center().text_color(t.blocked).child(icon(path, 12)))
  .child(v_flex().flex_1().min_w(0).gap(1)
    .child(div().h(16).flex().items_center().text_size(12).text_color(t.blocked).child(title))
    .child(div().truncate().text_size(SMALL).font_family(mono()).text_color(t.dim).child(detail))) });

// The tree, drawn like Langfuse's: a line runs down from a parent's icon, and each child
// hangs off it on a rounded elbow into its own icon. A turn's chevron is the calls' parent,
// a sub-agent's call is its Agent call's, and an open call is Input and Output's.
// Depth d hangs off a line at lineX(d) and puts its icon at iconX(d).
const ICON = 13, ELBOW = 9, ICON_Y = 13; // ICON_Y: py(4) + half the 18px top line
// Where every call's bar starts, and the top of its 4px track: py(4), the 18px top line,
// gap(3), then the track centred in its 10px row.
const BAR_X = INNER + 5 + ELBOW + 4 + ICON + 6, BAR_Y = 4 + 18 + 3 + 3;
/** @param {number} d */
const lineX = (d) => (d === 0 ? INNER + 5 : iconX(d - 1) + 6);
/** @param {number} d */
const iconX = (d) => lineX(d) + ELBOW + 4;
/** @param {Theme} t */
const treeColor = (t) => mix(t.dim, t.chrome, 0.5);
// A child's elbow, from its parent's line at x down to y. `up` reaches past the top, across
// the gap to a turn header.
/** @param {Theme} t @param {number} x @param {number} y @param {number} [up] */
const elbow = (t, x, y, up = 0) => div().absolute().left(x).top(-up).w(ELBOW).h(y + up + 1)
  .border_l_1().border_b_1().rounded_bl(6).border_color(treeColor(t));
// A line from y0 to y1 at x.
/** @param {Theme} t @param {number} x @param {number} y0 @param {number} y1 */
const line = (t, x, y0, y1) => div().absolute().left(x).top(y0).h(y1 - y0).w(1).bg(treeColor(t));
// A parent's line passing a row, top to bottom, to a later sibling.
/** @param {Theme} t @param {number} x @param {number} [up] @param {number} [from] */
const pass = (t, x, up = 0, from = 0) => div().absolute().left(x).top(from - up).bottom(0).w(1).bg(treeColor(t));

// One call: tool, label, flags and duration; then its bar on the turn's timeline with
// tokens and cost: a lazy row (page.js). `kids`: null for a plain call, false for an Agent call with calls under it.
// `tree`: where it sits: `last` among its siblings, `first` under a turn header, and for a
// sub-agent's call whether its Agent call has later siblings (`outer`).
/** @param {any} host @param {Theme} t @param {any} c @param {string} key @param {number} depth @param {number} start @param {number} end @param {{ text: string, loop?: boolean } | null} tag @param {boolean | null} kids @param {{ last: boolean, first?: boolean, outer?: boolean }} tree @param {number} [model] when the model started on this call: the bar draws that stretch thin before the call's own */
function callRow(host, t, c, key, depth, start, end, tag, kids, tree, model = toMin(c.at) * 60) {
  const open = host.open.has(key);
  const tc = c.err ? t.blocked : toolColor(t, c.tool);
  const s = toMin(c.at) * 60, span = end - start;
  const left = Math.max(0, Math.min(98, ((s - start) / span) * 100));
  const width = Math.max(1.5, Math.min(100 - left, (c.dur / span) * 100));
  const x = iconX(depth), up = tree.first ? 8 : 0;
  // Its own line, down from its icon: to its sub-agent's calls, or to Input and Output.
  const down = open || kids === false;
  const click = (/** @type {any} */ cx) => { open ? host.open.delete(key) : host.open.add(key); cx.notify(); };
  return { key: `call-${key}`, after: 0, click, draw: () => v_flex().id(`call-${key}`).relative().flex_none().py(4).pr(INNER).gap(3).rounded(6).cursor_pointer()
    .hover((st) => st.bg(t.hover))
    .when(depth > 0 && Boolean(tree.outer), (el) => el.child(pass(t, lineX(0))))
    .when(!tree.last, (el) => el.child(pass(t, lineX(depth), up)))
    .child(elbow(t, lineX(depth), ICON_Y, up))
    // A sub-agent's call sits right of where every bar starts, so its line down crosses its
    // own bar. There the line goes under the bar: it stops 2px short of the track and goes
    // on 2px below it.
    .when(down && kids === false, (el) => el.child(pass(t, x + 6, 0, ICON_Y + 8)))
    .when(down && kids !== false && x + 6 < BAR_X, (el) => el.child(line(t, x + 6, ICON_Y + 8, 38)))
    .when(down && kids !== false && x + 6 >= BAR_X, (el) => el
      .child(line(t, x + 6, ICON_Y + 8, BAR_Y - 2))
      .child(line(t, x + 6, BAR_Y + 4 + 2, 38)))
    .child(h_flex().h(18).pl(x).gap(6).items_center()
      .child(icon(ICONS[c.tool] ?? ICONS.terminal, ICON).text_color(tc))
      // Wide enough for "WebFetch" in 11px mono (8 × 6.6px); a longer name truncates, never wraps.
      // An Agent row shows the sub-agent's name in place of "Agent", at its full width.
      .child(c.tool === "Agent"
        ? div().flex_1().min_w(0).truncate().text_size(11).font_family(mono()).text_color(t.muted).child(agentName(c.label))
        : div().w(56).flex_none().truncate().text_size(11).font_family(mono()).text_color(t.muted).child(c.tool))
      // Fills the row so the duration stays at the right edge.
      .when(c.tool !== "Agent", (el) => el.child(div().flex_1()))
      // A retry tag (loop icon, "2/4") goes up here, not beside the bar: every bar in a turn
      // has to be the same width, or the same time lands at different places. A dot parts it
      // from the duration, as on the tokens · cost line; red, like the duration, on a failure.
      .when(Boolean(tag), (el) => el.child(h_flex().flex_none().gap(3).items_center().text_size(10.5).text_color(t.blocked)
        .when(Boolean(tag?.loop), (r) => r.child(icon(ICONS.loop, 11)))
        .when(Boolean(tag?.text), (r) => r.child(tag?.text ?? "")))
        .child(div().flex_none().text_size(11).font_family(mono()).text_color(c.err ? t.blocked : t.dim).child("·")))
      .child(div().flex_none().text_size(11).font_family(mono()).text_color(c.err ? t.blocked : t.dim)
        .child(c.running ? "…" + dur(c.dur) : dur(c.dur))))
    // The bar, placed on the turn's timeline, and what it cost. It starts under a top-level
    // call's tool name, clear of the line down from the icon, at every depth: all of a turn's
    // bars span the same width, so a time lines up down the turn.
    .child(h_flex().h(10).pl(BAR_X).gap(8).items_center()
      .child(div().relative().flex_1().h(4).rounded(2).bg(alpha(t.foreground, 0.1)) // see-through, so it shows on a hovered row too
        // The model's time before the call: a thin line, so it reads as time without a tool.
        .when(s - model > 0.5, (el) => el.child(div().absolute().top(1).h(2).rounded(1).bg(alpha(t.muted, 0.55))
          .left(`${((model - start) / span) * 100}%`).w(`${((s - model) / span) * 100}%`)))
        .child(div().absolute().top(0).h(4).rounded(2).bg(alpha(tc, 0.85)).left(`${left}%`).w(`${width}%`)))
      .child(div().w(84).flex_none().text_right().text_size(10.5).font_family(mono()).text_color(t.dim).child(`${tokens(c.tok)} · ${money(c.cost)}`)))
    // Input and output, when opened: children of the call, one level in, on its line.
    // The section starts 38 down (py 4 + 18 + gap 3 + 10 + gap 3), where the line above stops.
    .when(open, (el) => el.child(v_flex().pl(x + 6 + ELBOW + 4)
      .child(ioNode(t, x + 6, false, io(t, "Input", c.input ?? c.label)))
      .child(ioNode(t, x + 6, true, io(t, "Output", c.output ?? (c.running ? "… running" : "ok"), c.err))))) };
}

// Input or Output on its elbow; `lineAt` is the call's line, in the row's coordinates.
/** @param {Theme} t @param {number} lineAt @param {boolean} last @param {any} child */
const ioNode = (t, lineAt, last, child) => {
  const back = lineAt - (lineAt + ELBOW + 4), top = last ? 6 : 4;
  return v_flex().relative().pt(top)
    .when(!last, (el) => el.child(pass(t, back)))
    .child(elbow(t, back, top + 7))
    .child(child);
};

/** @param {Theme} t @param {string} label @param {string} text @param {boolean} [bad] */
const io = (t, label, text, bad = false) => v_flex().gap(3)
  .child(div().text_size(10.5).text_color(bad ? t.blocked : t.dim).child(label))
  .child(v_flex().relative().p(7).child(notchBox(5, t.background, bad ? alpha(t.blocked, 0.35) : t.border))
    .text_size(11).font_family(mono()).text_color(t.foreground)
    .children(String(text).split("\n").map((line) => div().child(line || " "))));
