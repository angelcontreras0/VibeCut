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
      const base = new URL(import.meta.env.BASE_URL, document.baseURI);
      const parts = await Promise.all(
        [0, 1].map(async (i) => {
          const response = await fetch(new URL(`ffmpeg/core-${i}.bin`, base));
          if (!response.ok) throw new Error(`asset ${i}: HTTP ${response.status}`);
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
      throw new Error(`load:${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return engine;
}

async function safeDelete(f: FFmpeg, path: string) {
  try {
    await f.deleteFile(path);
  } catch {
    // File may not exist or the engine may have been terminated.
  }
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
  const ext =
    file.name
      .split(".")
      .pop()
      ?.replace(/[^a-z0-9]/gi, "")
      .toLowerCase() || "bin";
  const input = `input.${ext}`;
  const trimmed = `trimmed.${ext}`;
  const out = `output.${s.format}`;
  const duration = Math.max(0.01, end - start);

  const logs: string[] = [];
  const listener = ({ time }: { time: number }) =>
    progress(Math.min(98, Math.max(0, (time / 1e6 / duration) * 100)));
  const logListener = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 80) logs.shift();
  };

  f.on("progress", listener);
  f.on("log", logListener);

  let workingInput = input;
  let workingStart = start;
  let inputDeleted = false;

  try {
    status("Leyendo archivo…");
    await f.writeFile(input, new Uint8Array(await file.arrayBuffer()));

    // Build a smaller temporary clip first when possible. Seek AFTER opening
    // the input so codecs such as AV1 can read their sequence headers before
    // FFmpeg jumps to the requested section.
    if (video) {
      const padBefore = Math.min(3, Math.max(0, start));
      const preStart = Math.max(0, start - padBefore);
      const preDuration = duration + padBefore + 3;

      status(file.size > 80e6 ? "Optimizando archivo grande…" : "Preparando el recorte…");
      progress(0);
      logs.length = 0;
      await safeDelete(f, trimmed);

      const copyArgs = [
        "-i",
        input,
        "-ss",
        String(preStart),
        "-t",
        String(preDuration),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-c",
        "copy",
        "-avoid_negative_ts",
        "make_zero",
        "-y",
        trimmed,
      ];

      const copyCode = await f.exec(copyArgs);
      if (copyCode === 0) {
        workingInput = trimmed;
        workingStart = padBefore;
        await safeDelete(f, input);
        inputDeleted = true;
      } else {
        await safeDelete(f, trimmed);
        workingInput = input;
        workingStart = start;
      }
    }

    const b = budget(duration, s, video);
    let rate = b.video;
    const codecs = video && s.format === "mp4" ? ["libx264", "mpeg4"] : [undefined];
    let lastError = "encode";

    for (const codec of codecs) {
      for (let attempt = 0; attempt < 4; attempt++) {
        status(
          codec === "mpeg4"
            ? "Probando modo compatible…"
            : attempt
              ? "Ajustando al límite de tamaño…"
              : "Exportando…",
        );
        progress(0);
        logs.length = 0;
        await safeDelete(f, out);

        const code = await f.exec(
          argsFor(workingInput, out, workingStart, duration, s, video, rate, codec),
        );
        if (code !== 0) {
          lastError = logs.slice(-10).join(" | ") || `ffmpeg exit ${code}`;
          break;
        }

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
        rate = Math.floor(rate * ((b.limit * 1e6) / data.byteLength) * 0.88);
        if (rate < 16) throw new Error("limit");
      }
      rate = b.video;
    }

    throw new Error(`encode:${lastError.slice(-500)}`);
  } finally {
    f.off("progress", listener);
    f.off("log", logListener);
    if (!inputDeleted) await safeDelete(f, input);
    await safeDelete(f, trimmed);
    await safeDelete(f, out);
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
    await safeDelete(f, input);
    await safeDelete(f, "preview.wav");
  }
}
