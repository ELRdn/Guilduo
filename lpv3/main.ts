// LPv3 keeps the approved demo and motion layers and adds scroll-linked scenes.
import "../lpv2-1/main";
import "./motion";
import { createIcons, Languages } from "lucide";
import contract from "../api/mcp-tools.json";

createIcons({ icons: { Languages }, attrs: { "stroke-width": 1.75, "aria-hidden": "true" } });

const toolCount = String(Array.isArray(contract) ? contract.length : contract.tools.length);
document.querySelectorAll("[data-tool-count]").forEach(node => { node.textContent = toolCount; });
