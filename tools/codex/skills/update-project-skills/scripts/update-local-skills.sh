#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DEFAULT_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || pwd)"
KIDITEM_ROOT="${KIDITEM_ROOT:-$DEFAULT_ROOT}"
SKILLS_DIR="$KIDITEM_ROOT/.agents/skills"
LOCK_FILE="$KIDITEM_ROOT/skills-lock.json"
SOURCE_CACHE="$KIDITEM_ROOT/.agents/sources"
SHARED_SKILLS_DIR="$KIDITEM_ROOT/tools/codex/skills"
CODEX_BIN="${CODEX_BIN:-/Applications/Codex.app/Contents/Resources/codex}"

VERIFY_ONLY=0
NO_PULL=0

usage() {
  cat <<'EOF'
Usage: update-local-skills.sh [--verify-only] [--no-pull]

Updates shared KidItem project-local Codex skills without installing global skills.
Shared skill sources live in tools/codex/skills; .agents/ is local-only.

  --verify-only   Check links, lock coverage, and prompt scope only.
  --no-pull       Rebuild/link from local source caches without network pulls.

Optional environment:
  KIDITEM_ROOT    Override the detected KidItem repo root.
  CODEX_BIN       Override the Codex binary path.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --verify-only) VERIFY_ONLY=1; shift ;;
    --no-pull) NO_PULL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

log() { printf '%s\n' "$*"; }
run() { printf '+ ' >&2; printf '%q ' "$@" >&2; printf '\n' >&2; "$@"; }

require_dir() {
  local dir="$1"
  [ -d "$dir" ] || { echo "Missing directory: $dir" >&2; exit 1; }
}

require_file() {
  local file="$1"
  [ -f "$file" ] || { echo "Missing file: $file" >&2; exit 1; }
}

safe_repo_key() {
  printf '%s' "$1" | tr '/:' '__'
}

hash_dir() {
  local dir="$1"
  (cd "$dir" && find . -type f -print0 | sort -z | xargs -0 shasum -a 256 | shasum -a 256 | awk '{print $1}')
}

git_summary() {
  local dir="$1"
  require_dir "$dir"
  log ""
  log "== $(basename "$dir") =="
  git -C "$dir" status --short --branch
}

ensure_github_repo() {
  local source="$1"
  local ref="${2:-main}"
  local repo_key repo_dir

  repo_key="$(safe_repo_key "$source")"
  repo_dir="$SOURCE_CACHE/$repo_key"
  mkdir -p "$SOURCE_CACHE"

  if [ "$NO_PULL" -eq 0 ]; then
    if [ -d "$repo_dir/.git" ]; then
      run git -C "$repo_dir" fetch --depth 1 origin "$ref" >&2
      run git -C "$repo_dir" reset --hard FETCH_HEAD >&2
    else
      rm -rf "$repo_dir"
      run git clone --depth 1 --branch "$ref" "https://github.com/$source.git" "$repo_dir" >&2
    fi
  elif [ ! -d "$repo_dir/.git" ]; then
    echo "Missing source cache for $source. Re-run without --no-pull." >&2
    exit 1
  fi

  printf '%s\n' "$repo_dir"
}

copy_replace_dir() {
  local src="$1"
  local dst="$2"
  local tmp="${dst}.tmp.$$"

  require_dir "$src"
  rm -rf "$tmp"
  cp -R "$src" "$tmp"
  if [ -L "$dst" ]; then
    echo "Refusing to replace symlink with copied skill: $dst" >&2
    rm -rf "$tmp"
    exit 1
  fi
  rm -rf "$dst"
  mv "$tmp" "$dst"
}

