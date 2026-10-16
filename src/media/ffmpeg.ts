import { FFmpeg } from "@ffmpeg/ffmpeg";
import { argsFor, budget, type Settings } from "./export";
import { browserDecodeAv1Selection, looksLikeAv1 } from "./browserAv1";

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

async function detectVideoCodec(f: FFmpeg, input: string, logs: string[]) {
  logs.length = 0;
  await f.exec(["-hide_banner", "-i", input]);
  const text = logs.join("\n");
  const match = text.match(/Video:\s*([^,\s]+)/i);
  return (match?.[1] || "unknown").toLowerCase();
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
  const duration = Math.max(0.01, end - start);

  // Medal can produce valid AV1 MP4 files that Chrome/Edge play correctly but
  // the lightweight FFmpeg.wasm decoder fails with "Missing Sequence Header".
  // Detect `av01` in the MP4 metadata and let the browser decode only the
  // selected section to a temporary WebM. FFmpeg then receives a small,
  // compatible clip instead of decoding the original AV1 stream.
  let browserIntermediate: Blob | null = null;
  let sourceWasBrowserAv1 = false;
  if (video) {
    try {
      sourceWasBrowserAv1 = await looksLikeAv1(file);
    } catch {
      sourceWasBrowserAv1 = false;
    }
    if (sourceWasBrowserAv1) {
      status("Clip AV1 de Medal detectado…");
      browserIntermediate = await browserDecodeAv1Selection(
        file,
        start,
        end,
        status,
        progress,
      );
    }
  }

  status(sourceWasBrowserAv1 ? "Preparando exportación final…" : "Preparando motor local…");
  const f = await getEngine();

  const ext =
    file.name
      .split(".")
      .pop()
      ?.replace(/[^a-z0-9]/gi, "")
      .toLowerCase() || "bin";
  const input = sourceWasBrowserAv1 ? "browser-av1.webm" : `input.${ext}`;
  const trimmed = `trimmed.${ext}`;
  const out = `output.${s.format}`;

  const logs: string[] = [];
  const listener = ({ time }: { time: number }) => {
    const base = sourceWasBrowserAv1 ? 48 : 0;
    const span = sourceWasBrowserAv1 ? 50 : 98;
    progress(Math.min(98, base + Math.max(0, (time / 1e6 / duration) * span)));
  };
  const logListener = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 120) logs.shift();
  };

  f.on("progress", listener);
  f.on("log", logListener);

  let workingInput = input;
  let workingStart = sourceWasBrowserAv1 ? 0 : start;
  let inputDeleted = false;
  let sourceCodec = sourceWasBrowserAv1 ? "av1-browser" : "unknown";

  try {
    status(sourceWasBrowserAv1 ? "Cargando fragmento compatible…" : "Leyendo archivo…");
    if (browserIntermediate) {
      await f.writeFile(input, new Uint8Array(await browserIntermediate.arrayBuffer()));
    } else {
      await f.writeFile(input, new Uint8Array(await file.arrayBuffer()));
    }

    if (video && !sourceWasBrowserAv1) {
      status("Detectando codec…");
      try {
        sourceCodec = await detectVideoCodec(f, input, logs);
      } catch {
        sourceCodec = "unknown";
      }
    }

    const isHevc = sourceCodec === "hevc" || sourceCodec === "h265";

    if (video && !sourceWasBrowserAv1) {
      const padBefore = Math.min(isHevc ? 4 : 3, Math.max(0, start));
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
          sourceWasBrowserAv1 && codec === "libx264"
            ? "Finalizando Medal AV1 en H.264…"
            : codec === "mpeg4"
              ? "Probando modo compatible…"
              : attempt
                ? "Ajustando al límite de tamaño…"
                : "Exportando…",
        );
        logs.length = 0;
        await safeDelete(f, out);

        const code = await f.exec(
          argsFor(workingInput, out, workingStart, duration, s, video, rate, codec),
        );
        if (code !== 0) {
          lastError = logs.slice(-12).join(" | ") || `ffmpeg exit ${code}`;
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

    const codecHint = sourceCodec !== "unknown" ? ` [origen: ${sourceCodec}]` : "";
    throw new Error(`encode:${lastError.slice(-460)}${codecHint}`);
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
