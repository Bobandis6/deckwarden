CREATE TABLE "deck_cards" (
	"deck_id" uuid NOT NULL,
	"zone" text NOT NULL,
	"card_identity_id" uuid NOT NULL,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"printing_id" uuid,
	"tags" text[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "deck_cards_deck_id_zone_card_identity_id_pk" PRIMARY KEY("deck_id","zone","card_identity_id")
);
--> statement-breakpoint
CREATE TABLE "deck_versions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deck_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"deck_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"note" text,
	"cards" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deck_versions_deck_version" UNIQUE("deck_id","version")
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"game_id" smallint NOT NULL,
	"format_id" smallint NOT NULL,
	"user_id" uuid,
	"claim_token" uuid,
	"created_ip" "inet",
	"name" text DEFAULT 'Untitled' NOT NULL,
	"description" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"leader_ids" uuid[] DEFAULT '{}' NOT NULL,
	"ci_mask" smallint DEFAULT 0 NOT NULL,
	"forked_from_deck_id" uuid,
	"current_version" integer DEFAULT 0 NOT NULL,
	"likes_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decks_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "decks_visibility_check" CHECK ("decks"."visibility" in ('public','unlisted','private'))
);
--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_card_identity_id_card_identities_id_fk" FOREIGN KEY ("card_identity_id") REFERENCES "public"."card_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_cards" ADD CONSTRAINT "deck_cards_printing_id_card_printings_id_fk" FOREIGN KEY ("printing_id") REFERENCES "public"."card_printings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deck_versions" ADD CONSTRAINT "deck_versions_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_format_id_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."formats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_forked_from_deck_id_decks_id_fk" FOREIGN KEY ("forked_from_deck_id") REFERENCES "public"."decks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dc_by_card" ON "deck_cards" USING btree ("card_identity_id");--> statement-breakpoint
CREATE INDEX "decks_hub" ON "decks" USING gin ("leader_ids");--> statement-breakpoint
CREATE INDEX "decks_browse" ON "decks" USING btree ("game_id","format_id","visibility","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "decks_owner" ON "decks" USING btree ("user_id","updated_at" DESC NULLS LAST);