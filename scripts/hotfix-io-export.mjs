import fs from 'node:fs';

function patch(path, replacements) {
  let s = fs.readFileSync(path, 'utf8');
  for (const [from, to] of replacements) {
    if (!s.includes(from)) throw new Error(`No encontré bloque esperado en ${path}: ${from.slice(0,80)}`);
    s = s.replace(from, to);
  }
  fs.writeFileSync(path, s);
}

patch('src/App.tsx', [[
`      if (e.key.toLowerCase() === "i") setStart(Math.min(current, end - 0.01));
      if (e.key.toLowerCase() === "o") setEnd(Math.max(current, start + 0.01));`,
`      if (e.key.toLowerCase() === "i") {
        const t = clamp(media?.currentTime ?? current, 0, duration);
        const r = range.current;
        if (t >= r.end - 0.01) rangeChange(t, Math.min(duration, t + 0.01));
        else rangeChange(t, r.end);
      }
      if (e.key.toLowerCase() === "o") {
        const t = clamp(media?.currentTime ?? current, 0, duration);
        const r = range.current;
        if (t <= r.start + 0.01) rangeChange(Math.max(0, t - 0.01), t);
        else rangeChange(r.start, t);
      }`
], [
`    } catch (e) {
      if (!cancelled.current)
        setError(
          e instanceof Error && e.message === "limit"
            ? "No pudimos alcanzar ese tamaño. Reduce la duración, baja la resolución o aumenta el límite."
            : "No se pudo exportar. Puede ser un codec incompatible o falta de memoria. Prueba con un archivo más pequeño o con MP4/MP3.",
        );
    } finally {`,
`    } catch (e) {
      if (!cancelled.current) {
        const message = e instanceof Error ? e.message : String(e);
        console.error("VibeCut export error:", e);
        if (message === "limit")
          setError("No pudimos alcanzar ese tamaño. Reduce la duración, baja la resolución o aumenta el límite.");
        else if (message.startsWith("load:"))
          setError("No se pudo iniciar el motor local de exportación. Recarga la página e inténtalo otra vez. Si continúa, prueba Chrome o Edge actualizado.");
        else if (/memory|out of bounds|allocation|oom/i.test(message))
          setError("El navegador se quedó sin memoria durante la exportación. Prueba un corte más corto, baja la resolución o cierra otras pestañas.");
        else
          setError("No se pudo exportar este archivo. VibeCut ya intentó un codec alternativo. Prueba bajar la resolución o usar MP4 H.264 / MP3. Detalle: " + message.slice(0, 140));
      }
    } finally {`
]]);

patch('src/media/export.ts', [[
`  rate?: number,
) {`,
`  rate?: number,
  codecOverride?: string,
) {`
], [
`    args.push("-c:v", s.format === "webm" ? "libvpx" : "libx264");
    if (s.format === "mp4")
      args.push("-preset", "ultrafast", "-pix_fmt", "yuv420p");
    else args.push("-deadline", "realtime", "-cpu-used", "8");`,
`    const codec = codecOverride ?? (s.format === "webm" ? "libvpx" : "libx264");
    args.push("-c:v", codec);
    if (s.format === "mp4") {
      if (codec === "libx264") args.push("-preset", "ultrafast");
      args.push("-pix_fmt", "yuv420p");
    } else args.push("-deadline", "realtime", "-cpu-used", "8");`
]]);

patch('src/media/ffmpeg.ts', [[
`      const base = new URL(import.meta.env.BASE_URL, location.href);`,
`      const base = new URL(import.meta.env.BASE_URL, document.baseURI);`
], [
`          if (!response.ok) throw new Error("load");`,
`          if (!response.ok) throw new Error(\`asset \${i}: HTTP \${response.status}\`);`
], [
`      throw e;`,
`      throw new Error(\`load:\${e instanceof Error ? e.message : String(e)}\`);`
], [
`  const listener = ({ time }: { time: number }) =>
    progress(Math.min(98, Math.max(0, (time / 1e6 / duration) * 100)));
  f.on("progress", listener);`,
`  const logs: string[] = [];
  const listener = ({ time }: { time: number }) =>
    progress(Math.min(98, Math.max(0, (time / 1e6 / duration) * 100)));
  const logListener = ({ message }: { message: string }) => {
    logs.push(message);
    if (logs.length > 40) logs.shift();
  };
  f.on("progress", listener);
  f.on("log", logListener);`
], [
`    const b = budget(duration, s, video);
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
    throw new Error("limit");`,
`    const b = budget(duration, s, video);
    let rate = b.video;
    const codecs = video && s.format === "mp4" ? ["libx264", "mpeg4"] : [undefined];
    let lastError = "encode";
    for (const codec of codecs) {
      for (let attempt = 0; attempt < 4; attempt++) {
        status(codec === "mpeg4" ? "Probando modo compatible…" : attempt ? "Ajustando al límite de tamaño…" : "Exportando…");
        progress(0);
        logs.length = 0;
        try { await f.deleteFile(out); } catch {}
        const code = await f.exec(argsFor(input, out, start, duration, s, video, rate, codec));
        if (code !== 0) {
          lastError = logs.slice(-6).join(" | ") || \`ffmpeg exit \${code}\`;
          break;
        }
        const data = (await f.readFile(out)) as Uint8Array;
        if (!b.limit || data.byteLength < b.limit * 1e6) {
          progress(100);
          return new Blob([new Uint8Array(data)], {
            type: video ? (s.format === "mp4" ? "video/mp4" : "video/webm") : (s.format === "mp3" ? "audio/mpeg" : "audio/wav"),
          });
        }
        if (!video || s.format === "wav") throw new Error("limit");
        rate = Math.floor(rate * ((b.limit * 1e6) / data.byteLength) * 0.88);
        if (rate < 16) throw new Error("limit");
      }
      rate = b.video;
    }
    throw new Error(\`encode:\${lastError.slice(-300)}\`);`
], [
`    f.off("progress", listener);`,
`    f.off("progress", listener);
    f.off("log", logListener);`
]]);

console.log('VibeCut hotfix aplicado');
// trigger one-shot workflow
