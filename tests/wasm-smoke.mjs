import fs from "node:fs";
import { execFileSync } from "node:child_process";
import createFFmpegCore from "../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js";
import ts from "typescript";
const source = fs.readFileSync(
  new URL("../src/media/export.ts", import.meta.url),
  "utf8",
);
const code = ts.transpile(source, {
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2022,
});
const { argsFor, budget } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
globalThis.self = { location: { href: "http://localhost/ffmpeg-core.js" } };
const core = await createFFmpegCore({
  wasmBinary: fs.readFileSync(
    new URL(
      "../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm",
      import.meta.url,
    ),
  ),
  mainScriptUrlOrBlob:
    "http://localhost/ffmpeg-core.js#" +
    Buffer.from(
      JSON.stringify({ wasmURL: "http://localhost/ffmpeg-core.wasm" }),
    ).toString("base64"),
});
const logs = [];
core.setLogger(({ message }) => logs.push(message));
const base = {
  format: "mp4",
  resolution: "480",
  fps: "30",
  audio: 96,
  mode: "custom",
  target: 0.7,
  fadeIn: 0,
  fadeOut: 0,
};
execFileSync("ffmpeg", [
  "-v","error","-f","lavfi","-i","testsrc2=size=640x360:rate=30:duration=8",
  "-f","lavfi","-i","sine=frequency=440:duration=8","-c:v","libx264",
  "-preset","ultrafast","-c:a","aac","-y","/tmp/vibecut-input.mp4",
]);
core.FS.writeFile("input.mp4", fs.readFileSync("/tmp/vibecut-input.mp4"));
const results = [];
for (const [video, settings] of [
  [true, base],
  [true, { ...base, format: "webm", target: 0.5 }],
  [false, { ...base, format: "mp3", mode: "quality", audio: 192, fadeIn: 0.25, fadeOut: 0.4 }],
  [false, { ...base, format: "wav", mode: "quality" }],
]) {
  const out = `out.${settings.format}`;
  core.reset();
  const args = argsFor("input.mp4", out, 1, 5, settings, video);
  try { core.exec(...args); } catch (e) { console.error(logs.slice(-25).join("\n")); throw e; }
  if (core.ret !== 0) throw new Error("WASM export failed: " + logs.slice(-15).join("\n"));
  const bytes = core.FS.readFile(out);
  const b = budget(5, settings, video);
  if (b.limit && bytes.length >= b.limit * 1e6) throw new Error("Size limit failed");
  fs.writeFileSync("/tmp/vibecut-" + out, bytes);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v","quiet","-show_format","-show_streams","-of","json","/tmp/vibecut-" + out]));
  if (Math.abs(+probe.format.duration - 5) > 0.2) throw new Error("Trim duration failed");
  results.push({ format: settings.format, size: bytes.length, duration: probe.format.duration, limit: b.limit });
  core.FS.unlink(out);
}
if (process.env.EXTENDED) {
  execFileSync("ffmpeg", ["-v","error","-f","lavfi","-i","testsrc2=size=640x360:rate=30:duration=62,noise=alls=30:allf=t","-f","lavfi","-i","sine=frequency=440:duration=62","-c:v","libx264","-preset","ultrafast","-crf","18","-c:a","aac","-y","/tmp/vibecut-long.mp4"]);
  core.FS.writeFile("long.mp4", fs.readFileSync("/tmp/vibecut-long.mp4"));
  for (const mode of ["20", "10"]) {
    const settings = { ...base, mode, resolution: "original" };
    core.reset();
    core.exec(...argsFor("long.mp4", "long-out.mp4", 1, 60, settings, true));
    if (core.ret !== 0) throw new Error("Long export failed");
    const bytes = core.FS.readFile("long-out.mp4");
    if (bytes.length >= Number(mode) * 1e6) throw new Error("Discord limit failed");
    results.push({ format: "mp4", size: bytes.length, duration: 60, limit: Number(mode) });
    core.FS.unlink("long-out.mp4");
  }
}
console.log(JSON.stringify({ engine: "actual @ffmpeg/core WebAssembly", results }, null, 2));
