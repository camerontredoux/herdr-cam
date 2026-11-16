// Move the focused pane within its tab (cmd+alt+shift+arrows, cam.move-pane-<dir>).
// With a pane that way, it swaps with it (pane.swap). Without one, it goes to that side of
// the pane beside it on the other axis: two stacked panes become side by side, and back.
// Already at the edge on both axes: nothing to do.
//
// Herdr has no command for that edge drop. A blank cam pane (role "blank", no terminal) is
// split off the anchor where the moving pane should go, the moving pane swaps into its
// place, and the blank pane closes. The tab never drops to one pane, so the split styling
// holds and the terminal never leaves the tab.
//
// The mod API has no change events and run() returns nothing: commands land on a later
// frame. So each step waits on its own visible effect, a frame (~12ms) at a time, bounded.
import { run, panes, focused } from "herdr";

const OTHER_AXIS = { left: ["up", "down"], right: ["up", "down"], up: ["left", "right"], down: ["left", "right"] };
const FRAME = 12;

/** `check()`'s first truthy value, read now and then once a frame; null after `frames`.
 *  @template T @param {() => T} check @param {number} frames @param {(ms: number) => Promise<void>} sleep */
async function until(check, frames, sleep) {
  for (let i = 0; i <= frames; i++) {
    const v = check();
    if (v) return v;
    if (i < frames) await sleep(FRAME);
  }
  return null;
}

/** The pane `dir` of `pane` (null: none), found by moving focus there. Focus is left on
 *  whatever pane.go reached, so callers refocus. A miss costs 2 frames.
 *  @param {string} pane @param {string} dir @param {(ms: number) => Promise<void>} sleep */
async function neighbor(pane, dir, sleep) {
  if (focused()?.pane !== pane) {
    run("pane.focus", { pane });
    await until(() => focused()?.pane === pane, 3, sleep);
  }
  run("pane.go", { direction: dir });
  return until(() => { const p = focused()?.pane; return p && p !== pane ? p : null; }, 2, sleep);
}

/** @param {"left" | "right" | "up" | "down"} dir @param {(ms: number) => Promise<void>} sleep */
export async function movePane(dir, sleep) {
  const f = focused();
  const pane = f?.pane;
  if (!pane || !f?.terminal) return; // a mod pane or a layout block: not a tab's terminal pane
  const tab = f.tab;
  if (!panes().some(p => p.tab === tab && p.pane !== pane)) return;

  if (await neighbor(pane, dir, sleep)) {
    run("pane.focus", { pane });
    run("pane.swap", { pane, direction: dir });
    return;
  }
  let anchor = null;
  for (const d of OTHER_AXIS[dir]) if ((anchor = await neighbor(pane, d, sleep))) break;
  run("pane.focus", { pane });
  if (!anchor) return;

  const before = new Set(panes().map(p => p.pane));
  run("pane.split", { pane: anchor, direction: dir === "left" || dir === "right" ? "right" : "down", mod: "cam", props: { role: "blank" } });
  const blank = await until(() => panes().find(p => p.tab === tab && !before.has(p.pane))?.pane, 10, sleep);
  if (!blank) return;
  // Split only places right/down; for left/up the blank pane trades places with the anchor.
  if (dir === "left" || dir === "up") run("pane.swap", { pane: blank, target: anchor });
  run("pane.swap", { pane, target: blank });
  run("pane.close", { pane: blank });
  run("pane.focus", { pane });
  await until(() => !panes().some(p => p.pane === blank), 10, sleep);
}
