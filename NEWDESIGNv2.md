# QuestForge Command Golden Screen — NEWDESIGN v2

> Status: Human Approved Visual Direction / Implementation Contract
>
> Version: 2.0.0
>
> Approved: 2026-08-25
>
> Owner: QuestForge Product Design
>
> Primary implementation target: `/interaction-lab/` → `/next/`
>
> Golden attachment: 本書と同時に渡す、最終生成のCommand画面画像（1672×941、16:9）

## 0. この画面をQuestForgeの正式なCommand基準にする

添付画像を、次期QuestForgeにおけるCommand画面の正式な視覚方向として採用する。

この画面の役割は、複数のQuestが人間・AI Agent・Systemの間を流れる状況で、**人間がいま判断すべき1件を選び、理由と証拠を確認し、次の受け渡しを決定すること**である。

採用理由は次のとおり。

- 周辺Quest、選択中Quest、判断材料、実行履歴の役割分担が明確である。
- 選択中のQuestが画面の主役として成立している。
- Quest Loomが時間・依存・状態を同じ面で示している。
- Human → Agent → Human ReviewのRelayが直感的に読める。
- Intervention Lensが判断の終点として機能している。
- 高い情報密度を保ちながら、一般的な監視コンソールやSaaS管理画面へ寄っていない。

実装担当者は、添付画像を背景画像として使用してはならない。画像は構図、比率、情報階層、視線誘導、密度、色の重みを判断するVisual Referenceである。画面は正規のHTML、CSS、既存コンポーネント、既存Asset、既存データから再構成する。

---

## 1. 正本の優先順位

仕様が競合した場合は、対象ごとに次の順で判断する。

### 1.1 機能・データ・安全性

1. `PROJECT_SPEC.md`
2. `api/openapi.json`、`api/mcp-tools.json`、共有型、共有domain code
3. 既存のFirebase、REST、MCP、Authentication、Handoff、同期契約

### 1.2 Command画面の視覚・操作

1. `NEWDESIGNv2.md`
2. 添付したHuman Approved Command Golden Screen
3. `NEWDESIGN.md`
4. `DESIGN.md`、`interaction-lab/DESIGN.md`、`design/COMPONENTS.md`、`design/SCREENS.md`

文章と画像の役割は分ける。

- 本書は、挙動、状態、アクセシビリティ、禁止事項、検証条件を決める。
- 添付画像は、構図、視覚比率、情報の強弱、密度、選択状態の見え方を決める。
- 画像内の日時、Quest本文、人名、件数、ファイル名はfixture例であり、Productionの固定値ではない。
- 画像だけでは判断できない値を、実装担当者が独自に発明してはならない。既存tokenを使い、必要なら差分と理由を報告する。

### 1.3 旧Goldenの扱い

添付画像はCommand画面のDesired Compositionとして、過去のCommand系ImageGen Referenceより優先する。ただし、既存の回帰基準を無断で上書きしない。

- `design/reference/v3-lock/`はimmutableのまま維持する。
- 旧ReferenceやVisual Gateを加工して、見かけ上の一致率を上げない。
- 新しいRegression Goldenの作成は、実装後の人間承認を得てから別ディレクトリで行う。

---

## 2. Command画面が5秒以内に答える4つの問い

ユーザーが画面を開いてから5秒以内に、次の4点を読み取れること。

1. いま人間の判断が必要なQuestはどれか。
2. そのQuestは誰から誰へ渡り、どこで止まっているか。
3. どのQuestが前後にあり、何がこのQuestへ依存しているか。
4. 判断の根拠は何で、次にどの操作を行うべきか。

この順序を崩す情報は、表示できる情報であっても初期画面へ追加しない。

---

## 3. Golden Screenの固定構造

Commandは、次の5領域で構成する。

