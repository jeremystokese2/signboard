#!/usr/bin/env bash
set -euo pipefail
project_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
plugin_dir="${XDG_CONFIG_HOME:-$HOME/.config}/omarchy/plugins/jeremy.signboard"
bin_dir="$HOME/.local/bin"
command -v node >/dev/null
command -v omarchy >/dev/null
cd "$project_dir"
npm ci --ignore-scripts
mkdir -p "$(dirname "$plugin_dir")" "$bin_dir"
if [[ -e "$plugin_dir" || -L "$plugin_dir" ]]; then
  [[ $(readlink -f "$plugin_dir") == "$project_dir" ]] || { echo "Plugin path already exists: $plugin_dir" >&2; exit 1; }
else
  ln -s "$project_dir" "$plugin_dir"
fi
if [[ -e "$bin_dir/signboard" || -L "$bin_dir/signboard" ]]; then
  [[ $(readlink -f "$bin_dir/signboard") == "$project_dir/bin/signboard.js" ]] || { echo "CLI path already exists: $bin_dir/signboard" >&2; exit 1; }
else
  ln -s "$project_dir/bin/signboard.js" "$bin_dir/signboard"
fi
omarchy-shell shell rescanPlugins
# The shell scans manifests asynchronously. Enable only after it has seen
# both entry points, including when upgrading an existing panel-only install.
registered=false
for attempt in {1..30}; do
  if omarchy-shell shell listPlugins | node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      try {
        process.exit(JSON.parse(input).some(p => p.id === "jeremy.signboard" && p.kinds.includes("bar-widget")) ? 0 : 1);
      } catch { process.exit(1); }
    });
  '; then
    registered=true
    break
  fi
  sleep 0.2
done
[[ $registered == true ]] || { echo 'Signboard registration timed out. Check that the Omarchy shell is running.' >&2; exit 1; }
omarchy plugin enable jeremy.signboard --section right
echo 'Installed. Click the Signboard task-list icon in the bar to open your board.'
echo 'For a new board, run: signboard init <folder>'
