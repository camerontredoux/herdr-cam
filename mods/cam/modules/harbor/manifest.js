// The Manifest: incoming client requests, one card each, already sorted. Click a card to
// select it; on hover, Charter makes it a voyage at Request, Dismiss drops it (both mock).
// Both ask first (ManifestConfirm, below).
// Keys while the panel has the keyboard: up/down select, enter charters, backspace dismisses.
import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { props, closeOverlay } from "herdr";
import { CLIENTS, MANIFEST } from "./data.js";
import { ICONS, SMALL, alpha, brackets, button, clientColor, clientTile, colors, grayBadge, icon, keyChip } from "./theme.js";
import { manifest, selectedCard, selectCard, charter, dismiss, resolve, reset } from "./state.js";
import { TILE, RADIUS, TEXT_BAR_PAD, INSET, GAP, bar, panel, titleBar, dialogButton } from "../ui/index.js";
import { page, INNER, TITLE_H, CHIP, ROW_Y } from "./page.js";

// A note row, as on the Chart; the last row of a card sits NOTE_DROP into its bottom padding.
const NOTE_H = 20, NOTE_DROP = 1;

/** @typedef {import("./theme.js").Theme} Theme */

const SOURCE = { gmail: "Gmail", fathom: "Fathom", slack: "Slack" };
const CONFIDENCE = { high: 3, medium: 2, low: 1 };

// The selected card: the shared one if it's still here, else the first.
const current = () => {
  const list = manifest(), id = selectedCard();
  return list.find((m) => m.id === id) ?? list[0] ?? null;
};

/** @param {any} host @param {import("gpui-kit").KeyEvent} e @returns {boolean} handled */
export function manifestKeys(host, e) {
  const list = manifest(), card = current();
  const i = card ? list.indexOf(card) : -1;
  if (e.key === "down" && i < list.length - 1) selectCard(list[i + 1].id);
  else if (e.key === "up" && i > 0) selectCard(list[i - 1].id);
  else if (e.key === "enter" && card) host.ask("charter", card.id);
  else if ((e.key === "backspace" || e.key === "delete") && card) host.ask("dismiss", card.id);
  else return false;
  return true;
}

// How sure the issue match is, as three small bars, like a signal meter.
/** @param {Theme} t @param {string} level */
const meter = (t, level) => {
  const n = CONFIDENCE[level] ?? 0;
  const c = n === 3 ? t.done : n === 2 ? t.accent : t.dim;
  return h_flex().flex_none().gap(5).items_center()
    .child(h_flex().gap(2).items_end().children([5, 8, 11].map((h, k) => div().w(3).h(h).rounded(1).bg(k < n ? c : t.raised))))
    .child(level[0].toUpperCase() + level.slice(1));
};

// One request, laid out like a voyage on the Chart: the title row (client, the ticket it
// would become, its issue if it has one, when it came in), then their words on the client's
// rule (the Chart's decision question), then where it came from and how sure the match is,
// in a note row (the Chart's weather notes). On hover the title row's right side turns into
// its choices, as the Chart's Terminal and Open.
/** @param {any} host @param {Theme} t @param {any} m @param {boolean} on */
function card(host, t, m, on) {
  const key = `card-${m.id}`, hot = host.hot === key;
  // Sized as the Chart's actions; Charter, the suggested one, keeps its tint. Hover lifts the label.
  const act = (/** @type {string} */ id, /** @type {string} */ label, /** @type {() => void} */ run, /** @type {any} */ tint) =>
    grayBadge(t, label, { id: `${id}-${m.id}`, tint }).cursor_pointer().hover((s) => s.text_color(t.foreground))
      .on_click((_e, cx) => { cx.stop_propagation(); run(); cx.notify(); });
  return v_flex().id(key).flex_none().px(INNER).pt(ROW_Y).pb(ROW_Y - NOTE_DROP).gap(4)
    .rounded(RADIUS).cursor_pointer()
    .relative()
    .when(on, (el) => el.rounded(0).bg(t.surface).children(brackets(t.accent)))
    .when(!on, (el) => el.hover((s) => s.bg(alpha(t.surface, 0.7))))
    .on_hover((over, cx) => {
      if (over) host.hot = key; else if (host.hot === key) host.hot = null;
      cx.notify();
    })
    .on_click((_e, cx) => { selectCard(m.id); host.handle.focus(); cx.notify(); })
    .child(h_flex().h(TITLE_H).gap(8).items_center()
      .child(clientTile(m.client))
      .child(div().flex_1().min_w(0).truncate().text_size(13).text_color(t.foreground).child(m.title))
      .child(hot
        ? h_flex().flex_none().gap(4).items_center()
          .child(act("charter", "Charter", () => host.ask("charter", m.id), t.accent))
          .child(act("dismiss", "Dismiss", () => host.ask("dismiss", m.id)))
        : h_flex().flex_none().gap(8).items_center().text_size(SMALL).text_color(t.dim)
          .when(Boolean(m.match), (el) => el.child(`#${m.match?.issue}`))
          .child(m.at)))
    .child(div().pl(8).border_l(2).border_color(clientColor(m.client)).text_size(12).text_color(t.muted)
      .child(`“${m.quote}”`))
    .child(h_flex().h(NOTE_H).gap(4).items_center().text_size(SMALL).text_color(t.dim)
      .child(h_flex().w(CHIP).flex_none().justify_center().child(icon(ICONS[m.source], 12)))
      .child(div().flex_1().min_w(0).truncate().child(`${SOURCE[m.source]} · ${m.from}`))
      .child(meter(t, m.confidence)));
}

