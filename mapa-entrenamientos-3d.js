import * as THREE from "three";
import {OrbitControls} from "three/addons/controls/OrbitControls.js";

const DEMO_COLORS = [0xff5268,0x66e2d5,0xff963d,0x799dff,0x5dc87d,0xcc94ff];
// Las Vegas 2026: posiciones aproximadas al encajar el plano de la FIA en el trazado.
// Cada número comienza en el panel correspondiente y termina en el siguiente.
const vegasPanels = [.974,.010,.050,.094,.161,.208,.260,.284,.301,.327,.381,.414,.439,.486,.551,.612,.687,.796,.842,.894,.938];
const vegasTiming = [.980469,1.246,1.526,1.980469];
const timingColors = [0x5074bb,0x347e85,0x835bac];
const flagPaint = {
 YELLOW:[0xffd336,"Amarilla"],"DOUBLE YELLOW":[0xffd336,"Doble amarilla"],
 RED:[0xff5268,"Roja"],BLUE:[0x5eb5ff,"Azul"],WHITE:[0xf3f6fa,"Blanca"]
};
const clock = seconds => {
 const whole = Math.max(0,Math.floor(seconds));
 return String(Math.floor(whole/60)).padStart(2,"0")+":"+String(whole%60).padStart(2,"0");
};
const validPositions = rows => rows.filter(row=>Number.isFinite(row.x)&&Number.isFinite(row.y)&&
 Number.isFinite(Date.parse(row.date))&&(row.x!==0||row.y!==0));
const xyz = (row,scale) => new THREE.Vector3(row.x*scale,(Number(row.z)||0)*scale,-row.y*scale);

function normalizer(points) {
 const box = new THREE.Box3().setFromPoints(points);
 const center = box.getCenter(new THREE.Vector3());
 const size = box.getSize(new THREE.Vector3());
 const scale = 920/Math.max(size.x,size.z,1);
 center.y = box.min.y;
 return point=>point.clone().sub(center).multiplyScalar(scale);
}

function buildTrack(points) {
 const path = points.filter((point,index)=>!index||point.distanceToSquared(points[index-1])>1);
 if (path.at(-1).distanceToSquared(path[0])<16) path.pop();
 return new THREE.CatmullRomCurve3(path,true,"centripetal");
}

function roadGeometry(curve,width,height,start=0,end=1) {
 const count = Math.ceil((end-start)*800);
 const pointAt = distance=>curve.getPointAt((distance+1)%1);
 const vertices = [];
 const indices = [];
 for (let i=0;i<=count;i++) {
  const distance=start+(end-start)*i/count;
  const center=pointAt(distance);
  const direction = pointAt(distance+.00125).sub(pointAt(distance-.00125));
  const side = new THREE.Vector3(direction.z,0,-direction.x).normalize().multiplyScalar(width/2);
  for (const sign of [-1,1]) {
   const point = center.clone().addScaledVector(side,sign);
   vertices.push(point.x,point.y+height,point.z);
  }
  if (i<count) indices.push(2*i,2*i+1,2*i+2,2*i+1,2*i+3,2*i+2);
 }
 const geometry = new THREE.BufferGeometry();
 geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));
 geometry.setIndex(indices);
 geometry.computeVertexNormals();
 return geometry;
}

function stripFaces(points,width) {
 const edges=points.map((point,index)=>{
  const direction=points[Math.min(index+1,points.length-1)].clone().sub(points[Math.max(index-1,0)]);
  const side=new THREE.Vector3(direction.z,0,-direction.x).normalize().multiplyScalar(width/2);
  return [point.clone().sub(side),point.clone().add(side)];
 });
 return edges.slice(1).map(([a,b],index)=>[...edges[index],b,a]);
}

