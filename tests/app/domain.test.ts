import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';
import { eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { createApplication } from '../../src/server/application.ts';
import { assignRole } from '../../src/server/administration.ts';
import { readConfig } from '../../src/server/config.ts';
import { seedSampleCatalog } from '../../src/server/seed.ts';
import { attachments, opinionEvents, opinionQuestions, opinions, roleAudits } from '../../src/server/schema.ts';
import type { DraftContent } from '../../src/lib/contracts.ts';

const baseUrl='http://localhost:3000', suffix=randomUUID(), password='Synthetic-journey-password-42!';
let requestIp=0;
let app:Awaited<ReturnType<typeof createApplication>>;
type Person={id:string;cookie:string;email:string};
let citizen:Person, stranger:Person, operator:Person, outsideOperator:Person, merchant:Person, outsideMerchant:Person;
function req(path:string,person?:Person,method='GET',data?:unknown,origin=baseUrl) { return new Request(baseUrl+path,{method,headers:{Origin:origin,'X-Forwarded-For':'198.51.100.'+(++requestIp%250+1),'Content-Type':'application/json',...(person?{Cookie:person.cookie}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})}); }
async function call(path:string,person?:Person,method='GET',data?:unknown,status=200) {const response=await app.handle(req(path,person,method,data));assert.equal(response.status,status,await response.clone().text());return response.json();}
async function signup(label:string):Promise<Person> {const email=label+'-'+suffix+'@example.invalid';const response=await app.handle(req('/api/auth/sign-up/email',undefined,'POST',{name:label,email,password}));assert.equal(response.status,200,await response.clone().text());const result=await response.json();return {id:result.user.id,email,cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};}
async function signin(person:Person){const response=await app.handle(req('/api/auth/sign-in/email',undefined,'POST',{email:person.email,password}));assert.equal(response.status,200);person.cookie=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
function content(extra:Partial<DraftContent>={}):DraftContent{return {marketId:'sample-haetsal',location:'가상 북문 앞',situation:'원문 비공개 내용',observedAt:'어제 저녁',title:'보행 공간 확인 요청',description:'가상 북문 앞 통행 상황을 확인해 주세요.',request:'',generationMode:'manual',attachmentIds:[],...extra};}
async function submit(person=citizen,extra:Partial<DraftContent>={}) {return (await call('/api/opinions',person,'POST',{idempotencyKey:randomUUID(),content:content(extra)},201)).opinion;}
async function action(id:string,data:Record<string,unknown>,person=operator) {const {opinion}=await call('/api/operator/opinions/'+id,person);return (await call('/api/operator/opinions/'+id+'/actions',person,'POST',{version:opinion.version,requestId:randomUUID(),...data})).opinion;}
async function upload(person:Person,bytes:Uint8Array,name='photo.png') {const form=new FormData();form.set('requestId',randomUUID());form.set('file',new File([new Uint8Array(bytes)],name,{type:'image/png'}));return app.handle(new Request(baseUrl+'/api/attachments',{method:'POST',headers:{Origin:baseUrl,Cookie:person.cookie},body:form}));}
before(async()=>{
 app=await createApplication(readConfig({DATABASE_URL:process.env.TEUMGIL_TEST_DATABASE_URL??'pglite://',BETTER_AUTH_URL:baseUrl,BETTER_AUTH_SECRET:randomBytes(48).toString('base64url'),NODE_ENV:'test'}));await app.connection.migrate();await seedSampleCatalog(app.connection.db);
 citizen=await signup('journey-citizen');stranger=await signup('journey-other');operator=await signup('journey-operator');outsideOperator=await signup('journey-other-operator');merchant=await signup('journey-merchant');outsideMerchant=await signup('journey-other-merchant');
 for(const [person,role,marketIds,storeIds] of [[operator,'operator',['sample-haetsal'],[]],[outsideOperator,'operator',['sample-gangbyeon'],[]],[merchant,'merchant',[],['sample-pureun']],[outsideMerchant,'merchant',[],['sample-hankki']]] as const){await assignRole(app.connection.db,{userId:person.id,role,marketIds:[...marketIds],storeIds:[...storeIds],actor:'domain-test',reason:'가상 테스트 배정'});await signin(person);}
});
after(async()=>{await app?.connection.close();});

test('cart normalizes Unicode duplicates and protects ownership, rename resets check, stale mutation conflicts',async()=>{
 const name='Ａ   대파 '+suffix;const added=await call('/api/cart',citizen,'POST',{name},201);
 const duplicate=await call('/api/cart',citizen,'POST',{name:'A 대파 '+suffix});assert.equal(duplicate.duplicate,true);assert.equal(duplicate.item.id,added.item.id);
 await call('/api/cart/'+added.item.id,stranger,'PATCH',{version:1,checked:true},404);
 const checked=await call('/api/cart/'+added.item.id,citizen,'PATCH',{version:1,checked:true});assert.equal(checked.item.checked,true);
 await call('/api/cart/'+added.item.id,citizen,'PATCH',{version:1,name:'old'},409);
 const renamed=await call('/api/cart/'+added.item.id,citizen,'PATCH',{version:2,name:'새 대파 '+suffix});assert.equal(renamed.item.checked,false);assert.equal(renamed.item.id,added.item.id);
 await call('/api/cart/'+added.item.id,citizen,'DELETE',{version:3});assert.ok(!(await call('/api/cart',citizen)).items.some((i:{id:string})=>i.id===added.item.id));
});

test('simultaneous cart adds create one row; malformed writes and cross-site requests do not mutate',async()=>{
 const name='동시추가 '+suffix;const results=await Promise.all([app.handle(req('/api/cart',citizen,'POST',{name})),app.handle(req('/api/cart',citizen,'POST',{name}))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,201]);
 assert.equal((await app.handle(req('/api/cart',citizen,'POST',{name:'악성'},'https://foreign.invalid'))).status,403);
 assert.equal((await app.handle(req('/api/cart',citizen,'POST',{name:'공백오리진'},''))).status,403);
 await call('/api/cart',citizen,'POST',{name:'   '},400);await call('/api/cart',undefined,'POST',{name:'무권한'},401);
});

test('draft versions protect multiple devices and final submission is persisted once with original and edit separated',async()=>{
 const first=await call('/api/draft',citizen,'PUT',{version:0,content:content()});assert.equal(first.draft.version,1);
 await call('/api/draft',citizen,'PUT',{version:0,content:content({situation:'덮어쓰기'})},409);
 assert.equal((await call('/api/draft',stranger)).draft,null);
 const payload={idempotencyKey:randomUUID(),draftVersion:1,content:content()};const submitted=await call('/api/opinions',citizen,'POST',payload,201);const replayed=await call('/api/opinions',citizen,'POST',payload);
 assert.equal(replayed.opinion.id,submitted.opinion.id);assert.equal(replayed.replayed,true);assert.equal(replayed.opinion.timeline.length,1);assert.equal(replayed.opinion.original.situation,'원문 비공개 내용');assert.notEqual(replayed.opinion.submission.description,replayed.opinion.original.situation);assert.equal(replayed.opinion.original.observedAt,'어제 저녁');assert.equal((await call('/api/draft',citizen)).draft,null);
 await call('/api/opinions',citizen,'POST',{...payload,content:content({title:'다른내용'})},409);
});

test('opinion and operator scopes reject guessed IDs and client roles',async()=>{
 const opinion=await submit();await call('/api/opinions/'+opinion.id,stranger,'GET',undefined,404);await call('/api/opinions/'+opinion.id,undefined,'GET',undefined,401);await call('/api/operator/opinions/'+opinion.id,citizen,'GET',undefined,403);await call('/api/operator/opinions/'+opinion.id,outsideOperator,'GET',undefined,404);
 const list=await call('/api/operator/opinions?marketId=sample-gangbyeon',outsideOperator);assert.ok(!list.opinions.some((o:{id:string})=>o.id===opinion.id));await call('/api/operator/opinions?marketId=sample-haetsal',outsideOperator,'GET',undefined,404);
});

test('full citizen/operator/merchant journey separates question, reply, state and citizen publication',async()=>{
 const submitted=await submit();let opinion=await action(submitted.id,{kind:'status',status:'verifying',content:'운영자 확인 시작'});
 opinion=await action(opinion.id,{kind:'note',content:'비공개 내부 메모 4321'});
 opinion=await action(opinion.id,{kind:'question',content:'통행이 어려웠던 구간을 알려 주세요.'});assert.equal(opinion.status,'needs_info');
 const response={questionId:opinion.questions[0].id,content:'가상 북문 앞이에요.',requestId:randomUUID()};await call('/api/opinions/'+opinion.id+'/responses',citizen,'POST',response);await call('/api/opinions/'+opinion.id+'/responses',citizen,'POST',response);
 opinion=(await call('/api/operator/opinions/'+opinion.id,operator)).opinion;assert.equal(opinion.status,'needs_info');assert.equal(opinion.questions[0].responses.length,1);
 opinion=await action(opinion.id,{kind:'transmit',merchantId:merchant.id,storeId:'sample-pureun',relationBasis:'관계 확인 근거 비공개',summary:'가상 구간 상황과 가능한 대안을 알려 주세요.',location:'가상 북문'});assert.equal(opinion.status,'consulting');
 const transmission=opinion.transmissions[0];const merchantView=await call('/api/merchant/transmissions/'+transmission.id,merchant);assert.equal(merchantView.transmission.opinionId,opinion.id);assert.ok(!JSON.stringify(merchantView).includes('원문 비공개'));assert.ok(!JSON.stringify(merchantView).includes('관계 확인 근거'));assert.ok(!JSON.stringify(merchantView).includes('4321'));
 await call('/api/merchant/transmissions/'+transmission.id,outsideMerchant,'GET',undefined,404);
 const reply={requestId:randomUUID(),version:1,stance:'상인 답변 비공개 9876',noAlternative:true};await call('/api/merchant/transmissions/'+transmission.id+'/replies',merchant,'POST',reply);await call('/api/merchant/transmissions/'+transmission.id+'/replies',merchant,'POST',reply);
 opinion=(await call('/api/operator/opinions/'+opinion.id,operator)).opinion;assert.equal(opinion.status,'consulting');assert.equal(opinion.transmissions[0].replies.length,1);assert.equal(opinion.transmissions[0].replies[0].noAlternative,true);
 const before=await call('/api/opinions/'+opinion.id,citizen);assert.ok(!JSON.stringify(before).includes('9876'));assert.ok(!JSON.stringify(before).includes('4321'));assert.equal(before.opinion.transmissions,undefined);
 opinion=await action(opinion.id,{kind:'publish',content:'상황을 확인했고 현재 대안을 협의하고 있어요.'});const published=await call('/api/opinions/'+opinion.id,citizen);assert.ok(JSON.stringify(published).includes('상황을 확인했고'));assert.ok(!JSON.stringify(published).includes('9876'));
 opinion=await action(opinion.id,{kind:'official-guidance',content:'공식 민원은 해당 창구에서 별도로 신청할 수 있어요.'});assert.equal(opinion.status,'consulting');
 opinion=await action(opinion.id,{kind:'status',status:'unresolved',content:'현재 대안을 확보하지 못함'});assert.equal(opinion.status,'unresolved');
 opinion=await action(opinion.id,{kind:'status',status:'verifying',content:'추가 정보가 도착해 다시 확인'});assert.equal(opinion.status,'verifying');
});

test('operator writes are idempotent and stale edits cannot overwrite newer work; invalid transitions leave history intact',async()=>{
 const opinion=await submit();const path='/api/operator/opinions/'+opinion.id+'/actions';const payload={version:1,requestId:randomUUID(),kind:'status',status:'verifying',content:'확인 시작'};
 const first=await call(path,operator,'POST',payload);const repeat=await call(path,operator,'POST',payload);assert.equal(first.opinion.version,repeat.opinion.version);assert.equal(repeat.replayed,true);
 await call(path,operator,'POST',{...payload,requestId:randomUUID(),content:'오래된 변경'},409);
 await call(path,operator,'POST',{...payload,content:'같은 번호 다른 내용'},409);
 await call(path,operator,'POST',{version:2,requestId:randomUUID(),kind:'status',status:'received',content:'잘못된 전이'},409);
 const latest=await call('/api/operator/opinions/'+opinion.id,operator);assert.equal(latest.opinion.status,'verifying');assert.equal(latest.opinion.version,2);
});

test('followup plans are distinct from actual results and corrections retain original publications',async()=>{
 let opinion=await submit();opinion=await action(opinion.id,{kind:'followup-plan',content:'다시 현장을 확인할 예정',assignee:'가상 담당자',scheduledAt:'2026-11-03T03:00:00.000Z'});
 const plan=opinion.timeline.find((e:{kind:string})=>e.kind==='followup-plan');assert.equal(plan.occurredAt,undefined);assert.equal(opinion.status,'received');
 opinion=await action(opinion.id,{kind:'followup-result',content:'가상 확인 결과',planId:plan.id,occurredAt:'2026-10-29T03:00:00.000Z'});assert.equal(opinion.timeline.find((e:{kind:string})=>e.kind==='followup-result').planId,plan.id);
 opinion=await action(opinion.id,{kind:'publish',content:'초기 게시'});const post=opinion.timeline.find((e:{kind:string})=>e.kind==='publish');opinion=await action(opinion.id,{kind:'publish',content:'정정 게시',correctsId:post.id});assert.equal(opinion.timeline.filter((e:{kind:string})=>e.kind==='publish').length,2);
});

test('transaction rollback removes the question and preserves status when event storage fails',async()=>{
 const opinion=await submit();await action(opinion.id,{kind:'status',status:'verifying',content:'확인 시작'});const marker='rollback-'+suffix;const trigger='test_failure_'+suffix.replaceAll('-','');
 await app.connection.db.execute(sql.raw(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.content = '${marker}' THEN RAISE EXCEPTION 'synthetic storage failure'; END IF; RETURN NEW; END $$`));
 await app.connection.db.execute(sql.raw(`CREATE TRIGGER ${trigger} BEFORE INSERT ON opinion_events FOR EACH ROW EXECUTE FUNCTION ${trigger}()`));
 try{await assert.rejects(action(opinion.id,{kind:'question',content:marker}));const [saved]=await app.connection.db.select().from(opinions).where(eq(opinions.id,opinion.id));assert.equal(saved.status,'verifying');assert.equal(saved.version,2);assert.equal((await app.connection.db.select().from(opinionQuestions).where(eq(opinionQuestions.opinionId,opinion.id))).length,0);}finally{await app.connection.db.execute(sql.raw(`DROP TRIGGER ${trigger} ON opinion_events`));await app.connection.db.execute(sql.raw(`DROP FUNCTION ${trigger}()`));}
});

test('attachments decode, strip metadata, stay private, reject forged data and attach only to their owner',async()=>{
 const png=await sharp({create:{width:20,height:20,channels:3,background:'#126B5B'}}).withExif({IFD0:{Artist:'Sensitive synthetic marker'}}).png().toBuffer();const uploaded=await upload(citizen,png);assert.equal(uploaded.status,201,await uploaded.clone().text());const {attachment}=await uploaded.json();assert.equal(attachment.mimeType,'image/webp');assert.equal(attachment.data,undefined);
 const own=await app.handle(req('/api/attachments/'+attachment.id,citizen));assert.equal(own.status,200);const metadata=await sharp(Buffer.from(await own.arrayBuffer())).metadata();assert.equal(metadata.exif,undefined);assert.equal(metadata.width,20);assert.equal(own.headers.get('Cache-Control'),'private, no-store');
 await call('/api/attachments/'+attachment.id,stranger,'GET',undefined,404);await call('/api/attachments/'+attachment.id,merchant,'GET',undefined,404);
 await call('/api/opinions',stranger,'POST',{idempotencyKey:randomUUID(),content:content({attachmentIds:[attachment.id]})},400);
 const opinion=await submit(citizen,{attachmentIds:[attachment.id]});assert.equal(opinion.attachments[0].id,attachment.id);assert.equal((await app.handle(req('/api/attachments/'+attachment.id,operator))).status,200);await call('/api/attachments/'+attachment.id,outsideOperator,'GET',undefined,404);await call('/api/attachments/'+attachment.id,citizen,'DELETE',{},404);
 assert.equal((await upload(stranger,new TextEncoder().encode('<svg onload="evil()"/>'),'fake.png')).status,400);
 assert.equal((await upload(stranger,new Uint8Array(2*1024*1024+1))).status,400);
 const files=[];for(let i=0;i<3;i++){const r=await upload(stranger,png);assert.equal(r.status,201);files.push((await r.json()).attachment.id);}assert.equal((await upload(stranger,png)).status,400);for(const id of files)await call('/api/attachments/'+id,stranger,'DELETE',{});
 const [stored]=await app.connection.db.select().from(attachments).where(eq(attachments.id,attachment.id));assert.equal(stored.opinionId,opinion.id);
});

test('role revocation is audited, clears scope and invalidates existing sessions',async()=>{
 const person=await signup('revoke-operator');await assignRole(app.connection.db,{userId:person.id,role:'operator',marketIds:['sample-haetsal'],storeIds:[],actor:'test administrator',reason:'배정'});await signin(person);assert.equal((await app.handle(req('/api/operator/opinions',person))).status,200);
 await assignRole(app.connection.db,{userId:person.id,role:'citizen',marketIds:[],storeIds:[],actor:'test administrator',reason:'회수'});assert.equal((await app.handle(req('/api/operator/opinions',person))).status,401);await signin(person);assert.equal((await app.handle(req('/api/operator/opinions',person))).status,403);assert.equal((await app.connection.db.select().from(roleAudits).where(eq(roleAudits.subjectId,person.id))).length,2);
});

test('AI unavailability is explicit and does not create any opinion or history',async()=>{
 const before=(await call('/api/opinions',stranger)).opinions.length;const response=await call('/api/draft/generate',stranger,'POST',{content:content()},503);assert.equal(response.code,'AI_UNAVAILABLE');assert.equal((await call('/api/opinions',stranger)).opinions.length,before);assert.ok((await app.connection.db.select().from(opinionEvents)).length>0);
});

test('upload retry IDs survive lost responses and staged inventory can be recovered without duplicate files',async()=>{
 const png=await sharp({create:{width:12,height:12,channels:3,background:'#ff0000'}}).png().toBuffer();const requestId=randomUUID();
 async function attempt(bytes:Buffer){const form=new FormData();form.set('requestId',requestId);form.set('file',new File([new Uint8Array(bytes)],'recovery.png'));return app.handle(new Request(baseUrl+'/api/attachments',{method:'POST',headers:{Origin:baseUrl,Cookie:stranger.cookie},body:form}));}
 const first=await attempt(png), retry=await attempt(png);assert.equal(first.status,201);assert.equal(retry.status,201);const one=(await first.json()).attachment,two=(await retry.json()).attachment;assert.equal(one.id,two.id);
 const staged=await call('/api/attachments',stranger);assert.equal(staged.attachments.filter((x:{id:string})=>x.id===one.id).length,1);assert.equal(staged.attachments[0].data,undefined);
 const other=await sharp({create:{width:12,height:12,channels:3,background:'#00ff00'}}).png().toBuffer();assert.equal((await attempt(other)).status,409);await call('/api/attachments/'+one.id,stranger,'DELETE',{});
});

test('stale rendered account is rejected atomically and original input keeps meaningful spacing',async()=>{
 const stale=req('/api/draft',stranger,'PUT',{version:0,content:content()});stale.headers.set('X-Teumgil-Account',citizen.id);const response=await app.handle(stale);assert.equal(response.status,403);assert.equal((await response.json()).code,'ACCOUNT_CHANGED');assert.equal((await call('/api/draft',stranger)).draft,null);
 const original='  첫 줄\n  둘째 줄  ';const opinion=await submit(citizen,{situation:original,location:'  가상 북문  ',observedAt:' 오후 무렵 '});assert.equal(opinion.original.situation,original);assert.equal(opinion.original.location,'  가상 북문  ');assert.equal(opinion.original.observedAt,' 오후 무렵 ');
});

test('future actual verification timestamps and metadata/pixel resource bombs are refused',async()=>{
 const opinion=await submit();const checking=await action(opinion.id,{kind:'status',status:'verifying',content:'확인 시작'});await call('/api/operator/opinions/'+opinion.id+'/actions',operator,'POST',{version:checking.version,requestId:randomUUID(),kind:'status',status:'action_confirmed',content:'아직 미래',occurredAt:new Date(Date.now()+86400000).toISOString()},400);
 assert.equal((await call('/api/opinions/'+opinion.id,citizen)).opinion.status,'verifying');
 const oversized=await sharp({create:{width:5000,height:4000,channels:3,background:'#ffffff'}}).png().toBuffer();assert.ok(oversized.length<2*1024*1024);assert.equal((await upload(stranger,oversized)).status,400);
});

test('two rows renamed concurrently to the same name produce one winner and a conflict, never a server error',async()=>{
 const first=await call('/api/cart',citizen,'POST',{name:'동시수정1 '+suffix},201),second=await call('/api/cart',citizen,'POST',{name:'동시수정2 '+suffix},201);
 const results=await Promise.all([app.handle(req('/api/cart/'+first.item.id,citizen,'PATCH',{version:1,name:'공통이름 '+suffix})),app.handle(req('/api/cart/'+second.item.id,citizen,'PATCH',{version:1,name:'공통이름 '+suffix}))]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});

test('draft revision survives submission so an old tab cannot overwrite a later fresh draft',async()=>{
 const person=await signup('draft-epoch');const first=await call('/api/draft',person,'PUT',{version:0,content:content()});await call('/api/opinions',person,'POST',{idempotencyKey:randomUUID(),draftVersion:first.draft.version,content:content()},201);
 const cleared=await call('/api/draft',person);assert.equal(cleared.draft,null);assert.equal(cleared.version,2);
 const next=await call('/api/draft',person,'PUT',{version:cleared.version,content:content({title:'새로운 작성'})});assert.equal(next.draft.version,3);
 await call('/api/draft',person,'PUT',{version:first.draft.version,content:content({title:'이전 탭의 늦은 저장'})},409);assert.equal((await call('/api/draft',person)).draft.content.title,'새로운 작성');
});

test('an independent direct submission never clears a different in-progress draft',async()=>{
 const person=await signup('independent-submit');await call('/api/draft',person,'PUT',{version:0,content:content({title:'작성 중인 다른 의견'})});
 await submit(person,{title:'별도로 제출한 의견'});const draft=await call('/api/draft',person);assert.equal(draft.draft.content.title,'작성 중인 다른 의견');assert.equal(draft.version,1);
});

test('simultaneous attachment removal and submission never report both deletion and successful attachment',async()=>{
 const png=await sharp({create:{width:10,height:10,channels:3,background:'#ffffff'}}).png().toBuffer();const uploaded=await upload(stranger,png);assert.equal(uploaded.status,201);const id=(await uploaded.json()).attachment.id;
 const results=await Promise.all([app.handle(req('/api/attachments/'+id,stranger,'DELETE',{})),app.handle(req('/api/opinions',stranger,'POST',{idempotencyKey:randomUUID(),content:content({attachmentIds:[id]})}))]);
 const [removed,submitted]=results;if(submitted.status===201){assert.equal(removed.status,404);const opinion=(await submitted.json()).opinion;assert.equal(opinion.attachments[0].id,id);assert.equal((await app.handle(req('/api/attachments/'+id,stranger))).status,200);}else{assert.equal(removed.status,200);assert.equal(submitted.status,400);assert.equal((await app.handle(req('/api/attachments/'+id,stranger))).status,404);}
});

test('merchant privilege revocation while a write body is arriving prevents the pending reply',async()=>{
 const person=await signup('delayed-merchant');await assignRole(app.connection.db,{userId:person.id,role:'merchant',marketIds:[],storeIds:['sample-pureun'],actor:'test administrator',reason:'가상 배정'});await signin(person);
 let opinion=await submit();opinion=await action(opinion.id,{kind:'status',status:'verifying',content:'확인 시작'});opinion=await action(opinion.id,{kind:'transmit',merchantId:person.id,storeId:'sample-pureun',relationBasis:'가상 관계 확인',summary:'확인 요청',location:'가상 북문'});const transmission=opinion.transmissions[0];
 let bodyStarted!:()=>void,continueBody!:()=>void;const waiting=new Promise<void>(resolve=>{bodyStarted=resolve;}),released=new Promise<void>(resolve=>{continueBody=resolve;});
 const stream=new ReadableStream<Uint8Array>({async pull(controller){bodyStarted();await released;controller.enqueue(new TextEncoder().encode(JSON.stringify({requestId:randomUUID(),version:1,stance:'회수 이후 저장되면 안 되는 내용',noAlternative:true})));controller.close();}},{highWaterMark:0});
 const request=new Request(baseUrl+'/api/merchant/transmissions/'+transmission.id+'/replies',{method:'POST',headers:{Origin:baseUrl,'Content-Type':'application/json',Cookie:person.cookie},body:stream,duplex:'half'} as RequestInit & {duplex:'half'});
 const pending=app.handle(request);await waiting;await assignRole(app.connection.db,{userId:person.id,role:'citizen',marketIds:[],storeIds:[],actor:'test administrator',reason:'응답 저장 전 권한 회수'});continueBody();assert.equal((await pending).status,403);
 const latest=(await call('/api/operator/opinions/'+opinion.id,operator)).opinion;assert.equal(latest.transmissions[0].replies.length,0);assert.equal(latest.status,'consulting');
});

test('concurrent citizen reads never combine an old status with a newer committed status history',async()=>{
 const opinion=await submit();
 const writer=(async()=>{for(const status of ['verifying','unresolved','verifying','action_confirmed'])await action(opinion.id,{kind:'status',status,content:'가상 확인 기록',...(status==='action_confirmed'?{occurredAt:new Date(Date.now()-1000).toISOString()}:{})});})();
 for(let i=0;i<8;i++){const snapshot=(await call('/api/opinions/'+opinion.id,citizen)).opinion;const last=snapshot.timeline.filter((e:{status?:string})=>e.status).at(-1);assert.equal(last.status,snapshot.status);}
 await writer;
});
