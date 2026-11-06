import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {cleanExtras,updateWorld,claimDrop} from './world.mjs';
const rooms=new Map();
const origin=process.env.ALLOWED_ORIGIN||'https://cursedplazyt.github.io';
const fail=(status,message)=>Object.assign(new Error(message),{status});
function cleanState(s){
 if(!s||!Array.isArray(s.position)||s.position.length!==3||!s.position.every(n=>Number.isFinite(n)&&Math.abs(n)<100000))throw fail(400,'Invalid position');
 if(!Array.isArray(s.rotation)||s.rotation.length!==4||!s.rotation.every(Number.isFinite))throw fail(400,'Invalid rotation');
 const length=Math.hypot(...s.rotation);if(length<0.5||length>1.5)throw fail(400,'Invalid rotation');
 const gear={};for(const [k,v]of Object.entries(s.gear||{}))if(/^[a-zA-Z]{1,30}$/.test(k)&&typeof v==='string'&&/^[a-zA-Z0-9]{1,50}$/.test(v))gear[k]=v;
 const velocity=Array.isArray(s.velocity)&&s.velocity.length===3&&s.velocity.every(n=>Number.isFinite(n)&&Math.abs(n)<=200)?s.velocity:[0,0,0];
 const t=s.toolMotion;
 const toolMotion=t&&Number.isSafeInteger(t.seq)&&t.seq>=0&&Number.isFinite(t.phase)?{seq:t.seq,phase:Math.max(0,Math.min(4,t.phase))}:{seq:0,phase:4};
 return {position:s.position,velocity,toolMotion,motionSeq:Number.isSafeInteger(s.motionSeq)&&s.motionSeq>=0?s.motionSeq:0,rotation:s.rotation.map(n=>n/length),gear,...cleanExtras(s)};
}
export const server=http.createServer(async(req,res)=>{
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store'};
 function send(status,body){res.writeHead(status,headers);res.end(JSON.stringify(body))}
 if(req.headers.origin&&req.headers.origin!==origin)return send(403,{error:'Origin blocked'});
 if(req.method==='OPTIONS'){res.writeHead(204,headers);return res.end()}
 if(req.method==='GET'&&req.url==='/health')return send(200,{ok:true,protocol:2,abilitySync:1});
 if(req.method!=='POST')return send(405,{error:'POST required'});
 try{
  let text='';for await(const chunk of req){text+=chunk;if(text.length>100000)throw fail(413,'Request too large')}
  let data;try{data=JSON.parse(text)}catch{throw fail(400,'Invalid JSON')}
  const now=Date.now();
  for(const [code,room]of rooms){for(const [id,p]of room)if(now-p.seen>30000)room.delete(id);if(!room.size)rooms.delete(code)}
  if(req.url==='/create'||req.url==='/join'){
   let code=String(data.code||'').toUpperCase(),room;
   if(req.url==='/create'){
    if(rooms.size>=200)throw fail(503,'Server full');do{code=randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(code));room=new Map();rooms.set(code,room)
   }else{room=rooms.get(code);if(!room)throw fail(404,'Room not found')}
   if(room.size>=6)throw fail(409,'Room full');
   const id=randomBytes(12).toString('hex'),token=randomBytes(24).toString('hex');
   const used=new Set([...room.values()].map(v=>v.slot));let slot=0;while(used.has(slot))slot++;
   room.set(id,{id,token,slot,name:String(data.name||'Beekeeper').replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,20)||'Beekeeper',seen:now,lastSync:0,state:null});
   return send(200,{code,id,token,slot,protocol:2});
  }
  const room=rooms.get(data.code),p=room?.get(data.id);
  if(!p||p.token!==data.token)throw fail(401,'Room session expired. Join again.');
  if(req.url==='/claim')return send(200,claimDrop(room,p,data.dropId,now));
  if(req.url==='/leave'){room.delete(p.id);return send(200,{ok:true,protocol:2})}
  if(req.url!=='/sync')throw fail(404,'Not found');
  if(now-p.lastSync<50)throw fail(429,'Too many updates');p.state=cleanState(data.state);p.seen=now;p.lastSync=now;
  const shared=updateWorld(room,p,data.state,now);
  return send(200,{protocol:2,abilitySync:1,...shared,peers:[...room.values()].filter(v=>v.id!==p.id).map(({id,name,state,slot})=>({id,name,state,slot})),names:[...room.values()].map(v=>v.name)});
 }catch(e){send(e.status||500,{error:e.status?e.message:'Server error'})}
});
if(process.env.NODE_ENV!=='test')server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('BSS room server ready'));
