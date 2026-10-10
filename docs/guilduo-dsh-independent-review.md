# Guilduo DSH beta.16 独立レビュー

確認日: 2026-10-10。対象: `@guilduo/dsh-oauth-poc@0.6.0-beta.16`、Windows / DSH `0.2.0-rc.2`。

これは別担当AIによる限定的な独立レビューであり、外部の人間による監査ではない。DSH追加開発停止は維持する。ランタイム修正、再配布、npm公開、Git変更、実profile・資格情報・履歴へのアクセス、実OAuth、モデル要求は行っていない。書き込みはこの文書だけ。

## 対象の照合と証拠の区別

対象scope: このrepositoryの `plugins/guilduo-dsh/` と関連するstatus／README／受け入れ証跡。以下のpathはrepo相対。

2026-10-10T06:05:03.983Zに、未認証の公開GitHub APIでmainを解決し、commit `329ae07ca04cd31dcc91c3bb05f6e2ada8951bd4` のrawファイルとworktreeをbyte比較した。DSHの6 sourceファイル、`stage.mjs`、`lib/{adapter,index,persistence}.js` の計10ファイルが一致した。これはその時点の公開mainとの一致であり、将来のmain、実インストール、配備済みサーバーの証明ではない。

| 対象 | 確認したSHA-256 |
| --- | --- |
| `plugins/guilduo-dsh/src/index.ts` | `28a77d385f6f6c72aafe29d679a94562dc0f79fdf4f1fa80efefb8d996f52a5b` |
| `plugins/guilduo-dsh/src/adapter.ts` | `e7919161e6775bc491a08bb20625e083402fe6b9716e135f9d2858dc18917c6c` |
| `plugins/guilduo-dsh/src/persistence.ts` | `2f4350fe9b02c73804de928b0788d76f2c546e8ed27f4a8cc6b9580bae51a3b7` |
| `plugins/guilduo-dsh/stage.mjs` | `abc20dd8c86cad303e234c0b35821877509e507a9ae0bbed64f5320d62d7ccb3` |
| `plugins/guilduo-dsh/lib/index.js` | `b08a3b30360da07aa0bfa1d43878e50e06315bef27449ee4e534d719864b7307` |
| `plugins/guilduo-dsh/lib/adapter.js` | `1ccc7e55797afd815d0b8c732928c8a9e01796e6303f20c4ef2a668fc70b63aa` |
| `plugins/guilduo-dsh/lib/persistence.js` | `c0ff81bb029a7f1085e5dde523a874d6d81e19a1c9ff6dc27b12478e26a1a10e` |

[現行status](guilduo-dsh-status.md) 12–16行の80 package tests、native合成検査、ユーザーのDesktop再起動・読み書き報告は過去の証跡／ユーザー報告として読んだ。今回の新しい検証は公開sourceの照合と下記メモリ内assertionであり、80テストや実機受け入れを再実行したとは主張しない。beta.14の実際の認証消失原因は未確定のまま。

## 所見

### DSH-R1 — P2: 旧grant消去の復号／admission失敗を成功扱いする

- 根拠: [persistence.ts](../plugins/guilduo-dsh/src/persistence.ts) 105–111行。105行の`clear()`は107行でdecode・admissionの全例外を握りつぶし、レコードを変えずに111行でメモリ上のrevokedを設定する。
- 呼び出し経路: [index.ts](../plugins/guilduo-dsh/src/index.ts) 243–246行のlegacy logout → [settings.ts](../plugins/guilduo-dsh/src/settings.ts) 77–82行。clearがresolveすると、Settingsは通常の切断成功としてstatusを返す。
- 再現条件: 有効な旧未共有grantがある状態で、復号が一時的に失敗する、またはadmissionが例外になる。下記assertionは両ケースで「clear正常終了・保存内容不変」を確認し、復号失敗時のHostControl.logoutでも「disconnected descriptor・旧token残存」を確認した。
- 影響: 接続の利用停止と保存秘密の消去完了を区別できない。tombstoneがlegacy fallbackを止めるため、これだけで認証バイパスが成立するとは言えない。Windows DPAPIの保護も残る。
- 提案: 停止方針の例外として検討する最小修正候補。消去結果を判別し、一時的な復号失敗は安全な消去未完了として返す。別birthや新しいshared sourceへのadmission競合では、削除を強行せず保留／supersededを区別する。
- 確信度: **高**（公開mainと一致する実モジュールで分岐とlogoutを再現）。実DPAPI障害の発生頻度、実profileの残存は確認していない。

### DSH-R2 — P3: 復元期限直前のtoken更新を永続化できない

- 根拠: [index.ts](../plugins/guilduo-dsh/src/index.ts) 146–150行は15秒期限で`session.close()`する。[adapter.ts](../plugins/guilduo-dsh/src/adapter.ts) 105–111行はoperation終了後にgrantを取り出して保存する一方、214–220行のcloseはtokenを消去する。[persistence.ts](../plugins/guilduo-dsh/src/persistence.ts) 99–102行はそのgrantを後でencodeする。
- 再現条件: connect中のrefreshが新tokenをproviderへ保存済み → discoveryが待機 → 復元期限到達 → discovery終了。下記assertionでは、新refresh tokenがRAMに渡った後でも保存側は旧refresh tokenのままになった。
- 既存検査の限界: [persistence.test.ts](../plugins/guilduo-dsh/tests/persistence.test.ts) 521–538行はconnect待機のtimeout／retry、[native-shared-oauth.mjs](../plugins/guilduo-dsh/tests/native-shared-oauth.mjs) 435–456行は期限後のsave拒否を検査する。期限前に成功したrotationの保存は覆わない。
- 影響の限定: 現行公開mainの[worker/src/oauth.ts](../worker/src/oauth.ts) 534、545–549、614行は同じrefresh tokenを再利用する。したがって、現行Guilduoでこの経路から再認証必須になると断定しない。rotationを採用して旧tokenを無効化する契約では認証を失う可能性がある。
- 提案: **観察／次回保守**。SDKの「refresh成功後に後続処理失敗」の保存保証をtimeoutにも拡張する際に、期限前rotation＋失敗の回帰を追加する。取り消されたloginや期限後tokenを公開する修正は避ける。
- 確信度: **高**（保存しない挙動）、**条件付き**（実認証喪失）。SDK／issuerはstub、時計は即時発火。実SDK・実ネットワーク・物理15秒の検証ではない。

### DSH-R3 — P3: stageの出力link検証に抜けがある

- 根拠: [stage.mjs](../plugins/guilduo-dsh/stage.mjs) 21–23行は出力のsymlinkのみ拒否し、`nlink > 1`を拒否しない。25行のLICENSE copyには出力先lstat検証がない。
- 再現条件: stageのSkill出力がhardlink、またはLICENSE出力が別ファイルへのlinkである状態。下記仮想filesystemは`nlink: 2`の出力を受け入れてcopyFileに到達し、LICENSE出力が検査されないことをassertする。
- 影響: そのような作業環境でstageを実行すると、別名で参照されるファイルを上書きし得る。通常のplugin loadにはstageを実行する経路がなく、現在のnpm利用者全員への問題やcredential漏洩とは主張しない。
- 提案: **次回配布前の保守**。SkillとLICENSEを同じ出力先検証に揃え、regular file、symlink、hardlinkを確認する。今回runtime修正や再packはしない。
- 確信度: **高**（検査の抜けとcopy到達）。物理hardlink／symlinkの作成・上書きは行っていない。

