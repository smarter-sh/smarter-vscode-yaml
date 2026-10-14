#!/usr/bin/env bash
# Report what changed in the Smarter platform since the extension last followed it, grouped by what
# each change means for the extension. Read-only: it changes neither repository, apart from
# `git fetch`, which updates only the platform's remote-tracking branches.
#
# usage, from the smarter-vscode-yaml repository root:
#   skills/monthly-maintenance/scripts/smarter-delta.sh [smarter checkout] [platform ref] [base commit]
#
# - smarter checkout: default ../smarter
# - platform ref: what the extension syncs with, default origin/main (the platform's released branch)
# - base commit: a platform commit to start from. By default, the platform's commit at the date of
#   the extension's last release tag, or the commit named by the newest "Synced with smarter <sha>"
#   line in this repository's history, whichever is later.
set -euo pipefail

SMARTER="${1:-../smarter}"
REF="${2:-origin/main}"
BASE_OVERRIDE="${3:-}"

if [ ! -d "$SMARTER/.git" ]; then
  echo "No smarter checkout at $SMARTER" >&2
  exit 1
fi

git -C "$SMARTER" fetch --quiet origin || echo "warning: git fetch failed; using the local $REF" >&2

TAG=$(git tag --sort=-creatordate | head -n 1)
if [ -z "$TAG" ]; then
  echo "smarter-vscode-yaml has no release tag" >&2
  exit 1
fi
SINCE=$(git log -1 --format=%cI "$TAG")
BASE=$(git -C "$SMARTER" rev-list -1 --before="$SINCE" "$REF")
SOURCE="the platform at the extension's last release, $TAG ($SINCE)"

# a later sync, recorded in a maintenance commit's body
SYNCED=$(git log --all -1 --format=%B --grep="Synced with smarter " | grep -oE "Synced with smarter [0-9a-f]{7,40}" | awk '{print $4}' || true)
if [ -n "$SYNCED" ] && git -C "$SMARTER" merge-base --is-ancestor "$BASE" "$SYNCED" 2>/dev/null; then
  BASE=$SYNCED
  SOURCE="the last recorded sync (Synced with smarter $SYNCED)"
fi
if [ -n "$BASE_OVERRIDE" ]; then
  BASE=$(git -C "$SMARTER" rev-parse "$BASE_OVERRIDE")
  SOURCE="the given base commit"
fi

echo "baseline: $SOURCE"
echo "platform range: ${BASE:0:12}..$REF ($(git -C "$SMARTER" describe --tags --always "$REF"))"
echo "platform commits in range: $(git -C "$SMARTER" rev-list --count "$BASE..$REF")"

# area | what it means for the extension | pathspecs, relative to the smarter repository root
AREAS=(
  "Api contract (SAM schemas, examples, openapi.json)|scripts/sync-contracts.sh, npm run contract:types|smarter/smarter/apps/api/v1/contract/"
  "SAM manifest models|already in the contract; read for new enums, renamed fields, new kinds|:(glob)smarter/smarter/apps/*/manifest/models/** smarter/smarter/lib/manifest/ smarter/smarter/apps/api/v1/manifests/"
  "Cli api views and urls|src/core/api.ts, src/commands.ts|smarter/smarter/apps/api/v1/cli/"
  "Request body parsing (YAML, PyYAML)|src/core/yamlDoc.ts (PyYAML parity, ADR-006)|smarter/smarter/lib/django/request.py"
  "Authentication|src/core/api.ts (the Authorization header)|smarter/smarter/lib/drf/"
  "Resource docs pages|src/core/docs.ts (PAGES)|docs/source/smarter-resources/"
  "The extension's docs page|keep README.md and the page in step|docs/source/smarter-framework/vs-code-extension.rst"
  "The console's manifest editor|features worth mirroring in the extension|smarter/react/packages/smarter-manifest-editor/src/"
  "ADRs|docs/adr/|docs/source/adr/"
  "Skills|skills/ (the adapted copies)|skills/"
  "Lint standard|.pre-commit-config.yaml, codespell.txt|.pre-commit-config.yaml codespell.txt"
)

for area in "${AREAS[@]}"; do
  IFS='|' read -r name action paths <<<"$area"
  # shellcheck disable=SC2086 # the pathspecs are deliberately word-split
  log=$(git -C "$SMARTER" log --no-merges --format='  %h %ad %s' --date=short "$BASE..$REF" -- $paths)
  echo
  echo "== $name  (extension: $action)"
  if [ -z "$log" ]; then
    echo "  no changes"
  else
    echo "$log"
    # shellcheck disable=SC2086
    git -C "$SMARTER" diff --stat=120 "$BASE..$REF" -- $paths | tail -n 15 | sed 's/^/    /'
  fi
done
