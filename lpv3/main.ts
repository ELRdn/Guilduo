// LPv3: shared page chrome and motion preference, plus its own scroll scenes and demo.
import "../lpv2/site";
import "../lpv2-1/motion";
import "./motion";
import "./experience";
import { createIcons, ArrowDown, ArrowLeftRight, ArrowRight, ArrowUpRight, Bot, Check, Inbox, Languages, RotateCcw, User } from "lucide";
import contract from "../api/mcp-tools.json";

createIcons({ icons: { ArrowDown, ArrowLeftRight, ArrowRight, ArrowUpRight, Bot, Check, Inbox, Languages, RotateCcw, User }, attrs: { "stroke-width": 1.75, "aria-hidden": "true" } });

const toolCount = String(Array.isArray(contract) ? contract.length : contract.tools.length);
document.querySelectorAll("[data-tool-count]").forEach(node => { node.textContent = toolCount; });