```text
┌ Forge Rail ┬──────────── Operation Bar / Capacity Band ────────────┬──────────────┐
│            │ Attention Shelf                                      │              │
│            ├──────── Quest Loom ───────┬── Selected Quest ─────────┤ Intervention │
│            │ chronology + dependency   │ Relay / Details / Evidence│ Lens         │
│            ├────────────────────────────┴───────────────────────────┤ decision     │
│            │ Execution Chronicle                                   │ surface      │
└────────────┴────────────────────────────────────────────────────────┴──────────────┘
```

視線は次の順で流す。

```text
Attention Shelfの選択中Review
  → 中央の選択中Questタイトル
  → Human / Agent / ReviewerのRelay
  → DetailsとPrimary Evidence
  → Intervention LensのWHY
  → Decision Bar
  → 必要に応じてQuest LoomとChronicle
```

### 3.1 Desktopの比率

添付画像は1672×941である。実装時は画像を単純拡大せず、`NEWDESIGN.md`のlayout tokenへ合わせて16:9の構図を再現する。

1920×1080では、次を基準にする。

- Forge Rail: 216pxを基準にする。
- Intervention Lens: 360pxを基準にする。
- 残りをCommand Workfieldとする。
- Workfield内はQuest Loomを約26%、Selected Questを約74%とする。
- Quest Loomは320〜360pxの範囲で内容を成立させる。
- Selected Questは900px未満へ圧縮しない。幅が足りない場合はLensをoverlayへ移す。
- Execution Chronicleは画面下部の固定ストリップとして扱い、主役Questを押し潰さない。

数値はpixel模写を目的とせず、添付画像の情報階層を守るための実装基準として使う。長い翻訳や実データにより競合する場合は、Chronicle、補助metadata、Lensのpeek化の順で退避し、Selected Questの主役性を守る。

### 3.2 Scroll ownership

- Forge Rail、Operation Bar、Capacity Band、Attention Shelf、Execution ChronicleはDesktopで固定する。
- Quest Loomだけが、行数超過時に独立して縦スクロールする。
- Selected Questは通常状態で1画面に主要情報を収める。Evidenceが増えた場合だけ、中央下部を内部スクロールさせる。
- Intervention Lensは内容超過時に内部スクロールするが、Decision Barは下端へsticky固定する。
- ページ全体と内部領域が同時に不規則にスクロールする構成は禁止する。

---

## 4. Attention Shelf — 介入候補と現在の選択を接続する

Attention Shelfは、`Blocked`、`Review`、`Waiting`など、人間が状況を把握すべき対象を最大3件まで並べる。

### 必須情報

- 状態名と非色覚シグナル
- Quest ID
- 介入理由の要約
- 経過時間
- 現在のActor

### 選択状態

添付画像の`REVIEW / SELECTED`を基準にする。

- 選択中カードはreview色の2px境界またはleading edgeを使う。
- `SELECTED`の明示ラベルを表示する。
- 低彩度のselected surface tintを加える。
- glow、強いshadow、拡大animationは使わない。
- Shelfで選択した対象は、Quest Loom、Selected Quest、Intervention Lens、Chronicleの選択状態へ同期する。

選択中カードだけが強く見え、BlockedとWaitingは比較可能なまま後退すること。

---

## 5. Quest Loom — 時間と依存を編む操作面

Quest Loomは、単なるQuest navigation listではない。時間を縦のspine、依存を横のthread、現在の担当をActor nodeとして示す、Command固有の操作面である。

### 5.1 Golden fixtureの骨格

添付画像では、次の因果関係を一目で読めること。

```text
QF-186 ─┐
        ├─→ QF-184 [selected / review required]
QF-187 ─┘          ├─x→ QF-191 [blocked by QF-184]
                   └─x→ QF-192 [blocked by QF-184]

QF-190 [waiting]
QF-195 [scheduled]
QF-181 [completed]
```

これはfixture上の関係である。Productionでは正規のQuest依存データから同じ文法で描画する。

