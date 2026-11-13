// The Chart: every voyage as a block with its own subway line through the nine stations.
// A dot marks where it is now; sub-agents fork below the line and rejoin it; weather marks
// problems over the station (or sub-agent) it happened at. Each voyage has Terminal (mock)
// and Open (its Log) on hover.
import { div, PathBuilder } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { notify } from "herdr";
import { STATIONS, VOYAGES } from "./data.js";
import { ICONS, STATUS, SMALL, mono, alpha, mix, grayLine, badge, brackets, clientTile, grayBadge, icon, statusColor } from "./theme.js";
import { RADIUS } from "../ui/index.js";
import { page, chip, INSET, GAP, INNER, TITLE_H, CHIP, ROW_Y, EDGE } from "./page.js";
import { voyages, selection, select, time, clock, ago, toMin, END } from "./state.js";

/** @typedef {import("./theme.js").Theme} Theme */
/** @typedef {import("./state.js").Voyage} Voyage */

// ---- Geometry (px). Tweak the map's density here. Each voyage block is a page row
// (page.js): INSET (4) from the panel edge, GAP (2) apart, corners of 6, like the
// sidebar's rows; inside, its content sits INNER from the block's edge on every side.
const PAD = INSET;     // the panel edge to a voyage block (page.js sets it)
const BX = INNER;      // inside a block, left and right
// Top and bottom: less the room the rows already leave. The TITLE_H row centers its 16px
// tile (CHIP), and the last row (a note, or the track's halo room) has as much below.
const BY = ROW_Y;
const ABOVE = 22;      // the track above its line: room for weather icons
const BELOW = 10;      // the track below its line with no forks (half a halo)
const FORK_D = 9;      // a fork's depth below the line (each overlapping one 6 more)
const NOTE_H = 20;     // a weather note under the line
const NOTE_DROP = 1;   // a last note moves this far into the bottom padding, so its text sits
                       // as far from the track above as from the block's edge below
const NOTE_GAP = 4;    // a note's icon (on the content's left edge, like the track's first ring) to its text
const TITLE_UNDER = 3.5; // the title row's room under its letters (measured)
const PASSED = 8;      // a passed station's ring
const DOT = 11;        // the current station's dot
const HALO = 18;       // and its halo
const MOVE = { duration: 420, easing: /** @type {const} */ ("ease-in-out") }; // a dot moving on

// Weather kinds: icon and color.
/** @param {Theme} t */
const WEATHER = (t) => ({
  loop: { icon: ICONS.loop, color: t.blocked },
  tokens: { icon: ICONS.tokens, color: t.ansi3 },
  storm: { icon: ICONS.storm, color: t.blocked },
});

// One stroked path, painted over its parent (coordinates in px from the parent's corner).
/** @param {(p: any) => any} draw @param {number} width @param {any} color @param {number[]} [dash] */
function stroke(draw, width, color, dash) {
  let p = PathBuilder.stroke(width);
  if (dash) p = p.dash_array(dash);
  return window.paint_path(draw(p).build(), color).absolute().top(0).left(0).size_full();
}

// A circle centered on (x, y).
/** @param {number} x @param {number} y @param {number} d */
const dot = (x, y, d) => div().absolute().left(x - d / 2).top(y - d / 2).size(d).rounded_full();

// Sub-agents that ran side by side over the same stretch (same start and end station, both
// rejoined) share one fork, their dots spread along it. `twins` lists the fork's sub-agents.
/** @param {{ from: string, to: string | null }} f @param {{ from: string, to: string | null }} g */
const twin = (f, g) => f.to !== null && f.from === g.from && f.to === g.to;
/** @param {{ from: string, to: string | null }[]} forks @param {number} k */
const twins = (forks, k) => forks.filter((g) => g === forks[k] || twin(forks[k], g));

// A fork's depth below the line: each one sharing a start or end with an earlier fork
// (not its twins) hangs 6px lower.
/** @param {{ from: string, to: string | null }[]} forks @param {number} k */
const forkDepth = (forks, k) => {
  const own = twins(forks, k), lead = forks.indexOf(own[0]);
  return FORK_D + forks.slice(0, lead).filter((g) => !own.includes(g) && (g.from === forks[k].from || g.to === forks[k].to))
    .filter((g, i, all) => all.findIndex((x) => x === g || twin(x, g)) === i).length * 6;
};

