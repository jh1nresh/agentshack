#!/usr/bin/env bash
# ship.sh — Explicit files → atomic commit → push → reviewable PR
#
# Usage:
#   bash scripts/ship.sh "fix: broken auth check" src/file.ts src/file.test.ts

set -euo pipefail

MSG="${1:-}"
if [ -z "$MSG" ] || [ "$#" -lt 2 ]; then
  echo "Usage: bash scripts/ship.sh \"commit message\" <file> [file...]"
  exit 1
fi
shift

if ! git diff --cached --quiet; then
  echo "ERROR: Refusing to mix pre-existing staged changes into this commit"
  exit 1
fi

PREFIX=$(echo "$MSG" | grep -o '^[a-z]*' || echo "feat")
SLUG=$(echo "$MSG" | sed 's/^[a-z]*[:(]*//' | tr '[:upper:]' '[:lower:]' | tr -cs 'a-z0-9' '-' | head -c 50 | sed 's/-$//')
BRANCH="codex/${PREFIX}-${SLUG}"

CURRENT=$(git branch --show-current)
if [ "$CURRENT" = "main" ] || [ "$CURRENT" = "master" ]; then
  git checkout -b "$BRANCH"
else
  BRANCH="$CURRENT"
fi

git add -- "$@"
if git diff --cached --quiet; then
  echo "ERROR: The explicit file list contains no changes"
  exit 1
fi
git diff --cached --check
git commit -m "$MSG"

git push -u origin "$BRANCH" 2>&1

TITLE=$(echo "$MSG" | head -c 70)
PR_URL=$(gh pr create --title "$TITLE" --body "$(cat <<EOF
## Summary
${MSG}

## Test plan
- [ ] \`tsc --noEmit\` clean
- [ ] \`npx vitest run\` passes
- [ ] \`forge test -vv\` passes or is N/A
EOF
)" --repo jh1nresh/agentshack --base main --head "$BRANCH" 2>&1 | tail -1)

echo ""
echo "PR created: $PR_URL"