## 再実行可能な秘密なし・メモリ内assertion

repo rootのPowerShellで以下を実行する。NodeのVM Modulesを使い、現在のcompiled DSHモジュールを読み込む。公開sourceを読んで作った別実装ではない。必要なhost／SDK／保護／filesystemは明示stubにし、spawn・fetch・tool実行を禁止する。dependency install、実資格情報、profile、モデル、通信、ファイル書き込みを必要としない。VM ModulesのExperimentalWarningは想定内。synthetic token文字列は実資格情報ではなく、出力にも含めない。

```powershell
@'
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const base = resolve('plugins/guilduo-dsh');
const copies = [], checked = [];
let expire;
const forbidden = () => { throw new Error('External action forbidden'); };
const context = vm.createContext({
  URL, Buffer, AbortController, AbortSignal, structuredClone,
  process: { platform: process.platform, env: {} },
  fetch: forbidden,
  setTimeout(fn, ms) { assert.equal(ms, 15000); expire = fn; return 0; },
  clearTimeout() {},
});
function synthetic(exports) {
  return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [name, value] of Object.entries(exports)) this.setExport(name, value);
  }, { context });
}
const cache = new Map();
async function load(specifier, parent) {
  const key = specifier.startsWith('.') ? resolve(parent, '..', specifier) : specifier;
  if (cache.has(key)) return cache.get(key);
  let module;
  if (specifier === '@deepseek-ai/dsh-credentials') module = synthetic({ credentialKey: (a, b) => a + '/' + b });
  else if (specifier === '@deepseek-ai/dsh-session/types') module = synthetic({ SessionId: id => id });
  else if (specifier === '@deepseek-ai/dsh-mcp-client') module = synthetic({ createMcpToolDefinition: forbidden });
  else if (specifier === '@modelcontextprotocol/client') module = synthetic({
    Client: class {}, StreamableHTTPClientTransport: class {}, auth: forbidden,
  });
  else if (key.endsWith('settings-gateway.js')) module = synthetic({ installSettingsGateway: forbidden });
  else if (specifier === 'node:child_process') module = synthetic({ spawn: forbidden });
  else if (specifier === 'node:fs/promises') module = synthetic({
    readFile, realpath: async p => p, mkdir: async () => {},
    readdir: async () => [],
    lstat: async p => { checked.push(p); return { nlink: 2, isFile: () => true, isSymbolicLink: () => false }; },
    copyFile: async (source, target) => { copies.push({ source, target }); },
  });
  else if (specifier.startsWith('node:')) module = synthetic(await import(specifier));
  else {
    module = new vm.SourceTextModule(await readFile(key, 'utf8'), {
      context, identifier: key,
      initializeImportMeta(meta) { meta.url = pathToFileURL(key).href; },
    });
  }
  cache.set(key, module);
  if (module instanceof vm.SourceTextModule) await module.link((name, owner) => load(name, owner.identifier));
  return module;
}
const entry = await load('./lib/index.js', resolve(base, 'entry.mjs'));
await entry.evaluate();
const persistence = cache.get(resolve(base, 'lib/persistence.js')).namespace;
const { createHostControl } = entry.namespace;
const { createGrantStore, createSharedConnections } = persistence;
const records = new Map();
let tail = Promise.resolve();
const credentials = {
  async readRecord(key) { return structuredClone(records.get(key)); },
  modifyRecord(key, mutate) {
    const task = tail.then(async () => {
      const next = await mutate(structuredClone(records.get(key)));
      if (next) records.set(key, structuredClone(next));
      return structuredClone(records.get(key));
    });
    tail = task.catch(() => {});
    return task;
  },
  deleteRecord(key) {
    const task = tail.then(() => records.delete(key));
    tail = task.catch(() => {});
    return task;
  },
};
const protection = { async protect(value) { return value; }, async unprotect(value) { return value; } };
const token = name => ({ access_token: 'SYNTHETIC_' + name, refresh_token: 'SYNTHETIC_REFRESH_' + name, token_type: 'Bearer' });
const id = 'synthetic-review-root';
const session = { id, header: { id, createdAt: 2, isSeeded: false } };
const agent = { id, session };
const ctx = {
  credentials, agents: { get: key => key === id ? agent : undefined, roots: () => [agent] },
  sessions: { get: key => key === id ? session : undefined },
  sessionController: { async resolveAgent() { return { agent }; } },
  get(name) { return this[name]; }, on() {},
};
for (const condition of ['decrypt', 'admission']) {
  const saved = createGrantStore(credentials, id, 2, () => true, protection);
  await saved.save({ tokens: token(condition) });
  const before = JSON.stringify([...records]);
  const store = createGrantStore(credentials, id, 2, () => true,
    condition === 'decrypt' ? { ...protection, unprotect: async () => { throw new Error('Synthetic decrypt failure'); } } : protection,
    condition === 'admission' ? async () => { throw new Error('Synthetic admission failure'); } : async () => {});
  await store.clear();
  assert.equal(JSON.stringify([...records]), before);
  assert.equal(store.isLive(), false);
}
const logout = createHostControl(ctx, { protection: { ...protection, unprotect: async () => { throw new Error('Synthetic decrypt failure'); } } });
await logout.logout(id);
assert.equal((await createSharedConnections(credentials).read()).state, 'disconnected');
assert.equal((await createGrantStore(credentials, id, 2, () => true, protection).read()).tokens.access_token, 'SYNTHETIC_admission');
await logout.dispose();
console.log('PASS P2: clear/logout resolve but legacy secret material remains on decrypt/admission failure.');

records.clear();
const source = createGrantStore(credentials, 'synthetic-source', 1, () => true, protection);
await source.save({ tokens: token('OLD') });
await createSharedConnections(credentials).publish('synthetic-source', 1, undefined, async () => {});
const entered = Promise.withResolvers(), gate = Promise.withResolvers();
let provider;
const control = createHostControl(ctx, {
  protection, authorize: forbidden,
  transport(value) { provider = value; return { start: async () => {}, send: async () => {}, close: async () => {} }; },
  client() { return {
    async connect() { await provider.saveTokens(token('ROTATED')); },
    async listTools() { entered.resolve(); await gate.promise; return { tools: [] }; },
    callTool: forbidden, close: async () => {},
  }; },
});
const restoring = assert.rejects(control.restore(id), /restoration timed out/);
await entered.promise;
assert.equal(typeof expire, 'function');
expire();
await restoring;
gate.resolve();
await tail;
assert.equal((await source.read()).tokens.refresh_token, 'SYNTHETIC_REFRESH_OLD');
await control.dispose();
console.log('PASS P3: timeout after successful in-memory rotation preserves old durable token.');

const stage = await load('./stage.mjs', resolve(base, 'entry.mjs'));
await stage.evaluate();
assert.ok(copies.some(row => row.target.endsWith('SKILL.md')));
assert.ok(copies.some(row => basename(row.target) === 'LICENSE'));
assert.ok(checked.length > 0);
assert.ok(!checked.some(path => basename(path) === 'LICENSE'));
console.log('PASS P3: mocked hardlinked Skill targets accepted; LICENSE copied without lstat.');
console.log('Boundary: actual DSH modules, synthetic host/SDK/protection/filesystem; no disk writes, network, model, profile or credentials.');
'@ | node --experimental-vm-modules --input-type=module
```

