#!/usr/bin/env bash
# Reproduce a dependency bump, e.g. a Dependabot pull request, in a throwaway copy of this repository,
# without touching the working tree, package.json or package-lock.json, and without git.
#
#   skills/smarter-vscode-ci-failures/scripts/reproduce-dependency.sh <package> <version> <dir>
#
#   e.g. skills/smarter-vscode-ci-failures/scripts/reproduce-dependency.sh @types/node 26.6.6 "$SCRATCHPAD/repro"
#
# Copies the working tree into <dir> (without node_modules, .git, .env, venv or build output), runs npm ci,
# installs <package>@<version>, then the Test workflow's Build and Unit tests steps. Run it again after
# editing a file here: it copies the tree again, and keeps the installed node_modules. The integration
# tests aren't run: use smarter-vscode-testing's run-integration.sh in the copy for those.
set -euo pipefail

package="${1:?usage: reproduce-dependency.sh <package> <version> <dir>}"
version="${2:?usage: reproduce-dependency.sh <package> <version> <dir>}"
dir="${3:?usage: reproduce-dependency.sh <package> <version> <dir>}"
root="$(git rev-parse --show-toplevel)"

# Refuse a folder that isn't empty and isn't one this script made, so a wrong path can't be overwritten.
marker=".reproduce-dependency"
if [ -d "$dir" ] && [ -n "$(ls -A "$dir")" ] && [ ! -f "$dir/$marker" ]; then
  echo "$dir is not empty, and wasn't made by this script. Pick a new folder." >&2
  exit 2
fi
mkdir -p "$dir"
touch "$dir/$marker"

rsync -a --exclude node_modules --exclude .git --exclude .env --exclude venv --exclude dist \
  --exclude out --exclude .vscode-test --exclude .claude --exclude "*.vsix" "$root/" "$dir/"
cd "$dir"
export NODE_ENV=development
echo "node $(node --version) (the Test workflow uses node 22)"

npm ci --ignore-scripts --no-audit --no-fund >/dev/null
npm install "$package@$version" --ignore-scripts --no-audit --no-fund >/dev/null
echo "installed $(npm ls "$package" --depth=0 2>/dev/null | grep -o "$package@[^ ]*" | head -1)"

echo "--- npm run build"
npm run build
echo "--- npm test"
npm test 2>&1 | tail -12
