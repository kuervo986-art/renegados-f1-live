function fiaTone(e){
 const flag=String(e.flag||e.Flag||"").toUpperCase().replace(/[\s-]+/g,"_");
 const msg=String(e.message||e.Message||e.text||"").toUpperCase();
 const cat=String(e.category||e.Category||"").toUpperCase();
 if(/CHEQUERED|CHECKERED|CUADROS/.test(flag+" "+msg))return "checkered";
 if(/DOUBLE_YELLOW|YELLOW/.test(flag)||/\b(?:DOUBLE\s+YELLOW|YELLOW\s+FLAG|BANDERA\s+AMARILLA|BANDERAS\s+AMARILLAS)\b/.test(msg))return "yellow";
 if(/BLACK_AND_WHITE|BLACK_WHITE|BLACK\/WHITE/.test(flag+" "+msg))return "black";
 if(/\bRED\b/.test(flag)||/\b(?:RED\s+FLAG|BANDERA\s+ROJA)\b/.test(msg))return "red";
 if(/\bGREEN\b|\bCLEAR\b/.test(flag)||/\b(?:GREEN\s+FLAG|BANDERA\s+VERDE|TRACK\s+CLEAR|PISTA\s+DESPEJADA)\b/.test(msg)||(cat==="TRACK"&&/\bCLEAR\b/.test(msg)))return "green";
 if(/\bBLUE\b/.test(flag)||/\b(?:BLUE\s+FLAG|BANDERA\s+AZUL)\b/.test(msg))return "blue";
 if(/\bWHITE\b/.test(flag)||/\b(?:WHITE\s+FLAG|BANDERA\s+BLANCA)\b/.test(msg))return "white";
 if(/\bBLACK\b/.test(flag)||/\b(?:BLACK\s+FLAG|BANDERA\s+NEGRA)\b/.test(msg))return "black";
 if(/\b(?:SAFETY\s+CAR|VIRTUAL\s+SAFETY\s+CAR|COCHE\s+DE\s+SEGURIDAD)\b/.test(msg))return "yellow";
 return "other";
}