今回の実行結果（exit 0）:

```text
PASS P2: clear/logout resolve but legacy secret material remains on decrypt/admission failure.
PASS P3: timeout after successful in-memory rotation preserves old durable token.
PASS P3: mocked hardlinked Skill targets accepted; LICENSE copied without lstat.
Boundary: actual DSH modules, synthetic host/SDK/protection/filesystem; no disk writes, network, model, profile or credentials.
```

## 受け入れと他hostへの引き継ぎ

この検査範囲でP1は裏付けられなかった。P2は消去失敗の誤成功表示という限定的な修正候補であり、DSH追加機能を再開する根拠にはしない。P3は観察／次回保守に回す。

[現行status](guilduo-dsh-status.md) 22–27行の設定なし初回入力、新規／root fork、Web/Desktop共有、実refresh／失効／再接続、限定Quest更新readback・duplicate no-op・競合、Registry Agent Handoff、Human回答→再開は受け入れ未完了。これらは未検証／policy boundaryであり、今回再現したruntime failureと混同しない。

OpenCode／OpenClawはhost-owned OAuthを維持し、DSHの独自credential storeを移植しない。実モデルphaseSyncの受け入れは、明示binding・read-only／取消・正しいAgent／Quest・限定patch・readbackを含める。OpenClawのoperator共有認証はchannelの別利用者の権限を証明しない。npm／公式Ecosystem／ClawHub掲載、Windows実機、実workflow、外部の人間による監査はそれぞれ別の証拠を必要とする。

## OpenCode / OpenClaw beta.16 公開前の独立再確認

確認時点: 2026-10-10 06:21 UTC、native-model driverのみ並行更新後の06:25:18 UTCに再照合。対象は共有実装checkout内の候補source、生成lib、stage、README英日、package manifest、検証driverとrootのtracked差分。**この範囲では新規P1/P2を再現していない。最終tgzの承認ではない。** driverはレビュー中も更新されており、以下は時刻／hashで限定したsnapshot。親の最終handoff後に別途再照合する。

### 06:21 UTC snapshotの確認済み事実

- OpenCode [src/index.ts](../plugins/guilduo-opencode/src/index.ts) 26–31、76–85、107–129行と実libをVMで実行し、既定OFFと同一入力のidle二回から補助prompt一回のみを確認した。SDKは録画stubであり、実モデル要求はゼロ。sourceのSHA-256は前回確認と同じ。停止・permission・fork等の広い分岐は前回の19 assertion記録であり、今回すべてを再実行したとはしない。
- [native-key.mjs](../plugins/guilduo-opencode/tests/native-key.mjs) 5–41行を実sourceのまま、合成streamで実行。3文字chunk、引用符／backslash、nested metadataを含む選択entryを取得し、不在・OAuth型・空keyを拒否した。実authファイルは読んでいない。
- OpenCode [stage.mjs](../plugins/guilduo-opencode/stage.mjs) 7–14、23–33行、OpenClaw [stage.mjs](../plugins/guilduo-openclaw/stage.mjs) 7–15、24–34行を合成filesystemで実行。両方とも出力ancestor linkとSkill／LICENSEのhardlinkを拒否した。物理junctionの新規検査や並行差替え耐性の証明ではない。OpenClaw source側29行はnlinkを検査しないが、copy元を読むだけであり、出力owner破壊の再現とは扱わない。
- OpenClaw [src/index.ts](../plugins/guilduo-openclaw/src/index.ts) 4–9行は空register、現在のlibはsourceと同一bytes。[setup.mjs](../plugins/guilduo-openclaw/setup.mjs) 7–31、39–46行は既存alias／設定を保存し、標準create-only addを使い、native失敗outputを表示しない。前回の設定検査PASSを今回のnative実行に読み替えない。
- [OpenCode package.json](../plugins/guilduo-opencode/package.json) 9–13行、[OpenClaw package.json](../plugins/guilduo-openclaw/package.json) 12–24行は明示files allowlist、consumer install hookなし。現在の明示対象tree計30ファイル（package.json含む）を読み取り確認し、通常のsingle-link file、Skill／references／OpenClaw agents metadata／LICENSEの正本byte一致を確認。QA/tests/state/cacheをallowlistへ含めない。npm packの暗黙選択や最終archive member／digestは未確認。
- README英日の導入、update、rollback、logout／remove、権限、課金説明を確認。[OpenCode English](../plugins/guilduo-opencode/README.md) 19、59–67、88–111行は専用npm prefix、補助停止と実モデル中断の違い、OAuth／task許可／server失効の区別を記載。[OpenClaw English](../plugins/guilduo-openclaw/README.md) 18–30、40–64行はalias、Accountsのname/URL、共有operator境界、connection probe、削除の区別を記載。公式入口はpublic-urls方針と一致。GitHub main上の新文書URLの配信成立は再検証していない。
- root tracked差分は [PROJECT_SPEC.md](../PROJECT_SPEC.md) 234行、[README.md](../README.md) 219行、[README.jp.md](../README.jp.md) 219行、[ROADMAP.md](../ROADMAP.md) 3行の拡張案内。root依存／lockfile／DSH runtimeのtracked変更はない。untrackedの両plugin、tests、関連文書は別途存在し、tracked diffだけで全変更を確認したとはしない。DSHの既記録source／stage／lib計7hashも再一致。

### B16-E1 — 旧snapshotのP3: read集計の証拠不足（現sourceで是正）

- 証拠: [native-model.mjs](../plugins/guilduo-opencode/tests/native-model.mjs) 110–117行は両readを一つの `reads` に集計し、196–197行は `reads >= 2` とwriteゼロだけをassertする。`actingAgentId` は検査するが `get_quest` の `questId` 一致は検査しない。06:25:18 UTCの並行更新でもhandlerとこの条件は維持されている。
- 再現条件: 実fixture handlerをネットワークなしで呼び、同じ合成context readを二回送る。Quest readゼロでもこの集計条件が成立した。モデルが実際にこの動作をしたとは主張しない。driver全体のPASSも生成していない。
- 対応／現在: 旧snapshotではtool別countとexact Quest/Agent tupleの記録・assertが必要だった。現driver 116–121、200–202行にはtool別count・Quest ID照合・native成功history検査が追加された。下の再現コードも現在の個別gateを前提に更新した。これは証拠の不足の是正であり、runtime認可回避や誤Quest更新の再現ではない。確信度: 高（実source／handler確認）。

### Gateと限界

