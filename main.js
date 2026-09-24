import {CASTLE,ROOM_NAMES,roomAt,visibleTo,nearStairs,allied} from './castle.js';
import {createWorld,step,RULES,nearClubCrate,castleInvaded,targetScore,countItems,inside,dist,buy,interact,melee,throwClub} from './sim.js';
import {GameView} from './view.js';
import {Network} from './net.js';
const $=s=>document.querySelector(s),canvas=$('#scene');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const overlays=['home','lobby','menu','shortcuts','results'];
let world=createWorld(),view,started=false,online=false,screen='home',helpReturn='home',last=performance.now(),acc=0,uiTimer=0,netTimer=0,pingTimer=0,toastLeft=0,sound=true,audioCtx,latest=null,snapshotAt=0,fps=60,slowTime=0,quality=1;
const keys=new Set(),edges={},pointer={x:innerWidth/2,y:innerHeight/2,inside:false,held:false,middle:false};
try{view=new GameView(canvas,world);}catch(e){$('#fatal').hidden=false;throw e;}
try{$('#nickname').value=((localStorage.getItem('kale.nick')||'')==='Gezgin'?'':localStorage.getItem('kale.nick'))||'Kale Taşımacılık';}catch{}
const nick=()=>{const name=$('#nickname').value.trim().slice(0,16)||'Kale Taşımacılık';try{localStorage.setItem('kale.nick',name);}catch{}return name;};
const hero=()=>world.players[world.me||0];
function tone(freq=380){if(!sound)return;try{audioCtx??=new AudioContext();audioCtx.resume();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=freq;g.gain.setValueAtTime(.025,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.12);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.13);}catch{}}
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');toastLeft=3;}
function clearInput(){keys.clear();pointer.held=pointer.middle=false;for(const k in edges)delete edges[k];if(online)net.send('input',{input:{}});}
function unlock(){if(document.pointerLockElement)document.exitPointerLock();}
function lock(){try{canvas.requestPointerLock?.()?.catch?.(()=>{});}catch{}}
function show(name){screen=name;for(const id of overlays)$('#'+id).hidden=id!==name;document.body.classList.toggle('playing',started);if(name){clearInput();unlock();}$('#crosshair').hidden=!!name||!started||view.mode!=='third';}
function build(w){const mode=view?.mode||'iso';view?.dispose();world=w;view=new GameView(canvas,world);view.setMode(mode);view.setQuality(quality);view.overview=false;view.resize();}
function launch(w,network=false){online=network;latest=network?w:null;snapshotAt=performance.now();build(w);started=true;acc=0;show(null);clearInput();updateUI();if(view.mode==='third')lock();}
function startSolo(){net.leave();launch(createWorld(71,{names:[nick()]}));}
function goHome(){net.leave();online=false;started=false;latest=null;show('home');$('#net-status').hidden=true;}
function events(list){for(const e of list){if(e.type==='claim')toast((world.mode==='solo'?world.players[e.player].name:world.players[e.player].team===0?'Mavi takım':'Kırmızı takım')+' '+targetScore(world)+' eşyaya ulaştı · 60 saniye!');
 if(e.player===hero().id||e.victim===hero().id||e.type==='treehit'){view.event(e);if(['pickup','deposit','coin','hit','treehit'].includes(e.type))tone(e.type==='coin'?750:350);if(e.type==='rearm')toast('Kasadan yeni sopa aldın.');if(e.type==='stairs'&&e.player===hero().id)toast((e.to>e.from?'↑ Yukarı · ':'↓ Aşağı · ')+(e.to+1)+'. kata '+(e.to>e.from?'çıkıyorsun':'iniyorsun'));if(e.type==='knockout'&&e.victim===hero().id)toast('Canın bitti · Bayıldın. Süre bitince kalende doğacaksın.');if(e.type==='knockout'&&e.player===hero().id)toast(world.players[e.victim].name+' bayıldı · Kalesi korumasız!');if(e.type==='deposit')toast('Eşya bu odada saklandı.');}
 }if(world.winner!==null&&screen!=='results')result();}
