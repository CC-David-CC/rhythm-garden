import {SynthAudio} from "../audio/synth.js";
import {
  LANE_COUNT,
  RhythmSession,
  TRACKS,
  decodeSave,
  encodeSave,
  sessionFromSave,
  type RhythmSnapshot,
} from "../model/rhythm.js";
import {RIVE_CONTRACT,parseRiveIntent} from "../rive/contract.js";

interface FileContext{
 owner:string;
 valid():boolean;
 path(value:string):string;
 name(value:string):string;
 files:{
  read(path:string):Promise<{data:Uint8Array;version:string;status?:string}>;
  write(path:string,data:Uint8Array|string,version:string|null):Promise<{version:string;status?:string}>;
  stat?(path:string):Promise<{version:string;status?:string}>;
  subscribe?(callback:()=>void):()=>void;
  sync():Promise<unknown>;
 };
}

export interface Host{
 signal:AbortSignal;
 w?:{
  title?:string;
  ownerSub?:string;
  launchContext?:{version:1;storage:"mirror";path:string;owner:string};
  rhythmGarden?:{dirty:boolean};
 };
 ui:{
  make(tag:string,className?:string,text?:string):HTMLElement;
  textButton(label:string,action:()=>void):HTMLButtonElement;
  appInput(label:string,value?:string):HTMLInputElement;
  confirm?(message:string,options?:{title?:string;confirmLabel?:string;cancelLabel?:string;danger?:boolean;signal?:AbortSignal}):Promise<boolean>;
 };
 storage:{
  signedInSubject():string;
  mirrorFileContext():Promise<FileContext>;
  pickFile(options:{extensions:string[];signal?:AbortSignal}):Promise<string|null>;
  pickFolder(options:{signal?:AbortSignal}):Promise<string|null>;
 };
}

export interface ViewHandle{element:HTMLElement;dispose():void}

const LANE_COLORS=["#e86a6a","#e8b84c","#62c270","#4ebbd8"];
const LANE_KEYS=["d","f","j","k"];
const PHRASE_LENGTH_MS=4000;

