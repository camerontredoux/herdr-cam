# Recipe: the Cam layout

Use this recipe when the files in this repo don't work on your Herdr version. It describes the layout, so Herdr's agent can rebuild it.

## Window

- A thin top strip with the window buttons, a sidebar toggle and a search button. No title text.
- Below the strip, two cards on a dark canvas with a small gap between them. The cards have rounded corners.
  - **Left card:** the sidebar, about 240pt wide. It can collapse to a 26pt rail.
  - **Right card:** the work area. A tab bar at the top, the panes in the middle and a status bar at the bottom.

## Sidebar

- **One row per workspace.** Rows are 22pt high. A 16pt creature sits at the left, then the workspace name.
  - **The creature** is a shape picked from the workspace id: circle, pill, rounded square, drop, leaf or ghost. It has two dark eyes and no letter. Its colour comes from a muted palette: `#3f9e8f`, `#cf8a5e`, `#6a8fd6`, `#8a78e0`, `#4f9a68` and `#c46f96`.
  - **While an agent in the workspace works,** the eyes dart left and right in a 700ms loop.
- **Under each workspace, one row per tab.**
  - **Left:** the tab's name, lined up with the workspace name. There are no tree lines and no icon at the left.
  - **Right:** a small grey icon for each pane's program. Claude agents get a robot and shells get `>_`.
  - **A working agent's icon** shows in its own colours, so Claude's turns orange.
  - **A blocked pane** shows `!`.
  - **A finished pane** shows a small dot in the "done" colour.
  - **A split tab** is one row with one icon per pane. It takes its name from the pane you were last in.
  - **Shells with the same name** in separate tabs share one row, with a dim count before the icon. A click goes to the next of those shells.
- **Highlight.** Only the row you're in is highlighted, and only in the active workspace. Text is bright on that row only and muted everywhere else.
- **One-row workspaces.** A workspace with one row draws the workspace and that row as a single rounded button. Hovering either half highlights both, and either half's click goes to the row.
- **Multi-row workspaces.**
  - **Pointer anywhere in the group:** every row of the group gets the hover shade, joined into one block with square inner corners.
  - **Your row:** keeps its highlight.
  - **The tab row under the pointer:** gets the highlight shade.
- **Clicking the workspace name.** Clicking the name of the workspace you're in cycles through its rows. Clicking another workspace's name switches to it.
- **Collapsed rail.** The workspace creatures sit in 22pt square tiles. Each tile is 4pt from the rail's edges, and the toggle button is centred on the same line.

## Other parts

- **Toasts:** cam replaces the shipped toast mod with one in the same style.
- **Picker (`cmd-p`), palette (`cmd-shift-p`), settings (`cmd-,`) and dialogs:** popups that use the same rows and sizes.
- **Harbor (`cmd-shift-e`):** a demo panel. It shows mock client requests travelling through stations (Request, Issue, Brief, Working, PR, CI, Preview, Client reply, Merged), and a log of each agent's tool calls.

## Key bindings

See `keys.cam.json`.
