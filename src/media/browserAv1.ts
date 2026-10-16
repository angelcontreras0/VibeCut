type Status = (message: string) => void;
type Progress = (value: number) => void;

export async function looksLikeAv1(file: File) {
  // MP4 sample entries advertise AV1 with the fourcc `av01`. Reading only the
  // first few MiB is enough for normal moov-at-front files and avoids loading
  // the complete video just to choose an export path.
  const size = Math.min(file.size, 4 * 1024 * 1024);
  const bytes = new Uint8Array(await file.slice(0, size).arrayBuffer());
  const needle = [0x61, 0x76, 0x30, 0x31]; // av01
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function once(target: EventTarget, event: string) {
  return new Promise<void>((resolve, reject) => {
    const ok = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new Error(`browser-av1:${event}`));
    };
    const cleanup = () => {
      target.removeEventListener(event, ok);
      target.removeEventListener("error", fail);
    };
    target.addEventListener(event, ok, { once: true });
    target.addEventListener("error", fail, { once: true });
  });
}

function bestRecorderMime() {
  const candidates = [
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ];
  return candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) || "";
}

export async function browserDecodeAv1Selection(
  file: File,
  start: number,
  end: number,
  status: Status,
  progress: Progress,
) {
  if (!("MediaRecorder" in window))
    throw new Error("browser-av1:MediaRecorder no disponible");

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.src = url;
  video.preload = "auto";
  video.playsInline = true;
  video.crossOrigin = "anonymous";
  // Keep playback silent for the user. captureStream captures the media tracks,
  // not speaker output, so the audio track remains available to MediaRecorder.
  video.muted = true;

  try {
    status("Preparando clip AV1 con el navegador…");
    await once(video, "loadedmetadata");

    if (!Number.isFinite(video.duration) || video.duration <= 0)
      throw new Error("browser-av1:duración inválida");

    const safeStart = Math.max(0, Math.min(start, video.duration));
    const safeEnd = Math.max(safeStart + 0.01, Math.min(end, video.duration));
    const duration = safeEnd - safeStart;

    video.currentTime = safeStart;
    await once(video, "seeked");

    const capture = (video as HTMLVideoElement & {
      captureStream?: () => MediaStream;
      mozCaptureStream?: () => MediaStream;
    }).captureStream ??
      (video as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream;

    if (!capture) throw new Error("browser-av1:captureStream no disponible");

    const stream = capture.call(video);
    const mimeType = bestRecorderMime();
    if (!mimeType) throw new Error("browser-av1:WebM recorder no disponible");

    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      // High-quality intermediate. FFmpeg will apply the user's final bitrate.
      videoBitsPerSecond: 8_000_000,
      audioBitsPerSecond: 192_000,
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };

    const stopped = new Promise<void>((resolve, reject) => {
      recorder.onstop = () => resolve();
      recorder.onerror = () => reject(new Error("browser-av1:MediaRecorder falló"));
    });

    let raf = 0;
    const watch = () => {
      const elapsed = Math.max(0, video.currentTime - safeStart);
      progress(Math.min(45, (elapsed / duration) * 45));
      if (video.currentTime >= safeEnd || video.ended) {
        video.pause();
        if (recorder.state !== "inactive") recorder.stop();
        return;
      }
      raf = requestAnimationFrame(watch);
    };

    status("Convirtiendo AV1 con el motor del navegador…");
    recorder.start(250);
    try {
      await video.play();
    } catch (e) {
      if (recorder.state !== "inactive") recorder.stop();
      throw new Error(`browser-av1:play:${e instanceof Error ? e.message : String(e)}`);
    }
    raf = requestAnimationFrame(watch);
    await stopped;
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((track) => track.stop());

    const blob = new Blob(chunks, { type: mimeType });
    if (blob.size < 1024) throw new Error("browser-av1:salida vacía");
    progress(48);
    return blob;
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