export async function startView(host:Host,signal:AbortSignal):Promise<ViewHandle>{
 const {make,textButton,appInput}=host.ui,doc=document;
 const owner=host.w?.launchContext?.owner||host.storage.signedInSubject();
 const state=host.w?.rhythmGarden??{dirty:false};
 if(host.w){host.w.rhythmGarden=state;host.w.ownerSub=owner;}
 let session=new RhythmSession(`rhythm-${crypto.randomUUID()}`,0);
 let paused=true,disposed=false,busy=false,phraseStarted=false,phraseFinished=true,phraseStart=0,readyUntil=0,revision=0,frame=0;
 let savedPath:string|null=null,savedVersion:string|null=null,unwatch=()=>{},watchSerial=0,phraseCheckpoint:RhythmSnapshot|null=null;
 const audio=new SynthAudio();

 const element=make("section","rhythm-view");
 const header=make("header","rhythm-header"),heading=make("div");
 heading.append(make("h2","rhythm-title","Rhythm Garden"),make("p","rhythm-subtitle","Tap flowers with the beat. Timing comes from the audio clock and your calibration, never the animation frame."));
 const track=doc.createElement("select");track.setAttribute("aria-label","Track");TRACKS.forEach((_value,index)=>track.append(new Option(`Garden track ${index+1}`,String(index))));
 const difficulty=doc.createElement("select");difficulty.setAttribute("aria-label","Difficulty");for(const level of [1,2,3])difficulty.append(new Option(`Level ${level}`,String(level)));
 const pauseButton=textButton("Resume",()=>toggleRun()),retryButton=textButton("Retry phrase",()=>retryPhrase());
 const toolbar=make("div","rhythm-toolbar");toolbar.append(track,difficulty,pauseButton,retryButton);
 header.append(heading,toolbar);

 const main=make("div","rhythm-main"),stage=make("div","rhythm-stage"),canvas=doc.createElement("canvas"),side=make("div","rhythm-side"),summary=make("div","rhythm-summary"),target=make("div","rhythm-target"),noteList=make("div","rhythm-note-list"),coach=make("div","rhythm-coach"),warning=make("div","rhythm-warning"),status=make("div","app-status rhythm-status");
 canvas.tabIndex=0;canvas.setAttribute("role","application");canvas.setAttribute("aria-label","Rhythm Garden lanes. Press D, F, J or K when a flower marker reaches the hit line.");stage.append(canvas);
 coach.innerHTML="<strong>Rhythm coach</strong><p>The final rhythm-flowers.riv artwork is pending. This procedural garden keeps gameplay and timing testable.</p>";
 warning.hidden=true;warning.setAttribute("role","status");status.setAttribute("role","status");
 side.append(coach,summary,target,noteList);
 main.append(stage,side);

 const pads=make("div","rhythm-pads");
 const laneButtons:HTMLButtonElement[]=[];
 for(let lane=0;lane<LANE_COUNT;lane++){
  const name=["Red flower","Gold flower","Green flower","Blue flower"][lane];
  const button=textButton(`${name} · ${LANE_KEYS[lane].toUpperCase()}`,()=>{});
  button.setAttribute("aria-label",`${name} lane ${lane+1}`);
  button.style.borderColor=LANE_COLORS[lane];
  button.addEventListener("pointerdown",event=>{if(event.button!==0)return;event.preventDefault();hit(lane)});
  button.addEventListener("click",event=>{if(event.detail===0)hit(lane)});
  laneButtons.push(button);pads.append(button);
 }

 const settings=doc.createElement("details"),settingsSummary=make("summary","","Settings"),settingsBody=make("div","rhythm-settings");
 const soundLabel=make("label","","Sound "),sound=doc.createElement("input"),volumeLabel=make("label","","Volume "),volume=doc.createElement("input"),visualLabel=make("label","","Visual-only practice "),visualOnly=doc.createElement("input"),motionLabel=make("label","","Reduce motion "),reduced=doc.createElement("input"),contrastLabel=make("label","","Contrast "),contrast=doc.createElement("select"),calibrationLabel=make("label","","Calibration "),calibration=doc.createElement("input"),calibrationOutput=make("output","rhythm-calibration-value","0 ms");
 sound.type="checkbox";sound.setAttribute("aria-label","Sound effects");volume.type="range";volume.min="0";volume.max="100";volume.value="35";volume.disabled=true;volume.setAttribute("aria-label","Rhythm volume");visualOnly.type="checkbox";visualOnly.setAttribute("aria-label","Visual-only practice");reduced.type="checkbox";reduced.setAttribute("aria-label","Reduce motion");contrast.setAttribute("aria-label","Rhythm contrast");contrast.append(new Option("Standard","standard"),new Option("High contrast","high"));calibration.type="range";calibration.min="-200";calibration.max="200";calibration.step="5";calibration.value="0";calibration.setAttribute("aria-label","Input calibration milliseconds");
 for(const node of [sound,visualOnly,reduced])node.addEventListener("change",settingsChanged);
 volume.addEventListener("input",()=>{audio.setVolume(Number(volume.value)/100);audio.tone(260,30,"sine")});
 contrast.addEventListener("change",()=>draw(performance.now()));
 calibration.addEventListener("input",()=>{session.calibrate(Number(calibration.value));calibrationOutput.textContent=`${session.calibrationMs} ms`;mark()});
 soundLabel.prepend(sound);volumeLabel.append(volume);visualLabel.prepend(visualOnly);motionLabel.prepend(reduced);contrastLabel.append(contrast);calibrationLabel.append(calibration,calibrationOutput);
 settingsBody.append(soundLabel,volumeLabel,visualLabel,motionLabel,contrastLabel,calibrationLabel);
 settings.className="rhythm-settings";settings.append(settingsSummary,settingsBody);

 const help=doc.createElement("details");help.className="rhythm-help";help.append(make("summary","","How to play"),make("p","","Tap the matching lane as each flower reaches the hit line. Perfect timing scores 100; good timing scores 50. A phrase lasts four seconds. Retry starts at the beginning of the current phrase. Save records a phrase-boundary checkpoint in My files."));
 const saveDetails=doc.createElement("details"),saveSummary=make("summary","","Save location"),saveFields=make("div","rhythm-save-fields"),path=appInput("Rhythm save path",host.w?.launchContext?.path||"/Rhythm Garden.game.json"),folder=textButton("Choose folder",()=>void chooseFolder()),saveButton=textButton("Save to My files",()=>void save()),openButton=textButton("Open from My files",()=>void open());
 saveDetails.className="rhythm-save";saveFields.append(path,folder,saveButton,openButton);saveDetails.append(saveSummary,saveFields);
 const lower=make("div");lower.append(settings,help,saveDetails);
 element.append(header,main,pads,lower,warning,status);

 const valid=()=>!disposed&&!signal.aborted&&element.isConnected&&owner===host.storage.signedInSubject();
 const announce=(message:string)=>{if(valid())status.textContent=message};
 const mark=()=>{state.dirty=true;revision++};
 const setDirty=(value:boolean)=>{state.dirty=value};
 const setBusy=(value:boolean)=>{
  busy=value;
  track.disabled=value;
  difficulty.disabled=value;
  pauseButton.disabled=value;
  retryButton.disabled=value;
  folder.disabled=value;
  saveButton.disabled=value;
  openButton.disabled=value;
  path.disabled=value;
  for(const button of laneButtons)button.disabled=value||paused;
 };
 const audioTime=()=>audio.now();

 function settingsChanged():void{
  volume.disabled=!sound.checked;
  if(sound.checked)audio.unlock();else audio.setMuted(true);
  if(visualOnly.checked)audio.setMuted(true);
  else audio.setMuted(!sound.checked);
  mark();draw(performance.now());
 }

 function beginOrContinue():void{
  if(busy||!valid())return;
  if(paused){
   if(phraseFinished&&phraseStarted&&session.phraseId<session.track.phrases.length-1)session.phraseId+=1;
   phraseCheckpoint=session.snapshot();
   phraseStart=audioTime();session.beginPhrase(phraseStart,session.phraseId);
   readied(false);pauseButton.textContent="Pause";pauseButton.setAttribute("aria-label","Pause");
   paused=false;phraseFinished=false;phraseStarted=true;
   mark();
   if(sound.checked&&!visualOnly.checked)audio.unlock();
   announce(`Phrase ${session.phraseId+1} started. Tap the matching flower lane.`);
  }else{
   finishPhrase();
  }
  refresh();
 }
 function readied(value:boolean):void{readyUntil=value?performance.now()+900:0}
 function toggleRun():void{beginOrContinue()}

 function hit(lane:number):void{
  if(busy||!valid()||paused||performance.now()<readyUntil)return;
  const time=audioTime()-phraseStart;
  const result=session.judge(lane,performance.now(),time);
  if(result===null){
   session.registerMiss(time);
   audio.tone(110,80,"sawtooth");
   announce("Missed this lane. Follow the next flower marker.");
  }else{
   audio.tone(result.kind==="perfect"?660:480,70,"triangle");
   announce(`${result.kind==="perfect"?"Perfect":"Good"} hit · score ${session.score} · combo ${session.combo}`);
   mark();
  }
  draw(performance.now());refresh();
 }

 function finishPhrase():void{
  if(session.paused)return;
  session.completePhrase();
  paused=true;phraseFinished=true;
  pauseButton.textContent="Resume";pauseButton.setAttribute("aria-label","Resume");
  audio.suspend();
  if(session.completed.includes(session.trackId))announce("Track complete. Choose another garden or retry to improve your score.");
  else announce(`Phrase ${session.phraseId+1} complete. Press Resume for the next phrase.`);
  mark();refresh();
 }

 function retryPhrase():void{
  if(busy||!valid())return;
  const checkpoint=phraseCheckpoint||session.snapshot();
  session=sessionFromSave({payload:structuredClone(checkpoint)});
  paused=true;phraseFinished=true;phraseStarted=false;audio.suspend();
  track.value=String(session.trackId);difficulty.value=String(session.difficulty);
  mark();
  announce("Current phrase reset. Press Resume to begin with a fresh count-in.");refresh();
 }

 async function chooseFolder():Promise<void>{
  try{const directory=await host.storage.pickFolder({signal});if(directory===null||!valid())return;const context=await host.storage.mirrorFileContext();if(!valid()||!context.valid())return;path.value=context.path((directory==="/"?"":directory)+"/"+context.name(path.value.split("/").pop()||"Rhythm Garden.game.json"))}catch(error){announce("Could not choose folder: "+(error instanceof Error?error.message:"unknown error"))}
 }
 function clearWatch():void{watchSerial++;unwatch();unwatch=()=>{}}
 function watch(context:FileContext,filePath:string,version:string):void{
  clearWatch();const serial=watchSerial,check=async()=>{if(!valid()||!context.valid()||savedPath!==filePath||savedVersion!==version)return;let text="";try{const current=context.files.stat?await context.files.stat(filePath):await context.files.read(filePath);text=current.status==="conflict"?"This checkpoint has conflicting copies. Resolve them in Files.":current.version!==version?"The saved checkpoint changed. Your live garden is unchanged.":""}catch{text="The saved checkpoint is unavailable. Your live garden is unchanged."}if(valid()&&context.valid()&&serial===watchSerial){warning.textContent=text;warning.hidden=!text}};unwatch=context.files.subscribe?.(check)||(()=>{});queueMicrotask(check);
 }
 async function save():Promise<void>{
  if(busy||!valid())return;
  const previousDirty=state.dirty;
  if(!session.paused)finishPhrase();
  setBusy(true);
  setDirty(true);
  const captured=revision,text=encodeSave(session),requested=path.value;
  let committed=false;
  try{
   const context=await host.storage.mirrorFileContext(),target=context.path(requested);
   if(!target.toLowerCase().endsWith(".game.json"))throw Error("Use a .game.json file name.");
   let expected:string|null=null;
   try{const existing=context.files.stat?await context.files.stat(target):await context.files.read(target);if(existing.status==="conflict")throw Error("Resolve the conflict in Files first.");if(target===savedPath&&savedVersion){if(existing.version!==savedVersion)throw Error("The saved checkpoint changed. Save a copy or reopen it.")}else if(!await host.ui.confirm?.("Replace "+target+"?",{title:"Replace rhythm checkpoint",confirmLabel:"Replace",cancelLabel:"Cancel",danger:true,signal})){announce("Save cancelled.");return}expected=existing.version}catch(error){if(!(error instanceof Error)||error.message!=="File not found.")throw error;if(target===savedPath&&savedVersion)throw Error("The saved checkpoint was removed. Save a copy or reopen it.")}
   if(!valid()||!context.valid())return;const result=await context.files.write(target,new TextEncoder().encode(text),expected);if(!valid()||!context.valid())return;
   savedPath=target;savedVersion=result.version;path.value=target;setDirty(revision!==captured);
   if(host.w){host.w.launchContext=Object.freeze({version:1,storage:"mirror",path:target,owner});host.w.title=target.split("/").pop()+" — Rhythm Garden"}
   committed=true;watch(context,target,result.version);
   announce(result.status==="conflict"?"Checkpoint saved with conflicting copies. Resolve them in Files.":"Checkpoint saved to My files; syncing with the server.");
  }catch(error){announce("Could not save checkpoint: "+(error instanceof Error?error.message:"unknown error"))}finally{
   if(!committed&&valid()&&revision===captured)setDirty(previousDirty);
   setBusy(false);
  }
 }
 async function open(selected?:string):Promise<void>{
  if(busy||!valid())return;
  if(!session.paused)finishPhrase();
  setBusy(true);
  const before=revision,snapshot=encodeSave(session);
  try{
   if(state.dirty&&!await host.ui.confirm?.("Open a checkpoint and discard current progress?",{title:"Unsaved rhythm progress",confirmLabel:"Discard progress",cancelLabel:"Keep garden",danger:true,signal})){announce("Garden remains paused.");return}
   if(!valid())return;
   if(revision!==before||encodeSave(session)!==snapshot)throw Error("The garden changed while confirming; try again.");
   const choice=selected||await host.storage.pickFile({extensions:[".json"],signal});if(!choice||!valid())return;
   const context=await host.storage.mirrorFileContext(),target=context.path(choice),file=await context.files.read(target);
   if(!valid()||!context.valid())return;
   if(file.status==="conflict")throw Error("Resolve the conflict in Files first.");
   if(file.data.byteLength>8*1024*1024)throw Error("Checkpoint file is too large.");
   const restored=sessionFromSave(decodeSave(new TextDecoder("utf-8",{fatal:true}).decode(file.data)));
   if(!valid()||!context.valid())return;
   if(revision!==before||encodeSave(session)!==snapshot)throw Error("The garden changed while opening; try again.");
   session=restored;paused=true;phraseFinished=true;phraseStarted=false;phraseCheckpoint=session.snapshot();audio.suspend();
   savedPath=target;savedVersion=file.version;path.value=target;track.value=String(session.trackId);difficulty.value=String(session.difficulty);calibration.value=String(session.calibrationMs);calibrationOutput.textContent=`${session.calibrationMs} ms`;setDirty(false);warning.hidden=true;
   if(host.w){host.w.launchContext=Object.freeze({version:1,storage:"mirror",path:target,owner});host.w.title=target.split("/").pop()+" — Rhythm Garden"}
   watch(context,target,file.version);refresh();announce("Checkpoint loaded at its phrase boundary. Press Resume for a fresh count-in.");
  }catch(error){announce("Could not open checkpoint: "+(error instanceof Error?error.message:"unknown error"))}finally{setBusy(false)}
 }

 function refresh():void{
  if(!valid())return;
  pauseButton.textContent=paused?"Resume":"Pause";pauseButton.setAttribute("aria-label",pauseButton.textContent);
  pauseButton.disabled=busy;
  retryButton.disabled=busy;
  const phrase=session.track.phrases[session.phraseId];
  summary.textContent=`Garden ${session.trackId+1} · phrase ${session.phraseId+1}/${session.track.phrases.length} · score ${session.score} · combo ${session.combo}`;
  target.textContent=paused?(phraseFinished?"At a saved phrase boundary.":"Paused inside the phrase."):`Listen and tap ${LANE_COUNT} flowers.`;
  noteList.textContent=phrase.notes.map((note,index)=>`${String(index+1).padStart(2,"0")}  ${(note.timeMs/1000).toFixed(2)}s  lane ${note.lane+1}`).join("\n");
  for(let lane=0;lane<laneButtons.length;lane++)laneButtons[lane].disabled=busy||paused;
 }
 function draw(now:number):void{
  const rect=stage.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),width=Math.max(320,rect.width),height=Math.max(280,rect.height);
  if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr)}
  const ctx=canvas.getContext("2d");if(!ctx)return;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
  ctx.fillStyle=contrast.value==="high"?"#071008":"#17311f";ctx.fillRect(0,0,width,height);
  const laneWidth=width/LANE_COUNT,hitY=height-72,elapsed=phraseStarted?audioTime()-phraseStart:0;
  for(let lane=0;lane<LANE_COUNT;lane++){
   ctx.fillStyle=contrast.value==="high"?"#182b1b":"#213f29";ctx.fillRect(lane*laneWidth+3,0,laneWidth-6,height);
   ctx.strokeStyle=LANE_COLORS[lane];ctx.lineWidth=3;ctx.beginPath();ctx.arc(lane*laneWidth+laneWidth/2,hitY,Math.min(36,laneWidth*.24),0,Math.PI*2);ctx.stroke();
   ctx.fillStyle=LANE_COLORS[lane];ctx.beginPath();ctx.arc(lane*laneWidth+laneWidth/2,hitY,Math.min(22,laneWidth*.15)+(reduced.checked?0:Math.sin(now/240+lane)*2),0,Math.PI*2);ctx.fill();
   ctx.fillStyle="rgba(255,255,255,.75)";ctx.font="12px system-ui";ctx.fillText(LANE_KEYS[lane].toUpperCase(),lane*laneWidth+laneWidth/2-4,hitY+46);
  }
  const phrase=session.track.phrases[session.phraseId];
  for(const note of phrase.notes){
   const remaining=note.timeMs-elapsed;if(remaining<-120||remaining>PHRASE_LENGTH_MS)continue;
   const laneWidthNow=width/LANE_COUNT,y=hitY-(remaining/PHRASE_LENGTH_MS)*(hitY-30);
   const x=note.lane*laneWidthNow+laneWidthNow/2;
   ctx.fillStyle=LANE_COLORS[note.lane];ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.fill();
   ctx.strokeStyle="#ffffff";ctx.lineWidth=2;ctx.stroke();
  }
  if(!paused){ctx.strokeStyle="#f7f1d0";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,hitY);ctx.lineTo(width,hitY);ctx.stroke()}
 }
 const loop=(now:number)=>{if(disposed)return;watchWindow();if(!paused&&performance.now()>=readyUntil){const elapsed=audioTime()-phraseStart;session.registerMiss(elapsed);if(elapsed>=PHRASE_LENGTH_MS)finishPhrase()}draw(now);refresh();frame=requestAnimationFrame(loop)};frame=requestAnimationFrame(loop);
 const observer=new ResizeObserver(()=>draw(performance.now()));observer.observe(stage);

 const keydown=(event:KeyboardEvent)=>{if(event.target instanceof HTMLInputElement||event.target instanceof HTMLSelectElement||event.target instanceof HTMLTextAreaElement)return;if(event.key==="Escape"){event.preventDefault();if(!event.repeat)toggleRun();return}const lane=LANE_KEYS.indexOf(event.key.toLowerCase());if(lane>=0){event.preventDefault();if(!event.repeat)hit(lane)}};
 element.addEventListener("keydown",keydown);
 const suspend=()=>{if(!paused)finishPhrase();audio.suspend();announce("Garden paused when its window lost attention. Press Resume when ready.")};
 const blur=(event:FocusEvent)=>{if(event.target===window)suspend()};
 const visibility=()=>{if(doc.hidden)suspend()};window.addEventListener("blur",blur);doc.addEventListener("visibilitychange",visibility);
 let observedWindow:HTMLElement|null=null;
 let windowAttention=true;
 function applyWindowAttention():void{
  const active=!!observedWindow&&!observedWindow.hidden&&observedWindow.classList.contains("focused")&&!observedWindow.classList.contains("rolled");
  if(!active&&windowAttention){windowAttention=false;suspend()}
  else if(active)windowAttention=true;
 }
 function watchWindow():void{
  const current=element.closest<HTMLElement>(".window");
  if(current!==observedWindow){windowObserver.disconnect();observedWindow=current;if(current)windowObserver.observe(current,{attributes:true,attributeFilter:["class","hidden"]})}
  applyWindowAttention();
 }
 const windowObserver=new MutationObserver(applyWindowAttention);
 const trackChanged=()=>{if(busy){track.value=String(session.trackId);return}if(state.dirty&&host.ui.confirm)void restartForTrack();else void restartForTrack()};track.addEventListener("change",trackChanged);difficulty.addEventListener("change",()=>{if(busy){difficulty.value=String(session.difficulty);return}session.difficulty=Number(difficulty.value) as 1|2|3;mark();refresh()});
 async function restartForTrack():Promise<void>{
  if(busy||!valid())return;
  const requested=track.value,before=revision,snapshot=encodeSave(session);
  if(state.dirty&&host.ui.confirm&&!await host.ui.confirm("Change garden and discard current rhythm progress?",{title:"New Rhythm Garden",confirmLabel:"Change garden",cancelLabel:"Keep current",danger:true,signal})){track.value=String(session.trackId);return}
  if(!valid())return;
  if(revision!==before||encodeSave(session)!==snapshot){track.value=String(session.trackId);announce("The garden changed while confirming. Try again.");return}
  clearWatch();session=new RhythmSession(`rhythm-${crypto.randomUUID()}`,Number(requested));session.difficulty=Number(difficulty.value) as 1|2|3;paused=true;phraseFinished=true;phraseStarted=false;phraseCheckpoint=session.snapshot();savedPath=null;savedVersion=null;if(host.w)delete host.w.launchContext;mark();path.value="/Rhythm Garden.game.json";audio.suspend();announce("Garden ready. Press Resume for the first phrase.");refresh();
 }

 refresh();draw(performance.now());
 if(host.w?.launchContext?.storage==="mirror"&&host.w.launchContext.owner===owner){const initialPath=host.w.launchContext.path;path.value=initialPath;const openWhenConnected=(attempt=0):void=>{if(disposed||signal.aborted)return;if(!element.isConnected&&attempt<60)setTimeout(()=>openWhenConnected(attempt+1),16);else if(valid())void open(initialPath)};queueMicrotask(()=>openWhenConnected())}
 else announce("Press Resume for the first phrase. Timing and calibration are shown in Settings.");
 void RIVE_CONTRACT;void parseRiveIntent;
 return{element,dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frame);clearWatch();observer.disconnect();windowObserver.disconnect();element.removeEventListener("keydown",keydown);window.removeEventListener("blur",blur);doc.removeEventListener("visibilitychange",visibility);audio.dispose();element.replaceChildren()}};
}
