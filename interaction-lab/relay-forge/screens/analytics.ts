import { getLocale } from "../../../i18n.ts";
import { ANALYTICS_POLICY_VERSION } from "../../../server/launch-analytics.ts";
import { analyticsText, clearAcquisitionHandoff, pendingAcquisitionToken, type AnalyticsPort } from "../../../launch-analytics-client.ts";
import { el } from "../primitives/dom.ts";
import { screenRegion } from "./runtime.ts";
export function createAnalyticsUi(options:{port:AnalyticsPort|null;render:()=>void;alive:()=>boolean}) {
  let loaded=false;let enabled=false;let busy=false;let consent="unknown";let error=false;let sequence=0;
  const changed=()=>{if(!options.alive())return;const focus=document.activeElement instanceof HTMLElement?document.activeElement.dataset.analyticsAction:undefined;options.render();if(focus){const controls=[...document.querySelectorAll<HTMLButtonElement>("[data-analytics-action]")];(controls.find(node=>node.dataset.analyticsAction===focus&&!node.disabled)||controls.find(node=>!node.disabled))?.focus({preventScroll:true});}};
  async function enter(){if(busy||!options.port)return;loaded=true;busy=true;error=false;try{const value=await options.port.getAnalyticsConsent();if(!options.alive())return;enabled=value.enabled;consent=value.consent;}catch{error=true;}finally{busy=false;changed();}}
  async function choose(value:"granted"|"denied"){
    if(busy||!options.port)return;const own=++sequence;busy=true;error=false;changed();
    try{const token=value==="granted"?pendingAcquisitionToken():undefined;const result=await options.port.setAnalyticsConsent({consent:value,policyVersion:ANALYTICS_POLICY_VERSION,...(token?{acquisitionToken:token}:{})});if(!options.alive()||own!==sequence)return;consent=result.consent;enabled=result.enabled;clearAcquisitionHandoff();}catch{if(own===sequence)error=true;}finally{if(own===sequence){busy=false;changed();}}
  }
  function render():HTMLElement|null{
    if(!options.port || loaded&&!enabled&&consent!=="granted"&&!error)return null;
    const locale=getLocale();const text=(key:Parameters<typeof analyticsText>[0])=>analyticsText(key,locale);
    const controls=el("div",{class:"rf-set-avatar-actions"});
    for(const [key,value] of [["allow","granted"],[consent==="granted"?"withdraw":"deny","denied"]] as const){const button=el("button",{type:"button",class:"rf-secondary-button",disabled:busy||value===consent||value==="granted"&&!enabled,"data-analytics-action":value},text(key));button.addEventListener("click",()=>{void choose(value);});controls.append(button);}
    if(error){const retry=el("button",{type:"button",class:"rf-secondary-button",disabled:busy},text("retry"));retry.addEventListener("click",()=>{loaded=false;error=false;void enter();});controls.append(retry);}
    return screenRegion(text("title"),{},el("div",{"data-analytics-consent":"account"},el("p",{},text("description")),el("p",{role:"status","aria-live":"polite"},text(error?"failed":busy?"loading":!enabled?"paused":consent==="granted"?"granted":consent==="denied"?"denied":"unknown")),controls,el("a",{href:"https://guilduo.com/privacy/",target:"_blank",rel:"noopener noreferrer"},text("privacy"))));
  }
  return {enter:()=>{void enter();},render};
}
