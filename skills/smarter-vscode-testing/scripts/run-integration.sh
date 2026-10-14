#!/usr/bin/env bash
# Run the integration tests in an installed VS Code, from any terminal, including VS Code's own.
#
# usage, from the repository root:
#   skills/smarter-vscode-testing/scripts/run-integration.sh
#
# `npm run test:integration` downloads VS Code, which can time out on a slow network. This script
# uses the installed one instead (VSCODE_EXECUTABLE_PATH, by default the macOS app), and unsets
# ELECTRON_RUN_AS_NODE, which VS Code's integrated terminal sets and which makes VS Code start as
# plain Node ("bad option: --extensionTestsPath=..."). The tests run in their own user data folder,
# .vscode-test/, beside any VS Code window that is open.
set -euo pipefail

CODE="${VSCODE_EXECUTABLE_PATH:-/Applications/Visual Studio Code.app/Contents/MacOS/Code}"
if [ ! -x "$CODE" ]; then
  echo "No VS Code at $CODE. Set VSCODE_EXECUTABLE_PATH, or use npm run test:integration." >&2
  exit 2
fi

npm run build
npm run compile-tests
env -u ELECTRON_RUN_AS_NODE VSCODE_EXECUTABLE_PATH="$CODE" node out/integration/runTests.js
