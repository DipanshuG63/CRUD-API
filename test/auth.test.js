'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.resolve(__dirname, '..');
function setup(config={}) {
  const routes = new Map(), out = [];
  const user = {id:'user-1',email:'example@sample.com',created_at:'2026-11-17'};
  const app={use(){},listen(_port,cb){cb();}};
  for(const m of ['get','post','put','delete'])
    app[m]=(url,...handlers)=>routes.set(m.toUpperCase()+' '+url,handlers);
  function express(){return app;}
  express.json=()=>()=>{};
  class FakeDB {
    exec(){}
    transaction(fn){return fn;}
    prepare(sql){return {
      get(){return sql.includes('COUNT(*) AS count')?{count:1}:undefined},
      run(){return {changes:0,lastInsertRowid:1}},
      all(){return []},
    };}
  }
  function createClient(){return {auth:{
    async signUp({email}) {
      if(config.offline) throw Error('offline');
      return {data:{user:{...user,email}},error:null};
    },
    async signInWithPassword({password}) {
      if(config.offline) throw Error('offline');
      if(password==='bad') return {data:null,error:{status:400}};
      return {data:{session:config.noSession?null:{access_token:'good.jwt.token',refresh_token:'refresh',expires_in:3600}},error:null};
    },
    async getUser(token) {
      if(config.offline) throw Error('offline');
      return token==='good.jwt.token'?{data:{user},error:null}:{data:null,error:{status:401}};
    }
  }};}
  const context={
    require(name){
      if(name==='dotenv')return {config(){}};
      if(name==='express')return express;
      if(name==='@supabase/supabase-js')return {createClient};
      if(name==='swagger-ui-express')return {serve(){},setup(){return ()=>{}}};
      if(name==='better-sqlite3')return FakeDB;
      if(name==='./openapi.json')return JSON.parse(fs.readFileSync(path.join(root,'openapi.json'),'utf8'));
      return require(name);
    },
    __dirname:root,
    process:{env:{SUPABASE_URL:'https://test.supabase.co',SUPABASE_KEY:'public-test-key',PORT:'3000'},exit(){throw Error('exit')}},
    console:{log(){},error(){}},URL,AbortSignal,
    async fetch(url,init){out.push({url:String(url),init});return {ok:!config.logoutFailure,status:config.logoutFailure?503:204};}
  };
  vm.runInNewContext(fs.readFileSync(path.join(root,'index.js'),'utf8'),context);
  async function req(method,url,body,authorization){
    const f=routes.get(method+' '+url);assert.ok(f,'missing '+method+' '+url);
    const request={body,headers:authorization===undefined?{}:{authorization}};
    const response={statusCode:0,data:undefined,status(v){this.statusCode=v;return this;},json(v){this.data=v;return this;},send(v){this.data=v;return this;}};
    async function step(i) {
      if(i>=f.length)return;
      if(f[i].length>=3){
        let child;
        await f[i](request,response,()=>{child=step(i+1);});
        if(child)await child;
      }else await f[i](request,response);
    }
    await step(0);return response;
  }
  return {req,out};
}
test('public route 200; protected route without JWT 401',async()=>{
 const a=setup();
 assert.equal((await a.req('GET','/public/info')).statusCode,200);
 assert.equal((await a.req('GET','/protected/profile')).statusCode,401);
});
test('signup 201; missing email/password 400',async()=>{
 const a=setup();
 assert.equal((await a.req('POST','/auth/signup',{email:'a@b.com',password:'pass123'})).statusCode,201);
 assert.equal((await a.req('POST','/auth/signup',{email:'a@b.com'})).statusCode,400);
});
test('login 200, provides JWT and refresh token; invalid password 401',async()=>{
 const a=setup();
 const r=await a.req('POST','/auth/login',{email:'a@b.com',password:'pass123'});
 assert.equal(r.statusCode,200);assert.ok(r.data.access_token);assert.ok(r.data.refresh_token);
 assert.equal((await a.req('POST','/auth/login',{email:'a@b.com',password:'bad'})).statusCode,401);
 assert.equal((await setup({noSession:true}).req('POST','/auth/login',{email:'a@b.com',password:'pass123'})).statusCode,401);
});
test('reusable JWT middleware rejects tampered and malformed tokens',async()=>{
 const a=setup();
 for(const route of ['/protected/profile','/protected/dashboard']){
  assert.equal((await a.req('GET',route,undefined,'Bearer good.jwt.token')).statusCode,200);
  assert.equal((await a.req('GET',route,undefined,'Bearer forged.jwt.token')).statusCode,401);
  assert.equal((await a.req('GET',route,undefined,'Basic good.jwt.token')).statusCode,401);
 }
});
test('logout uses user-scoped Supabase endpoint, 204',async()=>{
 const a=setup();
 assert.equal((await a.req('POST','/auth/logout',undefined,'Bearer good.jwt.token')).statusCode,204);
 assert.equal(a.out.length,1);
 assert.match(a.out[0].url,/\/auth\/v1\/logout\?scope=local/);
 assert.equal(a.out[0].init.headers.Authorization,'Bearer good.jwt.token');
 assert.equal((await a.req('POST','/auth/logout',undefined,'Bearer invalid')).statusCode,401);
});
test('upstream failures 502',async()=>{
 const a=setup({offline:true});
 assert.equal((await a.req('POST','/auth/signup',{email:'a@b.com',password:'pass123'})).statusCode,502);
 assert.equal((await a.req('POST','/auth/login',{email:'a@b.com',password:'pass123'})).statusCode,502);
 assert.equal((await a.req('GET','/protected/profile',undefined,'Bearer good.jwt.token')).statusCode,502);
 assert.equal((await setup({logoutFailure:true}).req('POST','/auth/logout',undefined,'Bearer good.jwt.token')).statusCode,502);
});
test('Swagger has five required routes and bearerAuth for locked endpoints',()=>{
 const spec=JSON.parse(fs.readFileSync(path.join(root,'openapi.json'),'utf8'));
 assert.equal(spec.components.securitySchemes.bearerAuth.scheme,'bearer');
 for(const [method,url] of [['post','/auth/signup'],['post','/auth/login'],['post','/auth/logout'],['get','/protected/profile'],['get','/public/info']])assert.ok(spec.paths[url][method]);
 for(const [method,url] of [['post','/auth/logout'],['get','/protected/profile'],['get','/protected/dashboard']])
  assert.deepEqual(spec.paths[url][method].security,[{bearerAuth:[]}]);
});
test('secret env file is ignored',()=>{
 const ignore=fs.readFileSync(path.join(root,'.gitignore'),'utf8');
 assert.match(ignore,/^\.env$/m);
 assert.match(ignore,/^!\.env\.example$/m);
});