### 5.2 表現規則

- 時間軸は上から下へ進む。
- 依存線は1pxのorthogonal routingを使う。
- 分岐点には小さなjointを置く。
- Blocked connectorは破線またはbroken edgeとし、`blocked by QF-184`を併記する。
- 色だけに依存せず、state icon、ラベル、connector形状を併用する。
- QF-184はhub nodeとして、選択境界とreview markerを持つ。
- working、waiting、scheduled、completedは行の右端または安定したmetadata列へ揃える。
- 同じ原因で止まるQuestはbranchとしてまとめ、同じ警告文を各行へ過剰に反復しない。

### 5.3 選択と操作

- 行全体を選択可能にする。
- `ArrowUp` / `ArrowDown`で前後のQuestへ移動する。
- `Enter`で選択し、中央詳細とLensを更新する。
- `Home` / `End`で先頭・末尾へ移動する。
- connectorやstate iconだけをclick targetにしない。
- 選択変更時も、Loomのscroll位置と展開状態を保持する。

### 5.4 混雑時の処理

- 線が3本以上交差する場合、個別線を重ねずbundle spineへまとめる。
- 依存数が多い場合は主要branchを表示し、`+N dependencies`からNetworkへ展開する。
- 文字を12px未満へ縮小して収めない。
- Questタイトルは最大2行。切り詰め時もQuest IDと状態は残す。
- Loomを一般的なTree、Kanban、tableへ置き換えない。

---

## 6. Selected Quest — 画面の主役を1件に固定する

中央領域は、選択中Questの判断workspaceである。

### 6.1 Header

表示順は次で固定する。

1. 状態とQuest ID
2. Questタイトル
3. 人間の介入が必要な理由
4. `Review output`
5. `Request revision`
6. overflow menu

Questタイトルは画面内で最も強い文字階層とする。Attention ShelfやLensの見出しが、Questタイトルより強くなってはならない。

`Review output`は、成果物とEvidenceを確認するための主操作である。最終承認そのものではない。`Request revision`はLens内の修正要求へfocusを移し、同じcommandを別系統で二重実行しない。

### 6.2 Responsibility Relay

添付画像の`Hironao → Forge Runner → Warden`を、Human → Agent → Human Reviewの代表fixtureとして使う。

各Actor nodeは次を持つ。

- identityとActor type
- role
- handoff / execution / review state
- 開始時刻または経過時間
- 状態を表す非色覚シグナル

Connectorは、完了した受け渡し、現在実行中、review required、blockedを形とラベルで区別する。現在停止している地点はWarden側のreview nodeとして明確に見せる。

### 6.3 Details

Detailsは判断に必要な差分を短く示す。

- 変更件数
- 追加・変更・削除の要点
- 権限変更の有無
- 互換性
- 影響を受けるQuest

長文logや生JSONを直接置かない。必要な場合はEvidenceの詳細表示へ送る。

### 6.4 Evidence Summary

Evidenceは等価なfile listにしない。

- 最重要Evidenceを1件だけPrimaryとして強調する。
- Primary rowは、artifact名、要約、verified state、時刻を持つ。
- Supporting Evidenceは低いsurface hierarchyで並べる。
- `Verified`、`12/12 passed`などの状態は、正規の検証結果がある場合だけ表示する。
- Evidenceが取得できない場合は、成功を装わず`Unavailable`と理由を表示し、承認actionを無効化する。
- 箇条書きは本文13px以上、line-height 1.45以上を守る。

---

## 7. Intervention Lens — 理由から最終判断までを閉じる

Intervention LensはInspectorではない。選択中Questについて、人間が最終判断を行うDecision Surfaceである。

### 7.1 情報順序

次の順序を変えない。

1. `WHY`
2. `AFFECTED QUEST`
3. `RELAY`
4. `EVIDENCE`
5. `DECISION`

