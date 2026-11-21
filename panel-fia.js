"use strict";

const fiaLabels = {green:"Bandera verde",yellow:"Bandera amarilla",red:"Bandera roja",blue:"Bandera azul",white:"Bandera blanca",black:"Bandera negra / advertencia",checkered:"Bandera a cuadros"};
const fiaTimeFormat = new Intl.DateTimeFormat("es-ES",{timeStyle:"medium"});

function fiaTimestamp(value) {
 return Date.parse(typeof value==="string" && !/(Z|[+-]\d\d:\d\d)$/i.test(value) ? value+"Z" : value);
}

function fiaChronology(events,start=-Infinity) {
 return Object.values(events ?? {}).filter(event=>event && typeof event==="object").map(event=>({
  ...event,instant:fiaTimestamp(event.Utc ?? event.timestamp ?? event.date ?? event.time ?? event.utc)
 })).filter(event=>Number.isFinite(event.instant)&&event.instant>=start).sort((a,b)=>a.instant-b.instant);
}

function paintFiaPanel(panel,messages,escapeHtml,empty="Sin avisos de esta sesión.") {
 const html=messages.slice(-60).reverse().map(event=>{
  const tone=fiaTone(event);
  return '<article class="fia-'+tone+'"><time>'+fiaTimeFormat.format(event.instant)+'</time>'+
   '<div class="flag">'+escapeHtml(fiaLabels[tone] ?? "Dirección de carrera")+'</div>'+
   mensajeFiaHtml(event.Message ?? event.message ?? event.text ?? event.Flag ?? "Aviso",escapeHtml)+'</article>';
 }).join("") || '<p class="fia-empty">'+escapeHtml(empty)+'</p>';
 if (panel.innerHTML!==html) {
  const previousScroll=panel.scrollTop;
  panel.innerHTML=html;
  if (previousScroll) panel.scrollTop=previousScroll;
 }
}

function flagsBySector(messages) {
 const flags = {};
 for (const event of messages) {
  if (event.Category!=="Flag") continue;
  const scope = event.Scope;
  const key = scope==="Track" ? "track" : scope==="Sector" && Number(event.Sector)>0 ? Number(event.Sector) : null;
  if (key===null) continue;
  const flag = String(event.Flag).toUpperCase();
  if (flag==="CLEAR" || flag==="GREEN") {
   if (key==="track") {
    for (const active of Object.keys(flags)) delete flags[active];
   } else delete flags[key];
  } else if (key!=="track" || ["YELLOW","DOUBLE YELLOW","RED","CHEQUERED"].includes(flag)) {
   flags[key] = flag;
  }
 }
 return flags;
}

