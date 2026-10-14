#!/usr/bin/env bash
# Copy the Smarter platform's published api contract into the extension.
#
# The platform commits its api contract, generated from its Pydantic models, in
# smarter/smarter/apps/api/v1/contract/:
#
# - sam/<Kind>.schema.json: the JSON Schema of every SAM kind. The extension bundles them, and
#   uses them when the platform can't be reached, or when smarterYaml.schemaSource is "bundled".
# - sam/<Kind>.example.json: an example manifest of every kind, for the New Manifest command.
# - openapi.json: the api's OpenAPI document, from which src/contract/openapi.d.ts is generated
#   (npm run contract:types), so that the extension's api client is typed by the contract.
#
# Run this after the platform's contract changes (make contracts), then run the tests.
#
# usage, from the repository root:
#   scripts/sync-contracts.sh [path of a smarter checkout, default ../smarter] [git ref]
#
# With a git ref (e.g. origin/main, or a release tag), the files are read at that ref with git show,
# without changing the checkout. Without one, they are copied from the checkout's working tree.
set -euo pipefail

SMARTER="${1:-../smarter}"
REF="${2:-}"
API_CONTRACT="smarter/smarter/apps/api/v1/contract"
TARGET="contract"
SAM_TARGET="$TARGET/sam"

if [ ! -d "$SMARTER/$API_CONTRACT" ]; then
  echo "No smarter checkout at $SMARTER" >&2
  exit 1
fi

# copy a file of the checkout, at REF if there is one.
copy() {
  if [ -n "$REF" ]; then
    git -C "$SMARTER" show "$REF:$1" > "$2/$(basename "$1")"
  else
    cp "$SMARTER/$1" "$2/"
  fi
}

mkdir -p "$TARGET"
copy "$API_CONTRACT/openapi.json" "$TARGET"

# the SAM schemas and examples: the platform's set replaces the extension's, so a removed kind is removed.
if [ -n "$REF" ]; then
  SAM_FILES=$(git -C "$SMARTER" ls-tree --name-only "$REF" "$API_CONTRACT/sam/")
else
  SAM_FILES=$(cd "$SMARTER" && ls "$API_CONTRACT"/sam/*.json)
fi
rm -rf "$SAM_TARGET"
mkdir -p "$SAM_TARGET"
for file in $SAM_FILES; do
  copy "$file" "$SAM_TARGET"
done

echo "Copied openapi.json and $(ls "$SAM_TARGET" | wc -l | tr -d ' ') SAM files from $SMARTER${REF:+ at $REF}."
