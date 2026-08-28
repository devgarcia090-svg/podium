// Panel de reservas para el personal del restaurante.

const P = globalThis.PODIUM;

const seccionAcceso = document.querySelector('[data-acceso]');
const seccionPanel = document.querySelector('[data-panel]');
const botonSalir = document.querySelector('[data-salir]');
const campoDia = document.querySelector('[data-dia]');
const lista = document.querySelector('[data-lista]');
const metricas = document.querySelector('[data-metricas]');
const subtitulo = document.querySelector('[data-subtitulo]');
const errorPanel = document.querySelector('[data-panel-error]');

let rango = { desde: fechaISO(new Date()), hasta: fechaISO(new Date()) };

const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(ruta, opciones = {}) {
  const respuesta = await fetch(ruta, {
    headers: { 'content-type': 'application/json' },
    ...opciones,
    body: opciones.cuerpo ? JSON.stringify(opciones.cuerpo) : undefined
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.error || 'Algo ha fallado.');
  return datos;
}

function avisar(elemento, texto, ms = 4000) {
  elemento.textContent = texto;
  elemento.classList.toggle('oculto', !texto);
  if (texto && ms) setTimeout(() => elemento.classList.add('oculto'), ms);
}

// --- Acceso ---

document.querySelector('[data-login]').addEventListener('submit', async (e) => {
  e.preventDefault();
  const error = document.querySelector('[data-login-error]');
  try {
    await api('/api/sesion', { method: 'POST', cuerpo: { password: document.getElementById('password').value } });
    entrar();
  } catch (err) {
    avisar(error, err.message, 0);
  }
});

botonSalir.addEventListener('click', async () => {
  await api('/api/sesion', { method: 'DELETE' }).catch(() => {});
  location.reload();
});

function entrar() {
  seccionAcceso.classList.add('oculto');
  seccionPanel.classList.remove('oculto');
  botonSalir.classList.remove('oculto');
  campoDia.value = rango.desde;
  cargarReservas();
  cargarAjustes();
}

// --- Reservas ---

function pintarMetricas(reservas) {
  const activas = reservas.filter((r) => r.estado !== 'cancelada');
  const datos = [
    ['Reservas', activas.length],
    ['Comensales', activas.reduce((s, r) => s + r.personas, 0)],
    ['Sin confirmar', activas.filter((r) => r.estado === 'pendiente').length],
    ['Canceladas', reservas.length - activas.length]
  ];
  metricas.innerHTML = datos.map(([t, v]) => `<div class="metrica"><strong>${v}</strong><span>${t}</span></div>`).join('');
}

function tarjetaReserva(r) {
  const telefono = escapar(r.telefono);
  return `
    <article class="reserva" data-estado="${r.estado}" data-id="${r.id}">
      <div class="reserva__hora">${r.hora}<small>${fechaCorta(r.fecha)}</small></div>
      <div>
        <p class="reserva__nombre">${escapar(r.nombre)}
          <span class="etiqueta-estado" data-e="${r.estado}">${r.estado}</span>
        </p>
        <p class="reserva__datos">
          ${r.personas} ${r.personas === 1 ? 'persona' : 'personas'} ·
          <a href="tel:${telefono.replace(/\s/g, '')}">${telefono}</a>
          ${r.email ? ' · ' + escapar(r.email) : ''} · <span class="tenue">${escapar(r.codigo)}</span>
        </p>
        ${r.notas ? `<p class="reserva__nota">${escapar(r.notas)}</p>` : ''}
      </div>
      <div class="reserva__acciones">
        ${r.estado !== 'confirmada' ? '<button class="boton boton--pequeno" data-accion="confirmada" type="button">Confirmar</button>' : ''}
        <button class="boton boton--fantasma boton--pequeno" data-editar type="button">Cambiar</button>
        ${r.estado !== 'cancelada'
          ? '<button class="boton boton--peligro boton--pequeno" data-accion="cancelada" type="button">Cancelar</button>'
          : '<button class="boton boton--fantasma boton--pequeno" data-accion="pendiente" type="button">Recuperar</button>'}
      </div>
    </article>`;
}

let reservasEnPantalla = [];

/** Agrupa las reservas por día y servicio (comida / cena). */
function pintarPorTurno(reservas) {
  const grupos = new Map();
  for (const r of reservas) {
    const turno = turnoDeHora(r.fecha, r.hora) || 'Otros';
    const clave = `${r.fecha}|${turno}`;
    if (!grupos.has(clave)) grupos.set(clave, { fecha: r.fecha, turno, reservas: [] });
    grupos.get(clave).reservas.push(r);
  }

  return [...grupos.values()].map((g) => {
    const activas = g.reservas.filter((r) => r.estado !== 'cancelada');
    const pax = activas.reduce((s, r) => s + r.personas, 0);
    return `
      <div class="turno-cabecera">
        <h3>${g.turno} · <span class="tenue">${fechaCorta(g.fecha)}</span></h3>
        <span class="turno-cabecera__resumen">${activas.length} reservas · ${pax} comensales</span>
      </div>
      ${g.reservas.map(tarjetaReserva).join('')}`;
  }).join('');
}

async function cargarReservas() {
  lista.innerHTML = '<p class="tenue">Cargando…</p>';
  try {
    const { reservas } = await api(`/api/reservas?desde=${rango.desde}&hasta=${rango.hasta}`);
    reservasEnPantalla = reservas;
    pintarMetricas(reservas);

    subtitulo.textContent = rango.desde === rango.hasta
      ? fechaLarga(rango.desde)
      : `Del ${fechaCorta(rango.desde)} al ${fechaCorta(rango.hasta)}`;

    lista.innerHTML = reservas.length
      ? pintarPorTurno(reservas)
      : '<p class="tenue" style="padding:2rem 0">No hay reservas en estas fechas.</p>';
  } catch (err) {
    lista.innerHTML = '';
    avisar(errorPanel, err.message, 0);
  }
}

// --- Cambiar fecha, hora o comensales ---

async function abrirEdicion(tarjeta) {
  if (tarjeta.querySelector('[data-form-editar]')) return;

  const r = reservasEnPantalla.find((x) => x.id === tarjeta.dataset.id);
  if (!r) return;

  const form = document.createElement('form');
  form.className = 'editor';
  form.setAttribute('data-form-editar', '');
  form.innerHTML = `
    <div class="fila-campos">
      <div class="campo">
        <label>Día</label>
        <input type="date" name="fecha" value="${r.fecha}" required>
      </div>
      <div class="campo">
        <label>Hora</label>
        <select name="hora" required><option>${escapar(r.hora)}</option></select>
      </div>
      <div class="campo">
        <label>Comensales</label>
        <input type="number" name="personas" min="1" max="99" value="${r.personas}" required>
      </div>
    </div>
    <div class="campo">
      <label>Notas</label>
      <input type="text" name="notas" maxlength="300" value="${escapar(r.notas || '')}">
    </div>
    <div class="editor__acciones">
      <button class="boton boton--pequeno" type="submit">Guardar cambios</button>
      <button class="boton boton--fantasma boton--pequeno" type="button" data-cerrar>Cancelar</button>
      <span class="editor__aviso" data-editor-aviso></span>
    </div>`;
  tarjeta.appendChild(form);

  const campoFecha = form.elements.fecha;
  const campoHora = form.elements.hora;
  const aviso = form.querySelector('[data-editor-aviso]');

  async function cargarHoras() {
    campoHora.innerHTML = '<option>Cargando…</option>';
    try {
      const d = await api(`/api/disponibilidad?panel=1&fecha=${campoFecha.value}&excluir=${r.id}`);
      if (!d.turnos.length) {
        campoHora.innerHTML = '<option value="">Ese día no abrís</option>';
        aviso.textContent = d.motivo || '';
        return;
      }
      campoHora.innerHTML = d.turnos
        .map((t) => `<option value="${t.hora}"${t.hora === r.hora ? ' selected' : ''}>${t.turno || ''} ${t.hora} · ${t.libres} libres</option>`)
        .join('');
      aviso.textContent = d.cierre ? `Ojo: ese día está marcado como cerrado (${d.cierre}).` : '';
    } catch (err) {
      campoHora.innerHTML = '<option value="">Error</option>';
      aviso.textContent = err.message;
    }
  }

  campoFecha.addEventListener('change', cargarHoras);
  form.querySelector('[data-cerrar]').addEventListener('click', () => form.remove());

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const elegido = campoHora.selectedOptions[0];
    const libres = Number((elegido?.textContent.match(/(\d+) libres/) || [])[1] ?? Infinity);
    const personas = Number(form.elements.personas.value);

    if (libres < personas &&
        !confirm(`En ese turno solo quedan ${libres} plazas y la reserva es de ${personas}. ¿Lo pones igualmente?`)) {
      return;
    }

    try {
      await api(`/api/reservas/${r.id}`, {
        method: 'PATCH',
        cuerpo: {
          fecha: campoFecha.value,
          hora: campoHora.value,
          personas,
          notas: form.elements.notas.value
        }
      });
      await cargarReservas();
    } catch (err) {
      aviso.textContent = err.message;
    }
  });

  cargarHoras();
}