function addLasVegas(group,data,transform) {
 const wallColors=[0x60718b,0x596880,0x475b74,0x687790];
 for(const [index,building] of data.buildings.entries()) {
  const floor=building.outline.map(([x,y])=>transform(x,y));
  const height=transform(...building.outline[0],building.height).y-floor[0].y;
  const shape=new THREE.Shape(floor.map(point=>new THREE.Vector2(point.x,-point.z)));
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false});
  geometry.rotateX(-Math.PI/2);
  const color=wallColors[index%wallColors.length];
  const roof=new THREE.MeshStandardMaterial({color:0x8392a5,roughness:.95});
  const walls=new THREE.MeshStandardMaterial({color,roughness:.95});
  const mesh=new THREE.Mesh(geometry,[roof,walls]);
  const top=floor.map(point=>new THREE.Vector3(point.x,height,point.z));
  mesh.userData.faces=[
   {vertices:top,color:"#8392a5"},
   ...floor.map((point,i)=>{
    const next=(i+1)%floor.length;
    return {vertices:[point,floor[next],top[next],top[i]],color:i%2?"#576b84":"#41566e"};
   })
  ];
  group.add(mesh);
 }
 const lane=data.pitLane.path.map(([x,y])=>transform(x,y).setY(1.35));
 const faces=stripFaces(lane,5.5);
 const geometry=new THREE.BufferGeometry();
 geometry.setAttribute("position",new THREE.Float32BufferAttribute(faces.flatMap(([a,b,c,d])=>
  [a,b,c,c,d,a].flatMap(point=>[point.x,point.y,point.z])),3));
 const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x60c6fb,side:THREE.DoubleSide}));
 mesh.userData.faces=faces.map(vertices=>({vertices,color:"#60c6fb"}));
 group.add(mesh);
 const label=textSprite("BOXES");
 label.position.copy(lane[Math.floor(lane.length/2)]); label.position.y+=17;
 group.add(label);
}

function carsInWindow(raw,start,normalize) {
 const samples = new Map();
 for (const row of validPositions(raw)) {
  const id = String(row.driver_number??"");
  if (!/^\d+$/.test(id)) continue;
  if (!samples.has(id)) samples.set(id,[]);
  samples.get(id).push({time:(Date.parse(row.date)-start)/1000,point:normalize(xyz(row,1))});
 }
 for (const series of samples.values()) series.sort((a,b)=>a.time-b.time);
 return samples;
}

function positionAt(series,time) {
 if (!series?.length||time<series[0].time||time>series.at(-1).time) return null;
 let first=0, last=series.length-1;
 while (last-first>1) {
  const mid=(first+last)>>1;
  if (series[mid].time<=time) first=mid;
  else last=mid;
 }
 const a=series[first],b=series[last];
 const span=b.time-a.time;
 if (span>2.5) return null;
 const position = a.point.clone().lerp(b.point,span>0?(time-a.time)/span:0);
 const direction = b.point.clone().sub(a.point);
 return {position,direction};
}

function textSprite(label) {
 const canvas=document.createElement("canvas");
 canvas.width=128; canvas.height=56;
 const ctx=canvas.getContext("2d");
 ctx.fillStyle="#0d1726"; ctx.fillRect(0,0,128,56);
 ctx.fillStyle="#ffffff"; ctx.font="bold 36px sans-serif"; ctx.textAlign="center"; ctx.textBaseline="middle";
 ctx.fillText(label,64,29,120);
 const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;
 const tag=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));
 tag.scale.set(26,11,1);
 return tag;
}

function carModel(color,label) {
 const car = new THREE.Group();
 const body = new THREE.MeshStandardMaterial({color,roughness:.62});
 const rubber = new THREE.MeshStandardMaterial({color:0x101019,roughness:.95});
 const box=(w,h,d,x,y,z,material)=>{
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
  mesh.position.set(x,y,z);
  car.add(mesh);
 };
 box(5.2,2.4,12,0,2,0,body);
 box(2.2,1.2,4,0,1.5,6,body);
 box(9,1,2,0,1.5,7.5,body);
 box(8,1.1,2,0,3.9,-5.6,body);
 box(2.2,1.4,2.4,0,3.2,-1.1,rubber);
 for (const x of [-3.8,3.8]) for (const z of [-4.2,4.2]) box(2.7,3.2,3.1,x,1.6,z,rubber);
 const tag=textSprite(label);
 tag.position.y=18;
 car.add(tag);
 return car;
}

