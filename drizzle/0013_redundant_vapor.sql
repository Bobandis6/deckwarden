CREATE TABLE "commander_card_stats" (
	"leader_ids" uuid[] NOT NULL,
	"card_identity_id" uuid NOT NULL,
	"lists" integer NOT NULL,
	"top4" integer DEFAULT 0 NOT NULL,
	"first_seen" date NOT NULL,
	"last_seen" date NOT NULL,
	CONSTRAINT "commander_card_stats_leader_ids_card_identity_id_pk" PRIMARY KEY("leader_ids","card_identity_id")
);
--> statement-breakpoint
CREATE TABLE "commander_stats" (
	"leader_ids" uuid[] NOT NULL,
	"lists" integer NOT NULL,
	"first_seen" date NOT NULL,
	"last_seen" date NOT NULL,
	CONSTRAINT "commander_stats_leader_ids_pk" PRIMARY KEY("leader_ids")
);
--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "cards_aggregated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "commander_card_stats" ADD CONSTRAINT "commander_card_stats_card_identity_id_card_identities_id_fk" FOREIGN KEY ("card_identity_id") REFERENCES "public"."card_identities"("id") ON DELETE cascade ON UPDATE no action;