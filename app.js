/* La Fiesta de Todos · sedes de ICT
   La lista de sedes ya viene en el HTML (funciona sin JavaScript). Aquí se agregan:
   - el mapa con una vela por sede, que se enciende de oeste a este cuando el mapa aparece (el único momento con autor);
   - la ficha de cada sede (hoja que sube y se cierra arrastrándola hacia abajo; tarjeta en pantallas anchas);
   - la sede más cercana: la lista se reordena, aparece un camino de luz desde ti y se abre su ficha;
   - copiar la dirección, guardar el contacto y compartir, con un aviso breve.
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

  const sedes = [...lista.querySelectorAll('.sede')].map((li, i) => ({
    li,
    i,
    nombre: li.dataset.nombre,
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
    t.innerHTML = CHULO;
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
        .on('click', () => elegir(s, { desde: 'mapa' }))
        .addTo(mapa);
      s.marcador.getElement().style.setProperty('--retraso', `${s.retraso}ms`);
      if (punteroFino.matches) {
        s.marcador.on('mouseover', () => s.li.classList.add('resalta'));
        s.marcador.on('mouseout', () => s.li.classList.remove('resalta'));
        s.li.addEventListener('mouseenter', () => s.marcador.getElement()?.classList.add('resalta'));
        s.li.addEventListener('mouseleave', () => s.marcador.getElement()?.classList.remove('resalta'));
      }
    });

    // Encender cuando el mapa se ve (en el celular puede estar más abajo).
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

  // Lo que la ficha tapa del mapa: en el celular, la parte de abajo; en pantalla ancha, la columna de la derecha.
  // Se mide dónde quedará la ficha, no dónde va mientras sube.
  function zonaLibre() {
    const caja = mapa.getContainer().getBoundingClientRect();
    let w = caja.width;
    let h = caja.height;
    if (ficha.el.classList.contains('abierta')) {
      if (ancho.matches) w = caja.width - ficha.el.offsetWidth - 48;
      else h = Math.max(120, Math.min(caja.height, window.innerHeight - ficha.el.offsetHeight - caja.top));
    }
    return { w, h };
  }

  // Deja la vela elegida a la vista, fuera de lo que tapa la ficha.
  function aLaVista(s) {
    if (!mapa) return;
    const { w, h } = zonaLibre();
    const p = mapa.latLngToContainerPoint(s.punto);
    if (p.x < 40 || p.x > w - 40 || p.y < 50 || p.y > h - 60) {
      mapa.panBy([p.x - w / 2, p.y - h * (ancho.matches ? 0.5 : 0.45)], { animate: !reducido.matches, duration: 0.45 });
    }
  }

  /* ---------- Ficha de la sede ---------- */
  const ficha = (() => {
    const el = $('#ficha');
    const cabeza = $('#ficha-cabeza');
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
      cuerpo.replaceChildren(...['.direccion', '.tels', '.acciones']
        .map((sel) => s.li.querySelector(sel)?.cloneNode(true))
        .filter(Boolean));
    }

    function abrir(s, { foco = false, disparador = null } = {}) {
      clearTimeout(cierre);
      const cambio = actual && actual !== s && el.classList.contains('abierta');
      actual = s;
      origen = disparador;
      sedes.forEach((o) => {
        o.li.classList.toggle('elegida', o === s);
        o.marcador?.getElement()?.classList.toggle('elegida', o === s);
      });
      if (cambio && !reducido.matches) {
        // Cambiar de sede con la ficha abierta: el contenido se funde (un leve desenfoque une los dos estados).
        cuerpo.animate([{ opacity: 0.2, filter: 'blur(2px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 220, easing: 'ease' });
      }
      rellenar(s);
      if (el.hidden) {
        el.hidden = false;
        el.getBoundingClientRect(); // estado inicial (abajo) antes de subir
      }
      el.style.transform = '';
      el.classList.add('abierta');
      if (foco) nombre.focus({ preventScroll: true });
      requestAnimationFrame(() => aLaVista(s));
    }

    function cerrar({ devolverFoco = false } = {}) {
      if (!actual) return;
      el.classList.remove('abierta');
      el.style.transform = '';
      sedes.forEach((o) => {
        o.li.classList.remove('elegida');
        o.marcador?.getElement()?.classList.remove('elegida');
      });
      const volver = origen;
      actual = null;
      clearTimeout(cierre);
      cierre = setTimeout(() => { if (!actual) el.hidden = true; }, 320);
      if (devolverFoco && volver && document.contains(volver)) volver.focus({ preventScroll: true });
    }

    // Arrastrar hacia abajo para cerrar: basta un gesto rápido (velocidad), no hace falta llegar lejos.
    let arrastre = null;
    cabeza.addEventListener('pointerdown', (e) => {
      if (ancho.matches || arrastre || e.target.closest('button')) return; // un solo dedo a la vez
      arrastre = { id: e.pointerId, y0: e.clientY, t0: performance.now(), dy: 0 };
      try { cabeza.setPointerCapture(e.pointerId); } catch { /* sin captura el arrastre igual funciona */ }
      el.style.transition = 'none';
    });
    cabeza.addEventListener('pointermove', (e) => {
      if (!arrastre || e.pointerId !== arrastre.id) return;
      let dy = e.clientY - arrastre.y0;
      if (dy < 0) dy = -Math.sqrt(-dy) * 2.2; // hacia arriba: fricción en vez de un muro
      arrastre.dy = dy;
      el.style.transform = `translateY(${dy}px)`;
    });
    const soltar = (e) => {
      if (!arrastre || e.pointerId !== arrastre.id) return;
      const { dy, t0 } = arrastre;
      arrastre = null;
      el.style.transition = '';
      const velocidad = Math.abs(dy) / Math.max(1, performance.now() - t0);
      if (dy > el.offsetHeight * 0.3 || (dy > 12 && velocidad > 0.11)) cerrar();
      else el.style.transform = '';
    };
    cabeza.addEventListener('pointerup', soltar);
    cabeza.addEventListener('pointercancel', soltar);

    $('#ficha-cerrar').addEventListener('click', () => cerrar({ devolverFoco: true }));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && actual) cerrar({ devolverFoco: true });
    });

    // Copiar la dirección y guardar el contacto de la sede abierta.
    $('#copiar').addEventListener('click', async () => {
      if (!actual) return;
      const texto = `ICT ${actual.nombre}: ${actual.li.querySelector('.direccion').textContent.trim()}`;
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
    });
    $('#contacto').addEventListener('click', () => {
      if (!actual) return;
      const dir = actual.li.querySelector('.direccion').textContent.trim();
      const tels = [...actual.li.querySelectorAll('.tels a[href^="tel:"]')].map((a) => a.getAttribute('href').slice(4));
      const limpio = (t) => t.replace(/[,;\\]/g, (m) => `\\${m}`);
      const vcard = [
        'BEGIN:VCARD', 'VERSION:3.0',
        `N:;${limpio(`ICT ${actual.nombre}`)};;;`,
        `FN:${limpio(`ICT ${actual.nombre}`)}`,
        'ORG:ICT - Cruzada Estudiantil y Profesional de Colombia',
        ...tels.map((t) => `TEL;TYPE=CELL:${t}`),
        `ADR;TYPE=WORK:;;${limpio(dir)};;Norte de Santander;;Colombia`,
        `URL:${URL_PAGINA}`,
        'NOTE:Sede de ICT. Información de La Fiesta de Todos.',
        'END:VCARD',
      ].join('\r\n');
      const enlace = document.createElement('a');
      enlace.href = URL.createObjectURL(new Blob([vcard], { type: 'text/vcard' }));
      enlace.download = `ICT ${actual.nombre}.vcf`;
      document.body.append(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(enlace.href), 4000);
      avisar('Contacto descargado: ábrelo para guardarlo');
    });

    return { el, abrir, cerrar, get actual() { return actual; } };
  })();

  /* ---------- Elegir una sede (desde el mapa o desde la lista) ---------- */
  function elegir(s, { desde = 'lista', disparador = null } = {}) {
    if (desde === 'lista' && mapa) {
      if (!ancho.matches) desplazar(marcoMapa);
      const z = Math.max(mapa.getZoom(), 15);
      // En pantalla ancha la tarjeta ocupa la derecha: la vela llega al centro de lo que queda libre.
      const corrimiento = ancho.matches ? [(380 + 48) / 2, 0] : [0, 0];
      const centro = mapa.unproject(mapa.project(s.punto, z).add(corrimiento), z);
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

  // Reordenar con FLIP: cada sede viaja a su nuevo puesto; la duración crece con la distancia.
  function reordenar(orden) {
    const antes = new Map(sedes.map((s) => [s, s.li.getBoundingClientRect().top]));
    orden.forEach((s) => lista.appendChild(s.li));
    if (reducido.matches) return;
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
    decir(`La más cercana es ${primera.nombre}, a ${textoDistancia(primera.km)} de ti.`, true);

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
    const vela = primera.marcador.getElement();
    vela.classList.add('cercana');
    primera.marcador.setZIndexOffset(500);
    if (!ancho.matches) desplazar(marcoMapa);
    ficha.cerrar();

    // Primero el mapa se mueve (lo principal); al llegar, a la vez: el anillo en ti y el camino de luz;
    // la ficha sube un instante después, encimándose con el final del trazo.
    alLlegar(() => {
      const tu = marcadorTu.getElement();
      tu.classList.remove('pulso');
      tu.getBoundingClientRect();
      tu.classList.add('pulso');
      dibujarCamino(yo, primera.punto);
      setTimeout(() => ficha.abrir(primera), reducido.matches ? 0 : 380);
    });
    // En pantalla ancha se deja libre la columna donde aparecerá la tarjeta.
    mapa.fitBounds(L.latLngBounds([yo, primera.punto]), {
      paddingTopLeft: ancho.matches ? [80, 80] : [50, 50],
      paddingBottomRight: ancho.matches ? [80 + 428, 80] : [50, 50],
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

  // La invitación del botón descansa cuando el botón no se ve o la pestaña está oculta.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => botonBuscar.classList.toggle('quieta', !e.isIntersecting)).observe(botonBuscar);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') botonBuscar.classList.add('quieta');
  });

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
})();
