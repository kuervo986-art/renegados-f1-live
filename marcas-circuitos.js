"use strict";

// Líneas de cronometraje aproximadas al encajar vueltas de referencia de
// https://github.com/martintxortiz/f1data con los trazados geográficos del proyecto.
// Sentido de los trazados clásicos: https://github.com/f1db/f1db (CC BY 4.0).
const referenciasCircuitos = {
 "ae-2009":[0.980469,1],
 "ar-1952":[null,"CLOCKWISE"],
 "at-1969":[0.981445,1],
 "au-1953":[0.001953,1],
 "az-2016":[0.989258,1],
 "be-1925":[0.983398,1],
 "bh-2002":[0.980469,1],
 "br-1940":[0.001953,1],
 "br-1977":[null,"ANTI_CLOCKWISE"],
 "ca-1978":[0.052734,1],
 "cn-2004":[0.935547,1],
 "de-1927":[null,"CLOCKWISE"],
 "de-1932":[null,"CLOCKWISE"],
 "es-1991":[0.982422,1],
 "es-2026":[0.958984,1],
 "fr-1960":[null,"CLOCKWISE"],
 "fr-1969":[null,"CLOCKWISE"],
 "gb-1948":[0.523438,1],
 "hu-1986":[0.939453,1],
 "it-1914":[null,"CLOCKWISE"],
 "it-1922":[0.957031,1],
 "it-1953":[0.963867,1],
 "jp-1962":[0.964844,1],
 "mc-1929":[0.748047,1],
 "mx-1962":[0.992188,1],
 "my-1999":[0.955078,1],
 "nl-1948":[0.026367,1],
 "pt-1972":[null,"CLOCKWISE"],
 "pt-2008":[null,"CLOCKWISE"],
 "qa-2004":[0.959961,1],
 "ru-2014":[null,"CLOCKWISE"],
 "sa-2021":[0.001953,1],
 "sg-2008":[0.017578,-1],
 "tr-2005":[null,"ANTI_CLOCKWISE"],
 "us-1909":[null,"CLOCKWISE"],
 "us-1956":[null,"CLOCKWISE"],
 "us-2012":[0.948242,1],
 "us-2022":[0.981445,1],
 "us-2023":[0.980469,1],
 "za-1961":[null,"ANTI_CLOCKWISE"],
};

function marcasCircuito(points, id, lap=false) {
 const metadata=lap?[0,1]:referenciasCircuitos[id];
 if (!metadata||points.length<3) return {finish:null,arrows:[]};
 const [start,sense]=metadata;
 const closed=[...points,points[0]];
 const distances=[0];
 let area=0;
 for (let i=1;i<closed.length;i++) {
  const [x,y]=closed[i], [a,b]=closed[i-1];
  distances.push(distances[i-1]+Math.hypot(x-a,y-b));
  area+=(a-points[0][0])*(y-points[0][1])-(x-points[0][0])*(b-points[0][1]);
 }
 const length=distances.at(-1);
 if (!length) return {finish:null,arrows:[]};
 const forward=typeof sense==="number"?sense:(sense==="CLOCKWISE")===(area<0)?1:-1;

 function pick(fraction) {
  const distance=((fraction%1+1)%1)*length;
  const end=distances.findIndex(value=>value>distance);
  const [a,b]=closed[end-1], [x,y]=closed[end];
  const t=(distance-distances[end-1])/(distances[end]-distances[end-1]);
  return [a+(x-a)*t,b+(y-b)*t];
 }
 function mark(t) {
  const fraction=(start??0)+forward*t;
  return [pick(fraction),pick(fraction-.0015*forward),pick(fraction+.0015*forward)];
 }
 return {forward,finish:start===null?null:mark(0),arrows:[.10,.30,.53,.76].map(mark)};
}

function dibujarMarcasCircuito(target, marks, project, size, north) {
 const svg="http://www.w3.org/2000/svg";
 const node=(name,attrs,parent=target)=>{
  const item=document.createElementNS(svg,name);
  for(const [key,value] of Object.entries(attrs)) item.setAttribute(key,value);
  parent.append(item);
  return item;
 };
 target.replaceChildren();
 const pose=mark=>{
  const [[x,y],[a,b],[c,d]]=mark.map(project);
  return {x,y,angle:Math.atan2(d-b,c-a)*180/Math.PI};
 };
 for (const arrow of marks.arrows) {
  const {x,y,angle}=pose(arrow);
  node("path",{d:"M -5 -4 L 5 0 L -5 4 L -1 0 Z",fill:"#72e4fa",stroke:"#101a2b","stroke-width":".8",
   transform:"translate("+x+" "+y+") rotate("+angle+") scale("+size+")"});
 }
 if (marks.finish) {
  const {x,y,angle}=pose(marks.finish);
  const stripe=node("g",{transform:"translate("+x+" "+y+") rotate("+angle+") scale("+size+")","aria-label":"Meta aproximada"});
  const title=node("title",{},stripe);
  title.textContent="Línea de meta (posición aproximada)";
  node("rect",{x:-3,y:-9,width:6,height:18,fill:"#fff",stroke:"#152132","stroke-width":".6"},stripe);
  for (let row=0;row<6;row++) node("rect",{x:row%2?-3:0,y:-9+3*row,width:3,height:3,fill:"#121a27"},stripe);
  const width=target.ownerSVGElement.viewBox.baseVal.width;
  const nearRight=x>width-42*size;
  const label=node("text",{x:x+(nearRight?-9:9)*size,y:Math.max(12*size,y-8*size),"text-anchor":nearRight?"end":"start",fill:"#fff",stroke:"#101827","stroke-width":2*size,
   "paint-order":"stroke","font-size":11*size,"font-weight":"700"});
  label.textContent="META";
 }
 if (north) {
  const [x,y]=north;
  const pointer=node("g",{transform:"translate("+x+" "+y+") scale("+size+")","aria-label":"Norte"});
  node("path",{d:"M 0 0 L -4 9 L 0 6 L 4 9 Z",fill:"#cad9ef"},pointer);
  node("text",{x:0,y:-3,"text-anchor":"middle","font-size":9,fill:"#cad9ef"},pointer).textContent="N";
 }
}
