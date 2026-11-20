import {env,pipeline} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";

env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;

self.onmessage=async({data:{original,reviewed}})=>{
 let translation=reviewed??"";
 try {
  if(!translation) {
   self.postMessage({message:"Traduciendo al español…"});
   const translate=await pipeline("translation","Xenova/opus-mt-en-es",{dtype:"q8"});
   try {
    const [{translation_text}]=await translate(original,{max_new_tokens:256});
    translation=translation_text?.trim()??"";
   } finally {
    await translate.dispose();
   }
   if(!translation) throw Error("Traducción vacía");
  }
  self.postMessage({message:"Generando el audio en español…"});
  const synthesize=await pipeline("text-to-speech","Xenova/mms-tts-spa",{dtype:"q8"});
  const {audio,sampling_rate:sampleRate}=await synthesize(translation);
  await synthesize.dispose();
  if(!audio?.length || !Number.isFinite(sampleRate)) throw Error("Audio vacío");
  self.postMessage({translation,audio,sampleRate},[audio.buffer]);
 } catch(error) {
  console.warn("Radio ES:",error);
  self.postMessage({translation,error:"No se pudo generar la voz en español. Vuelve a pulsar «Escuchar en español»."});
 }
};