// How far the track draws below its line: the halo's lower half, or the lowest fork's dot
// (half a dot) or count chip (half a chip).
/** @param {string} id */
function ink(id) {
  const forks = VOYAGES.find((v) => v.id === id)?.forks ?? [];
  return Math.max(HALO / 2, ...forks.map((_, k) => forkDepth(forks, k) + (twins(forks, k).length > 2 ? 6 : 2.5)));
}

// The warnings a voyage shows: none while it waits on a decision, which takes their place
// on the card (its question says what needs you; a loop or token note beside it is clutter).
/** @param {Voyage} v */
const weatherOf = (v) => (v.status === "decision" ? [] : v.weather);
// Where a warning happened, when that isn't the current dot: its sub-agent's name, or its
// station's. The caption names it, and the track tints that spot in the warning's color.
/** @param {Voyage} v @param {any} w */
const offNow = (v, w) => w.fork ?? (w.at !== STATIONS[v.station]?.key ? w.at : null);

// How much empty room the track keeps above its highest drawing: almost none under a
// weather icon (it sits at the track's top), else the space over the halo.
/** @param {Voyage} v */
const roomAbove = (v) => (weatherOf(v).length > 0 ? 1 : ABOVE - HALO / 2);

// The track's height below the line, from every fork the voyage will ever have, so a
// block's height is fixed by its data.
/** @param {string} id */
function below(id) {
  const forks = VOYAGES.find((v) => v.id === id)?.forks ?? [];
  // Room under the lowest fork, flush with what it draws: half a dot, or half a count chip.
  return Math.max(BELOW, ...forks.map((_, k) => forkDepth(forks, k) + (twins(forks, k).length > 2 ? 6 : 2.5)));
}

/** @param {any} host @param {Theme} t */
export function renderChart(host, t) {
  const width = host.chartWidth;
  const list = voyages();
  const sel = selection();
  const asking = (/** @type {Voyage} */ v) => v.status === "decision";
  // Station x positions inside a block's track; the ends sit under the client tile's
  // center and the title row's right edge.
  const { xs, step } = stationXs(width);

  const blocks = list.map((v) => block(host, t, v, xs, step, asking(v), host.wide && sel.voyage === v.id));

  // A rule between voyages, edge to edge across the panel.
  return page(t, { id: "chart-scroll", rows: blocks, rules: true,
    empty: div().p(24).text_size(12.5).text_color(t.dim).child(`Nothing had sailed by ${clock(time())}.`) });
}

// Station x positions inside a track for a page `width` wide: the track is a row's content
// (page.js: INSET + INNER each side). A passed station's ring (8px) touches the content's
// edges, so the first one lines up with the client tile's left edge; a current station's
// halo reaches past them into the block's padding.
/** @param {number} width */
export function stationXs(width) {
  const tw = Math.max(120, width - 2 * PAD - 2 * BX);
  const x0 = PASSED / 2, x1 = tw - PASSED / 2;
  const step = (x1 - x0) / (STATIONS.length - 1);
  return { xs: STATIONS.map((_, i) => x0 + i * step), step };
}

// A voyage's color shows its health; the badge shows its status. A voyage with a warning
// takes the warning's color, the worst one if several (errors and loops, then tokens). A
// blocked or deciding voyage keeps its own color, which matters more (and a deciding one
// shows no warnings).
const WORST = ["loop", "storm", "tokens"];
/** @param {Theme} t @param {Voyage} v */
const trackColor = (t, v) => {
  const shown = v.status === "blocked" ? [] : weatherOf(v);
  const worst = WORST.find((k) => shown.some((w) => w.kind === k));
  return worst ? WEATHER(t)[worst].color : statusColor(t, v.status);
};