[native-model.mjs](../plugins/guilduo-opencode/tests/native-model.mjs) 13–16、22–34、82–98、160–186、203–225行は明示costフラグ、固定Goモデル、隔離env、120秒case期限、abort／所有host終了、key redactionと診断ファイル検査を設ける。140–144行の初回config bootstrapは実モデルcaseとは別の180秒期限、206行のnative ERROR bodyは固定文へ置換する。これは静的確認であり、実process終了・資格情報非永続化・課金・再試行を新たに実証したものではない。実key／hostログ／auth DB／model outputは読まず、native/OAuth/model検査を重複実行していない。

[OpenCode証跡](guilduo-opencode-native-evidence.md) 3–8行、[OpenClaw証跡](guilduo-openclaw-native-evidence.md) 3–8行は旧版を明示する。現行[公開status](guilduo-host-extensions-status.md) 9–13行はnpm、公式listing、public OAuth、guarded update/readback、Human再開をPendingとする。過去のnative成功をbeta.16最終archiveや公開サービスの合格に転用しない。モデルloopbackと公開Quest／Human往復、shared OAuthとchannel別利用者認可、submissionと掲載完了は別gateを維持する。DSHはP2の限定修正候補／P3の観察という既存分類を維持し、runtime凍結を変更しない。外部人間監査の主張はない。

### 再現用・RAMのみのbeta.16 assertion

repo rootで実行する。sourceとlib／driver／stageを読むだけで、provider認証は合成文字列、SDK／filesystem／HTTP serverはstub。NodeのVM modulesとTypeScript strippingの実験警告は出る。これはnative受入の代替ではない。

```powershell
@'
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
const base = pathToFileURL(resolve('.') + '/');
async function moduleAt(path, deps, types = false) {
  const url = new URL(path, base), text = await readFile(url, 'utf8');
  const mod = new vm.SourceTextModule(types ? stripTypeScriptTypes(text) : text,
    { identifier: url.href, initializeImportMeta(meta) { meta.url = url.href; } });
  await mod.link(async id => {
    assert.ok(Object.hasOwn(deps, id), 'Unapproved import: ' + id);
    const values = deps[id];
    const stub = new vm.SyntheticModule(Object.keys(values), function () {
      for (const [name, value] of Object.entries(values)) this.setExport(name, value);
    });
    await stub.link(() => { throw Error('Unexpected dependency'); }); await stub.evaluate();
    return stub;
  }); await mod.evaluate(); return mod.namespace;
}
let content;
const { selectedGoKey } = await moduleAt('plugins/guilduo-opencode/tests/native-key.mjs', {
  'node:fs': { createReadStream() { return (async function* () {
    for (let i = 0; i < content.length; i += 3) yield content.slice(i, i + 3);
  })(); } },
});
const fake = 'public-fixture-"\\-key';
content = JSON.stringify({ other: { key: 'unrelated-public-fixture', nested: [{ a: '},\\"' }] },
  'opencode-go': { type: 'api', key: fake, metadata: { nested: [] } } });
assert.equal(await selectedGoKey('memory-only'), fake);
for (content of ['{"other":{"key":"public-fixture"}}',
  '{"opencode-go":{"type":"oauth","key":"public-fixture"}}',
  '{"opencode-go":{"type":"api","key":""}}']) await assert.rejects(selectedGoKey('memory-only'));
console.log('PASS selected native entry: chunk/escape handling and missing/type/empty denial.');
for (const host of ['opencode', 'openclaw']) {
  for (const hazard of ['LICENSE-hardlink', 'Skill-hardlink', 'directory-link']) {
    const copies = [], plugin = resolve('plugins/guilduo-' + host);
    const license = resolve(plugin, 'LICENSE');
    const skill = resolve(plugin, 'skills/guilduo-workflows/SKILL.md');
    const folder = resolve(plugin, 'skills');
    const deps = {
      'node:url': await import('node:url'), 'node:path': await import('node:path'),
      'node:fs/promises': {
        realpath: async value => resolve(value), mkdir: async () => {},
        readdir: async path => [String(path).endsWith('agents') ? 'openai.yaml' : 'tools.md']
          .map(name => ({ name, isFile: () => true })),
        lstat: async path => {
          const file = path.endsWith('LICENSE') || /\.(md|yaml)$/.test(path);
          return { isFile: () => file, isDirectory: () => !file,
            isSymbolicLink: () => hazard === 'directory-link' && path === folder,
            nlink: (hazard === 'LICENSE-hardlink' && path === license) ||
              (hazard === 'Skill-hardlink' && path === skill) ? 2 : 1 };
        },
        copyFile: async (from, to) => { copies.push(to); },
      },
    };
    await assert.rejects(moduleAt('plugins/guilduo-' + host + '/stage.mjs', deps), /Linked/);
    assert.ok(!copies.includes(hazard === 'LICENSE-hardlink' ? license : skill));
  }
}
console.log('PASS both stages: linked ancestors and hardlinked Skill/LICENSE outputs denied in RAM.');
const cwd = 'memory-fixture', endpoint = 'https://mcp.guilduo.com/mcp';
const binding = { sessionId: 'session-fixture', questId: 'quest-fixture', actingAgentId: 'agent-fixture', cwd };
for (const path of ['plugins/guilduo-opencode/src/index.ts', 'plugins/guilduo-opencode/lib/index.js']) {
  const { default: plugin } = await moduleAt(path,
    { 'node:fs/promises': { realpath: async x => x }, 'node:url': await import('node:url') },
    path.endsWith('.ts'));
  let calls = 0;
  const client = { session: {
    get: async () => ({ data: { id: binding.sessionId, directory: cwd } }),
    promptAsync: async ({ body }) => { calls++; assert.equal(body.parts[0].synthetic, true); },
  } };
  const drive = async hooks => {
    await hooks.config({ mcp: { guilduo: { type: 'remote', url: endpoint } } });
    await hooks['chat.message']({ sessionID: binding.sessionId },
      { message: { id: 'message-fixture', agent: 'build' }, parts: [{ type: 'text', text: 'fixture' }] });
    await hooks.event({ event: { type: 'message.updated', properties: { info: {
      sessionID: binding.sessionId, role: 'assistant', parentID: 'message-fixture', mode: 'build',
      path: { cwd }, finish: 'stop', time: { completed: 1 } } } } });
    for (let n = 0; n < 2; n++)
      await hooks.event({ event: { type: 'session.idle', properties: { sessionID: binding.sessionId } } });
  };
  await drive(await plugin({ client, directory: cwd }));
  assert.equal(calls, 0);
  const hooks = await plugin({ client, directory: cwd }, { phaseSync: binding });
  await drive(hooks); assert.equal(calls, 1); await hooks.dispose();
}
console.log('PASS actual OpenCode source/lib: default OFF; one synthetic reminder after two idle events.');
console.log('Boundary: no filesystem mutation, credential reads, network, subprocess or model.');

const driver = await readFile(new URL('plugins/guilduo-opencode/tests/native-model.mjs', base), 'utf8');
const start = driver.indexOf('  fixture = createServer(');
const end = driver.indexOf('\n  fixture.listen(', start);
assert.ok(start >= 0 && end > start);
let handler;
const box = { assert, inputSchema: {}, createServer(fn) { handler = fn; return {}; } };
vm.runInNewContext('let contextReads = 0, questReads = 0, writes = 0, fixture;' + driver.slice(start, end)
  + ';globalThis.counts = () => ({contextReads, questReads, writes});', box);
for (let n = 0; n < 2; n++) {
  const req = { method: 'POST', url: '/mcp', async *[Symbol.asyncIterator]() {
    yield JSON.stringify({ id: n + 1, method: 'tools/call',
      params: { name: 'get_current_agent_context', arguments: { actingAgentId: 'fixture-agent' } } });
  } };
  let response;
  await handler(req, { setHeader() {}, writeHead(code) { assert.notEqual(code, 400); },
    end(body) { response = JSON.parse(body); } });
  assert.ok(response.result);
}
assert.equal(box.counts().contextReads, 2);
assert.equal(box.counts().questReads, 0);
assert.match(driver, /assert\.ok\(questReads >= 1/);
assert.equal(box.counts().writes, 0);
console.log('PASS corrected evidence gate: two context reads cannot satisfy the separate Quest-read requirement.');

'@ | node --experimental-vm-modules --input-type=module
```

