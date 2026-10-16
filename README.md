# VibeCut

VibeCut es una herramienta web para **recortar video o audio, comprimirlo y exportarlo** sin subir tus archivos a ningún servidor.

## Qué hace

- Recorte preciso de video y audio.
- Timeline con playhead, handles de inicio/final y zoom.
- Waveform de audio con WaveSurfer.js.
- Reproducción de la selección y loop.
- Exportación local con FFmpeg.wasm.
- MP4 / WebM para video.
- MP3 / WAV para audio.
- Presets de tamaño para **Discord <20 MB**, **Discord <10 MB** y límite personalizado.
- Cálculo automático de bitrate y verificación del tamaño final.
- Fade in / fade out para audio.
- Todo se procesa localmente en el navegador.

## Stack

- React
- TypeScript
- Vite
- FFmpeg.wasm
- WaveSurfer.js

## Desarrollo

Requiere Node.js 22 o posterior.

```bash
npm install
npm run dev
```

Build de producción:

```bash
npm run build
npm run preview
```

El script `scripts/prepare-core.mjs` prepara el núcleo de FFmpeg para servirlo desde el mismo origen. El WASM se divide en dos assets para funcionar cómodamente en hosting estático.

## GitHub Pages

Este repositorio incluye `.github/workflows/pages.yml`.

1. Ve a **Settings → Pages**.
2. En **Build and deployment**, selecciona **GitHub Actions**.
3. Cada push a `main` compilará y desplegará la página.

La URL del proyecto será:

`https://angelcontreras0.github.io/VibeCut/`

Vite usa `base: './'`, así que los assets funcionan correctamente dentro del subdirectorio de GitHub Pages.

## Privacidad

No hay backend, cuentas, trackers ni subida de archivos. El video/audio se queda en el dispositivo del usuario y FFmpeg.wasm procesa la exportación dentro del navegador.

> **Hecha para ser simple**  
> Esta página fue vibecodeada por diversión. No tiene anuncios, popups, cuentas, cookies raras ni botones falsos. Solo existe para poder recortar cosas rápido sin tener que pasar por páginas llenas de anuncios XD.

## Notas

La compatibilidad de previsualización depende del navegador y del codec del archivo. Para una experiencia más consistente se recomienda MP4 H.264 para video y MP3/WAV para audio. Archivos grandes pueden requerir bastante memoria porque FFmpeg.wasm procesa todo localmente.
