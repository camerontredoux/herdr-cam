#!/usr/bin/env bash
# The import rules for cam and its modules (see main.js). Run it next to `herdr-app check`:
#   mods/cam/check-boundaries.sh
# - modules/ui imports only gpui-kit, gpui-base and herdr: it's the bottom layer.
# - A feature module (modules/<name>, not ui) imports only its own files, ../ui and those
#   three: never cam's parts and never another module.
# - Only main.js imports a feature module's entry point (modules/<name>/main.js); cam's
#   parts may import modules/ui and nothing else under modules/.
set -euo pipefail
cd "$(dirname "$0")"
fail=0
bad() { printf '%s\n' "$1"; fail=1; }

# Every import as "file<TAB>specifier": `from "…"` (also the last line of a multi-line
# import), a bare `import "…"`, and JSDoc's `import("…")` types.
imports() {
  rg --no-heading --with-filename -o -r '$1$2$3' '\bfrom\s+"([^"]+)"|^\s*import\s+"([^"]+)"|\bimport\("([^"]+)"\)' "$@" \
    | awk '{ i = index($0, ":"); f = substr($0, 1, i - 1); sub(/^\.\//, "", f); print f "\t" substr($0, i + 1) }'
}
base='^(gpui-kit|gpui-base|herdr)$'

while IFS=$'\t' read -r file spec; do
  [[ $spec =~ $base ]] || bad "$file: ui may only import gpui-kit, gpui-base and herdr (imports $spec)"
done < <(imports modules/ui --glob '*.js')

for dir in modules/*/; do
  name=$(basename "$dir"); [[ $name == ui ]] && continue
  while IFS=$'\t' read -r file spec; do
    [[ $spec =~ $base ]] && continue
    [[ $spec == ../ui/* ]] && continue
    [[ $spec == ./* && $spec != */../* ]] && continue
    bad "$file: module $name may only import its own files, ../ui and gpui-kit/gpui-base/herdr (imports $spec)"
  done < <(imports "$dir" --glob '*.js')
done

while IFS=$'\t' read -r file spec; do
  [[ $spec == ./modules/* ]] || continue
  [[ $spec == ./modules/ui/* ]] && continue
  if [[ $file == main.js && $spec =~ ^\./modules/[^/]+/main\.js$ ]]; then continue; fi
  bad "$file: only main.js may import a module, and only its entry point (imports $spec)"
done < <(imports --max-depth 1 --glob '*.js' .)

if (( fail )); then echo "check-boundaries: failed" >&2; exit 1; fi
echo "check-boundaries: ok"
