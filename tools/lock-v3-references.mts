import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { PNG } from "pngjs";

interface ReferenceScreen {
  id: string;
  source: string;
  normalized: string;
}

interface ReferenceManifest {
  capture: { sourceCrop: { x: number; y: number; width: number; height: number } };
  screens: ReferenceScreen[];
}

const root = resolve(process.cwd());
const referenceRoot = join(root, "design/reference/v3-lock");
const manifest = JSON.parse(await readFile(join(referenceRoot, "manifest.json"), "utf8")) as ReferenceManifest;
const { x, y, width, height } = manifest.capture.sourceCrop;

for (const screen of manifest.screens) {
  const sourcePath = join(referenceRoot, screen.source);
  const targetPath = join(referenceRoot, screen.normalized);
  const source = PNG.sync.read(await readFile(sourcePath));
  if (x + width > source.width || y + height > source.height) {
    throw new Error(`${screen.id}: source crop exceeds ${source.width}×${source.height}`);
  }

  const normalized = new PNG({ width, height });
  PNG.bitblt(source, normalized, x, y, width, height, 0, 0);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, PNG.sync.write(normalized));
  console.log(`locked ${screen.id}: ${width}×${height}`);
}
