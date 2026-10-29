CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"opinion_id" text,
	"mime_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_replies" (
	"id" text PRIMARY KEY NOT NULL,
	"transmission_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"stance" text NOT NULL,
	"alternative" text,
	"no_alternative" boolean NOT NULL,
	"corrects_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_stores" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"store_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mutation_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"scope" text NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operator_markets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"market_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opinion_drafts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"version" integer NOT NULL,
	"content" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opinion_events" (
	"id" text PRIMARY KEY NOT NULL,
	"opinion_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"visible_to_citizen" boolean DEFAULT false NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opinion_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"opinion_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opinions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"market_id" text NOT NULL,
	"location" text NOT NULL,
	"situation" text NOT NULL,
	"observed_at" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"request" text NOT NULL,
	"generation_mode" text NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"request_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"subject_id" text NOT NULL,
	"actor" text NOT NULL,
	"reason" text NOT NULL,
	"before" jsonb NOT NULL,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transmissions" (
	"id" text PRIMARY KEY NOT NULL,
	"opinion_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"store_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"relation_basis" text NOT NULL,
	"summary" text NOT NULL,
	"location" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_opinion_id_opinions_id_fk" FOREIGN KEY ("opinion_id") REFERENCES "public"."opinions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_replies" ADD CONSTRAINT "merchant_replies_transmission_id_transmissions_id_fk" FOREIGN KEY ("transmission_id") REFERENCES "public"."transmissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_replies" ADD CONSTRAINT "merchant_replies_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_stores" ADD CONSTRAINT "merchant_stores_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_stores" ADD CONSTRAINT "merchant_stores_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutation_receipts" ADD CONSTRAINT "mutation_receipts_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_markets" ADD CONSTRAINT "operator_markets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_markets" ADD CONSTRAINT "operator_markets_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opinion_drafts" ADD CONSTRAINT "opinion_drafts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opinion_events" ADD CONSTRAINT "opinion_events_opinion_id_opinions_id_fk" FOREIGN KEY ("opinion_id") REFERENCES "public"."opinions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opinion_events" ADD CONSTRAINT "opinion_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opinion_questions" ADD CONSTRAINT "opinion_questions_opinion_id_opinions_id_fk" FOREIGN KEY ("opinion_id") REFERENCES "public"."opinions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opinion_questions" ADD CONSTRAINT "opinion_questions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opinions" ADD CONSTRAINT "opinions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opinions" ADD CONSTRAINT "opinions_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_responses" ADD CONSTRAINT "question_responses_question_id_opinion_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."opinion_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_responses" ADD CONSTRAINT "question_responses_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_opinion_id_opinions_id_fk" FOREIGN KEY ("opinion_id") REFERENCES "public"."opinions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_merchant_id_user_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transmissions" ADD CONSTRAINT "transmissions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachment_owner_idx" ON "attachments" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cart_owner_name_idx" ON "cart_items" USING btree ("user_id","normalized_name");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_store_unique" ON "merchant_stores" USING btree ("user_id","store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mutation_receipt_unique" ON "mutation_receipts" USING btree ("actor_id","scope","request_key");--> statement-breakpoint
CREATE UNIQUE INDEX "operator_market_unique" ON "operator_markets" USING btree ("user_id","market_id");--> statement-breakpoint
CREATE INDEX "opinion_event_idx" ON "opinion_events" USING btree ("opinion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "opinion_submit_unique" ON "opinions" USING btree ("user_id","request_key");--> statement-breakpoint
CREATE INDEX "opinion_market_idx" ON "opinions" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "opinion_owner_idx" ON "opinions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transmission_merchant_idx" ON "transmissions" USING btree ("merchant_id");