WHYはLens内で最も強い本文とする。出来事の説明に留めず、**なぜ人間の判断が必要か**を1〜3文で示す。

### 7.2 Relay

Relayは中央のResponsibility Relayを縦型に要約する。中央とLensでActor順、状態、時刻が矛盾してはならない。片方だけを更新する実装は禁止する。

### 7.3 Evidence

LensではPrimary Evidenceの要点だけを表示する。全文、diff、複数artifactの比較は中央workspaceで開く。

### 7.4 Decision Bar

Decision BarはLens下端へsticky固定する。

- 状態ラベル: `Human decision required`
- Primary: `Approve handoff`
- Secondary: `Request revision`
- 判断が影響する対象を短く説明する補助文

`Approve handoff`はEvidence確認前、権限不足、stale data、競合検知中、送信中に実行できない。disabled時は理由を表示する。

承認前にdry-runまたは既存のpreview/expected state検証を行う。実行時は`expectedState`または`expectedUpdatedAt`で競合を検知する。成功後はHandoff state、Relay、Chronicle、Capacity Bandを同じtransaction resultから更新する。

---

## 8. Execution Chronicle — 判断の背景を短い履歴で残す

Chronicleは、Human、Agent、Systemの実行、受け渡し、判断、結果を追記する履歴である。

- Desktopでは画面下部に固定する。
- 最新イベントを1行で表示し、`View all`から展開する。
- イベントにはActor geometry、時刻、動詞、対象Quest、結果を含める。
- 選択中Questに関係するイベントを優先するが、履歴順を改変しない。
- append-onlyの見え方を維持する。監視用tickerのような常時流動animationは禁止する。
- informative textは13px未満にしない。

---

## 9. 色・文字・形状

具体値は`NEWDESIGN.md`のtokenを継承する。添付画像からraw colorを抽出して直接埋め込まない。

### 9.1 Semantic color

- Human: green
- Agent / execution: blue
- Review / selected intervention: restrained amber
- Blocked / error: red
- Waiting: muted amber
- Completed: green
- System: neutral
- Primary action: action token。Human identity色と混同しない。

1つのmoduleで支配的なsemantic colorは1色までとする。

### 9.2 Typography

- Questタイトル: 24〜28px相当、weight 650〜700
- Section heading: 12〜13px、uppercaseまたはletter spacingを節度ある範囲で使用
- Body: 14〜16px
- Dense metadata: 13pxを下限とする
- ID、時刻、数値: mono系data roleを使用可能
- `fg-disabled`を通常metadataへ使わない

小さい文字で密度を作らない。列の固定、段階的開示、補助情報の退避で密度を作る。

### 9.3 Geometry

- radiusは4〜8pxを基準とする。
- 1px dividerとsurface hierarchyで領域を分ける。
- nested cardを作らない。
- shadowはoverlayと明確なraised surfaceだけに限定する。
- neon glow、glassmorphism、紫青gradient、装飾的なnode背景は禁止する。

---

## 10. 選択状態は全領域で一つの正本を共有する

選択中Questは、単一のselection stateから次の領域へ反映する。

- Attention Shelf
- Quest Loom
- Selected Quest
- Intervention Lens
- Execution Chronicleのfilter/context

各領域が独自のselected Questを持ってはならない。

```text
select quest
  → update selectedQuestId
  → derive Attention Shelf state
  → derive Loom selected row and dependency focus
  → derive Selected Quest ViewModel
  → derive Lens reason / Relay / Evidence / Decision
  → derive Chronicle context
```

Reactを使う場合も、Reactはdomain stateの正本を持たない。既存stateをViewModelへ正規化し、action callbackを既存Commandへ返す。既存のReact Island境界を無断で拡張しない。

---

## 11. 状態設計

### 11.1 Loading

- Shell geometryを動かさない。
- 選択中の既存データがあれば保持し、更新箇所だけskeletonにする。
- 全画面spinnerで覆わない。

### 11.2 Empty

