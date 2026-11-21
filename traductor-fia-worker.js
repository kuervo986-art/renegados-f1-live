import {env,pipeline} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";

env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
let translator;

self.onmessage=async({data:{id,original}})=>{
 try {
  translator ??= await pipeline("translation","Xenova/opus-mt-en-es",{dtype:"q8"});
 } catch {
  self.postMessage({id,unavailable:true});
  return;
 }
 try {
  const segments=[...new Intl.Segmenter("en",{granularity:"sentence"}).segment(original)];
  const translations=[];
  const comparable=text=>text.toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
  for (const {segment} of segments) {
   const input=segment.trim();
   const [{translation_text}]=await translator(input,{max_new_tokens:384});
   const output=translation_text?.trim();
   if (!output || comparable(input)===comparable(output)) throw Error("Aviso sin traducir");
   translations.push(output);
  }
  const translation=translations.join(" ")
   .replace(/\bpit lane\b/gi,"carril de boxes")
   .replace(/\bliberaci[oó]n (?:insegura|no segura)\b/gi,"salida insegura de boxes");
  self.postMessage({id,translation});
 } catch {
  self.postMessage({id,translation:""});
 }
};
