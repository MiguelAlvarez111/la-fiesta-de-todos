/* La Fiesta de Todos · sedes de ICT
   La lista de sedes ya viene en el HTML (funciona sin JavaScript). Aquí se agregan:
   - el mapa con una vela por sede, que se enciende de oeste a este cuando el mapa aparece;
   - en el celular (modo app): las sedes son tarjetas que se deslizan con el pulgar y el mapa vuela a la vela de cada una;
     en pantalla ancha: lista a la izquierda y ficha de la sede sobre el mapa;
   - la sede más cercana: la lista se reordena, aparece un camino de luz desde ti y se resalta su tarjeta o su ficha;
   - copiar la dirección, guardar el contacto y compartir, con un aviso breve;
   - la mesa: el momento de scroll (la mesa se dibuja, ocho velas se encienden, el fondo pasa de frío a cálido);
   - «Revive la noche», que se muestra sola desde el 30 de noviembre (antes contaría el final de la obra).
   La ubicación nunca sale del teléfono. Con «reducir movimiento» nada se desplaza: solo fundidos. */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const lista = $('#lista');
  const estado = $('#estado');
  const botonBuscar = $('#buscar');
  const avisoMapa = $('#aviso-mapa');
  const marcoMapa = $('.mapa-marco');
  const reducido = matchMedia('(prefers-reduced-motion: reduce)');
  const ancho = matchMedia('(min-width: 960px)');
  const punteroFino = matchMedia('(hover: hover) and (pointer: fine)');
  const esTactil = matchMedia('(pointer: coarse)').matches;
  const numero = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
  const EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';
  const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
  const LEJOS_KM = 40;
  const URL_PAGINA = 'https://lafiestadetodos-production.up.railway.app/';
  const FECHA_REVIVE = Date.parse('2026-11-30T00:00:00-05:00');
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
  function guardarContacto(s) {
    const dir = s.direccion;
    const tels = [...s.li.querySelectorAll('.tels a[href^="tel:"]')].map((a) => a.getAttribute('href').slice(4));
    const limpio = (t) => t.replace(/[,;\\]/g, (m) => `\\${m}`);
    const vcard = [
      'BEGIN:VCARD', 'VERSION:3.0',
      `N:;${limpio(`ICT ${s.nombre}`)};;;`,
      `FN:${limpio(`ICT ${s.nombre}`)}`,
      'ORG:ICT - Cruzada Estudiantil y Profesional de Colombia',
      ...tels.map((t) => `TEL;TYPE=CELL:${t}`),
      `ADR;TYPE=WORK:;;${limpio(dir)};;Norte de Santander;;Colombia`,
      `URL:${URL_PAGINA}`,
      'NOTE:Sede de ICT. Información de La Fiesta de Todos.',
      'END:VCARD',
    ].join('\r\n');
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([vcard], { type: 'text/vcard' }));
    enlace.download = `ICT ${s.nombre}.vcf`;
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    setTimeout(() => URL.revokeObjectURL(enlace.href), 4000);
    avisar('Contacto descargado: ábrelo para guardarlo');
  }

  // En el riel, «Copiar» va junto a la dirección y «Guardar» junto al teléfono: cada acción al lado de lo que usa.
  const ICONO_COPIAR = $('#copiar')?.querySelector('svg')?.outerHTML ?? '';
  const ICONO_CONTACTO = $('#contacto')?.querySelector('svg')?.outerHTML ?? '';
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
    const tels = s.li.querySelector('.tels');
    if (tels?.querySelector('a')) tels.append(chip(ICONO_CONTACTO, 'Guardar', `Guardar el contacto de ${s.nombre}`, guardarContacto));
  });

  /* ---------- Mapa ---------- */
  let mapa = null;
  let marcadorTu = null;
  let camino = null;
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
    });
    mapa.attributionControl.setPrefix(false);
    encuadrar(limitesSedes(), false); // el mapa necesita una vista antes de dibujar las velas
    // Mapa libre de OpenStreetMap (sin clave); estilos.css lo vuelve nocturno.
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa);

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
      const icono = L.divIcon({ className: 'vela', html: '<i></i><b></b>', iconSize: [34, 34], iconAnchor: [17, 17] });
      s.marcador = L.marker(s.punto, { icon: icono, title: s.nombre, alt: s.nombre, riseOnHover: true })
        .bindTooltip(s.nombre, { className: 'etiqueta', direction: 'top', offset: [0, -16] })
        .on('click', () => (enRiel() ? irATarjeta(s) : elegir(s, { desde: 'mapa' })))
        .addTo(mapa);
      s.marcador.getElement().style.setProperty('--retraso', `${s.retraso}ms`);
      if (punteroFino.matches) {
        s.marcador.on('mouseover', () => s.li.classList.add('resalta'));
        s.marcador.on('mouseout', () => s.li.classList.remove('resalta'));
        s.li.addEventListener('mouseenter', () => s.marcador.getElement()?.classList.add('resalta'));
        s.li.addEventListener('mouseleave', () => s.marcador.getElement()?.classList.remove('resalta'));
      }
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

    const VerTodas = L.Control.extend({
      options: { position: 'bottomleft' },
      onAdd() {
        const b = L.DomUtil.create('button', 'ver-todas');
        b.type = 'button';
        b.textContent = 'Ver todas las sedes';
        L.DomEvent.disableClickPropagation(b);
        L.DomEvent.on(b, 'click', () => {
          ficha.cerrar();
          encuadrar(limitesSedes());
        });
        return b;
      },
    });
    mapa.addControl(new VerTodas());
    mapa.on('click', () => ficha.cerrar());

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

    new ResizeObserver(() => mapa.invalidateSize()).observe(mapa.getContainer());
  }

  function encuadrar(limites, animar = true) {
    if (!mapa) return;
    const w = mapa.getContainer().clientWidth;
    mapa.fitBounds(limites, {
      padding: w > 600 ? [80, 80] : [40, 50],
      maxZoom: 16,
      animate: animar && !reducido.matches,
    });
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
      const z = Math.max(mapa.getZoom(), 14);
      if (reducido.matches) mapa.setView(s.punto, z, { animate: false });
      else mapa.flyTo(s.punto, z, { duration: 0.6 });
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
      requestAnimationFrame(() => aLaVista(s));
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
    $('#contacto').addEventListener('click', () => { if (actual) guardarContacto(actual); });

    return { el, abrir, cerrar };
  })();

  // Deja la vela elegida a la vista, fuera de la tarjeta (que ocupa la derecha del mapa).
  function aLaVista(s) {
    if (!mapa || enRiel()) return;
    const caja = mapa.getContainer().getBoundingClientRect();
    const w = ficha.el.classList.contains('abierta') ? caja.width - ficha.el.offsetWidth - 48 : caja.width;
    const p = mapa.latLngToContainerPoint(s.punto);
    if (p.x < 40 || p.x > w - 40 || p.y < 50 || p.y > caja.height - 60) {
      mapa.panBy([p.x - w / 2, p.y - caja.height / 2], { animate: !reducido.matches, duration: 0.45 });
    }
  }

  /* ---------- Elegir una sede por su nombre ---------- */
  function elegir(s, { desde = 'lista', disparador = null } = {}) {
    if (enRiel()) {
      // celular: subir al mapa y volar a la vela
      desplazar(marcoMapa);
      activar(s, { volar: true });
      s.marcador?.openTooltip();
      return;
    }
    if (desde === 'lista' && mapa) {
      const z = Math.max(mapa.getZoom(), 15);
      // La tarjeta ocupa la derecha: la vela llega al centro de lo que queda libre.
      const centro = mapa.unproject(mapa.project(s.punto, z).add([(380 + 48) / 2, 0]), z);
      if (reducido.matches) mapa.setView(centro, z, { animate: false });
      else mapa.flyTo(centro, z, { duration: 0.8 });
      alLlegar(() => aLaVista(s));
      s.marcador.openTooltip();
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

  function dibujarCamino(desde, hasta) {
    const L = window.L;
    if (camino) camino.remove();
    camino = L.polyline([desde, hasta], {
      color: '#ffe2a0', weight: 3, opacity: 0.95, lineCap: 'round', className: 'camino', interactive: false,
    }).addTo(mapa);
    const trazo = camino.getElement();
    if (!trazo || reducido.matches) return;
    trazo.setAttribute('pathLength', '1'); // longitud normalizada: el zoom no rompe el trazo
    trazo.style.strokeDasharray = '1 1';
    const anim = trazo.animate([{ strokeDashoffset: '1' }, { strokeDashoffset: '0' }], { duration: 700, easing: EASE_OUT, fill: 'forwards' });
    anim.onfinish = () => {
      trazo.style.strokeDasharray = '';
      trazo.removeAttribute('pathLength');
      anim.cancel();
    };
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
    const L = window.L;
    if (!marcadorTu) {
      const icono = L.divIcon({ className: 'tu', html: '<i></i><b></b>', iconSize: [20, 20], iconAnchor: [10, 10] });
      marcadorTu = L.marker(yo, { icon: icono, title: 'Tú', alt: 'Tú', zIndexOffset: 1000, keyboard: false })
        .bindTooltip('Tú', { className: 'etiqueta', direction: 'top', offset: [0, -10] })
        .addTo(mapa);
    } else {
      marcadorTu.setLatLng(yo);
    }
    primera.marcador.getElement().classList.add('cercana');
    primera.marcador.setZIndexOffset(500);
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
    mapa.fitBounds(L.latLngBounds([yo, primera.punto]), {
      paddingTopLeft: ancho.matches ? [80, 80] : [50, 50],
      paddingBottomRight: ancho.matches ? [80 + 428, 80] : [50, 50], // en pantalla ancha, libre la columna de la ficha
      maxZoom: 16,
      animate: !reducido.matches,
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
      const r = mesa.getBoundingClientRect();
      const recorrido = Math.max(1, r.height - window.innerHeight);
      const p = entre(-r.top / recorrido);
      dibujo.style.setProperty('--trazo', entre(p / 0.12).toFixed(3));
      dibujo.style.setProperty('--aparece', entre((p - 0.06) / 0.12).toFixed(3));
      velas.forEach((v, i) => v.classList.toggle('encendida', p >= 0.16 + i * 0.07));
      linea1.classList.toggle('visible', p >= 0.03 && p < 0.34);
      linea2.classList.toggle('visible', p >= 0.36 && p < 0.68);
      final.forEach((el) => el.classList.toggle('visible', p >= 0.72));
      const t = suavizar(entre((p - 0.1) / 0.65));
      escena.style.backgroundColor = `rgb(${frio.map((c, k) => Math.round(c + (calido[k] - c) * t)).join(',')})`;
      luz.style.opacity = entre((p - 0.2) / 0.55).toFixed(3);
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

  /* ---------- Revive la noche: desde el 30 de noviembre ---------- */
  function prepararRevive() {
    const revive = $('#revive');
    const antesDeTiempo = new URLSearchParams(location.search).has('revive'); // para revisarla antes de la fecha
    if (!revive || (Date.now() < FECHA_REVIVE && !antesDeTiempo)) return;
    revive.hidden = false;
    if (reducido.matches || !('IntersectionObserver' in window)) return;
    revive.classList.add('viva');
    const io = new IntersectionObserver((entradas) => {
      entradas.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('vista');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    revive.querySelectorAll('.escena').forEach((el) => io.observe(el));
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
  prepararRevive();
})();