- Attention Shelfが空でも、Agent実行とSystem healthを残す。
- 「介入はありません」を静かに表示し、次にできる操作を1つ示す。
- 架空のReviewやBlocked QuestをProductionへ生成しない。

### 11.3 Stale / Offline

- 最後に取得できたQuest、Relay、Evidenceを保持する。
- Capacity BandとDecision Barへstale状態を表示する。
- write actionをlockし、再接続を提示する。

### 11.4 Error

- 失敗した領域だけをerror stateにする。
- 正常なQuest LoomやSelected Questを消さない。
- 原因、影響、再試行を表示する。

### 11.5 Permission

- 必要な権限と不足しているscopeを示す。
- 承認actionを無効化する。
- 認証情報やtokenをUI、log、fixtureへ出さない。

### 11.6 Concurrency conflict

- 他のActorが先に状態を更新した場合、古い承認を適用しない。
- 最新状態を再取得し、差分を表示する。
- ユーザーに再確認を求める。

---

## 12. Responsive behavior

### 12.1 1440px以上

- Forge Rail、Quest Loom、Selected Quest、Intervention Lensを同時表示する。
- 幅が不足した場合はLensを先にoverlayへ移し、Selected Questを守る。

### 12.2 1200〜1439px

- Forge Railを56pxへcollapseする。
- Lensはoverlayまたはpeekとする。
- Attention Shelfは3件を維持する。必要なら横方向のsnap scrollingを使う。
- Loomは280pxを下回らない。

### 12.3 901〜1199px

- Attention Shelf、Quest Loom、Selected Questを縦または2段へ再構成する。
- Lensはoverlay drawerとする。
- Chronicleはcollapsed stripとする。

### 12.4 900px以下

- ページ全体を縦スクロールする。
- 順序はAttention Shelf → Selected Quest → Relay → Evidence → Quest Loom → Chronicleとする。
- Lensはbottom sheetとし、Decision Barを下端へ固定する。
- bottom navigationに隠れない余白を確保する。
- 390×844で横overflowを0にする。

Desktopを単純縮小したモバイルUIは禁止する。

---

## 13. Accessibility contract

- すべての操作対象はkeyboardで到達できる。
- `focus-visible`は背景に対して明確な3px相当のringを持つ。
- 選択状態は`aria-selected`、展開状態は`aria-expanded`を使う。
- Quest LoomはDOM順と視覚順を一致させる。
- dependency connectorの意味を、screen reader向けtextでも提供する。
- Lensは適切なheading構造とlandmarkを持つ。
- overlay Lensとbottom sheetはfocus trap、Escape、focus returnを実装する。
- Decision結果は`role="status"`または適切なlive regionで通知する。
- 色を消してもActor type、Quest state、選択、依存、blocked理由を判別できること。
- `prefers-reduced-motion`では移動animationを停止する。
- 9言語の最長ラベルでoverflowと誤った折り返しがないこと。

---

## 14. Motion contract

Motionは状態の移動を説明する場合だけ使う。

- Hover / press: 80〜120ms
- Selection: 120〜180ms
- Lens open / close: 160〜220ms
- Relay state update: 180〜260ms
- Chronicle append: 160〜220ms

禁止事項:

- 常時点滅
- ambient particle
- connectorの無限流動
- selected cardのpulse
- layout shiftを伴うscale animation
- Motionを見ないと状態を理解できない表現

---

## 15. 実装境界

この作業はUI実装であり、domain redesignではない。

### 変更してよいもの

- Command画面のHTML構造、CSS、layout、既存ViewModelの表示用正規化
- Command固有の表示component
- 既存tokenを使ったstyle調整
- Command画面に必要なaccessibility属性
- deterministic visual fixtureと、Command固有のvisual test

### 変更してはいけないもの

