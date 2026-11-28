"use strict";

const receiver = "https://renegados-f1-live.onrender.com/api/alternativa/";
const liveReceiver = "https://renegados-f1-receptor.onrender.com/api/";
const liveRoutes = {status:"status",timing:"leaderboard","race-control":"race-control",weather:"weather","team-radio":"radio"};
const archive = "https://api.openf1.org/v1/";
const el = id => document.getElementById(id);
const esc = value => String(value ?? "—").replace(/[&<>"']/g, char =>
 ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const list = value => Array.isArray(value) ? value : Object.values(value ?? {});
const timestamp = value => Date.parse(typeof value === "string" && !/(Z|[+-]\d\d:\d\d)$/i.test(value) ? value+"Z" : value);
const number = value => value != null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const tyre = value => ({ SOFT:"Blando", MEDIUM:"Medio", HARD:"Duro", INTERMEDIATE:"Intermedio", WET:"Lluvia extrema", UNKNOWN:"—" })[String(value).toUpperCase()] ?? "—";
const compoundStyle = { Blando:"#ff7e88", Medio:"#ffd275", Duro:"#f5f5f5", Intermedio:"#70e6aa", "Lluvia extrema":"#83bfff" };
const dateFormat = new Intl.DateTimeFormat("es-ES",{ dateStyle:"medium", timeStyle:"short" });
const timeFormat = new Intl.DateTimeFormat("es-ES",{ timeStyle:"medium" });
const state = { mode:"live", revision:0, liveRevision:null, seasons:new Map(), history:new Map() };
let circuits;
let lapData;
let map3D;
let map3DLoad;
let replayContext;
let circuit3D;
const snapshotKey = "renegados-entrenamientos-ultima-sesion-v1";
let lastPractice;
try {
 lastPractice = JSON.parse(sessionStorage.getItem(snapshotKey)??"null");
 if (!Number.isFinite(lastPractice?.receivedAt) || !lastPractice.session || !Array.isArray(lastPractice.rows) ||
     Date.now()-lastPractice.receivedAt>24*60*60*1000) lastPractice = null;
} catch { lastPractice = null; }

function savePractice(snapshot) {
 lastPractice = snapshot;
 try { sessionStorage.setItem(snapshotKey,JSON.stringify(snapshot)); } catch {}
}

async function json(url) {
 const live = url.startsWith(liveReceiver)||url.startsWith(receiver);
 const response = await fetch(url, { signal:AbortSignal.timeout(live?35000:12000), cache:live?"no-store":"default" });
 if (!response.ok) throw Object.assign(new Error("HTTP "+response.status), { status:response.status });
 return response.json();
}

async function liveSession() {
 for (const base of [liveReceiver,receiver]) {
  const direct = base===liveReceiver;
  const get = async topic => {
   const data = await json(base+(direct?liveRoutes[topic]:topic));
   return direct?data:data.vigente?data.datos:null;
  };
  try {
   const [status,data] = await Promise.all(["status","timing"].map(get));
   const receivedAt = Date.now();
   const age = (receivedAt-timestamp(status?.lastMessageAt))/1000;
   if (status?.isConnected===true && status.status==="CONNECTED" && age>=-20 && age<90 && data) {
    return {data,receivedAt,get};
   }
  } catch {
   // Try the existing proxy if the direct request fails.
  }
 }
 throw Error("Sin datos recientes");
}

let nextArchiveRequest = 0;
async function historical(endpoint, params) {
 const start = Math.max(Date.now(),nextArchiveRequest);
 nextArchiveRequest = start+420;
 if (start>Date.now()) await new Promise(resolve=>setTimeout(resolve,start-Date.now()));
 const data = await json(archive+endpoint+"?"+new URLSearchParams(params));
 if (!Array.isArray(data)) throw Error("La respuesta de OpenF1 no contiene una lista.");
 return data;
}

function seconds(value) {
 if (value && typeof value === "object") value = value.Value;
 if (typeof value === "string" && /^\d+:\d\d(?:\.\d+)?$/.test(value.trim())) {
  const [minutes, secs] = value.trim().split(":").map(Number);
  return minutes*60+secs;
 }
 const time = number(value);
 return time > 0 ? time : null;
}

function lapTime(value) {
 if (value == null) return "—";
 const milliseconds = Math.round(value*1000);
 return Math.floor(milliseconds/60000)+":"+((milliseconds%60000)/1000).toFixed(3).padStart(6,"0");
}

const sectorTime = value => value == null ? "—" : value.toFixed(3);
const gap = (value, reference) => value != null && reference != null ? "+"+Math.max(0,value-reference).toFixed(3) : "—";

function practicePart(name) {
 return Number(String(name ?? "").match(/^(?:free\s+)?(?:practice|fp|entrenamientos? libres?)\s*([123])$/i)?.[1] ?? 0);
}

function highlight(part) {
 for (let i=1; i<=3; i++) el("phase"+i).classList.toggle("on",i===part);
}

function renderTiming(rows, empty="Todavía no hay pilotos para esta sesión.") {
 const fastest = rows.filter(row=>row.best!=null).map(row=>row.best);
 const leader = fastest.length ? Math.min(...fastest) : null;
 let previous;
 el("timing").innerHTML = rows.length ? rows.map((row,index) => {
  const color = /^[a-f\d]{6}$/i.test(String(row.color)) ? "#"+row.color : "#8294b1";
  const compound = tyre(row.compound);
  const cells = [row.position ?? index+1,row.name,row.team,lapTime(row.best),lapTime(row.last),
   row.best != null && row.best===leader && previous==null ? "Líder" : gap(row.best,leader),
   gap(row.best,previous),compound,...row.sectors.map(sectorTime),row.laps,row.pits,row.status,row.speed];
  if (row.best != null) previous = row.best;
  return '<tr data-team-color="1" style="--team-color:'+color+'">'+cells.map((value,col) =>
   col===7 ? '<td style="color:'+(compoundStyle[compound]??"inherit")+'">'+esc(value)+'</td>' :
   "<td>"+esc(value)+"</td>").join("")+"</tr>";
 }).join("") : '<tr><td colspan="15">'+esc(empty)+"</td></tr>";
}

const eventText = event => event.Message ?? event.message ?? event.text;
const eventDate = event => event.Utc ?? event.date ?? event.timestamp;
const byNewest = (a,b) => (timestamp(eventDate(b))||0)-(timestamp(eventDate(a))||0);

function renderEvents(events, rows) {
 const sorted = (events ?? []).filter(event => event && eventText(event)).sort(byNewest);
 el("fia").innerHTML = sorted.length ? sorted.slice(0,100).map(event => {
  const time = timestamp(eventDate(event));
  return '<article class="fia-'+fiaTone(event)+'"><time>'+esc(Number.isFinite(time)?timeFormat.format(time):"")+
   '</time><div class="flag">'+esc(translateCategory(event.Category??event.category))+
   '</div>'+mensajeFiaHtml(eventText(event),esc)+'</article>';
 }).join("") : '<p class="note">'+(events ? "Sin avisos FIA publicados." : "Avisos FIA no disponibles.")+"</p>";

 const counted = new Map();
 const seen = new Set();
 for (const event of sorted) {
  const message = eventText(event);
  if (!/\bTRACK LIMITS?\b/i.test(message) || !/\b(?:DELETED|EXCEEDED|INFRINGEMENT)\b/i.test(message)) continue;
  const id = String(event.RacingNumber ?? event.driver_number ?? message.match(/\bCAR\s+(\d+)/i)?.[1] ?? "");
  const signature = id+"|"+eventDate(event)+"|"+message;
  if (!id || seen.has(signature)) continue;
  seen.add(signature);
  counted.set(id,(counted.get(id)??0)+1);
 }
 const names = new Map(rows.map(row => [String(row.id), row.name]));
 el("limits").innerHTML = [...counted].sort((a,b)=>b[1]-a[1]).map(([id,total]) =>
  "<p>"+esc(names.get(id)??"Coche "+id)+" · "+total+" avisos detectados</p>").join("") ||
  (events?"Sin avisos de límites de pista detectados.":"Sin datos disponibles.");
}

function renderWeather(weather) {
 const wx = weather?.Weather ?? weather;
 const values = [
  ["Aire",wx?.AirTemp??wx?.air_temperature," °C"],["Pista",wx?.TrackTemp??wx?.track_temperature," °C"],
  ["Humedad",wx?.Humidity??wx?.humidity," %"],["Viento",wx?.WindSpeed??wx?.wind_speed," m/s"]
 ].filter(([,value])=>number(value)!=null).map(([label,value,unit])=>label+" "+number(value)+unit);
 const rain = wx?.Rainfall ?? wx?.rainfall;
 if (rain != null) values.push(Number(rain)===1?"Lluvia detectada":"Sin lluvia detectada");
 el("weather").textContent = values.join(" · ") || "Sin datos meteorológicos.";
}

let renderedRadios;
function radioSessionStart(session) {
 const start = session?.StartDate;
 const offset = String(session?.GmtOffset ?? "").match(/^([+-]?)(\d\d:\d\d)(?::\d\d)?$/);
 if (!start || !offset || /(?:Z|[+-]\d\d:\d\d)$/i.test(start)) return timestamp(start);
 return timestamp(start+(offset[1]||"+")+offset[2]);
}

function renderRadios(entries, rows, session) {
 const names = new Map(rows.map(row => [String(row.id),row.name]));
 const start = radioSessionStart(session);
 const links = (entries??[]).map(item => {
  if (!item || typeof item!=="object") return "";
  const raw = item.recording_url ?? item.Path ?? item.Url;
  if (typeof raw!=="string" || !raw) return "";
  const time = timestamp(eventDate(item));
  let url;
  try {
   let path = raw;
   if (raw.startsWith("TeamRadio/")) {
    if (!session?.Path || !Number.isFinite(start) || !Number.isFinite(time) || time<start-15*60*1000) return "";
    path = session.Path.replace(/\/?$/,"/")+raw;
   }
   url = new URL(path,"https://livetiming.formula1.com/static/");
  } catch { return ""; }
  if (url.origin!=="https://livetiming.formula1.com" || !/^\/static\/20\d\d\/.+\.mp3$/i.test(url.pathname)) return "";
  const driver = item.driver_number ?? item.RacingNumber;
  const pilot = names.get(String(driver))??item.Tla??(driver?"Coche "+driver:"Radio");
  return '<p>'+esc(pilot)+
   (Number.isFinite(time)?" · "+timeFormat.format(time):"")+
   ' · <a href="'+esc(url.href)+'" target="_blank" rel="noopener noreferrer">Escuchar audio original</a>'+
   ' · <button type="button" class="radio-action" aria-controls="radio-es-panel" data-radio-pilot="'+esc(pilot)+'" data-radio-url="'+esc(url.href)+'">Escuchar en español</button></p>';
 }).filter(Boolean);
 const content = links.slice(-30).reverse().join("") || (entries?"Sin grabaciones disponibles.":"Radios no disponibles.");
 if (content!==renderedRadios) {
  el("radios").innerHTML = content;
  renderedRadios = content;
 }
}

const normalize = value => String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

async function renderMap(location, shortName, revision, sessionId) {
 const names = [location,shortName].map(normalize).filter(Boolean);
 const label = el("mapNote");
 if (!names.length) return;
 circuits ??= json("./circuits.geojson").catch(()=>{circuits=undefined;return {features:[]};});
 const features = (await circuits).features;
 if (state.revision!==revision || (sessionId!=null && lastPractice?.id!==sessionId)) return;
 const aliases = {"interlagos":"sao paulo","lusail":"losail","sakhir":"bahrain","mexico":"mexico city","spa":"spa francorchamps","montmelo":"barcelona"};
 const candidates = names.flatMap(name=>[name,aliases[name]]).filter(Boolean);
 const feature = features.find(item => [item.properties.location,item.properties.name]
  .map(normalize).some(name=>candidates.includes(name)));
 const points = feature?.geometry?.type==="LineString" ? feature.geometry.coordinates : [];
 circuit3D = points.length>1 ? {name:location||shortName,points,id:feature.properties.id} : null;
 updateMap3D();
 if (points.length<2) {
  el("track").setAttribute("d","");
 el("marks2D").replaceChildren();
  el("map").setAttribute("hidden","");
  label.textContent = (location||shortName)+" · Trazado no disponible.";
  return;
 }
 const x = points.map(point=>point[0] * Math.cos(points[0][1]*Math.PI/180));
 const y = points.map(point=>point[1]);
 const minX=Math.min(...x), maxX=Math.max(...x), minY=Math.min(...y), maxY=Math.max(...y);
 const scale=Math.min(376/(maxX-minX),116/(maxY-minY));
 const offsetX=(400-(maxX-minX)*scale)/2, offsetY=(140-(maxY-minY)*scale)/2;
 const planar=x.map((value,i)=>[value,y[i]]);
 const project=([u,v])=>[offsetX+(u-minX)*scale,offsetY+(maxY-v)*scale];
 const path=planar.map((point,i)=>(i?"L":"M")+project(point).map(value=>value.toFixed(1)).join(" ")).join(" ");
 const marks=marcasCircuito(planar,feature.properties.id);
 dibujarMarcasCircuito(el("marks2D"),marks,project,1,[379,23]);
 el("track").setAttribute("d",path);
 el("map").removeAttribute("hidden");
 label.textContent = (location||shortName)+" · "+(marks.finish?"Meta aproximada y sentido de marcha. ":"Sentido de marcha. Meta sin referencia disponible. ")+"Posiciones GPS no disponibles.";
}

function clearPanels(message) {
 replayContext = null;
 circuit3D = null;
 updateMap3D();
 renderTiming([],message);
 renderEvents(null,[]);
 renderWeather(null);
 renderRadios(null,[]);
 el("lapsPanel").hidden = true;
 el("map").setAttribute("hidden","");
 el("track").setAttribute("d","");
 el("marks2D").replaceChildren();
 el("mapNote").textContent = "Circuito sin identificar.";
 highlight(0);
}

function sortRows(rows) {
 return rows.sort((a,b)=>(a.position??Infinity)-(b.position??Infinity)||
  (a.best??Infinity)-(b.best??Infinity));
}

function liveRows(data) {
 return sortRows(list(data.Lines).filter(row=>/^\d+$/.test(String(row?.RacingNumber??""))).map(row=>{
  const stints = list(row.Stints).filter(stint=>stint?.Compound);
  const stint = stints.at(-1);
  return { id:row.RacingNumber, name:row.Tla??row.BroadcastName??row.RacingNumber, team:row.TeamName,
   color:row.TeamColour, position:number(row.Position), best:seconds(row.BestLapTime), last:seconds(row.LastLapTime),
   compound:stint?.Compound??row.Compound??row.TyreCompound, sectors:[0,1,2].map(i=>seconds(row.Sectors?.[i])),
   laps:number(row.NumberOfLaps??row.Laps), pits:number(row.NumberOfPitStops??row.PitStopCount),
   status:row.PitOut?"Saliendo":row.InPit?"En boxes":row.Stopped?"Detenido":row.Retired?"Retirado":null,
   speed:number(row.Speeds?.ST?.Value) };
 }));
}

function renderSnapshot(snapshot, revision, online) {
 const {id,part,session,rows,receivedAt,fia,weather,radios} = snapshot;
 const meeting = session.Meeting??{};
 const phase = String(session.SessionStatus??"").toLowerCase();
 highlight(part);
 el("status").textContent = [
  nombreSesion("Practice "+part),nombreGranPremio(meeting.Name),
  (online?"Última actualización: ":"Últimos datos recibidos: ")+timeFormat.format(receivedAt)
 ].filter(Boolean).join(" · ");
 el("phaseStatus").textContent = !online ? "Sin conexión reciente. Mostrando los últimos datos recibidos mientras se vuelve a intentar." : ({
  started:"Sesión en directo.", active:"Sesión en directo.", inactive:"Sesión pendiente de comenzar.",
  finished:"Sesión finalizada. Últimos datos del receptor.", finalised:"Sesión finalizada. Últimos datos del receptor.",
  ended:"Sesión finalizada. Últimos datos del receptor.", aborted:"Sesión interrumpida.", suspended:"Sesión suspendida."
 })[phase]??"Sesión identificada por el receptor.";
 if (online && !rows.some(row=>row.best!=null)) {
  el("phaseStatus").textContent += " El receptor todavía no entrega tiempos de vuelta.";
 }
 renderTiming(rows);
 renderEvents(fia,rows);
 renderWeather(weather);
 renderRadios(radios,rows,session);
 void renderMap(meeting.Location,meeting.Circuit?.ShortName,revision,id);
}

async function refreshLive() {
 const revision = state.revision;
 if (state.mode!=="live" || state.liveRevision===revision) return;
 state.liveRevision = revision;
 try {
  const {data,receivedAt,get} = await liveSession();
  if (state.revision!==revision) return;
  const session = data.Session??data.SessionInfo??{};
  const part = practicePart(session.Name??session.SessionName) ||
   (session.Type==="Practice" && [1,2,3].includes(number(session.Number)) ? number(session.Number) : 0);
  if (!part) {
   if (lastPractice) {
    renderSnapshot(lastPractice,revision,false);
    el("phaseStatus").textContent = "Mostrando los últimos entrenamientos. Esperando la próxima sesión.";
    return;
   }
   clearPanels("Esperando la próxima sesión de entrenamientos libres.");
   el("status").textContent = "Sesión del receptor · "+nombreSesion(session.Name??session.Type);
   el("phaseStatus").textContent = "Puedes consultar entrenamientos anteriores en Histórico.";
   return;
  }
  const id = String(session.Key??session.Path??[session.Meeting?.Key,session.StartDate,part].join("|"));
  const prior = lastPractice?.id===id ? lastPractice : null;
  const rows = liveRows(data);
  if (prior?.rows.some(row=>row.best!=null) && !rows.some(row=>row.best!=null)) {
   renderSnapshot(prior,revision,false);
   return;
  }
  if (!prior) clearPanels("Esperando el cronometraje de la sesión.");
  const snapshot = {...prior,id,part,session,rows,receivedAt};
  savePractice(snapshot);
  renderSnapshot(snapshot,revision,true);
  const update = async (topic,apply) => {
   const extra = await get(topic);
   if (!extra || state.revision!==revision) return;
   apply(extra);
   savePractice(snapshot);
  };
  await Promise.allSettled([
   update("race-control",extra=>{
    snapshot.fia = list(extra.RaceControl??extra.Messages??extra);
    renderEvents(snapshot.fia,rows);
   }),
   update("weather",extra=>{
    snapshot.weather = extra;
    renderWeather(extra);
   }),
   update("team-radio",extra=>{
    snapshot.radios = list(extra.Captures??extra);
    renderRadios(snapshot.radios,rows,session);
   })
  ]);
 } catch {
  if (state.revision!==revision) return;
  if (lastPractice) renderSnapshot(lastPractice,revision,false);
  else {
   clearPanels("Esperando cronometraje de entrenamientos.");
   el("status").textContent = "Sin datos recientes del receptor.";
   el("phaseStatus").textContent = "Volviendo a conectar automáticamente. También puedes consultar el histórico.";
  }
 } finally {
  if (state.liveRevision===revision) state.liveRevision=null;
 }
}

function setOptions(select, items, placeholder) {
 select.replaceChildren(new Option(placeholder,""));
 for (const [value,label] of items) select.add(new Option(label,value));
 select.disabled = !items.length;
}

let seasonSessions = [];
function selectMeeting() {
 const sessions = seasonSessions.filter(session=>String(session.meeting_key)===el("meeting").value)
  .sort((a,b)=>practicePart(a.session_name)-practicePart(b.session_name));
 setOptions(el("session"),sessions.map(session=>[session.session_key,nombreSesion(session.session_name)]),"Elige sesión");
 if (sessions.length) {
  el("session").value = String(sessions.at(-1).session_key);
  void loadHistory();
 } else {
  ++state.revision;
  clearPanels("Elige un Gran Premio.");
  el("status").textContent = "Histórico · OpenF1";
 }
}

function historyError(error) {
 if (error?.status===401||error?.status===403) return "OpenF1 restringe temporalmente el acceso al histórico durante las sesiones en directo.";
 if (error?.status===429) return "OpenF1 ha alcanzado el límite de consultas. Prueba de nuevo en unos segundos.";
 return "No se pudo conectar con el histórico de OpenF1.";
}

async function loadSeason() {
 const revision = ++state.revision;
 const year = el("year").value;
 el("officialResults").href = "https://www.formula1.com/en/results/"+year+"/races";
 setOptions(el("meeting"),[],"Elige Gran Premio");
 setOptions(el("session"),[],"Elige sesión");
 clearPanels("Buscando entrenamientos de la temporada…");
 el("status").textContent = "Cargando temporada "+year+"…";
 el("phaseStatus").textContent = "Histórico · OpenF1";
 try {
  let sessions = state.seasons.get(year);
  if (!sessions) {
   const data = await historical("sessions",{year,session_type:"Practice"});
   sessions = data.filter(session=>practicePart(session.session_name) && timestamp(session.date_end)<Date.now())
    .sort((a,b)=>timestamp(a.date_start)-timestamp(b.date_start));
   if (year!==String(new Date().getFullYear())) state.seasons.set(year,sessions);
  }
  if (state.revision!==revision) return;
  seasonSessions = sessions;
  const meetings = new Map(sessions.map(session=>[session.meeting_key,session.location??session.country_name??"Gran Premio "+session.meeting_key]));
  setOptions(el("meeting"),[...meetings].map(([key,place])=>[key,nombreGranPremio(place+" Grand Prix")]),"Elige Gran Premio");
  if (meetings.size) {
   el("meeting").value = String(sessions.at(-1).meeting_key);
   selectMeeting();
  } else {
   renderTiming([],"Todavía no hay sesiones finalizadas en esta temporada.");
   el("status").textContent = "Sin entrenamientos publicados.";
  }
 } catch (error) {
  if (state.revision!==revision) return;
  el("status").textContent = historyError(error);
  renderTiming([],"Puedes abrir los resultados oficiales de la temporada.");
 }
}

function renderLapDetails() {
 const id = el("lapDriver").value;
 const laps = lapData.laps.filter(lap=>String(lap.driver_number)===id).sort((a,b)=>a.lap_number-b.lap_number);
 el("lapTimes").innerHTML = laps.map(lap=>'<tr>'+[
   lap.lap_number,lapTime(seconds(lap.lap_duration)),...[1,2,3].map(n=>sectorTime(seconds(lap["duration_sector_"+n]))),
   tyre(lapData.stints.find(stint=>String(stint.driver_number)===id&&lap.lap_number>=stint.lap_start&&lap.lap_number<=stint.lap_end)?.compound)
  ].map(value=>"<td>"+esc(value)+"</td>").join("")+"</tr>").join("")||'<tr><td colspan="6">Sin vueltas disponibles.</td></tr>';
}

function renderHistory(data,session,revision) {
 const {drivers=[],session_result:results=[],laps=[],stints=[],pit=[],race_control:events,weather=[],team_radio:radios}=data;
 const knownDrivers = new Map([...laps,...results,...drivers].map(driver=>[driver.driver_number,driver]));
 const rows = [...knownDrivers].map(([id,driver])=>{
  const result = results.find(row=>row.driver_number===id);
  const driverLaps = laps.filter(lap=>lap.driver_number===id);
  const sorted = driverLaps.filter(lap=>!lap.is_pit_out_lap && seconds(lap.lap_duration)!=null)
   .sort((a,b)=>a.lap_duration-b.lap_duration);
  const recorded = seconds(result?.duration);
  const best = recorded==null ? sorted[0] : sorted.find(lap=>Math.abs(lap.lap_duration-recorded)<0.001);
  const last = sorted.reduce((latest,lap)=>!latest||lap.lap_number>latest.lap_number?lap:latest,null);
  const stint = stints.find(item=>item.driver_number===id&&best?.lap_number>=item.lap_start&&best?.lap_number<=item.lap_end);
  return {id,name:driver.name_acronym??driver.full_name??id,team:driver.team_name,color:driver.team_colour,
   position:number(result?.position),best:recorded??seconds(best?.lap_duration),last:seconds(last?.lap_duration),
   sectors:[1,2,3].map(n=>seconds(best?.["duration_sector_"+n])),compound:stint?.compound,
   laps:number(result?.number_of_laps)??(driverLaps.length?driverLaps.length:null),
   pits:data.pit ? pit.filter(stop=>stop.driver_number===id).length : null,speed:number(best?.st_speed)};
 });
 sortRows(rows);
 highlight(practicePart(session.session_name));
 el("status").textContent = nombreSesion(session.session_name)+" · "+session.location+" · "+dateFormat.format(timestamp(session.date_start));
 el("phaseStatus").textContent = "Histórico de OpenF1 · "+rows.length+" pilotos";
 renderTiming(rows);
 renderEvents(events,rows);
 renderWeather(weather.at(-1));
 renderRadios(radios,rows);
 replayContext = {session, laps, rows};
 updateMap3D();
 void renderMap(session.location,session.circuit_short_name,revision);
 lapData={laps,stints};
 el("lapsPanel").hidden = !laps.length;
 if (laps.length) {
  setOptions(el("lapDriver"),rows.map(row=>[row.id,row.name]),"Elige piloto");
  el("lapDriver").value = String(rows[0]?.id??"");
  renderLapDetails();
 }
}

async function loadHistory() {
 const session = seasonSessions.find(item=>String(item.session_key)===el("session").value);
 if (!session) {
  ++state.revision;
  clearPanels("Elige una sesión de entrenamientos.");
  el("status").textContent = "Histórico · OpenF1";
  return;
 }
 const revision = ++state.revision;
 clearPanels("Cargando tiempos y datos de la sesión…");
 el("status").textContent = "Cargando "+nombreSesion(session.session_name)+"…";
 el("phaseStatus").textContent = "Histórico · OpenF1";
 try {
  let data = state.history.get(session.session_key);
  if (!data) {
   data = {};
   const params = {session_key:session.session_key};
   const base = ["session_result","laps","drivers"];
   const extras = ["stints","race_control","pit","weather","team_radio"];
   const group = async endpoints => Promise.allSettled(endpoints.map(async endpoint=>{
    data[endpoint]=await historical(endpoint,params);
   }));
   const top = await group(base);
   if (state.revision!==revision) return;
   if (!data.session_result?.length&&!data.laps?.length) {
    const failed = top.find(result=>result.status==="rejected");
    if (failed) throw failed.reason;
    renderTiming([],"Los tiempos de esta sesión todavía no se han publicado.");
    el("status").textContent = "Sin tiempos publicados.";
    return;
   }
   renderHistory(data,session,revision);
   const rest = await group(extras);
   if (state.revision!==revision) return;
   if ([...top,...rest].every(result=>result.status==="fulfilled")) state.history.set(session.session_key,data);
  }
  renderHistory(data,session,revision);
 } catch (error) {
  if (state.revision!==revision) return;
  el("status").textContent = historyError(error);
  renderTiming([],"Puedes abrir los resultados oficiales de la temporada.");
 }
}

function switchMode(mode) {
 if (mode===state.mode) return;
 state.mode=mode;
 ++state.revision;
 el("liveMode").setAttribute("aria-pressed",String(mode==="live"));
 el("historyMode").setAttribute("aria-pressed",String(mode==="history"));
 el("historyControls").hidden=mode!=="history";
 if (mode==="history") void loadSeason();
 else {
  clearPanels("Consultando el cronometraje…");
  el("status").textContent="Consultando el receptor…";
  el("phaseStatus").textContent="En directo";
  if (lastPractice) renderSnapshot(lastPractice,state.revision,false);
  void refreshLive();
 }
}

function updateMap3D() {
 map3D?.setContext(circuit3D,replayContext);
}

async function openMap3D() {
 el("map3DPanel").hidden=false;
 el("map3DButton").setAttribute("aria-expanded","true");
 el("map3DPanel").scrollIntoView({block:"start",behavior:"smooth"});
 try {
  map3DLoad ??= import("./mapa-entrenamientos-3d.js?v=4").then(module=>module.createMap3D(el,historical));
  map3D = await map3DLoad;
  map3D.setContext(circuit3D,replayContext);
  if (!el("map3DPanel").hidden) map3D.show();
 } catch {
  map3DLoad = null;
  el("map3DStatus").textContent="No se pudo iniciar el 3D. Puedes seguir usando el mapa del monitor.";
 }
}

el("map3DButton").onclick=openMap3D;
el("map3DClose").onclick=()=>{
 el("map3DPanel").hidden=true;
 el("map3DButton").setAttribute("aria-expanded","false");
 map3D?.hide();
 el("map3DButton").focus();
};

const year = new Date().getFullYear();
for (let y=year;y>=2023;y--) el("year").add(new Option(y,y));
el("liveMode").onclick=()=>switchMode("live");
el("historyMode").onclick=()=>switchMode("history");
el("refresh").onclick=()=>state.mode==="live"?refreshLive():el("session").value?loadHistory():loadSeason();
el("year").onchange=loadSeason;
el("meeting").onchange=selectMeeting;
el("session").onchange=loadHistory;
el("lapDriver").onchange=renderLapDetails;
if (lastPractice) renderSnapshot(lastPractice,state.revision,false);
void refreshLive();
setInterval(refreshLive,8000);
