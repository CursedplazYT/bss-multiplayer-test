(()=>{
'use strict';
let adapter=null,peers=[],session=null,busy=false,generation=0,counter=0;
const base=()=>String(window.BSS_MULTIPLAYER_SERVER||'').replace(/\/$/,'');
async function request(path,data){
 if(!base())throw Error('Server not configured.');
 const options={signal:AbortSignal.timeout(12000)};
 if(data!==undefined)Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const response=await fetch(base()+path,options);
 let result;try{result=await response.json()}catch{throw Error('Server waking up. Wait a minute and try again.')}
 if(!response.ok)throw Error(result.error||'Connection failed');return result;
}
function clear(){failedStages.clear();peers=[];adapter?.clear?.();adapter?.room?.(null)}
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
 const panel=document.createElement('details');panel.style.cssText='position:fixed;right:12px;top:65px;z-index:99999;background:#333e;color:white;padding:10px;border-radius:7px;font:14px Arial;max-width:270px';
 const summary=document.createElement('summary');summary.textContent='Multiplayer';panel.append(summary);
 const name=document.createElement('input');name.placeholder='Your name';name.maxLength=20;
 const code=document.createElement('input');code.placeholder='Room code';code.maxLength=6;
 const status=document.createElement('p');status.textContent='Offline • separate test saves';
 const list=document.createElement('p');
 for(const input of [name,code]){input.style.cssText='display:block;margin:8px 0;width:240px;height:25px;color:black;background:white;box-sizing:border-box';panel.append(input)}
 async function connect(create,roomCode=code.value){
  if(!adapter){status.textContent='Start your game first.';return}
  const old=session,gen=++generation;session=null;resetChat();clear();if(old)request('/leave',old).catch(()=>{});status.textContent='Connecting…';
  try{const result=await request(create?'/create':'/join',{name:name.value,code:roomCode});
   if(gen!==generation){request('/leave',result).catch(()=>{});return}
   if(result.protocol!==2){request('/leave',result).catch(()=>{});throw Error('Update the Render server files to version 2 first.')}
   session=result;adapter.room?.(result);code.value=result.code;status.textContent='Room '+result.code+' • connected';
   chat.hidden=false;
  }catch(e){if(gen===generation)status.textContent=e.message}
 }
 const buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:5px;flex-wrap:wrap';panel.append(buttons);
 function makeButton(label,onClick){
  const b=document.createElement('button');b.type='button';b.textContent=label;b.style.cssText='position:static;display:inline-block;width:auto;height:auto;min-height:30px;padding:5px 8px;margin:0;font:13px Arial;white-space:nowrap;color:#111;background:#eee';b.onclick=onClick;
  return b;
 }
 const chat=document.createElement('section');
 chat.setAttribute('aria-label','Room chat');
 chat.style.cssText='margin-top:10px;border-top:1px solid #777;padding-top:8px';
 const chatTitle=document.createElement('strong');
 chatTitle.textContent='Room chat';
 const chatLog=document.createElement('div');
 chatLog.setAttribute('role','log');
 chatLog.setAttribute('aria-label','Room messages');
 chatLog.tabIndex=0;
 chatLog.style.cssText='height:min(140px,22vh);overflow-y:auto;overflow-wrap:anywhere;user-select:text;background:#222;padding:6px;margin:6px 0;border-radius:4px';
 const chatStatus=document.createElement('div');
 chatStatus.setAttribute('role','status');
 chatStatus.style.cssText='font-size:12px;margin:4px 0';
 const chatForm=document.createElement('form');
 chatForm.style.cssText='display:flex;gap:5px;align-items:center';
 const chatInput=document.createElement('input');
 chatInput.placeholder='Message your room';
 chatInput.setAttribute('aria-label','Message your room');
 chatInput.maxLength=200;
 chatInput.autocomplete='off';
 chatInput.style.cssText='flex:1;min-width:0;color:#111;background:#fff;padding:0 6px';
 const chatSend=makeButton('Send',null);
 chatSend.type='submit';
 chatForm.append(chatInput,chatSend);
 chat.append(chatTitle,chatLog,chatForm,chatStatus);
 let chatAfter=0;
 function resetChat(){
  chat.hidden=true;
  chatAfter=0;
  chatLog.replaceChildren();
  chatInput.value='';
  chatInput.disabled=chatSend.disabled=true;
  chatStatus.textContent='';
 }
 resetChat();
 function receiveChat(messages){
  if(!Array.isArray(messages)){
   chatStatus.textContent='Room chat requires the updated server.';
   return;
  }
  chatInput.disabled=false;
  if(chatStatus.textContent==='Room chat requires the updated server.')chatStatus.textContent='';
  const atBottom=chatLog.scrollHeight-chatLog.scrollTop-chatLog.clientHeight<12;
  for(const {id,name,message} of messages){
   if(id<=chatAfter)continue;
   chatAfter=id;
   const line=document.createElement('div');
   const author=document.createElement('strong');
   author.textContent=name+': ';
   line.append(author,document.createTextNode(message));
   chatLog.append(line);
  }
  while(chatLog.childElementCount>50)chatLog.firstElementChild.remove();
  if(atBottom)chatLog.scrollTop=chatLog.scrollHeight;
 }
 let sending=false;
 chatInput.addEventListener('input',()=>{
  chatSend.disabled=sending||!chatInput.value.trim();
 });
 chatForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const current=session,gen=generation,draft=chatInput.value;
  if(!current||chatInput.disabled||sending||!draft.trim())return;
  sending=true;
  chatSend.disabled=true;
  chatStatus.textContent='';
  try{
   await request('/chat',{...current,message:draft});
   if(gen===generation&&chatInput.value===draft)chatInput.value='';
  }catch(error){
   if(gen===generation)chatStatus.textContent=error.message;
  }finally{
   sending=false;
   chatSend.disabled=chatInput.disabled||!chatInput.value.trim();
  }
 });
 const directory=document.createElement('div');
 directory.hidden=true;
 const directoryStatus=document.createElement('p');
 const roomList=document.createElement('div');
 roomList.style.cssText='max-height:40vh;overflow-y:auto';
 directory.append(directoryStatus,roomList);
 let listing=false,joining=false;
 async function refreshRooms(){
  if(!panel.open||directory.hidden||listing||joining)return;
  listing=true;
  try{
   const result=await request('/rooms');
   if(!Array.isArray(result.rooms))throw Error('The multiplayer server needs the Global rooms update.');
   directoryStatus.textContent=result.rooms.length?'Open rooms ('+result.rooms.length+')':'No open rooms. Create one to play.';
   roomList.replaceChildren();
   for(const room of result.rooms){
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 0';
    const label=document.createElement('span');
    label.textContent=room.code+' • '+room.players+'/'+room.capacity;
    const inRoom=session?.code===room.code;
    const join=makeButton(inRoom?'Joined':'Join',async()=>{
     if(joining||session?.code===room.code)return;
     joining=true;
     join.disabled=true;
     try{await connect(false,room.code)}finally{
      joining=false;
      join.disabled=session?.code===room.code;
      refreshRooms();
     }
    });
    join.disabled=inRoom;
    row.append(label,join);
    roomList.append(row);
   }
  }catch(error){
   roomList.replaceChildren();
   directoryStatus.textContent='Could not load rooms. '+error.message;
  }finally{listing=false}
 }
 const globalButton=makeButton('Global',()=>{
  directory.hidden=!directory.hidden;
  globalButton.setAttribute('aria-expanded',String(!directory.hidden));
  if(!directory.hidden){
   directoryStatus.textContent='Loading open rooms…';
   roomList.replaceChildren();
   refreshRooms();
  }
 });
 globalButton.setAttribute('aria-expanded','false');
 for(const [label,fn]of [['Create Room',()=>connect(true)],['Join Room',()=>connect(false)],['Leave',()=>{generation++;const old=session;session=null;resetChat();clear();list.textContent='';status.textContent='Offline';if(old)request('/leave',old).catch(()=>{})}]]){
  buttons.append(makeButton(label,fn));
 }
 buttons.append(globalButton);
 panel.append(status,list,chat,directory);document.body.append(panel);
 panel.addEventListener('toggle',refreshRooms);
 setInterval(refreshRooms,5000);
 for(const event of ['keydown','keyup','pointerdown','touchstart'])panel.addEventListener(event,e=>e.stopPropagation());
 setInterval(async()=>{
  if(!session||!adapter||busy)return;busy=true;const current=session,gen=generation;
  try{const result=await request('/sync',{...current,state:adapter.snapshot(),chatAfter});if(gen===generation){
   receiveChat(result.chat);peers=result.peers;adapter.receive?.(result);list.textContent='Players: '+result.names.join(', ');status.textContent='Room '+current.code+' • connected';
  }}catch(e){if(gen===generation){peers=[];status.textContent='Connection lost: '+e.message}}finally{busy=false}
 },250);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