// One voyage: its title row, its line, its weather notes, and a decision to answer.
/** @param {any} host @param {Theme} t @param {Voyage} v @param {number[]} xs @param {number} step @param {boolean} ask @param {boolean} traced */
function block(host, t, v, xs, step, ask, traced) {
  const color = trackColor(t, v);
  const hot = host.hot === v.id;

  // The bottom padding leaves the last mark EDGE from the block's edge, as the tile is from
  // its top: the decision's chips; the track's lowest drawing, less the room the track
  // keeps under it. A weather note that ends the block moves down NOTE_DROP instead, out of
  // the block's bottom padding, so its text sits as far from the track as from the edge.
  const notes = weatherOf(v), noteLast = notes.length > 0 && !ask;
  const pb = ask ? EDGE : noteLast ? BY - NOTE_DROP : EDGE - (below(v.id) - ink(v.id));
  return v_flex().id(`voy-${v.id}`).flex_none().px(BX).pt(BY).pb(pb).rounded(RADIUS)
    // The voyage whose Log is open: a tint and square corners marked in its color.
    .relative()
    .when(traced, (el) => el.rounded(0).bg(t.surface).children(brackets(color)))
    .when(!traced, (el) => el.hover((s) => s.bg(alpha(t.surface, 0.7))))
    .on_hover((over, cx) => {
      if (over) host.hot = v.id; else if (host.hot === v.id) host.hot = null;
      cx.notify();
    })
    .child(titleRow(host, t, v, hot))
    // The halo blends over what's behind the block: the traced tint, the hover tint, or the panel.
    .child(track(host, t, v, xs, step, "", false, traced ? t.surface : hot ? mix(t.surface, t.chrome, 0.7) : t.chrome))
    .when(notes.length > 0, (el) => el.child(v_flex().when(noteLast, (c) => c.mt(NOTE_DROP)).children(notes.map((w) => {
      const kind = WEATHER(t)[w.kind] ?? WEATHER(t).storm;
      return h_flex().h(NOTE_H).gap(NOTE_GAP).items_center().text_size(SMALL).text_color(kind.color)
        .child(div().flex_none().child(icon(kind.icon, 12)))
        .child(div().flex_1().min_w(0).truncate().child(offNow(v, w) ? `${w.text} in ${offNow(v, w)}` : w.text));
    }))))
    // The decision: the question on the status color's rule, then its choices as small chips
    // in the card's own scale. The first (the crewmate's pick) is tinted like the Decide badge.
    // The decision sits as far under the track's lowest drawing as the track's highest one
    // sits under the title's letters.
    .when(ask, (el) => el.child(v_flex().mt(TITLE_UNDER + roomAbove(v) - (below(v.id) - ink(v.id))).gap(6)
      .child(v_flex().pl(10).gap(6).border_l_2().border_color(color)
      .child(div().text_size(SMALL).text_color(t.muted).child(v.decision?.question ?? "Needs a decision"))
      .child(h_flex().gap(4).flex_wrap().children((v.decision?.choices ?? ["Approve"]).map((c, k) =>
        chip(t, `ans-${v.id}-${k}`, c, k === 0 ? color : null).on_click((_e, cx) => { cx.stop_propagation(); host.ask("decide", v.id, c); cx.notify(); })))))));
}

// A voyage's line: stations, sub-agent forks and weather. Clicking a station opens its Log
// there. The Chart's blocks draw it, and so does the Log's header.
// The tallest track's room below the line, of every voyage: the Log's track takes this, so
// the Log's content doesn't move when the selection moves to a voyage with fewer forks.
const TALLEST = Math.max(...VOYAGES.map((v) => below(v.id)));

