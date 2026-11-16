#!/usr/bin/env bash
# Copies the live cam into this repo, so you can commit it:
# - mods/cam and mods/cam-menu, without the files Herdr writes into a mod folder
# - layouts/cam.json, without the Harbor block (Harbor is a separate mod, not shipped here)
# - keys.cam.json: the cam bindings from keys.json, without Harbor's
# Set HERDR_HOME if Herdr's folder is not ~/.config/herdr-app. Needs rsync and python3.
set -euo pipefail
src="${HERDR_HOME:-$HOME/.config/herdr-app}"
repo="$(cd "$(dirname "$0")" && pwd)"

for mod in cam cam-menu; do
  rsync -a --delete --exclude gpui-kit.d.ts --exclude '*.error' --exclude '.*' \
    "$src/mods/$mod/" "$repo/mods/$mod/"
done
cp "$src/layouts/cam.svg" "$repo/layouts/cam.svg"

python3 -I - "$src" "$repo" <<'EOF'
import json, sys
src, repo = sys.argv[1], sys.argv[2]

layout = json.load(open(f"{src}/layouts/cam.json"))
def strip(node):
    if isinstance(node, dict):
        for k, v in node.items():
            if isinstance(v, list):
                node[k] = [c for c in v if not (isinstance(c, dict) and c.get("id") == "harbor")]
            strip(node[k])
    elif isinstance(node, list):
        for c in node:
            strip(c)
strip(layout)
if "harbor" in json.dumps(layout):
    sys.exit("sync: layouts/cam.json still mentions harbor outside a block with id harbor")
with open(f"{repo}/layouts/cam.json", "w") as f:
    json.dump(layout, f, indent=2)
    f.write("\n")

keys = json.load(open(f"{src}/keys.json"))
out = {}
for section, binds in keys.items():
    for key, cmd in binds.items():
        text = cmd if isinstance(cmd, str) else json.dumps(cmd)
        mine = section in ("mod:cam", "layout:cam") or text.startswith("cam.") or text == "mod.open:cam"
        if mine and text != "cam.toggle-harbor":
            out.setdefault(section, {})[key] = cmd
with open(f"{repo}/keys.cam.json", "w") as f:
    json.dump(out, f, indent=2)
    f.write("\n")
EOF

git -C "$repo" status --short
