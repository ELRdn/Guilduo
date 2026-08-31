import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(process.cwd());
const brandDir = join(root, "assets", "brand");
const iconsDir = join(root, "assets", "icons");
const masterPath = join(brandDir, "guilduo-mark-master.svg");

const COLORS = {
  nightSurface: "#0F1418",
  forgeTeal: "#13352F",
  antiqueGold: "#B89A5E",
  ivoryText: "#E7E3DA",
} as const;

const variantDefinitions = [
  { name: "guilduo-mark-gold.svg", fill: COLORS.antiqueGold, label: "Antique Gold" },
  { name: "guilduo-mark-ink.svg", fill: COLORS.nightSurface, label: "Night Surface" },
  { name: "guilduo-mark-ivory.svg", fill: COLORS.ivoryText, label: "Ivory Text" },
] as const;

const iconOutputs = [
  { name: "favicon-32.png", width: 32, height: 32, kind: "icon" as const },
  { name: "favicon-48.png", width: 48, height: 48, kind: "icon" as const },
  { name: "apple-touch-icon-180.png", width: 180, height: 180, kind: "icon" as const },
  { name: "icon-192.png", width: 192, height: 192, kind: "icon" as const },
  { name: "icon-512.png", width: 512, height: 512, kind: "icon" as const },
  { name: "icon-maskable-512.png", width: 512, height: 512, kind: "maskable" as const },
] as const;

const socialOutputs = [
  { path: join(brandDir, "og-guilduo.png"), width: 1200, height: 630 },
  { path: join(brandDir, "github-social-preview.png"), width: 1280, height: 640 },
] as const;

const checkOnly = process.argv.slice(2).includes("--check");

function ensureDirectories(): void {
  mkdirSync(brandDir, { recursive: true });
  mkdirSync(iconsDir, { recursive: true });
}

function extractPathData(svg: string, sourceName: string): string {
  const match = svg.match(/<path\b[^>]*\bd="([^"]+)"[^>]*\/?>/s);
  if (!match?.[1]) throw new Error(`${sourceName}: expected one inline path with d data`);
  return match[1];
}

function assertSvgIsSelfContained(svg: string, sourceName: string): void {
  if (!svg.includes("<svg") || !svg.includes("</svg>")) {
    throw new Error(`${sourceName}: invalid SVG document`);
  }
  if (/<(?:image|foreignObject|use)\b/i.test(svg)) {
    throw new Error(`${sourceName}: external or indirect SVG content is not allowed`);
  }
  if (/@font-face|font-family=|href=["'](?:https?:|data:)/i.test(svg)) {
    throw new Error(`${sourceName}: font or external resource dependency is not allowed`);
  }
}

function monochromeSvg(pathData: string, fill: string, label: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Guilduo E2 provisional trace derivative. Source: guilduo-mark-master.svg. -->
<svg xmlns="http://www.w3.org/2000/svg" width="376" height="504.25" viewBox="0 0 376 504.25">
  <title>Guilduo E2 mark — ${label}</title>
  <path d="${pathData}" fill="${fill}" fill-rule="evenodd"/>
</svg>
`;
}

function roundedBackgroundSvg(width: number, height: number): string {
  const scale = width / 512;
  const inset = 8 * scale;
  const radius = 104 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="${inset}" y="${inset}" width="${width - inset * 2}" height="${height - inset * 2}" rx="${radius}" fill="${COLORS.forgeTeal}"/></svg>`;
}

function maskableBackgroundSvg(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${COLORS.forgeTeal}"/></svg>`;
}

async function composeSquarePng(
  goldSvg: string,
  width: number,
  height: number,
  maskable: boolean,
): Promise<Buffer> {
  const backgroundSvg = maskable
    ? maskableBackgroundSvg(width, height)
    : roundedBackgroundSvg(width, height);
  const background = await sharp(Buffer.from(backgroundSvg)).png().toBuffer();
  const markHeight = Math.round(height * (maskable ? 0.66 : 0.695));
  const mark = await sharp(Buffer.from(goldSvg))
    .resize({ height: markHeight, fit: "contain" })
    .png()
    .toBuffer();
  const markMetadata = await sharp(mark).metadata();
  const markWidth = markMetadata.width ?? 0;
  const markActualHeight = markMetadata.height ?? 0;
  if (!markWidth || !markActualHeight) throw new Error("Could not read rendered mark dimensions");
  return sharp(background)
    .composite([{
      input: mark,
      left: Math.round((width - markWidth) / 2),
      top: Math.round((height - markActualHeight) / 2),
    }])
    .png()
    .toBuffer();
}

async function composeSocialPng(goldSvg: string, width: number, height: number): Promise<Buffer> {
  const background = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: COLORS.forgeTeal,
    },
  }).png().toBuffer();
  const mark = await sharp(Buffer.from(goldSvg))
    .resize({ height: Math.round(height * 0.7), fit: "contain" })
    .png()
    .toBuffer();
  const markMetadata = await sharp(mark).metadata();
  const markWidth = markMetadata.width ?? 0;
  const markActualHeight = markMetadata.height ?? 0;
  if (!markWidth || !markActualHeight) throw new Error("Could not read social mark dimensions");
  return sharp(background)
    .composite([{
      input: mark,
      left: Math.round((width - markWidth) / 2),
      top: Math.round((height - markActualHeight) / 2),
    }])
    .png()
    .toBuffer();
}