lista.addEventListener('click', (e) => {
  const tarjeta = e.target.closest('.reserva');
  if (e.target.closest('[data-editar]') && tarjeta) abrirEdicion(tarjeta);
});

lista.addEventListener('click', async (e) => {
  const boton = e.target.closest('[data-accion]');
  if (!boton) return;

  const tarjeta = boton.closest('.reserva');
  if (boton.dataset.accion === 'cancelada' && !confirm('¿Cancelar esta reserva?')) return;

  boton.disabled = true;
  try {
    await api(`/api/reservas/${tarjeta.dataset.id}`, { method: 'PATCH', cuerpo: { estado: boton.dataset.accion } });
    await cargarReservas();
  } catch (err) {
    boton.disabled = false;
    avisar(errorPanel, err.message);
  }
});

campoDia.addEventListener('change', () => {
  rango = { desde: campoDia.value, hasta: campoDia.value };
  cargarReservas();
});

document.querySelector('[data-hoy]').addEventListener('click', () => {
  const hoy = fechaISO(new Date());
  campoDia.value = hoy;
  rango = { desde: hoy, hasta: hoy };
  cargarReservas();
});

document.querySelector('[data-semana]').addEventListener('click', () => {
  rango = { desde: fechaISO(new Date()), hasta: fechaISO(new Date(Date.now() + 6 * 86400000)) };
  campoDia.value = rango.desde;
  cargarReservas();
});

