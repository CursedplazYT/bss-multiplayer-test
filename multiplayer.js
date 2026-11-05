(()=>{
'use strict';
let adapter=null,peers=[],session=null,busy=false,generation=0,counter=0;
const base=()=>String(window.BSS_MULTIPLAYER_SERVER||'').replace(/\/$/,'');
async function request(path,data){
 if(!base())throw Error('Server not configured.');
 const response=await fetch(base()+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(12000)});
 let result;try{result=await response.json()}catch{throw Error('Server waking up. Wait a minute and try again.')}
 if(!response.ok)throw Error(result.error||'Connection failed');return result;
}
function clear(){peers=[];adapter?.clear?.();adapter?.room?.(null)}
window.BSSMultiplayer={
 attach(value){adapter=value},draw(){adapter?.draw(peers)},hives(){adapter?.hives?.(peers)},bees(){adapter?.bees?.(peers)},world(){adapter?.world?.(peers)},
 active:()=>!!session,id:()=>session?.id,uid:()=>session?session.id+':'+(++counter):null,
 async claim(dropId){const current=session,gen=generation;if(!current)return {granted:false};const result=await request('/claim',{...current,dropId});return gen===generation?result:{granted:false}}
};
function mount(){
 const panel=document.createElement('details');panel.style.cssText='position:fixed;right:12px;top:65px;z-index:99999;background:#333e;color:white;padding:10px;border-radius:7px;font:14px Arial;max-width:270px';
 const summary=document.createElement('summary');summary.textContent='Multiplayer';panel.append(summary);
 const name=document.createElement('input');name.placeholder='Your name';name.maxLength=20;
 const code=document.createElement('input');code.placeholder='Room code';code.maxLength=6;
 const status=document.createElement('p');status.textContent='Offline • separate test saves';
 const list=document.createElement('p');
 for(const input of [name,code]){input.style.cssText='display:block;margin:8px 0;width:240px;height:25px;color:black;background:white;box-sizing:border-box';panel.append(input)}
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
 for(const [label,fn]of [['Create Room',()=>connect(true)],['Join Room',()=>connect(false)],['Leave',()=>{generation++;const old=session;session=null;clear();list.textContent='';status.textContent='Offline';if(old)request('/leave',old).catch(()=>{})}]]){
  const b=document.createElement('button');b.textContent=label;b.style.cssText='position:static;display:inline-block;width:auto;height:auto;min-height:30px;padding:5px 8px;margin:0;font:13px Arial;white-space:nowrap;color:#111;background:#eee';b.onclick=fn;buttons.append(b)
 }
 panel.append(status,list);document.body.append(panel);
 for(const event of ['keydown','keyup','pointerdown','touchstart'])panel.addEventListener(event,e=>e.stopPropagation());
 setInterval(async()=>{
  if(!session||!adapter||busy)return;busy=true;const current=session,gen=generation;
  try{const result=await request('/sync',{...current,state:adapter.snapshot()});if(gen===generation){
   peers=result.peers;adapter.receive?.(result);list.textContent='Players: '+result.names.join(', ');status.textContent='Room '+current.code+' • connected';
  }}catch(e){if(gen===generation){peers=[];status.textContent='Connection lost: '+e.message}}finally{busy=false}
 },250);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