async function assertPng(path: string, width: number, height: number): Promise<void> {
  if (!existsSync(path) || statSync(path).size === 0) {
    throw new Error(`Missing or empty PNG: ${path}`);
  }
  const metadata = await sharp(path).metadata();
  if (metadata.format !== "png" || metadata.width !== width || metadata.height !== height) {
    throw new Error(`PNG metadata mismatch for ${path}: expected ${width}x${height} PNG`);
  }
}

async function validateOutputs(): Promise<void> {
  if (!existsSync(masterPath)) throw new Error(`Missing brand master: ${masterPath}`);
  const master = readFileSync(masterPath, "utf8");
  assertSvgIsSelfContained(master, masterPath);
  const masterPathData = extractPathData(master, masterPath);
  if (!master.includes(COLORS.forgeTeal) || !master.includes(COLORS.antiqueGold)) {
    throw new Error("Brand master must declare Forge Teal and Antique Gold");
  }
  for (const variant of variantDefinitions) {
    const path = join(brandDir, variant.name);
    if (!existsSync(path)) throw new Error(`Missing brand variant: ${path}`);
    const svg = readFileSync(path, "utf8");
    assertSvgIsSelfContained(svg, path);
    if (!svg.includes(`fill="${variant.fill}"`) || extractPathData(svg, path) !== masterPathData) {
      throw new Error(`Brand variant mismatch: ${path}`);
    }
  }
  for (const output of iconOutputs) {
    await assertPng(join(iconsDir, output.name), output.width, output.height);
  }
  for (const output of socialOutputs) {
    await assertPng(output.path, output.width, output.height);
  }
}

async function generate(): Promise<void> {
  ensureDirectories();
  const master = readFileSync(masterPath, "utf8");
  assertSvgIsSelfContained(master, masterPath);
  const pathData = extractPathData(master, masterPath);
  const goldSvg = monochromeSvg(pathData, COLORS.antiqueGold, "Antique Gold");

  for (const variant of variantDefinitions) {
    writeFileSync(join(brandDir, variant.name), monochromeSvg(pathData, variant.fill, variant.label), "utf8");
  }

  for (const output of iconOutputs) {
    const buffer = await composeSquarePng(goldSvg, output.width, output.height, output.kind === "maskable");
    writeFileSync(join(iconsDir, output.name), buffer);
  }
  for (const output of socialOutputs) {
    writeFileSync(output.path, await composeSocialPng(goldSvg, output.width, output.height));
  }
}

if (checkOnly) {
  await validateOutputs();
  console.log("brand assets check: ok");
} else {
  await generate();
  await validateOutputs();
  console.log("brand assets generated: ok");
}
