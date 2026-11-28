const api="https://renegados-f1-live.onrender.com/api/radio/transcripcion";
// Fragmentos inteligibles ya revisados de los Libres 1 de Las Vegas.
const revisadas = {
 "2026/2026-11-21_Las_Vegas_Grand_Prix/2026-11-19_Practice_1/TeamRadio/HIR_50_20261119_165039.mp3": "La dirección va bastante dura. Lo revisaremos.",
 "2026/2026-11-21_Las_Vegas_Grand_Prix/2026-11-19_Practice_1/TeamRadio/ANT_12_20261119_170452.mp3": "Sí, sí, hay aquaplaning por todas partes. Vale, recibido. No corras riesgos.",
 "2026/2026-11-21_Las_Vegas_Grand_Prix/2026-11-19_Practice_1/TeamRadio/ALB_23_20261119_170535.mp3": "¡Uf!",
 "2026/2026-11-21_Las_Vegas_Grand_Prix/2026-11-19_Practice_1/TeamRadio/BEG_38_20261119_170547.mp3": "Sí, increíble. Entra en boxes en esta vuelta, por favor.",
 "2026/2026-11-21_Las_Vegas_Grand_Prix/2026-11-19_Practice_1/TeamRadio/VER_3_20261119_171001.mp3": "Es como una pista de hielo. Sí, recibido."
};
const panel=document.getElementById("radio-es-panel");
const status=document.getElementById("radio-es-status");
const text=document.getElementById("radio-es-text");
const player=document.getElementById("radio-es-player");

let worker, request, playbackUrl, timer, sequence=0;
let selectedUrl, busy=false;

function playbackStatus(message,loading=false) {
 busy=loading;
 status.textContent=message;
 const button=[...document.querySelectorAll("button[data-radio-url]")].find(button=>button.dataset.radioUrl===selectedUrl);
 if (button) {
  button.textContent=loading?"Preparando en español…":"Escuchar en español";
  button.setAttribute("aria-busy",String(loading));
 }
}

function reset() {
 if (selectedUrl) playbackStatus("");
 request?.abort();
 request=new AbortController();
 ++sequence;
 clearTimeout(timer);
 worker?.terminate();
 worker=undefined;
 player.pause();
 player.removeAttribute("src");
 player.load();
 player.hidden=true;
 if(playbackUrl) URL.revokeObjectURL(playbackUrl);
 playbackUrl=undefined;
 text.textContent="";
}

function waveFile(audio, sampleRate) {
 const bytes=new ArrayBuffer(44+audio.length*2);
 const output=new DataView(bytes);
 const ascii=(offset,value)=>[...value].forEach((letter,index)=>output.setUint8(offset+index,letter.charCodeAt(0)));
 ascii(0,"RIFF");
 output.setUint32(4,bytes.byteLength-8,true);
 ascii(8,"WAVEfmt ");
 output.setUint32(16,16,true);
 output.setUint16(20,1,true);
 output.setUint16(22,1,true);
 output.setUint32(24,sampleRate,true);
 output.setUint32(28,sampleRate*2,true);
 output.setUint16(32,2,true);
 output.setUint16(34,16,true);
 ascii(36,"data");
 output.setUint32(40,audio.length*2,true);
 for(let i=0;i<audio.length;i++) output.setInt16(44+i*2,Math.max(-1,Math.min(1,audio[i]))*32767,true);
 return new Blob([bytes],{type:"audio/wav"});
}

async function transcribe(clip,signal) {
 const url=api+"?"+new URLSearchParams({clip});
 const deadline=Date.now()+120000;
 while(Date.now()<deadline) {
  signal.throwIfAborted();
  const timeout=AbortSignal.timeout(Math.min(40000,deadline-Date.now()));
  const response=await fetch(url,{signal:AbortSignal.any([signal,timeout]),cache:"no-store"}).catch(error=>{
   signal.throwIfAborted();
   if(error.name!=="TimeoutError" && !(error instanceof TypeError)) throw error;
  });
  if(response?.status===202) {
   playbackStatus("Transcribiendo esta radio…",true);
  } else if(!response || response.status===429 || response.status>=500) {
   playbackStatus("Esperando al traductor de radios…",true);
  } else {
   const data=await response.json().catch(()=>({}));
   if(!response.ok || !data.texto) throw Error(data.error||"No se pudo transcribir esta radio.");
   return data.texto;
  }
  await new Promise(resolve=>setTimeout(resolve,2000));
 }
 throw Error("La transcripción está tardando. Pulsa «Escuchar en español» para reintentar.");
}

function createSpanishAudio(original,id,reviewed) {
 playbackStatus(reviewed?"Generando el audio en español…":"Preparando la traducción y la voz en español…",true);
 worker=new Worker(new URL("./radio-es-worker.js?v=3",import.meta.url),{type:"module"});
 timer=setTimeout(()=>{
  if(id!==sequence) return;
  worker?.terminate();
  worker=undefined;
  playbackStatus("La voz en español tardó demasiado. Pulsa «Escuchar en español» para reintentar.");
 },150000);
 worker.onmessage=async({data})=>{
  if(id!==sequence) return;
  if(data.message) {
   playbackStatus(data.message,true);
   return;
  }
  clearTimeout(timer);
  if(data.translation) text.textContent=data.translation;
  if(data.error) {
   playbackStatus(data.error);
   return;
  }
  playbackUrl=URL.createObjectURL(waveFile(data.audio,data.sampleRate));
  player.src=playbackUrl;
  player.hidden=false;
  try {
   await player.play();
   if(id===sequence) playbackStatus(reviewed?"Reproduciendo la radio en español.":"Reproduciendo la traducción automática.");
  } catch {
   if(id===sequence) playbackStatus("La radio está lista. Pulsa Reproducir en el control de audio.");
  }
 };
 worker.onerror=()=>{
  if(id!==sequence)return;
  clearTimeout(timer);
  playbackStatus("No se pudo iniciar la voz en español. Pulsa el botón para reintentar.");
 };
 worker.postMessage({original,reviewed});
}

document.getElementById("radios").addEventListener("click",async event=>{
 const button=event.target.closest("button[data-radio-url]");
 if(!button) return;
 const url=new URL(button.dataset.radioUrl);
 if(url.origin!=="https://livetiming.formula1.com" || !url.pathname.startsWith("/static/")) return;
 if (busy && selectedUrl===url.href) {
  panel.scrollIntoView({block:"nearest"});
  return;
 }
 reset();
 selectedUrl=url.href;
 const id=sequence;
 panel.hidden=false;
 panel.querySelector("strong").textContent="Radio en español · "+(button.dataset.radioPilot || "Piloto");
 panel.scrollIntoView({block:"nearest"});
 const clip=url.pathname.slice("/static/".length);
 const reviewed=revisadas[clip];
 playbackStatus("Preparando esta radio…",true);
 try {
  const original=reviewed ? null : await transcribe(clip,request.signal);
  if(id===sequence) createSpanishAudio(original,id,reviewed);
 } catch(error) {
  if(id===sequence) playbackStatus(error.message || "No se pudo preparar esta radio.");
 }
});
window.addEventListener("pagehide",reset);
