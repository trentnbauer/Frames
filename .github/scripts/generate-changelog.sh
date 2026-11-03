#!/usr/bin/env bash
# Generates web/public/changelog.json from merged PR titles, for the
# "updates since last access" banner in the web app (see
# web/src/useChangelog.ts / web/src/components/Changelog.tsx).
#
# Requires `gh` to be authenticated (GITHUB_TOKEN with `pull-requests: read`
# is enough) and `jq`. Safe to re-run — it always regenerates the full file
# from GitHub's merged-PR history, capped at the most recent 200 so the file
# doesn't grow unbounded.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:?}"
OUT="${1:-web/public/changelog.json}"

mkdir -p "$(dirname "$OUT")"

gh pr list --repo "$REPO" --state merged --limit 200 \
  --json number,title,url,mergedAt \
  --search "sort:updated-desc" \
  | jq 'sort_by(.mergedAt) | reverse' \
  > "$OUT"

echo "Wrote $(jq 'length' "$OUT") merged PR entries to $OUT"
