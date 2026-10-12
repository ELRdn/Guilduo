/** CLS uses maximum session windows. INP uses interaction latency, not arbitrary event duration. */
export class WebVitalAccumulator {
  private clsWindowStart=0;
  private clsWindowLast=0;
  private clsWindowValue=0;
  private clsMax=0;
  private interactions=new Map<number,number>();
  private lcp=0;
  private firstHidden=Infinity;
  hide(at:number){this.firstHidden=Math.min(this.firstHidden,at);}
  addLcp(at:number){if(Number.isFinite(at)&&at>=0&&at<this.firstHidden)this.lcp=Math.max(this.lcp,at);}
  addLayoutShift(entry:{startTime:number;value:number;hadRecentInput?:boolean}){
    if(entry.hadRecentInput||!Number.isFinite(entry.value)||entry.value<0)return;
    if(this.clsWindowValue && entry.startTime-this.clsWindowLast<1000 && entry.startTime-this.clsWindowStart<5000)this.clsWindowValue+=entry.value;
    else{this.clsWindowStart=entry.startTime;this.clsWindowValue=entry.value;}
    this.clsWindowLast=entry.startTime;this.clsMax=Math.max(this.clsMax,this.clsWindowValue);
  }
  addInteraction(entry:{interactionId?:number;duration:number}){
    const id=entry.interactionId;if(!id||!Number.isSafeInteger(id)||!Number.isFinite(entry.duration)||entry.duration<0)return;
    this.interactions.set(id,Math.max(this.interactions.get(id)||0,entry.duration));
    if(this.interactions.size>10){const lowest=[...this.interactions.entries()].sort((a,b)=>a[1]-b[1])[0]!;this.interactions.delete(lowest[0]);}
  }
  metrics(interactionCount?:number):{lcp:number;cls:number;inp?:number}{
    const metrics:{lcp:number;cls:number;inp?:number}={lcp:this.lcp,cls:this.clsMax};
    if(typeof interactionCount==="number"&&Number.isSafeInteger(interactionCount)&&interactionCount>0&&this.interactions.size){
      const latencies=[...this.interactions.values()].sort((a,b)=>b-a);metrics.inp=latencies[Math.min(Math.floor(interactionCount/50),latencies.length-1)]!;
    }
    return metrics;
  }
}
