import {worldPoint,CASTLE,walls,roomAt,visibleTo,castleAt} from './castle.js';
import * as T from 'three';
import {RULES,COLORS,countItems,dist} from './sim.js';
const TAU=Math.PI*2;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function html(el,value){if(el._html!==value){el.innerHTML=value;el._html=value;}}

export class GameView{
 constructor(canvas,w){
  this.canvas=canvas;this.world=w;this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.25));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.18;
  this.scene=new T.Scene();this.scene.background=new T.Color('#718a83');
  this.materials=new Map();this.geos={box:new T.BoxGeometry(1,1,1),cyl:new T.CylinderGeometry(1,1,1,12),ball:new T.IcosahedronGeometry(1,1),cone:new T.ConeGeometry(1,1,8)};
  this.ortho=new T.OrthographicCamera();this.third=new T.PerspectiveCamera(58,1,.1,300);this.camera=this.ortho;this.mode='iso';this.overview=false;this.zoom=17;this.yaw=Math.PI;this.pitch=.36;this.focus=new T.Vector3();this.desired=new T.Vector3();this.projected=new T.Vector3();this.ray=new T.Raycaster();this.plane=new T.Plane(new T.Vector3(0,1,0),0);this.ndc=new T.Vector2();this.hit=new T.Vector3();
  this.actorViews=new Map();this.itemViews=new Map();this.coinViews=new Map();this.shotViews=new Map();this.baseViews=[];this.labels=[];this.effects=[];this.floaters=[];this.labelRoot=document.querySelector('#world-labels');this.time=0;this.shake=0;
  const sun=new T.DirectionalLight('#ffdfa5',3.1);sun.position.set(-20,35,18);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);Object.assign(sun.shadow.camera,{left:-68,right:68,top:68,bottom:-68,near:.1,far:320});sun.shadow.normalBias=.04;sun.shadow.bias=-.00015;this.scene.add(sun);this.scene.add(new T.HemisphereLight('#def1e7','#65734e',2.5));
  this.quality=1;this.sun=sun;this.occlusionRay=new T.Ray();this.occlusionTarget=new T.Vector3();this.occlusionHit=new T.Vector3();this.buildArena(w);for(const p of w.players)this.actorViews.set(p.id,this.buildActor(p));this.buildAim();this.resize();this.reset(w);
 }
 mat(color){if(!this.materials.has(color)){const m=new T.MeshStandardMaterial({color,roughness:.9});this.materials.set(color,m);}return this.materials.get(color);}
 setQuality(level){this.quality=level;this.renderer.setPixelRatio(Math.min(devicePixelRatio,[1,1.25,1.7][level]));this.renderer.shadowMap.enabled=level>0;this.sun.shadow.mapSize.set(level===2?2048:1024,level===2?2048:1024);this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.resize();}
 dispose(){const geometries=new Set(),materials=new Set();this.scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();for(const l of this.labels)l.el.remove();for(const f of this.floaters)f.el.remove();this.renderer.dispose();}
 mesh(type,color,x,y,z,sx,sy,sz,parent=this.scene){const m=new T.Mesh(this.geos[type],this.mat(color));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
 box(w,h,d,c,x=0,y=0,z=0,p=this.scene){return this.mesh('box',c,x,y,z,w,h,d,p);}
 cyl(r,h,c,x=0,y=0,z=0,p=this.scene){return this.mesh('cyl',c,x,y,z,r,h,r,p);}
 ball(r,c,x,y,z,p=this.scene){return this.mesh('ball',c,x,y,z,r,r,r,p);}
 ring(inner,outer,color,x,z,parent=this.scene){const m=new T.Mesh(new T.RingGeometry(inner,outer,64),new T.MeshBasicMaterial({color,transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,.065,z);parent.add(m);return m;}
 label(object,height,className,html){const el=document.createElement('div');el.className='world-label '+className;el.innerHTML=html;this.labelRoot.append(el);const l={object,height,el};this.labels.push(l);return l;}
 buildArena(w){
  this.cyl(w.radius+4,2.8,'#8e9877',0,-1.5,0);this.cyl(w.radius+3.9,.28,'#a9b884',0,-.12,0);this.cyl(12.4,.045,'#c3bc91',0,.025,0);
  this.cyl(10.8,.05,'#b6bd8a',0,.05,0);this.ring(12.5,12.65,'#e8d7a5',0,0);
  for(const b of w.bases){const a=Math.atan2(b.x,b.z),path=this.box(4,.045,w.ring-10,'#c3bc91',Math.sin(a)*(w.ring/2+5),.05,Math.cos(a)*(w.ring/2+5));path.rotation.y=a;this.buildBase(b);}
  this.cyl(2.3,.22,'#a4aa8c',0,.14,0);this.cyl(1.9,.15,'#d0c393',0,.31,0);this.ring(2.6,2.68,'#ead5a1',0,0);
  for(let i=0;i<8;i++){const a=i*TAU/8;this.box(.44,.26,.44,'#f1cd72',Math.sin(a)*.85,.57,Math.cos(a)*.85).rotation.y=a;}
  this.cyl(.68,3.4,'#765533',0,1.8,0);for(const [x,y,z,r]of [[0,4.6,0,2.1],[-1.6,3.8,0,1.5],[1.5,4.1,.4,1.7],[0,4.3,-1.5,1.5]])this.ball(r,'#d9b748',x,y,z);for(let n=0;n<9;n++){const a=n*TAU/9;this.ball(.19,'#ffe28a',Math.sin(a)*1.8,3.2+(n%3)*.3,Math.cos(a)*1.8);}
  const fountain={visible:true,position:new T.Vector3(0,0,0),getWorldPosition:out=>out.set(0,0,0)};this.label(fountain,2.2,'market','ALTIN AĞACI');
  let seed=34;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<42;i++){const a=i*TAU/42,r=w.radius+1.2+random()*1.3,x=Math.sin(a)*r,z=Math.cos(a)*r;if(i%3===0){this.cyl(.19,1.3,'#816847',x,.7,z);this.ball(1.1,'#789355',x,2,z);this.ball(.8,'#93aa68',x-.4,2.65,z);}else{const rock=this.ball(.35+random()*.35,'#b3b597',x,.25,z);rock.scale.y*=.6;}}
  for(let i=0;i<130;i++){const a=random()*TAU,r=15+random()*(w.radius-16),x=Math.sin(a)*r,z=Math.cos(a)*r;if(w.bases.some(b=>dist({x,z},b)<11))continue;const blade=this.mesh('cone',i%8?'#8fa763':'#edce88',x,.14,z,.1,.27,.1);blade.castShadow=false;}
  for(let i=0;i<20;i++){const a=i*TAU/20;this.box(.9,.05,.65,'#d0c7a1',Math.sin(a)*11.8,.085,Math.cos(a)*11.8).rotation.y=a;}
 }
 buildBase(b){
  const p=new T.Group();p.position.set(b.x,0,b.z);p.rotation.y=b.angle||0;this.scene.add(p);
  this.box(15,.24,17,'#a9ac99',0,0,0,p);
  const crate=new T.Group();crate.position.set(2.5,0,-9.5);p.add(crate);
  this.box(1.5,.15,1.1,'#765035',0,.15,0,crate);
  for(const z of [-.52,.52])this.box(1.6,.75,.12,'#a97947',0,.55,z,crate);
  for(const x of [-.73,.73])this.box(.12,.75,1.1,'#92663d',x,.55,0,crate);
  for(const x of [-.45,0,.45]){const club=this.club(crate);club.position.set(x,.7,0);club.rotation.z=x*.4;}
  const levels=[];
  for(let floor=0;floor<3;floor++){
   const group=new T.Group();group.position.y=floor*CASTLE.height;p.add(group);
   const parts=[],palette=new Map();
   const track=(mesh,room=-1,kind='wall')=>{const key=room+':'+kind+':'+mesh.material.color.getHex();if(!palette.has(key)){const m=mesh.material.clone();m.transparent=true;palette.set(key,m);}mesh.material=palette.get(key);parts.push({mesh,room,kind});return mesh;};
   track(this.box(3.1,.15,15.8,'#c5b996',0,.05,0,group),-1,'floor');
   for(let room=0;room<4;room++){
    const x=room%2===0?-4.3:4.3,z=room<2?-4:4;
    track(this.box(5.2,.16,7.8,['#a9ad92','#ac9e87','#afa587','#9baba4'][room],x,.06,z,group),room,'floor');
    track(this.box(2.5,.025,3.4,this.world.players[b.id].color,x,.16,z,group),room,'decor');
    track(this.box(1.7,1.2,.65,'#796346',x, .75,room<2?-7.2:7.2,group),room,'decor');
    for(const yy of [.4,.85,1.3])track(this.box(1.8,.09,.72,'#bd9d6e',x,yy,room<2?-7.2:7.2,group),room,'decor');
    track(this.cyl(.16,.7,'#f3c56b',room%2===0?-6.45:6.45,2.2,z,group),room,'decor');
   }
   for(const w of walls({x:0,z:0},floor,false))track(this.box(w.w,3.4,w.d,'#899c98',w.x,1.8,w.z,group));
   // Lintels mark room doors; the openings below remain walkable.
   for(const x of [-1.6,1.6])for(const z of [-4,4])track(this.box(.34,.55,2.4,'#c4c7b1',x,3.25,z,group));
   for(const x of [-7,7])for(const z of [-8,8]){
    track(this.cyl(1.15,3.8,'#748d8b',x,1.9,z,group));
    track(this.cyl(1.25,.18,'#b0b9a5',x,3.65,z,group));
    if(floor===2)for(let n=0;n<6;n++){const a=n*TAU/6;track(this.box(.47,.65,.47,'#a6b2a2',x+Math.sin(a),4.05,z+Math.cos(a),group));}
   }
   if(floor===2)for(let x=-5.8;x<7;x+=1.5)for(const z of [-8,8])track(this.box(.8,.65,.65,'#b5beab',x,3.8,z,group));
   for(const [z,color,up] of [[5.7,'#dcb56c',true]]){
    for(let n=0;n<6;n++)track(this.box(1.45,.13+n*.11,.32,color,0,.1+n*.055,z-.9+n*.32,group),-1,'stairs');
    const marker=this.mesh('cone',color,0,1.4,z,.23,.5,.23,group);if(!up)marker.rotation.z=Math.PI;track(marker,-1,'stairs');
   }
   if(floor===2)track(this.box(13.6,.18,15.6,'#758b89',0,3.55,0,group),-1,'roof');
   for(const z of [-8.24,8.24])for(const x of [-4.3,4.3])track(this.box(.48,1.35,.08,'#344b49',x,2,z,group));
   levels.push({group,parts});
  }
  this.box(3.6,.55,.75,'#c6c7ad',0,3.2,-8,p);
  const banner=this.box(1.7,2,.12,this.world.players[b.id].color,0,9.6,-8.3,p);
  const ring=this.ring(10.4,10.5,this.world.players[b.id].color,0,0,p);ring.position.y=.03;
  this.baseViews.push({p,levels,banner,ring,bounds:new T.Box3(new T.Vector3(b.x-12,0,b.z-12),new T.Vector3(b.x+12,12.6,b.z+12)),label:this.label(p,13,'base','')});
 }
 club(parent){const g=new T.Group();this.box(.16,1.05,.17,'#8c5935',0,.25,0,g);const head=this.box(.32,.57,.3,'#ad7847',0,.76,0,g);head.rotation.z=.09;for(const y of [.57,.85])this.box(.35,.075,.32,'#d4b16a',0,y,0,g);parent.add(g);return g;}
 buildActor(p){
  const root=new T.Group();this.scene.add(root);const body=new T.Group();root.add(body);
  this.box(.77,.88,.5,p.color,0,1.05,0,body);this.box(.8,.12,.53,'#70563d',0,.79,0,body);this.box(.2,.16,.06,'#e6cb79',0,.8,.3,body);
  this.box(.55,.53,.52,'#ebbc87',0,1.78,0,body);this.box(.6,.17,.57,'#465b45',0,2.1,0,body);this.box(.12,.18,.1,p.color,.2,2.21,0,body);
  for(const x of [-.14,.14])this.box(.075,.075,.04,'#2b4437',x,1.83,.274,body);this.box(.13,.12,.14,'#d8a172',0,1.7,.31,body);
  const legs=[];for(const x of [-.21,.21]){const leg=new T.Group();leg.position.set(x,.66,0);body.add(leg);this.box(.28,.52,.29,'#445844',0,-.27,0,leg);this.box(.32,.17,.44,'#5a4d38',0,-.55,.07,leg);legs.push(leg);}
  const arms=[];for(const x of [-.52,.52]){const arm=new T.Group();arm.position.set(x,1.4,0);body.add(arm);this.box(.26,.57,.29,p.color,0,-.24,0,arm);this.box(.25,.2,.25,'#e3b47e',0,-.59,0,arm);arms.push(arm);}
  const weapon=this.club(arms[1]);weapon.position.set(.02,-.45,.22);weapon.rotation.x=.45;
  const aura=this.ring(.54,.62,p.color,0,0,root);aura.position.y=.045;
  const stars=new T.Group();body.add(stars);stars.position.y=2.65;for(let i=0;i<4;i++){const a=i*TAU/4;const s=this.mesh('cone','#ffdc83',Math.sin(a)*.65,0,Math.cos(a)*.65,.12,.23,.12,stars);s.rotation.z=Math.PI/2;}
  const l=this.label(root,2.8,'actor',p.name);return{root,body,legs,arms,weapon,stars,aura,label:l};
 }
 buildItem(kind){
  const g=new T.Group();
  if(kind===0){this.box(.85,.58,.65,'#a27040',0,.38,0,g);this.box(.88,.17,.68,'#c08c4a',0,.77,0,g);for(const x of [-.3,.3])this.box(.08,.79,.7,'#e3bb65',x,.44,0,g);this.box(.16,.21,.035,'#f4d386',0,.43,.37,g);}
  if(kind===1){this.cyl(.32,.7,'#659d93',0,.39,0,g);this.cyl(.14,.3,'#73ada0',0,.87,0,g);this.cyl(.15,.1,'#e4c591',0,1.07,0,g);this.box(.39,.23,.035,'#ebd7a3',0,.47,.329,g);}
  if(kind===2){this.box(.85,.18,.75,'#caab67',0,.46,0,g);this.box(.81,.96,.14,'#caab67',0,.91,-.34,g);this.box(.58,.62,.08,'#b16858',0,.97,-.23,g);this.box(.64,.12,.62,'#b16858',0,.6,0,g);for(const x of [-.33,.33])for(const z of [-.28,.28])this.box(.1,.43,.1,'#a28048',x,.22,z,g);this.ball(.11,'#e5c883',0,1.46,-.34,g);}
  if(kind===3){this.cyl(.45,.58,'#67776c',0,.46,0,g);this.cyl(.5,.09,'#a2ada0',0,.8,0,g);this.cyl(.38,.02,'#3f5649',0,.85,0,g);for(const x of [-.57,.57])this.box(.18,.09,.18,'#a7b29c',x,.64,0,g);}
  if(kind===4){this.cyl(.37,.77,'#bb874e',0,.46,0,g);for(const y of [.18,.69])this.cyl(.395,.1,'#68756a',0,y,0,g);this.cyl(.35,.05,'#dab67a',0,.87,0,g);}
  this.scene.add(g);return g;
 }
 buildAim(){
  this.aimRing=this.ring(.24,.29,'#fff0b7',0,0);this.aimRing.position.y=.07;
  this.aimLine=new T.Line(new T.BufferGeometry(),new T.LineDashedMaterial({color:'#fff0b7',dashSize:.3,gapSize:.2,transparent:true,opacity:.48}));this.scene.add(this.aimLine);this.aimLine.geometry.setAttribute('position',new T.BufferAttribute(new Float32Array(6),3));
  this.facing=this.mesh('cone','#fff0b7',0,.25,0,.23,.7,.23);this.facing.material=new T.MeshBasicMaterial({color:'#ffe5a0',depthTest:false});this.facing.renderOrder=10;this.facing.rotation.x=Math.PI/2;
  this.selection=this.ring(.7,.77,'#fff0b7',0,0);
 }
 reset(w){this.world=w;for(const map of [this.itemViews,this.coinViews,this.shotViews]){for(const g of map.values())this.scene.remove(g);map.clear();}for(const f of this.floaters)f.el.remove();this.floaters=[];const p=w.players[w.me||0];this.focus.set(p.x,(p.floor||0)*CASTLE.height,p.z);this.shake=0;}
 aimFromScreen(x,y){this.ndc.set(x/innerWidth*2-1,1-y/innerHeight*2);this.ray.setFromCamera(this.ndc,this.camera);if(this.ray.ray.intersectPlane(this.plane,this.hit))return{x:this.hit.x,z:this.hit.z};return null;}
 project(x,y,z){this.projected.set(x,y,z).project(this.camera);return{x:(this.projected.x*.5+.5)*innerWidth,y:(-.5*this.projected.y+.5)*innerHeight,z:this.projected.z};}
 setMode(mode){this.mode=mode;this.camera=mode==='iso'?this.ortho:this.third;this.yaw=this.world.players[this.world.me||0].angle;this.resize();}
 resize(){const a=innerWidth/innerHeight;this.renderer.setSize(innerWidth,innerHeight);this.third.aspect=a;this.third.updateProjectionMatrix();const half=this.overview?Math.max(60,76/a):Math.max(this.zoom,17/a);Object.assign(this.ortho,{left:-half*a,right:half*a,top:half,bottom:-half,near:.1,far:180});this.ortho.updateProjectionMatrix();}
 updateCamera(dt,started){
  const p=this.world.players[this.world.me||0];
  if(this.mode==='iso'){this.desired.set(this.overview||!started?0:p.x,(p.floor||0)*CASTLE.height,this.overview||!started?0:p.z);this.focus.lerp(this.desired,1-Math.exp(-6*dt));this.ortho.position.set(this.focus.x+30,this.focus.y+36,this.focus.z+30);this.ortho.lookAt(this.focus);}
  else{const fx=Math.sin(this.yaw),fz=Math.cos(this.yaw),rx=-Math.cos(this.yaw),rz=Math.sin(this.yaw);this.focus.set(p.x+rx*.8,2.15+p.y*.8+(p.floor||0)*CASTLE.height,p.z+rz*.8);this.third.position.set(this.focus.x-fx*5.2*Math.cos(this.pitch),this.focus.y+5.2*Math.sin(this.pitch),this.focus.z-fz*5.2*Math.cos(this.pitch));this.third.lookAt(this.focus);}

  if(this.shake>0){this.camera.position.x+=(Math.random()-.5)*this.shake;this.camera.position.y+=(Math.random()-.5)*this.shake;this.shake=Math.max(0,this.shake-dt*1.7);}this.camera.updateMatrixWorld();
 }
 burst(x,y,z,color,n=10){for(let i=0;i<n;i++){const mesh=this.box(.1,.1,.1,color,x,y,z);mesh.castShadow=false;this.effects.push({mesh,vx:(Math.random()-.5)*6,vy:2+Math.random()*4,vz:(Math.random()-.5)*6,life:.7});}}
 floating(text,x,z,color='#ffe0a1'){const el=document.createElement('div');el.className='world-label';el.style.color=color;el.style.fontSize='16px';el.style.background='none';el.style.fontWeight='900';el.textContent=text;this.labelRoot.append(el);this.floaters.push({el,x,z,y:2,life:1});}
 event(e){
  if(e.type==='airjump')this.burst(e.x,e.y+(e.floor||0)*CASTLE.height+.4,e.z,'#dff0ff',8);
  if(e.type==='treehit'){this.burst(0,3,0,'#ffe086',7);}
  if(e.type==='hit'){this.burst(e.x,1.1,e.z,'#ffdc8c',9);this.floating(e.extend?'+'+e.extend+' SN':e.extend===0?'EN ÇOK 30 SN':e.hp!=null?'-1 CAN':'PAT!',e.x,e.z);if(e.victim===0||e.player===0)this.shake=.16;}
  if(e.type==='knockout'){this.burst(e.x,1.4,e.z,'#ff7d6e',18);this.floating('NAKAVT!',e.x,e.z);if(e.victim===0)this.shake=.3;}
  if(e.type==='stun'){this.burst(e.x,1.7,e.z,'#ffdd7e',15);this.floating(e.gold?'SERSEM! -'+e.gold+' ALTIN':'SERSEM!',e.x,e.z);if(e.victim===0)this.shake=.25;}
  if(e.type==='deposit'||e.type==='buy'){this.burst(e.x,1,e.z,'#ffdc87',18);this.floating('+1 EŞYA',e.x,e.z);}
  if(e.type==='respawn'){this.burst(e.x,1,e.z,COLORS[e.player],20);}
 }
 render(w,dt,{started=false,aim=null,nearest=null}={}){
  this.world=w;this.time+=dt;this.updateCamera(dt,started);
  const hero=w.players[w.me||0],location=roomAt(w,hero),elevation=(hero.floor||0)*CASTLE.height;this.plane.constant=-elevation;this.occlusionTarget.set(hero.x,elevation+hero.y+1.25,hero.z);const cameraDistance=this.camera.position.distanceTo(this.occlusionTarget);this.occlusionRay.set(this.camera.position,this.occlusionTarget.clone().sub(this.camera.position).normalize());
  for(const b of w.bases){const v=this.baseViews[b.id],n=countItems(w,b.id),here=location?.base===b.id;
   v.p.visible=true;const hit=this.occlusionRay.intersectBox(v.bounds,this.occlusionHit);v.occluded=v.bounds.containsPoint(this.camera.position)||(!!hit&&this.camera.position.distanceTo(hit)<cameraDistance-.25);v.label.suppressed=!v.p.visible||here||v.occluded;
   v.banner.visible=!here&&!v.occluded;
   for(let f=0;f<3;f++)for(const part of v.levels[f].parts){
    let opacity=v.occluded&&!here?.10:1;
    if(here){if(part.kind==='roof')opacity=.015;else if(f>location.floor)opacity=.025;else if(f<location.floor)opacity=.06;else if(part.kind==='wall')opacity=.18;else if(part.room>=0&&part.room!==location.room)opacity=.13;}
    part.mesh.material.opacity=opacity;part.mesh.material.depthWrite=opacity>.5;part.mesh.castShadow=opacity>.5;
   }
   html(v.label.el,'<b style="color:'+this.world.players[b.id].color+'">'+(b.id===hero.id?'SENİN KALE':escape(w.players[b.id].name.toLocaleUpperCase('tr-TR')))+'</b> · '+n+'/'+RULES.target+'<span>3 KAT</span>');
  }
  for(const p of w.players){const v=this.actorViews.get(p.id),speed=Math.hypot(p.vx,p.vz),walk=Math.min(speed/6,1),phase=this.time*13;
   v.root.visible=p.id===hero.id||visibleTo(w,hero,p);if(!v.root.visible){v.label.suppressed=true;continue;}v.label.suppressed=false;v.root.position.set(p.x,p.y+.2+(p.floor||0)*CASTLE.height,p.z);v.root.rotation.y=p.angle;v.body.rotation.z=p.stun>0?.45+Math.sin(this.time*4)*.12:p.hurt>0?Math.sin(this.time*38)*.11:0;v.body.position.y=Math.abs(Math.sin(phase))*walk*.045;
   v.legs.forEach((l,i)=>l.rotation.x=Math.sin(phase+i*Math.PI)*walk*.65);
   v.arms[0].rotation.x=p.held!==null?-.7:Math.sin(phase+Math.PI)*walk*.5;
   v.arms[1].rotation.x=p.attack>0?-1.2:Math.sin(phase)*walk*.35;v.arms[1].rotation.z=p.attack>0?-.4:0;v.arms[1].rotation.y=p.attack>0?(-1.8+(1-p.attack/.36)*3.4):0;
   v.weapon.visible=!!p.hasClub;v.stars.visible=p.stun>0;v.stars.rotation.y=this.time*3;
   v.aura.material.opacity=p.inv>0?.3+Math.sin(this.time*20)*.25:.8;
   html(v.label.el,'<span style="color:'+p.color+'">'+escape(p.name)+'</span>'+(p.stun>0?'<span class="stun-text">✦ '+p.stun.toFixed(1)+' sn</span>':'')+(p.id===hero.id&&!p.hasClub?'<span class="unarmed">SOPA YOK · KAPIDAKİ KASADAN AL</span>':''));
  }
  const itemIds=new Set(w.items.map(i=>i.id));for(const [id,v]of this.itemViews)if(!itemIds.has(id)){this.scene.remove(v);this.itemViews.delete(id);}
  for(const i of w.items){let v=this.itemViews.get(i.id);if(!v){v=this.buildItem(i.kind);this.itemViews.set(i.id,v);}
   v.visible=i.holder===hero.id||visibleTo(w,hero,i);
   if(i.holder!==null){const p=w.players[i.holder];v.scale.setScalar(.8);v.position.set(p.x-Math.sin(p.angle)*.53,p.y+1.02+(p.floor||0)*CASTLE.height,p.z-Math.cos(p.angle)*.53);v.rotation.set(.15,p.angle,0);}
   else{v.scale.setScalar(1);v.position.set(i.x,.22+(i.floor||0)*CASTLE.height,i.z);v.rotation.set(0,i.id*.7,0);}
  }
  const coins=new Set(w.coins.map(c=>c.id));for(const [id,v]of this.coinViews)if(!coins.has(id)){this.scene.remove(v);this.coinViews.delete(id);}
  for(const c of w.coins){let v=this.coinViews.get(c.id);if(!v){v=new T.Group();const coin=this.cyl(.16,.075,'#efc75d',0,0,0,v);coin.rotation.x=Math.PI/2;this.scene.add(v);this.coinViews.set(c.id,v);}v.visible=visibleTo(w,hero,c);v.position.set(c.x,(c.floor||0)*CASTLE.height+.43+Math.abs(Math.sin(c.age*8))*.25*Math.max(0,1-c.age)+Math.sin(this.time*3+c.id)*.04,c.z);v.rotation.y=this.time*2+c.id;}
  const shots=new Set(w.shots.map(s=>s.id));for(const [id,v]of this.shotViews)if(!shots.has(id)){this.scene.remove(v);this.shotViews.delete(id);}
  for(const s of w.shots){let v=this.shotViews.get(s.id);if(!v){v=this.club(this.scene);this.shotViews.set(s.id,v);}v.visible=visibleTo(w,hero,s);v.position.set(s.x,1.15+(s.floor||0)*CASTLE.height,s.z);v.rotation.set(Math.PI/2,this.time*23,0);}
  this.selection.visible=started&&!!nearest&&w.players[w.me||0].held===null;if(nearest)this.selection.position.set(nearest.x,.26+elevation,nearest.z);
  this.aimRing.visible=started&&!!aim&&this.mode==='iso';this.aimLine.visible=started&&!!aim&&w.players[w.me||0].hasClub;
  if(aim){const p=w.players[w.me||0],dx=aim.x-p.x,dz=aim.z-p.z,d=Math.hypot(dx,dz),len=Math.min(d,RULES.throwRange);this.aimRing.position.set(aim.x,.25+elevation,aim.z);const pos=this.aimLine.geometry.attributes.position;pos.setXYZ(0,p.x,.35+elevation,p.z);pos.setXYZ(1,p.x+dx/Math.max(.01,d)*len,.35+elevation,p.z+dz/Math.max(.01,d)*len);pos.needsUpdate=true;this.aimLine.geometry.computeBoundingSphere();this.aimLine.computeLineDistances();}
  for(let i=this.effects.length-1;i>=0;i--){const f=this.effects[i];f.life-=dt;f.vy-=13*dt;f.mesh.position.x+=f.vx*dt;f.mesh.position.y+=f.vy*dt;f.mesh.position.z+=f.vz*dt;f.mesh.rotation.x+=dt*8;if(f.life<=0){this.scene.remove(f.mesh);this.effects.splice(i,1);}}
  this.facing.visible=started;this.facing.position.set(hero.x+Math.sin(hero.angle)*1.2,elevation+.25,hero.z+Math.cos(hero.angle)*1.2);this.facing.rotation.set(Math.PI/2,0,-hero.angle);
  for(const l of this.labels){l.object.getWorldPosition(this.projected);const q=this.project(this.projected.x,this.projected.y+l.height,this.projected.z);l.el.hidden=l.suppressed||!l.object.visible||q.z>1||q.z< -1||q.x<0||q.x>innerWidth||q.y<75||q.y>innerHeight-80;if(!l.el.hidden){l.el.style.left=q.x+'px';l.el.style.top=q.y+'px';}}
  for(let i=this.floaters.length-1;i>=0;i--){const f=this.floaters[i];f.life-=dt;f.y+=dt;const q=this.project(f.x,f.y,f.z);f.el.style.left=q.x+'px';f.el.style.top=q.y+'px';f.el.style.opacity=Math.max(0,f.life);if(f.life<=0){f.el.remove();this.floaters.splice(i,1);}}
  this.renderer.render(this.scene,this.camera);
 }
}