- Firebase、REST、MCP、Schema、Authenticationの契約
- Quest、Handoff、同期、Battleのdomain state
- Social Party、Agent Registry、MCP clientの保存契約
- route、deep link、既存Commandの意味
- 既存Lucide vanilla icon体系
- 外部fontや新しいicon libraryの追加
- Production用の架空Quest、Actor、Evidence、接続状態
- 既存の未コミット変更
- `design/reference/v3-lock/`
- visual diffやtestの閾値を緩める変更

`Today`をCommandのdefault viewとして再構成する場合も、既存routeとhashの互換性を維持する。名称変更のためにdomain stateやAPIを変更しない。

---

## 16. 実装順序

### Phase 0 — Read-only audit

実装前に次を行う。

1. `AGENTS.md`と本書を読む。
2. `PROJECT_SPEC.md`、`NEWDESIGN.md`、`DESIGN.md`、`interaction-lab/DESIGN.md`を読む。
3. `design/COMPONENTS.md`、`design/SCREENS.md`、`design/ASSET_MANIFEST.md`を読む。
4. 現在のCommand / Today / Reviews / Handoff / Chronicle実装を特定する。
5. selection state、ViewModel、既存Commandへのcall chainを特定する。
6. 既存のdirty worktreeを記録し、保護する。
7. 添付画像と現在実装の差分を、Shell、Shelf、Loom、Selected Quest、Lens、Chronicleに分けて報告する。

`git status`がstale worktree metadataなどで失敗する場合、`reset`、`checkout`、`clean`、`.git`修復を行わない。原因と影響を報告し、既存変更を安全に識別できない場合は編集前に停止する。

### Phase 1 — Command Golden Screen only

1. Shared Shellの必要最小限の差分
2. Attention Shelfとselection同期
3. Quest Loomのchronology / dependency routing
4. Selected Quest headerとResponsibility Relay
5. DetailsとEvidence hierarchy
6. Intervention LensとDecision Bar
7. Execution Chronicle
8. Loading、Empty、Stale、Error、Permission、Conflict
9. Keyboard、focus、Reduced Motion
10. Responsive

他のmajor destinationへ展開しない。Commandの実装結果を人間が承認してから、Quests、Network、Party、Battle、Connectionsへ文法を広げる。

### Phase 2 — Golden approval

実装後、同じfixtureとviewportでcaptureし、添付画像と並べて比較する。人間の承認前に新しいRegression Goldenへ昇格しない。

---

## 17. Acceptance criteria

### 17.1 Visual acceptance

- 画面を5秒見て、選択中Quest、停止地点、判断理由、次の操作が分かる。
- 中央のSelected Questが最大の主役である。
- Quest Loomから、時間と依存を編む構造が読み取れる。
- QF-184からQF-191 / QF-192へのblocked dependencyが読み取れる。
- LensがDecision Surfaceとして見える。
- Primary EvidenceとSupporting Evidenceの強弱が明確である。
- Attention Shelfの選択中Reviewが中央workspaceと接続して見える。
- Chronicleは履歴として読め、監視tickerに見えない。
- 一般的なAI SaaS、KPI dashboard、監視console、ゲームHUDに見えない。
- 13px未満のinformative textがない。

### 17.2 Behavioral acceptance

- ShelfまたはLoomでQuestを選ぶと、中央、Lens、Chronicle contextが同期する。
- `Review output`からEvidenceを確認できる。
- `Approve handoff`と`Request revision`が既存Handoff commandへ接続する。
- stale、permission、conflict時に危険なwriteを実行しない。
- 成功・失敗・競合後のstateが全領域で矛盾しない。
- browser reload後も正本データから同じ選択可能状態を再構成できる。

### 17.3 Quality acceptance

