#!/usr/bin/env bash
# Saves the audit folder to git, on the audit branch only.
#
#   bash LLM_CREW_BUG_AUDIT/save.sh "Crew bug audit: what this save holds"
#
# Safe to run from several sessions at once: if git is busy it waits and tries again.
# It commits nothing outside LLM_CREW_BUG_AUDIT/, and nothing at all on any other branch.
msg="${1:-Crew bug audit: findings}"
top="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "not in a git checkout"; exit 1; }
cd "$top" || exit 1
branch="$(git branch --show-current)"
if [ "$branch" != "crew-bug-audit" ]; then
  echo "not saved: the checkout is on '$branch', not 'crew-bug-audit'. The files are still on disk."
  exit 1
fi
for try in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if git add -- LLM_CREW_BUG_AUDIT 2>/dev/null; then
    if git diff --cached --quiet -- LLM_CREW_BUG_AUDIT; then
      echo "nothing new to save"
      exit 0
    fi
    if git commit -q -m "$msg" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- LLM_CREW_BUG_AUDIT 2>/dev/null; then
      echo "saved: $(git log -1 --format=%h)"
      exit 0
    fi
  fi
  sleep $(( (RANDOM % 5) + 2 ))
done
echo "not saved: git stayed busy. The files are still on disk; run this again."
exit 1
