// The clock and battery, macOS menu bar style, for the strip over the sidebar in fullscreen,
// where macOS hides its menu bar. The strip's own copy of Tabs (props titlebar) draws it.
import { div } from "gpui-kit";
import { h_flex } from "gpui-base";
import { exec, window } from "herdr";

/** @typedef {{ percent: number, charging: boolean } | null} Battery */

// pmset -g batt: "...\t96%; discharging; 4:52 remaining" (no battery: no "%" line).
/** @returns {Promise<Battery>} */
export async function readBattery() {
  const r = await exec("pmset", ["-g", "batt"], { timeout: 3000 });
  const m = /(\d+)%;\s*([^;]+);/.exec(r.stdout);
  if (!m) return null;
  return { percent: Number(m[1]), charging: !/discharging/.test(m[2]) };
}

/** Refresh the battery every 30s while fullscreen, and redraw for the clock's minute. @param {any} view @param {any} cx */
export function startClock(view, cx) {
  /** @type {Battery} */
  view.battery = null;
  const tick = (/** @type {any} */ cx) => {
    if (!window()?.fullscreen) return;
    cx.spawn(async (/** @type {any} */ cx) => {
      try { view.battery = await readBattery(); } catch { view.battery = null; }
      cx.notify();
    });
  };
  cx.timer.every(30000, tick);
  tick(cx);
}

/** A battery icon: a rounded outline with a nub, filled to the charge. 22 wide by default;
 *  the rail's is 16. @param {any} t @param {NonNullable<Battery>} b @param {number} [w] the outline's width */
const batteryIcon = (t, b, w = 22) => {
  const h = Math.round(w / 2), inner = w - 4;
  const low = b.percent <= 20 && !b.charging;
  const fill = low ? t.blocked : b.charging ? t.done : t.foreground;
  return h_flex().items_center().gap(1).flex_none()
    .child(div().w(w).h(h).rounded(w > 18 ? 3 : 2).border(1).border_color(t.muted).p(1)
      .child(div().h_full().rounded(1).bg(fill).w(Math.max(1, Math.round(inner * b.percent / 100)))))
    .child(div().w(1.5).h(Math.round(h * 0.4)).rounded_r(1).bg(t.muted));
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The strip's contents: "96% [battery]   Thu Nov 13  9:50 PM", left-aligned. @param {any} t @param {Battery} battery*/
export function clockBar(t, battery) {
  const now = new Date();
  // By hand: the script engine ignores toLocale*String's options. As macOS: "Thu Nov 13  9:50 PM".
  const day = `${DAYS[now.getDay()]} ${MONTHS[now.getMonth()]} ${now.getDate()}`;
  const h = now.getHours() % 12 || 12, m = String(now.getMinutes()).padStart(2, "0");
  const time = `${h}:${m} ${now.getHours() < 12 ? "AM" : "PM"}`;
  return h_flex().size_full().items_center().gap(10).px(8).text_size(12).text_color(t.foreground)
    .when(Boolean(battery), el => el.child(h_flex().items_center().gap(5)
      .child(div().text_color(t.muted).child(`${battery?.percent}%`))
      .child(batteryIcon(t, /** @type {NonNullable<Battery>} */ (battery)))))
    .child(div().child(`${day}  ${time}`));
}


/** Over the rail, too narrow for the rest: the battery icon alone, centered. @param {any} t @param {Battery} battery */
export const railBattery = (t, battery) =>
  h_flex().size_full().items_center().justify_center().when(Boolean(battery), el => el.child(batteryIcon(t, /** @type {NonNullable<Battery>} */ (battery), 16)));
