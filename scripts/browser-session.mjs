import http from 'node:http';
import {readFile,writeFile,mkdtemp} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export async function browserSession(run, label = 'browser') {
const scratch=process.env.TRAIL_GAUGE_EVIDENCE;
if(!scratch) throw Error('Set TRAIL_GAUGE_EVIDENCE to an existing isolated evidence directory.');
const root=process.env.TRAIL_GAUGE_ROOT ?? fileURLToPath(new URL('../dist',import.meta.url));
await readFile(root+'/index.html');
const profile=await mkdtemp(scratch+'/chrome-');
const server=http.createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname; const path=name==='/'?'/index.html':name;if(path.includes('..')) throw Error('path'); const data=await readFile(root+path);res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.geojson')?'application/json':path.endsWith('.jpg')?'image/jpeg':'text/html');res.end(data);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`; console.log('Local server ready',origin);
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new',`--user-data-dir=${profile}`,'--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','about:blank'],{stdio:['ignore','ignore','pipe']});
let stderr='';chrome.stderr.on('data',x=>stderr+=x);
let ws;
try{
 const endpoint=await new Promise((resolve,reject)=>{const deadline=setTimeout(()=>reject(Error('No CDP startup: '+stderr)),15000);chrome.stderr.on('data',()=>{const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(deadline);resolve(match[1]);}});chrome.on('exit',code=>{clearTimeout(deadline);reject(Error('Chrome exit '+code+': '+stderr));});});
 console.log('Chrome CDP ready'); ws=new WebSocket(endpoint); await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 let seq=0;let sessionId;const pending=new Map();const events=[];const eventWaiters=new Map();
 const waitEvent=method=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{eventWaiters.delete(method);reject(Error('CDP event timeout: '+method));},15000);eventWaiters.set(method,m=>{clearTimeout(timer);eventWaiters.delete(method);resolve(m);});});
 ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}else{events.push(m);if(m.sessionId===sessionId)eventWaiters.get(m.method)?.(m);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout: '+method));},210000);pending.set(id,{resolve:r=>{clearTimeout(timer);resolve(r)},reject:e=>{clearTimeout(timer);reject(e)}});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 const {targetId}=await send('Target.createTarget',{url:'about:blank'});
 ({sessionId}=await send('Target.attachToTarget',{targetId,flatten:true}));
 const c=(method,params)=>send(method,params,sessionId);
 await c('Runtime.enable');await c('Page.enable');await c('Network.enable');
 const evaluate=async expression=>{const r=await c('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
 const wait=expression=>evaluate(`new Promise((resolve,reject)=>{const test=()=>{if(${expression}){observer.disconnect();clearTimeout(timer);resolve(true);}};const observer=new MutationObserver(test);observer.observe(document,{subtree:true,childList:true,attributes:true});const timer=setTimeout(()=>{observer.disconnect();reject(Error('DOM condition timeout: '+document.querySelector('#forecast-status')?.innerText));},15000);test();})`);
 const goto=async(hash,selector)=>{await evaluate(`location.hash=${JSON.stringify(hash)}`);await wait(`!!document.querySelector(${JSON.stringify(selector)})`);};
 const shot=async name=>{const r=await c('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(scratch+'/'+name+'.png',Buffer.from(r.data,'base64'));};
 await run({c,evaluate,wait,goto,shot,events,waitEvent,scratch,root,origin});
}catch(error){console.error(error);await writeFile(scratch+'/'+label+'-error-'+Date.now()+'.json',JSON.stringify({error:String(error),stderr},null,2));throw error;}finally{ws?.close();chrome.kill('SIGTERM');const killer=setTimeout(()=>chrome.kill('SIGKILL'),3000);await new Promise(r=>chrome.exitCode!==null?r():chrome.once('exit',r));clearTimeout(killer);server.closeAllConnections();await new Promise(r=>server.close(r));}

}
