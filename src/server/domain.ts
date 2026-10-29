import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, or, ilike, sql } from 'drizzle-orm';
import sharp from 'sharp';
import type { DatabaseConnection } from './database.ts';
import type { ServiceConfig } from './config.ts';
import type { DraftContent, Identity, OpinionStatus } from '../lib/contracts.ts';
import { STATUS_LABELS } from '../lib/contracts.ts';
import { attachments, cartItems, markets, merchantReplies, merchantStores, mutationReceipts, operatorMarkets, opinionDrafts, opinionEvents, opinionQuestions, opinions, questionResponses, stores, transmissions, user } from './schema.ts';

type Db = DatabaseConnection['db'];
type Executor = Pick<Db, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;
type Opinion = typeof opinions.$inferSelect;
export class HttpError extends Error {
  status: number; code: string; fields?: Record<string, string>;
  constructor(status: number, message: string, code = 'INVALID_REQUEST', fields?: Record<string, string>) { super(message); this.status = status; this.code = code; this.fields = fields; }
}
export const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
function bad(message: string, field?: string): never { throw new HttpError(400, message, 'INVALID_INPUT', field ? { [field]: message } : undefined); }
function missing(): never { throw new HttpError(404, '요청한 자료를 찾을 수 없습니다.', 'NOT_FOUND'); }
function conflict(): never { throw new HttpError(409, '다른 기기 또는 작업에서 내용이 바뀌었습니다. 최신 내용을 확인해 주세요.', 'VERSION_CONFLICT'); }
function text(value: unknown, field: string, max = 4000, required = true): string {
  if (typeof value !== 'string') { if (!required && value == null) return ''; bad('내용을 확인해 주세요.', field); }
  const result = value.trim(); if ((required && !result) || result.length > max) bad(required && !result ? '내용을 입력해 주세요.' : max + '자 이내로 입력해 주세요.', field); return result;
}
function original(value: unknown, field: string, max: number, required: boolean): string { text(value, field, max, required); if (typeof value === 'string' && value.length > max) bad(max + '자 이내로 입력해 주세요.', field); return typeof value === 'string' ? value : ''; }
function version(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) bad('최신 버전 정보가 필요합니다.', 'version'); return value as number; }
function key(value: unknown): string { return text(value, 'requestId', 100); }
function time(value: unknown, field: string): string { const result = text(value, field, 50); const date = new Date(result); if (Number.isNaN(date.getTime()) || !/^\d{4}-\d{2}-\d{2}T/.test(result)) bad('날짜와 시간을 확인해 주세요.', field); return date.toISOString(); }
function occurred(value: unknown): string { const result = time(value, 'occurredAt'); if (new Date(result).getTime() > Date.now()) bad('실제 확인 시각은 미래일 수 없어요.', 'occurredAt'); return result; }
function canonical(value: unknown): string { if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}'; return JSON.stringify(value); }
function hash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
function normalized(value: string) { return value.normalize('NFKC').trim().replace(/\s+/g, ' '); }
function role(identity: Identity, expected: string) { if (identity.role !== expected) throw new HttpError(403, '이 계정에는 해당 작업 권한이 없습니다.', 'FORBIDDEN'); }
async function boundedBytes(request: Request, max: number) {
  if (Number(request.headers.get('content-length')) > max) throw new HttpError(413, '허용 크기를 초과했습니다.');
  const reader = request.body?.getReader(); if (!reader) return new Uint8Array(); let size = 0; const chunks: Uint8Array[] = [];
  while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > max) { await reader.cancel(); throw new HttpError(413, '허용 크기를 초과했습니다.'); } chunks.push(part.value); }
  const bytes = new Uint8Array(size); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; } return bytes;
}
async function body(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, 'JSON 형식이 필요합니다.');
  const bytes = await boundedBytes(request, 64 * 1024);
  try { const result = JSON.parse(new TextDecoder().decode(bytes)); if (!result || Array.isArray(result) || typeof result !== 'object') bad('요청 내용을 확인해 주세요.'); return result; } catch (error) { if (error instanceof HttpError) throw error; bad('요청 내용을 읽을 수 없습니다.'); }
}
function draftContent(raw: unknown, complete = false): DraftContent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) bad('작성 내용을 확인해 주세요.'); const c = raw as Record<string, unknown>;
  if (c.generationMode !== 'manual') bad('현재 직접 작성만 사용할 수 있습니다.', 'generationMode');
  if (!Array.isArray(c.attachmentIds) || c.attachmentIds.length > 3 || c.attachmentIds.some(id => typeof id !== 'string' || id.length > 100) || new Set(c.attachmentIds).size !== c.attachmentIds.length) bad('사진은 최대 3개를 선택해 주세요.', 'attachmentIds');
  return { marketId: text(c.marketId, 'marketId', 100, complete), location: original(c.location, 'location', 500, complete), situation: original(c.situation, 'situation', 5000, complete), observedAt: original(c.observedAt, 'observedAt', 200, false), title: text(c.title, 'title', 120, complete), description: text(c.description, 'description', 5000, complete), request: text(c.request, 'request', 2000, false), generationMode: 'manual', attachmentIds: c.attachmentIds as string[] };
}
const attachmentColumns = { id: attachments.id, mimeType: attachments.mimeType, byteSize: attachments.byteSize, width: attachments.width, height: attachments.height, createdAt: attachments.createdAt };
async function activeRole(db: Executor, identity: Identity, expected: string) { const [current] = await db.select({ role: user.role }).from(user).where(eq(user.id, identity.id)).for('share'); if (!current || current.role !== expected) throw new HttpError(403, '계정 권한이 변경되었습니다. 다시 로그인해 주세요.', 'FORBIDDEN'); }
async function ensureOperator(db: Executor, identity: Identity, opinion: Opinion) {
  role(identity, 'operator'); const found = await db.select({ id: operatorMarkets.id }).from(operatorMarkets).where(and(eq(operatorMarkets.userId, identity.id), eq(operatorMarkets.marketId, opinion.marketId))).limit(1); if (!found.length) missing();
}
async function getOpinion(db: Executor, id: string, lock = false) {
  const query = db.select().from(opinions).where(eq(opinions.id, id)).limit(1); const [record] = await (lock ? query.for('update') : query); if (!record) missing(); return record;
}
async function summary(db: Executor, record: Opinion) {
  const [market] = await db.select().from(markets).where(eq(markets.id, record.marketId));
  return { id: record.id, marketId: record.marketId, marketName: market.name, title: record.title, location: record.location, status: record.status, version: record.version, isSample: record.isSample, createdAt: record.createdAt, updatedAt: record.updatedAt };
}
async function events(db: Executor, id: string, internal = false) {
  const data = await db.select({ event: opinionEvents, actorName: user.name }).from(opinionEvents).innerJoin(user, eq(user.id, opinionEvents.actorId)).where(and(eq(opinionEvents.opinionId, id), internal ? undefined : eq(opinionEvents.visibleToCitizen, true))).orderBy(asc(opinionEvents.createdAt), asc(opinionEvents.id));
  return data.map(({ event, actorName }) => ({ id: event.id, kind: event.kind, content: event.content, createdAt: event.createdAt, ...event.details, actorName: internal ? actorName : ['received', 'citizen-response'].includes(event.kind) ? '작성 시민' : '틈길 운영자' }));
}
async function citizenView(db: Executor, record: Opinion) {
  const questions = await db.select().from(opinionQuestions).where(eq(opinionQuestions.opinionId, record.id)).orderBy(asc(opinionQuestions.createdAt));
  return { ...await summary(db, record), original: { location: record.location, situation: record.situation, observedAt: record.observedAt }, submission: { title: record.title, description: record.description, request: record.request, generationMode: record.generationMode }, attachments: await db.select(attachmentColumns).from(attachments).where(eq(attachments.opinionId, record.id)), questions: await Promise.all(questions.map(async q => ({ id: q.id, content: q.content, createdAt: q.createdAt, responses: await db.select({ id: questionResponses.id, content: questionResponses.content, createdAt: questionResponses.createdAt }).from(questionResponses).where(eq(questionResponses.questionId, q.id)).orderBy(asc(questionResponses.createdAt)) }))), timeline: await events(db, record.id) };
}
async function transmissionView(db: Executor, record: typeof transmissions.$inferSelect, internal = false) {
  const [store] = await db.select().from(stores).where(eq(stores.id, record.storeId)); const [market] = await db.select().from(markets).where(eq(markets.id, store.marketId));
  const replies = await db.select({ id: merchantReplies.id, stance: merchantReplies.stance, alternative: merchantReplies.alternative, noAlternative: merchantReplies.noAlternative, createdAt: merchantReplies.createdAt, correctsId: merchantReplies.correctsId }).from(merchantReplies).where(eq(merchantReplies.transmissionId, record.id)).orderBy(asc(merchantReplies.createdAt));
  const result = { id: record.id, opinionId: record.opinionId, marketId: market.id, marketName: market.name, storeId: store.id, storeName: store.name, summary: record.summary, location: record.location, createdAt: record.createdAt, version: record.version, replies };
  if (!internal) return result; const [merchant] = await db.select({ name: user.name }).from(user).where(eq(user.id, record.merchantId)); return { ...result, merchantId: record.merchantId, merchantName: merchant.name, relationBasis: record.relationBasis };
}
async function operatorView(db: Executor, record: Opinion) {
  const sent = await db.select().from(transmissions).where(eq(transmissions.opinionId, record.id)).orderBy(asc(transmissions.createdAt));
  const options = await db.select({ merchantId: user.id, merchantName: user.name, storeId: stores.id, storeName: stores.name, marketId: stores.marketId }).from(merchantStores).innerJoin(user, eq(user.id, merchantStores.userId)).innerJoin(stores, eq(stores.id, merchantStores.storeId)).where(and(eq(stores.marketId, record.marketId), eq(user.role, 'merchant')));
  return { ...await citizenView(db, record), internalHistory: await events(db, record.id, true), transmissions: await Promise.all(sent.map(t => transmissionView(db, t, true))), merchantOptions: options };
}
async function event(db: Executor, opinionId: string, actorId: string, kind: string, content: string, visible = false, details: Record<string, string> = {}) {
  const id = randomUUID(); await db.insert(opinionEvents).values({ id, opinionId, actorId, kind, content, visibleToCitizen: visible, details, createdAt: sql`clock_timestamp()` }); return id;
}
async function replay(db: Executor, actorId: string, scope: string, requestKey: string, payload: unknown) {
  const [previous] = await db.select().from(mutationReceipts).where(and(eq(mutationReceipts.actorId, actorId), eq(mutationReceipts.scope, scope), eq(mutationReceipts.requestKey, requestKey))).limit(1);
  if (!previous) return false; if (previous.requestHash !== hash(payload)) throw new HttpError(409, '같은 요청 번호의 내용이 달라졌습니다. 새 요청으로 저장해 주세요.', 'IDEMPOTENCY_MISMATCH'); return true;
}
async function receipt(db: Executor, actorId: string, scope: string, requestKey: string, payload: unknown) { await db.insert(mutationReceipts).values({ id: randomUUID(), actorId, scope, requestKey, requestHash: hash(payload) }); }
const transitions: Record<OpinionStatus, OpinionStatus[]> = { received: ['verifying'], verifying: ['needs_info', 'consulting', 'action_confirmed', 'unresolved'], needs_info: ['verifying', 'consulting', 'unresolved'], consulting: ['verifying', 'needs_info', 'action_confirmed', 'unresolved'], action_confirmed: ['verifying'], unresolved: ['verifying'] };
function transition(from: OpinionStatus, to: OpinionStatus) { if (!transitions[from].includes(to)) throw new HttpError(409, '현재 상태에서 선택한 상태로 변경할 수 없습니다.', 'INVALID_TRANSITION'); }
function cartView(record: typeof cartItems.$inferSelect) { const { id, name, checked, version, createdAt, updatedAt } = record; return { id, name, checked, version, createdAt, updatedAt }; }

