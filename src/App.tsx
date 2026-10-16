import { useEffect, useRef, useState } from "react";
import {
  Scissors,
  ShieldCheck,
  Upload,
  ArrowUpRight,
  Play,
  Pause,
  SkipBack,
  Repeat2,
  Music2,
  FileVideo,
  Plus,
  Minus,
  Check,
  Download,
  X,
  Sparkles,
  LockKeyhole,
} from "lucide-react";
import { Timeline } from "./components/Timeline";
import { TimeInput } from "./components/TimeInput";
import { ExportPanel } from "./components/ExportPanel";
import { clamp, time, mb } from "./utils/time";
import { exportMedia, cancel, audioPreview } from "./media/ffmpeg";
import type { Settings } from "./media/export";
const initial: Settings = {
  format: "mp4",
  resolution: "original",
  fps: "original",
  audio: 128,
  mode: "quality",
  target: 20,
  fadeIn: 0,
  fadeOut: 0,
};
export default function App() {
  const [file, setFile] = useState<File | null>(null),
    [url, setUrl] = useState(""),
    [waveUrl, setWaveUrl] = useState(""),
    [video, setVideo] = useState(true),
    [media, setMedia] = useState<HTMLMediaElement | null>(null),
    [duration, setDuration] = useState(0),
    [start, setStart] = useState(0),
    [end, setEnd] = useState(0),
    [current, setCurrent] = useState(0),
    [playing, setPlaying] = useState(false),
    [loop, setLoop] = useState(false),
    [zoom, setZoom] = useState(1),
    [error, setError] = useState(""),
    [waveError, setWaveError] = useState(false),
    [settings, setSettings] = useState(initial),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(0),
    [status, setStatus] = useState(""),
    [result, setResult] = useState<{
      url: string;
      size: number;
      name: string;
      duration: number;
      resolution: string;
    } | null>(null),
    [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null),
    selectionOnly = useRef(false),
    cancelled = useRef(false),
    busyRef = useRef(false);
  const range = useRef({ start, end, loop });
  range.current = { start, end, loop };
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(
    () => () => {
      if (waveUrl && waveUrl !== url) URL.revokeObjectURL(waveUrl);
    },
    [waveUrl, url],
  );
  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url);
    },
    [result],
  );
  useEffect(() => {
    if (!media || !playing) return;
    let id = 0;
    const tick = () => {
      const r = range.current;
      setCurrent(media.currentTime);
      if ((r.loop || selectionOnly.current) && media.currentTime >= r.end) {
        if (r.loop) media.currentTime = r.start;
        else {
          media.pause();
          media.currentTime = r.end;
        }
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [media, playing]);
  function open(f?: File) {
    if (!f || busyRef.current) return;
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    if (
      !["mp4", "webm", "mov", "mp3", "wav", "m4a", "ogg", "aac"].includes(ext)
    ) {
      setError(
        "Este formato no está disponible. Prueba con MP4, WebM, MP3 o WAV.",
      );
      return;
    }
    if (f.size > 500 * 1e6) {
      setError(
        "Este archivo supera 500 MB. Usa uno más pequeño para evitar agotar la memoria del navegador.",
      );
      return;
    }
    media?.pause();
    const v = ["mp4", "webm", "mov"].includes(ext),
      u = URL.createObjectURL(f);
    setFile(f);
    setVideo(v);
    setUrl(u);
    setWaveUrl(u);
    setDuration(0);
    setStart(0);
    setEnd(0);
    setCurrent(0);
    setZoom(1);
    setError("");
    setWaveError(false);
    setResult(null);
    setSettings({
      ...initial,
      format: v ? "mp4" : "mp3",
      audio: v ? 128 : 192,
    });
    setMedia(null);
  }
  function seek(n: number) {
    if (media) {
      media.pause();
      selectionOnly.current = false;
      media.currentTime = clamp(n, 0, duration);
      setCurrent(media.currentTime);
    }
  }
  function play(selection = false) {
    if (!media) return;
    selectionOnly.current = selection;
    if (selection || current >= end || current < start) seek(start);
    selectionOnly.current = selection;
    media
      .play()
      .catch(() =>
        setError(
          "El navegador no puede reproducir este codec. Prueba convertir el archivo a MP4 o MP3.",
        ),
      );
  }
  function toggle() {
    if (media?.paused) play();
    else media?.pause();
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.ctrlKey ||
        e.metaKey ||
        (e.target as HTMLElement).closest(
          "input,select,textarea,[contenteditable=true],video",
        ) ||
        busy
      )
        return;
      if (
        e.code === "Space" &&
        !(e.target as HTMLElement).closest("button,a")
      ) {
        e.preventDefault();
        toggle();
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        seek(
          (media?.currentTime ?? current) +
            (e.key === "ArrowRight" ? 1 : -1) *
              (e.shiftKey ? 1 : e.altKey ? 0.001 : 1 / 30),
        );
      }
      if (e.key.toLowerCase() === "i") setStart(Math.min(current, end - 0.01));
      if (e.key.toLowerCase() === "o") setEnd(Math.max(current, start + 0.01));
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [media, current, start, end, busy]);
  function rangeChange(a: number, b: number) {
    const nextStart = clamp(a, 0, Math.max(0, Math.min(b, duration) - 0.01));
    const nextEnd = clamp(b, nextStart + 0.01, duration);
    setStart(nextStart);
    setEnd(nextEnd);
  }
  async function run() {
    if (!file || busyRef.current) return;
    media?.pause();
    busyRef.current = true;
    cancelled.current = false;
    setBusy(true);
    setProgress(0);
    setError("");
    try {
      const blob = await exportMedia(
        file,
        start,
        end,
        settings,
        video,
        setProgress,
        setStatus,
      );
      const h = video ? (media as HTMLVideoElement)?.videoHeight : 0;
      const w = video ? (media as HTMLVideoElement)?.videoWidth : 0;
      const outH =
        settings.resolution === "original"
          ? h
          : Math.min(h, +settings.resolution);
      setResult({
        url: URL.createObjectURL(blob),
        size: blob.size,
        name: `${file.name.replace(/\.[^.]+$/, "")}-vibecut.${settings.format}`,
        duration: end - start,
        resolution: video
          ? `${Math.round((w * outH) / h / 2) * 2} × ${outH}`
          : settings.format.toUpperCase(),
      });
    } catch (e) {
      if (!cancelled.current)
        setError(
          e instanceof Error && e.message === "limit"
            ? "No pudimos alcanzar ese tamaño. Reduce la duración, baja la resolución o aumenta el límite."
            : "No se pudo exportar. Puede ser un codec incompatible o falta de memoria. Prueba con un archivo más pequeño o con MP4/MP3.",
        );
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  async function recoverWave() {
    if (!file) return;
    setBusy(true);
    busyRef.current = true;
    setStatus("Preparando forma de onda…");
    cancelled.current = false;
    try {
      setWaveUrl(await audioPreview(file));
      setWaveError(false);
    } catch {
      if (!cancelled.current)
        setError(
          "No encontramos una pista de audio compatible. Puedes seguir recortando el video.",
        );
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  return (
    <div className="app">
      <header>
        <a className="brand" href="./">
          <span className="brand-icon">
            <Scissors size={21} />
          </span>
          Vibe<span>Cut</span>
        </a>
        <div className="privacy-badge">
          <i /> Procesamiento local
        </div>
        <a className="header-link" href="#about">
          Sin complicaciones <ArrowUpRight size={14} />
        </a>
      </header>
      <main>
        {!file ? (
          <>
            <div className="intro">
              <div className="eyebrow">
                <span /> MENOS EDITOR. MÁS CLIP.
              </div>
              <h1>
                Lo bueno,
                <br />
                sin lo de más<span>.</span>
              </h1>
              <p>
                Tu video. Tu audio. Solo la parte que importa.
                <br />
                Recorta, exporta y sigue con lo tuyo.
              </p>
            </div>
            <section
              className={`dropzone ${dragging ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                open(e.dataTransfer.files[0]);
              }}
              onClick={() => picker.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  picker.current?.click();
                }
              }}
              aria-label="Seleccionar video o audio"
            >
              <div className="upload-icon">
                <Upload size={29} />
                <span>+</span>
              </div>
              <h2>Arrastra un video o audio aquí</h2>
              <p>Ese clip merece un buen corte.</p>
              <button
                className="primary"
                onClick={(e) => {
                  e.stopPropagation();
                  picker.current?.click();
                }}
              >
                Seleccionar archivo <ArrowUpRight size={16} />
              </button>
              <div className="formats">
                <span>
                  <FileVideo size={14} /> MP4 · WebM · MOV
                </span>
                <i />
                <span>
                  <Music2 size={14} /> MP3 · WAV · M4A · OGG · AAC
                </span>
              </div>
              <small>
                Hasta 500 MB · La compatibilidad depende del codec y tu
                navegador
              </small>
            </section>
            <div className="steps">
              <span>
                <b>01</b> Suelta tu archivo
              </span>
              <i />
              <span>
                <b>02</b> Quédate con lo bueno
              </span>
              <i />
              <span>
                <b>03</b> Exporta y comparte
              </span>
            </div>
            <p className="privacy-line">
              <LockKeyhole size={14} /> Tus archivos no se suben. Todo se
              procesa en tu navegador.
            </p>
          </>
        ) : (
          <>
            <div className="editor-heading">
              <div>
                <span className="eyebrow">TU MESA DE CORTE</span>
                <h1>
                  Quédate con lo bueno<span>.</span>
                </h1>
              </div>
              <button disabled={busy} onClick={() => picker.current?.click()}>
                <Plus size={16} /> Otro archivo
              </button>
            </div>
            <div className="editor-layout">
              <section className="workspace">
                <div className="file-bar">
                  {video ? <FileVideo size={16} /> : <Music2 size={16} />}
                  <strong>{file.name}</strong>
                  <span>{mb(file.size)} MB</span>
                </div>
                <div className={video ? "preview" : "audio-preview"}>
                  {!video && (
                    <div className="audio-title">
                      <Music2 size={25} />
                      <span>
                        Una buena onda.
                        <small>Recorta exactamente donde la escuchas.</small>
                      </span>
                    </div>
                  )}
                  {video ? (
                    <video
                      key={url}
                      src={url}
                      ref={setMedia}
                      playsInline
                      controls
                      onLoadedMetadata={(e) => {
                        const d = e.currentTarget.duration;
                        if (!Number.isFinite(d) || d <= 0) {
                          setError(
                            "No pudimos leer la duración de este archivo.",
                          );
                          return;
                        }
                        setDuration(d);
                        setEnd(d);
                      }}
                      onTimeUpdate={(e) => {
                        const m = e.currentTarget,
                          r = range.current;
                        setCurrent(m.currentTime);
                        if (
                          !m.paused &&
                          (r.loop || selectionOnly.current) &&
                          m.currentTime >= r.end
                        ) {
                          if (r.loop) m.currentTime = r.start;
                          else {
                            m.pause();
                            m.currentTime = r.end;
                          }
                        }
                      }}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onError={() =>
                        setError(
                          "Tu navegador no puede previsualizar este video. Prueba un MP4 con codec H.264.",
                        )
                      }
                    />
                  ) : (
                    <audio
                      key={url}
                      src={url}
                      ref={setMedia}
                      onLoadedMetadata={(e) => {
                        const d = e.currentTarget.duration;
                        if (Number.isFinite(d)) {
                          setDuration(d);
                          setEnd(d);
                        }
                      }}
                      onTimeUpdate={(e) => {
                        const m = e.currentTarget,
                          r = range.current;
                        setCurrent(m.currentTime);
                        if (
                          !m.paused &&
                          (r.loop || selectionOnly.current) &&
                          m.currentTime >= r.end
                        ) {
                          if (r.loop) m.currentTime = r.start;
                          else {
                            m.pause();
                            m.currentTime = r.end;
                          }
                        }
                      }}
                      onPlay={() => setPlaying(true)}
                      onPause={() => setPlaying(false)}
                      onError={() =>
                        setError(
                          "Tu navegador no puede reproducir este audio. Prueba MP3 o WAV.",
                        )
                      }
                    />
                  )}
                </div>
                {duration > 0 && media && (
                  <>
                    <div className="trim-toolbar">
                      <div className="trim-label">
                        <Scissors size={17} />
                        <span>Tu recorte</span>
                      </div>
                      <div className="time-inputs">
                        <TimeInput
                          label="Inicio"
                          value={start}
                          onChange={(n) => {
                            rangeChange(n, end);
                          }}
                        />
                        <TimeInput
                          label="Final"
                          value={end}
                          onChange={(n) => {
                            rangeChange(start, n);
                          }}
                        />
                        <TimeInput
                          label="Duración"
                          value={end - start}
                          onChange={(n) =>
                            rangeChange(start, start + Math.max(0.01, n))
                          }
                        />
                      </div>
                    </div>
                    <div className="timeline-header">
                      <div className="playback">
                        <div>
                          <button
                            aria-label="Volver al inicio de selección"
                            onClick={() => seek(start)}
                          >
                            <SkipBack size={17} />
                          </button>
                          <button
                            className="play"
                            aria-label={playing ? "Pausar" : "Reproducir"}
                            onClick={toggle}
                          >
                            {playing ? <Pause size={19} /> : <Play size={19} />}
                          </button>
                          <button onClick={() => play(true)}>
                            Reproducir selección
                          </button>
                          <button
                            className={loop ? "selected" : ""}
                            aria-label="Loop de selección"
                            aria-pressed={loop}
                            onClick={() => setLoop(!loop)}
                          >
                            <Repeat2 size={18} />
                          </button>
                        </div>
                        <div className="position-readout">
                          <span>Posición</span>
                          <code>{time(current)}</code>
                        </div>
                      </div>
                      <div className="zoom">
                        <Minus size={14} />
                        <input
                          aria-label="Zoom de timeline"
                          type="range"
                          min="1"
                          max="12"
                          step=".25"
                          value={zoom}
                          onChange={(e) => setZoom(+e.target.value)}
                        />
                        <Plus size={14} />
                        <span>{zoom.toFixed(1)}×</span>
                      </div>
                    </div>
                    <Timeline
                      duration={duration}
                      start={start}
                      end={end}
                      current={current}
                      zoom={zoom}
                      media={media}
                      url={waveUrl}
                      video={video}
                      onRange={rangeChange}
                      onSeek={seek}
                      onWaveError={() => setWaveError(true)}
                    />
                    {waveError && (
                      <div className="wave-error">
                        No se pudo leer el audio directamente.{" "}
                        <button disabled={busy} onClick={recoverWave}>
                          Generar waveform con FFmpeg
                        </button>
                      </div>
                    )}
                    {!video && (
                      <div className="two-col fades">
                        {(["fadeIn", "fadeOut"] as const).map((k, i) => (
                          <label key={k}>
                            {i ? "Fade out" : "Fade in"} (segundos)
                            <input
                              type="number"
                              min="0"
                              max={end - start}
                              step=".1"
                              value={settings[k]}
                              onChange={(e) =>
                                setSettings({
                                  ...settings,
                                  [k]: clamp(+e.target.value, 0, end - start),
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
              <ExportPanel
                settings={settings}
                setSettings={setSettings}
                video={video}
                duration={end - start}
                busy={busy || !duration}
                onExport={run}
              />
            </div>
          </>
        )}
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button aria-label="Cerrar error" onClick={() => setError("")}>
              <X size={16} />
            </button>
          </div>
        )}
        <input
          ref={picker}
          hidden
          type="file"
          accept=".mp4,.webm,.mov,.mp3,.wav,.m4a,.ogg,.aac"
          onChange={(e) => {
            open(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <section id="about" className="about">
          <div className="about-icon">
            <Sparkles size={20} />
          </div>
          <div>
            <h3>Hecha para ser simple</h3>
            <p>
              Esta página fue vibecodeada por diversión. No tiene anuncios,
              popups, cuentas, cookies raras ni botones falsos. Tus archivos se
              procesan localmente en tu navegador. Solo existe para poder
              recortar cosas rápido sin tener que pasar por páginas llenas de
              anuncios XD.
            </p>
          </div>
          <span className="about-mark">✳</span>
        </section>
      </main>
      <footer>
        <a className="brand" href="./">
          Vibe<span>Cut</span>
        </a>
        <span>Hecho para cortar. Y ya.</span>
      </footer>
      {busy && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
          >
            <div className="status-icon">
              <Scissors size={28} />
            </div>
            <span className="eyebrow">SIN SALIR DE TU NAVEGADOR</span>
            <h2 id="export-title">{status}</h2>
            <p>Puedes dejar esta pestaña abierta mientras hacemos el corte.</p>
            <progress value={progress} max="100" />
            <strong aria-live="polite">{Math.floor(progress)} %</strong>
            <button
              onClick={() => {
                cancelled.current = true;
                cancel();
                setBusy(false);
                busyRef.current = false;
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
      {result && (
        <div className="modal-backdrop">
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ready-title"
          >
            <div className="status-icon">
              <Check size={28} />
            </div>
            <span className="eyebrow">UN BUEN CORTE</span>
            <h2 id="ready-title">Listo para compartir.</h2>
            <p className="result-name">{result.name}</p>
            <div className="result-stats">
              <span>{time(result.duration)}</span>
              <span>{result.resolution}</span>
              <strong>{mb(result.size)} MB</strong>
            </div>
            <a className="primary" href={result.url} download={result.name}>
              <Download size={18} /> Descargar
            </a>
            <button onClick={() => setResult(null)}>Editar otra vez</button>
          </div>
        </div>
      )}
    </div>
  );
}
