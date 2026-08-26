import {
  Archive,
  ArchiveRestore,
  ArrowDownAZ,
  ArrowUpDown,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock,
  createElement,
  Download,
  Edit,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Gem,
  Gift,
  Home,
  LayoutList,
  Link,
  ListTree,
  Menu,
  Minus,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelRight,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Sun,
  Swords,
  Target,
  Upload,
  User,
  Users,
  X,
  Zap,
} from "lucide";
import type { IconNode, SVGProps } from "lucide";

export type QuestForgeIconName =
  | "archive"
  | "archive-restore"
  | "arrow-down-az"
  | "arrow-up-down"
  | "bot"
  | "calendar"
  | "check"
  | "chevron-down"
  | "chevron-right"
  | "help"
  | "clock"
  | "download"
  | "edit"
  | "external-link"
  | "eye"
  | "eye-off"
  | "filter"
  | "gem"
  | "gift"
  | "home"
  | "layout-list"
  | "link"
  | "list-tree"
  | "menu"
  | "minus"
  | "monitor"
  | "moon"
  | "more"
  | "panel-right"
  | "pause"
  | "play"
  | "plus"
  | "refresh"
  | "search"
  | "settings"
  | "shield"
  | "sparkles"
  | "sun"
  | "swords"
  | "target"
  | "upload"
  | "user"
  | "users"
  | "x"
  | "zap";

const ICONS: Record<QuestForgeIconName, IconNode> = {
  archive: Archive,
  "archive-restore": ArchiveRestore,
  "arrow-down-az": ArrowDownAZ,
  "arrow-up-down": ArrowUpDown,
  bot: Bot,
  calendar: CalendarDays,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  help: CircleHelp,
  clock: Clock,
  download: Download,
  edit: Edit,
  "external-link": ExternalLink,
  eye: Eye,
  "eye-off": EyeOff,
  filter: Filter,
  gem: Gem,
  gift: Gift,
  home: Home,
  "layout-list": LayoutList,
  link: Link,
  "list-tree": ListTree,
  menu: Menu,
  minus: Minus,
  monitor: Monitor,
  moon: Moon,
  more: MoreHorizontal,
  "panel-right": PanelRight,
  pause: Pause,
  play: Play,
  plus: Plus,
  refresh: RefreshCw,
  search: Search,
  settings: Settings,
  shield: Shield,
  sparkles: Sparkles,
  sun: Sun,
  swords: Swords,
  target: Target,
  upload: Upload,
  user: User,
  users: Users,
  x: X,
  zap: Zap,
};

export interface IconOptions {
  size?: number;
  className?: string;
  label?: string;
}

export function iconMarkup(name: QuestForgeIconName, options: IconOptions = {}): string {
  const size = options.size ?? 18;
  const attrs: SVGProps = {
    width: size,
    height: size,
    strokeWidth: 1.75,
    class: ["qf-icon", options.className].filter(Boolean).join(" "),
    focusable: "false",
  };
  if (options.label) {
    attrs["aria-label"] = options.label;
    attrs["role"] = "img";
  } else {
    attrs["aria-hidden"] = "true";
  }
  return createElement(ICONS[name], attrs).outerHTML;
}

export function iconNameForSurface(name: QuestForgeIconName): string {
  return `icon-${name}`;
}

export function hydrateQuestForgeIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-qf-icon]").forEach((element) => {
    const name = element.dataset.qfIcon as QuestForgeIconName | undefined;
    if (!name || !(name in ICONS) || element.dataset.qfIconReady === name) return;
    const size = Number(element.dataset.qfIconSize || 18);
    const label = element.dataset.qfIconLabel;
    element.replaceChildren();
    element.insertAdjacentHTML("afterbegin", iconMarkup(name, { size, label }));
    element.dataset.qfIconReady = name;
  });
}

export function installQuestForgeIconObserver(root: Document = document): MutationObserver {
  hydrateQuestForgeIcons(root);
  const observer = new MutationObserver(() => hydrateQuestForgeIcons(root));
  observer.observe(root.documentElement, { childList: true, subtree: true });
  return observer;
}