function disposeGroup(group) {
 const materials=new Set();
 group.traverse(item=>{
  item.geometry?.dispose();
  for (const material of [item.material].flat()) if(material) materials.add(material);
 });
 for (const material of materials) {
  material.map?.dispose();
  material.dispose();
 }
 group.clear();
}

// Dibuja la misma escena en perspectiva cuando el navegador no ofrece WebGL.
function canvasRenderer(track,fleet,environment) {
 const canvas=document.createElement("canvas");
 const ctx=canvas.getContext("2d");
 const vector=new THREE.Vector3();
 const corners=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
 const sides=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]];
 let width,height,ratio=1;

 function project(x,y,z,object,camera) {
  vector.set(x,y,z).applyMatrix4(object.matrixWorld).project(camera);
  return {x:(vector.x+1)*width/2,y:(1-vector.y)*height/2,z:vector.z};
 }
 function clipped(vertices, camera) {
  const boundary=-camera.near-1;
  const view=vertices.map(point=>point.clone().applyMatrix4(camera.matrixWorldInverse));
  const pane=[];
  for(let i=0;i<view.length;i++) {
   const a=view[(i+view.length-1)%view.length],b=view[i];
   if ((a.z<=boundary)!==(b.z<=boundary)) pane.push(a.clone().lerp(b,(boundary-a.z)/(b.z-a.z)));
   if(b.z<=boundary) pane.push(b);
  }
  if(pane.length<3)return [];
  return pane.map(point=>{
   point.applyMatrix4(camera.projectionMatrix);
   return {x:(point.x+1)*width/2,y:(1-point.y)*height/2,z:point.z};
  });
 }

 function trace(points) {
  for (const [index,point] of points.entries()) {
   if (index) ctx.lineTo(point.x,point.y);
   else ctx.moveTo(point.x,point.y);
  }
  ctx.closePath();
 }

 return {
  domElement:canvas,
  setClearColor(){},
  setPixelRatio(value){ratio=value;},
  setSize(w,h){
   width=w; height=h;
   canvas.width=Math.round(w*ratio); canvas.height=Math.round(h*ratio);
   ctx.setTransform(ratio,0,0,ratio,0,0);
  },
  render(scene,camera){
   if (!width||!height) return;
   camera.updateMatrixWorld();
   scene.updateMatrixWorld();
   const background=ctx.createLinearGradient(0,0,0,height);
   background.addColorStop(0,"#172737"); background.addColorStop(1,"#0a1322");
   ctx.fillStyle=background; ctx.fillRect(0,0,width,height);

   const labels=[],faces=[];
   for (const mesh of track.children) {
    if (!mesh.visible) continue;
    if (mesh.isSprite) {
     labels.push([project(0,0,0,mesh,camera),mesh.material.map.image]);
     continue;
    }
    const attr=mesh.geometry.getAttribute("position");
    if (mesh.userData.marker) {
     const points=mesh.userData.marker.map(point=>project(...point,mesh,camera));
     if (points.some(point=>Math.abs(point.z)>1)) continue;
     ctx.beginPath(); trace(points);
     ctx.fillStyle=mesh.material.color.getStyle(); ctx.fill();
     continue;
    }
    if (attr.count<48 && !mesh.userData.trackColor) continue;
    if(camera.userData.chase) {
     ctx.fillStyle=mesh.material.color.getStyle();
     ctx.beginPath();
     const v=i=>new THREE.Vector3(attr.getX(i),attr.getY(i),attr.getZ(i));
     for(let i=0;i+5<attr.count;i+=4) {
      const points=clipped([v(i),v(i+1),v(i+5),v(i+4)],camera);
      if(points.length)trace(points);
     }
     ctx.fill();
     continue;
    }
    const left=[],right=[];
    for (let i=0;i<attr.count;i+=4) {
     left.push(project(attr.getX(i),attr.getY(i),attr.getZ(i),mesh,camera));
     right.push(project(attr.getX(i+1),attr.getY(i+1),attr.getZ(i+1),mesh,camera));
    }
    ctx.beginPath(); trace(left); trace(right.reverse());
    ctx.fillStyle=mesh.material.color.getStyle();
    ctx.fill("evenodd");
   }

   for(const item of environment.children) {
    if(item.isSprite) {
     labels.push([project(0,0,0,item,camera),item.material.map.image]);
     continue;
    }
    for(const face of item.userData.faces) {
     const points=clipped(face.vertices,camera);
     if(!points.length||
        points.every(p=>p.x<0)||points.every(p=>p.x>width)||
        points.every(p=>p.y<0)||points.every(p=>p.y>height)) continue;
     faces.push({points,color:face.color,depth:points.reduce((sum,point)=>sum+point.z,0)/points.length});
    }
   }
   for (const car of fleet.children) {
    if (!car.visible) continue;
    for (const mesh of car.children) {
     if (mesh.isSprite) {
      labels.push([project(0,0,0,mesh,camera),mesh.material.map.image]);
      continue;
     }
     const {width:w,height:h,depth:d}=mesh.geometry.parameters;
     const vertices=corners.map(([x,y,z])=>project(x*w/2,y*h/2,z*d/2,mesh,camera));
     for (const [index,side] of sides.entries()) {
      const points=side.map(i=>vertices[i]);
      if (points.some(point=>Math.abs(point.z)>1)) continue;
      faces.push({points,color:mesh.material.color.getStyle(),shade:[.25,.16,.35,0,.22,.10][index],
       depth:points.reduce((sum,point)=>sum+point.z,0)/4});
     }
    }
   }
   faces.sort((a,b)=>b.depth-a.depth);
   for (const face of faces) {
    ctx.beginPath(); trace(face.points);
    ctx.fillStyle=face.color; ctx.fill();
    if (face.shade) {ctx.fillStyle="rgba(0,0,0,"+face.shade+")";ctx.fill();}
   }
   for (const [point,label] of labels) {
    if (Math.abs(point.z)<=1) ctx.drawImage(label,point.x-21,point.y-16,42,18);
   }
  }
 };
}

