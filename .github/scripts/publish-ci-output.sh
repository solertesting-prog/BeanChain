#!/usr/bin/env bash
# Publica los logs de CI, el lockfile generado y la migración SQL en la rama
# `ci-output/<job>` para poder revisarlos sin acceso a la interfaz de Actions.
set -euo pipefail

JOB="${1:?uso: publish-ci-output.sh <job>}"
OUT="$(mktemp -d)"

mkdir -p "$OUT/logs"
cp -r "${LOGS:-ci-logs}/." "$OUT/logs/" 2>/dev/null || true
[ -f pnpm-lock.yaml ] && cp pnpm-lock.yaml "$OUT/" || true
{
  echo "commit: ${GITHUB_SHA}"
  echo "run: ${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
  echo "date: $(date -u +%FT%TZ)"
} > "$OUT/RUN.txt"

cd "$OUT"
git init -q -b out
git add -A
git -c user.name="ci" -c user.email="ci@users.noreply.github.com" commit -qm "CI ${GITHUB_SHA} (${JOB})"
git push -q -f "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" "out:refs/heads/ci-output/${JOB}"
echo "Resultados publicados en ci-output/${JOB}"
