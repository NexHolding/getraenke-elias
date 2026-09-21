// Execute the real route and retry worker with in-memory Auth/DB adapters only.
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
await mkdir('.local',{recursive:true});
const jobs=new Map();let signedIn=true,staff=false,rate=true,passwordOK=true,failDelete=false,alreadyGone=false,prepared=0,authDeletes=0;
const uid=crypto.randomUUID();
const db={auth:{admin:{async deleteUser(id,soft){assert.equal(id,uid);assert.equal(soft,false);authDeletes++;return {error:failDelete?{code:'unexpected_failure'}:alreadyGone?{code:'user_not_found'}:null};}}},
 from(table){let updates=null,filters=[],projection='*';return {select(value='*'){projection=value;return this;},eq(k,v){filters.push([k,v]);return this;},update(v){updates=v;return this;},async maybeSingle(){if(table==='staff')return{data:staff?{user_id:uid}:null};return this.single();},async single(){const found=[...jobs.values()].find(j=>filters.every(([k,v])=>j[k]===v));if(!found)return{data:null,error:table==='customer_account_deletions'?null:'missing'};if(updates)Object.assign(found,updates);return{data:projection==='*'?{...found}:Object.fromEntries(projection.split(',').map(k=>[k,found[k]])),error:null};},then(resolve){return this.single().then(resolve);}};},
 async rpc(name,args){if(name==='check_request_limit')return{data:rate};assert.equal(name,'prepare_customer_account_deletion');assert.equal(args.p_user,uid);prepared++;const job={id:args.p_request,auth_user_id:uid,status:'pending',attempts:0,retained_business_records:true};jobs.set(job.id,job);return{data:job};}
};
globalThis.__deletionTest={db,userDb:async()=>({auth:{getUser:async()=>({data:{user:signedIn?{id:uid,email:'own@example.test'}:null}}),signOut:async()=>({error:null})}}),createClient:()=>({auth:{signInWithPassword:async({email})=>{assert.equal(email,'own@example.test');return{data:{user:passwordOK?{id:uid}:null},error:passwordOK?null:{message:'no'}};},signOut:async()=>({error:null})}})};
await build({entryPoints:['app/api/customer/delete-account/route.ts'],outfile:'.local/deletion-route-test.mjs',bundle:true,platform:'node',format:'esm',plugins:[{name:'isolated',setup(b){b.onResolve({filter:/^(server-only|@\/lib\/server|@supabase\/supabase-js)$/},a=>({path:a.path,namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({loader:'js',contents:a.path==='server-only'?'':a.path==='@supabase/supabase-js'?'export const createClient = (...a)=>globalThis.__deletionTest.createClient(...a);':`export const serviceDb=()=>globalThis.__deletionTest.db;export const userDb=()=>globalThis.__deletionTest.userDb();export function sameOrigin(r){if(r.headers.get('origin')!=='https://example.test')throw Error('FORBIDDEN');}export function safeError(e){return Response.json({error:e.message},{status:e.message==='UNAUTHORIZED'?401:403});}`}));}}]});
const {POST,GET}=await import('../.local/deletion-route-test.mjs?'+Date.now());
const request=(extra={},origin='https://example.test')=>new Request('https://example.test/api/customer/delete-account',{method:'POST',headers:{'content-type':'application/json',origin},body:JSON.stringify({request_id:crypto.randomUUID(),password:'test-only',confirmation:'KONTO LÖSCHEN',...extra})});
assert.equal((await POST(request({},'https://evil.test'))).status,403);
signedIn=false;assert.equal((await POST(request())).status,401);signedIn=true;
staff=true;assert.equal((await POST(request())).status,403);staff=false;
rate=false;assert.equal((await POST(request())).status,429);rate=true;
passwordOK=false;assert.equal((await POST(request())).status,400);passwordOK=true;
assert.equal(prepared,0);assert.equal(authDeletes,0);
const id=crypto.randomUUID();let r=await POST(request({request_id:id,user_id:crypto.randomUUID()}));assert.equal(r.status,200);assert.equal((await r.json()).status,'completed');assert.equal(jobs.get(id).auth_user_id,null);
const status=await GET(new Request('https://example.test/api/customer/delete-account?request_id='+id));assert.deepEqual(await status.json(),{status:'completed',retained_business_records:true});
failDelete=true;const pendingID=crypto.randomUUID();r=await POST(request({request_id:pendingID}));assert.equal(r.status,202);assert.equal(jobs.get(pendingID).status,'pending');assert.equal(jobs.get(pendingID).auth_user_id,uid);failDelete=false;
// Load actual worker independently to test retries after ambiguous Auth responses.
await build({entryPoints:['lib/customer-account-deletion.ts'],outfile:'.local/deletion-worker-test.mjs',bundle:true,platform:'node',format:'esm',plugins:[{name:'server-marker',setup(b){b.onResolve({filter:/^server-only$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:''}));}}]});
const {finishCustomerDeletion}=await import('../.local/deletion-worker-test.mjs?'+Date.now());
alreadyGone=true;await finishCustomerDeletion(db,pendingID);assert.equal(jobs.get(pendingID).status,'completed');const count=authDeletes;await finishCustomerDeletion(db,pendingID);assert.equal(authDeletes,count,'completed job does not delete twice');
console.log('PASS real deletion route: CSRF, authenticated subject, staff exclusion, rate limit, password reauthentication, no arbitrary target; hard Auth delete, accepted pending failure, idempotent retry after Auth already removed.');