sync_shared_project_skills() {
  local skill_dir name linked=0

  require_dir "$SHARED_SKILLS_DIR"
  mkdir -p "$SKILLS_DIR"

  log ""
  log "== shared project skills =="
  for skill_dir in "$SHARED_SKILLS_DIR"/*; do
    [ -f "$skill_dir/SKILL.md" ] || continue
    name="$(basename "$skill_dir")"
    if [ -e "$SKILLS_DIR/$name" ] && [ ! -L "$SKILLS_DIR/$name" ]; then
      echo "Local .agents skill conflicts with shared project skill: $SKILLS_DIR/$name" >&2
      echo "Move or remove it, then rerun this script." >&2
      exit 1
    fi
    ln -snf "$skill_dir" "$SKILLS_DIR/$name"
    linked=$((linked + 1))
    log "$name -> $skill_dir"
  done

  [ "$linked" -gt 0 ] || {
    echo "No shared project skills found in $SHARED_SKILLS_DIR" >&2
    exit 1
  }
}

locked_skill_rows() {
  require_file "$LOCK_FILE"
  node -e '
const fs = require("fs");
const lock = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
for (const [name, item] of Object.entries(lock.skills || {})) {
  if (item.sourceType !== "github") continue;
  console.log([name, item.source, item.skillPath, item.ref || "main"].join("\t"));
}
' "$LOCK_FILE"
}

update_locked_github_skills() {
  local hash_file="$1"
  local name source skill_path ref repo_dir src_dir dst hash

  require_file "$LOCK_FILE"
  mkdir -p "$SOURCE_CACHE" "$SKILLS_DIR"
  : > "$hash_file"

  log ""
  log "== locked GitHub skills =="
  while IFS=$'\t' read -r name source skill_path ref; do
    [ -n "$name" ] || continue
    repo_dir="$(ensure_github_repo "$source" "$ref")"
    src_dir="$repo_dir/$(dirname "$skill_path")"
    dst="$SKILLS_DIR/$name"
    require_dir "$src_dir"
    require_file "$src_dir/SKILL.md"
    copy_replace_dir "$src_dir" "$dst"
    hash="$(hash_dir "$dst")"
    printf '%s\t%s\n' "$name" "$hash" >> "$hash_file"
    log "Updated $name from $source/$skill_path"
  done < <(locked_skill_rows)
}

update_lock_hashes() {
  local hash_file="$1"
  [ -s "$hash_file" ] || return 0

  node -e '
const fs = require("fs");
const [lockPath, hashPath] = process.argv.slice(1);
const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
const rows = fs.readFileSync(hashPath, "utf8").trim().split(/\n/).filter(Boolean);
for (const row of rows) {
  const [name, hash] = row.split(/\t/);
  if (lock.skills && lock.skills[name]) {
    lock.skills[name].computedHash = hash;
    lock.skills[name].hashAlgorithm = "sha256-directory-v1";
  }
}
fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
' "$LOCK_FILE" "$hash_file"
}

verify_locked_skills() {
  local name source skill_path ref

  log ""
  log "== locked skill coverage =="
  while IFS=$'\t' read -r name source skill_path ref; do
    [ -n "$name" ] || continue
    require_file "$SKILLS_DIR/$name/SKILL.md"
    log "$name"
  done < <(locked_skill_rows)
}

verify_shared_project_skills() {
  local skill_dir name

  log ""
  log "== shared project skill coverage =="
  for skill_dir in "$SHARED_SKILLS_DIR"/*; do
    [ -f "$skill_dir/SKILL.md" ] || continue
    name="$(basename "$skill_dir")"
    [ -L "$SKILLS_DIR/$name" ] || {
      echo "Missing shared skill link: $SKILLS_DIR/$name" >&2
      exit 1
    }
    require_file "$SKILLS_DIR/$name/SKILL.md"
    log "$name"
  done
}

verify_symlink_skills() {
  local link

  log ""
  log "== symlink skill coverage =="
  for link in "$SKILLS_DIR"/*; do
    [ -L "$link" ] || continue
    if [ ! -f "$link/SKILL.md" ] && [ ! -d "$link" ]; then
      echo "Broken skill symlink: $link -> $(readlink "$link")" >&2
      exit 1
    fi
    log "$(basename "$link") -> $(readlink "$link")"
  done
}

report_local_only_skills() {
  local skill name

  log ""
  log "== local-only skills =="
  for skill in "$SKILLS_DIR"/*; do
    [ -d "$skill" ] || continue
    [ -L "$skill" ] && continue
    name="$(basename "$skill")"
    if node -e '
const fs = require("fs");
const lock = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
process.exit(lock.skills && lock.skills[process.argv[2]] ? 0 : 1);
' "$LOCK_FILE" "$name"; then
      continue
    fi
    log "$name"
  done
}

verify_prompt_scope() {
  [ -x "$CODEX_BIN" ] || return 0

  log ""
  log "== fresh Codex prompt scope =="

  local kiditem_hits
  kiditem_hits="$(cd "$KIDITEM_ROOT" && "$CODEX_BIN" debug prompt-input probe 2>/dev/null | perl -pe 's/\\n/\n/g' | grep -E '^- (agents-md-audit|caveman|grill-me|improve-codebase-architecture|magic-scraper|staging-deploy-operator|supabase|supabase-postgres-best-practices|vercel-react-best-practices|update-project-skills)' | head -20 || true)"

  if [ -n "$kiditem_hits" ]; then
    log "KidItem sees project-local skills:"
    echo "$kiditem_hits"
  else
    echo "KidItem fresh prompt did not show expected project-local skills." >&2
    exit 1
  fi

  log "Prompt scope check passed for KidItem."
}

require_dir "$KIDITEM_ROOT"
mkdir -p "$SKILLS_DIR"
require_file "$LOCK_FILE"
git_summary "$KIDITEM_ROOT"
sync_shared_project_skills

hash_file="$(mktemp /tmp/kiditem-skill-hashes.XXXXXX)"
trap 'rm -f "$hash_file"' EXIT

if [ "$VERIFY_ONLY" -eq 0 ]; then
  update_locked_github_skills "$hash_file"
  update_lock_hashes "$hash_file"
fi

verify_locked_skills
verify_shared_project_skills
verify_symlink_skills
report_local_only_skills
verify_prompt_scope

log ""
log "Done. Start a fresh Codex session to refresh injected skill metadata."
