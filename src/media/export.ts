export interface Settings {
  format: string;
  resolution: string;
  fps: string;
  audio: number;
  mode: string;
  target: number;
  fadeIn: number;
  fadeOut: number;
}
export function budget(duration: number, s: Settings, video: boolean) {
  const limit =
    s.mode === "20"
      ? 20
      : s.mode === "10"
        ? 10
        : s.mode === "custom"
          ? s.target
          : 0;
  const audio = s.format === "gif" ? 0 : s.audio;
  const total = limit ? (limit * 1e6 * 8 * 0.925) / duration / 1000 : 0;
  return {
    limit,
    video: Math.floor(total - audio),
    audio: Math.min(audio, Math.floor(total)),
    estimate: limit ? limit * 0.925 : 0,
  };
}
export function argsFor(
  input: string,
  out: string,
  start: number,
  duration: number,
  s: Settings,
  video: boolean,
  rate?: number,
  codecOverride?: string,
) {
  // IMPORTANT: seek after opening the input. Fast input seeking (-ss before -i)
  // can skip codec headers on AV1 Medal/OBS clips and produce
  // "Missing Sequence Header" / EOF decoding errors.
  const args = ["-i", input, "-ss", String(start), "-t", String(duration)];
  const b = budget(duration, s, video);
  if (video) {
    args.push("-map", "0:v:0", "-map", "0:a:0?");
    if (s.resolution !== "original")
      args.push("-vf", `scale=-2:'min(${s.resolution},ih)'`);
    else args.push("-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2");
    if (s.fps !== "original") args.push("-r", s.fps);
    const codec = codecOverride ?? (s.format === "webm" ? "libvpx" : "libx264");
    args.push("-c:v", codec);
    if (s.format === "mp4") {
      if (codec === "libx264") args.push("-preset", "ultrafast");
      args.push("-pix_fmt", "yuv420p");
    } else args.push("-deadline", "realtime", "-cpu-used", "8");
    if (b.limit) args.push("-b:v", `${Math.max(16, rate ?? b.video)}k`);
    else args.push("-crf", s.format === "webm" ? "28" : "18");
    args.push(
      "-c:a",
      s.format === "webm" ? "libopus" : "aac",
      "-b:a",
      `${s.audio}k`,
    );
    if (s.format === "mp4") args.push("-movflags", "+faststart");
  } else {
    args.push("-vn", "-c:a", s.format === "wav" ? "pcm_s16le" : "libmp3lame");
    if (s.format !== "wav")
      args.push(
        "-b:a",
        `${b.limit ? Math.max(8, Math.min(s.audio, b.audio)) : s.audio}k`,
      );
    const filters = [];
    if (s.fadeIn)
      filters.push(`afade=t=in:st=0:d=${Math.min(s.fadeIn, duration)}`);
    if (s.fadeOut)
      filters.push(
        `afade=t=out:st=${Math.max(0, duration - s.fadeOut)}:d=${Math.min(s.fadeOut, duration)}`,
      );
    if (filters.length) args.push("-af", filters.join(","));
  }
  return [...args, "-threads", "1", "-y", out];
}
