"use strict";

function qualifyingDurations(session) {
 return /sprint|shootout/i.test(session.Name ?? session.Type ?? "") ? [720,600,480] : [1080,900,780];
}

function clockEvents(events,prior=[]) {
 const relevant = Object.values(events ?? {}).filter(event=>event?.Category==="Flag" && event.Scope==="Track" &&
  (["RED","CHEQUERED","CHECKERED"].includes(event.Flag) ||
   (event.Flag==="GREEN" && /PIT EXIT OPEN/i.test(event.Message ?? ""))));
 return [...new Map([...prior,...relevant].map(event=>[event.Utc+"|"+event.Flag,event])).values()]
  .sort((a,b)=>timestamp(a.Utc)-timestamp(b.Utc));
}

function estimatedQualifyingClock(events,sessionStart,durations) {
 let clock = null;
 for (const event of events) {
  const time = timestamp(event.Utc);
  if (!Number.isFinite(time) || time<sessionStart-60000) continue;
  if (event.Flag==="GREEN") {
   if (!clock) {
    if (time<sessionStart+durations[0]*1000) clock={phase:1,remaining:durations[0]*1000,runningSince:time,closed:false};
   } else if (clock.closed || (clock.runningSince!==null && time-clock.runningSince>=clock.remaining)) {
    const phase = clock.phase+1;
    if (phase<=durations.length) clock={phase,remaining:durations[phase-1]*1000,runningSince:time,closed:false};
   } else if (clock.runningSince===null) {
    clock.runningSince=time;
   }
  } else if (clock && !clock.closed) {
   if (event.Flag==="RED" && clock.runningSince!==null) {
    clock.remaining=Math.max(0,clock.remaining-(time-clock.runningSince));
    clock.runningSince=null;
    clock.closed=clock.remaining===0;
   } else if (["CHEQUERED","CHECKERED"].includes(event.Flag)) {
    clock.runningSince=null;
    clock.remaining=0;
    clock.closed=true;
   }
  }
 }
 return clock;
}

function formatCountdown(milliseconds) {
 const seconds = Math.max(0,Math.ceil(milliseconds/1000));
 return Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");
}
