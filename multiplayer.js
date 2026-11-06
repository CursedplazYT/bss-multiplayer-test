(()=>{
'use strict';
let adapter=null,peers=[],session=null,busy=false,generation=0,counter=0;
const motionReceived=new Map();
const base=()=>String(window.BSS_MULTIPLAYER_SERVER||'').replace(/\/$/,'');
async function request(path,data){
 if(!base())throw Error('Server not configured.');
 const response=await fetch(base()+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(12000)});
 let result;try{result=await response.json()}catch{throw Error('Server waking up. Wait a minute and try again.')}
 if(!response.ok)throw Error(result.error||'Connection failed');return result;
}
function clear(){failedStages.clear();motionReceived.clear();peers=[];adapter?.clear?.();adapter?.room?.(null)}
// Keep a replica rendering error from terminating the main game frame.
const failedStages=new Set();
function reportStage(stage,error){
 console.error('[Multiplayer '+stage+']',error);
 let box=document.getElementById('bss-mp-render-error');
 if(!box){box=document.createElement('div');box.id='bss-mp-render-error';box.style.cssText='position:fixed;left:12px;bottom:90px;z-index:100000;max-width:600px;padding:10px;background:#600;color:white;font:13px monospace;white-space:pre-wrap;pointer-events:auto';document.body.append(box)}
 box.textContent='Multiplayer rendering error ('+stage+'). Your game can keep running.\n'+String(error?.stack||error).slice(0,1400)+'\nSend a screenshot of this message.';
}
function renderStage(stage){
 if(failedStages.has(stage))return;
 try{adapter?.[stage]?.(peers)}catch(error){failedStages.add(stage);reportStage(stage,error)}
}
window.BSSMultiplayer={
 attach(value){adapter=value},draw(){renderStage('draw')},hives(){renderStage('hives')},bees(){renderStage('bees')},world(){renderStage('world')},
 active:()=>!!session,id:()=>session?.id,uid:()=>session?session.id+':'+(++counter):null,
 async claim(dropId){const current=session,gen=generation;if(!current)return {granted:false};const result=await request('/claim',{...current,dropId});return gen===generation?result:{granted:false}}
};
function mount(){
 const panel=document.createElement('details');panel.style.cssText='position:fixed;right:12px;top:65px;z-index:99999;background:rgba(24,29,36,.94);color:#f1f5f9;padding:12px;border:1px solid #536170;border-radius:10px;font:13px/1.45 Arial;width:270px;max-width:calc(100vw - 48px);box-shadow:0 5px 20px #0005';
 const summary=document.createElement('summary');summary.textContent='Multiplayer';summary.style.cssText='cursor:pointer;font-weight:700';panel.append(summary);
 const name=document.createElement('input');name.placeholder='Your name';name.maxLength=20;
 const code=document.createElement('input');code.placeholder='Room code';code.maxLength=6;
 const status=document.createElement('p');status.textContent='Not connected';status.style.cssText='margin:10px 0 4px;color:#b8c7d8';
 const list=document.createElement('p');list.style.cssText='margin:4px 0 0;color:#dce6f1;overflow-wrap:anywhere';
 for(const input of [name,code]){input.style.cssText='display:block;margin:10px 0;width:100%;height:34px;padding:6px 9px;color:#f8fafc;background:#111820;border:1px solid #536170;border-radius:5px;box-sizing:border-box;font:13px Arial';panel.append(input)}
 async function connect(create){
  if(!adapter){status.textContent='Start your game first.';return}
  const old=session,gen=++generation;session=null;clear();if(old)request('/leave',old).catch(()=>{});status.textContent='Connecting…';
  try{const result=await request(create?'/create':'/join',{name:name.value,code:code.value});
   if(gen!==generation){request('/leave',result).catch(()=>{});return}
   if(result.protocol!==2){request('/leave',result).catch(()=>{});throw Error('Update the Render server files to version 2 first.')}
   session=result;adapter.room?.(result);code.value=result.code;status.textContent='Room '+result.code+' • connected';
  }catch(e){if(gen===generation)status.textContent=e.message}
 }
 const buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:5px;flex-wrap:wrap';panel.append(buttons);
 for(const [label,fn]of [['Create Room',()=>connect(true)],['Join Room',()=>connect(false)],['Leave',()=>{generation++;const old=session;session=null;clear();list.textContent='';status.textContent='Not connected';summary.textContent='Multiplayer';if(old)request('/leave',old).catch(()=>{})}]]){
  const b=document.createElement('button');b.textContent=label;b.style.cssText='position:static;display:inline-block;width:auto;height:auto;min-height:30px;padding:6px 10px;margin:0;font:13px Arial;white-space:nowrap;color:#f1f5f9;background:#34465a;border:1px solid #60758c;border-radius:5px;cursor:pointer';b.onclick=fn;buttons.append(b)
 }
 panel.append(status,list);document.body.append(panel);
 for(const event of ['keydown','keyup','pointerdown','touchstart'])panel.addEventListener(event,e=>e.stopPropagation());
 setInterval(async()=>{
  if(!session||!adapter||busy)return;busy=true;const current=session,gen=generation;
  const sentAt=performance.now();
  try{const result=await request('/sync',{...current,state:adapter.snapshot()});if(gen===generation){
   const receivedAt=performance.now(),present=new Set();
   for(const peer of result.peers){
    present.add(peer.id);if(!peer.state)continue;
    const key=peer.state.motionSeq??JSON.stringify([peer.state.position,peer.state.rotation]);
    const old=motionReceived.get(peer.id);
    const receipt=old&&old.key===key?old:{key,time:receivedAt,samples:[...(old?.samples||[]),{time:receivedAt,position:peer.state.position.slice(),rotation:peer.state.rotation.slice(),velocity:peer.state.velocity?.slice()}].slice(-12)};motionReceived.set(peer.id,receipt);
    peer.state._receivedAt=receipt.time;peer.state._rtt=receivedAt-sentAt;
    peer.state._motionSamples=receipt.samples;
   }
   for(const id of motionReceived.keys())if(!present.has(id))motionReceived.delete(id);
   peers=result.peers;adapter.receive?.(result);list.textContent='Players: '+result.names.join(', ');
   if(result.abilitySync!==1)status.textContent='Connected, but the server needs an update for frogs, bubbles and coconuts. Redeploy the updated server files.';
   else if(result.sharedVisuals!==2)status.textContent='Connected. Update server/server.mjs and server/world.mjs for shared bubble pops and stars.';
   else if(result.swingSync!==1)status.textContent='Connected. Deploy the latest server/server.mjs to enable item swings.';
   else if(peers.some(p=>p.state&&p.state.swingVersion!==1))status.textContent='Connected. A friend must refresh their page to share item swings.';
   else if(peers.some(p=>p.state&&(!Array.isArray(p.state.frogs)||!Array.isArray(p.state.coconuts))))status.textContent='Connected. A friend needs to refresh their game to share frogs and coconuts.';
   else status.textContent='Room '+current.code+' • shared abilities ready';
   summary.textContent='Multiplayer · '+result.names.length+' online';
  }}catch(e){if(gen===generation){status.textContent='Reconnecting: '+e.message}}finally{busy=false}
 },75);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
