import fs from 'node:fs';

function patch(path, replacements) {
  let text = fs.readFileSync(path, 'utf8');
  for (const [from, to] of replacements) {
    if (!text.includes(from)) throw new Error(`Missing patch target in ${path}: ${from.slice(0, 100)}`);
    text = text.replace(from, to);
  }
  fs.writeFileSync(path, text);
}

patch('src/App.tsx', [
  [
    'import { exportMedia, cancel, audioPreview } from "./media/ffmpeg";',
    'import { exportMedia, cancel, audioPreview, gifPreview } from "./media/ffmpeg";'
  ],
  [
    '    [video, setVideo] = useState(true),\n    [media, setMedia] = useState<HTMLMediaElement | null>(null),',
    '    [video, setVideo] = useState(true),\n    [isGif, setIsGif] = useState(false),\n    [media, setMedia] = useState<HTMLMediaElement | null>(null),'
  ],
  [
    '  function open(f?: File) {',
    '  async function open(f?: File) {'
  ],
  [
    '      !["mp4", "webm", "mov", "mp3", "wav", "m4a", "ogg", "aac"].includes(ext)',
    '      !["mp4", "webm", "mov", "gif", "mp3", "wav", "m4a", "ogg", "aac"].includes(ext)'
  ],
  [
    '        "Este formato no está disponible. Prueba con MP4, WebM, MP3 o WAV.",',
    '        "Este formato no está disponible. Prueba con MP4, WebM, GIF, MP3 o WAV.",'
  ],
  [
`    media?.pause();
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
    setMedia(null);`,
`    media?.pause();
    const gif = ext === "gif";
    const v = ["mp4", "webm", "mov", "gif"].includes(ext);
    let u = URL.createObjectURL(f);

    if (gif) {
      busyRef.current = true;
      cancelled.current = false;
      setBusy(true);
      setProgress(0);
      setStatus("Preparando GIF…");
      try {
        const preview = await gifPreview(f);
        if (cancelled.current) return;
        URL.revokeObjectURL(u);
        u = URL.createObjectURL(preview);
      } catch (e) {
        if (!cancelled.current)
          setError("No pudimos preparar este GIF. Prueba con uno más pequeño o conviértelo primero a MP4.");
        URL.revokeObjectURL(u);
        return;
      } finally {
        setBusy(false);
        busyRef.current = false;
      }
    }

    setFile(f);
    setVideo(v);
    setIsGif(gif);
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
    setMedia(null);`
  ],
  [
    '<FileVideo size={14} /> MP4 · WebM · MOV',
    '<FileVideo size={14} /> MP4 · WebM · MOV · GIF'
  ],
  [
`                      onWaveError={() => setWaveError(true)}
                    />`,
`                      onWaveError={() => setWaveError(true)}
                      silent={isGif}
                    />`
  ],
  [
    '{waveError && (',
    '{waveError && !isGif && ('
  ],
  [
    'accept=".mp4,.webm,.mov,.mp3,.wav,.m4a,.ogg,.aac"',
    'accept=".mp4,.webm,.mov,.gif,.mp3,.wav,.m4a,.ogg,.aac"'
  ]
]);

patch('src/components/Timeline.tsx', [
  [
    '  onWaveError: () => void;\n}',
    '  onWaveError: () => void;\n  silent?: boolean;\n}'
  ],
  [
`        <Waveform
          url={p.url}
          media={p.media}
          zoom={0}
          video={p.video}
          onError={p.onWaveError}
        />`,
`        {p.silent ? (
          <div className="waveform" aria-hidden="true" />
        ) : (
          <Waveform
            url={p.url}
            media={p.media}
            zoom={0}
            video={p.video}
            onError={p.onWaveError}
          />
        )}`
  ]
]);

patch('public/i18n.js', [
  [
    "'Exportar video':'Export video','Exportar audio':'Export audio'",
    "'Exportar video':'Export video','Exportar audio':'Export audio','Exportar GIF':'Export GIF','GIF optimizado: VibeCut crea una paleta dedicada y, si usas un límite, ajusta colores, FPS y resolución automáticamente para intentar reducir el peso.':'Optimized GIF: VibeCut builds a dedicated palette and, when you use a size limit, automatically adjusts colors, FPS, and resolution to reduce the file size.','Mejor calidad':'Best quality','Optimización':'Optimization','Objetivo < ':'Target < ','Paleta optimizada':'Optimized palette','Varios intentos automáticos si hace falta':'Automatic retries when needed','Generando GIF optimizado…':'Generating optimized GIF…','Optimizando GIF para alcanzar el tamaño…':'Optimizing GIF to reach the target size…','Preparando GIF…':'Preparing GIF…','No pudimos preparar este GIF. Prueba con uno más pequeño o conviértelo primero a MP4.':'We could not prepare this GIF. Try a smaller one or convert it to MP4 first.'"
  ]
]);

console.log('GIF UI patch applied.');
