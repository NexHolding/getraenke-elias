// Route-level authorization/session regression with isolated database and cookie adapters.
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { scryptSync } from 'node:crypto';
await mkdir('output/terminal',{recursive:true});
const result=await build({entryPoints:['app/api/terminal/route.ts'],bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'adapters',setup(b){
 b.onResolve({filter:/^(next\/headers|server-only)$/},a=>({path:a.path,namespace:'test'}));
 b.onResolve({filter:/^(?:@\/lib\/server|\.\/server)$/},()=>({path:'server',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='next/headers'?'export async function cookies(){return globalThis.mock.jar}':a.path==='server'?`export const serviceDb=()=>globalThis.mock.db; export const userDb=async()=>globalThis.mock.auth; export async function requireStaff(){if(!globalThis.mock.user)throw Error('UNAUTHORIZED');return globalThis.mock.staff;} export function sameOrigin(req){if(req.headers.get('origin')!=='https://elias.test')throw Error('FORBIDDEN');} export function safeError(e){return Response.json({error:e.message},{status:e.message==='UNAUTHORIZED'?401:e.message==='FORBIDDEN'?403:400})}`:'export {}',loader:'js'}));
}}]});
await writeFile('output/terminal/route.mjs',result.outputFiles[0].text);
const {GET,POST}=await import('../output/terminal/route.mjs');
const id='11111111-1111-4111-8111-111111111111';
const pinHash='salt:'+scryptSync('2468','salt',32).toString('hex');
let state;
function reset(){
 const cookies=new Map(); const calls=[];
 const staff={user_id:id,name:'Test cashier',number:1,email:'test@example.test',role:'owner',active:true,permissions:[],pin_hash:pinHash};
 state={cookies,calls,staff,device:null,user:{id},allowed:true,roster:[staff]};
 const jar={get:k=>cookies.has(k)?{value:cookies.get(k)}:undefined,set:(k,v)=>cookies.set(k,v),delete:k=>cookies.delete(k)};
 const db={rpc:async()=>({data:state.allowed}),from(table){let operation='select';let value;const filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},gt(){return q},maybeSingle(){return q},single(){return q},insert(v){operation='insert';value=v;return q},delete(){operation='delete';return q},then(resolve,reject){try{calls.push({table,operation,value,filters});const data=table==='terminal_devices'?(operation==='select'?state.device:null):table==='staff'?(filters.user_id?state.staff:state.roster):null;return Promise.resolve({data,error:null}).then(resolve,reject)}catch(e){return Promise.reject(e).then(resolve,reject)}}};return q}};
 globalThis.mock={jar,db,get user(){return state.user},get staff(){return state.staff},auth:{auth:{getUser:async()=>({data:{user:state.user}}),signOut:async()=>{calls.push({signOut:true});state.user=null;return {error:null}}}}};
}
const post=body=>POST(new Request('https://elias.test/api/terminal',{method:'POST',headers:{origin:'https://elias.test','content-type':'application/json'},body:JSON.stringify(body)}));
reset(); assert.deepEqual(await (await GET()).json(),{registered:false}); assert.equal(state.calls.length,0);
reset(); state.device={id:'device',name:'Test register'};state.cookies.set('elias-device','trusted');state.roster.push({...state.staff,user_id:'other',role:'staff',permissions:['finanzen']});let roster=await (await GET()).json();assert.equal(roster.employees.length,1);assert.ok(!JSON.stringify(roster).includes('pin_hash'));
reset();state.user=null;assert.equal((await post({action:'lock'})).status,401);
reset();state.staff.permissions=[];state.staff.role='staff';assert.equal((await post({action:'lock'})).status,403);
reset();assert.equal((await post({action:'lock'})).status,200);assert.ok(state.cookies.has('elias-device'));assert.ok(!state.cookies.has('elias-operator'));assert.equal(state.user,null);assert.ok(state.calls.some(c=>c.table==='terminal_devices'&&c.operation==='insert'));
reset();assert.equal((await post({action:'unlock',user_id:id,pin:'2468'})).status,401);
for(const scenario of ['wrong-pin','revoked','no-permission','rate-limit','valid']){
 reset();state.device={id:'device'};state.cookies.set('elias-device','trusted');state.cookies.set('elias-operator','old-session');
 if(scenario==='revoked')state.staff.active=false;
 if(scenario==='no-permission'){state.staff.role='staff';state.staff.permissions=['finanzen'];}
 if(scenario==='rate-limit')state.allowed=false;
 const response=await post({action:'unlock',user_id:id,pin:scenario==='wrong-pin'?'0000':'2468'});
 assert.equal(response.status,scenario==='valid'?200:400,scenario);
 assert.equal(state.calls.filter(c=>c.table==='terminal_sessions'&&c.operation==='insert').length,scenario==='valid'?1:0);
 if(scenario==='valid'){assert.notEqual(state.cookies.get('elias-operator'),'old-session');assert.ok(state.calls.some(c=>c.table==='request_limits'&&c.operation==='delete'));}
}
reset();state.device={id:'device'};state.cookies.set('elias-device','trusted');state.cookies.set('elias-operator','old');assert.equal((await post({action:'lock'})).status,200);assert.equal(state.cookies.has('elias-operator'),false);assert.ok(state.calls.some(c=>c.table==='terminal_sessions'&&c.operation==='delete'));
reset();state.cookies.set('elias-device','stale');assert.equal((await post({action:'password-login'})).status,200);assert.equal(state.cookies.has('elias-device'),false);assert.ok(state.user);
reset();state.user=null;assert.equal((await post({action:'password-login'})).status,401);
console.log('PASS: private roster, first-lock pairing, password signout, PIN authorization/limit, session replacement/revocation and password recovery.');
