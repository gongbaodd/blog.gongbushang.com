#!/usr/bin/env bash
# prune-worktrees.sh - remove local git worktrees and branches whose job is done (GON-248).
#
# Usage: packages/scripts/prune-worktrees.sh [--dry-run | --apply] [--base <ref>] [--min-age-minutes N]
#   --dry-run  (default) report what would be removed, change nothing
#   --apply    actually remove worktrees/branches, then `git worktree prune` and `git fetch --prune`
#
# Done = the branch's PR is MERGED or CLOSED (gh), or (no PR) the branch is fully merged into
# origin/master. Kept: main checkout, master, the main checkout's current branch, the worktree
# this script runs in, dirty worktrees, unpushed commits, open PRs, no PR + unmerged commits,
# worktrees holding a .env file, and recently active no-PR worktrees (may be a running job).
# Local only: never deletes remote branches, never runs pnpm install.
set -uo pipefail

MODE=dry-run
BASE=origin/master
MIN_AGE=60
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) MODE=dry-run ;;
    --apply) MODE=apply ;;
    --base) BASE="${2:?--base needs a ref}"; shift ;;
    --min-age-minutes) MIN_AGE="${2:?needs a number}"; shift ;;
    -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

COMMON=$(git rev-parse --git-common-dir 2>/dev/null) || { echo "not in a git repo" >&2; exit 1; }
COMMON=$(cd "$COMMON" && pwd -P)
MAIN=$(dirname "$COMMON")
TOP=$(git rev-parse --show-toplevel)
CURRENT_WT=$(cd "$TOP" && pwd -P)
G() { git -C "$MAIN" "$@"; }
command -v gh >/dev/null 2>&1 || echo "warning: gh not found; only the merged-into-base rule is available" >&2

MAIN_BRANCH=$(G symbolic-ref --short -q HEAD || true)
ROWS=$(mktemp)
HANDLED=$(mktemp)
trap 'rm -f "$ROWS" "$HANDLED"' EXIT
TAB=$(printf '\t')
row() { printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" >>"$ROWS"; }  # action kind name reason

if [ "$MODE" = apply ]; then
  G fetch --prune origin >/dev/null 2>&1 || echo "warning: fetch failed, using stale refs" >&2
  G worktree prune
fi
BASE_OK=1
G rev-parse --verify -q "$BASE^{commit}" >/dev/null || { BASE_OK=0; echo "warning: $BASE not found" >&2; }

# classify <branch> <worktree-or-empty>
# sets VERDICT (done|keep), REASON, GH_MERGED (1 when a PR MERGED)
classify() {
  local br=$1 wt=$2 tip prs state oid n gd
  local has_open=0 has_merged=0 has_closed=0 pushed_oid=0
  VERDICT=keep; REASON=""; GH_MERGED=0
  if [ "$br" = master ] || [ "$br" = "$MAIN_BRANCH" ]; then REASON="protected branch"; return; fi
  tip=$(G rev-parse "refs/heads/$br")
  if [ -n "$wt" ]; then
    if [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then REASON="uncommitted or untracked changes"; return; fi
    if [ -n "$(find "$wt" -maxdepth 3 -name '.env*' -not -name '.env.example' -not -path '*/node_modules/*' 2>/dev/null | head -1)" ]; then
      REASON=".env file in worktree (remove by hand, then re-run)"; return
    fi
  fi
  prs=""
  if command -v gh >/dev/null 2>&1; then
    prs=$(cd "$MAIN" && gh pr list --state all --head "$br" --json number,state,headRefOid \
      --jq '.[] | "\(.state) \(.headRefOid)"' 2>/dev/null) || { REASON="gh query failed"; return; }
  fi
  while read -r state oid; do
    [ -z "$state" ] && continue
    case "$state" in
      OPEN) has_open=1 ;;
      MERGED) has_merged=1 ;;
      CLOSED) has_closed=1 ;;
    esac
    if [ "$oid" = "$tip" ] && [ "$state" != OPEN ]; then pushed_oid=1; fi
  done <<<"$prs"
  if [ $has_open = 1 ]; then REASON="open PR"; return; fi
  # unpushed commits: not on any remote and not the head of a finished PR
  n=$(G rev-list --count "refs/heads/$br" --not --remotes 2>/dev/null || echo 1)
  if [ "$n" != 0 ] && [ $pushed_oid = 0 ]; then REASON="$n unpushed commit(s)"; return; fi
  if [ $has_merged = 1 ]; then VERDICT="done"; GH_MERGED=1; REASON="PR merged"; return; fi
  if [ $has_closed = 1 ]; then VERDICT="done"; REASON="PR closed (unmerged; branch -d may refuse)"; return; fi
  # no PR
  if [ $BASE_OK = 1 ] && G merge-base --is-ancestor "$tip" "$BASE" 2>/dev/null; then
    if [ "$tip" = "$(G rev-parse "$BASE")" ]; then REASON="no PR, branch == $BASE (fresh, maybe a running job)"; return; fi
    if [ -n "$wt" ]; then
      gd=$(git -C "$wt" rev-parse --absolute-git-dir)
      if [ -n "$(find "$gd" -maxdepth 1 \( -name index -o -name HEAD \) -mmin "-$MIN_AGE" 2>/dev/null | head -1)" ]; then
        REASON="no PR, worktree active in last ${MIN_AGE}m (maybe a running job)"; return
      fi
    fi
    VERDICT="done"; REASON="no PR, fully merged into $BASE"; return
  fi
  REASON="no PR and unmerged commits"
}

