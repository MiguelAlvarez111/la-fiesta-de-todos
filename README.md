# La Fiesta de Todos · sedes de ICT en Cúcuta

Página a la que lleva el código QR que aparece en la pantalla LED durante la obra «La Fiesta de Todos» (Navidad 2026,
ICT · Cruzada Estudiantil y Profesional de Colombia). Muestra las sedes de ICT en Cúcuta y Villa del Rosario en un mapa de
noche, busca la más cercana con la ubicación del teléfono y ofrece «Cómo llegar», WhatsApp y llamada. Al final están las
sedes de Chinácota, Ocaña y Pamplona y el enlace al buscador de soyict.org para otras ciudades.

## De dónde salen los datos

Direcciones y teléfonos: buscador público «¿Dónde estamos?» de [soyict.org](https://soyict.org/donde-estamos/),
consultado el 5 de noviembre de 2026 (Colombia › Norte de Santander). No se muestran los nombres de los directores.

La posición de cada vela en el mapa se calculó con OpenStreetMap (esquina de las dos calles de la dirección o, si el mapa
no las tiene, el centro del barrio), así que es aproximada. El botón «Cómo llegar» abre Google Maps con la dirección
exacta. Los horarios de reunión no están publicados: el mensaje de WhatsApp ya viene escrito para preguntarlos.

## Cómo está hecha

HTML, CSS y JavaScript sin dependencias de compilación. Todo se sirve desde el mismo dominio (fuentes Imbue y Atkinson
Hyperlegible Next, Leaflet 1.9.4) salvo los mapas, que vienen de `tile.openstreetmap.org` (uso moderado y con
atribución, como pide su política). La lista de sedes está escrita en `index.html` y funciona aunque el mapa no cargue;
`app.js` agrega el mapa, la sede más cercana y el botón de compartir. La ubicación del visitante se usa solo en su
teléfono: no hay cookies, analítica ni envío de datos.

Para cambiar una sede, editar su bloque `<li class="sede" …>` en `index.html` (nombre, `data-lat`/`data-lon`,
dirección, teléfonos y enlaces).

## Componentes y movimiento

Criterios tomados de las skills de diseño de [Emil Kowalski](https://github.com/emilkowalski/skills),
[Impeccable](https://github.com/pbakaus/impeccable) y [Taste](https://github.com/Leonxlnx/taste-skill): toda animación
responde a algo (un toque, un cambio de estado, un lugar en el mapa), un solo momento con autor y nada más moviéndose solo.

- **Velas que se encienden:** al aparecer el mapa, de oeste a este, con esperas que se acortan (una ola, no un
  metrónomo); cada llama nace de una chispa desenfocada, nunca desde cero.
- **Ficha de la sede:** al tocar una vela o el nombre de una sede sube una hoja (curva de cajón tipo iOS, 500 ms) con
  cómo llegar, WhatsApp, llamar, copiar la dirección y guardar el contacto (archivo .vcf). Se cierra con la X, con Esc,
  tocando el mapa o arrastrándola hacia abajo: basta un gesto rápido (velocidad > 0,11 px/ms), y hacia arriba ofrece
  fricción. En pantalla ancha es una tarjeta sobre el mapa y el mapa deja la vela en la parte libre.
- **La más cercana:** la lista se reordena (cada sede viaja a su puesto; la duración crece con la distancia), el mapa
  encuadra a la persona y la sede, sale un anillo desde su punto, se traza un camino de luz y sube la ficha.
- **Avisos breves** («Dirección copiada», «Enlace copiado»): entran y salen por el mismo borde; el reloj se detiene si
  la pestaña no se ve.
- **Detalles:** los botones se hunden al tocarlos (escala 0,97), el botón principal invita cada 6,5 s con un anillo
  hasta que alguien lo usa (y descansa si no se ve), los efectos de pasar el puntero solo existen con mouse, el anillo
  de foco se asienta de 6 a 2 px, y la selección de texto y la barra de desplazamiento usan los colores de la página.
- **Reducir movimiento** (ajuste del teléfono): nada se desplaza ni crece; quedan los fundidos.

## Publicación

Railway construye el `Dockerfile` (Caddy sirve los archivos en el puerto `PORT`, con compresión y cabeceras de
seguridad). Cada cambio en la rama `main` de GitHub se publica solo; también se puede subir a mano con `railway up`.

Probar en local: `python3 -m http.server 8941` en esta carpeta y abrir `http://127.0.0.1:8941/`.
