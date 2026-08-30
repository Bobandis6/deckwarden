CREATE TABLE "combo_pieces" (
	"combo_id" bigint NOT NULL,
	"card_identity_id" uuid NOT NULL,
	CONSTRAINT "combo_pieces_combo_id_card_identity_id_pk" PRIMARY KEY("combo_id","card_identity_id")
);
--> statement-breakpoint
CREATE TABLE "combos" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "combos_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"external_key" text NOT NULL,
	"piece_count" smallint NOT NULL,
	"ci_mask" smallint DEFAULT 0 NOT NULL,
	"results" text[] DEFAULT '{}' NOT NULL,
	"templates" text[] DEFAULT '{}' NOT NULL,
	"popularity" integer,
	CONSTRAINT "combos_external_key_unique" UNIQUE("external_key")
);
--> statement-breakpoint
ALTER TABLE "combo_pieces" ADD CONSTRAINT "combo_pieces_combo_id_combos_id_fk" FOREIGN KEY ("combo_id") REFERENCES "public"."combos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "combo_pieces" ADD CONSTRAINT "combo_pieces_card_identity_id_card_identities_id_fk" FOREIGN KEY ("card_identity_id") REFERENCES "public"."card_identities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "combo_pieces_by_card" ON "combo_pieces" USING btree ("card_identity_id");