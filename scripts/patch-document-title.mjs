import fs from 'node:fs';

const path = 'src/App.tsx';
let s = fs.readFileSync(path, 'utf8');
const needle = `  useEffect(\n    () => () => {\n      if (result) URL.revokeObjectURL(result.url);\n    },\n    [result],\n  );`;
const replacement = `${needle}\n  useEffect(() => {\n    if (error) {\n      document.title = \"VibeCut — Error\";\n      return;\n    }\n    if (busy) {\n      const pct = Math.max(0, Math.min(100, Math.round(progress)));\n      document.title = pct > 0 ? \`VibeCut — \${pct}%\` : \"VibeCut — Renderizando...\";\n      return;\n    }\n    if (result) {\n      document.title = \"VibeCut — Listo ✓\";\n      return;\n    }\n    document.title = \"VibeCut\";\n  }, [busy, progress, result, error]);`;
if (!s.includes(needle)) throw new Error('No encontré el bloque esperado para insertar el título dinámico');
s = s.replace(needle, replacement);
fs.writeFileSync(path, s);
console.log('Título dinámico de VibeCut agregado');
