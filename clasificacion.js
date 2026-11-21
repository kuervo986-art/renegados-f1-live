"use strict";

const direct = "https://renegados-f1-receptor.onrender.com/api/";
const proxy = "https://renegados-f1-live.onrender.com/api/alternativa/";
const get = id => document.getElementById(id);
const esc = value => String(value ?? "—").replace(/[&<>"']/g, char =>
 ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
const timestamp = value => Date.parse(typeof value === "string" && !/(Z|[+-]\d\d:\d\d)$/i.test(value) ? value+"Z" : value);
const timeFormat = new Intl.DateTimeFormat("es-ES",{timeStyle:"medium"});
const lap = value => {
 const text = String(value?.Value ?? value ?? "").trim();
 return /^\d+:\d{2}\.\d{3}$/.test(text) && text!=="0:00.000" ? text : null;
};
const seconds = value => {
 const [minutes,secs] = value.split(":").map(Number);
 return minutes*60+secs;
};
const tyreNames = {SOFT:"Blando",MEDIUM:"Medio",HARD:"Duro",INTERMEDIATE:"Intermedio",WET:"Lluvia extrema"};
const flagNames = {green:"Bandera verde",yellow:"Bandera amarilla",red:"Bandera roja",blue:"Bandera azul",white:"Bandera blanca",black:"Bandera negra / advertencia",checkered:"Bandera a cuadros"};
let busy = false;
let lastSnapshot;
const snapshotKey = "renegados-clasificacion-ultima-v1";
try {
 const saved = JSON.parse(sessionStorage.getItem(snapshotKey) ?? "null");
 if (saved?.data?.Session && Date.now()-saved.receivedAt<86400000) lastSnapshot = saved;
} catch {}

async function read(base,route) {
 const response = await fetch(base+route,{signal:AbortSignal.timeout(12000),cache:"no-store"});
 if (!response.ok) throw Error("HTTP "+response.status);
 const data = await response.json();
 if (base===direct) return data;
 if (data.vigente) return data.datos;
 throw Error("Datos sin verificar");
}

async function liveData() {
 for (const base of [direct,proxy]) {
  try {
   const [health,data] = await Promise.all([read(base,"status"),read(base,base===direct?"leaderboard":"timing")]);
   const age = (Date.now()-timestamp(health.lastMessageAt))/1000;
   if (health.isConnected===true && health.status==="CONNECTED" && age>=-20 && age<90 && data.Session) {
    return {base,data};
   }
  } catch {}
 }
 throw Error("Sin datos recientes");
}

function sessionStart(session) {
 const offset = String(session.GmtOffset ?? "").match(/^[+-]\d{2}:\d{2}/)?.[0] ?? "Z";
 return timestamp(String(session.StartDate ?? "")+offset);
}

function renderFia(events,session) {
 const start = sessionStart(session);
 get("fia").innerHTML = Object.values(events ?? {})
  .filter(event=>timestamp(event.Utc ?? event.timestamp)>=start-15*60*1000)
  .sort((a,b)=>timestamp(b.Utc ?? b.timestamp)-timestamp(a.Utc ?? a.timestamp))
  .slice(0,60).map(event=>{
   const tone = fiaTone(event);
   return '<article class="fia-'+tone+'"><time>'+esc(timeFormat.format(timestamp(event.Utc ?? event.timestamp)))+'</time>'+
    '<div class="flag">'+esc(flagNames[tone] ?? "Dirección de carrera")+'</div>'+
    esc(translate(event.Message ?? event.message ?? "Aviso"))+'</article>';
  }).join("") || '<p class="note">Sin avisos de esta sesión.</p>';
}

function render({data,events,receivedAt},online) {
 const session = data.Session;
 const status = String(session.SessionStatus ?? "").toLowerCase();
 const pending = !status || status==="inactive";
 const lines = Object.values(data.Lines ?? {}).filter(driver=>/^\d+$/.test(driver?.RacingNumber ?? ""));
 const rows = lines.map(driver=>{
  const times = [0,1,2].map(index=>pending ? null : lap(driver.BestLapTimes?.[index] ?? driver.QualifyingTimes?.["Q"+(index+1)]));
  return {driver,times,position:pending ? null : Number(driver.Position)||null};
 }).sort((a,b)=>(a.position ?? Infinity)-(b.position ?? Infinity));
 const leaders = [0,1,2].map(index=>Math.min(...rows.flatMap(row=>row.times[index] ? [seconds(row.times[index])] : [])));
 const timedPhase = leaders.findLastIndex(Number.isFinite)+1;
 const explicitPhase = [session.QualifyingPart,session.Part,session.QualifyingSession,session.Segment]
  .map(value=>String(value ?? "").match(/^(?:S?Q)?([123])$/i)?.[1]).find(Boolean);
 const phase = pending ? 0 : Math.max(Number(explicitPhase)||0,timedPhase,1);
 const complete = /^(?:finali[sz]ed|ended)$/.test(status) || (status==="finished" && phase===3);
 const q1Cutoff = rows.length>=20 ? Math.ceil((rows.length+10)/2) : 16;
 const cutoff = phase===1 ? q1Cutoff : phase===2 ? 10 : 0;
 const enoughTimes = cutoff>=10 && rows.filter(row=>row.times[phase-1]).length>=cutoff;

 get("status").textContent = [nombreSesion(session.Name ?? session.Type),nombreGranPremio(session.Meeting?.Name),
  (online ? "Actualizado a las " : "Últimos datos recibidos a las ")+timeFormat.format(receivedAt)].filter(Boolean).join(" · ");
 for(let round=1;round<=3;round++){
  get("phase"+round).classList.toggle("on",round===phase);
  get("info"+round).textContent = round>phase ? "Pendiente" : (round<phase || complete || status==="finished") ? "Finalizada" :
   round===timedPhase ? "Última ronda con tiempos" : "Esperando vueltas";
 }
 get("phaseStatus").textContent = !online ? "Mostrando la última clasificación recibida." :
  pending ? "Esperando el inicio de la clasificación." :
  complete ? "Clasificación finalizada." :
  status==="aborted" ? "Ronda interrumpida." :
  status==="suspended" ? "Ronda suspendida." :
  status==="finished" ? "Ronda terminada. Esperando confirmación de los eliminados o el inicio de la siguiente ronda." :
  "Las posiciones en zona de eliminación son provisionales.";

 get("timing").innerHTML = rows.map(({driver,times,position})=>{
  const eliminated = pending || driver.KnockedOut!==true || !position ? 0 :
   position>q1Cutoff ? 1 : position>10 ? 2 : 0;
  const confirmed = eliminated>0 && eliminated<=phase;
  const danger = online && !complete && !confirmed && enoughTimes && position>cutoff;
  const time = times[phase-1];
  const gap = time ? seconds(time)-leaders[phase-1] : null;
  const stints = Object.values(driver.Stints ?? {});
  const compound = (stints.at(-1)?.Compound ?? driver.Compound ?? "").toUpperCase();
  const state = confirmed ? "Eliminado en Q"+eliminated : danger ? "En zona de eliminación" : "—";
  const color = /^[a-f\d]{6}$/i.test(driver.TeamColour ?? "") ? "#"+driver.TeamColour : "#8294b1";
  const cells = [position,driver.Tla ?? driver.BroadcastName ?? driver.RacingNumber,driver.TeamName,
   ...times,gap===null ? null : gap===0 ? "Líder" : "+"+gap.toFixed(3),!pending ? tyreNames[compound] : null,
   ...[0,1,2].map(index=>!pending ? driver.Sectors?.[index]?.Value || null : null),state];
  return '<tr data-team-color="1" style="--team-color:'+color+'" class="'+(danger||confirmed?"danger":"")+'">'+
   cells.map(value=>'<td>'+esc(value)+'</td>').join("")+'</tr>';
 }).join("") || '<tr><td colspan="12">Esperando la lista de pilotos.</td></tr>';
 renderFia(events,session);
}

async function refresh() {
 if (busy) return;
 busy = true;
 try {
  const {base,data} = await liveData();
  const name = String(data.Session.Name ?? data.Session.Type ?? "");
  if (!/qualif|shootout/i.test(name)) {
   if (lastSnapshot) render(lastSnapshot,false);
   else {
    get("status").textContent = "Sesión del receptor · "+nombreSesion(name);
    get("phaseStatus").textContent = "Esperando la próxima clasificación.";
   }
   return;
  }
  const receivedAt = Date.now();
  const prior = lastSnapshot?.data.Session.Key===data.Session.Key ? lastSnapshot : null;
  const snapshot = {data,receivedAt,events:prior?.events};
  render(snapshot,true);
  try {
   const fia = await read(base,"race-control");
   snapshot.events = fia.RaceControl ?? fia.Messages;
   renderFia(snapshot.events,data.Session);
  } catch {}
  if (String(data.Session.SessionStatus).toLowerCase()!=="inactive") {
   lastSnapshot = snapshot;
   try { sessionStorage.setItem(snapshotKey,JSON.stringify(snapshot)); } catch {}
  }
 } catch {
  if (lastSnapshot) render(lastSnapshot,false);
  else get("status").textContent = "Buscando datos recientes del receptor…";
 } finally {
  busy = false;
 }
}

get("refresh").onclick = refresh;
if (lastSnapshot) render(lastSnapshot,false);
void refresh();
setInterval(refresh,5000);
