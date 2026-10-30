import type { Quest, QuestImage } from "../../types/questforge.ts";
import { tx } from "./copy.ts";
import { reviewImages } from "./model.ts";
import type { ImageUploadTicket, QuestImagePort } from "../../types/quest-images.ts";
export type { QuestImagePort } from "../../types/quest-images.ts";

/** Draft files stay local; successful individual writes survive a later failed Save. */
export function questImageEditor(port: QuestImagePort | undefined, quest: Quest, context: "reference" | "response" | "review" = "reference") {
  const root = document.createElement("section"); root.className = context === "review" ? "a4-images a4-images-gallery" : "a4-images";
  const title = document.createElement("h3"); title.className = "a4-step-label"; title.textContent = context === "response" ? tx("回答の画像") : tx("画像");
  const rows = document.createElement("div"); rows.className = "a4-image-list";
  const status = document.createElement("p"); status.className = "a4-meta"; status.setAttribute("role", "status");
  const picker = document.createElement("input"); picker.type = "file"; picker.multiple = true; picker.accept = "image/png,image/jpeg,image/webp"; picker.hidden = true;
  const add = document.createElement("button"); add.type = "button"; add.className = "a4-button"; add.textContent = tx("画像を添付");
  const hint = document.createElement("p"); hint.className = "a4-meta"; hint.textContent = tx("PNG・JPEG・WebP。1枚10MB、1タスク10枚。貼り付けやドロップも使えます。");
  if (context === "review") root.append(title, rows, status);
  else root.append(title, rows, add, picker, hint, status);
  let disposed = false, saving = false, loaded = false;
  let images: QuestImage[] = [];
  const removed = new Set<string>();
  const files: { file: File; uploadId: string; ticket?: ImageUploadTicket; saved?: QuestImage; removed: boolean }[] = [];
  const urls = new Set<string>();
  const viewers = new Set<HTMLDialogElement>();
  const reviewId = context === "response" ? quest.id : "";
  const sourceId = quest.humanRequest?.sourceQuestId || quest.id;
  const readonly = context === "review" || Boolean(context === "response" && quest.humanRequest?.status === "answered");
  add.disabled = !port || readonly;
  if (!port) { hint.textContent = tx("画像の添付はログイン後に使えます。"); loaded = true; if (context === "review") root.hidden = true; }

  function accept(list: FileList | File[]) {
    if (!port || readonly || saving) return;
    for (const file of Array.from(list)) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) { status.textContent = tx("10MB以下のPNG・JPEG・WebPを選んでください。"); continue; }
      if (images.filter(image => !image.deletedAt && !removed.has(image.id)).length + files.filter(item => !item.removed && !item.saved).length >= 10) { status.textContent = tx("画像は1タスク10枚までです。"); break; }
      files.push({ file, uploadId: crypto.randomUUID(), removed: false });
    }
    paint();
  }
  if (context !== "review") {
    add.addEventListener("click", () => picker.click());
    picker.addEventListener("change", () => { if (picker.files) accept(picker.files); picker.value = ""; });
    root.addEventListener("dragover", event => { if (!readonly && event.dataTransfer?.types.includes("Files")) event.preventDefault(); });
    root.addEventListener("drop", event => { if (event.dataTransfer?.files.length) { event.preventDefault(); accept(event.dataTransfer.files); } });
    root.addEventListener("paste", event => { if (event.clipboardData?.files.length) { event.preventDefault(); accept(event.clipboardData.files); } });
    root.tabIndex = 0; root.setAttribute("aria-label", tx("参照画像を貼り付ける場所"));
  }

  function button(label: string, action: () => void) {
    const node = document.createElement("button"); node.type = "button"; node.className = "a4-button"; node.textContent = label;
    node.addEventListener("click", action); return node;
  }
  async function preview(image: QuestImage, node: HTMLImageElement) {
    try {
      const blob = await port!.read(image.id);
      if (disposed || !node.isConnected) return;
      const url = URL.createObjectURL(blob); urls.add(url); node.src = url; node.alt = image.caption || image.filename;
    } catch {
      if (disposed || !node.isConnected) return;
      node.alt = tx("画像を読み込めませんでした。再試行できます。");
      const retry = button(tx("再試行"), () => { retry.remove(); void preview(image, node); });
      node.closest(".a4-image-row")?.append(retry);
    }
  }
  function paint() {
    if (disposed) return;
    for (const url of urls) URL.revokeObjectURL(url); urls.clear();
    rows.replaceChildren();
    const labels = { reference: tx("参考画像"), result: tx("成果画像"), request: tx("確認用の画像"), response: tx("回答の画像") };
    const visible = context === "review" ? reviewImages(images, quest.id, quest.humanRequest?.attachmentIds)
      : context === "response" ? images.filter(image => image.context === "response" && image.reviewQuestId === reviewId) : images;
    if (context === "review") root.hidden = loaded && visible.length === 0;
    for (const image of visible) {
      const row = document.createElement("div"); row.className = "a4-image-row";
      const name = document.createElement("span"); name.textContent = `${labels[image.context]} · ${image.caption || image.filename}`;
      row.append(name);
      if (image.deletedAt) { row.append(document.createTextNode(tx("削除済み"))); rows.append(row); continue; }
      if (removed.has(image.id)) { row.append(button(tx("元に戻す"), () => { removed.delete(image.id); paint(); })); rows.append(row); continue; }
      const img = document.createElement("img"); img.alt = image.caption || image.filename; img.loading = "lazy"; img.width = 160; img.height = 100;
      const open = button(tx("拡大する"), () => {
        const dialog = document.createElement("dialog"); dialog.className = "a4-image-viewer";
        dialog.setAttribute("aria-label", image.caption || image.filename);
        const large = document.createElement("img"); large.alt = img.alt; large.src = img.src;
        const close = button(tx("閉じる"), () => dialog.close());
        const original = button(tx("原本を開く"), () => {
          original.disabled = true;
          void port!.read(image.id, true).then(blob => {
            if (disposed || !dialog.isConnected) return;
            const url = URL.createObjectURL(blob); urls.add(url); large.src = url;
          }).catch(() => { if (!disposed) status.textContent = tx("画像を読み込めませんでした。再試行できます。"); }).finally(() => { original.disabled = false; });
        });
        dialog.append(close, original, large);
        dialog.addEventListener("close", () => { dialog.remove(); if (open.isConnected) open.focus(); });
        viewers.add(dialog); dialog.addEventListener("close", () => viewers.delete(dialog));
        document.body.append(dialog); dialog.showModal(); close.focus();
      });
      open.prepend(img); row.append(open);
      if (!readonly && (context !== "response" || image.context === "response" && image.reviewQuestId === reviewId)) row.append(button(tx("削除"), () => { removed.add(image.id); paint(); }));
      rows.append(row); void preview(image, img);
    }
    for (const item of files.filter(item => !item.saved && !item.removed)) {
      const row = document.createElement("div"); row.className = "a4-image-row";
      const img = document.createElement("img"); const url = URL.createObjectURL(item.file); urls.add(url); img.src = url; img.alt = item.file.name; img.width = 160; img.height = 100;
      row.append(img, document.createTextNode(`${item.file.name} · ${tx("未保存")}`), button(tx("削除"), () => { item.removed = true; paint(); })); rows.append(row);
    }
  }
  async function load() {
    if (!port) return;
    root.setAttribute("aria-busy", "true");
    try {
      const page = await port.list(sourceId); if (disposed) return;
      images = page.images; loaded = true;
      status.textContent = context === "review" ? "" : tx("画像容量 {used} / {total} MB", { used: Math.ceil(page.usedBytes / 1048576), total: Math.floor(page.quotaBytes / 1048576) });
      paint();
    } catch { if (!disposed) { root.hidden = false; status.textContent = tx("画像を読み込めませんでした。再試行できます。"); status.append(button(tx("再試行"), () => { void load(); })); } }
    finally { if (!disposed) root.setAttribute("aria-busy", "false"); }
  }
  void load();
  return {
    element: root,
    fingerprint: () => JSON.stringify([files.map(item => [item.file.name, item.file.size, item.removed, item.saved?.id]), [...removed]]),
    async save(): Promise<string[]> {
      if (!port || context === "review") return [];
      if (!loaded && (removed.size || files.some(item => !item.removed))) throw new Error("image_list_unavailable");
      saving = true; add.disabled = true;
      try {
        for (const id of [...removed]) { await port.remove(id); removed.delete(id); const image = images.find(item => item.id === id); if (image) image.deletedAt = new Date().toISOString(); }
        for (const item of files.filter(item => !item.removed && !item.saved)) {
          if (!item.ticket || Date.parse(item.ticket.expiresAt) <= Date.now()) item.ticket = await port.prepare(sourceId, item.file, context, reviewId, item.uploadId);
          item.saved = await port.upload(item.ticket, item.file); images.push(item.saved);
        }
        paint();
        return images.filter(image => !image.deletedAt && image.context === "response" && image.reviewQuestId === reviewId).map(image => image.id);
      } catch (error) { status.textContent = tx("画像を保存できませんでした。入力を残しています。再試行してください。"); paint(); throw error; }
      finally { saving = false; if (!disposed) add.disabled = readonly; }
    },
    dispose() { disposed = true; for (const viewer of viewers) viewer.close(); viewers.clear(); for (const url of urls) URL.revokeObjectURL(url); urls.clear(); },
  };
}
