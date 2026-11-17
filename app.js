const $ = (id) => document.getElementById(id);
const state = { room:null, key:null, nickname:"", ws:null, peer:false, invite:null, pc:null, localStream:null, recorder:null, chunks:[], recording:false, incoming:new Map(), callKind:null };
const encoder = new TextEncoder(), decoder = new TextDecoder();
const RELAY_PATH = "/room/";
const MAX_FILE = 12 * 1024 * 1024;

function b64(bytes){let s=""; for(const b of new Uint8Array(bytes)) s+=String.fromCharCode(b); return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function unb64(s){s=s.replace(/-/g,"+").replace(/_/g,"/"); while(s.length%4)s+="="; return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
function randomHex(n){return [...crypto.getRandomValues(new Uint8Array(n))].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function deriveKey(secret){const material=await crypto.subtle.importKey("raw",encoder.encode(secret),"PBKDF2",false,["deriveKey"]);return crypto.subtle.deriveKey({name:"PBKDF2",salt:encoder.encode("ustwo-v1:"+state.room),iterations:250000,hash:"SHA-256"},material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);}
async function encryptObject(obj){const iv=crypto.getRandomValues(new Uint8Array(12));const data=encoder.encode(JSON.stringify(obj));const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv},state.key,data);return {iv:b64(iv),data:b64(encrypted)};}
async function decryptObject(packet){const raw=await crypto.subtle.decrypt({name:"AES-GCM",iv:unb64(packet.iv)},state.key,unb64(packet.data));return JSON.parse(decoder.decode(raw));}
function setStatus(text,on=false){$("statusText").textContent=text;$("statusDot").classList.toggle("on",on);}
function showError(id,msg){$(id).textContent=msg;setTimeout(()=>{if($(id).textContent===msg)$(id).textContent=""},6500);}
function inviteUrl(){return `${location.origin}/#room=${encodeURIComponent(state.room)}&key=${encodeURIComponent(state.secret)}`;}
async function setup(room,secret,nickname){
  state.room=room;state.secret=secret;state.nickname=nickname||"You";state.key=await deriveKey(secret);state.invite=inviteUrl();
  $("gate").style.display="none";$("chat").style.display="flex";$("roomTitle").textContent="Your private room";
  await connect();
}
async function connect(){
  const scheme=location.protocol==="https:"?"wss:":"ws:";
  const ws=new WebSocket(`${scheme}//${location.host}${RELAY_PATH}${state.room}`);state.ws=ws;setStatus("Connecting…");
  ws.onopen=()=>{setStatus("Connected",true);ws.send(JSON.stringify({type:"hello",name:state.nickname}));};
  ws.onclose=()=>{setStatus("Offline");$("peerState").textContent="Connection lost — retrying…";setTimeout(()=>{if(state.room)connect()},3000);};
  ws.onerror=()=>setStatus("Connection issue");
  ws.onmessage=async ev=>{
    let msg;try{msg=JSON.parse(ev.data)}catch{return}
    if(msg.type==="peer"){state.peer=msg.count>1;$("peerState").textContent=state.peer?"The other phone is here ♡":"Waiting for the other phone…";return}
    if(msg.type==="hello"){state.peer=true;$("peerState").textContent="The other phone is here ♡";return}
    if(msg.type==="signal"){await handleSignal(msg.data);return}
    if(msg.type==="packet"){try{const data=await decryptObject(msg.packet);await handlePayload(data)}catch(e){console.warn("Could not decrypt packet",e)}}
  };
}
function sendRaw(obj){if(state.ws?.readyState===WebSocket.OPEN)state.ws.send(JSON.stringify(obj));else showError("chatError","Not connected. Please wait a moment and try again.");}
async function sendPayload(payload){const packet=await encryptObject(payload);sendRaw({type:"packet",packet});}
function addBubble(content,mine,kind="text"){
  const empty=document.querySelector(".empty");if(empty)empty.remove();
  const bubble=document.createElement("div");bubble.className="bubble"+(mine?" mine":"");
  if(kind==="image"){const img=document.createElement("img");img.src=content;img.alt="Shared photo";bubble.append(img)}
  else if(kind==="video"){const v=document.createElement("video");v.src=content;v.controls=true;v.playsInline=true;bubble.append(v)}
  else if(kind==="audio"){const a=document.createElement("audio");a.src=content;a.controls=true;bubble.append(a)}
  else {const p=document.createElement("div");p.textContent=content;bubble.append(p)}
  const meta=document.createElement("div");meta.className="meta";meta.textContent=(mine?"You":"Her")+" · "+new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});bubble.append(meta);
  $("messages").append(bubble);$("messages").scrollTop=$("messages").scrollHeight;
}
async function handlePayload(d){
  if(d.kind==="text")addBubble(d.text,d.from===state.nickname);
  if(d.kind==="file-start"){state.incoming.set(d.id,{name:d.name,mime:d.mime,total:d.total,parts:[]});}
  if(d.kind==="file-part"){const f=state.incoming.get(d.id);if(f){f.parts[d.index]=d.part;if(f.parts.filter(Boolean).length===f.total){const blob=new Blob(f.parts.map(x=>unb64(x)),{type:f.mime});const url=URL.createObjectURL(blob);addBubble(url,false,f.mime.startsWith("video/")?"video":"image");state.incoming.delete(d.id);}}}
  if(d.kind==="voice")addBubble(d.data,false,"audio");
}
$("createBtn").onclick=async()=>{
  const name=$("nickname").value.trim()||"You";const room=randomHex(12),secret=randomHex(24);
  await setup(room,secret,name);
  try{await navigator.clipboard.writeText(state.invite);showError("chatError","Private invite link copied. Send it only to your girlfriend.");}catch{showError("chatError","Room created. Tap the share button to copy your invite.");}
};
$("joinBtn").onclick=async()=>{
  try{const raw=$("invite").value.trim();const url=new URL(raw);const p=new URLSearchParams(url.hash.slice(1));const room=p.get("room"),secret=p.get("key");if(!room||!secret)throw Error("Invite link is missing its room details.");await setup(room,secret,$("nickname").value.trim()||"You");}
  catch(e){showError("gateError",e.message||"That invite link doesn't look right.");}
};
$("sendBtn").onclick=sendText;
$("messageInput").addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendText()}});
async function sendText(){const input=$("messageInput"),text=input.value.trim();if(!text)return;input.value="";await sendPayload({kind:"text",text,from:state.nickname});addBubble(text,true);}
$("attachBtn").onclick=()=>$("fileInput").click();
$("fileInput").onchange=async e=>{
  const file=e.target.files[0];e.target.value="";if(!file)return;
  if(file.size>MAX_FILE){showError("chatError","For this first version, files must be 12 MB or smaller.");return}
  if(!state.peer){showError("chatError","Your girlfriend needs to be online to receive this file.");return}
  const bytes=new Uint8Array(await file.arrayBuffer()),id=randomHex(8),chunkSize=24*1024,total=Math.ceil(bytes.length/chunkSize);
  await sendPayload({kind:"file-start",id,name:file.name,mime:file.type,total});
  for(let i=0;i<total;i++){const chunk=bytes.slice(i*chunkSize,Math.min(bytes.length,(i+1)*chunkSize));await sendPayload({kind:"file-part",id,index:i,part:b64(chunk)});}
  const url=URL.createObjectURL(file);addBubble(url,true,file.type.startsWith("video/")?"video":"image");
};
$("recordBtn").onclick=async()=>{
  if(state.recording){state.recorder.stop();$("recordBtn").textContent="🎙";state.recording=false;return}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){showError("chatError","Voice recording isn't supported in this browser.");return}
  try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});state.chunks=[];state.recorder=new MediaRecorder(stream);state.recorder.ondataavailable=e=>{if(e.data.size)state.chunks.push(e.data)};state.recorder.onstop=async()=>{const blob=new Blob(state.chunks,{type:state.recorder.mimeType||"audio/webm"});stream.getTracks().forEach(t=>t.stop());if(blob.size>MAX_FILE){showError("chatError","That voice message is too large.");return}const data=b64(await blob.arrayBuffer());await sendPayload({kind:"voice",data,mime:blob.type});addBubble(URL.createObjectURL(blob),true,"audio")};state.recorder.start();state.recording=true;$("recordBtn").textContent="■";}
  catch{showError("chatError","Microphone permission was not granted.");}
};
$("inviteBtn").onclick=async()=>{try{await navigator.clipboard.writeText(state.invite);showError("chatError","Invite link copied. Keep it private.");}catch{showError("chatError","Copy this invite from your browser address bar: "+state.invite)}};

