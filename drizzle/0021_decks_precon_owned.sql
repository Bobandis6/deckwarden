ALTER TABLE "decks" ADD COLUMN "precon_deck_id" uuid;--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "owns_precon" boolean;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_precon_deck_id_decks_id_fk" FOREIGN KEY ("precon_deck_id") REFERENCES "public"."decks"("id") ON DELETE set null ON UPDATE no action;