export function createDomain(db: Db, config: ServiceConfig) {
  return async function domain(request: Request, identity: Identity): Promise<Response | null> {
    const url = new URL(request.url); const path = url.pathname; const method = request.method;
    if (!/^\/api\/(cart(?:\/|$)|draft(?:\/|$)|attachments(?:\/|$)|opinions(?:\/|$)|operator(?:\/|$)|merchant(?:\/|$))/.test(path)) return null;
    if (!['GET', 'HEAD'].includes(method)) {
      const expectedAccount = request.headers.get('x-teumgil-account'); if (expectedAccount !== null && expectedAccount !== identity.id) throw new HttpError(403, '로그인 계정이 바뀌었습니다. 내용을 저장하기 전에 계정을 확인해 주세요.', 'ACCOUNT_CHANGED');
      if (request.headers.get('origin') !== new URL(config.baseUrl).origin || request.headers.get('sec-fetch-site') === 'cross-site') throw new HttpError(403, '같은 서비스 화면에서 다시 시도해 주세요.', 'INVALID_ORIGIN');
    }
    if (path === '/api/draft/generate' && method === 'POST') return json({ error: 'AI 정리는 아직 연결되지 않았어요. 직접 작성으로 계속할 수 있어요.', code: 'AI_UNAVAILABLE' }, 503);
    if (path === '/api/cart' && method === 'GET') return json({ items: (await db.select().from(cartItems).where(eq(cartItems.userId, identity.id)).orderBy(asc(cartItems.createdAt), asc(cartItems.id))).map(cartView) });
    if (path === '/api/cart' && method === 'POST') {
      const input = await body(request); const name = text(input.name, 'name', 100); const norm = normalized(name); if (!norm) bad('재료명을 입력해 주세요.', 'name');
      const result = await db.transaction(async tx => {
        await tx.select({ id: user.id }).from(user).where(eq(user.id, identity.id)).for('update');
        const [added] = await tx.insert(cartItems).values({ id: randomUUID(), userId: identity.id, name, normalizedName: norm }).onConflictDoNothing().returning();
        const [existing] = added ? [] : await tx.select().from(cartItems).where(and(eq(cartItems.userId, identity.id), eq(cartItems.normalizedName, norm)));
        return { item: cartView(added ?? existing), duplicate: !added };
      }); return json(result, result.duplicate ? 200 : 201);
    }
    const cart = /^\/api\/cart\/([^/]+)$/.exec(path);
    if (cart && ['PATCH', 'DELETE'].includes(method)) {
      const input = await body(request); const v = version(input.version);
      const result = await db.transaction(async tx => {
        await tx.select({ id: user.id }).from(user).where(eq(user.id, identity.id)).for('update');
        const [item] = await tx.select().from(cartItems).where(and(eq(cartItems.id, cart[1]), eq(cartItems.userId, identity.id))).for('update'); if (!item) missing(); if (item.version !== v) conflict();
        if (method === 'DELETE') { await tx.delete(cartItems).where(eq(cartItems.id, item.id)); return { deleted: true }; }
        const name = input.name === undefined ? item.name : text(input.name, 'name', 100); if (input.checked !== undefined && typeof input.checked !== 'boolean') bad('체크 상태를 확인해 주세요.', 'checked');
        const norm = normalized(name); const duplicate = await tx.select({ id: cartItems.id }).from(cartItems).where(and(eq(cartItems.userId, identity.id), eq(cartItems.normalizedName, norm)));
        if (duplicate.some(x => x.id !== item.id)) throw new HttpError(409, '같은 재료가 이미 있어요.', 'DUPLICATE_ITEM', { name: '같은 재료가 이미 있어요.' });
        const [updated] = await tx.update(cartItems).set({ name, normalizedName: norm, checked: name !== item.name ? false : (input.checked as boolean | undefined) ?? item.checked, version: v + 1, updatedAt: new Date() }).where(eq(cartItems.id, item.id)).returning(); return { item: cartView(updated) };
      }); return json(result);
    }
    if (path === '/api/draft' && method === 'GET') {
      const [draft] = await db.select({ version: opinionDrafts.version, content: opinionDrafts.content, updatedAt: opinionDrafts.updatedAt }).from(opinionDrafts).where(eq(opinionDrafts.userId, identity.id)); const hasContent = draft && (draft.content.marketId || draft.content.location || draft.content.situation || draft.content.title || draft.content.description || draft.content.observedAt || draft.content.request || draft.content.attachmentIds.length); return json({ draft: hasContent ? draft : null, version: draft?.version ?? 0 });
    }
    if (path === '/api/draft' && method === 'PUT') {
      const input = await body(request); const content = draftContent(input.content); const v = version(input.version);
      const result = await db.transaction(async tx => {
        await tx.select({ id: user.id }).from(user).where(eq(user.id, identity.id)).for('update');
        const [current] = await tx.select().from(opinionDrafts).where(eq(opinionDrafts.userId, identity.id)); if ((current?.version ?? 0) !== v) conflict();
        const [draft] = await tx.insert(opinionDrafts).values({ userId: identity.id, content, version: v + 1 }).onConflictDoUpdate({ target: opinionDrafts.userId, set: { content, version: v + 1, updatedAt: new Date() } }).returning(); return { draft: { content: draft.content, version: draft.version, updatedAt: draft.updatedAt } };
      }); return json(result);
    }
    if (path === '/api/attachments' && method === 'GET') return json({ attachments: await db.select(attachmentColumns).from(attachments).where(and(eq(attachments.userId, identity.id), isNull(attachments.opinionId))).orderBy(asc(attachments.createdAt)) });
    if (path === '/api/attachments' && method === 'POST') {
      const bytes = await boundedBytes(request, 2 * 1024 * 1024 + 64 * 1024);
      const form = await new Request(request.url, { method: 'POST', headers: request.headers, body: bytes }).formData().catch(() => bad('사진 파일을 확인해 주세요.'));
      const file = form.get('file'); if (!(file instanceof File) || file.size > 2 * 1024 * 1024 || file.size === 0) bad('사진은 JPEG·PNG·WebP 파일당 2MiB 이하여야 해요.', 'file');
      const uploadKey = key(form.get('requestId'));
      const originalBytes = Buffer.from(await file.arrayBuffer()); const uploadHash = createHash('sha256').update(originalBytes).digest('hex');
      let converted: Buffer, width: number, height: number;
      try {
        const image = sharp(originalBytes, { limitInputPixels: 16_000_000, failOn: 'warning', animated: false }); const metadata = await image.metadata();
        if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1 || !metadata.width || !metadata.height || metadata.width > 8000 || metadata.height > 8000) bad('JPEG·PNG·WebP 정지 사진만 사용할 수 있어요.', 'file');
        const result = await image.rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).timeout({ seconds: 5 }).toBuffer({ resolveWithObject: true });
        converted = result.data; width = result.info.width; height = result.info.height; if (converted.length > 2 * 1024 * 1024) bad('처리된 사진이 너무 커요. 작은 사진을 선택해 주세요.', 'file');
      } catch (error) { if (error instanceof HttpError) throw error; bad('사진을 읽을 수 없어요. 다른 사진을 선택하거나 사진 없이 계속해 주세요.', 'file'); }
      const attachment = await db.transaction(async tx => {
        await tx.select({ id: user.id }).from(user).where(eq(user.id, identity.id)).for('update');
        const [previous] = await tx.select().from(attachments).where(and(eq(attachments.userId, identity.id), eq(attachments.uploadKey, uploadKey)));
        if (previous) { if (previous.uploadHash !== uploadHash) throw new HttpError(409, '같은 업로드 번호의 사진이 달라졌어요.', 'IDEMPOTENCY_MISMATCH'); return { id: previous.id, mimeType: previous.mimeType, byteSize: previous.byteSize, width: previous.width, height: previous.height, createdAt: previous.createdAt }; }
        const staged = await tx.select({ id: attachments.id }).from(attachments).where(and(eq(attachments.userId, identity.id), isNull(attachments.opinionId)));
        if (staged.length >= 3) bad('작성 중인 사진은 최대 3개예요. 기존 사진을 제거해 주세요.', 'file');
        const [result] = await tx.insert(attachments).values({ id: randomUUID(), userId: identity.id, uploadKey, uploadHash, mimeType: 'image/webp', byteSize: converted.length, width, height, data: converted }).returning(); return { id: result.id, mimeType: result.mimeType, byteSize: result.byteSize, width: result.width, height: result.height, createdAt: result.createdAt };
      }); return json({ attachment }, 201);
    }
    const attachmentMatch = /^\/api\/attachments\/([^/]+)$/.exec(path);
    if (attachmentMatch && ['GET', 'DELETE'].includes(method)) {
      const [file] = await db.select().from(attachments).where(eq(attachments.id, attachmentMatch[1])); if (!file) missing();
      if (method === 'DELETE') {
        await db.transaction(async tx => {
          await tx.select({ id: user.id }).from(user).where(eq(user.id, identity.id)).for('update');
          const [current] = await tx.select({ id: attachments.id, opinionId: attachments.opinionId }).from(attachments).where(and(eq(attachments.id, file.id), eq(attachments.userId, identity.id))).for('update');
          if (!current || current.opinionId) missing();
          await tx.delete(attachments).where(eq(attachments.id, current.id));
        }); return json({ deleted: true });
      }
      if (file.userId !== identity.id) { if (!file.opinionId || identity.role !== 'operator') missing(); await ensureOperator(db, identity, await getOpinion(db, file.opinionId)); }
      return new Response(new Uint8Array(file.data), { headers: { 'Content-Type': file.mimeType, 'Content-Length': String(file.byteSize), 'Content-Disposition': 'inline; filename="attachment.webp"', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'" } });
    }
    if (path === '/api/opinions' && method === 'POST') {
      const input = await body(request); const content = draftContent(input.content, true); const requestKey = key(input.idempotencyKey); const requestHash = hash(content);
      const result = await db.transaction(async tx => {
        await tx.select({ id: user.id }).from(user).where(eq(user.id, identity.id)).for('update');
        const [existing] = await tx.select().from(opinions).where(and(eq(opinions.userId, identity.id), eq(opinions.requestKey, requestKey)));
        if (existing) { if (existing.requestHash !== requestHash) throw new HttpError(409, '이미 사용한 제출 번호의 내용이 달라졌어요.', 'IDEMPOTENCY_MISMATCH'); return { opinion: await citizenView(tx, existing), replayed: true }; }
        if (input.draftVersion !== undefined) { const [draft] = await tx.select().from(opinionDrafts).where(eq(opinionDrafts.userId, identity.id)); if ((draft?.version ?? 0) !== version(input.draftVersion)) conflict(); }
        const [market] = await tx.select().from(markets).where(eq(markets.id, content.marketId)); if (!market) bad('시장을 선택해 주세요.', 'marketId');
        if (content.attachmentIds.length) { const files = await tx.select({ id: attachments.id }).from(attachments).where(and(inArray(attachments.id, content.attachmentIds), eq(attachments.userId, identity.id), isNull(attachments.opinionId))).for('update'); if (files.length !== content.attachmentIds.length) bad('사진의 저장 상태를 다시 확인해 주세요.', 'attachmentIds'); }
        const { attachmentIds, ...values } = content;
        const [record] = await tx.insert(opinions).values({ id: randomUUID(), userId: identity.id, ...values, requestKey, requestHash, isSample: market.isSample }).returning();
        if (attachmentIds.length) await tx.update(attachments).set({ opinionId: record.id }).where(inArray(attachments.id, attachmentIds));
        await event(tx, record.id, identity.id, 'received', '틈길에 의견이 접수됐어요.', true, { status: 'received' }); if (input.draftVersion !== undefined) await tx.update(opinionDrafts).set({ content: { marketId: '', location: '', situation: '', observedAt: '', title: '', description: '', request: '', generationMode: 'manual', attachmentIds: [] }, version: sql`${opinionDrafts.version}+1`, updatedAt: new Date() }).where(eq(opinionDrafts.userId, identity.id)); return { opinion: await citizenView(tx, record), replayed: false };
      }); return json(result, result.replayed ? 200 : 201);
    }
    if (path === '/api/opinions' && method === 'GET') { const records = await db.select().from(opinions).where(eq(opinions.userId, identity.id)).orderBy(desc(opinions.createdAt)); return json({ opinions: await Promise.all(records.map(r => summary(db, r))) }); }
    const citizenMatch = /^\/api\/opinions\/([^/]+)(\/responses)?$/.exec(path);
    if (citizenMatch) {
      const record = await getOpinion(db, citizenMatch[1]); if (record.userId !== identity.id) missing();
      if (method === 'GET' && !citizenMatch[2]) return db.transaction(async tx => json({ opinion: await citizenView(tx, await getOpinion(tx, record.id)) }), { isolationLevel: 'repeatable read', accessMode: 'read only' });
      if (method === 'POST' && citizenMatch[2]) {
        const input = await body(request); const requestKey = key(input.requestId); const content = text(input.content, 'content'); const questionId = text(input.questionId, 'questionId', 100);
        await db.transaction(async tx => {
          await getOpinion(tx, record.id, true); const scope = 'response:' + record.id; if (await replay(tx, identity.id, scope, requestKey, input)) return;
          const [question] = await tx.select().from(opinionQuestions).where(and(eq(opinionQuestions.id, questionId), eq(opinionQuestions.opinionId, record.id))); if (!question) missing();
          const previous = await tx.select({ id: questionResponses.id }).from(questionResponses).where(eq(questionResponses.questionId, questionId)); if (previous.length) throw new HttpError(409, '이 질문에는 이미 답변했어요. 추가 질문을 기다려 주세요.', 'QUESTION_ANSWERED');
          await tx.insert(questionResponses).values({ id: randomUUID(), questionId, actorId: identity.id, content }); await event(tx, record.id, identity.id, 'citizen-response', '추가 질문에 답변을 남겼어요.', true);
          await tx.update(opinions).set({ version: sql`${opinions.version}+1`, updatedAt: new Date() }).where(eq(opinions.id, record.id)); await receipt(tx, identity.id, scope, requestKey, input);
        }); return db.transaction(async tx => json({ opinion: await citizenView(tx, await getOpinion(tx, record.id)) }), { isolationLevel: 'repeatable read', accessMode: 'read only' });
      }
    }
    if (path.startsWith('/api/operator/')) {
      role(identity, 'operator');
      if (path === '/api/operator/opinions' && method === 'GET') {
        const assigned = await db.select({ market: markets }).from(operatorMarkets).innerJoin(markets, eq(markets.id, operatorMarkets.marketId)).where(eq(operatorMarkets.userId, identity.id)); const ids = assigned.map(x => x.market.id);
        const marketId = url.searchParams.get('marketId'); if (marketId && !ids.includes(marketId)) missing(); const status = url.searchParams.get('status'); if (status && !(status in STATUS_LABELS)) bad('상태를 확인해 주세요.', 'status');
        const q = text(url.searchParams.get('q') ?? '', 'q', 100, false); const pattern = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
        const records = ids.length ? await db.select().from(opinions).where(and(inArray(opinions.marketId, marketId ? [marketId] : ids), status ? eq(opinions.status, status as OpinionStatus) : undefined, q ? or(ilike(opinions.id, pattern), ilike(opinions.title, pattern)) : undefined)).orderBy(desc(opinions.createdAt)) : [];
        return json({ opinions: await Promise.all(records.map(r => summary(db, r))), markets: assigned.map(x => x.market) });
      }
      const match = /^\/api\/operator\/opinions\/([^/]+)(\/actions)?$/.exec(path);
      if (match) {
        const record = await getOpinion(db, match[1]); await ensureOperator(db, identity, record);
        if (method === 'GET' && !match[2]) return db.transaction(async tx => { const latest = await getOpinion(tx, record.id); await ensureOperator(tx, identity, latest); return json({ opinion: await operatorView(tx, latest) }); }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
        if (method === 'POST' && match[2]) {
          const input = await body(request);
          const result = await db.transaction(async tx => {
            await activeRole(tx, identity, 'operator');
            const current = await getOpinion(tx, record.id, true); await ensureOperator(tx, identity, current); const requestKey = key(input.requestId); const scope = 'operator:' + current.id;
            if (await replay(tx, identity.id, scope, requestKey, input)) return { replayed: true }; if (current.version !== version(input.version)) conflict();
            const kind = text(input.kind, 'kind', 40); let nextStatus = current.status; const content = kind === 'transmit' ? '' : text(input.content, 'content'); const details: Record<string, string> = {};
            if (kind === 'note' || kind === 'publish') {
              if (input.correctsId) { const correctsId = text(input.correctsId, 'correctsId', 100); const [original] = await tx.select().from(opinionEvents).where(and(eq(opinionEvents.id, correctsId), eq(opinionEvents.opinionId, current.id), eq(opinionEvents.kind, kind))); if (!original) bad('정정할 기록을 찾을 수 없어요.', 'correctsId'); details.correctsId = correctsId; }
              await event(tx, current.id, identity.id, kind, content, kind === 'publish', details);
            } else if (kind === 'question') {
              if (current.status !== 'needs_info') transition(current.status, 'needs_info'); nextStatus = 'needs_info';
              await tx.insert(opinionQuestions).values({ id: randomUUID(), opinionId: current.id, actorId: identity.id, content }); await event(tx, current.id, identity.id, kind, content, true);
            } else if (kind === 'transmit') {
              if (current.status !== 'consulting') transition(current.status, 'consulting'); nextStatus = 'consulting'; const merchantId = text(input.merchantId, 'merchantId', 100); const storeId = text(input.storeId, 'storeId', 100);
              const [target] = await tx.select({ id: merchantStores.id }).from(merchantStores).innerJoin(stores, eq(stores.id, merchantStores.storeId)).innerJoin(user, eq(user.id, merchantStores.userId)).where(and(eq(merchantStores.userId, merchantId), eq(merchantStores.storeId, storeId), eq(stores.marketId, current.marketId), eq(user.role, 'merchant'))); if (!target) bad('이 시장에 연결된 상인·점포를 선택해 주세요.', 'merchantId');
              const relationBasis = text(input.relationBasis, 'relationBasis', 2000); const transmissionId = randomUUID();
              await tx.insert(transmissions).values({ id: transmissionId, opinionId: current.id, actorId: identity.id, merchantId, storeId, relationBasis, summary: text(input.summary, 'summary'), location: text(input.location, 'location', 500) }); await event(tx, current.id, identity.id, kind, relationBasis, false, { transmissionId });
            } else if (kind === 'status') {
              const status = text(input.status, 'status', 30) as OpinionStatus; if (!(status in STATUS_LABELS)) bad('상태를 확인해 주세요.', 'status'); transition(current.status, status);
              if (status === 'needs_info' && !(await tx.select({ id: opinionQuestions.id }).from(opinionQuestions).where(eq(opinionQuestions.opinionId, current.id))).length) bad('추가 질문을 먼저 작성해 주세요.');
              if (status === 'consulting' && !(await tx.select({ id: transmissions.id }).from(transmissions).where(eq(transmissions.opinionId, current.id))).length) bad('상인 전달을 먼저 작성해 주세요.');
              if (status === 'action_confirmed') details.occurredAt = occurred(input.occurredAt); nextStatus = status; await event(tx, current.id, identity.id, 'status-reason', content, false, details);
            } else if (kind === 'followup-plan') {
              details.scheduledAt = time(input.scheduledAt, 'scheduledAt'); details.assignee = text(input.assignee, 'assignee', 100); await event(tx, current.id, identity.id, kind, content, true, details);
            } else if (kind === 'followup-result') {
              details.occurredAt = occurred(input.occurredAt); details.planId = text(input.planId, 'planId', 100);
              const [plan] = await tx.select().from(opinionEvents).where(and(eq(opinionEvents.id, details.planId), eq(opinionEvents.opinionId, current.id), eq(opinionEvents.kind, 'followup-plan'))); if (!plan) bad('후속 확인 계획을 선택해 주세요.', 'planId'); await event(tx, current.id, identity.id, kind, content, true, details);
            } else if (kind === 'official-guidance') await event(tx, current.id, identity.id, kind, content, true);
            else bad('지원하지 않는 작업입니다.', 'kind');
            if (nextStatus !== current.status) await event(tx, current.id, identity.id, 'status', STATUS_LABELS[nextStatus], true, { status: nextStatus, previousStatus: current.status });
            await tx.update(opinions).set({ status: nextStatus, version: current.version + 1, updatedAt: new Date() }).where(eq(opinions.id, current.id)); await receipt(tx, identity.id, scope, requestKey, input); return { replayed: false };
          }); return db.transaction(async tx => json({ opinion: await operatorView(tx, await getOpinion(tx, record.id)), ...result }), { isolationLevel: 'repeatable read', accessMode: 'read only' });
        }
      }
    }
    if (path.startsWith('/api/merchant/')) {
      role(identity, 'merchant'); const allowed = await db.select({ storeId: merchantStores.storeId }).from(merchantStores).where(eq(merchantStores.userId, identity.id)); const ids = allowed.map(x => x.storeId);
      if (path === '/api/merchant/transmissions' && method === 'GET') {
        const records = ids.length ? await db.select().from(transmissions).where(and(eq(transmissions.merchantId, identity.id), inArray(transmissions.storeId, ids))).orderBy(desc(transmissions.createdAt)) : []; return json({ transmissions: await Promise.all(records.map(t => transmissionView(db, t))) });
      }
      const match = /^\/api\/merchant\/transmissions\/([^/]+)(\/replies)?$/.exec(path);
      if (match) {
        const [record] = await db.select().from(transmissions).where(and(eq(transmissions.id, match[1]), eq(transmissions.merchantId, identity.id))); if (!record || !ids.includes(record.storeId)) missing();
        if (method === 'GET' && !match[2]) return db.transaction(async tx => { const [latest] = await tx.select().from(transmissions).where(eq(transmissions.id, record.id)); return json({ transmission: await transmissionView(tx, latest) }); }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
        if (method === 'POST' && match[2]) {
          const input = await body(request); const requestKey = key(input.requestId);
          const result = await db.transaction(async tx => {
            await activeRole(tx, identity, 'merchant');
            const [scopeGrant] = await tx.select({ id: merchantStores.id }).from(merchantStores).where(and(eq(merchantStores.userId, identity.id), eq(merchantStores.storeId, record.storeId))); if (!scopeGrant) missing();
            await getOpinion(tx, record.opinionId, true); const [current] = await tx.select().from(transmissions).where(eq(transmissions.id, record.id)).for('update'); const scope = 'reply:' + record.id;
            if (await replay(tx, identity.id, scope, requestKey, input)) return { replayed: true }; if (current.version !== version(input.version)) conflict();
            const stance = text(input.stance, 'stance'); if (typeof input.noAlternative !== 'boolean') bad('대안 여부를 선택해 주세요.', 'noAlternative'); const alternative = text(input.alternative, 'alternative', 3000, !input.noAlternative); if (input.noAlternative && alternative) bad('대안 없음과 대안 내용을 함께 저장할 수 없어요.', 'alternative');
            let correctsId: string | null = null; if (input.correctsId) { correctsId = text(input.correctsId, 'correctsId', 100); const [original] = await tx.select().from(merchantReplies).where(and(eq(merchantReplies.id, correctsId), eq(merchantReplies.transmissionId, current.id), eq(merchantReplies.actorId, identity.id))); if (!original) bad('정정할 답변을 확인해 주세요.', 'correctsId'); }
            await tx.insert(merchantReplies).values({ id: randomUUID(), transmissionId: current.id, actorId: identity.id, stance, alternative: alternative || null, noAlternative: input.noAlternative, correctsId });
            await tx.update(transmissions).set({ version: current.version + 1 }).where(eq(transmissions.id, current.id)); await tx.update(opinions).set({ version: sql`${opinions.version}+1`, updatedAt: new Date() }).where(eq(opinions.id, current.opinionId));
            await event(tx, current.opinionId, identity.id, 'merchant-reply', '상인이 답변을 남겼습니다.', false, { transmissionId: current.id }); await receipt(tx, identity.id, scope, requestKey, input); return { replayed: false };
          }); return db.transaction(async tx => { const [latest] = await tx.select().from(transmissions).where(eq(transmissions.id, record.id)); return json({ transmission: await transmissionView(tx, latest), ...result }); }, { isolationLevel: 'repeatable read', accessMode: 'read only' });
        }
      }
    }
    const response = json({ error: '지원하지 않는 요청입니다.', code: 'METHOD_NOT_ALLOWED' }, 405); response.headers.set('Allow', 'GET, POST, PUT, PATCH, DELETE'); return response;
  };
}
