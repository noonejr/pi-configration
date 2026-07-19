#!/usr/bin/env bash
set -euo pipefail

repo_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
pi_dir=${PI_CODING_AGENT_DIR:-"$HOME/.pi/agent"}
timestamp=$(date -u +%Y%m%dT%H%M%SZ)

mkdir -p "$pi_dir/extensions"

install_file() {
  local source=$1
  local target=$2

  if [[ -f "$target" ]] && ! cmp -s "$source" "$target"; then
    cp "$target" "$target.bak.$timestamp"
    printf 'Backed up %s\n' "$target"
  fi

  install -m 0644 "$source" "$target"
  printf 'Installed %s\n' "$target"
}

install_file "$repo_dir/models.json" "$pi_dir/models.json"
install_file "$repo_dir/settings.json" "$pi_dir/settings.json"

for extension in "$repo_dir"/extensions/*.ts; do
  install_file "$extension" "$pi_dir/extensions/$(basename "$extension")"
done

printf '\nPi configuration installed. Credentials were not installed.\n'
printf 'Set AWS_BEARER_TOKEN_BEDROCK outside this repository before using Bedrock Mantle.\n'
printf 'Run /reload in an existing pi session, or restart pi.\n'
