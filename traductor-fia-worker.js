import {env,pipeline} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js";

env.allowLocalModels=false;
env.backends.onnx.wasm.numThreads=1;
let translator;

const glossary = [
 [/\b(?:pit lane|carril de (?:los )?(?:pits|fosos|fosas|pozos))\b/gi,"carril de boxes"],
 [/\b(?:unsafe release|liberaci[oó]n (?:insegura|no segura))\b/gi,"salida insegura de boxes"],
 [/\b(?:(?:el )?control de (?:la )?(?:carrera|raza)|race control)\b/gi,"Dirección de Carrera"],
 [/\b(?:track limits|l[ií]mites de la pista)\b/gi,"límites de pista"],
 [/\bvuelta (?:eliminada|borrada|suprimida)\b/gi,"vuelta anulada"],
 [/\b(?:marshals|mariscales)\b/gi,"comisarios de pista"],
 [/\b(?:safety car|coche de la seguridad)\b/gi,"coche de seguridad"],
 [/\b(?:chequered flag|bandera de cuadros)\b/gi,"bandera a cuadros"],
 [/\bincidente de carril de boxes\b/gi,"incidente en el carril de boxes"]
];
const comparable = text => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");

function prepareText(text) {
 if (text!==text.toUpperCase()) return text;
 const normalized=text.toLowerCase().replace(/\b(?:fia|drs|vsc|red bull|s?q[1-3])\b|\([a-z]{3}\)/g,
  token=>token==="(pit)" ? token : token.toUpperCase());
 return normalized.charAt(0).toUpperCase()+normalized.slice(1);
}

self.onmessage=async({data:{id,original}})=>{
 try {
  translator ??= await pipeline("translation","Xenova/opus-mt-en-es",{dtype:"q8"});
 } catch {
  self.postMessage({id,unavailable:true});
  return;
 }
 try {
  const segments=[...new Intl.Segmenter("en",{granularity:"sentence"}).segment(prepareText(original))];
  const translations=[];
  for (const {segment} of segments) {
   const input=segment.trim();
   const [{translation_text}]=await translator(input,{max_new_tokens:384});
   const output=translation_text?.trim();
   if (!output || comparable(input)===comparable(output)) throw Error("Aviso sin traducir");
   translations.push(output);
  }
  const translation=glossary.reduce((text,[pattern,replacement])=>text.replace(pattern,replacement),translations.join(" "));
  const facts=original.match(/\b\d{1,2}:\d{2}:\d{2}\b|\([A-Z]{3}\)/g) ?? [];
  if (facts.some(fact=>fact!=="(PIT)" && !translation.toUpperCase().includes(fact))) throw Error("Datos del aviso incompletos");
  self.postMessage({id,translation});
 } catch {
  self.postMessage({id,translation:""});
 }
};
