import { useEffect, useRef } from "react";
import WaveSurfer from "wavesurfer.js";
export function Waveform({
  url,
  media,
  zoom,
  video,
  onError,
}: {
  url: string;
  media: HTMLMediaElement;
  zoom: number;
  video: boolean;
  onError: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const wave = useRef<WaveSurfer | null>(null);
  const error = useRef(onError);
  error.current = onError;
  useEffect(() => {
    if (!root.current) return;
    const w = WaveSurfer.create({
      container: root.current,
      url,
      height: video ? 104 : 180,
      waveColor: "#829a87",
      progressColor: "#c7fa74",
      cursorColor: "transparent",
      barWidth: 2,
      barGap: 2,
      normalize: true,
      interact: false,
      hideScrollbar: true,
    });
    wave.current = w;
    w.on("error", () => error.current());
    return () => {
      w.destroy();
      wave.current = null;
    };
  }, [url, media, video]);
  useEffect(() => {
    const w = wave.current;
    if (w)
      try {
        w.zoom(zoom);
      } catch {}
  }, [zoom]);
  return <div ref={root} className="waveform" />;
}