確認結果: selector、両stage、実OpenCode source/lib、是正後のB16-E1個別gate確認がPASS（model/OAuth/network/subprocess/disk writeはゼロ）。

### 照合用SHA-256（06:21 UTC、driverは06:25:18 UTC snapshot）

| file | SHA-256 |
| --- | --- |
| `plugins/guilduo-opencode/tests/native-model.mjs` | `d6f0fac4bb6d54320833e94e5352e875a61128e6f3ac7795729cb25c614516c1` |
| `plugins/guilduo-opencode/tests/native-key.mjs` | `2d1fc45eb440f7f26eb7e279a11516d7f7e1847c094a2e032f80311d38719757` |
| `plugins/guilduo-opencode/src/index.ts` | `9a4a3aaa3ac6433c58efaba128d792105e6fbffe95a7e92cb6c8a48d4219157c` |
| `plugins/guilduo-opencode/lib/index.js` | `cb0217aac2798fd994099fb9b9dc3ceeba507917ba50a1e984a0d99702a4dfc0` |
| `plugins/guilduo-opencode/stage.mjs` | `f6d785b87f1ed72d195d9e2cb142cf32731ffd2d1c7a33c177b5b3e85afabc4c` |
| `plugins/guilduo-openclaw/src/index.ts` / `lib/index.js` | `dd811bff4a099b2c4dad09bb83803cd382b9ebcb8f4b6168e0d405525d93ec0a` |
| `plugins/guilduo-openclaw/setup.mjs` | `27e9b19213eca56290b46db49d18d1460d587944c4cf164a39cc1f18331e228b` |
| `plugins/guilduo-openclaw/stage.mjs` | `7275be466e9378c51fe27fe334703758df164bb5baaf94e00b067c86b05e2956` |

## 配備済みMCPとの互換性の再評価（親の訂正・live通知反映）

2026-10-10追補。ここからは前節の06:21／06:25 snapshotより新しい証拠と訂正を扱う。新規P1/P2のruntime不具合は、この証拠からは成立しない。公開sourceだけを根拠にした「配備済みMCPはactingAgentId／version guard非対応」という推定は採用しない。

- **独立に検証した公開source:** 未認証GitHub readでmain `329ae07ca04cd31dcc91c3bb05f6e2ada8951bd4` の `api/mcp-tools.json`、`worker/src/index.ts`、`worker/src/mcp-server.ts`、`worker/src/agent-store.ts` が共有checkoutと同一であることを確認。schemaのSHA-256は `92d0ebe6bce49bdbb25d7b2967e95ea02ff71b6a6603a469621ed7f5bf1e0fa0`。[mcp-tools.json](../api/mcp-tools.json) 2347–2358、2787–2791行はactor追加を宣言せず、[index.ts](../worker/src/index.ts) 804–821、1533–1548行はclientにlinkされたidentityを使う。ただしこれは公開source snapshotであり、配備中のschema／実装の完全な代表ではない。
- **親からのlive証拠（このreviewerによる再実行ではない）:** 初回の未リンクcontext／Quest readはoutputSchema error。その後、所有者が承認した既存Agentへのnative `link_agent` 後、**同じactingAgentId付き引数**のcontextとexact Quest readが成功した。contextは `allowedAgentIds` と `requiresAgentSelection` を実際に返し、許可Agent数1・selection不要・返却 `agent.agentId` と指定Agent一致、Questも指定・割当先と一致した。private receipt／資格情報は読んでいない。引数拒否を原因とする判定は取り下げる。未リンクerror bodyの処理はhosted MCP側の別scope。
- **受入scope:** 上記は指定Agentへlink済みの専用接続を支持する。複数Agentのshared接続で要求actorを切り替え、許可／不許可actorを選別する実行は未検証。`actingAgentId`付きcallの成功や許可数1のcontextは、そのarbitrationや複数人channel認可の証拠にならない。これは未受入条件であり、他Agentへの実誤書込みを再現したというP1/P2所見ではない。
- **候補guide:** [OpenCode src](../plugins/guilduo-opencode/src/index.ts) 11、26–31、123–127行はexact Agent bindingと再照合を指示する。[正本Skill](../skills/guilduo-workflows/SKILL.md) 40–41行はselection必須のときのみallowed IDを選び、single-Agent接続では承認済みexact既存IDのlinkを認める。[phase-sync](../skills/guilduo-workflows/references/phase-sync.md) 9–10行はshared接続をglobal relinkして切替えることを禁止する。導入guideは専用接続の未リンク確認→所有者の明示承認→既存Agentへのlink→context／Quest一致確認を説明すべきで、shared actor切替にlinkを流用しない。
- **planへの影響:** 「新APIを追加しない」「shared実行ではactorを指定する」の矛盾は、古い公開source grepからは立証できない。live schema/contextを正本にし、selection必須時は許可IDと指定actorを再照合する。必要なselectionやguardがlive側で確認できなければそのworkflowをpending／停止に保ち、actor省略・global relink・無guard writeへ自動fallbackしない。公開のguarded update/readback／Human再開／cross-Agent shared selectionは、source/package reviewと別gateのまま。
- **B16-E1の是正確認:** [native-model.mjs](../plugins/guilduo-opencode/tests/native-model.mjs) 116–121、200–202行はcontext／Quest別count、exact input／returned Quest ID、成功したnative historyを検査する。[native-phase-reads.mjs](../plugins/guilduo-opencode/tests/native-phase-reads.mjs) 3–9行を秘密なし純関数assertionで実行し、両read成功を通し、context重複だけ／誤返却Quest／error状態を拒否した。旧P3はsource上是正。親は両host各4caseの実Go loopback PASSを通知したが、このreviewerは実modelを再実行していない。

この追補時点では確定hash待ちで、最終archiveの承認はしていなかった。その後の照合結果は次節。Worker、DSH runtime、他のファイルは変更していない。

## 旧hashのsource／archive gate — 歴史的PASS（LF再pack前）

