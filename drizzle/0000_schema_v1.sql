-- Hand-added: drizzle-kit does not manage extensions. pg_trgm backs ci_name_trgm.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "card_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" smallint NOT NULL,
	"external_key" text NOT NULL,
	"name" text NOT NULL,
	"name_norm" text NOT NULL,
	"slug" text,
	"primary_type" text,
	"cost_value" smallint,
	"colors_mask" smallint DEFAULT 0 NOT NULL,
	"ci_mask" smallint DEFAULT 0 NOT NULL,
	"is_leader_candidate" boolean DEFAULT false NOT NULL,
	"popularity" integer,
	"cheapest_usd" numeric(10, 2),
	"is_preview" boolean DEFAULT false NOT NULL,
	"is_removed" boolean DEFAULT false NOT NULL,
	"attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"search_text" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', name || ' ' || coalesce(attrs->>'type_line','') || ' ' || coalesce(attrs->>'oracle_text',''))) STORED,
	"seen_at" timestamp with time zone,
	CONSTRAINT "card_identities_game_external_key" UNIQUE("game_id","external_key")
);
--> statement-breakpoint
CREATE TABLE "card_printings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"card_identity_id" uuid NOT NULL,
	"game_id" smallint NOT NULL,
	"set_id" integer NOT NULL,
	"collector_number" text NOT NULL,
	"rarity" text,
	"finishes" text[] DEFAULT '{}' NOT NULL,
	"has_back" boolean DEFAULT false NOT NULL,
	"image_override" jsonb,
	"released_at" date,
	"is_default" boolean DEFAULT false NOT NULL,
	"prices" jsonb,
	"price_updated_at" timestamp with time zone,
	"content_hash" text,
	"is_removed" boolean DEFAULT false NOT NULL,
	"seen_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "formats" (
	"id" smallint PRIMARY KEY NOT NULL,
	"game_id" smallint NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"default_legality" text DEFAULT 'not_legal' NOT NULL,
	CONSTRAINT "formats_game_code" UNIQUE("game_id","code"),
	CONSTRAINT "formats_default_legality_check" CHECK ("formats"."default_legality" in ('legal','banned','restricted','not_legal'))
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" smallint PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "games_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ingest_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"source" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	CONSTRAINT "ingest_runs_status_check" CHECK ("ingest_runs"."status" in ('running','succeeded','failed'))
);
--> statement-breakpoint
CREATE TABLE "legalities" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "legalities_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"format_id" smallint NOT NULL,
	"card_identity_id" uuid NOT NULL,
	"status" text NOT NULL,
	"condition" jsonb,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"source" text,
	"note" text,
	CONSTRAINT "legalities_status_check" CHECK ("legalities"."status" in ('legal','banned','restricted','not_legal'))
);
--> statement-breakpoint
CREATE TABLE "sets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"game_id" smallint NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"released_at" date,
	"set_type" text,
	CONSTRAINT "sets_game_code" UNIQUE("game_id","code")
);
--> statement-breakpoint
ALTER TABLE "card_identities" ADD CONSTRAINT "card_identities_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_printings" ADD CONSTRAINT "card_printings_card_identity_id_card_identities_id_fk" FOREIGN KEY ("card_identity_id") REFERENCES "public"."card_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_printings" ADD CONSTRAINT "card_printings_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "card_printings" ADD CONSTRAINT "card_printings_set_id_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "formats" ADD CONSTRAINT "formats_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legalities" ADD CONSTRAINT "legalities_format_id_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."formats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legalities" ADD CONSTRAINT "legalities_card_identity_id_card_identities_id_fk" FOREIGN KEY ("card_identity_id") REFERENCES "public"."card_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sets" ADD CONSTRAINT "sets_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ci_search_gin" ON "card_identities" USING gin ("search_text");--> statement-breakpoint
CREATE INDEX "ci_name_trgm" ON "card_identities" USING gin ("name_norm" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "ci_attrs_gin" ON "card_identities" USING gin ("attrs" jsonb_path_ops);--> statement-breakpoint
CREATE INDEX "ci_browse" ON "card_identities" USING btree ("game_id","primary_type","cost_value");--> statement-breakpoint
CREATE INDEX "ci_leaders" ON "card_identities" USING btree ("game_id","popularity") WHERE "card_identities"."is_leader_candidate";--> statement-breakpoint
CREATE UNIQUE INDEX "ci_slug" ON "card_identities" USING btree ("game_id","slug") WHERE "card_identities"."slug" is not null;--> statement-breakpoint
CREATE INDEX "cp_by_identity" ON "card_printings" USING btree ("card_identity_id","released_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "cp_default_one" ON "card_printings" USING btree ("card_identity_id") WHERE "card_printings"."is_default";--> statement-breakpoint
CREATE INDEX "cp_by_set" ON "card_printings" USING btree ("set_id","collector_number");--> statement-breakpoint
CREATE INDEX "ingest_runs_source_started" ON "ingest_runs" USING btree ("source","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leg_current" ON "legalities" USING btree ("format_id","card_identity_id") WHERE "legalities"."effective_to" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "leg_current_uncond" ON "legalities" USING btree ("format_id","card_identity_id") WHERE "legalities"."effective_to" is null and "legalities"."condition" is null;