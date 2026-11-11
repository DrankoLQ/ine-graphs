# Notas internas

Decisiones de diseño, comprobaciones de datos y trampas de la API que no
pertenecen al README de presentación.

## Pirámide de población

### Decisiones

- Se empieza en 1981 porque 1971-1980 solo publica hasta los 84 años y 2020 en
  adelante hasta los 105. Recortar mantiene la comparación visual.
- La escala horizontal es fija para todos los fotogramas. Si se reescala por
  frame, las barras "respiran" y la lectura se distorsiona.
- Filtro por `Conceptos demógraficos`, con la errata literal de la API. Buscar
  `demográficos` bien escrito devuelve cero series.

## Inflación

### Decisiones

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

## Paro juvenil

### Decisiones

- Se usa la tasa publicada por la EPA, no una calculada como parados/activos. Así
  coincide con la tabla oficial y no arrastra diferencias de redondeo.
- «Menores de 25 años» es el grupo de 16 a 24. En la API no está en
  `Totales de edad`: vive en `Semiintervalos de edad`. El total usa
  `Totales de edad = Total`. Hay que leer las dos variables, no una.
- El mínimo de la serie es 2006-T3 (16,9 %), no 2007. En 2007-T2 la tasa fue
  18,1 %, pero un año antes había bajado más. El titular usa el mínimo real.
- La escala arranca en cero. El paro es una proporción; recortar el eje haría
  parecer mayores las diferencias entre jóvenes y total.
- La banda 2008-T1–2013-T4 es contexto editorial, no un dato de la EPA.
- La anotación del mínimo se quitó del gráfico: en móvil cruzaba la línea. El
  valor sigue en la nota y en la tabla.
- La tasa juvenil se mantuvo entre 1,91 y 2,58 veces la general en los 99
  trimestres. Ese es el dato que sostiene el titular, más que el pico de 2013.
- El último trimestre, 2026-T3, es definitivo; la EPA no publica avances
  trimestrales como el IPC.

### Trampas

- La tabla 14506 devuelve 240 series y 2,9 MB sin comprimir. Solo dos sirven para
  este gráfico.
- `T3_Periodo` identifica el trimestre, pero la fecha (día 1 de enero, abril,
  julio u octubre) es la fuente principal. El script valida que coincidan cuando
  el periodo está presente.

## Ancho de página

El contenedor llega a 1400 px, pero el texto largo no: la cabecera, el método y
la fuente se limitan a 780 px para mantener la línea de lectura. Los gráficos
usan todo el ancho. A partir de 1100 px la cabecera pasa a dos columnas
(titular a la izquierda, entradilla a la derecha) para no dejar un hueco muerto.

Los gráficos escalan su alto con el ancho: la pirámide hasta 820 px, la serie
mensual y la de paro hasta 470-480 px, y las barras de inflación aumentan el alto
de fila por encima de 900 px.

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
