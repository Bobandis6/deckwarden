CREATE TABLE "collections" (
	"user_id" uuid NOT NULL,
	"printing_id" uuid NOT NULL,
	"finish" text DEFAULT 'nonfoil' NOT NULL,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_user_id_printing_id_finish_pk" PRIMARY KEY("user_id","printing_id","finish"),
	CONSTRAINT "collections_finish_check" CHECK ("collections"."finish" in ('nonfoil','foil','etched')),
	CONSTRAINT "collections_quantity_check" CHECK ("collections"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_printing_id_card_printings_id_fk" FOREIGN KEY ("printing_id") REFERENCES "public"."card_printings"("id") ON DELETE no action ON UPDATE no action;