document.querySelector('[data-refrescar]').addEventListener('click', cargarReservas);

// --- Ajustes ---

const okAjustes = document.querySelector('[data-ajustes-ok]');
const campoPlazas = document.getElementById('plazas');
const contenedorCierres = document.querySelector('[data-cierres]');

const contenedorAgenda = document.querySelector('[data-agenda]');

async function cargarAjustes() {
  try {
    const datos = await api('/api/ajustes');
    campoPlazas.value = datos.plazasPorTurno;

    contenedorCierres.innerHTML = datos.cierres.length
      ? datos.cierres.map((c) => `
          <div class="pie__horario" style="padding:.5rem 0;border-bottom:1px solid var(--linea)">
            <span>${fechaLarga(c.fecha)}${c.motivo ? ` — <span class="tenue">${escapar(c.motivo)}</span>` : ''}</span>
            <button class="boton boton--peligro boton--pequeno" data-quitar="${c.fecha}" type="button">Quitar</button>
          </div>`).join('')
      : '<p class="tenue">No hay días cerrados programados.</p>';

    if (datos.aperturas?.length) {
      contenedorCierres.innerHTML += `
        <p class="campo__ayuda" style="margin-top:1rem">Aperturas extraordinarias:</p>` +
        datos.aperturas.map((a) => `
          <div class="pie__horario" style="padding:.5rem 0;border-bottom:1px solid var(--linea)">
            <span>${fechaLarga(a.fecha)}${a.motivo ? ` — <span class="tenue">${escapar(a.motivo)}</span>` : ''}</span>
            <button class="boton boton--peligro boton--pequeno" data-quitar-apertura="${a.fecha}" type="button">Quitar</button>
          </div>`).join('');
    }

    pintarAgenda(datos.agenda || []);
  } catch (err) {
    avisar(errorPanel, err.message);
  }
}

