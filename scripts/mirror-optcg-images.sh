#!/usr/bin/env bash
# Mirror One Piece card images → Cloudflare R2 (build plan M4: "card images
# mirrored to R2"). Reads .optcg-images/manifest.tsv (scripts/
# optcg-image-manifest.ts), lists what the bucket already holds ONCE, then
# downloads only the missing images from Bandai's official hosting — real
# User-Agent, ~4 requests/second — and uploads them under
# optcg/images/<KEY>.png. Idempotent and resumable by construction: an
# interrupted backfill continues wherever it stopped on the next run, and a
# steady-state night with nothing new is a few seconds of `aws s3 ls`.
#
# Serving: images upload to R2_PUBLIC_BUCKET (the images-only public bucket —
# the main bucket stays private, it holds pg/ backups) and are served from its
# public domain (R2_PUBLIC_IMAGE_BASE, which the ingest writes into
# image_override). Falls back to R2_BUCKET when no public bucket is set (the
# pre-flip archival mode). When both are set, a legacy seed pass first copies
# anything the private bucket's optcg/images/ already holds — bucket-to-bucket
# through the runner, so Bandai is never re-asked for images we already have.
# Same skip-clean env pattern as archive-topdeck-raw.sh: no R2 secrets or no
# manifest → exit 0.
# Volume: ~4,843 PNGs ≈ low single-digit GB, inside R2's 10GB free tier.
set -euo pipefail

MANIFEST=".optcg-images/manifest.tsv"
PREFIX="optcg/images"

if [ -z "${R2_ENDPOINT:-}" ] || [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ] || [ -z "${R2_BUCKET:-}" ]; then
  echo "R2 secrets not configured — skipping image mirror."
  exit 0
fi
if [ ! -s "$MANIFEST" ]; then
  echo "no $MANIFEST — skipping image mirror (run optcg:image-manifest first)."
  exit 0
fi

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"

DEST_BUCKET="${R2_PUBLIC_BUCKET:-$R2_BUCKET}"

# One-time seed: images the pre-flip runs archived into the private bucket
# move over without touching Bandai. No-ops in seconds once caught up.
if [ -n "${R2_PUBLIC_BUCKET:-}" ] && [ "$R2_PUBLIC_BUCKET" != "$R2_BUCKET" ]; then
  echo "seeding $R2_PUBLIC_BUCKET from legacy $R2_BUCKET/$PREFIX/ …"
  aws s3 sync "s3://$R2_BUCKET/$PREFIX/" "s3://$DEST_BUCKET/$PREFIX/" \
    --endpoint-url "$R2_ENDPOINT" --content-type image/png --only-show-errors
fi

existing=$(mktemp)
aws s3 ls "s3://$DEST_BUCKET/$PREFIX/" --recursive --endpoint-url "$R2_ENDPOINT" \
  | awk '{print $NF}' | sed "s|^$PREFIX/||" > "$existing" || true

total=0 present=0 uploaded=0 failed=0
tmp=$(mktemp)
while IFS=$'\t' read -r key url; do
  [ -n "$key" ] || continue
  total=$((total + 1))
  if grep -qxF "$key.png" "$existing"; then
    present=$((present + 1))
    continue
  fi
  if curl -sSf --retry 2 -m 60 -A "Deckwarden/1.0 (https://deckwarden.gg)" "$url" -o "$tmp"; then
    aws s3 cp "$tmp" "s3://$DEST_BUCKET/$PREFIX/$key.png" \
      --endpoint-url "$R2_ENDPOINT" --content-type image/png --only-show-errors
    uploaded=$((uploaded + 1))
  else
    echo "WARN: download failed for $key ($url)"
    failed=$((failed + 1))
  fi
  sleep 0.25 # Bandai politeness
done < "$MANIFEST"
rm -f "$tmp" "$existing"

echo "mirror → $DEST_BUCKET: $total in manifest, $present already mirrored, $uploaded uploaded, $failed failed"
# Individual misses are warned above and retried next night; only total
# failure (likely a blocked UA or layout change) should go red.
if [ "$failed" -gt 0 ] && [ "$uploaded" -eq 0 ] && [ "$present" -eq 0 ]; then
  exit 1
fi
