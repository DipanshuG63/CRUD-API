'use strict';
// Real e2e smoke test. Requires a private .env with Supabase URL and public anon key.
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {createServer}=require('node:net');
const {randomBytes}=require('node:crypto');
const path=require('node:path');
async function port(){
 return new Promise((resolve,reject)=>{
  const server=createServer();
  server.once('error',reject);
  server.listen(0,'127.0.0.1',()=>{
   const p=server.address().port;
   server.close(()=>resolve(p));
  });
 });
}
async function main(){
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_KEY)
  throw Error('Create .env containing your Supabase project URL and public anon key.');
 const p=await port(),base='http://127.0.0.1:'+p;
 const server=spawn(process.execPath,['index.js'],{
  cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(p)},stdio:['ignore','pipe','pipe']
 });
 let output='';
 server.stdout.on('data',v=>{output+=v.toString();});
 server.stderr.on('data',v=>{output+=v.toString();});
 async function call(url,method='GET',body,token){
  const headers={};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(token)headers.Authorization='Bearer '+token;
  const r=await fetch(base+url,{
   method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(20000)
  });
  const t=await r.text();
  let data;
  try{data=t?JSON.parse(t):null;}catch{data=t;}
  return {status:r.status,data};
 }
 try{
  let started=false;
  for(let i=0;i<65;i++){
   if(server.exitCode!==null)throw Error('Server exited: '+output);
   try{if((await call('/health')).status===200){started=true;break;}}catch{}
   await new Promise(done=>setTimeout(done,150));
  }
  assert.ok(started,'Server did not start: '+output);
  assert.equal((await call('/public/info')).status,200);
  assert.equal((await call('/protected/profile')).status,401);
  assert.equal((await call('/auth/signup','POST',{email:'test@example.com'})).status,400);
  const email='w4-test-'+randomBytes(6).toString('hex')+'@example.com';
  const password='Test_'+randomBytes(10).toString('hex')+'!';
  const signup=await call('/auth/signup','POST',{email,password});
  assert.equal(signup.status,201,JSON.stringify(signup.data));
  const login=await call('/auth/login','POST',{email,password});
  assert.equal(login.status,200,JSON.stringify(login.data)+'; turn off Confirm email for this practice project');
  assert.ok(login.data.access_token&&login.data.refresh_token);
  const jwt=login.data.access_token;
  assert.equal((await call('/protected/profile','GET',undefined,jwt)).status,200);
  assert.equal((await call('/protected/dashboard','GET',undefined,jwt)).status,200);
  assert.equal((await call('/protected/profile','GET',undefined,jwt.slice(0,-6)+'XXXXXX')).status,401);
  assert.equal((await call('/auth/logout','POST',undefined,jwt)).status,204);
  assert.equal((await call('/docs/')).status,200);
  console.log('PASS: all real Supabase authentication checkpoints. Test account:',email);
  console.log('Note: a JWT can remain valid until expiry after logout.');
 }finally{server.kill();}
}
main().catch(e=>{console.error('Smoke test failed:',e.message);process.exitCode=1;});
