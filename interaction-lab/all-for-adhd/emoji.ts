/**
 * One emoji per Quest, picked from title keywords in the nine supported locales (plan §4.3).
 * No AI: an unknown title gets no emoji and the Quest's colour dot stands in.
 */

// Each entry: the emoji and its keywords. CJK keywords match anywhere; Latin ones at a word start.
const DICTIONARY: readonly (readonly [string, string])[] = [
  ["💊", "薬|服薬|약|药|medic|pill|remedio|remédio|médicament|tablette|лекарств|таблет"],
  ["🦷", "歯医者|歯科|歯|치과|牙|dentist|dentista|dentiste|zahnarzt|стоматолог|зуб"],
  ["🏥", "病院|通院|診察|병원|医院|hospital|doctor|médico|médecin|arzt|врач|больниц"],
  ["📧", "メール|返信|이메일|메일|邮件|回复|mail|email|e-mail|correo|courriel|почт|письм"],
  ["📞", "電話|통화|전화|电话|call|phone|llamar|ligar|appeler|anrufen|позвон|звонок"],
  ["🗓️", "打ち合わせ|会議|ミーティング|회의|会议|meeting|reunión|reunião|réunion|besprechung|meeting|встреч|совещан"],
  ["📝", "書く|下書き|レポート|報告書|振り返り|作文|쓰기|보고서|写|报告|write|draft|report|escribir|escrever|rédiger|écrire|schreiben|bericht|написать|отчёт|отчет"],
  ["📊", "スライド|資料|発表|プレゼン|슬라이드|발표|幻灯片|演示|slide|deck|presentation|presentación|apresentação|présentation|präsentation|презентац|слайд"],
  ["📚", "本|読書|図書館|책|도서관|书|图书馆|book|read|library|libro|leer|livro|ler|livre|lire|buch|lesen|книг|читать|библиотек"],
  ["🧾", "請求書|領収書|経費|확정신고|영수증|发票|收据|invoice|receipt|expense|factura|recibo|fatura|facture|reçu|rechnung|quittung|счёт|счет|чек"],
  ["💰", "支払|振込|家賃|税|確定申告|납부|세금|付款|缴费|税|pay|bill|tax|rent|pagar|impuesto|imposto|aluguel|payer|impôt|loyer|bezahlen|steuer|miete|оплат|налог|аренд"],
  ["🛒", "買い物|買う|スーパー|장보기|구매|购物|买|shop|buy|grocer|comprar|compras|mercado|acheter|courses|einkaufen|kaufen|купить|покупк|магазин"],
  ["🍱", "昼ごはん|ランチ|昼食|弁当|점심|午饭|午餐|lunch|almuerzo|almoço|déjeuner|mittagessen|обед"],
  ["🍳", "朝ごはん|朝食|아침|早饭|早餐|breakfast|desayuno|café da manhã|petit-déjeuner|frühstück|завтрак"],
  ["🍽️", "夕飯|夕食|晩ごはん|저녁|晚饭|晚餐|dinner|cena|jantar|dîner|abendessen|ужин"],
  ["👩‍🍳", "料理|自炊|요리|做饭|cook|cocinar|cozinhar|cuisiner|kochen|готовить"],
  ["🧺", "洗濯|빨래|洗衣|laundry|lavar ropa|lavar roupa|lessive|wäsche|стирк"],
  ["🧹", "掃除|片付け|청소|打扫|清洁|clean|tidy|limpiar|limpar|nettoyer|ranger|putzen|aufräumen|убра|уборк"],
  ["🗑️", "ゴミ|쓰레기|垃圾|trash|garbage|basura|lixo|poubelle|müll|мусор"],
  ["🏃", "ジョギング|ランニング|走る|달리기|跑步|run|jog|correr|courir|laufen|joggen|бег|пробежк"],
  ["🏋️", "ジム|筋トレ|운동|헬스|健身|gym|workout|exercise|gimnasio|ejercicio|academia|exercício|salle de sport|fitness|training|спортзал|трениров"],
  ["🚶", "散歩|ウォーキング|산책|散步|walk|caminar|caminhar|passeio|marcher|promenade|spazieren|прогулк|гулять"],
  ["🧘", "瞑想|ヨガ|ストレッチ|명상|요가|冥想|瑜伽|meditat|yoga|stretch|meditar|estirar|alongar|méditer|étirer|dehnen|медитац|йог|растяжк"],
  ["😴", "寝る|睡眠|昼寝|休憩|休む|잠|낮잠|휴식|睡觉|午睡|休息|sleep|nap|rest|dormir|siesta|descansar|sieste|repos|schlafen|ruhe|пауза|сон|отдых"],
  ["🚿", "風呂|シャワー|목욕|샤워|洗澡|淋浴|shower|bath|ducha|baño|banho|douche|bain|duschen|baden|душ|ванн"],
  ["💇", "美容院|散髪|미용실|理发|haircut|salon|peluquería|cabeleireiro|coiffeur|friseur|парикмахер|стрижк"],
  ["✈️", "旅行|フライト|空港|여행|공항|旅行|机场|travel|trip|flight|airport|viaje|vuelo|viagem|voo|voyage|vol|reise|flug|поездк|путешеств|рейс"],
  ["🚗", "車|運転|車検|자동차|운전|开车|汽车|car|drive|coche|conducir|carro|dirigir|voiture|conduire|auto|fahren|машин|ехать"],
  ["📦", "荷物|発送|配達|返品|택배|배송|快递|包裹|package|parcel|ship|paquete|envío|pacote|colis|paket|посылк|отправ"],
  ["🎂", "誕生日|생일|生日|birthday|cumpleaños|aniversário|anniversaire|geburtstag|день рождения"],
  ["🎁", "プレゼント|贈り物|선물|礼物|gift|present|regalo|presente|cadeau|geschenk|подар"],
  ["💻", "コード|実装|プログラム|デプロイ|バグ|코드|배포|버그|代码|部署|code|deploy|bug|program|código|programar|coder|programmieren|код|деплой|баг"],
  ["🔍", "調べる|調査|リサーチ|検索|조사|검색|调查|搜索|research|investigate|look up|investigar|pesquisar|rechercher|recherchieren|исследов|изучить|найти"],
  ["✅", "確認|チェック|レビュー|확인|검토|检查|确认|审查|check|review|verify|revisar|verificar|vérifier|relire|prüfen|überprüfen|провер"],
  ["🎓", "勉強|宿題|試験|授業|공부|숙제|시험|学习|作业|考试|study|homework|exam|class|estudiar|tarea|estudar|lição|étudier|devoirs|examen|lernen|hausaufgabe|prüfung|учить|домашн|экзамен"],
  ["🗣️", "英語|語学|言語|영어|英语|language|idioma|língua|langue|sprache|язык"],
  ["🎨", "絵|デザイン|그림|디자인|画|设计|draw|design|paint|dibujar|diseño|desenhar|dessiner|zeichnen|malen|рисовать|дизайн"],
  ["🎵", "音楽|練習|ピアノ|ギター|음악|피아노|音乐|钢琴|music|piano|guitar|práctica|música|musique|musik|üben|музык|пианино|гитар"],
  ["🌱", "水やり|植物|庭|물주기|浇水|植物|plant|water the|garden|regar|jardín|jardim|arroser|jardin|gießen|garten|полить|растен|сад"],
  ["🐕", "犬|散歩させ|ペット|강아지|반려|狗|宠物|dog|pet|perro|mascota|cachorro|chien|hund|собак|питом"],
  ["🐈", "猫|고양이|猫|cat|gato|chat|katze|кошк|кот"],
  ["👶", "子ども|保育園|お迎え|아이|어린이집|孩子|接送|kid|child|daycare|pick up|niño|guardería|criança|creche|enfant|kind|kita|ребён|ребен|детск"],
  ["🏦", "銀行|口座|은행|银行|bank|banco|banque|банк"],
  ["🏛️", "役所|手続き|書類|申請|구청|서류|신청|手续|申请|文件|paperwork|form|application|trámite|formulario|papelada|formulário|démarche|formulaire|antrag|formular|документ|заявлен"],
  ["🔧", "修理|直す|수리|修理|repair|fix|reparar|consertar|réparer|reparieren|чинить|ремонт"],
  ["💡", "アイデア|企画|아이디어|기획|想法|点子|idea|brainstorm|idée|idee|иде"],
  ["📅", "予約|予定を立て|예약|预约|book a|appointment|schedule|reserva|cita|agendar|consulta|rendez-vous|réserver|termin|buchen|запис|бронь"],
  ["💬", "連絡|メッセージ|返事|연락|메시지|联系|消息|message|text|reply|contact|mensaje|responder|mensagem|répondre|nachricht|antworten|сообщен|ответить|написать"],
  ["☕", "カフェ|コーヒー|카페|커피|咖啡|coffee|café|kaffee|кофе"],
  ["🍺", "飲み会|呑み|회식|술|聚餐|drinks|party|fiesta|festa|fête|soirée|feier|вечеринк"],
  ["🧠", "考える|整理する|생각|思考|think|plan(?!t)|pensar|planear|planejar|réfléchir|planifier|nachdenken|planen|подумать|план"],
];