確認: 2026-10-10 06:38 UTC以降。同じ独立AIレビュアーによるsource PR準備のgateであり、外部人間監査・npm公開・ClawHub掲載・すべてのpublic workflow受入を意味しない。候補の未解決P1/P2は、この確認範囲ではなし。DSH-R1の既存P2は凍結したDSHへの独立FBで、今回のhost候補に移植した不具合ではない。

| 確定tgz | SHA-256 | 独立確認 |
| --- | --- | --- |
| `plugins/guilduo-opencode/artifacts/guilduo-opencode-plugin-0.6.0-beta.16.tgz` | `36c56bc6bcd0674d9d0db077794c69bab43d9b19db737a945f73fe276a643321` | 14 regular members、全byteが現在の明示package sourceと一致 |
| `plugins/guilduo-openclaw/.qa-artifacts/guilduo-openclaw-plugin-0.6.0-beta.16.tgz` | `2112722a244897ec781aa54ebd0e24f8a076a77d9ad709342efccd9eb9d5fef0` | 16 regular members、全byteが現在の明示package sourceと一致 |

gzip／tarをメモリ内で読み、header checksum、member path、重複、非regular member、明示files allowlistとの完全一致、各memberのsource byte一致をassertした。tests・QA homes・cache・node_modules・認証state・archive自身は収録されていない。ファイル展開・install・npm packは実行していない。

OpenCodeのREADME以外12ファイルは、両hostの実Go検査に使われた隔離packageの該当source／runtime／Skill／LICENSE等と直接byte比較して一致した。OpenClawはimmutable `runtime-tested-beta16-9798f06b.tgz` のhashを確認し、最終tgzとの変更がREADME英日二枚だけで、他14ファイルが同一であることを確認。途中のOpenClaw文書hash `9798f06b...` と更新済みtgzの差はREADME変更後の同期で解消し、未解決不具合として残さない。

### Git公開範囲のprivacy gate

[OpenCode .gitignore](../plugins/guilduo-opencode/.gitignore) 1–4行は `artifacts/`、`.qa-artifacts/`、`node_modules/`、`package-lock.json`、[OpenClaw .gitignore](../plugins/guilduo-openclaw/.gitignore) 1–4行は `.qa-artifacts/`、`reports/`、`node_modules/`、`package-lock.json` を除外する。

各規則の配下を合成pathで `git check-ignore --no-index -v` に渡し、8項目すべてを確認。該当QA/cache/reports/node_modulesの `git ls-files --stage` は空、`git diff --cached --name-only` も空。 `git ls-files --others --exclude-standard` の候補一覧はsource／文書／helper／test／manifest／ignoreのみで、QA artifactやprivate stateは入っていない。これはnpm.filesとは別のGit公開範囲検査で、credentialsやprivate browser／OAuth stateの本文を読む必要はなかった。indexを変更していない。

### READMEと受入証拠の最終評価

[OpenCode English README](../plugins/guilduo-opencode/README.md) 46–51行（日本語28–31行）に、専用接続でのlink確認、所有者が承認した既存Agentへの `link_agent`、Agent／Quest一致、live selection条件、shared global切替禁止が追加された。[OpenClaw English README](../plugins/guilduo-openclaw/README.md) 42–44行（日本語38–40行）もowner承認・既存Agent・必要OAuth grant・native再認可・context／Quest readを説明する。これらは新Agent登録／新API／自動linkを導入しない。共通Skillのshared切替禁止とsingle-Agent導入を区別したscopeを維持する。

OpenCodeの両実Go `evidence.json` と補強した `required-reads-evidence.json` の検査票を読み取り確認。両hostで4case PASS、accepted archive hash `835a02cd35b1f70700dabd9dfd0cbaaa3ab4ea594a9cde178bde2d5470e99da1`、hostStopped=true、credentialPersistence=NONE、context／Quest各成功1回、返却Quest ID一致を記録する。これは既存receiptの確認であり、実モデル・native検査の再実行ではない。native DB／authファイル／生transcriptは読んでいない。B16-E1はsource是正と実成功historyの補強receiptでcloseできる。

親は、ユーザーのpublic Human回答後、同じnative Go sessionで保存feedbackを読み、guarded nextAction update/readbackに成功したと追加通知した。このlive証拠は親のprivate receiptに属し、あーしは再実行・private receipt閲覧をしていない。public-main sourceと配備契約の差からunsupported判定へ戻さない。複数Agent shared selection・複数人channel・OpenClaw Human再開・継続refresh／失効の全面受入やnpm／listing完了は、この通知から拡張して主張しない。

root tracked差分は拡張案内／scope／statusへの参照で、依存・lockfile・Worker・DSH runtimeの変更はない。公開・受入台帳が各hostのlive結果とpending項目を分ける前提で、**このsourceと上記hashのarchiveについてsource PR準備へ進める**。PR作成／merge、npm／ClawHub publicationは親の別工程。以後archiveや収録sourceを変更した場合、このhashに対するPASSは新bytesへ自動継承しない。

## 最終handoffの更新 — archive承認HOLD

2026-10-10、親からGit LF正規化とREADME末尾whitespaceの調整・再pack通知を受領。上記06:38 UTC以降のPASSは旧hashのsnapshotに限定し、**正規化後のsource／Git index／再pack tgzが一致するまで最終archive承認をHOLDする**。旧hashのPASSを新候補へ継承しない。

親の通知では変更対象はOpenCode package.json／tsconfig、OpenClaw stage.mjs、READMEのEOL／helper／文書bytesで、compiled runtime source/libは不変。新hashと収録bytesの再照合は未完了。OAuth／モデルを再実行する必要性はこの通知からは生じない。DSH P2は引き続きfeedbackのみ。

## LF再pack後の最終source／archive gate — PASS（実行受入は別gate）

独立確認: 2026-10-10 06:48 UTC以降。**下記hashのpackage payload／公開sourceについてHOLDを解除する。この範囲の未解決P1/P2所見はなし。** workerが実行中のfresh native smoke、公開APIのno-op／競合、npm・公式掲載の完了判定とは別であり、外部人間監査ではない。

| archive（前節と同じpackage内path） | SHA-256 | 全memberの照合 |
| --- | --- | --- |
| OpenCode `guilduo-opencode-plugin-0.6.0-beta.16.tgz` | `6fe013ae72b80e47d8846b2c20b0e4d42a749ce03ea142ef3d9243410e870d2c` | 14 regular files、worktreeとGit index blobの両方に完全一致 |
| OpenClaw `guilduo-openclaw-plugin-0.6.0-beta.16.tgz` | `46c3fb454ac179807148c090f9730f8a2f77576f9fdbd8d20d4584508eaea678` | 16 regular files、worktreeとGit index blobの両方に完全一致 |

