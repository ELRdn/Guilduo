/**
 * Minimal typed DOM builders.
 *
 * The `/next/` surface is vanilla TypeScript, so Relay Forge uses the same
 * approach rather than introducing a rendering dependency (section 20 of the
 * implementation brief: no new heavy packages for simple visual primitives).
 */

export type Attributes = Readonly<Record<string, string | number | boolean | null | undefined>>;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export type Child = Node | string | null | undefined | readonly Child[];

function appendChild(parent: Element, child: Child): void {
  if (child === null || child === undefined) return;
  if (typeof child === "string") {
    parent.appendChild(document.createTextNode(child));
    return;
  }
  if (Array.isArray(child)) {
    for (const nested of child) appendChild(parent, nested as Child);
    return;
  }
  parent.appendChild(child as Node);
}

function applyAttributes(element: Element, attributes: Attributes): void {
  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;
    element.setAttribute(key, value === true ? "" : String(value));
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes | null = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (attributes !== null) applyAttributes(element, attributes);
  for (const child of children) appendChild(element, child);
  return element;
}

export function svg(tag: string, attributes: Attributes = {}, ...children: Child[]): SVGElement {
  const element = document.createElementNS(SVG_NAMESPACE, tag) as SVGElement;
  applyAttributes(element, attributes);
  for (const child of children) appendChild(element, child);
  return element;
}

export function clear(node: Element): void {
  while (node.firstChild !== null) node.removeChild(node.firstChild);
}

export function replaceChildren(node: Element, ...children: Child[]): void {
  clear(node);
  for (const child of children) appendChild(node, child);
}

export function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`Relay Forge: required element not found: ${selector}`);
  return found;
}
