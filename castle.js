export const CASTLE={halfX:7,halfZ:8,height:3.8,floors:3,corridor:1.6};
export const ROOM_NAMES=['Erzak odası','Silah odası','Hazine odası','Kraliyet odası'];
export function localPoint(b,p){const a=b.angle||0,c=Math.cos(a),s=Math.sin(a),x=p.x-b.x,z=p.z-b.z;return{x:x*c-z*s,z:x*s+z*c,floor:p.floor||0};}
export function worldPoint(b,x,z,floor=0){const a=b.angle||0,c=Math.cos(a),s=Math.sin(a);return{x:b.x+x*c+z*s,z:b.z-x*s+z*c,floor};}

export function allied(w,a,b){return a===b||(a!=null&&b!=null&&w.mode!=='solo'&&w.players[a]?.team===w.players[b]?.team);}
export function nearStairs(w,p){const b=castleAt(w,p);if(!b)return false;const q=localPoint(b,p);return Math.abs(q.x)<1.25&&Math.abs(q.z-5.7)<1.6;}
export function castleAt(w,p){return w.bases.find(b=>{const q=localPoint(b,p);return Math.abs(q.x)<7&&Math.abs(q.z)<8;})||null;}
export function roomAt(w,p){const b=castleAt(w,p);if(!b)return null;const {x,z}=localPoint(b,p);return {base:b.id,floor:p.floor||0,room:Math.abs(x)<1.6?-1:(x<0?0:1)+(z<0?0:2)};}
export function roomPoint(b,room,floor=0){return worldPoint(b,room%2===0?-4.4:4.4,room<2?-4:4,floor);}
export function visibleTo(w,p,obj){const actual=obj.holder!=null?w.players[obj.holder]:obj;if(!actual||actual.hidden||(actual.floor||0)!==(p.floor||0))return false;const a=roomAt(w,p),b=roomAt(w,actual);if(!b)return !a;if(!a)return false;return a.base===b.base&&a.room===b.room;}
export function walls(b,floor=0,closed=false){const x=b.x,z=b.z,out=[
 {x:x-7,z,w:.45,d:16},{x:x+7,z,w:.45,d:16},{x,z:z+8,w:14,d:.45},
 {x:x-4.25,z:z-8,w:5.5,d:.45},{x:x+4.25,z:z-8,w:5.5,d:.45}
 ];
 if(floor>0||closed)out.push({x,z:z-8,w:3,d:.45});
 for(const side of [-1,1]){
  for(const [cz,d]of [[-6.6,2.8],[0,5.6],[6.6,2.8]])out.push({x:x+side*1.6,z:z+cz,w:.25,d});
  out.push({x:x+side*4.3,z,w:5.4,d:.25});
 }return out;
}
function blocked(w,p,x,z,r=.32){for(const b of w.bases){if(Math.hypot(x-b.x,z-b.z)>12)continue;const q=localPoint(b,{x,z});for(const a of walls({x:0,z:0},p.floor||0,b.locked&&!allied(w,b.id,p.id))){if(Math.abs(q.x-a.x)<a.w/2+r&&Math.abs(q.z-a.z)<a.d/2+r)return true;}}return false;}
export function collide(w,p,ox,oz){const x=p.x,z=p.z;p.x=ox;p.z=oz;if(!blocked(w,p,x,oz))p.x=x;else p.vx=p.px=0;if(!blocked(w,p,p.x,z))p.z=z;else p.vz=p.pz=0;}
export function clearSight(w,a,b){if((a.floor||0)!==(b.floor||0))return false;const n=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.22);for(let i=1;i<n;i++)if(blocked(w,a,a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n,0))return false;return true;}
export function useStairs(w,p,direction){if(!nearStairs(w,p)||p.stun>0||!Number.isInteger(direction))return false;const floor=(p.floor||0)+direction;if(floor<0||floor>=3)return false;p.floor=floor;p.airJumps=0;p.y=p.vy=0;p.vx=p.vz=0;return true;}
export function toggleDoor(w,p){const b=castleAt(w,p)||w.bases.find(b=>{const d=worldPoint(b,0,-8);return Math.hypot(p.x-d.x,p.z-d.z)<3;});if(!b||b.id!==p.id||p.stun>0)return false;b.manualOpen=!b.manualOpen;return true;}
// Route through the hall and the actual doorway; never steer through a room wall.
export function route(w,p,target){const current=castleAt(w,p),destination=castleAt(w,target),r=roomAt(w,p),t=roomAt(w,target);
 if(current){const q=localPoint(current,p),to=localPoint(current,target),same=current===destination,needsFloor=same&&(p.floor||0)!==(target.floor||0),point=(x,z)=>worldPoint(current,x,z,p.floor);
  if(r.room>=0&&(!same||needsFloor||t.room!==r.room)){const z=r.room<2?-4:4;return Math.abs(q.z-z)>.45?point(q.x,z):point(0,z);}
  if(needsFloor||(!same&&(p.floor||0)>0)){const dir=needsFloor?Math.sign((target.floor||0)-(p.floor||0)):-1;if(Math.hypot(q.x,q.z-5.7)<.6)useStairs(w,p,dir);return point(0,5.7);}
  if(!same)return point(0,-9.4);
  if(t.room>=0&&r.room<0){const z=t.room<2?-4:4;return Math.abs(q.z-z)>.45?point(0,z):point(to.x,z);}return target;
 }
 for(const b of w.bases){const q=localPoint(b,p);if(destination!==b&&Math.abs(q.x)<7.8&&q.z<=-8&&q.z>-9.1)return worldPoint(b,q.x,-9.4);}
 if(destination){const q=localPoint(destination,p),point=(x,z)=>worldPoint(destination,x,z);if(Math.abs(q.x)<.6&&q.z< -7.6&&q.z> -10)return point(0,-6.5);if(q.z> -9.2&&Math.abs(q.x)<8.6)return point(q.x<0?-9:9,q.z);if(q.z> -9.2)return point(q.x,-9.3);return point(0,-9.3);}
 for(const b of w.bases){const dx=target.x-p.x,dz=target.z-p.z,len=Math.hypot(dx,dz);if(len<.1)break;const q=localPoint(b,p),next=localPoint(b,{x:p.x+dx/len*2,z:p.z+dz/len*2}),to=localPoint(b,target);if(Math.abs(next.x)<7.8&&Math.abs(next.z)<8.8){if(Math.abs(q.x)<8.2)return worldPoint(b,q.x<0?-9:9,q.z);return worldPoint(b,q.x,to.z<0?-10:10);}}
 return target;
}