- **payload／正本:** gzip／tarをRAMだけで読み、hash、header checksum、安全なmember path、重複なし、regular fileのみ、package.jsonの明示filesとの完全一致をassert。各memberを作業ファイルおよび `git cat-file blob :<repository-relative-path>` のbinary stdoutと比較した。収録Skill／references／OpenClaw agents metadataとLICENSEは、repository正本の作業byteとindex blobにも一致。ファイル展開、install、pack、Git mutationは行っていない。
- **実Go検証版との関係:** OpenCodeの1.18.32／1.18.35隔離installed packageと全14memberを比較し、変更はREADME二枚とpackage.json／tsconfig.jsonのみ。後者二枚はCRLF→LFだけで、他10memberは同一。OpenClawのimmutable実行検証archive `9798f06b1c549b03a79c7de31bf09dd2a7d66878224382573a8ad4ad1b51fec1` との変更はREADME二枚とstage.mjsだけ。stageはEOL／末尾空行のみで、他13memberは同一。両候補のsrc／compiled libとOpenClaw setupは前回検証hashのまま。これをfresh smokeの実行済み証拠へ読み替えない。
- **Git公開範囲:** 現indexのstaged 59pathを確認し、artifacts／.qa-artifacts／reports／node_modules／lockfileは含まれない。該当directoryの `git ls-files --stage` は空、8合成pathの `git check-ignore --no-index -v` は各host `.gitignore` 1–4行に一致、`git diff --cached --check` はPASS。root差分はPROJECT_SPEC・README英日・ROADMAPの拡張案内／受入境界で、DSH・Worker・依存runtime変更はない。private QA本文は読んでいない。
- **README／consumer境界:** 相対リンクとanchorは収録package内で解決し、GitHub main向けrepository文書は候補source内に存在する。正規URL policyに反するlinkはなし。ただしremote HTTP応答を今回取得しておらず、新sourceのmainリンクはPR mergeに依存する。manifest／compiled ESM entry／exports／OpenCode types／LICENSE／NOTICEを確認。consumer buildやinstall lifecycleはなく、runtime dependenciesもない。OpenCodeはNode >=22、OpenClawは >=24.16.0 <25 または >=26.1.0と任意peer OpenClaw 2026.9.9を要求し、SDK importは既知の `openclaw/plugin-sdk/plugin-entry`。このreviewerはnpm installをしていない。
- **秘密の範囲:** QA／認証state／cache／tests／node_modulesを収録しないallowlistを確認し、収録textにprivate-key headerおよび既知形式のGitHub／OpenAI literal key patternは検出しなかった。全形式のsecret不存在を保証する監査ではない。資格情報・native DB・生historyを読まない。

### 受入証拠の追加とno-op判定の訂正

既存のsanitized `plugins/guilduo-openclaw/.qa-artifacts/browser-77x7xL/receipt.json` を独立に読んだ。pinned host 2026.9.9、result=passed、modelRequests=0、Accounts表示・synthetic browser OAuth PKCE・Edit Settings・native probe・保存OAuthを使うSDK実行・logoutを記録する。`gateway-http-configured-mcp-status-404` は直接HTTP経路が利用不可だった記録で、成功したtool実行とは数えない。receipt自体もpublicOAuth=unverifiedであり、公開サービスの認証／refresh全面受入には拡張しない。browser／OAuth／modelを再実行していない。

親の最新live通知は、OpenClaw embedded Goによる保存Human回答のread／resumeが成功し、指定provider／model、一回の成功attempt、fallbackなし、tool failureなしだったことを示す。OpenCodeのnative no-op／stale guard reject／rereadも親がPASSを通知した。private receiptは読まず、独立再現とは区別する。

**公開update_questにserver自動idempotencyを要求・推定しない。** 親はfresh versionで同じnextActionを直接writeしてもupdatedAtが進むことを確認し、OpenClaw SDKの「同値writeでもversion不変」というassertionは失敗・受入除外と通知した。正本 [phase-sync](../skills/guilduo-workflows/references/phase-sync.md) 21、28–29、35–36行は、同値ならwriteを省略し、競合・不確実write後はfresh readを求める。このAgent判断が契約であり、APIの自動重複排除とは別。後続の親live通知ではOpenClaw embedded Goが同値を検出して全writeを省略しversionを維持し、native SDKのstale write拒否→fresh rereadで保存field／version一致もPASSした。OpenCodeも同様の親PASS通知あり。両hostのno-op／stale guardはこの通知のscopeで親検証済みに更新し、独立再実行とはしない。Hosted API変更はscope外。

両専用接続の成功はcross-Agent shared selection／複数人channel認可を証明しない。DSH-R1 P2は凍結runtimeへのfeedbackのみ。**source PR準備と上記hashのarchive内容reviewは通過**し、fresh native smoke・未完了public受入・公開registry取得byte・npm／listingは担当者の別gateに残す。以後収録byteまたはindexを変更した場合は再照合が必要。この追補はreview docのworktreeだけを更新するため、親がsource PRへ取り込む際は最新本文をindexへ反映する。

## Source commit後の追加review — QA helperと親live証拠

2026-10-10追補。独立readでsource commit `11c960e14d8a6276e9304abfff897ae2c1616415` の変更60pathを確認し、QA artifact／profile／reports／node_modulesは含まれない。前節の最終tgz hashは不変で、OpenCode全14member／OpenClaw全16memberを**commit blob**と再比較して完全一致した。追加 [native-expiry-qa.mjs](../plugins/guilduo-openclaw/tests/native-expiry-qa.mjs) は同commitのbyteと一致し、tgz／runtime import／npm.filesには含まれない。package gateのPASSは維持するが、新しいsource QA helperには以下の条件付きP2を付記する。

### [P2・解決済み] B16-Q1 — QA root自体がjunctionのときpackage外DBを許す（発見時snapshot）

- **発見時source・条件:** commit `11c960e` のhelper 53–56行は `.qa-artifacts` 自体をrealpathし、解決先を許可rootにした。QA rootのsymlink／junction拒否やpackage内への包含を検査しなかった。このrootがpackage外のprofile親へjunctionで向き、既存のprofile／state／DBが通常fileなら、旧63–68行の子path検査も通り、旧69行のDB openおよびexpiry変更へ進んだ。現在の修正とclose証拠は末尾の追補。
- **再現・影響:** 秘密なしRAM mockで実helperのpath admissionを実行し、package外を指すQA rootでもDB openへ到達した。DB／native identity／build読取りは合成mock、SQLのdisk実行・資格情報読取り・実junction作成はしていない。実事故やcredential exportの証拠ではないが、実DBを持つ外部profileへ誤ってexpiry注入できる境界欠陥。
- **現在・confidence:** 高（現source分岐とRAM再現一致）。現在の作業treeのQA root metadataは非symlinkであり、今回親が利用したrootの境界逸脱は立証していない。未収録QA helperの条件付き欠陥で、shipped runtimeのP2へ拡張しない。
- **対応案:** helper再利用前にpackageの実root配下へのQA root包含を検査し、QA root自体／必要な祖先のjunctionを拒否する。修正までは非linkの専用QA rootに限定して使用する。あーしはhelperを変更しない。

