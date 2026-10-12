import assert from "node:assert/strict";
import {test} from "node:test";
import {WebVitalAccumulator} from "../shared/web-vitals.ts";
test("CLS uses maximum 1-second-gap / 5-second-span session window and ignores recent input",()=>{
  const metrics=new WebVitalAccumulator();
  for(const [startTime,value] of [[100,0.05],[500,0.1],[1600,0.08],[2000,0.09]])metrics.addLayoutShift({startTime:startTime!,value:value!});
  metrics.addLayoutShift({startTime:2100,value:1,hadRecentInput:true});assert.ok(Math.abs(metrics.metrics().cls-0.17)<1e-12);
  for(const startTime of [2200,3000,3800,4600,5400,6200])metrics.addLayoutShift({startTime,value:0.01});
  assert.ok(metrics.metrics().cls<0.25);
});
test("INP groups events by interaction, removes a worst interaction per 50, and is unknown without full count",()=>{
  const metrics=new WebVitalAccumulator();metrics.addInteraction({interactionId:1,duration:300});metrics.addInteraction({interactionId:1,duration:200});metrics.addInteraction({interactionId:2,duration:100});metrics.addInteraction({interactionId:0,duration:2000});
  assert.equal(metrics.metrics().inp,undefined);assert.equal(metrics.metrics(49).inp,300);assert.equal(metrics.metrics(50).inp,100);
});
test("LCP does not include paints after the first hidden boundary",()=>{
  const metrics=new WebVitalAccumulator();metrics.addLcp(400);metrics.hide(500);metrics.addLcp(900);assert.equal(metrics.metrics().lcp,400);
});