# act <branch> <worktree-or-empty>; honors MODE; emits a row
act() {
  local br=$1 wt=$2 kind name err
  if [ -n "$wt" ]; then kind=worktree; name="$wt ($br)"; else kind=branch; name=$br; fi
  if [ "$VERDICT" = keep ]; then row KEPT "$kind" "$name" "$REASON"; return; fi
  if [ "$MODE" = dry-run ]; then row WOULD-REMOVE "$kind" "$name" "$REASON"; return; fi
  if [ -n "$wt" ]; then
    if ! err=$(G worktree remove "$wt" 2>&1); then
      row KEPT "$kind" "$name" "worktree remove refused: $(echo "$err" | head -1)"; return
    fi
  fi
  if G branch -d "$br" >/dev/null 2>&1; then
    row REMOVED "$kind" "$name" "$REASON"
  elif [ "$GH_MERGED" = 1 ] && G branch -D "$br" >/dev/null 2>&1; then
    row REMOVED "$kind" "$name" "$REASON (squash-merged, -D)"
  else
    row KEPT branch "$br" "worktree removed but branch -d refused (not merged); delete by hand if intended"
  fi
}

# 1) worktrees
wt=""; br=""
flush() {
  [ -z "$wt" ] && return
  if [ "$wt" = "$MAIN" ]; then
    :
  elif [ "$wt" = "$CURRENT_WT" ]; then
    row KEPT worktree "$wt (${br:-detached})" "current worktree (running here)"
    [ -n "$br" ] && echo "$br" >>"$HANDLED"
  elif [ -z "$br" ]; then
    row KEPT worktree "$wt (detached)" "detached HEAD, inspect by hand"
  elif [ ! -d "$wt" ]; then
    echo "$br" >>"$HANDLED"
    row KEPT worktree "$wt ($br)" "directory missing; 'git worktree prune' will drop it"
  else
    echo "$br" >>"$HANDLED"
    classify "$br" "$wt"
    act "$br" "$wt"
  fi
  wt=""; br=""
}
while IFS= read -r line; do
  case "$line" in
    "worktree "*) flush; wt=${line#worktree } ;;
    "branch "*) br=${line#branch refs/heads/} ;;
    "") flush ;;
  esac
done < <(G worktree list --porcelain; echo)
flush

# 2) local branches without a worktree
while IFS= read -r b; do
  grep -qxF "$b" "$HANDLED" && continue
  if [ "$b" = master ]; then row KEPT branch "$b" "protected branch"; continue; fi
  if [ "$b" = "$MAIN_BRANCH" ]; then row KEPT branch "$b" "current branch of main checkout"; continue; fi
  classify "$b" ""
  act "$b" ""
done < <(G for-each-ref --format='%(refname:short)' refs/heads)

# 3) finish
if [ "$MODE" = apply ]; then
  G worktree prune
  G fetch --prune origin >/dev/null 2>&1 || echo "warning: final fetch --prune failed" >&2
fi

echo "prune-worktrees: mode=$MODE main=$MAIN base=$BASE"
printf '%-13s %-9s %-70s %s\n' ACTION KIND NAME REASON
sort -t "$TAB" -k1,1 -k3,3 "$ROWS" | while IFS="$TAB" read -r a k n r; do
  printf '%-13s %-9s %-70s %s\n' "$a" "$k" "$n" "$r"
done
echo
for a in REMOVED WOULD-REMOVE KEPT; do printf '%s: %s  ' "$a" "$(cut -f1 "$ROWS" | grep -cx "$a")"; done
echo
if [ "$MODE" = dry-run ]; then echo "dry-run: nothing changed. Re-run with --apply to delete."; fi
exit 0