**支持される安全性と限界（発見時commitの行番号）:** 9–17行のSQLはbound store key、format=1、JSON objectとrefresh token、challenge不在を条件にexpiry列だけを更新し、RETURNINGもscalar expiryだけ。19–30行は不成立／複数row時にrollback、52行はexplicit flags、59–61行はpinned host commitとofficial operator identity、63–68行はDB側ancestor link／hardlinkを拒否する。`node plugins/guilduo-openclaw/tests/native-expiry-qa.mjs --self-test` を実行し、合成in-memory SQLiteでexpiry以外の保存、他row不変、missing／unknown format／non-JSON拒否がPASSした。DB tokensはJSへexportしない。なお `--profile-stopped` は呼出者の申告であり実process停止を検証せず、native leaseも迂回する。専用profileの停止／排他運用が前提という既知policy境界であり、今回のrace実害を再現した所見ではない。

発見時再現コード（repository rootでNode実行、旧commit source以外はすべてRAM mock。修正後の現sourceの再現ではない）:

```js
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import vm from 'node:vm';
const path='plugins/guilduo-openclaw/tests/native-expiry-qa.mjs';
const text=execFileSync('git',['cat-file','blob','11c960e:'+path],{encoding:'utf8'}),full=resolve(path),base=resolve(dirname(full),'..'),qa=join(base,'.qa-artifacts');
const outside=resolve('C:/synthetic-real-host-profile-root'),profile=join(outside,'operator'),opened=[],output=[];
let source=text.replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url','reviewModuleUrl');
source=source.replace(/const \{ operatorMcpOAuthIdentity \} = await import\([^;\n]+;/,'const operatorMcpOAuthIdentity = reviewIdentity;');
const context={
 assert:{...assert,deepEqual:(a,b,message)=>assert.deepEqual(JSON.parse(JSON.stringify(a)),JSON.parse(JSON.stringify(b)),message)},dirname,join,resolve,sep,fileURLToPath,pathToFileURL,reviewModuleUrl:pathToFileURL(full).href,
 process:{argv:['node',full,join(qa,'operator'),'C:/synthetic-host/openclaw.mjs','--apply-only-expiry','--profile-stopped']},
 realpath:async p=>p===qa?outside:p===join(qa,'operator')?profile:p,
 readFile:async()=>JSON.stringify({commit:'bcfc88812a35243893585dbeca87ca41b48272ca'}),
 lstat:async()=>({isSymbolicLink:()=>false,isFile:()=>true,nlink:1}),
 reviewIdentity:()=>({storeKey:'synthetic-identity'}),
 DatabaseSync:class {constructor(p){opened.push(p);}exec(){}prepare(){return {all:()=>[{expiresAt:1}]};}close(){}},
 console:{log:x=>output.push(x)}
};
await new vm.Script('(async()=>{'+source+'})()').runInNewContext(context);
assert.deepEqual(opened,[join(profile,'state','state','openclaw.sqlite')]);
assert.ok(!opened[0].startsWith(base+sep));
console.log(JSON.stringify({proof:'QA root redirected by junction: existing path guards reach a DB outside package',allStateSynthetic:true,openedSyntheticDatabasePath:opened[0],sqlNotExecutedOnDisk:true}));
```

### 親のpublic refresh通知 — 注入条件を明記した限定PASS

親がOpenClawの隔離QA profileのexpiryだけをSQLで1へ注入し、その後の通常native probeが56toolを返し、保存expiryが `1791618935462` から `1791619191218` へ進んだと通知した。これは実public接続の**QA注入expiry後のnative refresh成功**を支持する親の実行証拠で、自然expiry待ち、server token失効、refresh rotation／concurrency、revocation／logout後の明示reconnectをすべて受け入れた証拠ではない。独立reviewerはpublic profile／SQLite／private receiptを読まず、SQL注入・probe・model要求を実行しない。OpenCodeのpublic自然expiry gateは未完了のまま。

後続の親通知はOpenCodeの**synthetic invalid Authorization headerによるpublic 401誘発後のnative refresh**が成功し、秘密値を出さない比較でaccessReplaced=true／futureExpiry=trueだったとする。通常configを復元してnative serverを再起動後、`/mcp` のguilduo connectedもPASSした。これはpublic native refreshと通常config復元後の接続を支持する親の実行証拠で、自然expiryやgrant失効後の再OAuthを支持するものではない。先行するlocal expiry metadata注入だけではrefreshを示せなかった試行はPASSに数えない。追加model要求はなく、独立reviewerはheader／native grant／receiptを読まずnative接続も実行しない。

OpenClaw no-op／stale guardは上記の親scopeで検証済み。B16-Q1は発見時点で追加の条件付きP2だったが、後続修正を独立検証してcloseした（次節）。DSH P2は引き続き凍結runtimeへのfeedbackのみ。この追補はreview docだけの未commit変更であり、親のsource commitをあーしが変更したものではない。

## QA helper修正の独立再review — B16-Q1解決

2026-10-10。現helperのSHA-256は `f62181668032646e4aa2d32969e6034a1c147ccccf8a8d16a4ee94c9df291b5f`。worker差分はQA root／profile検証とselfcheckの追加で、SQL／native operator identity／expiry-only操作は変更していない。

- **現source:** [helper](../plugins/guilduo-openclaw/tests/native-expiry-qa.mjs) 9–12行はdirectory・非symlink・lexical pathとrealpath一致を要求し、15–28行はbase／QA root／profileまでの各祖先を検査する。107行はこのguardをhost import・DB openより前に実行する。旧P2の「QA rootの解決先を新allowlistにする」処理は削除された。
- **独立verification:** 実sourceのguard関数を抽出してRAM fs mockで実行。normal nested profileを許可し、QA root junctionのlexical／external profile指定、base／profile／中間祖先junction、lstatとrealpathの不一致、外部path／prefix衝突／rootのみを拒否した。in-memory SQL `--self-test` も再PASS。すべて秘密なしで、disk DB／host／modelにアクセスしていない。
- **worker証拠・限界:** 親通知では実filesystem `--root-self-test` がnormal／root junction／base・profile link／outside profileを検査してPASS、SQL selftestもPASS。独立reviewerは指定write範囲を守り、QA scratchを作るこのfilesystem testは再実行せず、sourceとRAM guard assertionを検証した。競合するfilesystem変更やnative lease停止を保証する修正ではなく、停止／排他のpolicy前提は維持する。
- **判定:** B16-Q1を現source上で解決。host候補に新しい未解決P1/P2所見はなし。修正helperはsource-onlyでpackageには未収録。両最終tgz hash `6fe013ae…`／`46c3fb45…` を再計算して不変を確認し、package gateは維持する。helperの修正自体はまだ `11c960e` のblobへ継承されず、親の次source反映で扱う。

### 親の認可拒否通知 — logout／再OAuthは継続gate

公開Web operatorは切断操作について「probably disconnected」と報告し、その後、親のnative OpenCode reconnectはneeds_auth、OpenClaw probeはzero serversかつOAuth authorization requiredを返した。これは両hostが既存grantで接続できず、再認可を要求したという親の観測を支持する。独立reviewerはprivate receiptを読まず再実行していない。切断のserver内原因、全client／tokenの失効、credential削除まではこの通知から証明しない。explicit host logoutは開始通知のみで、成功・保存状態削除・ユーザーOAuth後の再接続はこの追補時点でpending。自然expiryを受入済みとはしない。
