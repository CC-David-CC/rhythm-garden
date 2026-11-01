import type {Host} from "./view/run.js";

export interface MountResult {
  element: HTMLElement;
  dispose(): void;
}

export function mount(host: Host, options: {autostart?: boolean} = {}): MountResult {
  const body=host.ui.make("div","window-content rhythm-garden");
  const status=host.ui.make("div","app-status","Loading Rhythm Garden…");
  body.append(status);
  const controller=new AbortController();
  const abort=()=>controller.abort(host.signal?.reason||"View removed");
  host.signal?.addEventListener("abort",abort,{once:true});
  if(host.signal?.aborted)abort();
  let disposed=false,view:{element:HTMLElement;dispose():void}|null=null;
  if(options.autostart!==false)queueMicrotask(()=>{
    void import("./view/run.js").then(async({startView})=>{
      if(disposed||controller.signal.aborted)return;
      const candidate=await startView(host,controller.signal);
      if(disposed){candidate.dispose();return;}
      view=candidate;
      body.replaceChildren(view.element);
    }).catch(error=>{
      if(!disposed&&body.isConnected)status.textContent="Could not start Rhythm Garden: "+(error instanceof Error?error.message:"unknown error");
    });
  });
  return {
    element:body,
    dispose(){
      if(disposed)return;
      disposed=true;
      host.signal?.removeEventListener("abort",abort);
      controller.abort("View removed");
      view?.dispose();
      view=null;
    },
  };
}
