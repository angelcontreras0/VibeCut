import fs from 'node:fs';

function patch(path, replacements) {
  let s = fs.readFileSync(path, 'utf8');
  for (const [from, to] of replacements) {
    if (!s.includes(from)) throw new Error(`No encontré bloque esperado en ${path}: ${from.slice(0,100)}`);
    s = s.replace(from, to);
  }
  fs.writeFileSync(path, s);
}

patch('src/App.tsx', [[
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
      }`,
`      if (e.key.toLowerCase() === "i") {
        const t = clamp(media?.currentTime ?? current, 0, duration);
        const r = range.current;
        // Si I se marca después de O, conserva ambos puntos y ordénalos cronológicamente.
        if (t > r.end) rangeChange(r.end, t);
        else rangeChange(t, r.end);
      }
      if (e.key.toLowerCase() === "o") {
        const t = clamp(media?.currentTime ?? current, 0, duration);
        const r = range.current;
        // Si O se marca antes de I, conserva ambos puntos y ordénalos cronológicamente.
        if (t < r.start) rangeChange(t, r.start);
        else rangeChange(r.start, t);
      }`
], [
`                      <div className="trim-label">
                        <Scissors size={17} />
                        <span>Tu recorte</span>
                      </div>`,
`                      <div className="trim-label">
                        <div className="trim-label-title">
                          <Scissors size={17} />
                          <span>Tu recorte</span>
                        </div>
                        <small className="io-hint">
                          <kbd>I</kbd> Inicio <b>·</b> <kbd>O</kbd> Final
                        </small>
                      </div>`
]]);

patch('src/styles/app.css', [[
`.trim-label {
  display: flex;
  gap: 8px;
  align-items: center;
  color: #bbd49e;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}`,
`.trim-label {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  color: #bbd49e;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.trim-label-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.io-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #819080;
  font-size: 8px;
  font-weight: 500;
  letter-spacing: .2px;
}
.io-hint kbd {
  min-width: 18px;
  height: 18px;
  display: inline-grid;
  place-items: center;
  padding: 0 5px;
  border: 1px solid #445240;
  border-bottom-color: #2a3229;
  border-radius: 5px;
  background: #202720;
  color: #d7efbd;
  font: 700 9px/1 Inter, sans-serif;
  box-shadow: inset 0 1px #ffffff08, 0 1px 1px #0006;
}
.io-hint b {
  color: #556153;
  font-weight: 400;
}`
], [
`/* Trim handles follow selection boundaries immediately, without position tweening. */
.handle {
  transition: none;
  transform: none;
  width: 20px;
  min-width: 20px;
  overflow: visible;
  user-select: none;
  -webkit-user-drag: none;
}
.handle.end {
  transform: translateX(-100%);
}`,
`/* Los handles viven FUERA de la selección: incluso en rangos minúsculos nunca se pisan. */
.handle {
  transition: none;
  transform: translateX(-100%);
  width: 20px;
  min-width: 20px;
  overflow: visible;
  user-select: none;
  -webkit-user-drag: none;
  z-index: 6;
}
.handle.end {
  transform: none;
}`
], [
`.handle {
  width: 17px;
  min-width: 17px;
  top: 28px;
  border-radius: 3px 0 0 6px;
  transition: none;
  box-shadow: 1px 0 0 #d4ffa2;
}
.handle.end {
  border-radius: 0 3px 6px 0;
  box-shadow: -1px 0 0 #d4ffa2;
}`,
`.handle {
  width: 17px;
  min-width: 17px;
  top: 28px;
  border-radius: 3px 0 0 6px;
  transition: none;
  transform: translateX(-100%);
  box-shadow: 1px 0 0 #d4ffa2;
  z-index: 6;
}
.handle.end {
  transform: none;
  border-radius: 0 3px 6px 0;
  box-shadow: -1px 0 0 #d4ffa2;
}`
]]);

console.log('Hotfix I/O + UI aplicado');
