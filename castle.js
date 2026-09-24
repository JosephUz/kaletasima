// Kale: üç katlı tek salon (katlarda oda yok). Ön yüzde zemin katta tek kapı, arkada tek merdiven.
export const CASTLE={halfX:10.5,halfZ:12,height:3.8,floors:3,door:3,stairZ:9.7};
export const FLOOR_NAMES=['Zemin kat','Orta kat','Üst kat'];
const HX=CASTLE.halfX,HZ=CASTLE.halfZ;
export function localPoint(b,p){const a=b.angle||0,c=Math.cos(a),s=Math.sin(a),x=p.x-b.x,z=p.z-b.z;return{x:x*c-z*s,z:x*s+z*c,floor:p.floor||0};}
export function worldPoint(b,x,z,floor=0){const a=b.angle||0,c=Math.cos(a),s=Math.sin(a);return{x:b.x+x*c+z*s,z:b.z-x*s+z*c,floor};}

export function allied(w,a,b){return a===b||(a!=null&&b!=null&&w.mode!=='solo'&&w.players[a]?.team===w.players[b]?.team);}
export function nearStairs(w,p){const b=castleAt(w,p);if(!b)return false;const q=localPoint(b,p);return Math.abs(q.x)<1.25&&Math.abs(q.z-CASTLE.stairZ)<1.6;}
export function castleAt(w,p){return w.bases.find(b=>{const q=localPoint(b,p);return Math.abs(q.x)<HX&&Math.abs(q.z)<HZ;})||null;}
// Her kat tek oda: room her zaman 0 (kale dışı null).
export function roomAt(w,p){const b=castleAt(w,p);if(!b)return null;return {base:b.id,floor:p.floor||0,room:0};}
// Katta dağılmış noktalar: başlangıç / satın alınan eşyaların yeri ve botların arama noktaları (ilk 4'ü dört çeyrek).
const SPOTS=[[-.6,-.45],[.6,-.45],[-.6,.45],[.6,.45],[0,-.2],[-.3,.1],[.3,.1],[0,.45]];
export function roomPoint(b,i,floor=0){const [x,z]=SPOTS[((i%SPOTS.length)+SPOTS.length)%SPOTS.length];return worldPoint(b,x*HX,z*HZ,floor);}
// Açık alan her yerden görünür; kale içindeki şeyler yalnız aynı kale ve aynı kattan görünür.
export function visibleTo(w,p,obj){const actual=obj.holder!=null?w.players[obj.holder]:obj;if(!actual||actual.hidden)return false;const b=roomAt(w,actual);if(!b)return (actual.floor||0)===0;if((actual.floor||0)!==(p.floor||0))return false;const a=roomAt(w,p);return !!a&&a.base===b.base;}
export function walls(b,floor=0){const x=b.x,z=b.z,side=(HX-CASTLE.door/2),out=[
 {x:x-HX,z,w:.45,d:HZ*2},{x:x+HX,z,w:.45,d:HZ*2},{x,z:z+HZ,w:HX*2,d:.45},
 {x:x-HX+side/2,z:z-HZ,w:side,d:.45},{x:x+HX-side/2,z:z-HZ,w:side,d:.45}
 ];
 if(floor>0)out.push({x,z:z-HZ,w:CASTLE.door,d:.45});
 return out;
}
function blocked(w,p,x,z,r=.32){for(const b of w.bases){if(Math.hypot(x-b.x,z-b.z)>HZ+4)continue;const q=localPoint(b,{x,z});for(const a of walls({x:0,z:0},p.floor||0)){if(Math.abs(q.x-a.x)<a.w/2+r&&Math.abs(q.z-a.z)<a.d/2+r)return true;}}return false;}
export function collide(w,p,ox,oz){const x=p.x,z=p.z;p.x=ox;p.z=oz;if(!blocked(w,p,x,oz))p.x=x;else p.vx=p.px=0;if(!blocked(w,p,p.x,z))p.z=z;else p.vz=p.pz=0;}
export function clearSight(w,a,b){if((a.floor||0)!==(b.floor||0))return false;const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.22);for(let i=1;i<n;i++)if(blocked(w,a,a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n,0))return false;return true;}
export const CLIMB_TIME=.8;
// Kat geçişi: oyuncu CLIMB_TIME boyunca merdivende kalır (hareket edemez), sonra yeni katta belirir. Görünüm bu sürede
// karakteri ve kamerayı iki kat arasında kaydırır; kata çıkıldığı / inildiği böylece anlaşılır.
export function useStairs(w,p,direction){if(!nearStairs(w,p)||p.stun>0||p.climb||!Number.isInteger(direction)||direction===0)return false;const floor=(p.floor||0)+direction;if(floor<0||floor>=3)return false;p.climb={from:p.floor||0,to:floor,t:CLIMB_TIME,time:CLIMB_TIME};p.airJumps=0;p.y=p.vy=0;p.vx=p.vz=0;return true;}
// Rota: salonda doğrudan, kat değişecekse merdivene, kaleden çıkacaksa kapıya; dışarıda kaleleri dolanarak.
export function route(w,p,target){const current=castleAt(w,p),destination=castleAt(w,target);
 if(current){const q=localPoint(current,p),same=current===destination,needsFloor=same&&(p.floor||0)!==(target.floor||0),point=(x,z)=>worldPoint(current,x,z,p.floor);
  if(needsFloor||(!same&&(p.floor||0)>0)){const dir=needsFloor?Math.sign((target.floor||0)-(p.floor||0)):-1;if(Math.hypot(q.x,q.z-CASTLE.stairZ)<.6)useStairs(w,p,dir);return point(0,CASTLE.stairZ);}
  if(!same)return Math.abs(q.x)>.6&&q.z>-HZ+1.4?point(0,-HZ+1):point(0,-HZ-1.4);
  return target;
 }
 for(const b of w.bases){const q=localPoint(b,p);if(destination!==b&&Math.abs(q.x)<HX+.8&&q.z<=-HZ&&q.z>-HZ-1.1)return worldPoint(b,q.x,-HZ-1.4);}
 if(destination){const q=localPoint(destination,p),point=(x,z)=>worldPoint(destination,x,z);if(Math.abs(q.x)<.6&&q.z<-HZ+.4&&q.z>-HZ-2)return point(0,-HZ+1.5);if(q.z>-HZ-1.2&&Math.abs(q.x)<HX+1.6)return point(q.x<0?-HX-2:HX+2,q.z);if(q.z>-HZ-1.2)return point(q.x,-HZ-1.3);return point(0,-HZ-1.3);}
 for(const b of w.bases){const dx=target.x-p.x,dz=target.z-p.z,len=Math.hypot(dx,dz);if(len<.1)break;const q=localPoint(b,p),next=localPoint(b,{x:p.x+dx/len*2,z:p.z+dz/len*2}),to=localPoint(b,target);if(Math.abs(next.x)<HX+.8&&Math.abs(next.z)<HZ+.8){if(Math.abs(q.x)<HX+1.2)return worldPoint(b,q.x<0?-HX-2:HX+2,q.z);return worldPoint(b,q.x,to.z<0?-HZ-2:HZ+2);}}
 return target;
}
