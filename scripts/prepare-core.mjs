import fs from "node:fs";
const base = new URL("../", import.meta.url);
const source = new URL("node_modules/@ffmpeg/core/dist/esm/", base);
const dest = new URL("public/ffmpeg/", base);
fs.mkdirSync(dest, { recursive: true });
fs.copyFileSync(
  new URL("ffmpeg-core.js", source),
  new URL("ffmpeg-core.js", dest),
);
const data = fs.readFileSync(new URL("ffmpeg-core.wasm", source));
const half = Math.ceil(data.length / 2);
fs.writeFileSync(new URL("core-0.bin", dest), data.subarray(0, half));
fs.writeFileSync(new URL("core-1.bin", dest), data.subarray(half));
