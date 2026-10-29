import { bigint, boolean, customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

const time = (name: string) => timestamp(name, { withTimezone: true });

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('citizen'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: time('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [index('session_user_idx').on(table.userId)]);

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: time('access_token_expires_at'),
  refreshTokenExpiresAt: time('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  index('account_user_idx').on(table.userId),
  uniqueIndex('account_provider_identity_idx').on(table.providerId, table.accountId),
]);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: time('expires_at').notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [index('verification_identifier_idx').on(table.identifier)]);

export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});

export const markets = pgTable('markets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  locationDescription: text('location_description'),
  isSample: boolean('is_sample').notNull().default(false),
});

export const stores = pgTable('stores', {
  id: text('id').primaryKey(),
  marketId: text('market_id').notNull().references(() => markets.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  locationDescription: text('location_description'),
  usualItems: text('usual_items').array().notNull(),
  source: text('source'),
  checkedAt: time('checked_at'),
  isSample: boolean('is_sample').notNull().default(false),
}, (table) => [index('stores_market_idx').on(table.marketId)]);

const binary = customType<{ data: Buffer; driverData: Buffer }>({ dataType() { return 'bytea'; } });
export const cartItems = pgTable('cart_items', {
 id:text('id').primaryKey(), userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}),
 name:text('name').notNull(), normalizedName:text('normalized_name').notNull(), checked:boolean('checked').notNull().default(false),
 version:integer('version').notNull().default(1), createdAt:time('created_at').notNull().defaultNow(), updatedAt:time('updated_at').notNull().defaultNow(),
}, t=>[uniqueIndex('cart_owner_name_idx').on(t.userId,t.normalizedName)]);
export const opinionDrafts = pgTable('opinion_drafts', {
 userId:text('user_id').primaryKey().references(()=>user.id,{onDelete:'cascade'}), version:integer('version').notNull(),
 content:jsonb('content').notNull().$type<import('../lib/contracts.ts').DraftContent>(), updatedAt:time('updated_at').notNull().defaultNow(),
});
export const operatorMarkets = pgTable('operator_markets', {
 id:text('id').primaryKey(), userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}), marketId:text('market_id').notNull().references(()=>markets.id,{onDelete:'cascade'}),
},t=>[uniqueIndex('operator_market_unique').on(t.userId,t.marketId)]);
export const merchantStores = pgTable('merchant_stores', {
 id:text('id').primaryKey(), userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}), storeId:text('store_id').notNull().references(()=>stores.id,{onDelete:'cascade'}),
},t=>[uniqueIndex('merchant_store_unique').on(t.userId,t.storeId)]);
export const roleAudits = pgTable('role_audits', {
 id:text('id').primaryKey(), subjectId:text('subject_id').notNull(), actor:text('actor').notNull(), reason:text('reason').notNull(),
 before:jsonb('before').notNull(), after:jsonb('after').notNull(), createdAt:time('created_at').notNull().defaultNow(),
});
export const opinions = pgTable('opinions', {
 id:text('id').primaryKey(), userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}), marketId:text('market_id').notNull().references(()=>markets.id,{onDelete:'restrict'}),
 location:text('location').notNull(), situation:text('situation').notNull(), observedAt:text('observed_at').notNull(),
 title:text('title').notNull(), description:text('description').notNull(), request:text('request').notNull(), generationMode:text('generation_mode').notNull(),
 status:text('status').$type<import('../lib/contracts.ts').OpinionStatus>().notNull().default('received'), version:integer('version').notNull().default(1),
 requestKey:text('request_key').notNull(), requestHash:text('request_hash').notNull(), isSample:boolean('is_sample').notNull().default(false),
 createdAt:time('created_at').notNull().defaultNow(), updatedAt:time('updated_at').notNull().defaultNow(),
},t=>[uniqueIndex('opinion_submit_unique').on(t.userId,t.requestKey),index('opinion_market_idx').on(t.marketId),index('opinion_owner_idx').on(t.userId)]);
export const attachments = pgTable('attachments', {
 id:text('id').primaryKey(), userId:text('user_id').notNull().references(()=>user.id,{onDelete:'cascade'}), opinionId:text('opinion_id').references(()=>opinions.id,{onDelete:'cascade'}),
 uploadKey:text('upload_key'), uploadHash:text('upload_hash'), mimeType:text('mime_type').notNull(), byteSize:integer('byte_size').notNull(), width:integer('width').notNull(), height:integer('height').notNull(), data:binary('data').notNull(),
 createdAt:time('created_at').notNull().defaultNow(),
},t=>[index('attachment_owner_idx').on(t.userId),uniqueIndex('attachment_upload_unique').on(t.userId,t.uploadKey)]);
export const opinionEvents = pgTable('opinion_events', {
 id:text('id').primaryKey(), opinionId:text('opinion_id').notNull().references(()=>opinions.id,{onDelete:'cascade'}), actorId:text('actor_id').notNull().references(()=>user.id,{onDelete:'restrict'}),
 kind:text('kind').notNull(), content:text('content').notNull(), visibleToCitizen:boolean('visible_to_citizen').notNull().default(false),
 details:jsonb('details').$type<Record<string,string>>().notNull().default({}), createdAt:time('created_at').notNull().defaultNow(),
},t=>[index('opinion_event_idx').on(t.opinionId)]);
export const opinionQuestions = pgTable('opinion_questions', {
 id:text('id').primaryKey(), opinionId:text('opinion_id').notNull().references(()=>opinions.id,{onDelete:'cascade'}), actorId:text('actor_id').notNull().references(()=>user.id,{onDelete:'restrict'}), content:text('content').notNull(), createdAt:time('created_at').notNull().defaultNow(),
});
export const questionResponses = pgTable('question_responses', {
 id:text('id').primaryKey(), questionId:text('question_id').notNull().references(()=>opinionQuestions.id,{onDelete:'cascade'}), actorId:text('actor_id').notNull().references(()=>user.id,{onDelete:'restrict'}), content:text('content').notNull(), createdAt:time('created_at').notNull().defaultNow(),
});
export const transmissions = pgTable('transmissions', {
 id:text('id').primaryKey(), opinionId:text('opinion_id').notNull().references(()=>opinions.id,{onDelete:'cascade'}), merchantId:text('merchant_id').notNull().references(()=>user.id,{onDelete:'restrict'}), storeId:text('store_id').notNull().references(()=>stores.id,{onDelete:'restrict'}),
 actorId:text('actor_id').notNull().references(()=>user.id,{onDelete:'restrict'}), relationBasis:text('relation_basis').notNull(), summary:text('summary').notNull(), location:text('location').notNull(), version:integer('version').notNull().default(1), createdAt:time('created_at').notNull().defaultNow(),
},t=>[index('transmission_merchant_idx').on(t.merchantId)]);
export const merchantReplies = pgTable('merchant_replies', {
 id:text('id').primaryKey(), transmissionId:text('transmission_id').notNull().references(()=>transmissions.id,{onDelete:'cascade'}), actorId:text('actor_id').notNull().references(()=>user.id,{onDelete:'restrict'}),
 stance:text('stance').notNull(), alternative:text('alternative'), noAlternative:boolean('no_alternative').notNull(), correctsId:text('corrects_id'), createdAt:time('created_at').notNull().defaultNow(),
});
export const mutationReceipts = pgTable('mutation_receipts', {
 id:text('id').primaryKey(), actorId:text('actor_id').notNull().references(()=>user.id,{onDelete:'cascade'}), scope:text('scope').notNull(), requestKey:text('request_key').notNull(), requestHash:text('request_hash').notNull(), createdAt:time('created_at').notNull().defaultNow(),
},t=>[uniqueIndex('mutation_receipt_unique').on(t.actorId,t.scope,t.requestKey)]);