/**
 * Agenda de los próximos días con las reservas de cada uno, para poder elegir
 * un día de descanso sin dejar tirado a nadie.
 */
function pintarAgenda(agenda) {
  const libres = agenda.filter((d) => d.abre && !d.cerradoPuntual && d.reservas === 0);

  contenedorAgenda.innerHTML = `
    <p class="campo__ayuda" style="margin-top:0">
      ${libres.length
        ? `Hay <strong>${libres.length}</strong> días abiertos sin ninguna reserva en las próximas 4 semanas.
           Cerrar uno de esos no afecta a nadie.`
        : 'Todos los días abiertos de las próximas 4 semanas tienen alguna reserva.'}
    </p>
    <div class="agenda">
      ${agenda.map((d) => {
        // Cierre semanal (los lunes): se puede abrir ese día concreto.
        if (d.cierreSemanal && !d.aperturaExtra) {
          return `<button class="dia dia--semanal" type="button" data-abrir-dia="${d.fecha}"
                          title="Cerráis todos los ${d.diaSemana.toLowerCase()}. Pulsa para abrir este día.">
                    <span class="dia__fecha">${fechaCorta(d.fecha)}</span>
                    <span class="dia__estado">cerrado · abrir</span>
                  </button>`;
        }
        if (d.cerradoPuntual) {
          return `<button class="dia dia--cerrado" type="button" data-reabrir-dia="${d.fecha}"
                          title="Día cerrado. Pulsa para volver a abrirlo.">
                    <span class="dia__fecha">${fechaCorta(d.fecha)}</span>
                    <span class="dia__estado">cerrado</span>
                  </button>`;
        }
        const extra = d.aperturaExtra ? ' dia--extra' : '';
        return `
          <button class="dia ${d.reservas ? 'dia--ocupado' : 'dia--libre'}${extra}" type="button"
                  data-cerrar-dia="${d.fecha}"
                  title="${d.reservas ? `${d.reservas} reservas, ${d.comensales} comensales` : 'Sin reservas'}">
            <span class="dia__fecha">${fechaCorta(d.fecha)}${d.aperturaExtra ? ' ·' : ''}</span>
            <span class="dia__estado">${d.aperturaExtra ? 'abierto extra' : (d.reservas ? `${d.reservas} res. · ${d.comensales} pax` : 'libre')}</span>
          </button>`;
      }).join('')}
    </div>
    <p class="campo__ayuda">
      Verde: abierto y sin reservas, se puede cerrar.
      Naranja: tiene reservas. Apagado: cerrado — púlsalo para abrir ese día,
      por ejemplo un lunes de festivo.
    </p>`;
}

