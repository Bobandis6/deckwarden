CREATE TABLE "deck_games" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "deck_games_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"deck_id" uuid NOT NULL,
	"version" integer,
	"list_hash" text,
	"played_on" date NOT NULL,
	"pod_size" smallint NOT NULL,
	"result" text NOT NULL,
	"end_turn" smallint,
	"table_level" smallint,
	"seat" smallint,
	"opponents" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deck_games_result_check" CHECK ("deck_games"."result" in ('win','loss','draw'))
);
--> statement-breakpoint
ALTER TABLE "deck_versions" ADD COLUMN "list_hash" text;--> statement-breakpoint
ALTER TABLE "deck_versions" ADD COLUMN "kind" text DEFAULT 'saved' NOT NULL;--> statement-breakpoint
ALTER TABLE "deck_games" ADD CONSTRAINT "deck_games_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deck_games_deck_played" ON "deck_games" USING btree ("deck_id","played_on" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "deck_versions" ADD CONSTRAINT "deck_versions_kind_check" CHECK ("deck_versions"."kind" in ('saved','played'));