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
#
# Small renditions (P4.9): every key also gets optcg/small/<KEY>.webp, the
# 146×204 WebP that thumbnailUrl() derives for the small boxes (search rows,
# deck tiles, the home shelf, the /leaders grid). Same delta shape: list
# optcg/small/ once, resize only what is missing (scripts/optcg-image-small.ts
# — sharp, since the runner image ships no image tools), upload once
# recursively. The sources are never Bandai: tonight's fresh downloads first,
# then — only when a missing key was not downloaded tonight (the one-time
# backfill, or a repair) — ONE recursive sync of the bucket's own
# optcg/images/ (R2 egress is free). Public bucket only.
#
# Same skip-clean env pattern as archive-topdeck-raw.sh: no R2 secrets or no
# manifest → exit 0.
# Volume: ~4,843 PNGs ≈ 0.85 GB at the measured 174 KB mean, plus ~50 MB of
# small WebP — inside R2's 10GB free tier.
set -euo pipefail

MANIFEST=".optcg-images/manifest.tsv"
PREFIX="optcg/images"
SMALL_PREFIX="optcg/small"

if [ -z "${R2_ENDPOINT:-}" ] || [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ] || [ -z "${R2_BUCKET:-}" ]; then
  echo "R2 secrets not configured — skipping image mirror."
  exit 0
fi
if [ ! -s "$MANIFEST" ]; then
  echo "no $MANIFEST — skipping image mirror (run optcg:image-manifest first)."
  exit 0
fi

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
# aws-cli's standard retry mode, more patient than the legacy default: the
# first small backfill (2026-10-01) lost one 1.4 MB GET to "Max Retries
# Exceeded" in a 4,843-object sync.
export AWS_RETRY_MODE=standard AWS_MAX_ATTEMPTS=10

DEST_BUCKET="${R2_PUBLIC_BUCKET:-$R2_BUCKET}"

# One-time seed: images the pre-flip runs archived into the private bucket
# move over without touching Bandai. No-ops in seconds once caught up.
if [ -n "${R2_PUBLIC_BUCKET:-}" ] && [ "$R2_PUBLIC_BUCKET" != "$R2_BUCKET" ]; then
  echo "seeding $R2_PUBLIC_BUCKET from legacy $R2_BUCKET/$PREFIX/ …"
  aws s3 sync "s3://$R2_BUCKET/$PREFIX/" "s3://$DEST_BUCKET/$PREFIX/" \
    --endpoint-url "$R2_ENDPOINT" --content-type image/png --only-show-errors
fi

# Two phases (2026-09-03: per-file `aws s3 cp` cost ~1s each and blew the
# first backfill past the job timeout): a polite download loop into a temp
# dir, then ONE parallel recursive upload — aws-cli overhead paid once.
existing=$(mktemp)
aws s3 ls "s3://$DEST_BUCKET/$PREFIX/" --recursive --endpoint-url "$R2_ENDPOINT" \
  | awk '{print $NF}' | sed "s|^$PREFIX/||" > "$existing" || true

stage=$(mktemp -d)
total=0 present=0 downloaded=0 failed=0
while IFS=$'\t' read -r key url; do
  [ -n "$key" ] || continue
  total=$((total + 1))
  if grep -qxF "$key.png" "$existing"; then
    present=$((present + 1))
    continue
  fi
  if curl -sSf --retry 2 -m 60 -A "Deckwarden/1.0 (https://deckwarden.gg)" "$url" -o "$stage/$key.png"; then
    downloaded=$((downloaded + 1))
  else
    echo "WARN: download failed for $key ($url)"
    rm -f "$stage/$key.png"
    failed=$((failed + 1))
  fi
  sleep 0.25 # Bandai politeness
done < "$MANIFEST"

if [ "$downloaded" -gt 0 ]; then
  aws s3 cp "$stage" "s3://$DEST_BUCKET/$PREFIX/" --recursive \
    --endpoint-url "$R2_ENDPOINT" --content-type image/png --only-show-errors
fi

echo "mirror → $DEST_BUCKET: $total in manifest, $present already mirrored, $downloaded uploaded, $failed failed"

