
import '../../../interaction-lab/relay-forge/tokens.css';
import '../../../interaction-lab/all-for-adhd/styles.css';
import '../../../interaction-lab/all-for-adhd/forge-skin.css';
import '../../../interaction-lab/all-for-adhd/polish.css';
import { mountAllFor } from '../../../interaction-lab/all-for-adhd/app.ts';
import { fixtureRawQuests } from '../../../interaction-lab/relay-forge/fixtures.ts';
import { fixture, TODAY, NOW } from './model.mjs';
const params = new URLSearchParams(location.search);
document.documentElement.dataset.theme = params.get('theme') || 'light';
document.documentElement.dataset.a4Palette = 'spine';
// Fixed clock is confined to this development review harness.
const RealDate = Date;
window.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [TODAY + 'T' + NOW + ':00'])); } static now() { return new RealDate(TODAY + 'T' + NOW + ':00').getTime(); } };
const baseline = fixtureRawQuests[0];
let revision = 0, created = 0, listener;
const stamp = () => new RealDate(RealDate.now() + ++revision).toISOString();
const tasks = fixture(params.get('scenario') || 'normal');
const state = t => t.state === 'review' ? 'review_required' : t.owner === 'self' && t.state === 'ready' ? 'none' : t.state;
let quests = tasks.map(t => ({ ...baseline, id:t.id, title:t.title, icon:t.icon, iconSource:t.icon ? 'user' : '', nextAction:t.next, notes:t.notes, completionCriteria:t.criteria, kind:t.kind, done:t.done,
 lifecycleState:t.archived ? 'archived' : t.done && t.kind !== 'daily' ? 'completed' : 'active', scheduledDate:t.date, scheduledTime:t.time, dueDate:t.due, estimatedMinutes:t.minutes,
 planningMode:'on_date', planningState:t.date ? 'scheduled' : 'backlog', parentQuestId:'', dependencyIds:[], humanRequest:null, proposal:null, handoff:{},
 lastCompletedDate:t.lastCompleted || '', assignee:{type:t.owner === 'self' ? 'self' : 'agent',id:t.owner,label:t.owner === 'self' ? 'ひろなお' : t.owner,handoffState:state(t)}, updatedAt:stamp(), createdAt:stamp() }));
for (const t of tasks) for (const [i, step] of (t.steps || []).entries()) quests.push({ ...quests.find(q=>q.id===t.id), id:t.id+'-step-'+i,title:step.title, nextAction:'', scheduledDate:'', scheduledTime:'',estimatedMinutes:0, done:step.done, parentQuestId:t.id });
const controls = document.createElement('details'); controls.style.cssText='position:fixed;right:8px;top:0;z-index:100;font-size:11px;background:var(--qf-color-surface)';
controls.innerHTML='<summary>検証操作</summary><label><input type="checkbox" id="fail-save">保存を失敗させる</label><label><input type="checkbox" id="fail-refresh">再取得を失敗させる</label><button id="external">外部更新</button><output id="writes" aria-label="保存回数">0</output>';
document.body.append(controls);
let writes=0;
const beforeSave = async () => { await new Promise(r=>setTimeout(r, 180)); if(document.getElementById('fail-save').checked) throw new Error('fixture-save-failure'); document.getElementById('writes').textContent=String(++writes); };
const replace = q => { quests=quests.filter(t=>t.id!==q.id).concat(q); return q; };
document.getElementById('external').onclick=()=>listener?.();
const unsupported = async()=>{throw new Error('outside-fixture-scope');};
mountAllFor(document.getElementById('a4-root'), {
 demo:false, self:()=>({id:'self',label:'ひろなお'}), today:()=>TODAY,quests:()=>quests,
 agents:()=>['Scarlet','Cyan'].map(id=>({id,name:id,role:'',active:true,startState:'ready'})),members:()=>[],
 subscribe:fn=>{listener=fn;return ()=>{listener=null;};},
 create:async input=>{await beforeSave();return replace({...baseline,...input,id:'new-'+(++created), done:false, humanRequest:null, assignee:{type:'self',id:'self',label:'ひろなお',handoffState:'none'}, updatedAt:stamp()});},
 update:async(q,patch)=>{await beforeSave();if(quests.find(t=>t.id===q.id).updatedAt!==q.updatedAt)throw new Error('quest_conflict');return replace({...q,...patch,updatedAt:stamp()});},
 complete:async q=>{await beforeSave();return {quest:replace({...q,done:!q.done,lifecycleState:q.kind==='daily'?'active':q.done?'active':'completed',lastCompletedDate:TODAY,updatedAt:stamp()}),character:null};},
 refresh:async()=>{if(document.getElementById('fail-refresh').checked)throw new Error('fixture-refresh-failure');},
 answer:unsupported,review:unsupported,registerAgent:unsupported,removeAgent:unsupported,activity:async()=>[],
 mcp:{url:'https://mcp.guilduo.com/mcp',connections:async()=>[],link:unsupported,revoke:unsupported},
 notifications:{load:async()=>({settings:{before:10,atStart:true,summary:'08:00',review:true,proposal:true,report:true},devices:0}),device:async()=>false,save:unsupported,enable:unsupported,disable:unsupported,test:unsupported}
});
