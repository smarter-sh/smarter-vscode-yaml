#!/usr/bin/env bash
# Report a failed GitHub Actions run of smarter-vscode-yaml: its commit, its jobs and failed steps, each
# failed job's annotations, and, with a working GitHub token, its log and the failures pulled out of it.
#
#   skills/smarter-vscode-ci-failures/scripts/fetch-run-logs.sh <run or job url, or run id> [output dir]
#
#   e.g. skills/smarter-vscode-ci-failures/scripts/fetch-run-logs.sh \
#          https://github.com/smarter-sh/smarter-vscode-yaml/actions/runs/41256105761/job/124699484437
#
# For each failed job (or only the job of a job url, failed or not) it writes <output dir>/<job id>.log
# (the whole log, without terminal colors or timestamps) and <output dir>/<job id>.failures.txt (tsc
# errors, node:test and mocha failures, npm and vsce errors, and the ##[error] lines). The output dir
# defaults to a new temporary folder.
#
# Credentials, without printing any of them: gh's own login, else GH_TOKEN or GITHUB_TOKEN from the
# environment, else from the repository's .env. A token that GitHub rejects is dropped, not retried.
# With none that works, it falls back to GitHub's public api: this repository is public, so the run,
# its jobs, steps and annotations are readable, but a job's log is not.
set -euo pipefail

url="${1:?usage: fetch-run-logs.sh <run or job url, or run id> [output dir]}"
out="${2:-$(mktemp -d -t smarter-vscode-ci-XXXXXX)}"
mkdir -p "$out"
cd "$(git rev-parse --show-toplevel)"

repo="smarter-sh/smarter-vscode-yaml"
if [[ "$url" =~ github\.com/([^/]+/[^/]+)/actions/runs/([0-9]+)(/job/([0-9]+))? ]]; then
  repo="${BASH_REMATCH[1]}"
  run="${BASH_REMATCH[2]}"
  job="${BASH_REMATCH[4]:-}"
elif [[ "$url" =~ ^[0-9]+$ ]]; then
  run="$url"
  job=""
else
  echo "Not a GitHub Actions run url: $url" >&2
  exit 2
fi

# A GH_TOKEN or GITHUB_TOKEN in the environment overrides gh's own login, so a stale one makes every
# call fail with 401 "Bad credentials". Check each source once, and drop the ones GitHub rejects.
token_works() { gh api rate_limit >/dev/null 2>&1; }
mode=gh
if ! command -v gh >/dev/null 2>&1; then
  mode=public
elif ! token_works; then
  if [ -n "${GH_TOKEN:-}${GITHUB_TOKEN:-}" ]; then
    echo "(the GH_TOKEN or GITHUB_TOKEN in your environment is rejected by GitHub: ignoring it)" >&2
    unset GH_TOKEN GITHUB_TOKEN
  fi
  if ! token_works && [ -f .env ]; then
    token="$(grep -E '^(GH_TOKEN|GITHUB_TOKEN)=' .env | head -1 | cut -d= -f2- | tr -d "\"'" || true)"
    if [ -n "$token" ]; then
      export GH_TOKEN="$token"
      token_works || {
        echo "(the token in .env is rejected by GitHub too: ignoring it)" >&2
        unset GH_TOKEN
      }
    fi
    unset token
  fi
  token_works || mode=public
fi
if [ "$mode" = public ]; then
  echo "(no working GitHub token: using the public api, which has no job logs)" >&2
fi

# GET a GitHub api path, retried: GitHub's api answers 502 and 503 now and then, the logs included.
api() {
  local attempt
  for attempt in 1 2 3; do
    if [ "$mode" = gh ]; then
      gh api --allow-escape-sequences "$1" && return 0
    else
      curl -fsSL -H "Accept: application/vnd.github+json" "https://api.github.com/$1" && return 0
    fi
    echo "  (GitHub api $1 failed, attempt $attempt of 3)" >&2
    sleep $((attempt * 5))
  done
  return 1
}

# terminal colors, which the logs keep, and which gh refuses to print without --allow-escape-sequences.
strip_colors() { sed $'s/\x1b\\[[0-9;]*[A-Za-z]//g'; }

run_json="$(api "repos/$repo/actions/runs/$run")"
jobs_json="$(api "repos/$repo/actions/runs/$run/jobs?per_page=100")"

echo "Run $run of $repo:"
jq -r '"  \(.name), \(.event) on \(.head_branch) at \(.head_sha[0:9]): \(.conclusion // .status)",
       "  \(.html_url)",
       "  commit: \(.head_commit.message | split("\n")[0])",
       (.pull_requests[]? | "  pull request #\(.number)")' <<<"$run_json"
echo
echo "Jobs:"
jq -r '.jobs[] | "  \(.conclusion // .status)\t\(.id)\t\(.name)",
       (.steps[]? | select(.conclusion == "failure") | "  \t\tfailed step: \(.number) \(.name)")' <<<"$jobs_json"

if [ -n "$job" ]; then
  jobs="$job"
else
  jobs="$(jq -r '.jobs[] | select(.conclusion == "failure" or .conclusion == "timed_out"
                                  or .conclusion == "cancelled") | .id' <<<"$jobs_json")"
fi
if [ -z "$jobs" ]; then
  echo
  echo "No failed jobs."
  exit 0
fi

for id in $jobs; do
  echo
  echo "=== job $id"
  echo "Annotations (GitHub's summary of the errors, e.g. a tsc error's file and line):"
  api "repos/$repo/check-runs/$id/annotations" |
    jq -r '.[] | select(.annotation_level != "notice")
                | "  \(.annotation_level) \(.path):\(.start_line) \(.message | split("\n")[0])"'
  if [ "$mode" = public ]; then
    echo "  (no log: it needs a GitHub token. The annotations above usually name the error;"
    echo "   reproduce it locally for the rest.)"
    continue
  fi

  log="$out/$id.log"
  failures="$out/$id.failures.txt"
  # each line starts with a 28-character timestamp and a space.
  api "repos/$repo/actions/jobs/$id/logs" | strip_colors | cut -c30- >"$log"
  {
    # tsc (npm run build): each error, with its indented explanation.
    awk '/error TS[0-9]+:/ { inerr = 1; print; next }
         inerr && /^  / { print; next }
         { inerr = 0 }' "$log"
    # node:test (npm test): the summary, and the "failing tests" section of the spec reporter, or tap's
    # "not ok" lines.
    grep -E '^ℹ (tests|pass|fail) |^not ok ' "$log" || true
    awk '/✖ failing tests:/ { n = 80 } n > 0 { print; n-- }' "$log"
    # mocha (the integration tests): "N failing", and the numbered failures after it.
    awk '/^ *[0-9]+ failing/ { n = 80 } n > 0 { print; n-- }' "$log"
    # npm ci and vsce package.
    grep -E '^npm (error|ERR!)|^ *ERROR ' "$log" || true
    grep -nE '##\[error\]' "$log" || true
  } >"$failures"
  echo
  echo "Failures, from $log:"
  if [ -s "$failures" ]; then
    cat "$failures"
  else
    echo "(none found: read the log's end)"
    tail -40 "$log"
  fi
done

echo
echo "Output is in $out"
