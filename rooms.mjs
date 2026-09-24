import {randomUUID,randomBytes} from 'node:crypto';
import {createWorld,step,countItems,castleInvaded} from './sim.js';
import {visibleTo,allied} from './castle.js';

const ACTIONS=['hit','throw','grab','buy','jump','door'];
export function sanitizeInput(raw={}){
 if(!raw||typeof raw!=='object')raw={};
 const number=(n,limit)=>Number.isFinite(n)?Math.max(-limit,Math.min(limit,n)):0;
 const out={x:number(raw.x,1),z:number(raw.z,1),sprint:raw.sprint===true};
 if(raw.aim&&Number.isFinite(raw.aim.x)&&Number.isFinite(raw.aim.z))out.aim={x:number(raw.aim.x,200),z:number(raw.aim.z,200)};
 for(const key of ACTIONS)out[key]=raw[key]===true;
 if(Number.isInteger(raw.floor)&&raw.floor>=0&&raw.floor<3)out.floor=raw.floor;
 return out;
}
export function snapshotFor(w,id){
 const p=w.players[id];
 const players=w.players.map(v=>v.id===id||visibleTo(w,p,v)?{...v,goal:null}:({id:v.id,name:v.name,gold:v.gold,color:v.color,team:v.team,bot:v.bot,hidden:true,x:0,z:0,floor:0,y:0,vx:0,vz:0,angle:0,held:null,stats:w.winner!==null?v.stats:{}}));
 return {mode:w.mode,radius:w.radius,ring:w.ring,me:id,time:w.time,players,replicated:true,homeInvaded:castleInvaded(w,id),
  bases:w.bases.map(b=>({...b,count:countItems(w,b.id),locked:b.locked,manualOpen:undefined,wasLocked:undefined})),
  items:w.items.filter(i=>i.holder===id||visibleTo(w,p,i)),coins:w.coins.filter(i=>visibleTo(w,p,i)),shots:w.shots.filter(i=>i.owner===id||visibleTo(w,p,i)),
  claimant:w.claimant,claimTime:w.claimTime,winner:w.winner,winnerTeam:w.winnerTeam,
  events:w.events.filter(e=>e.type==='win'||e.type==='claim'||e.player===id||e.victim===id||(Number.isFinite(e.x)&&visibleTo(w,p,e))) };
}
export function createRooms(){
 const rooms=new Map(),clients=new Map();
 const send=(c,m)=>{if(c?.ws?.readyState===1&&c.ws.bufferedAmount<256*1024)c.ws.send(JSON.stringify(m));};
 const error=(c,message)=>send(c,{type:'error',message});
 const lobby=r=>({type:'lobby',code:r.code,mode:r.mode,state:r.state,host:clients.get(r.host)?.id,seats:r.seats.map((token,i)=>{const c=clients.get(token);return{slot:i,team:i%2,name:c?.name||'Bot-'+(i+1),id:c?.id||null,online:!!c?.ws};})});
 const broadcast=r=>{for(const token of r.seats)send(clients.get(token),lobby(r));};
 function startClient(r,c){send(c,{type:'start',world:snapshotFor(r.world,c.slot)});}
 function leave(c){const r=rooms.get(c.room);if(!r)return;c.room=null;const i=r.seats.indexOf(c.token);if(i>=0){r.seats[i]=null;if(r.world){r.world.players[i].bot=true;r.world.players[i].name='Bot-'+(i+1);delete r.inputs[i];}}
  if(r.host===c.token)r.host=r.seats.find(t=>clients.get(t)?.ws)||r.seats.find(Boolean)||null;
  if(!r.seats.some(Boolean))rooms.delete(r.code);else broadcast(r);
 }
 function occupy(r,c,slot){if(r.seats[slot]||slot<0||slot>9||(r.mode==='coop'&&slot%2))return false;const old=r.seats.indexOf(c.token);if(old>=0)r.seats[old]=null;r.seats[slot]=c.token;c.slot=slot;c.room=r.code;if(r.world){Object.assign(r.world.players[slot],{bot:false,name:c.name});delete r.inputs[slot];}return true;}
 function begin(r){r.world=createWorld(71,{mode:r.mode});r.inputs={};r.state='playing';for(const p of r.world.players){const c=clients.get(r.seats[p.id]);p.bot=!c?.ws;if(c)p.name=c.name;}
  for(const t of r.seats){const c=clients.get(t);if(c?.ws)startClient(r,c);}broadcast(r);
 }
 const timer=setInterval(()=>{
  const now=Date.now();for(const c of clients.values())if(!c.ws&&now-c.disconnected>60000){leave(c);clients.delete(c.token);}
  for(const r of rooms.values()){
   if(r.state!=='playing'||!r.seats.some(t=>clients.get(t)?.ws))continue;
   const inputs={};for(const [id,v]of Object.entries(r.inputs)){inputs[id]=now-v.at<350?{...v.input}:{};for(const k of ACTIONS)v.input[k]=false;delete v.input.floor;}
   step(r.world,1/30,{},inputs);r.tick++;
   if(r.tick%2===0||r.world.winner!==null){for(const t of r.seats){const c=clients.get(t);if(c?.ws)send(c,{type:'snapshot',world:snapshotFor(r.world,c.slot)});}r.world.events.length=0;}
   if(r.world.winner!==null){r.state='ended';broadcast(r);}
  }
 },1000/30);timer.unref();
 return {stats:()=>({rooms:rooms.size,online:[...clients.values()].filter(c=>c.ws).length}),close:()=>clearInterval(timer),attach(ws){
  let c=null,packets=0,windowStart=Date.now();
  ws.on('message',data=>{
   if(Date.now()-windowStart>1000){windowStart=Date.now();packets=0;}if(++packets>100)return;
   let m;try{m=JSON.parse(String(data));}catch{return;}if(!m||typeof m!=='object')return;
   if(m.type==='hello'){
    if(c)return;const old=typeof m.token==='string'?clients.get(m.token):null;
    if(old&&!old.ws){c=old;c.ws=ws;c.disconnected=0;}else{c={id:randomUUID(),token:randomUUID(),name:String(m.name||'Kale Taşımacılık').slice(0,16),ws,room:null,slot:0};clients.set(c.token,c);}
    send(c,{type:'welcome',id:c.id,token:c.token});const r=rooms.get(c.room);if(r){if(r.world){r.world.players[c.slot].bot=false;startClient(r,c);}broadcast(r);}return;
   }
   if(!c)return;
   if(m.type==='ping'){send(c,{type:'pong',at:m.at});return;}
   if(m.type==='leave'){leave(c);send(c,{type:'left'});return;}
   if(m.type==='create'){
    if(rooms.size>=32)return error(c,'Oda sınırına ulaşıldı.');leave(c);const code=randomBytes(3).toString('hex').toUpperCase();const r={code,mode:m.mode==='coop'?'coop':'pvp',host:c.token,seats:Array(10).fill(null),state:'lobby',world:null,inputs:{},tick:0};rooms.set(code,r);occupy(r,c,0);broadcast(r);return;
   }
   if(m.type==='join'){
    const r=rooms.get(String(m.code||'').toUpperCase());if(!r)return error(c,'Oda bulunamadı.');if(c.room===r.code){broadcast(r);return;}
    const slot=r.seats.findIndex((t,i)=>!t&&(r.mode==='pvp'||i%2===0));if(slot<0)return error(c,'Bu odada boş oyuncu koltuğu yok.');leave(c);occupy(r,c,slot);broadcast(r);if(r.world)startClient(r,c);return;
   }
   const r=rooms.get(c.room);if(!r)return;
   if(m.type==='seat'&&r.state==='lobby'){if(!Number.isInteger(m.slot)||!occupy(r,c,m.slot))error(c,'Bu koltuğa geçilemiyor.');else broadcast(r);}
   if(m.type==='start'&&r.host===c.token&&r.state==='lobby')begin(r);
   if(m.type==='rematch'&&r.host===c.token&&r.state==='ended'){r.world=null;r.state='lobby';broadcast(r);}
   if(m.type==='input'&&r.state==='playing'){
    const next=sanitizeInput(m.input),old=r.inputs[c.slot]?.input;for(const k of ACTIONS)next[k]=next[k]||old?.[k]||false;if(next.floor===undefined&&old?.floor!==undefined)next.floor=old.floor;r.inputs[c.slot]={input:next,at:Date.now()};
   }
  });
  ws.on('close',()=>{if(!c||c.ws!==ws)return;c.ws=null;c.disconnected=Date.now();const r=rooms.get(c.room);if(r){if(r.world){r.world.players[c.slot].bot=true;delete r.inputs[c.slot];}if(r.host===c.token)r.host=r.seats.find(t=>clients.get(t)?.ws)||c.token;broadcast(r);}});
  ws.on('error',()=>{});
 }};
}