# Small renditions (P4.9, see the header). $stage still holds tonight's
# downloads. The pre-flip archival mode serves nothing, so it needs none.
small_present=0 small_tried=0 small_written=0 small_failed=0
if [ -n "${R2_PUBLIC_BUCKET:-}" ]; then
  have_small=$(mktemp)
  aws s3 ls "s3://$DEST_BUCKET/$SMALL_PREFIX/" --recursive --endpoint-url "$R2_ENDPOINT" \
    | awk '{print $NF}' | sed "s|^$SMALL_PREFIX/||" > "$have_small" || true
  # FILENAME, not NR == FNR: the backfill night's listing is EMPTY, and
  # NR == FNR would then read the manifest as the "have" list.
  missing_small=$(mktemp)
  awk -F'\t' 'FILENAME == ARGV[1] { have[$0] = 1; next }
    $1 != "" && !(($1 ".webp") in have) { print $1 }' "$have_small" "$MANIFEST" > "$missing_small"
  missing_count=$(wc -l < "$missing_small" | tr -d ' ')
  small_present=$((total - missing_count))
  if [ "$missing_count" -gt 0 ]; then
    full=$(mktemp -d)
    # Sources from the bucket: only keys it holds that tonight did not stage
    # (a key Bandai failed to serve is in neither). A few come one by one;
    # many (the one-time backfill) come in ONE recursive sync. A failed
    # transfer is a warning, never fatal: whatever arrived is resized, and
    # the next night retries the rest.
    bucket_keys=$(mktemp)
    awk 'FILENAME == ARGV[1] { held[$0] = 1; next } (($0 ".png") in held) { print }' \
      "$existing" "$missing_small" | while IFS= read -r key; do
      [ -f "$stage/$key.png" ] || echo "$key"
    done > "$bucket_keys"
    bucket_count=$(wc -l < "$bucket_keys" | tr -d ' ')
    if [ "$bucket_count" -gt 50 ]; then
      aws s3 sync "s3://$DEST_BUCKET/$PREFIX/" "$full" --endpoint-url "$R2_ENDPOINT" --only-show-errors \
        || echo "WARN: the bucket sync missed some PNGs; their small renditions wait for the next night."
    elif [ "$bucket_count" -gt 0 ]; then
      while IFS= read -r key; do
        aws s3 cp "s3://$DEST_BUCKET/$PREFIX/$key.png" "$full/$key.png" \
          --endpoint-url "$R2_ENDPOINT" --only-show-errors \
          || echo "WARN: could not fetch $key.png from the bucket; retried next night."
      done < "$bucket_keys"
    fi
    rm -f "$bucket_keys"
    small_list=$(mktemp)
    while IFS= read -r key; do
      if [ -f "$stage/$key.png" ]; then
        printf '%s\t%s\n' "$key" "$stage/$key.png"
      elif [ -f "$full/$key.png" ]; then
        printf '%s\t%s\n' "$key" "$full/$key.png"
      fi
    done < "$missing_small" > "$small_list"
    small_tried=$(wc -l < "$small_list" | tr -d ' ')
    small_stage=$(mktemp -d)
    if [ "$small_tried" -gt 0 ]; then
      # Its exit code only says "nothing written"; the count below decides.
      pnpm optcg:image-small "$small_list" "$small_stage" || true
    fi
    small_written=$(find "$small_stage" -name '*.webp' | wc -l | tr -d ' ')
    small_failed=$((missing_count - small_written))
    if [ "$small_written" -gt 0 ]; then
      aws s3 cp "$small_stage" "s3://$DEST_BUCKET/$SMALL_PREFIX/" --recursive \
        --endpoint-url "$R2_ENDPOINT" --content-type image/webp --only-show-errors
    fi
    rm -rf "$full" "$small_stage" "$small_list"
  fi
  rm -f "$have_small" "$missing_small"
  echo "small → $DEST_BUCKET: $total in manifest, $small_present already resized, $small_written uploaded, $small_failed failed"
fi
rm -rf "$stage" "$existing"

# Individual misses are warned above and retried next night; only total
# failure should go red: every download failing (likely a blocked UA or a
# layout change), or a resizer that wrote nothing from staged PNGs.
if [ "$failed" -gt 0 ] && [ "$downloaded" -eq 0 ] && [ "$present" -eq 0 ]; then
  exit 1
fi
if [ "$small_tried" -gt 0 ] && [ "$small_written" -eq 0 ]; then
  exit 1
fi
