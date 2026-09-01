#!/usr/bin/env bash
# Archive raw Topdeck.gg API responses → Cloudflare R2 (plan §5: "archive raw
# responses to R2"). The ingest script writes gzipped chunk responses to
# .topdeck-raw/; this uploads them under topdeck/raw/<run date>/ so the corpus
# can be re-mined without re-hitting the API (skip-bound changes, the M3+
# co-occurrence/Meta Lens rows). Same skip-clean env pattern as
# backup-user-tables.sh: no R2 secrets (or nothing to upload) → exit 0.
# Volume note: a nightly ~14-day window is single-digit MB gzipped — years of
# headroom against R2's 10GB free tier.
set -euo pipefail

RAW_DIR=".topdeck-raw"

if [ -z "${R2_ENDPOINT:-}" ] || [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ] || [ -z "${R2_BUCKET:-}" ]; then
  echo "R2 secrets not configured — skipping raw-response archive."
  exit 0
fi
if [ ! -d "$RAW_DIR" ] || [ -z "$(ls -A "$RAW_DIR" 2>/dev/null)" ]; then
  echo "no raw Topdeck responses to archive (dormant or empty run) — skipping."
  exit 0
fi

STAMP=$(date -u +%Y-%m-%d)
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  aws s3 cp "$RAW_DIR" "s3://$R2_BUCKET/topdeck/raw/$STAMP/" --recursive --endpoint-url "$R2_ENDPOINT"
echo "archived $(ls "$RAW_DIR" | wc -l | tr -d ' ') file(s) → s3://$R2_BUCKET/topdeck/raw/$STAMP/"
