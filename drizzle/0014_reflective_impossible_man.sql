CREATE TABLE "precon_products" (
	"deck_id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"slug" text NOT NULL,
	"set_code" text NOT NULL,
	"release_date" date,
	"product_name" text NOT NULL,
	"blurb" text,
	"source_hash" text NOT NULL,
	CONSTRAINT "precon_products_code_unique" UNIQUE("code"),
	CONSTRAINT "precon_products_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DROP INDEX "decks_recent_public";--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "kind" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "precon_products" ADD CONSTRAINT "precon_products_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decks_recent_public" ON "decks" USING btree ("updated_at" DESC NULLS LAST) WHERE "decks"."visibility" = 'public' and "decks"."kind" = 'user';--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_kind_check" CHECK ("decks"."kind" in ('user','precon'));--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_precon_unowned" CHECK ("decks"."kind" <> 'precon' or ("decks"."user_id" is null and "decks"."claim_token" is null and "decks"."folder_id" is null and "decks"."forked_from_deck_id" is null));