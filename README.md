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

Proyecto `ine-graphs` en el scope personal `dani-luques-projects`, plan Hobby.

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

Decisiones:

- Se empieza en 1981 porque 1971-1980 solo publica hasta los 84 años y 2020 en
  adelante hasta los 105. Recortar mantiene la comparación visual.
- La escala horizontal es fija para todos los fotogramas. Si se reescala por
  frame, las barras "respiran" y la lectura se distorsiona.
- Filtro por `Conceptos demógraficos`, con la errata literal de la API. Buscar
  `demográficos` bien escrito devuelve cero series.

## Inflación

- Fuente: [IPC base 2025, tabla 76125](https://www.ine.es/jaxiT3/Tabla.htm?t=76125),
  ponderaciones de la tabla 76156.
- Selector de año (2002-2025): compara septiembre de 2026 con septiembre del año
  elegido.
- Serie mensual: variación anual de 2003-01 a 2026-09, derivada del índice.

Decisiones:

- **La tabla 50902 no sirve.** Es la que aparece en el ejemplo de la
  documentación del INE y está congelada en 2025-12. La viva es la 76125
  (`ver.2`, base 2025).
- **Las barras comparan el mismo mes entre años, no un mes con otro.** Comparar
  diciembre de 2019 con septiembre de 2026 hacía que ropa saliera −2,8 %: diciembre
  es caro y septiembre barato. La ropa cae un 13 % en enero y sube un 8 % en
  octubre. Con el mismo mes (septiembre → septiembre), ropa da +10,9 %.
- **El último dato de variación anual es un avance.** Octubre de 2026 aparece
  marcado como `T3_TipoDato: "Avance"` y no tiene índice definitivo detrás. La
  serie mensual lo descarta y termina en septiembre de 2026.
- La variación anual se calcula desde el índice (`índice[t] / índice[t−12] − 1`),
  no desde la serie publicada, para que coincida exactamente con los datos
  comparados y no arrastre avances.
- La escala de la serie mensual es **−10 % a +20 %** por defecto. Se expande si
  el grupo se sale: vivienda llega a +33,1 % y −18,0 %.
- La serie de 2002 atraviesa seis bases del IPC. Se verificó que el INE las
  empalma sin saltos: las variaciones mensuales en los eneros de cambio de base
  son normales (media 0,20 %, desv. 0,60 %).
- Los pesos de la cesta son de 2026, no de la fecha base. Sirven como contexto,
  no para calcular contribuciones exactas.

## Ancho de página

El contenedor llega a 1400 px, pero el texto largo no: la cabecera, el método y
la fuente se limitan a 780 px para mantener la línea de lectura. Los gráficos
usan todo el ancho. A partir de 1100 px la cabecera pasa a dos columnas
(titular a la izquierda, entradilla a la derecha) para no dejar un hueco muerto.

Los gráficos escalan su alto con el ancho: la pirámide hasta 820 px, la serie
mensual hasta 470 px, y las barras de inflación aumentan el alto de fila por
encima de 900 px.

## Trampas de la API del INE

- Tablas grandes devuelven 301 a `jsCache`. Llamar a `jsCache` directamente
  ahorra el salto.
- No comprime: la tabla 56934 son 4,8 MB sin gzip. Normalizada baja a 60 KB
  (74 veces menos).
- `tip=AM` devuelve `MetaData` como `{T3_Variable}`; `tip=AM&det=2` lo devuelve
  como `{Variable: {Nombre}}`. Hay que fijar una forma.
- Datos en orden descendente (más reciente primero).
- Algunos valores de la encuesta salarial llegan corruptos en categorías con
  muestra pequeña (salarios negativos).
