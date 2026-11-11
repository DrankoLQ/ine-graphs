# Gráficos del INE

Dos historias con datos del Instituto Nacional de Estadística, en español y sin
dependencias en tiempo de ejecución.

1. **España envejece por la base** (`/`) — pirámide de población animada,
   1981-2025. La edad más común pasó de 16 a 48 años.
2. **No todo sube igual** (`/inflacion`) — inflación por grupos de consumo,
   comparando septiembre de 2026 con el mismo mes de cualquier año desde 2002.
   La comida sube un 41 %; la ropa, un 11 %.

## Publicación

https://ine-graphs.vercel.app

Para actualizar los datos y publicar:

```bash
npm run data && npm run build && npx vercel --prod
```

## Comandos

```bash
npm install
npm run data          # descarga ambas fuentes y genera los JSON
npm run dev           # servidor de desarrollo en :4321
npm run build         # sitio estático en dist/
npm run preview       # sirve dist/
npm run smoke         # comprobaciones en Chromium (con preview activo)
```

Scripts de datos por separado: `npm run data:piramide`, `npm run data:inflacion`.

## Estructura

```
scripts/
  fetch-piramide.mjs      descarga + normaliza + valida la pirámide
  fetch-inflacion.mjs     descarga + normaliza + valida la inflación
  smoke.mjs               comprobaciones de navegador
src/
  layouts/Layout.astro    cabecera, navegación, pie
  styles/global.css       estilos compartidos
  lib/pyramid.js          D3: pirámide animada
  lib/inflation.js        D3: barras de inflación
  lib/inflation-series.js D3: serie mensual
  pages/index.astro       historia 1
  pages/inflacion.astro   historia 2
  data/*.json             generados, versionados
```

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