async function startCall(kind){
  if(!state.peer){showError("chatError","The other phone needs to be online first.");return}
  try{
    state.callKind=kind;state.localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:kind==="video"});
    $("localVideo").srcObject=state.localStream;$("localVideo").style.display=kind==="video"?"block":"none";$("remoteVideo").style.display=kind==="video"?"block":"none";
    $("callPanel").style.display="block";$("callLabel").textContent=kind==="video"?"Video call":"Voice call";$("callStatus").textContent="Calling…";
    state.pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
    state.localStream.getTracks().forEach(t=>state.pc.addTrack(t,state.localStream));
    state.pc.ontrack=e=>{$("remoteVideo").srcObject=e.streams[0];$("callStatus").textContent="Connected";};
    state.pc.onicecandidate=e=>{if(e.candidate)sendRaw({type:"signal",data:{candidate:e.candidate}})};
    state.pc.onconnectionstatechange=()=>{$("callStatus").textContent=state.pc?.connectionState||"Call ended";};
    const offer=await state.pc.createOffer();await state.pc.setLocalDescription(offer);sendRaw({type:"signal",data:{description:state.pc.localDescription}});
  }catch(e){showError("chatError","Call could not start: "+e.message);endCall();}
}
async function handleSignal(data){
  try{
    if(data.hangup){endCall(false);$("callStatus").textContent="Call ended";return;}
    if(data.description){
      if(!state.pc){
        const wantsVideo = /m=video/i.test(data.description.sdp || "");
        if(!confirm(wantsVideo ? "Incoming video call. Accept?" : "Incoming voice call. Accept?")) {
          sendRaw({type:"signal",data:{hangup:true}});
          return;
        }
        state.callKind=wantsVideo?"video":"audio";
        state.localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:wantsVideo});
        $("localVideo").srcObject=state.localStream;
        $("localVideo").style.display=wantsVideo?"block":"none";
        $("remoteVideo").style.display=wantsVideo?"block":"none";
        $("callPanel").style.display="block";$("callLabel").textContent=wantsVideo?"Video call":"Voice call";$("callStatus").textContent="Connecting…";
        state.pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"}]});
        state.localStream.getTracks().forEach(t=>state.pc.addTrack(t,state.localStream));
        state.pc.ontrack=e=>{$("remoteVideo").srcObject=e.streams[0];$("callStatus").textContent="Connected";};
        state.pc.onicecandidate=e=>{if(e.candidate)sendRaw({type:"signal",data:{candidate:e.candidate}})};
      }
      await state.pc.setRemoteDescription(data.description);
      if(data.description.type==="offer"){const answer=await state.pc.createAnswer();await state.pc.setLocalDescription(answer);sendRaw({type:"signal",data:{description:state.pc.localDescription}});}
    }else if(data.candidate&&state.pc){await state.pc.addIceCandidate(data.candidate);}
  }catch(e){console.warn("Call signaling error",e);showError("chatError","Call setup failed. Try again.");}
}
function endCall(notify=true){if(state.pc){state.pc.close();state.pc=null}if(state.localStream){state.localStream.getTracks().forEach(t=>t.stop());state.localStream=null}$("callPanel").style.display="none";$("remoteVideo").srcObject=null;$("localVideo").srcObject=null;if(notify)sendRaw({type:"signal",data:{hangup:true}});}
$("voiceCall").onclick=()=>startCall("audio");$("videoCall").onclick=()=>startCall("video");$("hangupBtn").onclick=endCall;
$("muteBtn").onclick=()=>{const t=state.localStream?.getAudioTracks()[0];if(t){t.enabled=!t.enabled;$("muteBtn").textContent=t.enabled?"Mute":"Unmute"}};
$("cameraBtn").onclick=()=>{const t=state.localStream?.getVideoTracks()[0];if(t){t.enabled=!t.enabled;$("cameraBtn").textContent=t.enabled?"Camera off":"Camera on"}};
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(console.warn));
