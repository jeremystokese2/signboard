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
omarchy plugin enable jeremy.signboard
echo 'Installed. Create a board with signboard init <folder>, then run signboard gui.'
