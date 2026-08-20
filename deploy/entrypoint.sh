#!/usr/bin/env bash
# Runs once per container start. Clones the user's fork into the persistent
# volume if it isn't there yet, wires up git/SSH identity from env vars, and
# installs each portal CLI's dependencies - then hands off to CMD (which
# just idles, so you can exec in and run `claude` yourself).
set -euo pipefail

WORKSPACE="${WORKSPACE:-/workspace}"
REPO_DIR="$WORKSPACE/ai-job-search"
: "${HOME:=$WORKSPACE/home}"
export HOME

mkdir -p "$WORKSPACE" "$HOME"

# Optional: mount a private-repo deploy key as a Secret and point
# SSH_PRIVATE_KEY_FILE at it (e.g. /run/secrets/ssh-privatekey) to clone
# over SSH instead of embedding a token in REPO_URL.
if [ -n "${SSH_PRIVATE_KEY_FILE:-}" ] && [ -f "${SSH_PRIVATE_KEY_FILE}" ]; then
  mkdir -p "$HOME/.ssh"
  cp "$SSH_PRIVATE_KEY_FILE" "$HOME/.ssh/id_ed25519"
  chmod 700 "$HOME/.ssh"
  chmod 600 "$HOME/.ssh/id_ed25519"
  ssh-keyscan -t ed25519 github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null || true
fi

if [ ! -d "$REPO_DIR/.git" ]; then
  if [ -z "${REPO_URL:-}" ]; then
    echo "REPO_URL is not set and $REPO_DIR has no git checkout yet."
    echo "Set REPO_URL to your fork's clone URL and restart the container -"
    echo "e.g. git@github.com:<you>/ai-job-search.git (with SSH_PRIVATE_KEY_FILE set)"
    echo "or https://<token>@github.com/<you>/ai-job-search.git for a private repo."
    echo "Continuing with an empty workspace so you can clone manually."
  else
    echo "Cloning $REPO_URL into $REPO_DIR ..."
    git clone "$REPO_URL" "$REPO_DIR"
  fi
fi

if [ -n "${GIT_USER_NAME:-}" ]; then
  git config --global user.name "$GIT_USER_NAME"
fi
if [ -n "${GIT_USER_EMAIL:-}" ]; then
  git config --global user.email "$GIT_USER_EMAIL"
fi
git config --global --add safe.directory "$REPO_DIR" 2>/dev/null || true

if [ -d "$REPO_DIR" ]; then
  echo "Installing job-portal CLI dependencies ..."
  for cli_pkg in "$REPO_DIR"/.agents/skills/*/cli/package.json; do
    [ -e "$cli_pkg" ] || continue
    cli_dir="$(dirname "$cli_pkg")"
    ( cd "$cli_dir" && bun install --silent ) || echo "warning: bun install failed in $cli_dir"
  done
fi

cat <<EOF

ai-job-search dev container ready.
  Repo:  $REPO_DIR
  Home:  $HOME (persisted - Claude Code auth and git config live here)

Exec in to drive it interactively, e.g.:
  kubectl exec -it <pod-name> -- bash
  docker exec -it <container-name> bash

Then inside:
  cd $REPO_DIR
  claude          # first run prompts an interactive login unless
                   # ANTHROPIC_API_KEY is set in the environment

EOF

exec "$@"
