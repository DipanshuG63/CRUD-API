'use strict';
// Capture ACTUAL swagger UI in a headless Chrome/Edge/Chromium browser.
const {spawn,spawnSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
async function main(){
 if(!process.env.SUPABASE_URL||!process.env.SUPABASE_KEY)
  throw Error('Add Supabase project URL and public anon key to .env first.');
 const home=process.env.LOCALAPPDATA||'',programFiles=process.env['PROGRAMFILES']||'';
 const candidates=[
  process.env.CHROME_PATH,
  path.join(home,'Google','Chrome','Application','chrome.exe'),
  path.join(programFiles,'Google','Chrome','Application','chrome.exe'),
  path.join(programFiles,'Microsoft','Edge','Application','msedge.exe'),
  '/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome',
 ].filter(Boolean);
 const chrome=candidates.find(x=>fs.existsSync(x));
 if(!chrome)throw Error('No Chrome/Edge/Chromium found. Set CHROME_PATH.');
 const port=43279;
 const server=spawn(process.execPath,['index.js'],{
  cwd:root,env:{...process.env,PORT:String(port)},stdio:'ignore'
 });
 try{
  let ready=false;
  for(let i=0;i<70;i++){
   if(server.exitCode!==null)throw Error('Server exited early.');
   try{if((await fetch('http://127.0.0.1:'+port+'/health')).ok){ready=true;break;}}catch{}
   await new Promise(resolve=>setTimeout(resolve,150));
  }
  if(!ready)throw Error('Server failed to start');
  const target=path.join(root,'docs','swagger-auth.png');
  const p=spawnSync(chrome,[
   '--headless','--no-sandbox','--disable-gpu','--hide-scrollbars',
   '--virtual-time-budget=6500','--window-size=1750,1450',
   '--screenshot='+target,'http://127.0.0.1:'+port+'/docs/',
  ],{encoding:'utf8',timeout:30000});
  if(p.error||p.status!==0||!fs.existsSync(target))
   throw Error(p.error?.message||p.stderr||'Screenshot failed');
  console.log('Actual Swagger bearer padlock screenshot:',target);
 }finally{server.kill();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
