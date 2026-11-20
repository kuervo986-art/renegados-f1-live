const element=id=>document.getElementById("radio-es-"+id);
const panel=element("panel");
const status=element("status");
const result=element("result");
const source=element("source");
const player=element("player");
const inputOriginal=element("original-file");
const inputDub=element("dub-file");
const text=element("text");
const voices=window.speechSynthesis;
let worker, playbackUrl, current=0, timer;

function stopPlayback() {
 voices?.cancel();
 player.pause();
}

function reset() {
 ++current;
 clearTimeout(timer);
 stopPlayback();
 player.removeAttribute("src");
 player.load();
 player.hidden=true;
 if(playbackUrl) URL.revokeObjectURL(playbackUrl);
 playbackUrl=undefined;
 result.hidden=true;
 text.value="";
}

function write(message) { status.textContent=message; }

function prepareWorker() {
 if(worker) return worker;
 worker=new Worker(new URL("./radio-es-worker.js?v=1",import.meta.url),{type:"module"});
 worker.onmessage=({data:{id,message,error,translation}})=>{
  if(id!==current) return;
  if(message) {write(message);return;}
  clearTimeout(timer);
  if(error) {write(error);return;}
  text.value=translation;
  result.hidden=false;
  write("Traducción lista. Pulsa «Reproducir traducción» para oírla.");
 };
 worker.onerror=()=>{
  worker.terminate();
  worker=undefined;
  clearTimeout(timer);
  write("El traductor no pudo iniciarse. Puedes reproducir un MP3 ya traducido.");
 };
 return worker;
}

async function pcm16k(blob) {
 const AudioContext=window.AudioContext??window.webkitAudioContext;
 const OfflineAudioContext=window.OfflineAudioContext??window.webkitOfflineAudioContext;
 if(!AudioContext||!OfflineAudioContext) throw Error("Este navegador no puede leer el audio para traducirlo.");
 if(blob.size>15*1024*1024) throw Error("Selecciona un clip de menos de 15 MB.");
 const context=new AudioContext();
 let decoded;
 try { decoded=await context.decodeAudioData(await blob.arrayBuffer()); }
 catch {throw Error("No se pudo abrir el audio. Selecciona un MP3 o WAV válido."); }
 finally { await context.close(); }
 if(decoded.duration>90) throw Error("Selecciona un clip de como máximo 90 segundos.");
 const offline=new OfflineAudioContext(1,Math.max(1,Math.ceil(decoded.duration*16000)),16000);
 const original=offline.createBufferSource();
 original.buffer=decoded;
 const high=offline.createBiquadFilter(), low=offline.createBiquadFilter();
 high.type="highpass"; high.frequency.value=210;
 low.type="lowpass"; low.frequency.value=4700;
 original.connect(high).connect(low).connect(offline.destination);
 original.start();
 const buffer=await offline.startRendering();
 const pcm=buffer.getChannelData(0);
 let peak=0;
 for(const sample of pcm) peak=Math.max(peak,Math.abs(sample));
 if(peak>.015 && peak<.5) {
  const gain=Math.min(4,.7/peak);
  for(let i=0;i<pcm.length;i++) pcm[i]*=gain;
 }
 return pcm;
}

async function translateFile(blob,id) {
 try {
  write("Leyendo el audio en este navegador…");
  const pcm=await pcm16k(blob);
  if(id!==current) return;
  write("Preparando el traductor en el navegador…");
  prepareWorker().postMessage({id,pcm},[pcm.buffer]);
  timer=setTimeout(()=>{
   if(id!==current) return;
   worker?.terminate();
   worker=undefined;
   write("La traducción tardó demasiado. Vuelve a cargar el clip para reintentar.");
  },180000);
 } catch(error) { if(id===current) write(error.message); }
}

document.getElementById("radios").addEventListener("click",async event=>{
 const button=event.target.closest("button[data-radio-url]");
 if(!button) return;
 reset();
 const id=current;
 const url=button.dataset.radioUrl;
 element("link").href=url;
 source.hidden=false;
 panel.open=true;
 write("Comprobando si podemos leer este audio original…");
 try {
  const response=await fetch(url,{credentials:"omit",signal:AbortSignal.timeout(7000)});
  if(!response.ok) throw Error("Audio externo restringido");
  const blob=await response.blob();
  if(!blob.type.startsWith("audio/")) throw Error("Audio externo restringido");
  if(id===current) void translateFile(blob,id);
 } catch {
  if(id===current) write("Abre y guarda el audio original. Después pulsa «Cargar original en inglés» para traducirlo aquí.");
 }
});

element("choose-original").onclick=()=>inputOriginal.click();
element("choose-dub").onclick=()=>inputDub.click();
inputOriginal.onchange=()=>{
 const file=inputOriginal.files[0]; inputOriginal.value="";
 if(!file) return;
 reset();
 void translateFile(file,current);
};
inputDub.onchange=()=>{
 const file=inputDub.files[0]; inputDub.value="";
 if(!file) return;
 reset();
 playbackUrl=URL.createObjectURL(file);
 player.src=playbackUrl;
 player.hidden=false;
 write("Audio en español cargado en el reproductor.");
 player.play().catch(()=>write("Pulsa Reproducir en el control de audio."));
};
player.onerror=()=>{if(playbackUrl)write("El navegador no pudo abrir ese archivo de audio.");};
player.onplay=()=>voices?.cancel();

element("speak").onclick=()=>{
 const spoken=text.value.trim();
 if(!spoken)return;
 if(!voices||!window.SpeechSynthesisUtterance) {
  write("Este navegador no dispone de síntesis de voz. La traducción escrita sigue disponible.");
  return;
 }
 const available=voices.getVoices().filter(voice=>voice.localService&&/^es(?:[-_]|$)/i.test(voice.lang));
 const voice=available.find(voice=>/^es[-_]ES$/i.test(voice.lang))??available[0];
 if(!voice) {
  write("No hay una voz local en español disponible en este navegador. Puedes leer la traducción o abrir un MP3 en español.");
  return;
 }
 stopPlayback();
 const utterance=new SpeechSynthesisUtterance(spoken);
 utterance.voice=voice;
 utterance.lang=voice.lang;
 utterance.onerror=event=>{
  if(!["canceled","interrupted"].includes(event.error))write("No se pudo iniciar la voz en español.");
 };
 voices.speak(utterance);
};
element("stop").onclick=()=>voices?.cancel();
window.addEventListener("pagehide",()=>{
 stopPlayback();
 if(playbackUrl)URL.revokeObjectURL(playbackUrl);
 worker?.terminate();
});
