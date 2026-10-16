import { FFmpeg } from "@ffmpeg/ffmpeg";
import { argsFor, budget, type Settings } from "./export";
let engine: FFmpeg | null = null;
export function cancel() {
  engine?.terminate();
  engine = null;
}
export async function getEngine() {
  if (!engine) {
    const f = new FFmpeg();
    engine = f;
    try {
      const base = new URL(import.meta.env.BASE_URL, location.href);
      const parts = await Promise.all(
        [0, 1].map(async (i) => {
          const response = await fetch(new URL(`ffmpeg/core-${i}.bin`, base));
          if (!response.ok) throw new Error("load");
          return response.arrayBuffer();
        }),
      );
      if (engine !== f) throw new Error("cancelled");
      const wasmURL = URL.createObjectURL(
        new Blob(parts, { type: "application/wasm" }),
      );
      try {
        await f.load({
          coreURL: new URL("ffmpeg/ffmpeg-core.js", base).href,
          wasmURL,
        });
      } finally {
        URL.revokeObjectURL(wasmURL);
      }
    } catch (e) {
      if (engine === f) engine = null;
      throw e;
    }
  }
  return engine;
}
export async function exportMedia(
  file: File,
  start: number,
  end: number,
  s: Settings,
  video: boolean,
  progress: (n: number) => void,
  status: (s: string) => void,
) {
  status("Preparando motor local…");
  const f = await getEngine();
  const input = `input.${
      file.name
        .split(".")
        .pop()
        ?.replace(/[^a-z0-9]/gi, "") || "bin"
    }`,
    out = `output.${s.format}`,
    duration = end - start;
  const listener = ({ time }: { time: number }) =>
    progress(Math.min(98, Math.max(0, (time / 1e6 / duration) * 100)));
  f.on("progress", listener);
  try {
    await f.writeFile(input, new Uint8Array(await file.arrayBuffer()));
    const b = budget(duration, s, video);
    let rate = b.video;
    for (let attempt = 0; attempt < 4; attempt++) {
      status(attempt ? "Ajustando al límite de tamaño…" : "Exportando…");
      progress(0);
      const code = await f.exec(
        argsFor(input, out, start, duration, s, video, rate),
      );
      if (code !== 0) throw new Error("encode");
      const data = (await f.readFile(out)) as Uint8Array;
      if (!b.limit || data.byteLength < b.limit * 1e6) {
        progress(100);
        return new Blob([new Uint8Array(data)], {
          type: video
            ? s.format === "mp4"
              ? "video/mp4"
              : "video/webm"
            : s.format === "mp3"
              ? "audio/mpeg"
              : "audio/wav",
        });
      }
      if (!video || s.format === "wav") throw new Error("limit");
      rate = Math.floor(rate * ((b.limit * 1e6) / data.byteLength) * 0.9);
      if (rate < 16) throw new Error("limit");
    }
    throw new Error("limit");
  } finally {
    f.off("progress", listener);
    for (const p of [input, out])
      try {
        await f.deleteFile(p);
      } catch {
        /* terminated */
      }
  }
}
export async function audioPreview(file: File) {
  const f = await getEngine();
  const input = "preview-input";
  try {
    await f.writeFile(input, new Uint8Array(await file.arrayBuffer()));
    const code = await f.exec([
      "-i",
      input,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "pcm_s16le",
      "-y",
      "preview.wav",
    ]);
    if (code !== 0) throw new Error("audio");
    const bytes = (await f.readFile("preview.wav")) as Uint8Array;
    return URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type: "audio/wav" }),
    );
  } finally {
    for (const p of [input, "preview.wav"])
      try {
        await f.deleteFile(p);
      } catch {}
  }
}
