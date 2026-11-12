// Raw GPS fixes never leave browser storage. Distances in metres, times in ms.
export const recordingKey = 'trail-gauge-recordings-v1';
export const distance = (a, b) => {
  const rad = Math.PI / 180, dlat = (b.lat-a.lat)*rad, dlon=(b.lon-a.lon)*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;
  return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));
};
export function newRecording(trail = null, now = Date.now()) {
  return {id:crypto.randomUUID(),trailId:trail?.id ?? null,trailName:trail?.name ?? 'Unplanned hike',park:trail?.park ?? '',startedAt:now,status:'recording',points:[],distance:0,moving:0,gain:null,paused:0,gaps:0,breakNext:true};
}
export function pause(r, now=Date.now()) { if(r.status==='recording'){r.status='paused';r.pauseAt=now;r.breakNext=true;} }
export function resume(r, now=Date.now()) { if(r.status==='paused'){r.paused+=now-r.pauseAt;r.pauseAt=null;r.status='recording';r.breakNext=true;} }
export function elapsed(r, now=Date.now()) {return Math.max(0,(r.finishedAt??now)-r.startedAt);}
export function addFix(r, fix) {
  if(r.status!=='recording') return 'Paused';
  const c=fix.coords, t=fix.timestamp;
  if(!Number.isFinite(c.latitude)||Math.abs(c.latitude)>90||!Number.isFinite(c.longitude)||Math.abs(c.longitude)>180||!Number.isFinite(c.accuracy)||c.accuracy<0||c.accuracy>35||!Number.isFinite(t)) {r.breakNext=true;return 'Poor GPS accuracy; point excluded';}
  const p={lat:c.latitude,lon:c.longitude,t,alt:Number.isFinite(c.altitude)&&Number.isFinite(c.altitudeAccuracy)&&c.altitudeAccuracy>=0&&c.altitudeAccuracy<=10?c.altitude:null};
  const prev=r.points.at(-1), dt=prev?(t-prev.t)/1000:0;
  if(prev&&dt<=0) return 'Old fix excluded';
  const d=prev?distance(prev,p):0;
  if(prev&&dt<120&&d/dt>7){r.breakNext=true;return 'Implausible jump excluded';}
  p.gap=Boolean(r.breakNext||(prev&&dt>120));
  if(p.gap&&prev)r.gaps++;
  if(prev&&!p.gap){r.distance+=d;if(d/dt>=.3)r.moving+=dt*1000;
    if(p.alt!=null&&prev.alt!=null){r.gain??=0;if(p.alt-prev.alt>=3)r.gain+=p.alt-prev.alt;}}
  r.points.push(p);r.breakNext=false;return 'GPS recording';
}
export function finish(r, now=Date.now()) { if(r.status==='paused')r.paused+=now-r.pauseAt;r.finishedAt=now;r.status='finished';r.title=r.trailName;r.notes=''; }
// Trim by distance from BOTH endpoints; no raw timestamps or altitude are shared.
export function sharedSummary(r, {title=r.title,notes=r.notes,visibility='private',map=false,trim=300}={}) {
  if(r.status!=='finished')throw new Error('Finish the hike before sharing');
  const points=r.points;let path=[];
  if(map&&points.length>2){let a=0,b=points.length-1,left=0,right=0;
    while(a<b&&left<trim){left+=distance(points[a],points[a+1]);a++;}
    while(b>a&&right<trim){right+=distance(points[b],points[b-1]);b--;}
    path=points.slice(a,b+1).map(p=>({lat:p.lat,lon:p.lon,gap:p.gap}));
  }
  return {activityId:r.id,title,notes,visibility,trail:r.trailName,park:r.park,date:new Date(r.finishedAt).toISOString().slice(0,10),distance:Math.round(r.distance),moving:Math.round(r.moving/1000),elapsed:Math.round(elapsed(r)/1000),gain:r.gain==null?null:Math.round(r.gain),path};
}
