import sharp from "sharp";
import type { WorkerEnv } from "../worker/src/worker-types.ts";

/** Real decode/resize behind the same binding shape; no provider calls. */
export function fakeImages(): NonNullable<WorkerEnv["IMAGES"]> {
  return {
    info: async stream => { const info = await sharp(Buffer.from(await new Response(stream).arrayBuffer())).metadata(); return { width: info.width!, height: info.height!, format: info.format }; },
    input: stream => ({ transform: options => ({ output: async () => {
      const bytes = await sharp(Buffer.from(await new Response(stream).arrayBuffer())).resize({ width: options.width, height: options.height, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      return { response: () => new Response(bytes) };
    } }) }),
  };
}
