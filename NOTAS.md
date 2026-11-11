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

## Salario real

### Decisiones

- **El gráfico muestra variación acumulada desde 2008, no niveles en euros.** Así
  el 35 % nominal y el 1,1 % real se comparan directamente y el eje no necesita
  un recorte que exagere las diferencias. La tabla sí da los euros.
- El salario real se calcula en euros de 2008: `nominal × IPC(2008) / IPC(año)`.
  Con eso ambas líneas arrancan en el mismo punto y el hueco entre ellas es el
  efecto de la inflación.
- El IPC anual es la media de los doce índices mensuales, no el dato de
  diciembre. Es el deflactor coherente con una ganancia anual.
- La serie de la EAES es la media nacional de ambos sexos. En la API, la media
  no lleva la variable `Percentiles simples`; las medianas y cuantiles sí. Hay
  que filtrar por `Medidas estadísticas = Media` y exigir que esa variable no
  exista.
- La serie empieza en 2008, primer año de la tabla 28191, y termina en 2024. El
  dato de 2024 es definitivo.
- El mínimo real es 2013 (−4,7 %) y el máximo, 2009 (+3,2 %). El máximo de 2009
  no es un error: el IPC medio cayó aquel año, así que el salario nominal ganó
  poder adquisitivo. En 2022 la inflación volvió a recortarlo.
- La etiqueta «inflación» dentro del hueco es una simplificación. El hueco en
  puntos porcentuales (33,9) no coincide exactamente con la inflación acumulada
  (33,5 %) por el efecto compuesto; la nota da la cifra exacta.
- Se valoró una tercera línea con el IPC acumulado. Se descartó: en 2024 queda
  1,5 puntos por debajo del nominal y en los años de caída real lo cruza, así
  que rompe la lectura del hueco. El IPC va en el tooltip y en la tabla.
- El titular usa 44 px y una pausa forzada entre las dos frases. Con los 52 px
  del resto de páginas, el `%` quedaba huérfano en la columna izquierda de la
  cabecera a dos columnas.
- Es una ganancia bruta anual media por trabajador: no descuenta impuestos ni
  cotizaciones y no representa a cada hogar. El IPC no incluye el coste de la
  vivienda en propiedad, así que el poder adquisitivo real puede estar
  sobreestimado para quien paga una hipoteca.

### Trampas

- La tabla 28191 devuelve 324 series y 817 KB. La media nacional es una sola.
- El IPC de 2008-2024 tiene doce meses definitivos por año; el avance de octubre
  de 2026 queda fuera del periodo y no se usa.
- El salario real no se calcula con el IPC de diciembre ni con el IPC
  interanual: se usa la media anual de los índices mensuales.

## Verificación

- **Tests unitarios** (`npm test`): 15 casos con valores calculados a mano para
  la media anual, el deflactor, las variaciones acumuladas, el cambio entre el
  mismo mes, la variación anual, los estadísticos de la pirámide y los del paro.
  También cubren errores de entrada: arrays vacíos, índices cero, longitudes
  distintas y tasas fuera de rango.
- **Invariantes** (`npm run verify`): 12 comprobaciones sobre los JSON. Las
  barras de inflación se reconstruyen desde los índices fuente; la serie anual se
  reconstruye mes a mes; el salario real y sus variaciones se recalculan desde el
  nominal y el IPC mensual; y se comprueba la identidad
  `(1 + nominal) = (1 + real) × (1 + IPC)` en los 17 años.
- **Contraste con el INE**: la variación anual que calculamos se compara con la
  serie `Variación anual` publicada en la misma tabla 76125. Son 3.990
  comparaciones; la diferencia máxima observada es 0,050 pp y el test falla por
  encima de 0,06 pp. Es la comprobación más independiente del proyecto.
- **Fuente de auditoría**: `inflacion-fuente.json` guarda los 297 índices
  mensuales de las 14 series y las tasas anuales publicadas. No se importa en
  ninguna página y no viaja al navegador.
- **Salario**: `salario-real.json` guarda los 12 índices mensuales de cada año.
  La media anual, el salario real, las variaciones y el IPC acumulado se
  reconstruyen desde ahí.
- **Pirámide**: se comprueban las longitudes y los valores no negativos de los 45
  años, y los totales y edades modales de 1981 y 2025 contra las cifras
  conocidas. No hay un total oficial por trimestre comparable para los 45 años:
  la serie `Todas las edades` de la ECP usa otra fecha de referencia.
- **Paro**: se reconstruyen el último dato, el pico, el mínimo y la relación
  juvenil/total sobre los 99 trimestres, no solo sobre los extremos.
- **CI**: GitHub Actions ejecuta tests, verificación, build y smoke en cada push.
  La descarga del INE sigue siendo el único paso con red; los tests y la
  verificación funcionan con los snapshots versionados.
- Límite: estos tests validan nuestras transformaciones, no la calidad de la
  fuente. Si el INE revisa una serie, los snapshots y las guardas cambian a la
  vez; el contraste con la tasa publicada es lo que detecta una fórmula mal
  aplicada.

## Ancho de página

El contenedor llega a 1400 px, pero el texto largo no: la cabecera, el método y
la fuente se limitan a 780 px para mantener la línea de lectura. Los gráficos
usan todo el ancho. A partir de 1100 px la cabecera pasa a dos columnas
(titular a la izquierda, entradilla a la derecha) para no dejar un hueco muerto.

Los gráficos escalan su alto con el ancho: la pirámide hasta 820 px, la serie
mensual y la de paro hasta 470-480 px, la de salario real hasta 460 px, y las
barras de inflación aumentan el alto de fila por encima de 900 px.

El índice usa dos columnas en escritorio. La columna derecha encadena inflación,
salario real e hipoteca (coste de vida); la izquierda, pirámide, paro y brecha
(población y trabajo).

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