// `scope` prefixes its element ids, so the copy in the Log never shares ids with the Chart's:
// shared ids made both copies fight over one transition, and it ran every frame. `even`
// makes the track the tallest one's height, whatever its own forks.
/** @param {any} host @param {Theme} t @param {Voyage} v @param {number[]} xs @param {number} step @param {string} [scope] @param {boolean} [even] @param {any} [under] */
export function track(host, t, v, xs, step, scope = "", even = false, under = t.chrome) {
  const color = trackColor(t, v);
  const cur = v.station, last = xs.length - 1, prev = Math.max(0, cur - 1);
  // Only what's happening now takes the status color: the current dot, the leg into it and the station it left, a
  // running sub-agent and the weather. The road behind is neutral, so a voyage that broke on
  // its ninth step doesn't read red end to end, and the panel's problems stand out.
  const done = mix(t.muted, t.chrome, 0.7);
  /** @param {number} i */
  const stationAlert = (i) => {
    const w = weatherOf(v).find((w) => !w.fork && w.at === STATIONS[i].key);
    return w ? (WEATHER(t)[w.kind] ?? WEATHER(t).storm).color : null;
  };
  const lineY = ABOVE, h = ABOVE + (even ? TALLEST : below(v.id));
  /** @type {any[]} */
  const track = [];

  // The line: a dim dashed track end to end, the travelled part drawn over it in gray, and
  // the last leg in the status color. Both are bars so they slide on as the dot moves.
  track.push(stroke((p) => p.move_to(xs[0], lineY).line_to(xs[last], lineY), 1.5, alpha(t.dim, 0.45), [3, 4]));
  track.push(div().id(`${scope}bar-${v.id}`).absolute().left(xs[0]).top(lineY - 1.25).h(2.5).rounded(1.25).bg(done)
    .w(xs[prev] - xs[0]).transition("width", MOVE));
  track.push(div().id(`${scope}leg-${v.id}`).absolute().left(xs[prev]).top(lineY - 1.25).h(2.5).rounded(1.25).bg(color)
    .w(xs[cur] - xs[prev]).transition("left", MOVE).transition("width", MOVE));

  // Sub-agents: forks below the line, from one station back into a later one.
  /** @type {number[]} */
  const forkX = [];
  v.forks.forEach((f, k) => {
    const a = xs[STATIONS.findIndex((s) => s.key === f.from)];
    const open = f.running || !f.to;
    const b = open ? a + step * 0.75 : xs[STATIONS.findIndex((s) => s.key === f.to)];
    const d = forkDepth(v.forks, k), r = Math.min(9, (b - a) / 3);
    // Two side by side get a dot each; three or more share one chip with their count.
    const own = twins(v.forks, k), j = own.indexOf(f), many = own.length > 2;
    const hit = weatherOf(v).find((w) => own.some((g) => g.name === w.fork));
    const fc = hit ? (WEATHER(t)[hit.kind] ?? WEATHER(t).storm).color : open ? color : done;
    const mx = open ? b : (a + b) / 2 + (many ? 0 : (j - (own.length - 1) / 2) * 9), my = lineY + d;
    forkX.push(mx);
    if (j === 0) track.push(stroke((p) => {
      p = p.move_to(a, lineY).cubic_bezier_to(a + r, lineY + d, a + r / 2, lineY, a + r / 2, lineY + d);
      p = p.line_to(open ? b : b - r, lineY + d);
      return open ? p : p.cubic_bezier_to(b, lineY, b - r / 2, lineY + d, b - r / 2, lineY);
    }, 1.5, fc));
    /** @param {any} g */
    const took = (g) => (g.end ? toMin(g.end) : Math.min(time(), END)) - toMin(g.start);
    if (many) {
      if (j > 0) return;
      const n = String(own.length), w = 6 + n.length * 6;
      track.push(h_flex().id(`${scope}forkn-${v.id}-${k}`).absolute().left(mx - w / 2).top(my - 6).w(w).h(12).rounded_full()
        .items_center().justify_center().bg(hit ? fc : own.some((g) => g.running || !g.to) ? color : done).text_color(t.background).text_size(9.5).font_semibold().child(n)
        .tooltip(`${n} sub-agents · ${own.map((g) => `${g.name} ${ago(took(g))}`).join(" · ")}, rejoined at ${f.to}`));
      return;
    }
    track.push(dot(mx, my, 5).id(`${scope}forkdot-${v.id}-${k}`).bg(fc));
    track.push(div().id(`${scope}fork-${v.id}-${k}`).absolute().left(mx - 8).top(my - 8).size(16).rounded_full()
      .tooltip(`Sub-agent · ${f.name} · ${open ? `running ${ago(took(f))}` : `${ago(took(f))}, rejoined at ${f.to}`}`));
  });

  // Stations: rings behind, the current one a filled dot with a halo, empty ones ahead.
  STATIONS.forEach((s, i) => {
    if (i < cur) track.push(dot(xs[i], lineY, PASSED).bg(t.background).border_2().border_color(stationAlert(i) ?? (i === prev ? color : done)));
    else if (i > cur) track.push(dot(xs[i], lineY, 6).bg(t.background).border_1().border_color(alpha(t.dim, 0.7)));
  });
  // The current dot keeps its id from station to station, so it slides along the line.
  // Every halo has an outline ring and a solid fill, so lines and forks under it don't show
  // through; none pulses: a `.loop` lays out the
  // whole window about 30 times a second, which made scrolling and hovering slow. Every
  // animated element has its own id (with `scope`): two with one id fight over one animation.
  // At the first or last station the dot is just the station's ring filled in, with no halo:
  // those stations touch the content's edges, and a halo would run into the block's padding.
  const end = cur === 0 || cur === STATIONS.length - 1;
  if (!end) track.push(dot(xs[cur], lineY, HALO).id(`${scope}halo-${v.id}`).bg(mix(color, under, 0.22)).transition("left", MOVE)
    .border_1().border_color(alpha(color, 0.8)));
  track.push(end
    ? dot(xs[cur], lineY, PASSED).id(`${scope}now-${v.id}`).bg(color).transition("left", MOVE)
    : dot(xs[cur], lineY, DOT).id(`${scope}now-${v.id}`).bg(color).border_2().border_color(t.background).transition("left", MOVE));
  // Hit areas, over everything: a tooltip naming the station; a click opens its Log.
  STATIONS.forEach((s, i) => {
    const reached = v.visited[i];
    const tip = i === cur
      ? `${s.key} · ${STATUS(t)[v.status]?.label ?? v.status} · since ${clock(v.since)}`
      : reached !== undefined ? `${s.key} · reached ${clock(reached)}` : `${s.key} · not yet`;
    track.push(div().id(`${scope}st-${v.id}-${i}`).absolute().left(xs[i] - 10).top(lineY - 10).size(20).rounded_full().cursor_pointer()
      .hover((st) => st.bg(alpha(t.foreground, 0.08))).tooltip(tip)
      .on_click((_e, cx) => {
        cx.stop_propagation();
        select(v.id, s.key);
        if (!host.wide) host.show("log");
        cx.notify();
      }));
  });

  // Weather: an icon centered over its station (or its sub-agent's span), above the
  // line; several at one spot sit side by side.
  /** @type {Record<string, number>} */
  const atX = {};
  weatherOf(v).forEach((w, k) => {
    const kind = WEATHER(t)[w.kind] ?? WEATHER(t).storm;
    const fk = w.fork ? v.forks.findIndex((f) => f.name === w.fork) : -1;
    const base = fk >= 0 ? forkX[fk] : xs[STATIONS.findIndex((s) => s.key === w.at)];
    const n = atX[base] = (atX[base] ?? -1) + 1;
    const x = base + (n ? (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 14 : 0);
    track.push(h_flex().id(`${scope}wx-${v.id}-${k}`).absolute().left(x - 7).top(lineY - 22).size(14).items_center().justify_center()
      .text_color(kind.color).tooltip(w.text).child(icon(kind.icon, 12)));
  });

  return div().relative().w_full().h(h).flex_none().children(track);
}

// A voyage's title row: client, name, then its issue and how it's doing. On hover the
// right side turns into its actions.
/** @param {any} host @param {Theme} t @param {Voyage} v @param {boolean} hot */
function titleRow(host, t, v, hot) {
  const color = statusColor(t, v.status);
  const state = v.status === "working"
    ? h_flex().gap(5).items_center().text_color(t.dim)
      .child(ago(time() - v.since))
    : v.status === "blocked" ? badge(color, "Blocked")
    : v.status === "decision" ? badge(color, "Decide")
    : v.status === "done" ? h_flex().gap(4).items_center().text_color(color).child(icon(ICONS.check, 12)).child("Merged")
    : h_flex().gap(4).items_center().text_color(t.dim).child(icon(ICONS.clock, 12)).child("Client");
  // A quiet action: a notched gray outline like the choice chips, an outline, so it's sized like
  // the outlined badges, such as Blocked (16px, 6px sides, 10px mono capitals). Hover lifts the label, since the
  // notched shape can't take a style.
  const act = (/** @type {string} */ id, /** @type {string} */ label) => grayBadge(t, label, { id: `${id}-${v.id}` })
    .cursor_pointer().hover((s) => s.text_color(t.foreground));
  const meta = hot
    ? h_flex().flex_none().gap(4).items_center()
      .child(act("terminal", "Terminal").on_click((_e, cx) => {
        cx.stop_propagation();
        notify({ title: "Open terminal (mock)", body: `Would jump to crewmate ${v.crewmate}'s pane on ${v.branch}.`, level: "info", timeout: 2500 });
        cx.notify();
      }))
      .child(act("open", "Open").on_click((_e, cx) => {
        cx.stop_propagation();
        select(v.id, null);
        host.show("log");
        cx.notify();
      }))
    : h_flex().flex_none().gap(8).items_center().text_size(SMALL)
      .when(Boolean(v.issue), (el) => el.child(div().text_color(t.dim).child(`#${v.issue}`)))
      .child(state);
  return h_flex().h(TITLE_H).gap(8).items_center()
    .child(clientTile(v.client))
    .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.foreground).child(v.title))
    .child(meta);
}
