# Página estática servida con Caddy (Railway la construye desde este archivo).
FROM caddy:2.8.4-alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY index.html app.js estilos.css favicon.svg /srv/
COPY fuentes/ /srv/fuentes/
COPY img/ /srv/img/
COPY vendor/ /srv/vendor/
COPY mapa/ /srv/mapa/
