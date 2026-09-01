CREATE TABLE "tournament_standings" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tournament_standings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"tournament_id" integer NOT NULL,
	"placement" smallint NOT NULL,
	"player_name" text,
	"leader_ids" uuid[] NOT NULL,
	"decklist_url" text,
	"wins" smallint,
	"draws" smallint,
	"losses" smallint,
	CONSTRAINT "tournament_standings_event_place" UNIQUE("tournament_id","placement")
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tournaments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"game_id" smallint NOT NULL,
	"format_id" smallint NOT NULL,
	"source" text NOT NULL,
	"external_key" text NOT NULL,
	"name" text NOT NULL,
	"start_date" date NOT NULL,
	"player_count" smallint NOT NULL,
	"top_cut" smallint,
	CONSTRAINT "tournaments_source_key" UNIQUE("source","external_key")
);
--> statement-breakpoint
ALTER TABLE "tournament_standings" ADD CONSTRAINT "tournament_standings_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_format_id_formats_id_fk" FOREIGN KEY ("format_id") REFERENCES "public"."formats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ts_by_leader" ON "tournament_standings" USING gin ("leader_ids");--> statement-breakpoint
CREATE INDEX "tournaments_game_date" ON "tournaments" USING btree ("game_id","start_date" DESC NULLS LAST);