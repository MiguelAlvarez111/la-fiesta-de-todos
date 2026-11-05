/* La Fiesta de Todos · sedes de ICT
   La lista de sedes ya viene en el HTML (funciona sin JavaScript); aquí se agrega el mapa,
   la búsqueda de la sede más cercana y el botón de compartir. La ubicación nunca sale del teléfono. */
(() => {
  'use strict';

  const lista = document.getElementById('lista');
  const estado = document.getElementById('estado');
  const botonBuscar = document.getElementById('buscar');
  const avisoMapa = document.getElementById('aviso-mapa');
  const movimientoReducido = matchMedia('(prefers-reduced-motion: reduce)');
  const esTactil = matchMedia('(pointer: coarse)').matches;
  const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
  const LEJOS_KM = 40;

  const sedes = [...lista.querySelectorAll('.sede')].map((li, i) => ({
    li,
    i,
    nombre: li.dataset.nombre,
    punto: [Number(li.dataset.lat), Number(li.dataset.lon)],
    km: null,
    marcador: null,
  }));

  const decir = (texto, bien = false) => {
    estado.textContent = texto;
    estado.classList.toggle('bien', bien);
  };
  const desplazar = (el, bloque = 'start') =>
    el.scrollIntoView({ behavior: movimientoReducido.matches ? 'auto' : 'smooth', block: bloque });

  function distanciaKm([lat1, lon1], [lat2, lon2]) {
    const rad = (g) => (g * Math.PI) / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
      + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
  }
  function textoDistancia(km) {
    if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
    return `${numero.format(km)} km`;
  }

  /* ---------- Mapa ---------- */
  let mapa = null;
  let marcadorTu = null;
  const limitesSedes = () => window.L.latLngBounds(sedes.map((s) => s.punto));

  function crearMapa() {
    if (!window.L) return;
    const L = window.L;
    mapa = L.map('mapa', {
      zoomSnap: 0.25,
      scrollWheelZoom: false,
      dragging: !esTactil,
      tap: false,
      minZoom: 11,
      maxZoom: 18,
      attributionControl: true,
    });
    mapa.attributionControl.setPrefix(false);
    encuadrar(limitesSedes(), false); // el mapa necesita una vista antes de dibujar las velas
    // Mapa libre de OpenStreetMap (sin clave); estilos.css lo vuelve nocturno.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa);

    sedes.forEach((s) => {
      const icono = L.divIcon({ className: 'vela', html: '<i></i><b></b>', iconSize: [34, 34], iconAnchor: [17, 17] });
      s.marcador = L.marker(s.punto, { icon: icono, title: s.nombre, alt: s.nombre, riseOnHover: true })
        .bindTooltip(s.nombre, { className: 'etiqueta', direction: 'top', offset: [0, -16] })
        .on('click', () => elegir(s, { desdeMapa: true }))
        .addTo(mapa);
      s.marcador.getElement().style.setProperty('--i', s.i);
    });

    const VerTodas = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd() {
        const b = L.DomUtil.create('button', 'ver-todas');
        b.type = 'button';
        b.textContent = 'Ver todas las sedes';
        L.DomEvent.disableClickPropagation(b);
        L.DomEvent.on(b, 'click', () => encuadrar(limitesSedes()));
        return b;
      },
    });
    mapa.addControl(new VerTodas());

    // En el celular el mapa no atrapa el desplazamiento de la página: se mueve con dos dedos.
    if (esTactil) {
      const cont = mapa.getContainer();
      let ocultar = 0;
      cont.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) mapa.dragging.enable();
      }, { passive: true });
      cont.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) mapa.dragging.disable();
      }, { passive: true });
      cont.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;
        avisoMapa.hidden = false;
        clearTimeout(ocultar);
        ocultar = setTimeout(() => { avisoMapa.hidden = true; }, 1400);
      }, { passive: true });
    }

    // Al pasar de celular a pantalla ancha cambia el tamaño del mapa.
    new ResizeObserver(() => mapa.invalidateSize()).observe(mapa.getContainer());
  }

  function encuadrar(limites, animar = true) {
    if (!mapa) return;
    const ancho = mapa.getContainer().clientWidth;
    mapa.fitBounds(limites, {
      padding: ancho > 600 ? [70, 70] : [36, 46],
      maxZoom: 16,
      animate: animar && !movimientoReducido.matches,
    });
  }

  /* ---------- Elegir una sede (desde el mapa o desde la lista) ---------- */
  function elegir(s, { desdeMapa = false } = {}) {
    sedes.forEach((o) => o.li.classList.toggle('elegida', o === s));
    if (desdeMapa) {
      desplazar(s.li, 'center');
    } else if (mapa) {
      if (window.innerWidth < 960) desplazar(document.querySelector('.mapa-marco'));
      const destino = Math.max(mapa.getZoom(), 15);
      if (movimientoReducido.matches) mapa.setView(s.punto, destino);
      else mapa.flyTo(s.punto, destino, { duration: 0.9 });
      s.marcador.openTooltip();
    }
  }
  sedes.forEach((s) => {
    s.li.querySelector('.ver')?.addEventListener('click', () => elegir(s));
  });

  /* ---------- La sede más cercana ---------- */
  function buscar() {
    if (!('geolocation' in navigator)) {
      decir('Este navegador no deja buscar por ubicación. Elige tu sede en la lista.');
      return;
    }
    botonBuscar.setAttribute('aria-busy', 'true');
    decir('Buscando dónde estás…');
    navigator.geolocation.getCurrentPosition(encontrado, fallo, {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 300000,
    });
  }

  function encontrado(pos) {
    botonBuscar.removeAttribute('aria-busy');
    const yo = [pos.coords.latitude, pos.coords.longitude];
    sedes.forEach((s) => { s.km = distanciaKm(yo, s.punto); });
    const orden = [...sedes].sort((a, b) => a.km - b.km);
    orden.forEach((s) => {
      lista.appendChild(s.li);
      const p = s.li.querySelector('.distancia');
      p.textContent = `A ${textoDistancia(s.km)} de ti`;
      p.hidden = false;
      s.li.classList.remove('cercana', 'elegida');
      s.marcador?.getElement()?.classList.remove('cercana');
    });
    const primera = orden[0];

    if (primera.km > LEJOS_KM) {
      decir(`Estás a ${textoDistancia(primera.km)} de la sede más cercana en Cúcuta. Si vives en otra ciudad, busca tu sede en soyict.org.`);
      desplazar(document.querySelector('.otra-ciudad'));
      return;
    }

    primera.li.classList.add('cercana');
    decir(`La más cercana es ${primera.nombre}, a ${textoDistancia(primera.km)} de ti.`, true);

    if (mapa) {
      const L = window.L;
      if (!marcadorTu) {
        const icono = L.divIcon({ className: 'tu', html: '<b></b>', iconSize: [20, 20], iconAnchor: [10, 10] });
        marcadorTu = L.marker(yo, { icon: icono, title: 'Tú', alt: 'Tú', zIndexOffset: 1000, keyboard: false })
          .bindTooltip('Tú', { className: 'etiqueta', direction: 'top', offset: [0, -10] })
          .addTo(mapa);
      } else {
        marcadorTu.setLatLng(yo);
      }
      primera.marcador.getElement().classList.add('cercana');
      primera.marcador.setZIndexOffset(500);
      encuadrar(L.latLngBounds([yo, primera.punto]));
      primera.marcador.openTooltip();
    }
    desplazar(document.querySelector('.mapa-marco'));
  }

  function fallo(err) {
    botonBuscar.removeAttribute('aria-busy');
    if (err.code === err.PERMISSION_DENIED) {
      decir('No diste permiso para ver tu ubicación. Puedes activarlo en el navegador o elegir tu sede en la lista.');
    } else {
      decir('No logramos saber dónde estás. Revisa que la ubicación del teléfono esté encendida o elige tu sede en la lista.');
    }
  }

  botonBuscar.addEventListener('click', buscar);

  /* ---------- Compartir ---------- */
  const botonCompartir = document.getElementById('compartir');
  botonCompartir.addEventListener('click', async () => {
    const datos = {
      title: 'La Fiesta de Todos',
      text: 'Hay un lugar para ti en la mesa. Estas son las sedes de ICT en Cúcuta:',
      url: location.origin + '/',
    };
    try {
      if (navigator.share) {
        await navigator.share(datos);
        return;
      }
      await navigator.clipboard.writeText(datos.url);
      botonCompartir.textContent = 'Enlace copiado';
      setTimeout(() => { botonCompartir.textContent = 'Compartir esta página'; }, 2200);
    } catch (e) {
      if (e && e.name === 'AbortError') return; // cerró el menú de compartir
      botonCompartir.textContent = location.host;
    }
  });

  crearMapa();
})();
