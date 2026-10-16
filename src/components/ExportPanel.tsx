import { Download, ArrowDownRight, ShieldCheck } from "lucide-react";
import { budget, type Settings } from "../media/export";
export function ExportPanel({
  settings: s,
  setSettings,
  video,
  duration,
  busy,
  onExport,
}: {
  settings: Settings;
  setSettings: (s: Settings) => void;
  video: boolean;
  duration: number;
  busy: boolean;
  onExport: () => void;
}) {
  const b = budget(duration, s, video);
  const set = (key: keyof Settings, value: string | number) =>
    setSettings({ ...s, [key]: value });
  const estimated =
    s.format === "wav"
      ? (duration * 44100 * 4) / 1e6
      : b.limit
        ? b.estimate
        : video
          ? 0
          : (duration * s.audio) / 8000;
  const impossible =
    !!b.limit &&
    ((video && b.video < 16) ||
      (!video && s.format === "wav" && estimated > b.limit) ||
      (!video && b.audio < 8));
  const low = video && b.limit > 0 && b.video < 1400;
  return (
    <aside className="export-panel">
      <div className="panel-heading">
        <span className="eyebrow">ÚLTIMO PASO</span>
        <h2>A tu manera.</h2>
        <p>El corte perfecto. El tamaño justo.</p>
      </div>
      <label>
        Formato
        <select value={s.format} onChange={(e) => set("format", e.target.value)}>
          {(video ? ["mp4", "webm"] : ["mp3", "wav"]).map((x) => (
            <option key={x} value={x}>{x.toUpperCase()}</option>
          ))}
        </select>
      </label>
      {video && (
        <div className="two-col">
          <label>
            Resolución
            <select value={s.resolution} onChange={(e) => set("resolution", e.target.value)}>
              <option value="original">Original</option>
              {["1080", "720", "480"].map((x) => <option key={x} value={x}>{x}p</option>)}
            </select>
          </label>
          <label>
            FPS
            <select value={s.fps} onChange={(e) => set("fps", e.target.value)}>
              <option value="original">Original</option><option>60</option><option>30</option>
            </select>
          </label>
        </div>
      )}
      <label>
        Audio
        <select disabled={s.format === "wav"} value={s.audio} onChange={(e) => set("audio", +e.target.value)}>
          {(video ? [128, 96, 64] : [320, 256, 192, 128, 96]).map((x) => <option key={x} value={x}>{x} kbps</option>)}
        </select>
      </label>
      <div className="divider" />
      <label>Tamaño de archivo</label>
      <div className="presets">
        {[["quality", "Calidad máxima"], ["20", "Discord <20 MB"], ["10", "Discord <10 MB"], ["custom", "Personalizado"]].map(([v, t]) => (
          <button key={v} className={s.mode === v ? "chosen" : ""} onClick={() => set("mode", v)}>{t}</button>
        ))}
      </div>
      {s.mode === "custom" && (
        <label className="custom-size">Límite en MB<input type="number" min="0.1" max="2000" step="0.1" value={s.target} onChange={(e) => set("target", Math.max(0.1, +e.target.value))} /></label>
      )}
      <div className="estimate">
        <span>Tamaño estimado</span>
        <strong>{estimated ? `${estimated.toFixed(1)} MB` : "Según el contenido"}</strong>
        {b.limit > 0 && (
          <small className={impossible ? "red" : estimated / b.limit > 0.96 ? "yellow" : "green"}>
            ● {impossible ? "Supera el tamaño objetivo" : estimated / b.limit > 0.96 ? "Muy cerca del límite" : "Cabe en tu límite"}
          </small>
        )}
      </div>
      {low && s.resolution !== "480" && (
        <div className="recommendation"><ArrowDownRight size={16} /><p>Para alcanzar {b.limit} MB recomendamos {s.resolution === "720" ? "480" : "720"}p.<button onClick={() => set("resolution", s.resolution === "720" ? "480" : "720")}>Aplicar recomendación</button></p></div>
      )}
      {low && s.resolution === "480" && <p className="error">Con este bitrate la calidad puede ser baja. Recomendamos acortar la selección o aumentar el límite.</p>}
      {impossible && <p className="error">Recorta más o aumenta el límite. Para audio WAV, elige MP3.</p>}
      <button className="primary export-button" disabled={busy || impossible || duration <= 0} onClick={onExport}><Download size={18} /> Exportar {video ? "video" : "audio"}</button>
      <p className="local-note"><ShieldCheck size={14} /> Se procesa en tu dispositivo</p>
    </aside>
  );
}
