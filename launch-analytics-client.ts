import { ANALYTICS_POLICY_VERSION } from "./server/launch-analytics.ts";

const HANDOFF_KEY="questforge-acquisition-handoff";
const LP_TOKEN_KEY="questforge-lp-measurement-token";
const LP_CONSENT_KEY="questforge-lp-measurement-consent";
export function captureAcquisitionHandoff(location: Pick<Location,"hash"|"href">=window.location, history: Pick<History,"replaceState">=window.history, storage: Storage=window.sessionStorage) {
  const fragments=new URLSearchParams(location.hash.slice(1));const token=fragments.get("acq");if(token===null)return;
  // Strip before auth redirects, page render or any asynchronous work.
  const clean=new URL(location.href);fragments.delete("acq");clean.hash=fragments.toString();history.replaceState(null,"",clean.href);
  if(/^[a-f0-9]{64}$/.test(token))try{storage.setItem(HANDOFF_KEY,JSON.stringify({token,expires:Date.now()+15*60000}));}catch{/* No storage means unknown attribution. */}
}
export function pendingAcquisitionToken(storage: Storage=window.sessionStorage):string|undefined {
  try{const value=JSON.parse(storage.getItem(HANDOFF_KEY)||"null") as {token?:unknown;expires?:unknown}|null;
    if(value && typeof value.token==="string" && /^[a-f0-9]{64}$/.test(value.token) && typeof value.expires==="number" && value.expires>Date.now())return value.token;
    storage.removeItem(HANDOFF_KEY);
  }catch{/* Optional storage. */}return undefined;
}
export function clearAcquisitionHandoff(storage: Storage=window.sessionStorage){try{storage.removeItem(HANDOFF_KEY);}catch{/* Optional storage. */}}
export type { AnalyticsPort } from "./server/launch-analytics.ts";
export type AnalyticsCopyKey="title"|"description"|"allow"|"deny"|"withdraw"|"granted"|"denied"|"unknown"|"failed"|"privacy"|"loading"|"retry"|"paused";
const keys:AnalyticsCopyKey[]=["title","description","allow","deny","withdraw","granted","denied","unknown","failed","privacy","loading"];
const copy:Record<string,string[]>={
  ja:["任意の利用計測","同意すると、ランダムな計測IDをアカウントに結び、流入元・登録日・保存済みの利用・支払を最大90日分析します。本文・メール・認証情報は送らず、広告Pixelは使いません。拒否しても利用できます。","同意する","同意しない","撤回して計測データを削除","同意済み","同意なし","未選択","計測設定を保存できませんでした。再試行してください。","プライバシー","読み込み中"],
  en:["Optional usage measurement","With consent, a random measurement ID links your account, campaign, registration date, saved activity and payments for up to 90 days. No private text, email, credentials or advertising pixels. Refusal does not limit service.","Allow","Decline","Withdraw and delete measurement data","Allowed","Declined","Not chosen","Could not save measurement settings. Try again.","Privacy","Loading"],
  es:["Medición opcional","Con permiso, un ID aleatorio vincula cuenta, campaña, registro, actividad guardada y pagos hasta 90 días. Sin texto privado, correo, credenciales ni píxeles publicitarios. Rechazar no limita el servicio.","Permitir","Rechazar","Retirar y borrar datos","Permitido","Rechazado","Sin elegir","No se pudo guardar. Reintenta.","Privacidad","Cargando"],
  fr:["Mesure facultative","Avec accord, un identifiant aléatoire relie compte, campagne, inscription, activité enregistrée et paiements pendant 90 jours maximum. Aucun texte privé, e-mail, identifiant secret ou pixel publicitaire. Refuser ne limite pas le service.","Accepter","Refuser","Retirer et supprimer les données","Accepté","Refusé","Non choisi","Enregistrement impossible. Réessayez.","Confidentialité","Chargement"],
  de:["Optionale Nutzungsmessung","Mit Zustimmung verknüpft eine zufällige ID Konto, Kampagne, Registrierung, gespeicherte Aktivität und Zahlungen für höchstens 90 Tage. Keine privaten Texte, E-Mails, Zugangsdaten oder Werbepixel. Ablehnung schränkt den Dienst nicht ein.","Zustimmen","Ablehnen","Widerrufen und Messdaten löschen","Zugestimmt","Abgelehnt","Nicht gewählt","Speichern fehlgeschlagen. Erneut versuchen.","Datenschutz","Laden"],
  pt:["Medição opcional","Com consentimento, um ID aleatório liga conta, campanha, cadastro, atividade salva e pagamentos por até 90 dias. Sem texto privado, e-mail, credenciais ou pixels. Recusar não limita o serviço.","Permitir","Recusar","Retirar e excluir dados","Permitido","Recusado","Não escolhido","Não foi possível salvar. Tente novamente.","Privacidade","Carregando"],
  ko:["선택적 이용 측정","동의하면 무작위 ID로 계정, 캠페인, 가입일, 저장된 활동과 결제를 최대 90일 연결해 분석합니다. 비공개 글, 이메일, 인증 정보와 광고 픽셀은 사용하지 않습니다. 거부해도 서비스를 이용할 수 있습니다.","동의","거부","철회 및 측정 데이터 삭제","동의함","거부함","미선택","저장하지 못했습니다. 다시 시도하세요.","개인정보","불러오는 중"],
  "zh-CN":["可选使用统计","同意后，随机统计ID关联账户、来源、注册日期、已保存活动和付款，最长90天。不收集私密文本、邮箱、凭据或广告像素。拒绝不影响服务。","同意","拒绝","撤回并删除统计数据","已同意","已拒绝","未选择","保存失败，请重试。","隐私","加载中"],
  "zh-TW":["選用使用統計","同意後，隨機統計ID關聯帳戶、來源、註冊日期、已儲存活動及付款，最長90天。不收集私人文字、電子郵件、憑證或廣告像素。拒絕不影響服務。","同意","拒絕","撤回並刪除統計資料","已同意","已拒絕","未選擇","儲存失敗，請重試。","隱私","載入中"],
};
copy["pt-BR"]=copy.pt!;
copy["zh-Hans"]=copy["zh-CN"]!;
copy.ru=["Необязательная аналитика","С согласия случайный ID связывает аккаунт, кампанию, дату регистрации, сохранённые действия и платежи не более 90 дней. Без личных текстов, почты, ключей доступа и рекламных пикселей. Отказ не ограничивает сервис.","Разрешить","Отказаться","Отозвать и удалить данные","Разрешено","Отказ","Не выбрано","Не удалось сохранить. Повторите попытку.","Конфиденциальность","Загрузка"];
const retry:Record<string,string>={ja:"再試行",en:"Retry",es:"Reintentar",fr:"Réessayer",de:"Erneut versuchen","pt-BR":"Tentar novamente",ko:"다시 시도","zh-Hans":"重试",ru:"Повторить"};
const paused:Record<string,string>={ja:"計測は停止中です。以前の同意を撤回してデータを削除できます。",en:"Measurement is paused. You can withdraw earlier consent and delete data.",es:"La medición está pausada. Puede retirar su consentimiento y borrar datos.",fr:"La mesure est suspendue. Vous pouvez retirer votre consentement et supprimer les données.",de:"Die Messung ist pausiert. Sie können Ihre Einwilligung widerrufen und Daten löschen.","pt-BR":"A medição está pausada. Você pode retirar o consentimento e excluir dados.",ko:"측정이 중지되었습니다. 이전 동의를 철회하고 데이터를 삭제할 수 있습니다.","zh-Hans":"计量已暂停。您可以撤回之前的同意并删除数据。",ru:"Сбор приостановлен. Вы можете отозвать согласие и удалить данные."};
export function analyticsText(key:AnalyticsCopyKey,locale:string):string{return key==="paused"?(paused[locale]||paused.en)!:key==="retry"?(retry[locale]||retry.en)!:(copy[locale]||copy.en)![keys.indexOf(key)]!;}
const lpDescription:Record<string,string>={
  ja:"同意すると、ランダムな訪問ID、許可済み流入元、Appへのクリックを最大90日記録します。Appで別途同意した場合だけ、登録・保存済み行動・支払と結び付けます。拒否しても利用でき、広告Pixelは使いません。",
  en:"With consent, a random visit ID, registered campaign and App click are kept for up to 90 days. Linking registration, saved activity and payments requires separate consent in the App. Refusal does not limit service. No advertising pixels.",
  es:"Con permiso guardamos un ID aleatorio de visita, campaña y clic hasta 90 días. Vincular registro, actividad y pagos requiere otro consentimiento en la App. Rechazar no limita el servicio. Sin píxeles.",
  fr:"Avec accord, un ID aléatoire de visite, la campagne et le clic sont conservés 90 jours maximum. Inscription, activité et paiements exigent un accord distinct dans l’App. Aucun pixel publicitaire ; le refus ne limite pas le service.",
  de:"Mit Zustimmung werden eine zufällige Besuchs-ID, Kampagne und App-Klick höchstens 90 Tage gespeichert. Registrierung, Aktivität und Zahlungen werden nur mit gesonderter Zustimmung in der App verknüpft. Keine Werbepixel oder Einschränkung bei Ablehnung.",
  "pt-BR":"Com consentimento, guardamos ID aleatório de visita, campanha e clique por até 90 dias. Cadastro, atividade e pagamentos exigem consentimento separado no App. Sem pixels ou restrições por recusa.",
  ko:"동의하면 무작위 방문 ID, 허용된 캠페인과 앱 클릭을 최대 90일 저장합니다. 가입·활동·결제 연결은 앱에서 별도로 동의해야 합니다. 거부해도 서비스를 이용할 수 있고 광고 픽셀은 없습니다.",
  "zh-Hans":"同意后保存随机访问ID、已允许来源和应用点击，最长90天。关联注册、已保存活动和付款需要在应用中另行同意。拒绝不影响服务，不使用广告像素。",
  ru:"С согласия ID посещения, кампания и переход в App хранятся до 90 дней. Связь регистрации, действий и платежей требует отдельного согласия в App. Без рекламных пикселей и ограничений при отказе.",
};
/** LP-only consent. App account linking requires its own explicit consent. */
export function mountLpMeasurement():void {
  const config=globalThis.QuestForgeConfig;if(config?.analyticsEnabled!==true || !["guilduo.com","localhost","127.0.0.1"].includes(location.hostname))return;
  const base=config.gatewayUrl;if(!base)return;const endpoint=`${base.replace(/\/$/,"")}/analytics/acquisition`;
  const locale=document.documentElement.lang||"en";const section=document.createElement("section");section.className="shell";section.setAttribute("aria-label",analyticsText("title",locale));section.dataset.analyticsConsent="lp";
  const title=document.createElement("h2");title.textContent=analyticsText("title",locale);const description=document.createElement("p");description.textContent=(lpDescription[locale]||lpDescription.en)!;const status=document.createElement("p");status.setAttribute("role","status");
  const privacy=document.createElement("a");privacy.href="https://guilduo.com/privacy/";privacy.textContent=analyticsText("privacy",locale);
  let token="";let expires=0;let busy=false;let sequence=0;
  const read=(key:string)=>{try{return localStorage.getItem(key)||"";}catch{return "";}};
  const save=(key:string,value:string)=>{try{value?localStorage.setItem(key,value):localStorage.removeItem(key);}catch{/* Optional storage. */}};
  const granted=()=>read(LP_CONSENT_KEY)===ANALYTICS_POLICY_VERSION;
  const controls=document.createElement("div");const allow=document.createElement("button");const deny=document.createElement("button");allow.type=deny.type="button";allow.className=deny.className="button quiet";
  allow.textContent=analyticsText("allow",locale);deny.textContent=analyticsText("deny",locale);controls.append(allow,deny);section.append(title,description,status,controls,privacy);
  document.querySelector(".site-footer")?.before(section);
  const draw=()=>{allow.disabled=busy||granted();deny.disabled=busy;deny.textContent=analyticsText(granted()?"withdraw":"deny",locale);status.textContent=analyticsText(granted()?"granted":read(LP_CONSENT_KEY)==="denied"?"denied":"unknown",locale);};
  const registryCampaign=()=>{const query=new URLSearchParams(location.search);return config.analyticsCampaigns?.find(c=>c.source===query.get("utm_source")&&c.medium===query.get("utm_medium")&&c.campaign===query.get("utm_campaign"));};
  const send=(input:Record<string,unknown>)=>fetch(endpoint,{method:"POST",credentials:"omit",redirect:"error",headers:{"content-type":"application/json"},body:JSON.stringify({...input,consent:"granted",policyVersion:ANALYTICS_POLICY_VERSION}),signal:AbortSignal.timeout(8000)});
  async function visit(){const own=++sequence;busy=true;draw();try{const campaign=registryCampaign();const response=await send({action:"visit",campaign:campaign?{source:campaign.source,medium:campaign.medium,campaign:campaign.campaign}:location.search?{source:"unknown"}:{}});if(!response.ok)throw Error();const value=await response.json() as {token?:unknown;expiresAt?:unknown};if(typeof value.token!=="string"||!/^[a-f0-9]{64}$/.test(value.token)||typeof value.expiresAt!=="string")throw Error();if(own!==sequence||!granted()){void send({action:"withdraw",token:value.token}).catch(()=>undefined);return;}token=value.token;expires=Date.parse(value.expiresAt);save(LP_TOKEN_KEY,JSON.stringify({token,expires}));}catch{if(own===sequence)status.textContent=analyticsText("failed",locale);}finally{if(own===sequence){busy=false;allow.disabled=granted();deny.disabled=false;}}}
  allow.addEventListener("click",()=>{save(LP_CONSENT_KEY,ANALYTICS_POLICY_VERSION);void visit();});
  deny.addEventListener("click",()=>{sequence++;const prior=token;token="";expires=0;save(LP_CONSENT_KEY,"denied");save(LP_TOKEN_KEY,"");busy=false;draw();for(const link of document.querySelectorAll<HTMLAnchorElement>("[data-app-cta],[data-join-cta]")){const url=new URL(link.href);const hash=new URLSearchParams(url.hash.slice(1));hash.delete("acq");url.hash=hash.toString();link.href=url.href;}if(prior)void send({action:"withdraw",token:prior}).catch(()=>undefined);});
  for(const link of document.querySelectorAll<HTMLAnchorElement>("[data-app-cta],[data-join-cta]"))link.addEventListener("click",()=>{if(!granted()||!token||expires<=Date.now())return;const destination=new URL(link.href);if(destination.origin!=="https://app.guilduo.com")return;const hash=new URLSearchParams(destination.hash.slice(1));hash.set("acq",token);destination.hash=hash.toString();link.href=destination.href;void send({action:"click",token}).catch(()=>undefined);});
  draw();if(granted())void visit();
}