function translate(s){
s=String(s||"").trim();
const blueFlag=s.match(/^(?:WAVED|SHOWN|DISPLAYED)\s+BLUE\s+FLAGS?\s+FOR\s+CAR\s+(\d+)\s+\(([^)]+)\)\s+TIMED\s+AT\s+(\d{1,2}:\d{2}(?::\d{2})?)\.?$/i);
if(blueFlag)return "Bandera azul mostrada al coche "+blueFlag[1]+" ("+blueFlag[2]+") a las "+blueFlag[3]+".";
const deleted=s.match(/^CAR\s+(\d+)(?:\s+\(([^)]+)\))?\s+(?:TIME\s+([\d:.]+)|LAP)\s+DELETED\s*[-–—]\s*TRACK LIMITS AT TURN\s+(\d+)\s+LAP\s+(\d+)(?:\s+(?:AT\s+)?(\d{1,2}:\d{2}:\d{2}))?(?:\s+(\(PIT\)))?\.?$/i);
if(deleted){
 const [,number,driver,time,turn,lap,at,pit]=deleted;
 const car="Coche "+number+(driver?" ("+driver+")":"");
 const result=time?"tiempo "+time+" anulado":"vuelta anulada";
 return car+": "+result+" por límites de pista en la curva "+turn+", vuelta "+lap+
  (at?", a las "+at:"")+(pit?" (boxes)":"")+".";
}
const takeFlag=s.match(/^FIRST CAR TO TAKE THE FLAG\s*[-–—]\s*CAR\s+(\d+)(?:\s+\(([^)]+)\))?\.?$/i);
if(takeFlag)return "Primer coche en recibir la bandera a cuadros: "+takeFlag[1]+(takeFlag[2]?" ("+takeFlag[2]+")":"")+".";
const qualifyingIncident=s.match(/^(S?Q[123])\s+(INCIDENT\b.+)$/i);
if(qualifyingIncident)return qualifyingIncident[1].toUpperCase()+": "+translate(qualifyingIncident[2]);
const resumeTime=s.match(/^RACE WILL RESUME AT\s+(\d{1,2}:\d{2})\s*$/i);
if(resumeTime)return "La carrera se reanudará a las "+resumeTime[1];
const push=s.match(/^PUSH CARS TO FRONT IN ORDER:\s*(.+)$/i);
if(push)return "Colocar los coches al frente en este orden: "+push[1];
const resume=s.match(/^RESUMPTION ORDER:\s*(.+)$/i);
if(resume)return "Orden de reanudación: "+resume[1];
const postSession=s.match(/^(PIT LANE\s+)?INCIDENT\s+INVOLVING\s+(CAR|CARS)\s+(.+?)\s+WILL\s+BE\s+INVESTIGATED\s+AFTER\s+THE\s+(RACE|SESSION|QUALIFYING)\s*[-–—]\s*(.+)$/i);
if(postSession){
 const [,pitLane,type,carList,session,reason]=postSession;
 const when={RACE:"la carrera",SESSION:"la sesión",QUALIFYING:"la clasificación"}[session.toUpperCase()];
 const cars=carList.replace(/\s+AND\s+/gi," y ");
 const translatedReason=translateReason(reason);
 return "Incidente "+(type.toUpperCase()==="CAR"?"del coche ":"entre los coches ")+cars+(pitLane?" en el carril de boxes":"")+
  ": se investigará después de "+when+". Motivo: "+translatedReason+".";
}
const reviewed=s.match(/^INCIDENT INVOLVING CAR\s+(\d+)\s+\(([^)]+)\)\s+REVIEWED\s+NO FURTHER INVESTIGATION\s*-\s*LEAVING PIT EXIT ON RED LIGHT\s*(\([^)]*\))?$/i);
if(reviewed)return "Incidente del coche "+reviewed[1]+" ("+reviewed[2]+") revisado: no habrá más investigación por salir de boxes con el semáforo rojo"+(reviewed[3]?" "+reviewed[3]:"");
const pitIncident=s.match(/^INCIDENT INVOLVING CAR\s+(\d+)\s+\(([^)]+)\)\s+(NOTED|UNDER INVESTIGATION)\s*-\s*LEAVING PIT EXIT ON RED LIGHT\s*(\([^)]*\))?$/i);
if(pitIncident)return "Incidente del coche "+pitIncident[1]+" ("+pitIncident[2]+"): salida de boxes con el semáforo rojo; "+(pitIncident[3].toUpperCase()==="NOTED"?"incidente registrado":"bajo investigación")+(pitIncident[4]?" "+pitIncident[4]:"");
const turnIncidentWithReason=s.match(/^TURN\s+(\d+)\s+INCIDENT\s+INVOLVING\s+CARS?\s+(.+?)\s+(UNDER\s+INVESTIGATION|NOTED|REVIEWED(?:\s+NO\s+FURTHER\s+INVESTIGATION)?|NO\s+FURTHER\s+INVESTIGATION|NO\s+FURTHER\s+ACTION)\s*[-–—]\s*(.+)$/i);
if(turnIncidentWithReason){
 const statuses={
  "UNDER INVESTIGATION":"bajo investigación",
  "NOTED":"registrado por Dirección de Carrera",
  "REVIEWED":"revisado",
  "REVIEWED NO FURTHER INVESTIGATION":"revisado, sin más investigación",
  "NO FURTHER INVESTIGATION":"sin más investigación",
  "NO FURTHER ACTION":"sin más medidas"
 };
 const cars=turnIncidentWithReason[2].replace(/\s+AND\s+/gi," y ");
 return "Incidente en la curva "+turnIncidentWithReason[1]+" entre los coches "+cars+": "+statuses[turnIncidentWithReason[3].toUpperCase().replace(/\s+/g," ")]+". Motivo comunicado: "+translateReason(turnIncidentWithReason[4])+".";
}
const incident=s.match(/^TURN\s+(\d+)\s+INCIDENT\s+INVOLVING\s+CARS?\s+(.+?)\s+(UNDER INVESTIGATION|NOTED|NO FURTHER INVESTIGATION|NO FURTHER ACTION)\s*(\([^)]*\))?$/i);
if(incident){const action=incident[3].toUpperCase();const desc={"UNDER INVESTIGATION":"bajo investigación","NOTED":"registrado por Dirección de Carrera","NO FURTHER INVESTIGATION":"sin más investigación","NO FURTHER ACTION":"sin sanción adicional"}[action];return "Incidente en la curva "+incident[1]+" entre los coches "+incident[2]+": "+desc+(incident[4]?" "+incident[4]:"");}
const steward=s.match(/^FIA STEWARDS:\s*(.+)$/i);
if(steward)return "Comisarios de la FIA: "+translate(steward[1]);

