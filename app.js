/* La Fiesta de Todos · sedes de ICT
   La lista de sedes ya viene en el HTML (funciona sin JavaScript). Aquí se agregan:
   - el mapa con una vela por sede, que se enciende de oeste a este cuando el mapa aparece;
   - en el celular (modo app): las sedes son tarjetas que se deslizan con el pulgar y el mapa vuela a la vela de cada una;
     en pantalla ancha: lista a la izquierda y ficha de la sede sobre el mapa;
   - la sede más cercana: la lista se reordena, aparece un camino de luz desde ti y se resalta su tarjeta o su ficha;
   - copiar la dirección, guardar el contacto y compartir, con un aviso breve;
   - la mesa: el momento de scroll (la mesa se dibuja, ocho velas se encienden, el fondo pasa de frío a cálido).
   La ubicación nunca sale del teléfono. Con «reducir movimiento» nada se desplaza: solo fundidos. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const lista = $('#lista');
  const estado = $('#estado');
  const botonBuscar = $('#buscar');
  const marcoMapa = $('.mapa-marco');
  const reducido = matchMedia('(prefers-reduced-motion: reduce)');
  const ancho = matchMedia('(min-width: 960px)');
  const punteroFino = matchMedia('(hover: hover) and (pointer: fine)');
  const esTactil = matchMedia('(pointer: coarse)').matches;
  const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
  const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';
  const LEJOS_KM = 40;
  const URL_PAGINA = 'https://lafiestadetodos-production.up.railway.app/';
  const enRiel = () => !ancho.matches;

  const sedes = [...lista.querySelectorAll('.sede')].map((li, i) => ({
    li,
    i,
    nombre: li.dataset.nombre,
    direccion: li.querySelector('.direccion')?.textContent.trim() ?? '', // antes de añadirle el botón «Copiar»
    punto: [Number(li.dataset.lat), Number(li.dataset.lon)],
    km: null,
    marcador: null,
  }));
  let masCercana = null;

  const decir = (texto, bien = false) => {
    estado.textContent = texto;
    estado.classList.toggle('bien', bien);
  };
  const suave = () => (reducido.matches ? 'auto' : 'smooth');
  const desplazar = (el, bloque = 'start') => el.scrollIntoView({ behavior: suave(), block: bloque });
  const entre = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  function distanciaKm([lat1, lon1], [lat2, lon2]) {
    const rad = (g) => (g * Math.PI) / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2
      + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
  }
  function textoDistancia(km) {
    const metros = Math.max(50, Math.round((km * 1000) / 50) * 50);
    return metros < 1000 ? `${metros} m` : `${numero.format(km)} km`;
  }

  /* ---------- Avisos breves (una a la vez; el reloj se detiene si la pestaña no se ve) ---------- */
  const avisos = $('#avisos');
  const CHULO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  let avisoActual = null;
  let relojAviso = 0;
  function quitarAviso(t) {
    clearTimeout(relojAviso);
    t.classList.remove('visible');
    setTimeout(() => t.remove(), 450);
    if (avisoActual === t) avisoActual = null;
  }
  function avisar(texto) {
    if (avisoActual) avisoActual.remove();
    const t = document.createElement('div');
    t.className = 'aviso';
    t.innerHTML = CHULO; // ícono fijo; el texto va como nodo de texto
    t.append(texto);
    avisos.append(t);
    avisoActual = t;
    t.getBoundingClientRect(); // fija el estado inicial antes de entrar
    t.classList.add('visible');
    clearTimeout(relojAviso);
    relojAviso = setTimeout(() => quitarAviso(t), 2800);
  }
  document.addEventListener('visibilitychange', () => {
    if (!avisoActual) return;
    clearTimeout(relojAviso);
    if (document.visibilityState === 'visible') {
      const t = avisoActual;
      relojAviso = setTimeout(() => quitarAviso(t), 1800);
    }
  });

  /* ---------- Copiar la dirección y guardar el contacto de una sede ---------- */
  async function copiarDireccion(s) {
    const texto = `ICT ${s.nombre}: ${s.direccion}`;
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const t = Object.assign(document.createElement('textarea'), { value: texto });
      t.setAttribute('readonly', '');
      t.style.cssText = 'position:fixed;opacity:0';
      document.body.append(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    avisar('Dirección copiada');
  }
  // En el riel, «Copiar» va junto a la dirección: la acción al lado de lo que usa.
  const ICONO_COPIAR = $('#copiar')?.querySelector('svg')?.outerHTML ?? '';
  sedes.forEach((s) => {
    const chip = (icono, texto, etiqueta, accion) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.setAttribute('aria-label', etiqueta);
      b.innerHTML = icono; // íconos fijos de la propia página
      b.append(texto);
      b.addEventListener('click', () => accion(s));
      return b;
    };
    s.li.querySelector('.direccion')?.append(chip(ICONO_COPIAR, 'Copiar', `Copiar la dirección de ${s.nombre}`, copiarDireccion));
  });

  /* ---------- Mapa (MapLibre: vectorial, nítido en cualquier pantalla; estilo propio en /mapa/estilo.json) ---------- */
  let mapa = null;
  let mapaListo = null; // se cumple cuando el estilo del mapa cargó (una sola vez)
  let marcadorTu = null;
  const lngLat = (punto) => [punto[1], punto[0]];
  const limites = (puntos) => puntos.reduce(
    (b, p) => b.extend(lngLat(p)),
    new window.maplibregl.LngLatBounds(lngLat(puntos[0]), lngLat(puntos[0])),
  );
  const limitesSedes = () => limites(sedes.map((s) => s.punto));
  const duracion = (ms) => (reducido.matches ? 0 : ms);

  function hayWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      return false;
    }
  }

  function relleno() {
    const w = marcoMapa.clientWidth;
    return w > 600 ? 80 : { top: 40, bottom: 50, left: 40, right: 40 };
  }

  function crearMapa() {
    if (!window.maplibregl || !hayWebGL()) {
      marcoMapa.classList.add('sin-mapa'); // la lista de sedes sigue funcionando
      return;
    }
    const ml = window.maplibregl;
    mapa = new ml.Map({
      container: 'mapa',
      style: '/mapa/estilo.json',
      bounds: limitesSedes(),
      fitBoundsOptions: { padding: relleno(), maxZoom: 16 },
      minZoom: 10,
      maxZoom: 18,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      scrollZoom: false, // la rueda mueve la página; se acerca con los botones o con doble clic
      cooperativeGestures: esTactil, // en el celular, un dedo mueve la página y dos el mapa
      fadeDuration: 120,
      locale: {
        'NavigationControl.ZoomIn': 'Acercar',
        'NavigationControl.ZoomOut': 'Alejar',
        'AttributionControl.ToggleAttribution': 'Créditos del mapa',
        'CooperativeGesturesHandler.MobileHelpText': 'Usa dos dedos para mover el mapa',
        'CooperativeGesturesHandler.WindowsHelpText': 'Usa Ctrl + rueda para acercar el mapa',
        'CooperativeGesturesHandler.MacHelpText': 'Usa ⌘ + rueda para acercar el mapa',
      },
    });
    mapaListo = new Promise((listo) => mapa.once('load', listo));
    mapa.touchZoomRotate.disableRotation();
    mapa.keyboard.disableRotation();
    mapa.addControl(new ml.NavigationControl({ showCompass: false }), 'top-left');
    // créditos del mapa: abajo en el celular; arriba en pantalla ancha, donde abajo va la ficha
    mapa.addControl(new ml.AttributionControl({ compact: true }), ancho.matches ? 'top-right' : 'bottom-right');
    mapa.once('load', () => { // plegados al cargar: menos ruido; siguen a un toque en la «i»
      const creditos = mapa.getContainer().querySelector('.maplibregl-ctrl-attrib');
      creditos?.classList.remove('maplibregl-compact-show');
      creditos?.removeAttribute('open');
    });

    // Las velas se encienden de oeste a este; cada espera es más corta que la anterior (una ola, no un metrónomo).
    const oesteAEste = [...sedes].sort((a, b) => a.punto[1] - b.punto[1]);
    let retraso = 0;
    let paso = 170;
    oesteAEste.forEach((s) => {
      s.retraso = Math.round(retraso);
      retraso += paso;
      paso *= 0.8;
    });

    sedes.forEach((s) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'vela';
      el.setAttribute('aria-label', `Sede ${s.nombre}`);
      el.innerHTML = '<i></i><b></b>'; // dibujo fijo de la vela
      const nombre = document.createElement('span');
      nombre.className = 'etiqueta';
      nombre.setAttribute('aria-hidden', 'true');
      nombre.textContent = s.nombre;
      el.append(nombre);
      el.style.setProperty('--retraso', `${s.retraso}ms`);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (enRiel()) irATarjeta(s);
        else elegir(s, { desde: 'mapa' });
      });
      if (punteroFino.matches) {
        el.addEventListener('mouseenter', () => s.li.classList.add('resalta'));
        el.addEventListener('mouseleave', () => s.li.classList.remove('resalta'));
        s.li.addEventListener('mouseenter', () => el.classList.add('resalta'));
        s.li.addEventListener('mouseleave', () => el.classList.remove('resalta'));
      }
      s.marcador = new ml.Marker({ element: el, anchor: 'center' }).setLngLat(lngLat(s.punto)).addTo(mapa);
    });

    // Encender cuando el mapa se ve.
    const encender = () => mapa.getContainer().classList.add('encendida');
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entradas) => {
        if (entradas.some((e) => e.intersectionRatio >= 0.3)) {
          encender();
          io.disconnect();
        }
      }, { threshold: [0, 0.3] });
      io.observe(mapa.getContainer());
    } else {
      encender();
    }

    class VerTodas {
      onAdd() {
        const caja = document.createElement('div');
        caja.className = 'maplibregl-ctrl';
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ver-todas';
        b.textContent = 'Ver todas las sedes';
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          ficha.cerrar();
          encuadrar(limitesSedes());
          verTodasVisible(false);
        });
        botonVerTodas = b;
        verTodasVisible(false);
        caja.append(b);
        return caja;
      }

      onRemove() {}
    }
    mapa.addControl(new VerTodas(), 'bottom-left');
    mapa.on('click', () => ficha.cerrar());
    mapa.on('dragstart', () => verTodasVisible(true));
    mapa.on('zoomstart', (e) => { if (e.originalEvent) verTodasVisible(true); });
    new ResizeObserver(() => mapa.resize()).observe(mapa.getContainer());
  }

  // «Ver todas las sedes» aparece solo cuando el mapa ya no las muestra todas (al moverlo o al volar a una sede).
  let botonVerTodas = null;
  function verTodasVisible(si) {
    if (!botonVerTodas) return;
    botonVerTodas.classList.toggle('visible', si);
    botonVerTodas.tabIndex = si ? 0 : -1;
    botonVerTodas.toggleAttribute('aria-hidden', !si);
  }

  function encuadrar(caja, animar = true) {
    if (!mapa) return;
    mapa.fitBounds(caja, { padding: relleno(), maxZoom: 16, duration: animar ? duracion(900) : 0 });
  }

  // Al terminar de moverse el mapa (o enseguida, si no tenía que moverse).
  function alLlegar(fn) {
    let hecho = false;
    const una = () => { if (!hecho) { hecho = true; fn(); } };
    mapa.once('moveend', una);
    setTimeout(una, 1300);
  }

  function marcarVela(s) {
    sedes.forEach((o) => o.marcador?.getElement()?.classList.toggle('elegida', o === s));
  }

  /* ---------- Riel de tarjetas (celular y tableta vertical) ---------- */
  const controles = $('#riel-controles');
  const cuenta = $('#riel-cuenta');
  const botonAnt = $('#riel-ant');
  const botonSig = $('#riel-sig');
  let activa = null;
  let programatico = false;
  let finProgramatico = 0;

  const ordenActual = () => [...lista.querySelectorAll('.sede')].map((li) => sedes.find((s) => s.li === li));
  function actualizarCuenta(s) {
    const orden = ordenActual();
    const pos = Math.max(0, orden.indexOf(s));
    cuenta.textContent = `${pos + 1} de ${orden.length}`;
    botonAnt.disabled = pos === 0;
    botonSig.disabled = pos === orden.length - 1;
  }

  // Una tarjeta pasa a ser la activa: se resalta su vela y, si fue un gesto de la persona, el mapa vuela hasta ella.
  function activar(s, { volar = false } = {}) {
    if (!s) return;
    activa = s;
    actualizarCuenta(s);
    marcarVela(s);
    if (volar && mapa) {
      mapa.flyTo({ center: lngLat(s.punto), zoom: Math.max(mapa.getZoom(), 14), duration: duracion(600) });
      verTodasVisible(true);
    }
  }

  function moverRiel(s) {
    programatico = true;
    clearTimeout(finProgramatico);
    finProgramatico = setTimeout(() => { programatico = false; }, 700);
    const relleno = parseFloat(getComputedStyle(lista).paddingLeft) || 0;
    lista.scrollTo({ left: s.li.offsetLeft - relleno, behavior: suave() });
  }

  // Desde el mapa: tocar una vela trae su tarjeta; el mapa no se mueve (la vela ya está a la vista).
  function irATarjeta(s) {
    moverRiel(s);
    activar(s);
    const r = lista.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8) {
      window.scrollBy({ top: r.bottom - window.innerHeight + 16, behavior: suave() });
    }
  }

  function prepararRiel() {
    controles.hidden = false;
    actualizarCuenta(sedes[0]);
    botonAnt.addEventListener('click', () => {
      const orden = ordenActual();
      const s = orden[Math.max(0, orden.indexOf(activa ?? orden[0]) - 1)];
      moverRiel(s);
      activar(s, { volar: true });
    });
    botonSig.addEventListener('click', () => {
      const orden = ordenActual();
      const s = orden[Math.min(orden.length - 1, orden.indexOf(activa ?? orden[0]) + 1)];
      moverRiel(s);
      activar(s, { volar: true });
    });
    // Al deslizar con el pulgar: la tarjeta que queda a la vista es la activa (cuando el riel se detiene).
    // Solo cuenta el gesto de la persona: al cargar la página el mapa sigue mostrando todas las sedes.
    if (!('IntersectionObserver' in window)) return;
    let gesto = false;
    lista.addEventListener('scroll', () => { if (!programatico) gesto = true; }, { passive: true });
    const visibles = new Map();
    let espera = 0;
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => visibles.set(e.target, e.intersectionRatio));
      clearTimeout(espera);
      espera = setTimeout(() => {
        if (!enRiel() || programatico || !gesto) return;
        gesto = false;
        const [li, ratio] = [...visibles.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
        const s = sedes.find((o) => o.li === li);
        if (s && ratio >= 0.6 && s !== activa) activar(s, { volar: true });
      }, 160);
    }, { root: lista, threshold: [0, 0.6, 1] });
    sedes.forEach((s) => io.observe(s.li));
  }

  /* ---------- Ficha de la sede (pantalla ancha) ---------- */
  const ficha = (() => {
    const el = $('#ficha');
    const nombre = $('#ficha-nombre');
    const distancia = $('#ficha-distancia');
    const cuerpo = $('#ficha-cuerpo');
    let actual = null;
    let origen = null;
    let cierre = 0;

    function rellenar(s) {
      nombre.textContent = s.nombre;
      distancia.hidden = s.km == null;
      if (s.km != null) {
        distancia.textContent = s === masCercana
          ? `La más cercana, a ${textoDistancia(s.km)} de ti`
          : `A ${textoDistancia(s.km)} de ti`;
      }
      const copias = ['.direccion', '.tels', '.acciones']
        .map((sel) => s.li.querySelector(sel)?.cloneNode(true))
        .filter(Boolean);
      copias.forEach((c) => c.querySelectorAll('.chip').forEach((b) => b.remove())); // la ficha trae sus propios botones
      cuerpo.replaceChildren(...copias);
    }

    function abrir(s, { foco = false, disparador = null } = {}) {
      if (enRiel()) return;
      clearTimeout(cierre);
      const cambio = actual && actual !== s && el.classList.contains('abierta');
      actual = s;
      origen = disparador;
      sedes.forEach((o) => o.li.classList.toggle('elegida', o === s));
      marcarVela(s);
      if (cambio && !reducido.matches) {
        // Cambiar de sede con la ficha abierta: el contenido se funde (un leve desenfoque une los dos estados).
        cuerpo.animate([{ opacity: 0.2, filter: 'blur(2px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 220, easing: 'ease' });
      }
      rellenar(s);
      if (el.hidden) {
        el.hidden = false;
        el.getBoundingClientRect(); // estado inicial antes de entrar
      }
      el.classList.add('abierta');
      if (foco) nombre.focus({ preventScroll: true });
      // no interrumpir un vuelo del mapa en curso (al terminar, elegir() la deja a la vista)
      requestAnimationFrame(() => { if (mapa && !mapa.isMoving()) aLaVista(s); });
    }

    function cerrar({ devolverFoco = false } = {}) {
      if (!actual) return;
      el.classList.remove('abierta');
      sedes.forEach((o) => o.li.classList.remove('elegida'));
      marcarVela(null);
      const volver = origen;
      actual = null;
      clearTimeout(cierre);
      cierre = setTimeout(() => { if (!actual) el.hidden = true; }, 320);
      if (devolverFoco && volver && document.contains(volver)) volver.focus({ preventScroll: true });
    }

    $('#ficha-cerrar').addEventListener('click', () => cerrar({ devolverFoco: true }));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && actual) cerrar({ devolverFoco: true });
    });
    $('#copiar').addEventListener('click', () => { if (actual) copiarDireccion(actual); });

    return { el, abrir, cerrar };
  })();

  // Deja la vela elegida a la vista, fuera de la tarjeta (que ocupa la derecha del mapa).
  function aLaVista(s) {
    if (!mapa || enRiel()) return;
    const caja = mapa.getContainer().getBoundingClientRect();
    const w = ficha.el.classList.contains('abierta') ? caja.width - ficha.el.offsetWidth - 48 : caja.width;
    const p = mapa.project(lngLat(s.punto));
    if (p.x < 40 || p.x > w - 40 || p.y < 50 || p.y > caja.height - 60) {
      mapa.panBy([p.x - w / 2, p.y - caja.height / 2], { duration: duracion(450) });
    }
  }

  /* ---------- Elegir una sede por su nombre ---------- */
  function elegir(s, { desde = 'lista', disparador = null } = {}) {
    if (enRiel()) {
      // celular: subir al mapa y volar a la vela
      desplazar(marcoMapa);
      activar(s, { volar: true });
      return;
    }
    if (desde === 'lista' && mapa) {
      // La tarjeta ocupa la derecha: la vela llega al centro de lo que queda libre.
      mapa.flyTo({
        center: lngLat(s.punto), zoom: Math.max(mapa.getZoom(), 15), offset: [-(380 + 48) / 2, 0], duration: duracion(800),
      });
      alLlegar(() => aLaVista(s));
      verTodasVisible(true);
    }
    ficha.abrir(s, { foco: desde === 'lista', disparador });
  }
  sedes.forEach((s) => {
    const boton = s.li.querySelector('.ver');
    boton?.addEventListener('click', () => elegir(s, { desde: 'lista', disparador: boton }));
  });

  /* ---------- La sede más cercana ---------- */
  function buscar() {
    botonBuscar.classList.add('usado'); // la invitación del botón ya cumplió
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

  // Lista vertical: cada sede viaja a su nuevo puesto (FLIP); la duración crece con la distancia.
  function reordenar(orden) {
    const antes = new Map(sedes.map((s) => [s, s.li.getBoundingClientRect().top]));
    orden.forEach((s) => lista.appendChild(s.li));
    if (reducido.matches || enRiel()) return;
    orden.forEach((s) => {
      const delta = antes.get(s) - s.li.getBoundingClientRect().top;
      if (Math.abs(delta) < 2) return;
      const duracion = Math.min(560, Math.max(260, Math.abs(delta) / 2.4));
      s.li.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], { duration: duracion, easing: EASE_IN_OUT });
    });
  }

  // El camino de luz: una línea dorada con su resplandor que crece desde ti hasta la sede (700 ms, salida rápida).
  function dibujarCamino(desde, hasta) {
    const a = lngLat(desde);
    const b = lngLat(hasta);
    const linea = (t) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [a, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]] },
    });
    const poner = () => {
      if (!mapa.getSource('camino')) {
        mapa.addSource('camino', { type: 'geojson', data: linea(0) });
        mapa.addLayer({ id: 'camino-brillo', type: 'line', source: 'camino', layout: { 'line-cap': 'round' },
          paint: { 'line-color': '#f2b544', 'line-width': 11, 'line-opacity': 0.3, 'line-blur': 7 } });
        mapa.addLayer({ id: 'camino', type: 'line', source: 'camino', layout: { 'line-cap': 'round' },
          paint: { 'line-color': '#ffe2a0', 'line-width': 3 } });
      }
      const fuente = mapa.getSource('camino');
      if (reducido.matches) {
        fuente.setData(linea(1));
        return;
      }
      const t0 = performance.now();
      const paso = (ahora) => {
        const t = Math.min(1, (ahora - t0) / 700);
        fuente.setData(linea(1 - (1 - t) ** 3));
        if (t < 1) requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    };
    mapaListo.then(poner); // (isStyleLoaded es falso mientras cargan calles: no sirve para esto)
  }

  function encontrado(pos) {
    botonBuscar.removeAttribute('aria-busy');
    const yo = [pos.coords.latitude, pos.coords.longitude];
    sedes.forEach((s) => { s.km = distanciaKm(yo, s.punto); });
    const orden = [...sedes].sort((a, b) => a.km - b.km);
    sedes.forEach((s) => {
      s.li.classList.remove('cercana');
      s.marcador?.getElement()?.classList.remove('cercana');
      const p = s.li.querySelector('.distancia');
      p.textContent = `A ${textoDistancia(s.km)} de ti`;
      p.hidden = false;
    });
    reordenar(orden);
    const primera = orden[0];

    if (primera.km > LEJOS_KM) {
      masCercana = null;
      decir(`Estás a ${textoDistancia(primera.km)} de la sede más cercana en Cúcuta. Si vives en otra ciudad, busca tu sede en soyict.org.`);
      desplazar($('.otra-ciudad'));
      return;
    }

    masCercana = primera;
    primera.li.classList.add('cercana');
    primera.li.querySelector('.distancia').textContent = `La más cercana, a ${textoDistancia(primera.km)} de ti`;
    decir(`La más cercana es ${primera.nombre}, a ${textoDistancia(primera.km)} de ti.`, true);

    if (enRiel()) {
      moverRiel(primera);
      activar(primera);
    }
    if (!mapa) {
      desplazar(primera.li);
      return;
    }
    if (!marcadorTu) {
      const el = document.createElement('div');
      el.className = 'tu';
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', 'Tu ubicación');
      el.innerHTML = '<i></i><b></b>'; // dibujo fijo del punto
      marcadorTu = new window.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(lngLat(yo)).addTo(mapa);
    } else {
      marcadorTu.setLngLat(lngLat(yo));
    }
    primera.marcador.getElement().classList.add('cercana');
    if (enRiel()) desplazar(marcoMapa);
    ficha.cerrar();

    // Primero el mapa se mueve (lo principal); al llegar, a la vez: el anillo en ti y el camino de luz;
    // en pantalla ancha la ficha sube un instante después, encimándose con el final del trazo.
    alLlegar(() => {
      const tu = marcadorTu.getElement();
      tu.classList.remove('pulso');
      tu.getBoundingClientRect();
      tu.classList.add('pulso');
      dibujarCamino(yo, primera.punto);
      if (!enRiel()) setTimeout(() => ficha.abrir(primera), reducido.matches ? 0 : 380);
    });
    verTodasVisible(true);
    mapa.fitBounds(limites([yo, primera.punto]), {
      // en pantalla ancha queda libre la columna de la ficha
      // en el celular, margen para el nombre que aparece sobre la vela
      padding: ancho.matches ? { top: 80, bottom: 80, left: 80, right: 80 + 428 } : { top: 80, bottom: 60, left: 80, right: 80 },
      // Privacidad: el mapa pide a OpenFreeMap las calles de la zona que muestra. Si se acercara hasta la cuadra, esa
      // petición revelaría dónde está la persona; con zoom 14 como máximo solo se ve un sector amplio (varios km).
      maxZoom: 14,
      duration: duracion(900),
    });
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
  $('#buscar-mesa')?.addEventListener('click', () => {
    desplazar(enRiel() ? marcoMapa : $('.portada'));
    buscar();
  });

  // La invitación del botón descansa cuando el botón no se ve o la pestaña está oculta.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => botonBuscar.classList.toggle('quieta', !e.isIntersecting)).observe(botonBuscar);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') botonBuscar.classList.add('quieta');
  });

  /* ---------- La mesa: momento de scroll ---------- */
  function prepararMesa() {
    const mesa = $('#mesa');
    if (!mesa || reducido.matches) return; // sin movimiento se queda terminada y quieta
    mesa.classList.add('viva');
    const escena = mesa.querySelector('.mesa-escena');
    const luz = mesa.querySelector('.mesa-luz');
    const dibujo = mesa.querySelector('svg');
    const velas = [...mesa.querySelectorAll('.mesa-velas li')];
    const linea1 = mesa.querySelector('[data-tramo="1"]');
    const linea2 = mesa.querySelector('[data-tramo="2"]');
    const final = [mesa.querySelector('.mesa-final'), mesa.querySelector('.mesa-boton')];
    const frio = [7, 20, 48];
    const calido = [36, 19, 10];
    const suavizar = (t) => t * t * (3 - 2 * t);
    let pedido = false;
    let visible = false;

    const pintar = () => {
      pedido = false;
      // El avance empieza cuando la escena asoma (su borde superior a 3/4 de la pantalla), no cuando ya llenó la
      // pantalla: así nunca se ve una escena vacía. Termina cuando la escena se suelta.
      const r = mesa.getBoundingClientRect();
      const alto = window.innerHeight;
      const p = entre((alto * 0.75 - r.top) / Math.max(1, r.height - alto * 0.25));
      dibujo.style.setProperty('--trazo', entre(p / 0.16).toFixed(3));
      dibujo.style.setProperty('--aparece', entre((p - 0.06) / 0.14).toFixed(3));
      velas.forEach((v, i) => v.classList.toggle('encendida', p >= 0.2 + i * 0.06));
      linea1.classList.toggle('visible', p < 0.36);
      linea2.classList.toggle('visible', p >= 0.38 && p < 0.68);
      final.forEach((el) => el.classList.toggle('visible', p >= 0.7));
      mesa.classList.toggle('final', p >= 0.7);
      const t = suavizar(entre((p - 0.1) / 0.6));
      escena.style.backgroundColor = `rgb(${frio.map((c, k) => Math.round(c + (calido[k] - c) * t)).join(',')})`;
      luz.style.opacity = entre((p - 0.25) / 0.5).toFixed(3);
    };
    const pedir = () => {
      if (!pedido) {
        pedido = true;
        requestAnimationFrame(pintar);
      }
    };
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) pedir();
    }).observe(mesa);
    addEventListener('scroll', () => { if (visible) pedir(); }, { passive: true });
    addEventListener('resize', pedir);
    pintar();
  }

  /* ---------- Compartir ---------- */
  const botonCompartir = $('#compartir');
  botonCompartir.addEventListener('click', async () => {
    const datos = {
      title: 'La Fiesta de Todos',
      text: 'Hay un lugar para ti en la mesa. Estas son las sedes de ICT en Cúcuta:',
      url: URL_PAGINA,
    };
    try {
      if (navigator.share) {
        await navigator.share(datos);
        return;
      }
      await navigator.clipboard.writeText(datos.url);
      avisar('Enlace copiado');
    } catch (e) {
      if (e && e.name === 'AbortError') return; // cerró el menú de compartir
      avisar(`Copia este enlace: ${location.host}`);
    }
  });

  crearMapa();
  prepararRiel();
  prepararMesa();
})();
