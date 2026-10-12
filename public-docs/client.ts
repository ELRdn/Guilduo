import "./styles.css";

type SearchArticle = { title: string; description: string; path: string; text: string };
type SearchIndex = { ja: SearchArticle[]; en: SearchArticle[] };
const strings = JSON.parse(document.querySelector("#docs-strings")?.textContent ?? "{}") as Record<string, string>;
const locale = document.documentElement.lang === "en" ? "en" : "ja";
const status = document.querySelector<HTMLElement>("#docs-search-status");
const results = document.querySelector<HTMLUListElement>("#docs-search-results");
const input = document.querySelector<HTMLInputElement>("#docs-search");
let indexPromise: Promise<SearchIndex> | undefined;
let queryVersion = 0;
const normalize = (value: string): string => value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();

function loadIndex(): Promise<SearchIndex> {
  indexPromise ??= fetch("/docs/search-index.json").then(async response => {
    if (!response.ok) throw new Error("Search index unavailable");
    const index = await response.json() as SearchIndex;
    if (!Array.isArray(index[locale]) || index[locale].some(article => typeof article.title !== "string" || typeof article.description !== "string" || typeof article.text !== "string" || typeof article.path !== "string" || !/^\/docs\/(?:en\/)?(?:[a-z0-9-]+\/)?$/.test(article.path))) throw new Error("Invalid search index");
    return index;
  }).catch((error: unknown) => { indexPromise = undefined; throw error; });
  return indexPromise;
}

async function search(): Promise<void> {
  if (!input || !results || !status) return;
  const version = ++queryVersion;
  const query = normalize(input.value);
  results.replaceChildren();
  results.hidden = true;
  if (!query) { status.textContent = strings.searchHint; return; }
  status.textContent = strings.loading;
  try {
    const index = await loadIndex();
    if (version !== queryVersion) return;
    const terms = query.split(" ");
    const matches = index[locale].map(article => {
      const title = normalize(article.title);
      const description = normalize(article.description);
      const body = normalize(article.text);
      const score = terms.every(term => `${title} ${description} ${body}`.includes(term)) ? terms.reduce((sum, term) => sum + (title.includes(term) ? 6 : 0) + (description.includes(term) ? 3 : 0) + (body.includes(term) ? 1 : 0), 0) : 0;
      return { article, score };
    }).filter(match => match.score > 0).sort((a, b) => b.score - a.score);
    status.textContent = matches.length ? `${matches.length} ${strings.count}` : strings.noResults;
    for (const { article } of matches) {
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = article.path;
      const title = document.createElement("strong");
      title.textContent = article.title;
      const description = document.createElement("span");
      description.textContent = article.description;
      link.append(title, description); item.append(link); results.append(item);
    }
    results.hidden = !matches.length;
  } catch { if (version === queryVersion) status.textContent = strings.searchError; }
}

const searchBox = document.querySelector<HTMLElement>(".doc-search");
if (searchBox && input) {
  searchBox.hidden = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  input.addEventListener("input", () => { ++queryVersion; if (timer) clearTimeout(timer); timer = setTimeout(() => { void search(); }, 100); });
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") { input.value = ""; void search(); }
    if (event.key === "ArrowDown") { const first = results?.querySelector<HTMLAnchorElement>("a"); if (first) { event.preventDefault(); first.focus(); } }
  });
  document.querySelector("#docs-search-clear")?.addEventListener("click", () => { input.value = ""; void search(); input.focus(); });
}

const theme = document.querySelector<HTMLSelectElement>("#docs-theme");
const scheme = matchMedia("(prefers-color-scheme: dark)");
function applyTheme(): void {
  if (!theme) return;
  document.documentElement.dataset.theme = theme.value === "system" ? (scheme.matches ? "dark" : "light") : theme.value;
}
if (theme) {
  theme.closest<HTMLElement>(".doc-theme")!.hidden = false;
  try { const saved = localStorage.getItem("guilduo-docs-theme"); if (saved && ["light", "dark", "system"].includes(saved)) theme.value = saved; } catch { /* Browser storage may be blocked. */ }
  applyTheme();
  theme.addEventListener("change", () => { try { localStorage.setItem("guilduo-docs-theme", theme.value); } catch { /* Theme still works without persistence. */ } applyTheme(); });
  scheme.addEventListener("change", () => { if (theme.value === "system") applyTheme(); });
}

const menu = document.querySelector<HTMLDetailsElement>("details.doc-nav");
const mobile = matchMedia("(max-width: 900px)");
const updateMenu = (): void => { if (menu) menu.open = !mobile.matches; };
updateMenu(); mobile.addEventListener("change", updateMenu);

for (const button of document.querySelectorAll<HTMLButtonElement>("button[data-copy]")) {
  button.hidden = false;
  button.addEventListener("click", async () => {
    const text = button.closest(".doc-code")?.querySelector("code")?.textContent;
    const announcement = document.querySelector<HTMLElement>("#docs-copy-status");
    if (!text || !announcement) return;
    try { await navigator.clipboard.writeText(text); announcement.textContent = strings.copied; button.textContent = strings.copied; setTimeout(() => { button.textContent = strings.copy; }, 1800); }
    catch { announcement.textContent = strings.copyError; }
  });
}
