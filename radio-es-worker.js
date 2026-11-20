import {env,pipeline} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";

env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;

let recognize,translate;
const progress=(id,message)=>self.postMessage({id,message});

async function processRadio({id,pcm}) {
 try {
  if(!recognize) {
   progress(id,"Preparando el modelo de voz. La primera carga puede tardar…");
   recognize=await pipeline("automatic-speech-recognition","Xenova/whisper-base.en",{dtype:"q8"});
  }
  progress(id,"Transcribiendo la radio…");
  const {text}=await recognize(pcm,{chunk_length_s:25,stride_length_s:4});
  if(!text?.trim()||!/[a-z]{2}/i.test(text)) {
   self.postMessage({id,error:"No se reconocen palabras claras en este clip."});
   return;
  }
  if(!translate) {
   progress(id,"Preparando el traductor al español…");
   translate=await pipeline("translation","Xenova/opus-mt-en-es",{dtype:"q8"});
  }
  progress(id,"Traduciendo al español…");
  const [{translation_text}]=await translate(text.trim(),{max_new_tokens:256});
  if(!translation_text?.trim()) throw Error("Traducción vacía");
  self.postMessage({id,translation:translation_text.trim()});
 } catch(error) {
  console.warn("Radio ES:",error);
  self.postMessage({id,error:"No se pudo procesar la radio. Comprueba la conexión para descargar los modelos y vuelve a intentarlo."});
 }
}

let pending=Promise.resolve();
self.onmessage=({data})=>{
 pending=pending.then(()=>processRadio(data));
};
