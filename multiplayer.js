(()=>{
'use strict';
let adapter=null,peers=[],session=null,busy=false,generation=0;
const base=()=>String(window.BSS_MULTIPLAYER_SERVER||'').replace(/\/$/,'');
async function request(path,data){
 if(!base())throw Error('Server not configured. Follow MULTIPLAYER-SETUP.txt first.');
 const response=await fetch(base()+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:AbortSignal.timeout(8000)});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Connection failed');return result;
}
window.BSSMultiplayer={attach(value){adapter=value},draw(){if(adapter)adapter.draw(peers)}};
function mount(){
 const panel=document.createElement('details');panel.style.cssText='position:fixed;right:12px;top:65px;z-index:99999;background:#333e;color:white;padding:10px;border-radius:7px;font:14px Arial;max-width:260px';
 const summary=document.createElement('summary');summary.textContent='Multiplayer';panel.append(summary);
 const name=document.createElement('input');name.placeholder='Your name';name.maxLength=20;
 const code=document.createElement('input');code.placeholder='Room code';code.maxLength=6;
 const status=document.createElement('p');status.textContent='Offline • separate test saves';
 const list=document.createElement('p');
 for(const input of [name,code]){input.style.cssText='display:block;margin:8px 0;width:230px';panel.append(input)}
 async function connect(create){
  if(!adapter){status.textContent='Start your game first.';return}
  const gen=++generation;session=null;peers=[];status.textContent='Connecting…';
  try{const result=await request(create?'/create':'/join',{name:name.value,code:code.value});if(gen!==generation)return;session=result;code.value=result.code;status.textContent='Room '+result.code+' • connected'}catch(e){if(gen===generation)status.textContent=e.message}
 }
 for(const [label,fn]of [['Create Room',()=>connect(true)],['Join Room',()=>connect(false)],['Leave',()=>{generation++;const old=session;session=null;peers=[];list.textContent='';status.textContent='Offline';if(old)request('/leave',old).catch(()=>{})}]]){const b=document.createElement('button');b.textContent=label;b.onclick=fn;panel.append(b)}
 panel.append(status,list);document.body.append(panel);
 for(const event of ['keydown','keyup','pointerdown','touchstart'])panel.addEventListener(event,e=>e.stopPropagation());
 setInterval(async()=>{
  if(!session||!adapter||busy)return;busy=true;const current=session,gen=generation;
  try{const result=await request('/sync',{...current,state:adapter.snapshot()});if(gen===generation){peers=result.peers;list.textContent='Players: '+result.names.join(', ');status.textContent='Room '+current.code+' • connected'}}catch(e){if(gen===generation){peers=[];status.textContent='Connection lost: '+e.message}}finally{busy=false}
 },200);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
