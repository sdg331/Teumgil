import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { setTimeout as waitForRetry } from 'node:timers/promises';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { createApplication } from '../src/server/application.ts';
import { readConfig } from '../src/server/config.ts';
import { seedSampleCatalog } from '../src/server/seed.ts';
import { assignRole } from '../src/server/administration.ts';
import { attachments, cartItems, merchantReplies, mutationReceipts, opinionDrafts, opinionEvents, opinions, transmissions, user } from '../src/server/schema.ts';

const action=process.argv[2]??'init';
if(!['init','reset'].includes(action))throw new Error('Usage: demo.mjs init | reset --confirm-demo-reset');
if(process.env.NODE_ENV==='production')throw new Error('Demo tools are disabled in production.');
if(action==='reset'&&!process.argv.includes('--confirm-demo-reset'))throw new Error('Reset only the registered synthetic accounts: add --confirm-demo-reset.');
const config=readConfig();const app=await createApplication(config);const db=app.connection.db;
const registryPath=resolve('.harness/demo-accounts.json');const databaseFingerprint=createHash('sha256').update(config.databaseUrl).digest('hex');
async function send(path,person,method='GET',body,attempt=0){
 const response=await app.handle(new Request(config.baseUrl+path,{method,headers:{Origin:config.baseUrl,'X-Forwarded-For':'127.0.0.1','Content-Type':'application/json',...(person?.cookie?{Cookie:person.cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}));
 if(response.status===429&&path.startsWith('/api/auth/')&&attempt<2){
  const seconds=Number(response.headers.get('Retry-After')??response.headers.get('X-Retry-After'));
  if(Number.isFinite(seconds)&&seconds>0&&seconds<=60){console.error(`Demo authentication is rate limited; retrying after ${seconds}s.`);await waitForRetry(seconds*1000);return send(path,person,method,body,attempt+1);}
 }
 if(!response.ok)throw new Error('Demo request failed: '+path+' ('+response.status+') '+await response.text());return {response,data:await response.json()};
}
async function login(person){const {response}=await send('/api/auth/sign-in/email',null,'POST',{email:person.email,password:person.password});return {...person,cookie:response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ')};}
function baseContent(extra={}){return {marketId:'sample-haetsal',location:'가상 북문 앞 통로',situation:'[가상 시연 자료] 북문 앞 상자 사이로 지나가기 어려웠어요.',observedAt:'발견 시점 미기록',title:'북문 앞 통행 공간을 확인해 주세요',description:'[가상 시연 자료] 북문 앞 통행 공간이 좁게 느껴졌어요. 상황을 확인해 주세요.',request:'',generationMode:'manual',attachmentIds:[],...extra};}
try{
 await app.connection.migrate();await seedSampleCatalog(db);await mkdir(resolve('.harness'),{recursive:true});
 let registry;try{registry=JSON.parse(await readFile(registryPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 if(registry&&(!registry.synthetic||registry.databaseFingerprint!==databaseFingerprint))throw new Error('The local demo registry belongs to a different database. Preserve it before preparing a separate registry.');
 if(!registry)registry={synthetic:true,databaseFingerprint,createdAt:new Date().toISOString(),accounts:[]};
 for(const [label,role,marketIds,storeIds] of [['시민 가람 (가상)','citizen',[],[]],['운영자 온유 (가상)','operator',['sample-haetsal'],[]],['상인 다온 (가상)','merchant',[],['sample-pureun']]]){
  if(registry.accounts.some(person=>person.role===role))continue;
  const email=role+'@demo.teumgil.invalid';const [exists]=await db.select().from(user).where(eq(user.email,email));if(exists)throw new Error('An unregistered demo email already exists; refusing to take over that account.');
  const password=randomBytes(24).toString('base64url')+'!';const {data}=await send('/api/auth/sign-up/email',null,'POST',{name:label,email,password});
  registry.accounts.push({id:data.user.id,label,role,email,password,marketIds,storeIds});await writeFile(registryPath,JSON.stringify(registry,null,2)+'\n',{mode:0o600});
 }
 if(registry.accounts.length!==3)throw new Error('The registry is incomplete. Preserve the file and inspect the previous initialization failure.');
 for(const person of registry.accounts){const [stored]=await db.select().from(user).where(and(eq(user.id,person.id),eq(user.email,person.email)));if(!stored||!person.email.endsWith('@demo.teumgil.invalid'))throw new Error('Demo identity does not match its registry.');await assignRole(db,{userId:person.id,role:person.role,marketIds:person.marketIds,storeIds:person.storeIds,actor:'local-demo-cli',reason:'명시적으로 표시된 가상 시연 계정 배정'});}
 // Verify all registered credentials before removing any synthetic work.
 const people=await Promise.all(registry.accounts.map(login));const citizen=people.find(x=>x.role==='citizen'),operator=people.find(x=>x.role==='operator'),merchant=people.find(x=>x.role==='merchant');
 if(action==='reset'){
  const ids=registry.accounts.map(x=>x.id);
  await db.transaction(async tx=>{
   const owned=await tx.select().from(opinions).where(inArray(opinions.userId,ids));if(owned.some(x=>!x.isSample))throw new Error('Non-sample opinions exist. Refusing demo reset.');
   const opinionIds=owned.map(x=>x.id); const receiptScopes=opinionIds.flatMap(id=>['operator:'+id,'response:'+id]);
   if(opinionIds.length){const foreignEvents=await tx.select({id:opinionEvents.id}).from(opinionEvents).where(and(inArray(opinionEvents.opinionId,opinionIds),notInArray(opinionEvents.actorId,ids)));const sent=await tx.select().from(transmissions).where(inArray(transmissions.opinionId,opinionIds));if(foreignEvents.length||sent.some(t=>!ids.includes(t.merchantId)||!ids.includes(t.actorId)))throw new Error('Non-demo actors are connected. Refusing reset.');receiptScopes.push(...sent.map(t=>'reply:'+t.id));if(sent.length){const foreignReplies=await tx.select({id:merchantReplies.id}).from(merchantReplies).where(and(inArray(merchantReplies.transmissionId,sent.map(t=>t.id)),notInArray(merchantReplies.actorId,ids)));if(foreignReplies.length)throw new Error('Non-demo replies exist. Refusing reset.');}await tx.delete(opinions).where(inArray(opinions.id,opinionIds));}
   await tx.delete(attachments).where(inArray(attachments.userId,ids));await tx.delete(opinionDrafts).where(inArray(opinionDrafts.userId,ids));await tx.delete(cartItems).where(inArray(cartItems.userId,ids));if(receiptScopes.length)await tx.delete(mutationReceipts).where(and(inArray(mutationReceipts.actorId,ids),inArray(mutationReceipts.scope,receiptScopes)));
  });
 }
 for(const name of ['대파','두부','당근'])await send('/api/cart',citizen,'POST',{name});
 const submitted=await send('/api/opinions',citizen,'POST',{idempotencyKey:'demo-seed:received:v1',content:baseContent()});
 const second=await send('/api/opinions',citizen,'POST',{idempotencyKey:'demo-seed:consulting:v1',content:baseContent({title:'가상 A구역의 적재 공간을 함께 확인해 주세요',location:'가상 A구역 입구',situation:'[가상 시연 자료] 통로 옆 적재 공간을 확인하고 싶어요.',description:'[가상 시연 자료] 통행과 적재 공간을 함께 사용할 수 있을지 확인을 요청해요.',observedAt:''})});
 const opinionId=second.data.opinion.id;
 if(!second.data.replayed){
  async function act(kind,body){const {data}=await send('/api/operator/opinions/'+opinionId,operator);return send('/api/operator/opinions/'+opinionId+'/actions',operator,'POST',{version:data.opinion.version,requestId:randomUUID(),kind,...body});}
  await act('status',{status:'verifying',content:'[가상 시연] 운영자가 위치 설명을 확인하기 시작했습니다.'});
  const {data}=await act('transmit',{merchantId:merchant.id,storeId:'sample-pureun',relationBasis:'[가상 시연] 해당 상인과 구역의 관계를 직접 확인한 상황을 가정한 검증 자료',summary:'[가상 시연 자료] A구역 통행·적재 공간에 대한 의견과 가능한 대안을 남겨 주세요.',location:'가상 A구역 입구'});
  const transmission=data.opinion.transmissions.at(-1);
  await send('/api/merchant/transmissions/'+transmission.id+'/replies',merchant,'POST',{requestId:randomUUID(),version:transmission.version,stance:'[가상 시연 답변] 어느 물건인지 더 확인이 필요해요.',noAlternative:true});
  await act('publish',{content:'[가상 시연 결과] 관련 의견을 들었으며, 현재 확인이 더 필요한 상태예요. 조치가 완료된 것은 아니에요.'});
  await act('followup-plan',{content:'[가상 시연 계획] 위치와 통행 상황을 다시 확인할 예정이에요.',assignee:'운영자 온유 (가상)',scheduledAt:new Date(Date.now()+24*60*60*1000).toISOString()});
 }
 console.log(JSON.stringify({synthetic:true,action,credentialsFile:registryPath,accounts:registry.accounts.map(({role,email})=>({role,email})),opinionIds:[submitted.data.opinion.id,opinionId],notice:'Private passwords are in the ignored local registry. Sign in in three independent browser sessions.'},null,2));
}finally{await app.connection.close();}