const servedPenalty=s.match(/^PENALTY\s+SERVED\s*[-–—]\s*(\d+)\s+SECOND(?:S)?\s+TIME\s+PENALTY\s+FOR\s+CAR\s+(\d+)\s+\(([^)]+)\)\s*[-–—]\s*(.+)$/i);
if(servedPenalty)return "Penalización de "+servedPenalty[1]+" segundos cumplida por el coche "+servedPenalty[2]+" ("+servedPenalty[3]+"): "+translateReason(servedPenalty[4])+".";
const penalty=s.match(/^(\d+)\s+SECOND\s+TIME\s+PENALTY\s+FOR\s+CAR\s+(\d+)\s+\(([^)]+)\)\s*-\s*(.+)$/i);
if(penalty)return "Penalización de "+penalty[1]+" segundos para el coche "+penalty[2]+" ("+penalty[3]+"): "+translateReason(penalty[4]);
const penalty2=s.match(/^(\d+)\s+SECOND\s+(STOP\s+AND\s+GO|DRIVE\s+THROUGH)\s+PENALTY\s+FOR\s+CAR\s+(\d+)\s+\(([^)]+)\)\s*-\s*(.+)$/i);
if(penalty2)return "Penalización de "+(penalty2[2].toUpperCase().includes("STOP")?"parada y continuación":"paso por boxes")+" de "+penalty2[1]+" segundos para el coche "+penalty2[3]+" ("+penalty2[4]+"): "+translateReason(penalty2[5]);
const generalIncident=s.match(/^(PIT LANE\s+)?INCIDENT\s+INVOLVING\s+(CAR|CARS)\s+(.+?)\s+(UNDER INVESTIGATION|NOTED|REVIEWED(?:\s+NO FURTHER INVESTIGATION)?|NO FURTHER INVESTIGATION|NO FURTHER ACTION)\s*[-–—]\s*(.+)$/i);
if(generalIncident){
 const [,pitLane,type,carList,action,reason]=generalIncident;
 const act=action.toUpperCase();
 const cars=carList.replace(/\s+AND\s+/gi," y ");
 const description={"UNDER INVESTIGATION":"bajo investigación","NOTED":"registrado","REVIEWED":"revisado","REVIEWED NO FURTHER INVESTIGATION":"revisado, sin más investigación","NO FURTHER INVESTIGATION":"sin más investigación","NO FURTHER ACTION":"sin medidas adicionales"}[act]||"";
 return "Incidente "+(type.toUpperCase()==="CAR"?"del coche ":"entre los coches ")+cars+(pitLane?" en el carril de boxes":"")+
  ": "+description+". Motivo: "+translateReason(reason)+".";
}
const generalReason=s.match(/^(.+?)\s+(UNDER INVESTIGATION|NOTED|NO FURTHER INVESTIGATION)\s*-\s*(.+)$/i);
if(generalReason)return translateReason(generalReason[1])+": "+({"UNDER INVESTIGATION":"bajo investigación","NOTED":"registrado","NO FURTHER INVESTIGATION":"sin más investigación"}[generalReason[2].toUpperCase()])+". "+translateReason(generalReason[3]);
const rules=[
[/^(S?Q[123]) WILL BE DELAYED\.?$/i,"La $1 se retrasa"],
[/^(S?Q[123]) WILL START AT (\d{1,2}:\d{2}(?::\d{2})?)\.?$/i,"La $1 empezará a las $2"],
[/^(S?Q[123]) WILL RESUME AT (\d{1,2}:\d{2}(?::\d{2})?)\.?$/i,"La $1 se reanudará a las $2"],
[/^GREEN LIGHT\s*-\s*PIT EXIT OPEN$/i,"Semáforo verde: salida de boxes abierta"],
[/^YELLOW IN PIT LANE$/i,"Bandera amarilla en el carril de boxes"],
[/^PIT LANE CLEAR$/i,"Carril de boxes despejado"],
[/^PIT EXIT CLOSED$/i,"Salida de boxes cerrada"],
[/^PIT EXIT OPEN$/i,"Salida de boxes abierta"],
[/^PIT ENTRY CLOSED$/i,"Entrada a boxes cerrada"],
[/^PIT ENTRY OPEN$/i,"Entrada a boxes abierta"],
[/^RISK OF RAIN FOR THE F1 RACE IS (\d+(?:\.\d+)?)%$/i,"Probabilidad de lluvia durante la carrera de F1: $1 %"],
[/^DRS DISABLED$/i,"DRS desactivado"],
[/^DRS ENABLED$/i,"DRS activado"],
[/^(?:THE )?TRACK IS WET\.?$|^WET TRACK\.?$/i,"Pista mojada"],
[/^LOW GRIP CONDITIONS\.?$/i,"Condiciones de baja adherencia"],
[/^LOW GRIP DELTA (ACTIVE|INACTIVE)\.?$/i,(_, value)=>"Delta de tiempo por baja adherencia "+(value.toUpperCase()==="ACTIVE"?"activado":"desactivado")],
[/^OVERTAKE (ENABLED|DISABLED)\.?$/i,(_, value)=>"Modo adelantamiento "+(value.toUpperCase()==="ENABLED"?"habilitado":"deshabilitado")],
[/^LIGHT BLUE HEAD PADDING MATERIAL MUST BE USED\.?$/i,"Es obligatorio usar el acolchado azul claro para la cabeza"],
[/^PIT LANE EXIT (OPEN|CLOSED)\.?$/i,(_, value)=>"Salida de boxes "+(value.toUpperCase()==="OPEN"?"abierta":"cerrada")],
[/^DOUBLE YELLOW IN TRACK SECTOR (\d+)/i,"Doble bandera amarilla en el sector $1"],
[/^YELLOW IN TRACK SECTOR (\d+)/i,"Bandera amarilla en el sector $1"],
[/^CLEAR IN TRACK SECTOR (\d+)/i,"Bandera verde en el sector $1"],
[/^GREEN IN TRACK SECTOR (\d+)/i,"Bandera verde en el sector $1"],
[/^SESSION ABORTED$/i,"Sesión interrumpida"],
[/^SESSION STARTED$/i,"Sesión iniciada"],
[/^SESSION ENDED$/i,"Sesión finalizada"],
[/^SESSION SUSPENDED$/i,"Sesión suspendida"],
[/^SESSION RESUMED$/i,"Sesión reanudada"],
[/^GREEN FLAG/i,"Bandera verde"],
[/^RED FLAG/i,"Bandera roja"],
[/^CHEQUERED FLAG/i,"Bandera a cuadros"],
[/^VIRTUAL SAFETY CAR ENDING/i,"Finalizando coche de seguridad virtual"],
[/^VIRTUAL SAFETY CAR DEPLOYED/i,"Coche de seguridad virtual activado"],
[/^SAFETY CAR IN THIS LAP/i,"El coche de seguridad entra en boxes esta vuelta"],
[/^SAFETY CAR LIGHTS ON$/i,"Luces del coche de seguridad encendidas"],
[/^SAFETY CAR LIGHTS OFF$/i,"Luces del coche de seguridad apagadas"],
[/^SAFETY CAR DEPLOYED/i,"Coche de seguridad en pista"],
[/^TRACK CLEAR$/i,"Bandera verde en pista"],
[/^NO FURTHER INVESTIGATION/i,"No se investigará más"],
[/^NO FURTHER ACTION/i,"Sin más acciones"],
[/^INCIDENT NOTED/i,"Incidente registrado"],
[/^PIT LANE ENTRY CLOSED/i,"Entrada a boxes cerrada"],
[/^PIT LANE ENTRY OPEN/i,"Entrada a boxes abierta"]
];
for(const [re,translation] of rules){if(re.test(s))return s.replace(re,translation)}
return "Aviso original de la FIA (traducción no disponible): "+s;
}
function translateReason(value){
 let s=String(value||"").trim();
 const time=s.match(/\s*(\(\d{1,2}:\d{2}:\d{2}\))$/);
 const suffix=time?(" "+time[1]):"";
 if(time)s=s.slice(0,time.index).trim();
 const parts=[
 [/^SPEEDING IN THE PIT LANE$/i,"exceso de velocidad en el carril de boxes"],
 [/^SPEEDING IN PIT LANE$/i,"exceso de velocidad en el carril de boxes"],
 [/^CAUSING A COLLISION$/i,"provocar una colisión"],
 [/^LEAVING THE TRACK AND GAINING AN ADVANTAGE$/i,"salirse de la pista y obtener ventaja"],
 [/^LEAVING PIT EXIT ON RED LIGHT$/i,"salir de boxes con el semáforo rojo"],
 [/^UNSAFE RELEASE$/i,"salida insegura de boxes"],
 [/^TRACK LIMITS$/i,"límites de pista"],
 [/^IGNORING YELLOW FLAGS$/i,"ignorar las banderas amarillas"],
 [/^YELLOW FLAG INFRINGEMENT$/i,"infracción bajo bandera amarilla"],
 [/^FAILING TO FOLLOW RACE DIRECTORS?['’]? INSTRUCTIONS$/i,"incumplimiento de las instrucciones de Dirección de Carrera"],
 [/^FAILING TO FOLLOW RACE DIRECTORS?['’]? INSTRUCTIONS\s*[-–—]\s*MAXIMUM DELTA TIME$/i,"incumplimiento del tiempo máximo establecido por Dirección de Carrera"],
 [/^PRACTICE START INFRINGEMENT$/i,"infracción en el procedimiento de salida de prácticas"],
 [/^FAILURE TO FOLLOW RACE DIRECTOR.?S INSTRUCTIONS$/i,"incumplir las instrucciones de Dirección de Carrera"],
 [/^IMPEDING CAR (\d+)$/i,"obstaculizar al coche $1"],
 [/^UNSAFE REJOIN$/i,"reincorporación insegura a pista"]
 ];
 for(const [pattern,replacement] of parts)if(pattern.test(s))return s.replace(pattern,replacement)+suffix;
 return "motivo original: "+s+suffix;
}
function translateCategory(c){return ({Other:"Otros",Flag:"Bandera",SafetyCar:"Coche de seguridad",Drs:"DRS",SessionStatus:"Estado de sesión",CarEvent:"Incidente de un coche",Track:"Estado de pista"})[c]||c||"Dirección de carrera"}

function nombreSesion(nombre) {
 const value=String(nombre||"").trim();
 const practice=value.match(/^(?:free\s+)?(?:practice|fp)\s*([123])$/i);
 if(practice)return "Entrenamientos libres "+practice[1];
 return ({
  practice:"Entrenamientos libres", race:"Carrera", qualifying:"Clasificación",
  "sprint qualifying":"Clasificación Sprint", "sprint shootout":"Clasificación Sprint",
  sprint:"Sprint", testing:"Pruebas", "sprint race":"Sprint"
 })[value.toLowerCase()]||value||"Sesión no identificada";
}

function nombreGranPremio(nombre) {
 const value=String(nombre||"").trim();
 if(!value)return "";
 const lugares={ "Las Vegas":"Las Vegas", "Mexico City":"Ciudad de México", "São Paulo":"São Paulo",
  "United States":"Estados Unidos", "Great Britain":"Gran Bretaña", "United Kingdom":"Reino Unido",
  "Austria":"Austria", "Belgian":"Bélgica", "Dutch":"Países Bajos", "British":"Gran Bretaña",
  "Austrian":"Austria", "Australian":"Australia", "Chinese":"China", "Japanese":"Japón",
  "Spanish":"España", "Canadian":"Canadá", "Hungarian":"Hungría", "Italian":"Italia",
  "Brazilian":"Brasil", "Saudi Arabian":"Arabia Saudí", "Bahrain":"Baréin", "Singapore":"Singapur",
  "Monaco":"Mónaco", "Azerbaijan":"Azerbaiyán", "Qatar":"Catar", "Abu Dhabi":"Abu Dabi" };
 const match=value.match(/^(.+) Grand Prix$/i);
 if(!match)return value;
 return "Gran Premio de "+(lugares[match[1]]||match[1]);
}

// Los avisos sin una traducción específica se traducen en el navegador.
const fiaTranslations = new Map();
const fiaTranslationQueue = [];
let fiaWorker, fiaActive, fiaTimeout, fiaNextId=0, fiaRetryAt=0;

function emitFiaTranslation(entry) {
 for (const label of document.querySelectorAll('[data-fia-translation="'+entry.id+'"]')) {
  label.textContent = entry.text;
  if (entry.ready) label.title = "Traducción automática";
 }
}

function finishFiaTranslation(entry, translation) {
 if (fiaActive!==entry) return;
 clearTimeout(fiaTimeout);
 fiaActive=undefined;
 entry.queued=false;
 entry.ready=Boolean(translation);
 entry.text=translation || "Traducción pendiente. Se reintentará automáticamente.";
 if (!entry.ready) {
  entry.failures=(entry.failures ?? 0)+1;
  if (entry.failures<3) {
   entry.retryAt=Date.now()+30000;
   setTimeout(()=>{
    if (fiaTranslations.get(entry.original)===entry && mountFiaTranslation(entry)) sendNextFiaTranslation();
   },30000);
  } else {
   entry.retryAt=Infinity;
   entry.text="Traducción pendiente.";
  }
 }
 emitFiaTranslation(entry);
 sendNextFiaTranslation();
}

function sendNextFiaTranslation() {
 if (fiaActive || Date.now()<fiaRetryAt) return;
 const entry=fiaTranslationQueue.shift();
 if (!entry) return;
 fiaActive=entry;
 const unavailable = () => {
  fiaRetryAt=Date.now()+30000;
  fiaWorker?.terminate();
  fiaWorker=undefined;
  finishFiaTranslation(entry,"");
  setTimeout(sendNextFiaTranslation,30000);
 };
 try {
  fiaWorker ??= new Worker(new URL("./traductor-fia-worker.js?v=2",document.baseURI),{type:"module"});
  fiaWorker.onerror=unavailable;
  fiaWorker.onmessage=({data})=>{
   if (data.id!==entry.id) return;
   if (data.unavailable) unavailable();
   else finishFiaTranslation(entry,data.translation);
  };
  fiaTimeout=setTimeout(unavailable,120000);
  fiaWorker.postMessage({id:entry.id,original:entry.original});
 } catch { unavailable(); }
}

function mountFiaTranslation(entry) {
 if (entry.ready || entry.queued || Date.now()<entry.retryAt) return false;
 entry.queued=true;
 fiaTranslationQueue.push(entry);
 return true;
}

function mensajeFiaHtml(message,escapeHtml) {
 const original=String(message ?? "").trim();
 const translated=translate(original);
 if (!/Aviso original de la FIA|motivo original:/i.test(translated)) return escapeHtml(translated);
 let entry=fiaTranslations.get(original);
 if (!entry) {
  entry={id:++fiaNextId,original,text:"Traduciendo aviso de la FIA…",retryAt:0};
  fiaTranslations.set(original,entry);
  if (fiaTranslations.size>256) {
   const oldest=[...fiaTranslations].find(([,item])=>!item.queued && item!==entry);
   if (oldest) fiaTranslations.delete(oldest[0]);
  }
 }
 if (entry.ready) return '<span title="Traducción automática">'+escapeHtml(entry.text)+'</span>';
 mountFiaTranslation(entry);
 sendNextFiaTranslation();
 return '<span data-fia-translation="'+entry.id+'">'+escapeHtml(entry.text)+'</span>';
}