contenedorAgenda.addEventListener('click', async (e) => {
  // Abrir un día de cierre semanal, o reabrir uno cerrado puntualmente.
  const abrir = e.target.closest('[data-abrir-dia]');
  const reabrir = e.target.closest('[data-reabrir-dia]');

  if (abrir || reabrir) {
    const fecha = (abrir || reabrir).dataset.abrirDia || reabrir.dataset.reabrirDia;
    try {
      if (abrir) {
        const motivo = prompt(`Abrir el ${fechaLarga(fecha)} de forma excepcional. ¿Motivo?`, 'Festivo');
        if (motivo === null) return;
        await api('/api/ajustes', { method: 'POST', cuerpo: { tipo: 'apertura', fecha, motivo } });
        avisar(okAjustes, 'Día abierto. La web ya admite reservas ese día.');
      } else {
        await api(`/api/ajustes?fecha=${fecha}`, { method: 'DELETE' });
        avisar(okAjustes, 'Día reabierto.');
      }
      cargarAjustes();
    } catch (err) {
      avisar(errorPanel, err.message);
    }
    return;
  }

  const boton = e.target.closest('[data-cerrar-dia]');
  if (!boton) return;

  const fecha = boton.dataset.cerrarDia;
  const motivo = prompt(`Cerrar el ${fechaLarga(fecha)}. ¿Motivo?`, 'Día de descanso');
  if (motivo === null) return;

  try {
    let r = await api('/api/ajustes', { method: 'POST', cuerpo: { fecha, motivo } });

    if (r.requiereConfirmacion) {
      const seguir = confirm(
        `Ese día tiene ${r.reservas} reserva(s) con ${r.comensales} comensales.\n\n` +
        'Si lo cierras seguirán en la lista y tendrás que avisarles tú por teléfono.\n\n¿Cerrar igualmente?');
      if (!seguir) return;
      r = await api('/api/ajustes', { method: 'POST', cuerpo: { fecha, motivo, confirmado: true } });
    }

    avisar(okAjustes, 'Día cerrado. La web ya no admite reservas ese día.');
    cargarAjustes();
  } catch (err) {
    avisar(errorPanel, err.message);
  }
});

document.querySelector('[data-guardar-plazas]').addEventListener('click', async () => {
  try {
    await api('/api/ajustes', { method: 'PUT', cuerpo: { plazasPorTurno: Number(campoPlazas.value) } });
    avisar(okAjustes, 'Aforo guardado.');
  } catch (err) {
    avisar(errorPanel, err.message);
  }
});

document.querySelector('[data-anadir-cierre]').addEventListener('click', async () => {
  const fecha = document.getElementById('cierre-fecha').value;
  if (!fecha) return avisar(errorPanel, 'Elige la fecha que quieres cerrar.');

  const motivo = document.getElementById('cierre-motivo').value;
  try {
    let r = await api('/api/ajustes', { method: 'POST', cuerpo: { fecha, motivo } });

    if (r.requiereConfirmacion) {
      const seguir = confirm(
        `Ese día tiene ${r.reservas} reserva(s) con ${r.comensales} comensales.\n\n` +
        'Si lo cierras seguirán en la lista y tendrás que avisarles tú por teléfono.\n\n¿Cerrar igualmente?');
      if (!seguir) return;
      await api('/api/ajustes', { method: 'POST', cuerpo: { fecha, motivo, confirmado: true } });
    }

    document.getElementById('cierre-motivo').value = '';
    avisar(okAjustes, 'Día cerrado añadido.');
    cargarAjustes();
  } catch (err) {
    avisar(errorPanel, err.message);
  }
});

contenedorCierres.addEventListener('click', async (e) => {
  const cierre = e.target.closest('[data-quitar]');
  const apertura = e.target.closest('[data-quitar-apertura]');
  if (!cierre && !apertura) return;

  const fecha = cierre ? cierre.dataset.quitar : apertura.dataset.quitarApertura;
  const tipo = apertura ? '&tipo=apertura' : '';
  try {
    await api(`/api/ajustes?fecha=${fecha}${tipo}`, { method: 'DELETE' });
    cargarAjustes();
  } catch (err) {
    avisar(errorPanel, err.message);
  }
});

// --- Arranque ---

api('/api/sesion')
  .then((datos) => {
    if (datos.autenticado) return entrar();
    seccionAcceso.classList.remove('oculto');
    if (!datos.configurado) {
      avisar(document.querySelector('[data-login-error]'),
        'Falta configurar la contraseña (variable ADMIN_PASSWORD en Cloudflare).', 0);
    }
  })
  .catch(() => {
    seccionAcceso.classList.remove('oculto');
    avisar(document.querySelector('[data-login-error]'),
      'El panel necesita estar desplegado en Cloudflare Pages con la base de datos conectada.', 0);
  });
