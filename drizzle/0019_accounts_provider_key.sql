ALTER TABLE "accounts" DROP CONSTRAINT "accounts_issuer_account";--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "issuer" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_provider_account" UNIQUE("provider_id","account_id");