export function createMap3D(el,historical) {
 const view=el("map3DViewport");
 const info=el("map3DStatus"), timeline=el("map3DTime"), playButton=el("map3DPlay"), drivers=el("map3DDriver");
 const track=new THREE.Group(), fleet=new THREE.Group(), environment=new THREE.Group();
 const canvas=document.createElement("canvas");
 const context=canvas.getContext("webgl2",{antialias:true})??canvas.getContext("webgl",{antialias:true});
 const renderer=context ? new THREE.WebGLRenderer({canvas,context,antialias:true}) : canvasRenderer(track,fleet,environment);
 renderer.setClearColor(0x101a29);
 renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));
 view.replaceChildren(renderer.domElement);
 const scene=new THREE.Scene();
 const camera=new THREE.PerspectiveCamera(43,1,1,6000);
 const controls=new OrbitControls(camera,renderer.domElement);
 controls.enableDamping=true;
 controls.minDistance=80;
 controls.maxDistance=2800;
 controls.maxPolarAngle=Math.PI/2-.06;
 scene.add(new THREE.HemisphereLight(0xddeeff,0x455064,2.3));
 const light=new THREE.DirectionalLight(0xffe4d0,2.7);
 light.position.set(220,380,160); scene.add(light);
 scene.add(track,fleet,environment);
 const surface=new THREE.Mesh(new THREE.PlaneGeometry(2300,2300),new THREE.MeshStandardMaterial({color:0x182936}));
 surface.rotation.x=-Math.PI/2; surface.position.y=-3; scene.add(surface);
 const grid=new THREE.GridHelper(1800,24,0x405466,0x293e50);
 grid.position.y=-2.8; scene.add(grid);
 const cars=new Map();
 let circuit, archived, previousContext, staticKey, mode="", curve, samples, duration=0, time=0, demoSense=1;
 let frame=0, lastFrame=0, visible=false, playing=false, job=0, previousFocus;
 let fallback, vegasData;
 const chaseButton=el("map3DChase"), centerButton=el("map3DCenter");
 const environmentNote=el("map3DEnvironment");
 const flagsNote=el("map3DFlags");
 const flagStrips=new Map();
 let raceFlags={};
 chaseButton.disabled=true;

 function setChase(active) {
  camera.userData.chase=active;
  chaseButton.setAttribute("aria-pressed",String(active));
  centerButton.setAttribute("aria-pressed",String(!active));
  controls.enabled=!active;
  previousFocus=null;
 }

 function center() {
  drivers.value="";
  setChase(false);
  camera.position.set(390,840,1110);
  controls.target.set(0,0,0);
  controls.update();
 }

 function resize() {
  const {width,height}=view.getBoundingClientRect();
  if (!width||!height) return;
  camera.aspect=width/height;
  camera.updateProjectionMatrix();
  renderer.setSize(width,height,false);
 }
 new ResizeObserver(resize).observe(view);
 center();

 function updateFlags() {
  if (!flagsNote) return;
  const current = raceFlags.track;
  for (const [number,strip] of flagStrips) {
   const flag = number==="track" ? current : raceFlags[number];
   const paint = flagPaint[flag];
   strip.visible = Boolean(paint) && (number==="track" || !flagPaint[current]);
   if (paint) strip.material.color.setHex(paint[0]);
  }
  const active = Object.entries(raceFlags).flatMap(([number,flag])=>{
   if (number==="track") {
    const text=flagPaint[flag]?.[1] ?? (flag==="CHEQUERED" ? "A cuadros" : null);
    return text ? [text+" en toda la pista"] : [];
   }
   const paint=flagPaint[flag];
   return flagStrips.has(Number(number)) && paint ? [paint[1]+" · zona "+number] : [];
  });
  flagsNote.textContent = active.join(" · ");
  flagsNote.hidden = active.length===0;
 }

 function addVegasSectors() {
  const marker = (start,end,width,height,color) => {
   const mesh=new THREE.Mesh(roadGeometry(curve,width,height,start,end),
    new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));
   mesh.userData.trackColor=true;
   track.add(mesh);
   return mesh;
  };
  timingColors.forEach((color,index)=>{
   const start=vegasTiming[index],end=vegasTiming[index+1];
   marker(start,end,12,.3,color);
   const point=curve.getPointAt(((start+end)/2)%1);
   const label=textSprite("S"+(index+1));
   label.position.copy(point);
   label.position.y+=14;
   track.add(label);
  });
  vegasPanels.forEach((start,index)=>{
   const next=vegasPanels[(index+1)%vegasPanels.length];
   flagStrips.set(index+1,marker(start,next<start?next+1:next,20,.65,0xffd336));
  });
  flagStrips.set("track",marker(0,1,20,.65,0xffd336));
 }

 function setTrack(points,id,lap=false) {
  disposeGroup(track);
  disposeGroup(environment);
  flagStrips.clear();
  environmentNote.hidden=true;
  curve=buildTrack(points);
  for (const [width,height,color] of [[28,0,0x546277],[20,.22,0x293749]]) {
   const material=new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide,roughness:.95});
   track.add(new THREE.Mesh(roadGeometry(curve,width,height),material));
  }
  if (flagsNote && id==="us-2023") addVegasSectors();
  updateFlags();
  const marks=marcasCircuito(points.map(point=>[point.x,-point.z]),id,lap);
  function paint(mark,outline,color) {
   const [[x,y],[a,b],[c,d]]=mark;
   const length=Math.hypot(c-a,d-b);
   if (!length) return;
   const dx=(c-a)/length, dy=(d-b)/length;
   const elevation=points.reduce((nearest,point)=>
    Math.hypot(point.x-x,point.z+y)<Math.hypot(nearest.x-x,nearest.z+y)?point:nearest,points[0]).y;
   const vertices=outline.map(([u,v])=>[x+dx*u-dy*v,elevation+1.2,-(y+dy*u+dx*v)]);
   const geometry=new THREE.BufferGeometry();
   geometry.setAttribute("position",new THREE.Float32BufferAttribute(vertices.flat(),3));
   if (vertices.length===4) geometry.setIndex([0,1,2,0,2,3]);
   const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide}));
   mesh.userData.marker=vertices;
   track.add(mesh);
  }
  for(const arrow of marks.arrows) paint(arrow,[[8,0],[-6,-5],[-6,5]],0x72e4fa);
  if (marks.finish) {
   for(let row=0;row<6;row++) for(let col=0;col<2;col++) {
    const u=col*3-3, v=row*4-12;
    paint(marks.finish,[[u,v],[u+3,v],[u+3,v+4],[u,v+4]],(row+col)%2?0x172230:0xffffff);
   }
   const [x,y]=marks.finish[0];
   const label=textSprite("META");
   const elevation=points.reduce((nearest,point)=>
    Math.hypot(point.x-x,point.z+y)<Math.hypot(nearest.x-x,nearest.z+y)?point:nearest,points[0]).y;
   label.position.set(x,elevation+13,-y);
   track.add(label);
  }
  return marks;
 }

 function setCars(list) {
  cars.clear(); disposeGroup(fleet);
  drivers.replaceChildren(new Option("Vista general",""));
  for (const {id,name,color} of list) {
   const safeColor=/^[a-f0-9]{6}$/i.test(color)?parseInt(color,16):0xa9b9ce;
   const car=carModel(safeColor,String(name||id));
   cars.set(String(id),car);
   fleet.add(car);
   drivers.add(new Option(name||id,id));
  }
  chaseButton.disabled=!cars.size;
  setChase(false);
 }

 function setPlayback(seconds) {
  duration=seconds; time=0; playing=false;
  timeline.disabled=!duration; playButton.disabled=!duration;
  timeline.max=duration||1;
  syncTime();
 }

 function syncTime() {
  timeline.value=time;
  el("map3DClock").textContent=clock(time)+" / "+clock(duration);
  playButton.textContent=playing?"Pausar":"Reproducir";
 }

 async function getCircuit() {
  if (circuit) return circuit;
  fallback ??= fetch("./circuits.geojson",{signal:AbortSignal.timeout(9000)}).then(response=>{
   if (!response.ok) throw Error("Circuitos no disponibles");
   return response.json();
  }).then(data=>data.features.find(item=>item.properties.location==="Las Vegas")).then(item=>({
   name:"Las Vegas",id:item.properties.id,points:item.geometry.coordinates
  })).catch(error=>{fallback=null;throw error;});
  return fallback;
 }

 async function staticTrack(demo=false) {
  const request=++job;
  try {
   const course=await getCircuit();
   if (request!==job) return;
   const radians=course.points[0][1]*Math.PI/180;
   const geographic=(x,y,meters=0)=>new THREE.Vector3(x*Math.cos(radians)*10000,meters*.08983,-y*10000);
   const points=course.points.map(([x,y])=>geographic(x,y));
   const project=normalizer(points);
   const marks=setTrack(points.map(project),course.id);
   staticKey=course;
   demoSense=marks.forward??1;
   mode=demo?"demo":"static";
   setCars(demo?DEMO_COLORS.map((color,index)=>({id:index+1,name:"Demo "+(index+1),color:color.toString(16)})):[]);
   setPlayback(demo?90:0);
   info.textContent=course.name+(demo?" · Demostración 3D con coches ficticios.":" · Vista 3D del trazado.")+
    (marks.finish?" Damero: meta aproximada.":" Meta sin referencia disponible.")+" Flechas: sentido de marcha.";
   if (demo) { playing=true; syncTime(); }
   center();
   if(course.id==="us-2023") {
    vegasData ??= fetch("./las-vegas-entorno.osm.json?v=1",{signal:AbortSignal.timeout(10000)}).then(response=>{
     if(!response.ok)throw Error("Entorno no disponible");
     return response.json();
    }).catch(()=>{vegasData=null;return null;});
    const data=await vegasData;
    if(request===job && data) {
     addLasVegas(environment,data,(x,y,z)=>project(geographic(x,y,z)));
     environmentNote.hidden=false;
    }
   }
  } catch {
   if (request===job) info.textContent=curve?"No se pudo cargar el entorno de Las Vegas.":"No se pudo cargar el trazado del circuito.";
  }
 }

 async function realReplay() {
  if (!archived) return;
  const {session,laps,rows}=archived;
  const request=++job;
  mode="loading";
  setCars([]);
  setPlayback(0);
  el("map3DReplay").disabled=true;
  info.textContent="Cargando un tramo con posiciones registradas de OpenF1…";
  try {
   const lap = laps.filter(item=>!item.is_pit_out_lap && item.lap_duration>=45 &&
    item.lap_duration<=180 && Number.isFinite(Date.parse(item.date_start)))
    .sort((a,b)=>a.lap_duration-b.lap_duration)[0];
   if (!lap) throw Error("La sesión no contiene una vuelta completa para reconstruir el trazado.");
   const start=Date.parse(lap.date_start);
   const end=start+Math.ceil(lap.lap_duration*1000);
   const range={ session_key:session.session_key,"date>":new Date(start-750).toISOString(),
    "date<":new Date(end+750).toISOString() };
   const raw=await historical("location",range);
   if (request!==job) return;
   const trace=validPositions(raw).filter(point=>String(point.driver_number)===String(lap.driver_number) &&
    Date.parse(point.date)>=start && Date.parse(point.date)<=end).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
   if (trace.length<35) throw Error("OpenF1 no tiene puntos suficientes para reconstruir una vuelta de esta sesión.");
   const points=trace.map(point=>xyz(point,1));
   const project=normalizer(points);
   samples=carsInWindow(raw,start,project);
   if (!samples.size) throw Error("No se recibieron posiciones de los coches para este tramo.");
   setTrack(points.map(project),null,true);
   const names=new Map(rows.map(row=>[String(row.id),row]));
   setCars([...samples.keys()].map(id=>names.get(id)??{id,name:id}));
   setPlayback(lap.lap_duration);
   mode="replay";
   info.textContent="Repetición 3D · posiciones registradas por OpenF1 · vuelta "+lap.lap_number+" de "+(names.get(String(lap.driver_number))?.name??"coche "+lap.driver_number)+
    " · "+samples.size+" pilotos con posiciones en el tramo. Damero: meta aproximada. Flechas: sentido de marcha.";
   center();
   playing=true;
   syncTime();
  } catch (error) {
   if (request!==job) return;
   mode="static";
   info.textContent=error.status===401||error.status===403?
    "OpenF1 restringe ahora el acceso a las posiciones históricas. Puedes probar la demostración 3D.":
    error.status===429?"OpenF1 ha limitado las consultas. Vuelve a intentarlo en unos segundos.":
    "Posiciones históricas no disponibles para este tramo. Puedes probar la demostración 3D.";
  } finally {
   if (request===job) el("map3DReplay").disabled=!archived?.laps?.length;
  }
 }

 function draw(now) {
  if (!visible) {frame=0;return;}
  if (playing) {
   time+=Math.min(.1,(now-(lastFrame||now))/1000)*Number(el("map3DSpeed").value);
   if (time>=duration) {time=duration;playing=false;}
   syncTime();
  }
  lastFrame=now;
  let index=0;
  for (const [id,car] of cars) {
   let pose;
   if (mode==="demo") {
    const fraction=((demoSense*(time/42+index*.16))%1+1)%1;
    pose={position:curve.getPointAt(fraction),direction:curve.getTangentAt(fraction).multiplyScalar(demoSense)};
   }
   if (mode==="replay") pose=positionAt(samples.get(id),time);
   car.visible=Boolean(pose);
   if (pose) {
    car.position.copy(pose.position);
    car.position.y+=.7;
    if (pose.direction.lengthSq()>.0001) car.rotation.y=Math.atan2(pose.direction.x,pose.direction.z);
   }
   index++;
  }
  const focus=cars.get(drivers.value);
  if (focus?.visible && camera.userData.chase) {
   const heading=new THREE.Vector3(Math.sin(focus.rotation.y),0,Math.cos(focus.rotation.y));
   const desired=focus.position.clone().addScaledVector(heading,-95).add(new THREE.Vector3(0,63,0));
   const target=focus.position.clone().addScaledVector(heading,30);
   camera.position.lerp(desired,previousFocus?.equals(focus.position)?1:.19);
   controls.target.lerp(target,previousFocus?.equals(focus.position)?1:.25);
   previousFocus=focus.position.clone();
  } else if (focus?.visible) {
   if (previousFocus) camera.position.add(focus.position.clone().sub(previousFocus));
   controls.target.copy(focus.position);
   previousFocus=focus.position.clone();
  } else previousFocus=null;
  controls.update(); renderer.render(scene,camera);
  frame=requestAnimationFrame(draw);
 }

 centerButton.onclick=center;
 chaseButton.onclick=()=>{
  if(!cars.size)return;
  if(!drivers.value) drivers.value=cars.keys().next().value;
  setChase(true);
  const car=cars.get(drivers.value);
  if (car?.visible) {
   const heading=new THREE.Vector3(Math.sin(car.rotation.y),0,Math.cos(car.rotation.y));
   camera.position.copy(car.position).addScaledVector(heading,-95).add(new THREE.Vector3(0,63,0));
   controls.target.copy(car.position).addScaledVector(heading,30);
   controls.update();
  }
 };
 drivers.onchange=()=>{if(!drivers.value)center();};
 el("map3DDemo").onclick=()=>void staticTrack(true);
 el("map3DReplay").onclick=realReplay;
 playButton.onclick=()=>{
  if (!duration) return;
  if (time>=duration) time=0;
  playing=!playing; syncTime();
 };
 timeline.oninput=()=>{time=Number(timeline.value); syncTime();};

 return {
  setRaceFlags(flags) {
   raceFlags=flags;
   updateFlags();
  },
  setContext(nextCircuit,nextArchived) {
   const key=nextArchived?.session.session_key??"";
   const changed=previousContext!==key;
   previousContext=key;
   archived=nextArchived;
   const circuitChanged=circuit?.id!==nextCircuit?.id || circuit?.name!==nextCircuit?.name;
   circuit=nextCircuit;
   if (changed || circuitChanged) {++job; mode=""; staticKey=null;}
   if (!archived?.laps?.length||changed) el("map3DReplay").disabled=!archived?.laps?.length;
   if (visible && (changed || circuitChanged)) void staticTrack();
  },
  show() {
   visible=true; resize();
   if (!frame) {lastFrame=0; frame=requestAnimationFrame(draw);}
   if (!mode || (mode==="static" && circuit && staticKey?.name!==circuit.name)) void staticTrack();
  },
  hide() {
   visible=false;
   playing=false; syncTime();
   cancelAnimationFrame(frame); frame=0;
  }
 };
}
