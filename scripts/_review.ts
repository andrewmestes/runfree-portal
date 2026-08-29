/** Capture every page/panel, as an admin and as a viewer, desktop and phone. */
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
const EMAIL="portal-review@example.com",PASSWORD="review-only-not-a-real-account-4471!";
const URL_=process.env.NEXT_PUBLIC_SUPABASE_URL!;
const admin=createClient(URL_,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
const P=process.argv[2] ?? "8820b0e9-a849-448c-a1b1-913f24fa8efd";
const ROLE=(process.argv[3] ?? "admin") as "admin"|"viewer";
const WIDTH=Number(process.argv[4] ?? 1440);
const OUT=`/tmp/review/${ROLE}-${WIDTH}/`;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function teardown(){const{data}=await admin.auth.admin.listUsers({perPage:1000});const u=data.users.find(x=>x.email===EMAIL);if(!u)return;await admin.from("project_members").delete().eq("profile_id",u.id);await admin.from("profiles").delete().eq("id",u.id);await admin.auth.admin.deleteUser(u.id);}
for(const sig of ["SIGINT","SIGTERM","SIGHUP"] as const) process.once(sig,()=>{void teardown().finally(()=>process.exit(1));});
async function main(){
  await teardown();
  const{data:made,error}=await admin.auth.admin.createUser({email:EMAIL,password:PASSWORD,email_confirm:true,user_metadata:{name:"Portal Review"}});if(error)throw error;
  await admin.from("project_members").upsert({project_id:P,profile_id:made.user.id,role:ROLE},{onConflict:"project_id,profile_id"});
  // A viewer is a church person: NOT staff. An admin here stands in for Andrew.
  await admin.from("profiles").update({is_staff:ROLE==="admin"}).eq("id",made.user.id);
  const store=new Map<string,string>();
  const shim={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>void store.set(k,v),removeItem:(k:string)=>void store.delete(k)};
  const c=createClient(URL_,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{storage:shim as never,persistSession:true,autoRefreshToken:false}});
  const si=await c.auth.signInWithPassword({email:EMAIL,password:PASSWORD});if(si.error)throw si.error;
  const[[key,value]]=[...store];
  rmSync(OUT,{recursive:true,force:true});mkdirSync(OUT,{recursive:true});
  const PORT=9900+(process.pid%90);
  const chrome=spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",["--headless=new",`--remote-debugging-port=${PORT}`,`--user-data-dir=/tmp/_rev-${Date.now()}`,"--no-first-run","--disable-gpu","--hide-scrollbars","about:blank"],{stdio:"ignore"});
  let ws!:WebSocket,id=0,sessionId:string|null=null;const pending=new Map<number,{res:(v:unknown)=>void;rej:(e:Error)=>void}>();const errs:string[]=[];
  const send=(m:string,p:unknown={},sid:string|null=sessionId):Promise<unknown>=>new Promise((res,rej)=>{const n=++id;pending.set(n,{res,rej});ws.send(JSON.stringify({id:n,method:m,params:p,...(sid?{sessionId:sid}:{})}));});
  let u:string|undefined;for(let i=0;i<80&&!u;i++){try{u=(await fetch(`http://127.0.0.1:${PORT}/json/version`).then(r=>r.json())).webSocketDebuggerUrl;}catch{await sleep(250);}}
  ws=new WebSocket(u!);await new Promise<void>(r=>{ws.onopen=()=>r();});
  ws.onmessage=e=>{const m=JSON.parse(String(e.data));
    if(m.method==="Runtime.consoleAPICalled"&&m.params.type==="error")errs.push(m.params.args.map((a:{value?:string;description?:string})=>a.value??a.description??"").join(" ").slice(0,140));
    if(m.method==="Runtime.exceptionThrown")errs.push("EXC "+String(m.params.exceptionDetails?.exception?.description??"").slice(0,140));
    if(m.id&&pending.has(m.id)){const{res,rej}=pending.get(m.id)!;pending.delete(m.id);m.error?rej(new Error(m.error.message)):res(m.result);}};
  const{targetId}=await send("Target.createTarget",{url:"about:blank"},null)as{targetId:string};
  ({sessionId}=await send("Target.attachToTarget",{targetId,flatten:true},null)as{sessionId:string});
  await send("Page.enable");await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:WIDTH,height:WIDTH<600?5200:3600,deviceScaleFactor:WIDTH<600?2:1,mobile:WIDTH<600});
  if(WIDTH<600) await send("Network.setUserAgentOverride",{userAgent:"Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"});
  const ev=async(x:string)=>{const r=await send("Runtime.evaluate",{expression:x,awaitPromise:true,returnByValue:true})as{result:{value:unknown};exceptionDetails?:{text:string}};if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result.value;};
  const go=async(x:string,s=6000)=>{await send("Page.navigate",{url:x});await sleep(s);};
  await go("http://localhost:3001/auth/login",3000);
  await ev(`localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)}); "ok"`);

  const pages:[string,string,number?][]=[
    ["home","http://localhost:3001/"],
    ["help","http://localhost:3001/help"],
    ["p-dashboard",`http://localhost:3001/projects/${P}?panel=dashboard`],
    ["p-prepare",`http://localhost:3001/projects/${P}?panel=prepare`],
    ["p-process",`http://localhost:3001/projects/${P}?panel=process`],
    ["p-team",`http://localhost:3001/projects/${P}?panel=team`],
    ["p-dates",`http://localhost:3001/projects/${P}?panel=dates`],
    ["p-sessions",`http://localhost:3001/projects/${P}?panel=sessions`],
    ["p-deliverables",`http://localhost:3001/projects/${P}?panel=deliverables`],
    ["p-books",`http://localhost:3001/projects/${P}?panel=books`,10000],
  ];
  for(const [name,url,settle] of pages){
    errs.length=0;
    await go(url,settle??6000);
    await ev(`[...document.images].forEach(i=>{i.loading="eager";}); "ok"`);
    await sleep(2200);
    const info=await ev(`JSON.stringify({url:location.pathname+location.search,h:(document.querySelector("main")?.scrollHeight)??document.documentElement.scrollHeight,
      bad:[...document.images].filter(i=>i.getClientRects().length&&!(i.complete&&i.naturalWidth>0)).length,
      hscroll:document.documentElement.scrollWidth>innerWidth+1})`);
    const noise=[...new Set(errs)].filter(m=>!/GoTrue|DevTools/i.test(m));
    console.log(`${name.padEnd(16)} ${info}${noise.length?"  ERR "+noise.join(" | "):""}`);
    const sh=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true})as{data:string};
    writeFileSync(`${OUT}${name}.png`,Buffer.from(sh.data,"base64"));
  }
  await send("Target.closeTarget",{targetId},null);chrome.kill();
  console.log("-> "+OUT);
}
main().catch(e=>{console.error(String(e).slice(0,300));process.exitCode=1;}).finally(teardown);