- 390×844、1024×768、1280×800、1440×900、1920×1080でhorizontal overflowがない。
- Dark / Light / Systemでsemantic meaningが保たれる。
- 9言語で主要labelが欠落せず、操作不能なoverflowがない。
- keyboard操作、Escape、focus return、screen reader labelが成立する。
- `prefers-reduced-motion`で不要なMotionが停止する。
- Console error、HTTP 4xx/5xx、missing asset、Island load errorが0件である。
- Production bundleへfixture値を混入させない。
- 既存契約と既存の未コミット変更を維持する。

---

## 18. Validation

リポジトリで定義済みのscriptを正本として、少なくとも次を実行する。

```bash
npm run design:check
npm run check
npm test
npm run build
npm run visual:capture
npm run visual:diff
npm run visual:check
npm run visual:matrix
```

Command固有の検証では、次のcaptureを残す。

- 1920×1080 Dark / default selected review
- 1920×1080 Dark / another Loom row selected
- 1920×1080 Dark / Decision Bar disabled
- 1920×1080 Light / default
- 1440×900 Dark / Lens overlay
- 1024×768 Dark / compact
- 390×844 Dark / bottom sheet closed
- 390×844 Dark / bottom sheet open

Screenshotだけで合格にしない。ReferenceとCandidateを同じviewportとstateで並べ、次を目視確認する。

- region比率
- Questタイトルの主役性
- Loomのdependency routing
- RelayのActor順と停止地点
- Evidenceの主従
- LensのWHYとDecision Bar
- 最小文字の可読性
- clipped text、誤ったpadding、radius、border、scrollbar

テストやvisual diffが失敗した場合、実装を直す。Reference、比較条件、test、thresholdを弱めて通してはならない。

---

## 19. 完了報告の形式

実装担当者は、次の順で報告する。

1. 結論: 完了、未完了、Hard Blockのいずれか
2. 変更ファイル
3. Shell、Shelf、Loom、Selected Quest、Lens、Chronicleごとの変更内容
4. selection / Handoff / Evidenceの既存command接続
5. viewportごとのvisual validation結果
6. `design:check`、type/check、test、buildの結果
7. visual capture / diff / matrixの結果
8. Console、HTTP、overflow、asset、Island errorの件数
9. AccessibilityとReduced Motionの確認
10. 開始時dirty baselineとの比較
11. 契約変更がないことの確認
12. 残課題と未検証事項

Gate未達、未実行test、目視未確認が残る場合は「完了」と報告しない。

---

## 20. Opusへ渡す実行プロンプト

以下をOpusへそのまま渡し、本書とHuman Approved Command Golden Screen画像を添付する。

