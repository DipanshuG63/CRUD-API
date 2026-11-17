'use strict';
// Capture genuine Swagger UI screenshots in a browser (no real token needed).
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');

async function main(){
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_KEY)
  throw Error('SUPABASE_URL and public SUPABASE_KEY are required (CI may use non-secret placeholder values).');
 const home=process.env.LOCALAPPDATA||'',pf=process.env.PROGRAMFILES||'';
 const candidates=[
  process.env.CHROME_PATH,
  path.join(home,'Google','Chrome','Application','chrome.exe'),
  path.join(pf,'Google','Chrome','Application','chrome.exe'),
  path.join(pf,'Microsoft','Edge','Application','msedge.exe'),
  '/usr/bin/google-chrome','/usr/bin/google-chrome-stable',
  '/opt/google/chrome/chrome','/usr/bin/chromium','/usr/bin/chromium-browser',
 ].filter(Boolean);
 const chrome=candidates.find(f=>fs.existsSync(f));
 if(!chrome)throw Error('Chrome/Edge/Chromium not found; set CHROME_PATH');
 const port=43279;
 const server=spawn(process.execPath,['index.js'],{
  cwd:root,env:{...process.env,PORT:String(port)},stdio:'ignore'
 });
 try{
  let ready=false;
  for(let i=0;i<70;i++){
   if(server.exitCode!==null)throw Error('API server exited early');
   try{if((await fetch('http://127.0.0.1:'+port+'/health')).ok){ready=true;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,150));
  }
  if(!ready)throw Error('API server did not start');
  const base='http://127.0.0.1:'+port+'/docs/';
  for (const [filename,url] of [
   ['swagger-auth.png',base],
   ['swagger-profile.png',base+'#/Protected/getProfile']
  ]){
   const target=path.join(root,'docs',filename);
   const result=spawnSync(chrome,[
    '--headless','--no-sandbox','--disable-gpu','--hide-scrollbars',
    '--disable-dev-shm-usage','--virtual-time-budget=8000',
    '--window-size=1800,1300','--screenshot='+target,url
   ],{encoding:'utf8',timeout:35000});
   if(result.error||result.status!==0||!fs.existsSync(target))
    throw Error(result.error?.message||result.stderr||'Screenshot capture failed');
   if(fs.statSync(target).size < 12000)
    throw Error('Screenshot suspiciously small: '+target);
   console.log('Captured actual Swagger UI:',target,'('+fs.statSync(target).size+' bytes)');
  }
 }finally{server.kill();}
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