// Short Latin words must stand alone (plus a plural) in lower or title case, so "rest" skips "REST API".
const isShort = (word: string) => word.length <= 4 && /^[a-z]+$/.test(word);
const pattern = (word: string) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(word) ? word : `(?<![\\p{L}])${word}`;
const compiled = DICTIONARY.map(([emoji, words]) => {
  const all = words.split("|");
  const long = new RegExp(all.filter(word => !isShort(word)).map(pattern).join("|"), "iu");
  const short = all.filter(isShort).map(word => `[${word[0]}${word[0]!.toUpperCase()}]${word.slice(1)}`);
  const exact = short.length ? new RegExp(`(?<![\\p{L}])(?:${short.join("|")})(?:s|es)?(?![\\p{L}])`, "u") : null;
  return [emoji, { test: (title: string) => long.test(title) || (exact?.test(title) ?? false) }] as const;
});

/** The best emoji for a title, or "" when nothing matches. */
export function iconFor(title: string): string {
  return compiled.find(([, pattern]) => pattern.test(title))?.[0] ?? "";
}

/** Choices for the picker: matches for the title first, then recent picks, then common ones. */
export function iconChoices(title: string, recent: readonly string[], count = 8): string[] {
  const matches = compiled.filter(([, pattern]) => pattern.test(title)).map(([emoji]) => emoji);
  return [...new Set([...matches, ...recent, ...DICTIONARY.map(([emoji]) => emoji)])].slice(0, count);
}