```text
あなたはQuestForgeのシニアStaff Product Engineer兼UI Design Engineerです。

添付したNEWDESIGNv2.mdとHuman Approved Command Golden Screen画像を正本として、QuestForgeのCommand画面を実装してください。

OBJECTIVE
複数のQuestが進行する中で、人間がいま判断すべき1件を選び、Relay、理由、Evidenceを確認し、Approve handoffまたはRequest revisionを安全に実行できるCommand Golden Screenを、既存QuestForgeへ製品品質で実装する。

AUTHORITY
- 機能、データ、API、認証、同期はPROJECT_SPEC.mdと既存契約を最優先する。
- Command画面の視覚、操作、状態、検証はNEWDESIGNv2.mdを最優先する。
- 添付画像は構図、比率、情報階層、密度、視覚的な重みの正本とする。
- 画像内のfixture値をProductionへ固定しない。
- 画像を背景として使用せず、正規のHTML、CSS、既存Asset、既存データで再構成する。

FIRST ACTION — READ-ONLY AUDIT
実装前にAGENTS.mdとNEWDESIGNv2.mdを全文読み、同書16章Phase 0の監査を実行する。現在のdirty state、Command / Today / Reviews / Handoff / Chronicleの実装、selection state、既存Commandへのcall chain、利用可能なtokenとcomponentを確認する。監査結果から変更予定ファイルと実装順を明示してから編集する。

SCOPE
- /interaction-lab/を開発元とし、/next/のCommand default viewへ反映する。
- Attention Shelf、Quest Loom、Selected Quest、Responsibility Relay、Details、Evidence Summary、Intervention Lens、Decision Bar、Execution Chronicleを対象にする。
- Command Golden Screenだけを完成させる。他のmajor destinationへデザイン文法を展開しない。

CORE REQUIREMENTS
1. 左のQuest Loomを単なる選択リストにせず、時間spine、依存thread、Actor/state nodeで構成する。
2. 選択中Questを画面の明確な主役にする。
3. Human → Agent → Human ReviewのRelayと停止地点を直感的に示す。
4. EvidenceはPrimary 1件とSupporting itemsへ階層化する。
5. Intervention LensをWHY → Affected Quest → Relay → Evidence → Decisionの順で構成する。
6. Lens下端にHuman decision required、Approve handoff、Request revisionを含むsticky Decision Barを置く。
7. Attention Shelf、Loom、中央詳細、Lens、Chronicleは単一のselectedQuestIdから同期する。
8. 13px未満のinformative textを使わず、高密度と可読性を両立する。
9. Loading、Empty、Stale、Error、Permission、Concurrency Conflictを実装する。
10. Keyboard、focus-visible、Escape、focus return、screen reader、Reduced Motion、9言語へ対応する。

ARCHITECTURE CONSTRAINTS
- Firebase、REST、MCP、Schema、Authentication、Quest、Handoff、同期、Battle、Party、Agent Registryの契約を変更しない。
- Reactをdomain stateの正本にしない。既存stateをViewModelへ正規化し、action callbackを既存Commandへ返す。
- 既存React Island境界を無断で拡張しない。
- Today / #todayをCommand default viewへ再構成しても、routeとdeep linkの互換性を維持する。
- 依存追加、外部font、新icon library、架空Production dataを追加しない。

PROHIBITED ACTIONS
- git reset、checkout、clean、stash、rebase、既存変更の削除
- design/reference/v3-lock/の変更
- Golden画像の背景利用
- screenshotをHTMLへ貼るだけの実装
- visual diff条件、threshold、test、assertionを弱める変更
- 無関係なcleanup、全React化、domain redesign
- nested card、glassmorphism、neon glow、紫青gradient、巨大KPI card、監視ticker表現
- 秘密情報、token、credentialへのアクセスまたは出力

VALIDATION
NEWDESIGNv2.mdの18章を実行する。最低限、design:check、check、test、build、visual:capture、visual:diff、visual:check、visual:matrixを実行し、1920×1080 DarkのReference/Candidate比較と390×844の操作確認を行う。失敗時は実装を直し、Gateやtestを弱めない。

PERSISTENCE
通常のCSS崩れ、test失敗、capture差分は停止理由にしない。原因を切り分けて修正を続ける。ただし、契約変更が不可避、必要な正規データが存在しない、Reference同士が矛盾する、既存dirty stateを安全に保護できない場合は、編集を止めて証拠付きで報告する。

RETURN FORMAT
NEWDESIGNv2.mdの19章に従う。未実行の検証や未達Gateがある場合は完了と報告しない。最終報告には、変更ファイル、領域ごとの改善、全検証結果、visual evidence、契約変更なしの確認、dirty baselineとの比較、残課題を含める。
```

---

## 21. 最終判断

このGolden Screenの価値は、情報量の多さではない。複数のQuestが動く状況を保ちながら、いま人間が判断する1件へ視線と操作を集約できる点にある。

Command画面は、次の関係を崩さない限りQuestForge固有であり続ける。

```text
Attention Shelf = 介入候補
Quest Loom = 時間と依存
Selected Quest = 現在の主役
Relay = 誰から誰へ渡ったか
Evidence = 判断根拠
Intervention Lens = 最終判断
Execution Chronicle = 何が起きたか
```

この構造をCommandで先に完成させ、人間が承認してから他画面へ展開する。
