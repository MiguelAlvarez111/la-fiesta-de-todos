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

## Publicación

Railway construye el `Dockerfile` (Caddy sirve los archivos en el puerto `PORT`, con compresión y cabeceras de
seguridad). Cada cambio en la rama `main` de GitHub se publica solo; también se puede subir a mano con `railway up`.

Probar en local: `python3 -m http.server 8941` en esta carpeta y abrir `http://127.0.0.1:8941/`.