function receive(w){latest=w;snapshotAt=performance.now();const old=world;world={...w,players:w.players.map(p=>{const prev=old.players[p.id];return !p.hidden&&prev&&!prev.hidden&&prev.floor===p.floor?{...p,x:prev.x,z:prev.z,y:prev.y}:{...p};})};events(w.events||[]);}
const net=new Network({lobby:renderLobby,start:w=>launch(w,true),snapshot:receive,error:message=>{toast(message);$('#home-status-message').textContent=message;$('#lobby-status').textContent=message;},status:message=>{$('#net-status').textContent=message;$('#net-status').hidden=!message||!(online||net.room);},
 online:n=>{const el=$('#home-online');el.textContent=n>0?'● '+n+' çevrim içi':'';el.title='Siteyi şu an açık tutan sekme sayısı';}});
async function connectAction(type,body){$('#home-status-message').textContent='Bağlanıyor…';try{await net.connect(nick());net.send(type,{...body,name:nick()});$('#home-status-message').textContent='';}catch(e){$('#home-status-message').textContent=e.message;}}
function renderLobby(lobby){$('#lobby-code').textContent=lobby.code;$('#lobby-mode').textContent=lobby.mode==='coop'?"Co-op · 5'e 5 · İnsanlar mavi takımda":"PvP · 5'e 5 · Boş koltuğa tıklayıp takımını seç";
 for(const team of [0,1]){const root=$(team===0?'#blue-seats':'#red-seats');root.replaceChildren();for(const s of lobby.seats.filter(s=>s.team===team)){const b=document.createElement('button');b.className='seat'+(s.id===net.id?' me':'');b.dataset.slot=s.slot;b.disabled=!!s.id||(lobby.mode==='coop'&&team===1)||lobby.state!=='lobby';b.textContent=(s.id===net.id?'● ':'')+s.name+(s.id&&!s.online?' · bağlantı koptu':!s.id?' · boş koltuk':'');b.onclick=()=>net.send('seat',{slot:s.slot});root.append(b);}}
 $('#lobby-start').hidden=lobby.host!==net.id;$('#lobby-status').textContent=lobby.host===net.id?'Boş koltukları botlar doldurur.':'Oda sahibinin başlatması bekleniyor.';
 if(lobby.state==='lobby'){started=false;show('lobby');}else if(screen==='results')$('#again').hidden=lobby.host!==net.id;
}
$('#solo').onclick=startSolo;$('#coop').onclick=()=>connectAction('create',{mode:'coop'});$('#pvp').onclick=()=>connectAction('create',{mode:'pvp'});
$('#join-toggle').onclick=()=>{$('#join-row').hidden=!$('#join-row').hidden;$('#room-code').focus();};$('#join').onclick=()=>connectAction('join',{code:$('#room-code').value.trim().toUpperCase()});
$('#room-code').onkeydown=e=>{if(e.key==='Enter')$('#join').click();};
$('#lobby-start').onclick=()=>net.send('start');$('#lobby-leave').onclick=goHome;
$('#copy-room').onclick=async()=>{const url=location.origin+'/?oda='+net.room.code;try{await navigator.clipboard.writeText(url);$('#lobby-status').textContent='Katılma linki kopyalandı.';}catch{$('#lobby-status').textContent=url;}};
function pause(){if(!started)return;show(screen==='menu'?null:'menu');$('#online-note').textContent=online?'Çevrim içi maç menü açıkken devam eder.':'';}
function help(){if(screen==='shortcuts'){show(helpReturn);return;}helpReturn=screen;show('shortcuts');}
for(const id of ['help','home-help','menu-help','help-bottom'])$('#'+id).onclick=help;$('#help-close').onclick=()=>show(helpReturn);
$('#pause').onclick=pause;$('#resume').onclick=()=>{show(null);last=performance.now();if(view.mode==='third')lock();};$('#leave').onclick=$('#result-home').onclick=goHome;
$('#quality').onclick=()=>{quality=(quality+1)%3;view.setQuality(quality);updateUI();};$('#sound').onclick=()=>{sound=!sound;$('#sound').textContent='Ses: '+(sound?'Açık':'Kapalı');};
$('#score-toggle').onclick=()=>$('#score-panel').hidden=!$('#score-panel').hidden;
$('#buy').onclick=()=>{if(started&&!screen)edges.buy=true;};for(const b of document.querySelectorAll('[data-floor]'))b.onclick=()=>{edges.floor=Number(b.dataset.floor);};
$('#again').onclick=()=>{if(online)net.send('rematch');else startSolo();};
function camera(){view.setMode(view.mode==='iso'?'third':'iso');$('#camera').textContent=view.mode==='iso'?'V · Omuz':'V · İzometrik';$('#crosshair').hidden=view.mode==='iso'||!!screen;if(view.mode==='third'&&!screen)lock();else unlock();}
$('#camera').onclick=camera;
const prevent=new Set(['Space','Tab','F1','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Digit1','Digit2','Digit3']);let unlockedAt=-1000;
window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(e.target.tagName))return;if(prevent.has(e.code))e.preventDefault();if(e.code==='F1'){if(!e.repeat)help();return;}if(e.code==='Escape'){if(document.pointerLockElement||performance.now()-unlockedAt<350)return;if(screen==='shortcuts')show(helpReturn);else pause();return;}if(!started||screen)return;if(e.code==='Tab'){if(document.pointerLockElement)unlock();else if(view.mode==='third')lock();return;}keys.add(e.code);if(e.repeat)return;
 if(e.code==='KeyV')camera();if(e.code==='KeyE')edges.grab=true;if(e.code==='KeyB')edges.buy=true;if(e.code==='Space')edges.jump=true;if(e.code==='KeyF')edges.hit=true;if(e.code==='KeyQ')edges.throw=true;if(/^Digit[123]$/.test(e.code))edges.floor=Number(e.code.slice(-1))-1;
});
window.addEventListener('keyup',e=>keys.delete(e.code));
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('pointermove',e=>{if(view.mode==='third'&&(document.pointerLockElement===canvas||pointer.middle)){view.yaw-=e.movementX*.0022;view.pitch=Math.max(.08,Math.min(.9,view.pitch+e.movementY*.0022));}else{pointer.x=e.clientX;pointer.y=e.clientY;pointer.inside=true;}});
canvas.addEventListener('pointerleave',()=>pointer.inside=false);
canvas.addEventListener('pointerdown',e=>{if(!started||screen)return;if(e.button===1){e.preventDefault();pointer.middle=true;return;}if(view.mode==='third'&&!document.pointerLockElement&&e.button===0){lock();return;}pointer.x=e.clientX;pointer.y=e.clientY;pointer.inside=true;if(e.button===0){edges.hit=true;pointer.held=true;}if(e.button===2)edges.throw=true;});
window.addEventListener('pointerup',e=>{if(e.button===0)pointer.held=false;if(e.button===1)pointer.middle=false;});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas){unlockedAt=performance.now();pointer.held=false;}});
canvas.addEventListener('wheel',e=>{e.preventDefault();if(view.mode==='iso'){view.zoom=Math.max(10,Math.min(22,view.zoom+Math.sign(e.deltaY)));view.resize();}},{passive:false});
window.addEventListener('blur',()=>{clearInput();if(started&&!screen)pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(started&&!screen)pause();}});window.addEventListener('resize',()=>view.resize());
function aim(){const p=hero();if(view.mode==='third')return view.aimFromScreen(innerWidth/2,innerHeight/2)||{x:p.x+Math.sin(view.yaw)*12,z:p.z+Math.cos(view.yaw)*12};return pointer.inside?view.aimFromScreen(pointer.x,pointer.y):null;}
function input(){const right=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft')),down=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));let x,z;if(view.mode==='iso'){x=right+down;z=-right+down;}else{x=-Math.sin(view.yaw)*down-Math.cos(view.yaw)*right;z=-Math.cos(view.yaw)*down+Math.sin(view.yaw)*right;}const len=Math.hypot(x,z);if(len){x/=len;z/=len;}const out={x,z,aim:aim(),sprint:keys.has('ShiftLeft')||keys.has('ShiftRight'),...edges};if(pointer.held)out.hit=true;for(const k in edges)delete edges[k];return out;}
function nearest(){const p=hero();return world.items.filter(i=>i.holder===null&&visibleTo(world,p,i)&&dist(i,p)<1.8&&(i.base===null||i.base===p.id||!allied(world,p.id,i.base))).sort((a,b)=>dist(a,p)-dist(b,p))[0]||null;}
function score(team){return world.players.filter(p=>p.team===team).reduce((n,p)=>n+countItems(world,p.id),0);}
function result(){unlock();show('results');const won=world.mode==='solo'?world.winner===hero().id:world.winnerTeam===hero().team;$('#result-title').textContent=won?'Hazine sizin!':'Bir sonraki sefer…';$('#result-summary').textContent=(world.mode==='solo'?world.players[world.winner].name:(world.winnerTeam===0?'Mavi takım':'Kırmızı takım'))+' kazandı · '+Math.floor(world.time/60)+' dk '+Math.floor(world.time%60)+' sn';
 const rows=[...world.players].sort((a,b)=>countItems(world,b.id)-countItems(world,a.id));$('#result-table').innerHTML='<table><thead><tr><th>Oyuncu</th><th>Eşya</th><th>Çalma</th><th>İsabet</th><th>Nakavt</th><th>Sersemletme</th><th>Altın</th><th>Ağaç</th><th>Kaçınma</th></tr></thead><tbody>'+rows.map(p=>'<tr><td style="color:'+p.color+'">'+escape(p.name)+'</td><td>'+countItems(world,p.id)+'</td>'+['steals','hits','knockouts','stuns','goldCollected','treeHits','dodges'].map(k=>'<td>'+(p.stats[k]||0)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';$('#again').hidden=online&&net.room?.host!==net.id;
}
function updateUI(){const p=hero(),own=world.bases[p.id],n=countItems(world,p.id),total=world.mode==='solo'?n:score(p.team);$('#gold').textContent=p.gold||0;{const hp=Math.max(0,Math.min(RULES.hp,p.hp??RULES.hp));$('#hearts').innerHTML='♥'.repeat(hp)+'<i>'+'♥'.repeat(RULES.hp-hp)+'</i>';}$('#home-count').innerHTML=n+' <small>eşya</small>';$('#home-bar').style.width=Math.min(100,total/targetScore(world)*100)+'%';$('#team-count').textContent=world.mode==='solo'?'Hedef: '+n+' / '+targetScore(world):'Takım toplamı: '+total+' / '+targetScore(world);{const invaded=castleInvaded(world,p.id);$('#home-status').textContent=invaded?'RAKİP İÇERİDE':p.stun>0?'KORUMASIZ':'';$('#home-status').style.color='#ffb08a';}$('#buy').disabled=!started||!!screen||p.stun>0||!inside(p,own)||p.gold<15;$('#buy-hint').textContent=inside(p,own)?'B · 15 altına bir eşya':'Satın almak için kalene dön.';
 $('#mode-label').textContent=world.mode==='solo'?'Tek başına · 5 oyuncu':(world.mode==='coop'?'Co-op':'PvP')+' · 5v5';$('#match-clock').textContent=String(Math.floor(world.time/60)).padStart(2,'0')+':'+String(Math.floor(world.time%60)).padStart(2,'0');
 if(!$('#score-panel').hidden)$('#players').innerHTML=[...world.players].sort((a,b)=>countItems(world,b.id)-countItems(world,a.id)||(b.gold||0)-(a.gold||0)).map(v=>'<div class="player-row"><i class="player-dot" style="background:'+v.color+'"></i><div class="player-info">'+escape(v.name)+'</div><strong class="score-values">'+countItems(world,v.id)+' <small>eşya</small><span>'+(v.gold||0)+' altın</span></strong></div>').join('');
 const invaded=started&&!screen&&world.winner===null&&castleInvaded(world,p.id);$('#castle-alert').hidden=!invaded;$('#castle-alert-text').hidden=!invaded;
 const loc=roomAt(world,p);$('#location').textContent=loc?(loc.floor+1)+'. KAT · '+(loc.room<0?'KORİDOR':ROOM_NAMES[loc.room].toLocaleUpperCase('tr-TR')):'DIŞ ALAN';const stairs=started&&!screen&&nearStairs(world,p);$('#stairs').hidden=!stairs;for(const b of document.querySelectorAll('[data-floor]')){b.disabled=Number(b.dataset.floor)===(p.floor||0);b.classList.toggle('current',b.disabled);}
 const near=nearest();$('#context').textContent=screen?'':p.stun>0?'Kalende ayılmana '+p.stun.toFixed(1)+' sn · Sol tıkla karşılık ver':!p.hasClub&&nearClubCrate(world,p)?'E · Kasadan sopa al':p.held!==null?(inside(p,own)&&loc?.room>=0?'E · Bu odaya sakla':'E · Eşyayı bırak'):near?'E · Eşyayı al':!p.hasClub?'Sopan yok · Kendi kale kapındaki kasaya dön':Math.hypot(p.x,p.z)<4?'Sol tık · Altın ağacına vur':'';
 const banner=$('#state-banner');banner.hidden=!started||!!screen||!(p.stun>0);if(p.stun>0){banner.querySelector('b').textContent='BAYGINSIN · '+Math.ceil(p.stun)+' sn';banner.querySelector('span').textContent='Kalen korumasız · Süre bitince kalende sopayla doğacaksın';banner.querySelector('i').style.width=Math.min(100,p.stun/Math.max(p.stunTotal||RULES.stun,1)*100)+'%';}
 $('#claim').hidden=world.claimant===null||!started||screen==='results';if(world.claimant!==null){const winner=world.players[world.claimant];$('#claim').textContent=(world.mode==='solo'?winner.name:winner.team===0?'Mavi takım':'Kırmızı takım')+' kazanıyor · '+Math.max(0,Math.ceil(60-world.claimTime))+' sn · Hazinesini çal!';}
 $('#quality').textContent='Grafik: '+['Düşük','Orta','Yüksek'][quality];$('#perf').textContent=Math.round(fps)+' FPS · '+view.renderer.info.render.calls+' çizim'+(online?' · '+net.rtt+' ms':'');
}
function frame(now){requestAnimationFrame(frame);const dt=Math.min(.06,(now-last)/1000);last=now;fps+=(1/Math.max(.001,dt)-fps)*.025;
 if(started&&world.winner===null){if(online){netTimer-=dt;if(netTimer<=0){netTimer=.033;net.send('input',{input:screen?{}:input()});}pingTimer-=dt;if(pingTimer<=0){pingTimer=3;net.send('ping',{at:performance.now()});}
  if(latest){const lag=Math.min(.07,(performance.now()-snapshotAt)/1000);for(const p of world.players){const target=latest.players[p.id];if(p.hidden||!target||target.hidden)continue;const k=1-Math.exp(-22*dt);p.x+=(target.x+(target.vx||0)*lag-p.x)*k;p.z+=(target.z+(target.vz||0)*lag-p.z)*k;p.y+=(target.y-p.y)*k;}}
 }else if(!screen){acc+=dt;let guard=0;while(acc>=1/60&&guard++<5){step(world,1/60,input());acc-=1/60;events(world.events);world.events.length=0;if(world.winner!==null)break;}}}
 if(toastLeft>0){toastLeft-=dt;if(toastLeft<=0)$('#toast').classList.remove('show');}
 view.render(world,screen&&!online?0:dt,{started,aim:started&&!screen?aim():null,nearest:started&&!screen?nearest():null});
 uiTimer-=dt;if(uiTimer<=0){uiTimer=.12;updateUI();}
 if(started&&!screen&&fps<32&&quality>0){slowTime+=dt;if(slowTime>5){quality--;view.setQuality(quality);slowTime=0;toast('Akıcı oyun için grafik kalitesi azaltıldı.');}}else slowTime=0;
}
show('home');updateUI();requestAnimationFrame(frame);
const code=new URLSearchParams(location.search).get('oda');if(code){$('#join-row').hidden=false;$('#room-code').value=code;}
// Boşta bağlantı: giriş ekranındaki "çevrim içi" sayısı için (oda kurulunca / katılınca aynı bağlantı kullanılır).
net.connect(nick()).catch(()=>{});
if(new URLSearchParams(location.search).has('test'))window.__kaleTasima={state:()=>({started,screen,online,world,mode:view.mode,drawCalls:view.renderer.info.render.calls,camera:{x:view.camera.position.x,y:view.camera.position.y,z:view.camera.position.z},visibility:[...view.itemViews].map(([id,v])=>({id,visible:v.visible})),occluded:view.baseViews.map(b=>b.occluded)}),world:()=>world,view:()=>view,step:(n,input={})=>{for(let i=0;i<n;i++)step(world,1/60,input);events(world.events);world.events.length=0;updateUI();},interact:id=>interact(world,id),throwClub:(id,a)=>throwClub(world,id,a),melee:(id,a)=>melee(world,id,a),buy:id=>buy(world,id),net:()=>net};