/** @param {any} host @param {Theme} t */
export function renderManifest(host, t) {
  const list = manifest(), on = current();
  // A rule between requests, edge to edge, as between voyages.
  return page(t, { id: "manifest-list", rules: true,
    rows: list.map((m) => card(host, t, m, m === on)),
    empty: v_flex().p(24).gap(10).items_center().text_color(t.dim)
      .child(icon(ICONS.anchor, 20))
      .child(div().text_size(12.5).child("Nothing waiting. Every request has sailed."))
      .child(button(t, "manifest-reset", "Reset mock", { icon: ICONS.reset }).on_click((_e, cx) => { reset(); cx.notify(); })),
    // Keys, like the palette's chips, in a footer bar (the status bar's padding: words).
    foot: bar(t, "above").pl(TEXT_BAR_PAD).pr(4).gap(6).text_size(SMALL).text_color(t.dim)
      .child(keyChip(t, "↑↓")).child("select")
      .child(div().w(4)).child(keyChip(t, "⏎")).child("charter")
      .child(div().w(4)).child(keyChip(t, "⌫")).child("dismiss")
      .child(div().flex_1())
      .child(div().id("reset").size(TILE).flex().items_center().justify_center().rounded(RADIUS).cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Reset the mock")
        .on_click((_e, cx) => { reset(); cx.notify(); }).child(icon(ICONS.reset, 13))) });
}

// Charter and Dismiss ask first, in the look of cam's confirms: props { action, id }.
// Enter confirms, Esc cancels. cam opens it as its "harbor-confirm" role (Harbor.confirm).
const ASK = {
  charter: { title: "Charter this request?", yes: "Charter", run: charter },
  dismiss: { title: "Dismiss this request?", yes: "Dismiss", run: dismiss },
  // A decision's answer: id is the voyage, choice the answer.
  decide: { title: "Send this answer?", yes: "Send", run: (/** @type {string} */ id, /** @type {string} */ c) => resolve(id, c) },
};
export const CONFIRM_SIZE = { width: 320, height: 2 * INSET + 3 * TILE + 2 * GAP + 8 };

export class ManifestConfirm extends View {
  /** @param {any} _props @param {any} cx */
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  yes() {
    const p = props();
    closeOverlay(p.overlay);
    ASK[p.action]?.run(p.id, p.choice);
  }

  render() {
    const t = colors(), p = props() ?? {};
    const ask = ASK[p.action] ?? ASK.charter;
    return panel(t, "harbor-confirm").size_full()
      .track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "enter") this.yes();
        else if (e.key === "escape") closeOverlay(p.overlay);
        else return;
        cx.stop_propagation();
      })
      .child(titleBar(t, ask.title))
      .child(div().flex_1().min_h(0).px(10 - INSET).text_color(t.muted).truncate()
        .child(p.action === "decide" ? `“${p.choice}”` : MANIFEST.find((m) => m.id === p.id)?.title ?? ""))
      .child(h_flex().justify_end().gap(4)
        .child(dialogButton(t, "harbor-confirm-no", "Cancel", false, () => closeOverlay(p.overlay)))
        .child(dialogButton(t, "harbor-confirm-yes", ask.yes, true, () => this.yes())));
  }
}
