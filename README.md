# Gráficos del INE

Cuatro historias con datos del Instituto Nacional de Estadística, en español y
sin dependencias en tiempo de ejecución.

1. **España envejece por la base** (`/piramide`) — pirámide de población animada,
   1981-2025. La edad más común pasó de 16 a 48 años.
2. **No todo sube igual** (`/inflacion`) — inflación por grupos de consumo,
   comparando septiembre de 2026 con el mismo mes de cualquier año desde 2002.
   La comida sube un 41 %; la ropa, un 11 %.
3. **Ser joven duplica el paro** (`/paro`) — tasa de paro trimestral de los
   menores de 25 años frente al total, 2002-2026. En 2013 llegó al 56,9 %; ahora
   es del 23,3 %.
4. **El sueldo sube un 35 %, el poder adquisitivo un 1 %** (`/salario-real`) —
   salario nominal y real, 2008-2024. Descontando el IPC, la ganancia real es del
   1,1 %.

## Publicación

https://ine-graphs.vercel.app

El repositorio está conectado a Vercel: cada push a `main` construye y publica
el sitio. Los datos se regeneran en local y se versionan antes del push:

```bash
npm run data
git add src/data
git commit -m "data: actualizar snapshots"
git push
```

Despliegue manual, si hace falta:

```bash
npm run data && npm run build && npx vercel --prod
```

## Comandos

```bash
npm install
npm run data          # descarga todas las fuentes y genera los JSON
npm run dev           # servidor de desarrollo en :4321
npm run build         # sitio estático en dist/
npm run preview       # sirve dist/
npm test              # tests unitarios de las fórmulas
npm run verify        # invariantes sobre los JSON generados
npm run check         # tests + verify + build
npm run smoke         # comprobaciones en Chromium (con preview activo)
```

Scripts de datos por separado: `npm run data:piramide`, `npm run data:inflacion`,
`npm run data:paro`, `npm run data:salario-real`.

## Estructura

```
scripts/
  fetch-piramide.mjs      descarga + normaliza + valida la pirámide
  fetch-inflacion.mjs     descarga + normaliza + valida la inflación
  fetch-paro.mjs          descarga + normaliza + valida la EPA
  fetch-salario-real.mjs  descarga + normaliza + valida salarios e IPC
  verify.mjs              invariantes y contraste sobre los JSON
  smoke.mjs               comprobaciones de navegador
tests/
  calc.test.mjs           tests unitarios de las fórmulas
src/
  layouts/Layout.astro    cabecera, navegación, pie
  styles/global.css       estilos compartidos
  lib/calc.js             cálculos puros compartidos
  lib/pyramid.js          D3: pirámide animada
  lib/inflation.js        D3: barras de inflación
  lib/inflation-series.js D3: serie mensual
  lib/unemployment.js     D3: serie trimestral de paro
  lib/real-wage.js        D3: salario nominal y real
  pages/index.astro       índice de historias
  pages/piramide.astro    historia 1
  pages/inflacion.astro   historia 2
  pages/paro.astro        historia 3
  pages/salario-real.astro historia 4
  data/*.json             generados, versionados
```

## Verificación

- `npm test`: 15 tests unitarios de las fórmulas (medias, deflactor, variaciones, pirámide y paro).
- `npm run verify`: 12 comprobaciones sobre los JSON. Reconstruye los cálculos desde las series fuente, comprueba la identidad `nominal = real × IPC` y contrasta la variación anual del IPC con la publicada por el INE (3.990 comparaciones).
- `npm run smoke`: 73 comprobaciones de navegador.
- GitHub Actions ejecuta tests, verificación, build y smoke en cada push.

El archivo `inflacion-fuente.json` guarda los índices y las tasas publicadas que usa la auditoría; no se sirve al navegador.

## Pirámide de población

- Fuente: [Estadística Continua de Población, tabla 56934](https://www.ine.es/jaxiT3/Tabla.htm?t=56934)
- Endpoint: `https://servicios.ine.es/wstempus/jsCache/ES/DATOS_TABLA/56934?tip=AM`
- 45 fotogramas (1981-2025), edades 0-99, último trimestre de cada año.

## Inflación

- Fuente: [IPC base 2025, tabla 76125](https://www.ine.es/jaxiT3/Tabla.htm?t=76125),
  ponderaciones de la tabla 76156.
- Selector de año (2002-2025): compara septiembre de 2026 con septiembre del año
  elegido.
- Serie mensual: variación anual de 2003-01 a 2026-09, derivada del índice.

## Paro juvenil

- Fuente: [EPA, tabla 14506](https://www.ine.es/jaxiT3/Tabla.htm?t=14506).
- Tasa de paro trimestral, total nacional, ambos sexos, de 2002-T1 a 2026-T3.
- Compara los menores de 25 años (16-24) con la tasa del conjunto de 16 y más.

## Salario real

- Fuente: [EAES, tabla 28191](https://www.ine.es/jaxiT3/Tabla.htm?t=28191), e
  [IPC base 2025, tabla 76125](https://www.ine.es/jaxiT3/Tabla.htm?t=76125).
- Ganancia bruta anual media por trabajador, 2008-2024.
- Salario real en euros de 2008: nominal × IPC de 2008 / IPC del año. El IPC
  anual es la media de los doce índices mensuales.
- El IPC acumulado de cada año aparece en el tooltip y en la tabla.
