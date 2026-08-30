CREATE TABLE "deck_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"visibility" text DEFAULT 'unlisted' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deck_folders_public_id_unique" UNIQUE("public_id"),
	CONSTRAINT "deck_folders_visibility_check" CHECK ("deck_folders"."visibility" in ('public','unlisted','private'))
);
--> statement-breakpoint
ALTER TABLE "decks" ADD COLUMN "folder_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "deck_folders" ADD CONSTRAINT "deck_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deck_folders_owner" ON "deck_folders" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deck_folders_owner_name" ON "deck_folders" USING btree ("user_id",lower("name"));--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_folder_id_deck_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."deck_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "decks_folder" ON "decks" USING btree ("folder_id","updated_at" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");