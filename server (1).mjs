import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {cleanExtras,updateWorld,claimDrop} from './world.mjs';
const rooms=new Map();
const roomChats=new WeakMap();
const roomCapacity=6;
const chatHistoryLimit=50;
const chatMessageLimit=200;
const origin=process.env.ALLOWED_ORIGIN||'https://cursedplazyt.github.io';
const fail=(status,message)=>Object.assign(new Error(message),{status});
function cleanState(s){
 if(!s||!Array.isArray(s.position)||s.position.length!==3||!s.position.every(n=>Number.isFinite(n)&&Math.abs(n)<100000))throw fail(400,'Invalid position');
 if(!Array.isArray(s.rotation)||s.rotation.length!==4||!s.rotation.every(Number.isFinite))throw fail(400,'Invalid rotation');
 const length=Math.hypot(...s.rotation);if(length<0.5||length>1.5)throw fail(400,'Invalid rotation');
 const gear={};for(const [k,v]of Object.entries(s.gear||{}))if(/^[a-zA-Z]{1,30}$/.test(k)&&typeof v==='string'&&/^[a-zA-Z0-9]{1,50}$/.test(v))gear[k]=v;
 return {position:s.position,rotation:s.rotation.map(n=>n/length),gear,...cleanExtras(s)};
}
function pruneRooms(now){
 for(const [code,room] of rooms){
  for(const [id,player] of room){
   if(now-player.seen>30000)room.delete(id);
  }
  if(!room.size)rooms.delete(code);
 }
}
export const server=http.createServer(async(req,res)=>{
 const headers={'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Cache-Control':'no-store'};
 function send(status,body){res.writeHead(status,headers);res.end(JSON.stringify(body))}
 if(req.headers.origin&&req.headers.origin!==origin)return send(403,{error:'Origin blocked'});
 if(req.method==='OPTIONS'){res.writeHead(204,headers);return res.end()}
 if(req.method==='GET'&&req.url==='/health')return send(200,{ok:true,protocol:2});
 if(req.method==='GET'&&req.url==='/rooms'){
  pruneRooms(Date.now());
  const openRooms=[];
  for(const [code,room] of rooms){
   if(room.size<roomCapacity)openRooms.push({code,players:room.size,capacity:roomCapacity});
  }
  return send(200,{rooms:openRooms});
 }
 if(req.method!=='POST')return send(405,{error:'POST required'});
 try{
  let text='';for await(const chunk of req){text+=chunk;if(text.length>100000)throw fail(413,'Request too large')}
  let data;try{data=JSON.parse(text)}catch{throw fail(400,'Invalid JSON')}
  const now=Date.now();
  pruneRooms(now);
  if(req.url==='/create'||req.url==='/join'){
   let code=String(data.code||'').toUpperCase(),room;
   if(req.url==='/create'){
    if(rooms.size>=200)throw fail(503,'Server full');do{code=randomBytes(3).toString('hex').toUpperCase()}while(rooms.has(code));room=new Map();rooms.set(code,room)
    roomChats.set(room,{nextId:1,messages:[]});
   }else{room=rooms.get(code);if(!room)throw fail(404,'Room not found')}
   if(room.size>=roomCapacity)throw fail(409,'Room full');
   const id=randomBytes(12).toString('hex'),token=randomBytes(24).toString('hex');
   const used=new Set([...room.values()].map(v=>v.slot));let slot=0;while(used.has(slot))slot++;
   room.set(id,{id,token,slot,name:String(data.name||'Beekeeper').replace(/[^a-zA-Z0-9 _-]/g,'').slice(0,20)||'Beekeeper',seen:now,lastSync:0,state:null});
   return send(200,{code,id,token,slot,protocol:2});
  }
  const room=rooms.get(data.code),p=room?.get(data.id);
  if(!p||p.token!==data.token)throw fail(401,'Room session expired. Join again.');
  const chat=roomChats.get(room);
  if(req.url==='/chat'){
   if(typeof data.message!=='string')throw fail(400,'Enter a message.');
   const message=data.message.trim();
   if(!message||message.length>chatMessageLimit)throw fail(400,'Enter 1–200 characters.');
   if(now-(p.lastChat??0)<750)throw fail(429,'Wait a moment before sending another message.');
   p.lastChat=now;
   chat.messages.push({id:chat.nextId++,name:p.name,message});
   if(chat.messages.length>chatHistoryLimit)chat.messages.shift();
   return send(200,{ok:true});
  }
  if(req.url==='/claim')return send(200,claimDrop(room,p,data.dropId,now));
  if(req.url==='/leave'){room.delete(p.id);return send(200,{ok:true,protocol:2})}
  if(req.url!=='/sync')throw fail(404,'Not found');
  if(now-p.lastSync<80)throw fail(429,'Too many updates');p.state=cleanState(data.state);p.seen=now;p.lastSync=now;
  const shared=updateWorld(room,p,data.state,now);
  const after=Number.isSafeInteger(data.chatAfter)&&data.chatAfter>=0?data.chatAfter:0;
  const messages=data.chatAfter===undefined?[]:chat.messages.filter(message=>message.id>after);
  return send(200,{protocol:2,...shared,chat:messages,peers:[...room.values()].filter(v=>v.id!==p.id).map(({id,name,state,slot})=>({id,name,state,slot})),names:[...room.values()].map(v=>v.name)});
 }catch(e){send(e.status||500,{error:e.status?e.message:'Server error'})}
});
if(process.env.NODE_ENV!=='test')server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('BSS room server ready'));
