import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {WebSocketServer} from 'ws';
import {createRooms} from './rooms.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||5185),host=process.env.HOST||'127.0.0.1';
const files=new Set(['/index.html','/style.css','/main.js','/view.js','/sim.js','/castle.js','/net.js','/vendor/three.module.js','/vendor/three.core.js']);
const rooms=createRooms();
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 let url;try{url=new URL(req.url,'http://localhost');}catch{res.writeHead(400);return res.end();}
 if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({game:'Kale Taşıma',version:'0.3.0',...rooms.stats()}));}
 const file=url.pathname==='/'?'/index.html':url.pathname;
 if(!files.has(file)){res.writeHead(404);return res.end('Bulunamadı');}
 try{const data=await readFile(path.join(root,file));res.writeHead(200,{'Content-Type':types[path.extname(file)],'Cache-Control':'no-store'});res.end(data);}catch{res.writeHead(404);res.end('Dosya bulunamadı');}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?port+' portu kullanımda. PORT değerini değiştirin.':e);process.exitCode=1;});
const wss=new WebSocketServer({server,maxPayload:8192});wss.on('connection',ws=>rooms.attach(ws));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{rooms.close();for(const ws of wss.clients)ws.terminate();wss.close();server.close(()=>process.exit(0));});
server.listen(port,host,()=>console.log('Kale Taşıma: http://127.0.0.1:'+port));
