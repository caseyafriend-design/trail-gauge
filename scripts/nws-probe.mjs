import {writeFile} from 'node:fs/promises';
import {browserSession} from './browser-session.mjs';
await browserSession(async({c,evaluate,wait,events,scratch,origin})=>{
 await c('Page.navigate',{url:origin});
 await wait("document.readyState==='complete'");
 const results=await evaluate(`(async()=>{
 const data=await (await fetch('./routes.geojson')).json(); const results=[];
 for(const {properties:t} of data.features){
 const [lon,lat]=t.trailhead;const url='https://api.weather.gov/points/'+lat.toFixed(4)+','+lon.toFixed(4);
 try {const response=await fetch(url,{headers:{Accept:'application/geo+json'},signal:AbortSignal.timeout(12000)});const point=await response.json();
 const hourly=point.properties?.forecastHourly;const next=hourly?await fetch(hourly,{headers:{Accept:'application/geo+json'},signal:AbortSignal.timeout(12000)}):null;
 const forecast=next?.ok?await next.json():null;
 results.push({id:t.id,url,status:response.status,hourly,statusHourly:next?.status,periods:forecast?.properties?.periods?.length,cacheControl:next?.headers.get('Cache-Control'),updated:forecast?.properties?.updateTime});
 }catch(error){results.push({id:t.id,url,error:String(error)});}
 }
 return results;
 })()`);
 const requests=events.filter(e=>e.method==='Network.requestWillBeSent' && e.params.request.url.includes('api.weather.gov'));
 const requestIds=new Set(requests.map(e=>e.params.requestId));
 const extra=events.filter(e=>e.method==='Network.requestWillBeSentExtraInfo' && requestIds.has(e.params.requestId));
 await writeFile(scratch+'/nws-live-proof.json',JSON.stringify({results,requests,extra},null,2));
 console.log(JSON.stringify({results,requests:requests.map(e=>e.params.request),extra:extra.map(e=>e.params.headers)},null,2));
 },'nws-probe');
