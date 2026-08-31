#!/usr/bin/env bash
# Nightly user-table backup → Cloudflare R2 (plan §5). User decks are the one thing
# that can't be re-downloaded; card data never needs backing up (re-ingestable).
# Skips cleanly until (a) R2 secrets exist and (b) user tables exist (M1).
# Restore drill happens once before any public link exists (M1.P1.8).
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL required}"

if [ -z "${R2_ENDPOINT:-}" ] || [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ] || [ -z "${R2_BUCKET:-}" ]; then
  echo "R2 secrets not configured — skipping backup (nothing user-generated exists before M1)."
  exit 0
fi

# pg_dump wants a real session — use the direct (non -pooler) host.
DIRECT_URL="${DATABASE_URL/-pooler./.}"

USER_TABLES="users decks deck_folders deck_cards deck_versions deck_likes deck_bookmarks collections"
EXISTING=$(psql "$DIRECT_URL" -Atc \
  "SELECT string_agg(tablename, ' ') FROM pg_tables WHERE schemaname='public'
   AND tablename = ANY(string_to_array('$USER_TABLES', ' '))")
if [ -z "$EXISTING" ]; then
  echo "no user tables yet (M1 creates them) — skipping backup."
  exit 0
fi

ARGS=()
for t in $EXISTING; do ARGS+=("--table=public.$t"); done
STAMP=$(date -u +%Y%m%d-%H%M)
FILE="deckwarden-user-tables-$STAMP.sql.gz"
pg_dump "$DIRECT_URL" --no-owner --no-privileges "${ARGS[@]}" | gzip >"$FILE"
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  aws s3 cp "$FILE" "s3://$R2_BUCKET/pg/$FILE" --endpoint-url "$R2_ENDPOINT"
echo "backed up: $EXISTING → s3://$R2_BUCKET/pg/$FILE"

# Identity map: card_identities.id is gen_random_uuid(), so a from-scratch
# rebuild (migrate + re-ingest) mints NEW identity ids — restored deck rows
# would dangle without this id → (game_id, external_key) remap key. Printings
# need no map (their id IS the scryfall card id); games/formats ids are fixed
# by seed. The restore-drill workflow verifies the map covers every deck ref.
MAP="deckwarden-identity-map-$STAMP.csv.gz"
psql "$DIRECT_URL" -c "COPY (SELECT id, game_id, external_key FROM card_identities) TO STDOUT WITH (FORMAT csv, HEADER)" | gzip >"$MAP"
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
  aws s3 cp "$MAP" "s3://$R2_BUCKET/pg/$MAP" --endpoint-url "$R2_ENDPOINT"
echo "identity map → s3://$R2_BUCKET/pg/$MAP"

# Account links (P2.8, fired LATER row): the OAuth identity columns only, the
# same COPY-a-subset move as the identity map. Restoring `users` without these
# would leave sign-in to better-auth's email-based re-linking — or lock people
# out. Deliberately NOT a pg_dump of `accounts`: that would put OAuth
# access/refresh tokens at rest in R2. Restore = insert rows with fresh ids;
# tokens refresh on next sign-in. (Sessions stay excluded — people sign in
# again; `verifications` is short-lived OAuth state, worthless in a restore.)
if [ "$(psql "$DIRECT_URL" -Atc "SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='accounts'")" = "1" ]; then
  LINKS="deckwarden-account-links-$STAMP.csv.gz"
  psql "$DIRECT_URL" -c "COPY (SELECT issuer, account_id, provider_id, user_id FROM accounts) TO STDOUT WITH (FORMAT csv, HEADER)" | gzip >"$LINKS"
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
    aws s3 cp "$LINKS" "s3://$R2_BUCKET/pg/$LINKS" --endpoint-url "$R2_ENDPOINT"
  echo "account links → s3://$R2_BUCKET/pg/$LINKS"
else
  echo "accounts table absent (pre-P2.1 schema) — skipping account-links CSV."
fi
