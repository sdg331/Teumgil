/** Shared HTTP contracts. All dates are ISO strings; protected routes require the DB session. */
export type Role = 'citizen' | 'operator' | 'merchant';
export type OpinionStatus = 'received' | 'verifying' | 'needs_info' | 'consulting' | 'action_confirmed' | 'unresolved';
export const STATUS_LABELS: Record<OpinionStatus, string> = { received: '틈길 접수', verifying: '확인 중', needs_info: '추가 정보 필요', consulting: '협의 중', action_confirmed: '확인된 조치 있음', unresolved: '확인 불가 / 대안 미확보' };
export interface Identity { id: string; name: string; email: string; emailVerified: boolean; role: Role }
export interface Market { id: string; name: string; locationDescription: string | null; isSample: boolean }
export interface Store { id: string; marketId: string; name: string; locationDescription: string | null; usualItems: string[]; source: string | null; checkedAt: string | null; isSample: boolean; inventory: null; price: null }
export interface ApiError { error: string; code?: string; fields?: Record<string, string>; requestId?: string }
export interface CartItem { id: string; name: string; checked: boolean; version: number; createdAt: string; updatedAt: string }
/** GET /api/cart => {items}; POST {name} => {item,duplicate}; PATCH /:id {version,name?,checked?} => {item}; DELETE /:id {version} => {deleted:true}. */
export interface CartResponse { items: CartItem[] }
export interface DraftContent { marketId: string; location: string; situation: string; observedAt: string; title: string; description: string; request: string; generationMode: 'manual'; attachmentIds: string[] }
/** GET /api/draft => {draft: null | OpinionDraft, version:number} (use envelope version when draft=null; revision survives submission to prevent stale-tab ABA); PUT {version: number (0 initially),content:DraftContent} => {draft}. */
export interface OpinionDraft { version: number; content: DraftContent; updatedAt: string }
/** GET /api/attachments => {attachments} (own staged only); POST multipart file + requestId => {attachment}; same key retries return same attachment; GET /api/attachments/:id private image; DELETE /:id only unattached own upload. */
export interface Attachment { id: string; mimeType: string; byteSize: number; width: number; height: number; createdAt: string }
/** POST /api/opinions {idempotencyKey,content:DraftContent,draftVersion?:number} => {opinion:CitizenOpinion,replayed:boolean}; same key+different content =>409. */
export interface OpinionSummary { id: string; marketId: string; marketName: string; title: string; location: string; status: OpinionStatus; createdAt: string; updatedAt: string; version: number; isSample: boolean }
export interface QuestionResponse { id: string; content: string; createdAt: string }
export interface OpinionQuestion { id: string; content: string; createdAt: string; responses: QuestionResponse[] }
export interface OpinionEvent { id: string; kind: string; content: string; createdAt: string; status?: OpinionStatus; scheduledAt?: string; occurredAt?: string; correctsId?: string; assignee?: string; actorName?:string; planId?:string }
export interface CitizenOpinion extends OpinionSummary { original: {location:string;situation:string;observedAt:string}; submission: {title:string;description:string;request:string;generationMode:'manual'}; attachments: Attachment[]; questions: OpinionQuestion[]; timeline: OpinionEvent[] }
/** GET /api/opinions => {opinions:OpinionSummary[]}; GET /:id =>{opinion:CitizenOpinion}; POST /:id/responses {questionId,content,requestId} => {opinion}. */
export interface MerchantReply { id: string; stance: string; alternative: string | null; noAlternative: boolean; createdAt: string; correctsId: string | null }
export interface Transmission { id: string; opinionId: string; marketId: string; marketName: string; storeId: string; storeName: string; summary: string; location: string; createdAt: string; version: number; replies: MerchantReply[] }
export interface OperatorTransmission extends Transmission { merchantId: string; merchantName: string; relationBasis: string }
export interface OperatorOpinion extends CitizenOpinion { internalHistory: OpinionEvent[]; transmissions: OperatorTransmission[]; merchantOptions: MerchantOption[] }
export interface MerchantOption { merchantId: string; merchantName: string; storeId: string; storeName: string; marketId: string }
/** GET /api/operator/opinions?marketId=&status=&q= => {opinions,markets}; GET /:id => {opinion:OperatorOpinion}. */
export type OperatorAction = {version:number;requestId:string} & (
 | {kind:'note';content:string;correctsId?:string}
 | {kind:'question';content:string}
 | {kind:'status';status:OpinionStatus;content:string;occurredAt?:string}
 | {kind:'transmit';merchantId:string;storeId:string;relationBasis:string;summary:string;location:string}
 | {kind:'publish';content:string;correctsId?:string}
 | {kind:'followup-plan';content:string;scheduledAt:string;assignee:string}
 | {kind:'followup-result';content:string;occurredAt:string;planId:string}
 | {kind:'official-guidance';content:string}
);
/** POST /api/operator/opinions/:id/actions OperatorAction => {opinion:OperatorOpinion,replayed:boolean}. All mutations increment opinion version. */
/** GET /api/merchant/transmissions =>{transmissions:Transmission[]}; GET /:id =>{transmission:Transmission}. */
export interface MerchantReplyInput { requestId:string;version:number;stance:string;alternative?:string;noAlternative:boolean;correctsId?:string }
/** POST /api/merchant/transmissions/:id/replies MerchantReplyInput =>{transmission:Transmission,replayed:boolean}. Replies never change opinion status or citizen publication. */
