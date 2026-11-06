// Session-scoped world state. Clients never receive another player's session token.
const MAX_SPROUT={basic:50000,rare:150000,epic:500000,legendary:1500000,supreme:3000000,gummy:750000,moon:100000,festive:5000000};
const word=x=>typeof x==='string'&&/^[a-zA-Z][a-zA-Z0-9]{0,49}$/.test(x);
const number=(x,max=100000)=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=max;
const pos=x=>Array.isArray(x)&&x.length===3&&x.every(v=>number(v));
export function cleanExtras(s){
 const bees=(Array.isArray(s.bees)?s.bees:[]).slice(0,60).filter(b=>word(b.type)&&pos(b.pos)&&pos(b.dir)).map(b=>({type:b.type,pos:b.pos,dir:b.dir,gifted:!!b.gifted}));
 const hive=(Array.isArray(s.hive)?s.hive:[]).slice(0,20).map(row=>(Array.isArray(row)?row:[]).slice(0,10).map(b=>b&&word(b.type)?{type:b.type,gifted:!!b.gifted,level:Math.max(1,Math.min(100,Math.floor(b.level)||1))}:null));
 const planters=(Array.isArray(s.planters)?s.planters:[]).slice(0,3).filter(p=>['paper','plastic','candy','redClay','blueClay','tacky','pesticide','petal','plenty'].includes(p.type)&&pos(p.pos)&&number(p.progress,1)&&p.progress>=0).map(p=>({type:p.type,pos:p.pos,progress:p.progress,glistering:!!p.glistering}));
 const coconuts=(Array.isArray(s.coconuts)?s.coconuts:[]).slice(0,40).filter(c=>c&&typeof c.id==='string'&&/^[0-9]{1,12}$/.test(c.id)&&pos(c.pos)&&number(c.ground)&&number(c.velocity,2000)&&number(c.delay,10)&&c.delay>=0&&number(c.size,10)&&c.size>0&&number(c.gravity,100000)&&c.gravity>0&&number(c.terminal,2000)&&c.terminal>0).map(c=>({id:c.id,bounce:Math.max(0,Math.min(100,Math.floor(c.bounce)||0)),pos:c.pos.slice(),ground:c.ground,velocity:c.velocity,delay:c.delay,size:c.size,combo:!!c.combo,gravity:c.gravity,terminal:c.terminal}));
 const abilityId=x=>typeof x==='string'&&/^[0-9]{1,12}$/.test(x);
 const balloons=(Array.isArray(s.balloons)?s.balloons:[]).slice(0,80).filter(b=>b&&abilityId(b.id)&&pos(b.pos)&&number(b.size,100)&&b.size>0).map(b=>({id:b.id,pos:b.pos.slice(),size:b.size,golden:!!b.golden}));
 const h=s.hiveBalloon,hiveBalloon=h&&pos(h.pos)&&number(h.size,100)&&h.size>0?{pos:h.pos.slice(),size:h.size}:null;
 const frogs=(Array.isArray(s.frogs)?s.frogs:[]).slice(0,60).filter(f=>f&&abilityId(f.id)&&pos(f.pos)&&word(f.field)&&number(f.angle,100)&&number(f.jumps,100000)&&f.jumps>=0).map(f=>({id:f.id,pos:f.pos.slice(),field:f.field,angle:f.angle,gifted:!!f.gifted,jumps:Math.floor(f.jumps)}));
 const bubbles=(Array.isArray(s.bubbles)?s.bubbles:[]).slice(0,200).filter(b=>b&&abilityId(b.id)&&word(b.field)&&Number.isInteger(b.x)&&Number.isInteger(b.z)&&b.x>=0&&b.z>=0&&b.x<1000&&b.z<1000&&number(b.life,10)&&b.life>0).map(b=>({id:b.id,field:b.field,x:b.x,z:b.z,life:b.life,golden:!!b.golden}));
 const stars=(Array.isArray(s.stars)?s.stars:[]).slice(0,40).filter(t=>t&&abilityId(t.id)&&['popStar','scorchingStar','gummyStar','starSaw','guidingStar','levitatingStarShower','fallingStar'].includes(t.type)&&pos(t.pos)&&number(t.angle,100000)&&number(t.size,100)&&t.size>0&&number(t.life,1000)&&t.life>0).map(t=>({id:t.id,type:t.type,pos:t.pos.slice(),angle:t.angle,size:t.size,life:t.life}));
 return {bees,hive,planters,coconuts,balloons,hiveBalloon,frogs,bubbles,stars};
}
export function world(room){return room.world||(room.world={sprouts:new Map(),drops:new Map(),bubblePops:new Map()})}
export function updateWorld(room,p,s,now){
 const w=world(room);
 for(const [key,expires]of w.bubblePops)if(expires<now)w.bubblePops.delete(key);
 for(const key of (Array.isArray(s.bubblePops)?s.bubblePops:[]).slice(0,1000)){
  if(typeof key!=='string'||!/^([a-f0-9]{24}):([0-9]{1,12})$/.test(key))continue;
  const [owner,id]=key.split(':');
  if(w.bubblePops.has(key))continue;
  const bubble=room.get(owner)?.state?.bubbles?.find(b=>b.id===id);
  if(owner!==p.id&&!bubble)continue;
  if(w.bubblePops.size<5000)w.bubblePops.set(key,now+60000);
 }
 for(const [id,d]of w.drops)if(d.expires<now)w.drops.delete(id);
 for(const [id,sp]of w.sprouts)if(now-sp.seen>60000||!room.has(sp.owner))w.sprouts.delete(id);
 const ownedId=id=>typeof id==='string'&&id.startsWith(p.id+':')&&id.length<100;
 for(const sp of (Array.isArray(s.sprouts)?s.sprouts:[]).slice(0,20)){
  if(!ownedId(sp.id)||!MAX_SPROUT[sp.type]||!word(sp.field)||!pos(sp.pos))continue;
  if(!w.sprouts.has(sp.id)&&w.sprouts.size<40)w.sprouts.set(sp.id,{id:sp.id,owner:p.id,type:sp.type,field:sp.field,pos:sp.pos,remaining:number(sp.remaining,MAX_SPROUT[sp.type])&&sp.remaining>=0?sp.remaining:MAX_SPROUT[sp.type],amount:MAX_SPROUT[sp.type],seen:now});
  const current=w.sprouts.get(sp.id);if(current)current.seen=now;
 }
 const pollen={};for(const [field,value]of Object.entries(s.fieldPollen||{}))if(word(field)&&number(value,1e100)&&value>=0)pollen[field]=value;
 for(const sp of w.sprouts.values()){
  const previous=p.fieldPollen?.[sp.field],current=pollen[sp.field];
  if(number(previous,1e100)&&number(current,1e100)&&current>previous)sp.remaining=Math.max(0,sp.remaining-Math.min(current-previous,sp.amount));
 }
 p.fieldPollen=pollen;
 for(const d of (Array.isArray(s.drops)?s.drops:[]).slice(0,300)){
  if(!ownedId(d.id)||!word(d.type)||!pos(d.pos)||!number(d.amount,1e9)||d.amount<=0||!number(d.life,60)||d.life<=0||!['Sprout','Planter'].includes(d.source))continue;
  if(w.drops.has(d.id))continue;
  if(w.drops.size>=1500)break;
  w.drops.set(d.id,{id:d.id,owner:p.id,ownerName:p.name,type:d.type,pos:d.pos,amount:d.amount,source:d.source,expires:now+Math.min(d.life,60)*1000,claimedBy:null});
 }
 return {poppedBubbles:[...w.bubblePops.keys()],sprouts:[...w.sprouts.values()],drops:[...w.drops.values()].filter(d=>!d.claimedBy).map(d=>({...d,life:Math.max(0,(d.expires-now)/1000)}))};
}
export function claimDrop(room,p,id,now){
 const d=world(room).drops.get(id);
 if(!d||d.expires<=now||d.claimedBy)return {granted:false};
 if(d.source==='Planter'&&d.owner!==p.id)return {granted:false,private:true};
 const position=p.state?.position;
 if(!position||Math.hypot(...d.pos.map((n,i)=>n-position[i]))>6)return {granted:false};
 // Atomic claim in this single server process; a duplicate request never grants again.
 d.claimedBy=p.id;return {granted:true,drop:{id:d.id,type:d.type,amount:d.amount,source:d.source}};
}
