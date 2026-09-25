import {CASTLE,worldPoint,localPoint,allied,castleAt,roomAt,roomPoint,visibleTo,collide,clearSight,useStairs,route} from './castle.js';
export const RULES = Object.freeze({radius:59,baseRadius:12,speed:6.6,carrySpeed:5.3,sprint:1.23,accel:19,pushDrag:8,stun:10,maxStun:30,stunExtend:1,hp:3,target:10,teamTarget:20,winHold:60,price:15,stunGold:5,treeGold:2,hardBotTreeGold:4,meleeReach:2.7,throwRange:24,throwSpeed:22});
export const targetScore=w=>w.mode==='solo'?RULES.target:RULES.teamTarget;
export const COLORS=['#56b9c6','#e98b68','#b29be3','#e5bd5c','#86ba73','#62c9be','#ec9e74','#7eaad7','#ce82a0','#b6bf6e'];
// Zorluk: kolay / normal'de botlar eşyalarını hep 1. kata (zemin) koyar; zor'da üç kata dağıtır ve ağaçtan daha çok altın düşürür.
export const DIFFICULTIES=['easy','normal','hard'];
export const botGroundFloor=(w,id)=>!!w.players[id]?.bot&&w.difficulty!=='hard';
export const NAMES=Array.from({length:10},(_,i)=>'Bot-'+(i+1));
const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function inside(p,b,margin=0){const q=localPoint(b,p);return Math.abs(q.x)<CASTLE.halfX+margin&&Math.abs(q.z)<CASTLE.halfZ+margin;}
// Kale alarmı: kalede baygın olmayan bir rakip varsa. Baygın davetsiz tehdit sayılmaz (ayılınca kendi kalesine döner).
export function castleInvaded(w,id){if(w.replicated)return id===w.me&&w.homeInvaded===true;return w.players.some(v=>!allied(w,id,v.id)&&!(v.stun>0)&&inside(v,w.bases[id]));}
export function angleDelta(a,b){return Math.atan2(Math.sin(b-a),Math.cos(b-a));}
export function createWorld(seed=71,options={}){
 const mode=options.mode||'solo',count=mode==='solo'?5:10,humans=options.humans||[0];
 const w={mode,difficulty:DIFFICULTIES.includes(options.difficulty)?options.difficulty:'normal',radius:count===5?74:100,ring:count===5?54:80,me:0,time:0,seed,players:[],bases:[],items:[],coins:[],shots:[],events:[],winner:null,nextId:1,treeReady:0,claimant:null,claimTime:0};
 w.random=()=>{w.seed=(w.seed*1664525+1013904223)>>>0;return w.seed/4294967296;};
 for(let i=0;i<count;i++){const a=i*TAU/count,x=Math.sin(a)*w.ring,z=Math.cos(a)*w.ring;
  w.bases.push({id:i,x,z,angle:a,r:RULES.baseRadius});
  w.players.push({id:i,team:mode==='solo'?i:i%2,name:options.names?.[i]||NAMES[i],color:mode==='solo'?COLORS[i]:(i%2?'#e98b68':'#56b9c6'),x,z,floor:0,y:0,vy:0,vx:0,vz:0,px:0,pz:0,angle:a+Math.PI,gold:12,hp:RULES.hp,airJumps:0,stun:0,stunTotal:0,immune:0,hurt:0,attack:0,attackDone:false,attackCd:0,hasClub:true,shot:null,held:null,climb:null,inv:0,moveX:0,moveZ:0,aimX:x,aimZ:z-1,sprint:false,bot:!humans.includes(i),botThink:.2+i*.17,goal:null,personality:i,stats:{hits:0,knockouts:0,stuns:0,steals:0,deposits:0,purchases:0,treeHits:0,jumps:0,dodges:0,goldCollected:0,distance:0}});
  addItem(w,i,i%5);addItem(w,i,(i+2)%5);
 }
 for(let i=0;i<5;i++){const a=i*TAU/5;addItem(w,null,i,Math.sin(a)*4.1,Math.cos(a)*4.1);}
 return w;
}
function emit(w,type,extra={}){w.events.push({type,time:w.time,...extra});}
export function countItems(w,id){if(w.replicated)return w.bases[id]?.count||0;return w.items.filter(i=>i.base===id&&i.holder===null).length;}
function slotPosition(w,baseId,exclude=null){const b=w.bases[baseId],used=w.items.filter(i=>i.base===baseId&&i.id!==exclude).map(i=>i.slot);let slot=0;while(used.includes(slot))slot++;return {...roomPoint(b,slot%8,botGroundFloor(w,baseId)?0:slot%3),slot};}
export function addItem(w,base=null,kind=0,x=0,z=0){const place=base===null?{x,z,floor:0,slot:-1}:slotPosition(w,base);const item={id:w.nextId++,kind,base,holder:null,...place};w.items.push(item);return item;}
export function addCoin(w,x,z,value=1,excluded=-1){const c={id:w.nextId++,x,z,value,age:0,floor:0,excluded,vx:(w.random()-.5)*5,vz:(w.random()-.5)*5};w.coins.push(c);return c;}
export function dropHeld(w,p){if(p.held===null)return;const i=w.items.find(i=>i.id===p.held);i.holder=null;i.base=null;i.x=p.x;i.z=p.z;i.floor=p.floor||0;p.held=null;emit(w,'drop',{player:p.id,item:i.id});}
export const clubCrate=b=>worldPoint(b,2.5,-CASTLE.halfZ-1.5);
// Herhangi bir kalenin kapısındaki kasadan sopa alınır (yalnız kendi kasası değil).
export function nearClubCrate(w,p){return (p.floor||0)===0&&p.y===0&&w.bases.some(b=>dist(p,clubCrate(b))<1.9);}
export function nearestClubCrate(w,p){return w.bases.map(clubCrate).sort((a,b)=>dist(p,a)-dist(p,b))[0];}
export function interact(w,id){
 const p=w.players[id];if(w.winner!==null||p.stun>0)return false;
 const own=w.bases[id];
 if(!p.hasClub&&nearClubCrate(w,p)){p.hasClub=true;emit(w,'rearm',{player:id,x:p.x,z:p.z});return true;}
 if(p.held!==null){
  const i=w.items.find(i=>i.id===p.held);
  if(inside(p,own,-.25)){i.holder=null;i.base=id;Object.assign(i,{x:p.x,z:p.z,floor:p.floor||0,slot:-1});p.held=null;p.stats.deposits++;emit(w,'deposit',{player:id,item:i.id,x:own.x,z:own.z});}
  else dropHeld(w,p);
  return true;
 }
 let best=null,d=1.8;
 for(const i of w.items){if(i.holder!==null||!visibleTo(w,p,i))continue;if(i.base!==null&&i.base!==id&&allied(w,id,i.base))continue;const n=dist(p,i);if(n<d){best=i;d=n;}}
 if(!best)return false;
 if(best.base!==null&&best.base!==id){p.stats.steals++;emit(w,'steal',{player:id,victim:best.base,item:best.id});}
 best.base=null;best.holder=id;p.held=best.id;emit(w,'pickup',{player:id,item:best.id});return true;
}
export function buy(w,id){const p=w.players[id];if(w.winner!==null||p.stun>0||!inside(p,w.bases[id])||p.gold<RULES.price)return false;p.gold-=RULES.price;addItem(w,id,Math.floor(w.random()*5));p.stats.purchases++;emit(w,'buy',{player:id,x:p.x,z:p.z});return true;}
export function melee(w,id,aim=null){
 const p=w.players[id];if(w.winner!==null||p.attackCd>0||!p.hasClub)return false;
 if(aim){p.angle=Math.atan2(aim.x-p.x,aim.z-p.z);}
 p.attack=.36;p.attackCd=.55;p.attackDone=false;p.attackHits=[];emit(w,'swing',{player:id});return true;
}
export function throwClub(w,id,aim=null){
 const p=w.players[id];if(w.winner!==null||p.stun>0||!p.hasClub||p.shot!==null||p.attack>.18)return false;
 if(aim)p.angle=Math.atan2(aim.x-p.x,aim.z-p.z);
 const s={id:w.nextId++,owner:id,x:p.x+Math.sin(p.angle)*.7,z:p.z+Math.cos(p.angle)*.7,dx:Math.sin(p.angle),dz:Math.cos(p.angle),travel:0,age:0,hit:false};
 w.shots.push(s);s.floor=p.floor||0;p.shot=s.id;p.hasClub=false;p.attack=0;emit(w,'throw',{player:id});return true;
}
export function jump(w,id){
 const p=w.players[id];if(w.winner!==null||p.stun>0)return false;
 if(p.climb)return false;
 if(p.y===0&&p.vy===0)p.airJumps=0;
 else{if((p.airJumps||0)>=1)return false;p.airJumps=(p.airJumps||0)+1;emit(w,'airjump',{player:id,x:p.x,z:p.z,y:p.y,floor:p.floor||0});}
 p.vy=6;p.stats.jumps++;return true;
}
function hitMelee(w,p,v){
 if(allied(w,p.id,v.id))return;if(v.y>0||v.vy>0){v.stats.dodges++;return;}if(v.inv>0||v.hurt>0)return;
 // Sopa altın düşürmez. Ayaktaysa 1 can gider; baygınsa bayılma 1 sn uzar (toplam en çok RULES.maxStun).
 v.hurt=.45;p.stats.hits++;
 if(v.stun>0){const extend=Math.max(0,Math.min(RULES.stunExtend,RULES.maxStun-v.stunTotal));v.stun+=extend;v.immune+=extend;v.stunTotal+=extend;emit(w,'hit',{player:p.id,victim:v.id,extend,x:v.x,z:v.z});return;}
 const d=Math.max(.01,dist(p,v));v.px+=(v.x-p.x)/d*3;v.pz+=(v.z-p.z)/d*3;
 v.hp=Math.max(0,(v.hp??RULES.hp)-1);emit(w,'hit',{player:p.id,victim:v.id,hp:v.hp,x:v.x,z:v.z});
 if(v.hp===0){p.stats.knockouts++;const gold=faint(w,v);emit(w,'knockout',{player:p.id,victim:v.id,gold,x:v.x,z:v.z});}
}
// Bayılma (fırlatılan sopa ya da can bitmesi): süre bitince kalesinde sopayla doğar (bkz. step → respawn). Eşya vurulduğu
// yerde kalır. Her bayılışta bakiyeden en çok 5 altın yere düşer (eksik üretilmez); kale içinde düşeni yalnız o kalenin takımı toplar.
function faint(w,v){v.climb=null;v.stun=v.stunTotal=RULES.stun;v.immune=RULES.stun+2.5;dropHeld(w,v);
 const base=castleAt(w,v),gold=Math.min(RULES.stunGold,v.gold);v.gold-=gold;
 for(let i=0;i<gold;i++){const coin=addCoin(w,v.x,v.z,1,v.id);coin.floor=v.floor||0;if(base)coin.castleOwner=base.id;}
 return gold;
}
function stunPlayer(w,p,v){
 if(allied(w,p.id,v.id))return false;if(v.y>0||v.vy>0){v.stats.dodges++;return false;}if(v.inv>0||v.immune>0||v.stun>0)return false;
 const gold=faint(w,v);
 const d=Math.max(.01,dist(p,v));v.px+=(v.x-p.x)/d*2;v.pz+=(v.z-p.z)/d*2;
 p.stats.stuns++;emit(w,'stun',{player:p.id,victim:v.id,gold,x:v.x,z:v.z});return true;
}
export function harvestTree(w,p){
 const d=Math.hypot(p.x,p.z);if(!p.hasClub||p.floor!==0||d>3.4||p.stun>0||w.time<w.treeReady||w.coins.length>=80)return false;
 if((-p.x*Math.sin(p.angle)-p.z*Math.cos(p.angle))/Math.max(.01,d)<.15)return false;
 w.treeReady=w.time+.22;p.stats.treeHits++;const n=p.bot&&w.difficulty==='hard'?RULES.hardBotTreeGold:RULES.treeGold;for(let k=0;k<n;k++){const a=w.random()*Math.PI*2;addCoin(w,Math.sin(a)*1.9,Math.cos(a)*1.9);}
 emit(w,'treehit',{player:p.id,x:0,z:0});return true;
}
export function respawn(w,p){
 dropHeld(w,p);const b=w.bases[p.id];p.x=b.x;p.z=b.z;p.floor=0;p.airJumps=0;p.y=p.vy=p.vx=p.vz=p.px=p.pz=0;p.stun=p.stunTotal=0;p.hp=RULES.hp;p.hasClub=true;p.immune=Math.max(p.immune,2.5);p.inv=1;p.attack=0;p.attackDone=true;p.moveX=p.moveZ=0;p.climb=null;p.goal=null;p.botThink=.4;
 emit(w,'respawn',{player:p.id,x:p.x,z:p.z});
}
function segmentDistance(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,l=dx*dx+dz*dz,t=l?clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/l,0,1):0;return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);}
function updateShots(w,dt){for(let n=w.shots.length-1;n>=0;n--){const s=w.shots[n],p=w.players[s.owner],old={x:s.x,z:s.z};s.age+=dt;
 const travel=RULES.throwSpeed*dt;s.x+=s.dx*travel;s.z+=s.dz*travel;s.travel+=travel;
 let finished=!clearSight(w,{...old,floor:s.floor},s)||s.travel>=RULES.throwRange;
 if(!finished)for(const v of w.players)if(!allied(w,p.id,v.id)&&(v.floor||0)===s.floor&&clearSight(w,s,v)&&segmentDistance(v,old,s)<.8){if(stunPlayer(w,p,v)){s.hit=true;finished=true;break;}}
 if(finished){if(p.shot===s.id)p.shot=null;w.shots.splice(n,1);}
}}
function chooseGoal(w,p){
 const own=w.bases[p.id];
 if(!p.hasClub)return{type:'rearm'};
 const intruders=w.players.filter(v=>!allied(w,p.id,v.id)&&visibleTo(w,p,v)&&inside(v,own,-.2)).sort((a,b)=>dist(p,a)-dist(p,b));
 if(intruders.length&&dist(p,own)<CASTLE.halfZ+10)return{type:'defend',id:intruders[0].id};
 if(p.held!==null||countItems(w,p.id)>=RULES.target)return{type:'home'};
 if(w.claimant!==null&&!allied(w,p.id,w.claimant)){const rivals=w.bases.filter(b=>!allied(w,p.id,b.id)).sort((a,b)=>countItems(w,b.id)-countItems(w,a.id));const b=rivals[0];if(p.goal?.type==='search'&&p.goal.base===b.id)return p.goal;return{type:'search',base:b.id,room:Math.floor(w.random()*4),floor:Math.floor(w.random()*3)};}
 if(p.gold>=RULES.price)return{type:'buy'};
 let best=null,score=-Infinity;
 for(const i of w.items){if(i.holder!==null||(i.base!==null&&allied(w,i.base,p.id))||!visibleTo(w,p,i))continue;
 const b=i.base===null?null:w.bases[i.base],d=dist(p,i),s=(b?10:8)-d*.35+(b?countItems(w,b.id)*.8:0)+w.random()*2;
 if(s>score){score=s;best={type:'raid',id:i.id};}}
 const coin=w.coins.filter(c=>(c.castleOwner==null||allied(w,p.id,c.castleOwner))&&dist(p,c)<9).sort((a,b)=>dist(p,a)-dist(p,b))[0];
 if(coin&&p.gold<RULES.price&&(dist(p,coin)<3.5||score<4))return{type:'coin',id:coin.id};
 const rich=w.players.filter(v=>!allied(w,p.id,v.id)&&v.gold>=30&&visibleTo(w,p,v)&&!inside(v,w.bases[v.id])).sort((a,b)=>b.gold-a.gold||dist(p,a)-dist(p,b))[0];
 if(rich)return{type:'rob',id:rich.id};
 if(best)return best;
 if(['search','tree'].includes(p.goal?.type)&&p.strategyUntil>w.time)return p.goal;
 const richest=w.bases.filter(b=>!allied(w,b.id,p.id)).sort((a,b)=>countItems(w,b.id)-countItems(w,a.id));
 const b=richest[0],leaderScore=b?countItems(w,b.id):0;
 if(b&&(leaderScore>2||w.claimant!==null)&&w.random()<.8){if(p.goal?.type==='search'&&p.goal.base===b.id)return p.goal;p.strategyUntil=w.time+14;return{type:'search',base:b.id,room:Math.floor(w.random()*4),floor:Math.floor(w.random()*3)};}
 p.strategyUntil=w.time+10;return{type:'tree'};
}
function steer(w,p,target){target=route(w,p,target);const dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);p.moveX=d>.15?dx/d:0;p.moveZ=d>.15?dz/d:0;}
function updateBot(w,p,dt){
 if(p.stun>0||p.climb){p.moveX=p.moveZ=0;return;}
 p.botThink-=dt;if(p.botThink<=0||!p.goal){p.goal=chooseGoal(w,p);p.botThink=.35+w.random()*.25;}
 const g=p.goal,own=w.bases[p.id];let target=null;
 if(g.type==='home'||g.type==='buy'){target=roomPoint(own,p.id%4,botGroundFloor(w,p.id)?0:p.id%3);if(dist(p,target)<.8&&(p.floor||0)===target.floor){if(p.held!==null)interact(w,p.id);if(p.gold>=RULES.price)buy(w,p.id);p.goal=null;}}
 if(g.type==='rearm'){target=nearestClubCrate(w,p);if(nearClubCrate(w,p)){interact(w,p.id);p.goal=null;}}
 if(g.type==='tree'){const a=p.id*Math.PI*2/w.players.length;target={x:Math.sin(a)*2.65,z:Math.cos(a)*2.65,floor:0};if(dist(p,{x:0,z:0})<3.3)melee(w,p.id,{x:0,z:0});}
 if(g.type==='search'){const b=w.bases[g.base];target=roomPoint(b,g.room,g.floor);if(dist(p,target)<.7&&(p.floor||0)===g.floor){g.room++;if(g.room>=4){g.room=0;g.floor=(g.floor+1)%3;}p.botThink=0;}}
 if(g.type==='rob'){target=w.players[g.id];if(target.gold<15||!visibleTo(w,p,target)||inside(target,w.bases[target.id])){p.goal=null;target=null;}}
 if(g.type==='defend'){target=w.players[g.id];if(!inside(target,own))p.goal=null;}
 if(g.type==='raid'){
  const item=w.items.find(i=>i.id===g.id);
  if(!item||item.holder!==null||item.base===p.id){p.goal=null;p.moveX=p.moveZ=0;return;}
  target=item;if(dist(p,item)<1.65&&visibleTo(w,p,item)){interact(w,p.id);p.goal=null;}
 }
 if(g.type==='coin'){target=w.coins.find(c=>c.id===g.id);if(!target)p.goal=null;}
 if(g.type==='wander')target=g;
 if(target){steer(w,p,target);if(p.attack<=0){p.angle+=angleDelta(p.angle,Math.atan2(target.x-p.x,target.z-p.z))*Math.min(1,dt*13);}}
 else p.moveX=p.moveZ=0;
 // Bots fight one another as readily as they fight the human.
 const enemy=w.players.filter(v=>!allied(w,p.id,v.id)&&v.inv<=0&&dist(p,v)<2.15&&clearSight(w,p,v)).sort((a,b)=>dist(p,a)-dist(p,b))[0];
 p.combatThink=(p.combatThink||0)-dt;const react=p.combatThink<=0;if(react)p.combatThink=.22+w.random()*.18;
 if(react&&enemy&&p.attackCd<=0){melee(w,p.id,enemy);}
 p.sprint=true;
 const threats=w.players.filter(v=>!allied(w,p.id,v.id)&&visibleTo(w,p,v)&&dist(p,v)<11).sort((a,b)=>(b.held!==null)-(a.held!==null)||(countItems(w,b.id)*5+b.gold/3)-(countItems(w,a.id)*5+a.gold/3));
 // Baygına fırlatmak boşa gider (zaten sersem, ek altın düşmez): yalnız ayaktakiler hedeflenir.
 const victim=threats.find(v=>v.stun<=0);if(react&&victim&&dist(p,victim)>2.5&&p.hasClub&&(victim.held!==null||victim.gold>=30||inside(victim,own)))throwClub(w,p.id,{x:victim.x+victim.vx*.18,z:victim.z+victim.vz*.18});
 const incoming=w.shots.find(s=>!allied(w,p.id,s.owner)&&s.floor===(p.floor||0)&&dist(p,s)<12&&visibleTo(w,p,s)&&(p.x-s.x)*s.dx+(p.z-s.z)*s.dz>0&&Math.abs((p.x-s.x)*s.dz-(p.z-s.z)*s.dx)<1.6);
 if(incoming){
  if(p.dodgeShot!==incoming.id){p.dodgeShot=incoming.id;p.dodgeAt=w.time+.35+w.random()*.2;}
  if(w.time>=p.dodgeAt){p.dodgeAt=Infinity;if(p.y===0&&w.random()<.35)jump(w,p.id);}
 }else{p.dodgeShot=null;p.dodgeAt=Infinity;}


}
export function applyInput(w,p,input,dt){
 if(p.climb){p.moveX=p.moveZ=0;return;}
 p.moveX=input.x||0;p.moveZ=input.z||0;p.sprint=!!input.sprint;
 if(input.aim&&p.attack<=0){p.angle+=angleDelta(p.angle,Math.atan2(input.aim.x-p.x,input.aim.z-p.z))*(1-Math.exp(-18*dt));}
 else if(Math.hypot(p.moveX,p.moveZ)>.1&&p.attack<=0)p.angle+=angleDelta(p.angle,Math.atan2(p.moveX,p.moveZ))*(1-Math.exp(-16*dt));
 if(input.jump)jump(w,p.id);
 if(Number.isInteger(input.floor))useStairs(w,p,input.floor-(p.floor||0));
 if(input.up)useStairs(w,p,1);if(input.down)useStairs(w,p,-1);
 if(input.hit)melee(w,p.id,input.aim);if(input.throw)throwClub(w,p.id,input.aim);if(input.grab)interact(w,p.id);if(input.buy)buy(w,p.id);
}
export function step(w,dt,input={},inputs=null){
 if(w.winner!==null)return;dt=Math.min(dt,.05);w.time+=dt;
 // All jump edges are applied before any player's attacks resolve.
 for(const p of w.players)if(!p.bot)applyInput(w,p,inputs?.[p.id]||(p.id===0?input:{}),dt);
 for(const p of w.players){
  const wasStunned=p.stun>0;
  for(const k of ['stun','immune','hurt','inv','attackCd'])p[k]=Math.max(0,p[k]-dt);
  if(wasStunned&&p.stun===0)respawn(w,p);
  if(p.climb){if(!p.climb.announced){p.climb.announced=true;emit(w,'stairs',{player:p.id,from:p.climb.from,to:p.climb.to});}p.climb.t-=dt;if(p.climb.t<=0){p.floor=p.climb.to;p.climb=null;}}
 }
 for(const p of w.players){
  if(p.bot)updateBot(w,p,dt);
  const norm=Math.hypot(p.moveX,p.moveZ),speed=(p.held===null?RULES.speed:RULES.carrySpeed)*(p.sprint?RULES.sprint:1)*(p.stun>0||p.climb?0:p.attack>0?.7:1);
  const blend=1-Math.exp(-RULES.accel*dt);p.vx+=(p.moveX/Math.max(1,norm)*speed-p.vx)*blend;p.vz+=(p.moveZ/Math.max(1,norm)*speed-p.vz)*blend;
  p.px*=Math.exp(-RULES.pushDrag*dt);p.pz*=Math.exp(-RULES.pushDrag*dt);
  const ox=p.x,oz=p.z;p.x+=(p.vx+p.px)*dt;p.z+=(p.vz+p.pz)*dt;
  const edge=Math.hypot(p.x,p.z);if(edge>w.radius){p.x*=w.radius/edge;p.z*=w.radius/edge;}
  collide(w,p,ox,oz);p.stats.distance+=Math.hypot(p.x-ox,p.z-oz);
  if(p.y>0||p.vy>0){p.vy-=18*dt;p.y=Math.max(0,p.y+p.vy*dt);if(p.y===0){p.vy=0;p.airJumps=0;}}
  if(p.attack>0){p.attack=Math.max(0,p.attack-dt);if(p.attack<.28&&p.attack>.04){if(!p.attackDone){p.attackDone=true;harvestTree(w,p);}const fx=Math.sin(p.angle),fz=Math.cos(p.angle);p.attackHits??=[];for(const v of w.players){const d=dist(p,v);if(!p.attackHits.includes(v.id)&&!allied(w,p.id,v.id)&&d<RULES.meleeReach&&clearSight(w,p,v)&&((v.x-p.x)*fx+(v.z-p.z)*fz)/Math.max(.01,d)>-.1&&Math.abs(p.y-v.y)<1.4){const hits=p.stats.hits;hitMelee(w,p,v);if(p.stats.hits>hits)p.attackHits.push(v.id);}}}}
  if(p.held!==null){const i=w.items.find(i=>i.id===p.held);i.x=p.x;i.z=p.z;i.floor=p.floor||0;}
 }
 updateShots(w,dt);
 for(let i=w.coins.length-1;i>=0;i--){const c=w.coins[i];c.age+=dt;if(c.age<.8){c.x+=c.vx*dt;c.z+=c.vz*dt;c.vx*=Math.exp(-5*dt);c.vz*=Math.exp(-5*dt);}
  for(const p of w.players)if((c.castleOwner==null||allied(w,p.id,c.castleOwner))&&p.stun<=0&&(p.floor||0)===(c.floor||0)&&dist(c,p)<1.05&&clearSight(w,p,c)&&c.age>.3&&!(c.excluded===p.id&&c.age<1.1)){p.gold+=c.value;p.stats.goldCollected+=c.value;w.coins.splice(i,1);emit(w,'coin',{player:p.id,x:c.x,z:c.z});break;}
 }

 const scores=w.mode==='solo'?w.players.map(p=>countItems(w,p.id)):[0,1].map(t=>w.players.filter(p=>p.team===t).reduce((n,p)=>n+countItems(w,p.id),0));
 const target=targetScore(w), contender=scores.findIndex(n=>n>=target);
 const leader=contender<0?null:w.mode==='solo'?w.players[contender]:w.players.find(p=>p.team===contender);
 if(leader){if(w.claimant!==leader.id){w.claimant=leader.id;w.claimTime=0;emit(w,'claim',{player:leader.id});}w.claimTime+=dt;if(w.claimTime>=RULES.winHold){w.winner=leader.id;w.winnerTeam=leader.team;emit(w,'win',{player:leader.id});}}
 else{w.claimant=null;w.claimTime=0;}

}
