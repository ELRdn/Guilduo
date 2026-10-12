import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
/** No environment file is loaded; never print the administrator credential. */
const origin = new URL(process.env.ANALYTICS_BASE_URL || "https://mcp.guilduo.com");
assert.ok(origin.protocol === "https:" || origin.protocol === "http:" && ["localhost","127.0.0.1"].includes(origin.hostname));
assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash && origin.pathname === "/");
const token=process.env.ANALYTICS_ADMIN_TOKEN;assert.ok(token && token.length>=32,"Separate analytics administrator credential required");
const deletion=process.argv[2]==="delete-account";
if(process.argv.length>2 && !deletion)throw Error("Use no arguments for report or delete-account <exact-owner-id> for approved scoped deletion");
const owner=process.argv[3];
if(deletion && (!owner || owner.length>240 || process.argv.length!==4))throw Error("One exact owner ID is required");
if(deletion){
  const result=await fetch(new URL("/v1/analytics/admin/delete-account",origin),{method:"POST",headers:{authorization:`Bearer ${token}`,"content-type":"application/json"},body:JSON.stringify({uid:owner}),redirect:"error",signal:AbortSignal.timeout(30000)});
  assert.ok(result.ok,`Optional-data deletion unavailable: HTTP ${result.status}`);
  const status=await result.json() as {optionalDataDeleted:boolean;privateSnapshotCleanupPending:boolean};
  assert.equal(status.optionalDataDeleted,true);
  console.log(status.privateSnapshotCleanupPending?"D1 optional data removed; private-snapshot cleanup pending, do not close deletion request.":"Optional data and preference removed; other account stores/retention exceptions must be verified separately.");
  if(status.privateSnapshotCleanupPending)process.exitCode=2;
}else{
const response=await fetch(new URL("/v1/analytics/admin/report",origin),{headers:{authorization:`Bearer ${token}`},redirect:"error",signal:AbortSignal.timeout(15000)});
assert.ok(response.ok,`Aggregate report unavailable: HTTP ${response.status}`);
const report=await response.json() as Record<string,unknown>;
assert.equal(report.schemaVersion,1,"Unknown report contract");
const directory=resolve(".qa-artifacts","analytics");await mkdir(directory,{recursive:true});
await writeFile(resolve(directory,"report.json"),JSON.stringify(report,null,2)+"\n");
const rows: string[][]=[["metric","mature_n","reached","pending_n","rate"]];
const push=(name:string,value:unknown)=>{const row=value as Record<string,unknown>;rows.push([name,String(row.matureN??""),String(row.reached??""),String(row.pendingN??""),String(row.rate??"")]);};
push("activation",report.activation);push("paid_conversion",report.paidConversion);push("net_paid_conversion",report.netPaidConversion);
for(const [name,value] of Object.entries(report.retention as Record<string,unknown>))push(`retention_${name}`,value);
await writeFile(resolve(directory,"cohorts.csv"),rows.map(row=>row.map(cell=>`"${cell.replaceAll('"','""')}"`).join(",")).join("\n")+"\n");
console.log(`Aggregate ${report.environment} report saved to .qa-artifacts/analytics; unknown rates and costs are blank/null.`);

}
