import {
  json, fallo, esFechaISO, exigirSesion, exigirBase, plazasPorTurno, limpiar, ahoraLocal
} from '../servidor.js';

const DIAS_VISTA = 28;

/**
 * Aforo por turno, días de cierre puntual y agenda de los próximos días.
 *
 * La agenda incluye cuántas reservas tiene cada día, que es lo que hace falta
 * para elegir un día de descanso sin dejar tirado a nadie.
 */
export async function onRequestGet({ request, env }) {
  const sinBase = exigirBase(env);
  if (sinBase) return sinBase;

  const sinSesion = await exigirSesion(request, env);
  if (sinSesion) return sinSesion;

  const hoy = globalThis.fechaISO(ahoraLocal());
  const hasta = globalThis.fechaISO(new Date(globalThis.aFecha(hoy).getTime() + DIAS_VISTA * 86400000));

  const [cierres, aperturas, ocupacion] = await Promise.all([
    env.DB.prepare('SELECT fecha, motivo FROM cierres WHERE fecha >= ? ORDER BY fecha').bind(hoy).all(),
    env.DB.prepare('SELECT fecha, motivo FROM aperturas WHERE fecha >= ? ORDER BY fecha').bind(hoy).all(),
    env.DB.prepare(`SELECT fecha, COUNT(*) AS reservas, SUM(personas) AS comensales
                    FROM reservas
                    WHERE fecha >= ? AND fecha <= ? AND estado <> 'cancelada'
                    GROUP BY fecha`).bind(hoy, hasta).all()
  ]);

  const porFecha = Object.fromEntries((ocupacion.results || []).map((r) => [r.fecha, r]));
  const cerrados = new Set((cierres.results || []).map((c) => c.fecha));
  const abiertos = new Set((aperturas.results || []).map((a) => a.fecha));

  const agenda = [];
  for (let i = 0; i < DIAS_VISTA; i++) {
    const fecha = globalThis.fechaISO(new Date(globalThis.aFecha(hoy).getTime() + i * 86400000));
    const dia = globalThis.diaDeHorario(globalThis.aFecha(fecha).getDay());
    agenda.push({
      fecha,
      diaSemana: dia?.nombre || '',
      cierreSemanal: Boolean(dia?.cerrado),
      abre: !dia?.cerrado || abiertos.has(fecha),
      aperturaExtra: abiertos.has(fecha),
      cerradoPuntual: cerrados.has(fecha),
      reservas: porFecha[fecha]?.reservas || 0,
      comensales: porFecha[fecha]?.comensales || 0
    });
  }

  return json({
    plazasPorTurno: await plazasPorTurno(env),
    cierres: cierres.results || [],
    aperturas: aperturas.results || [],
    agenda
  });
}

/** Guardar el aforo por turno. */
export async function onRequestPut({ request, env }) {
  const sinBase = exigirBase(env);
  if (sinBase) return sinBase;

  const sinSesion = await exigirSesion(request, env);
  if (sinSesion) return sinSesion;

  let datos;
  try {
    datos = await request.json();
  } catch {
    return fallo('Petición no válida.');
  }

  const plazas = Number(datos.plazasPorTurno);
  if (!Number.isInteger(plazas) || plazas < 1 || plazas > 999) {
    return fallo('El aforo por turno debe ser un número entre 1 y 999.');
  }

  await env.DB
    .prepare("INSERT INTO ajustes (clave, valor) VALUES ('plazas_por_turno', ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor")
    .bind(String(plazas))
    .run();

  return json({ ok: true, plazasPorTurno: plazas });
}

/** Añadir un día de cierre, o una apertura extraordinaria (`tipo: 'apertura'`). */
export async function onRequestPost({ request, env }) {
  const sinBase = exigirBase(env);
  if (sinBase) return sinBase;

  const sinSesion = await exigirSesion(request, env);
  if (sinSesion) return sinSesion;

  let datos;
  try {
    datos = await request.json();
  } catch {
    return fallo('Petición no válida.');
  }

  if (!esFechaISO(datos.fecha)) return fallo('Indica una fecha válida.');

  // Abrir un día que normalmente está cerrado.
  if (datos.tipo === 'apertura') {
    await env.DB
      .prepare('INSERT INTO aperturas (fecha, motivo) VALUES (?, ?) ON CONFLICT(fecha) DO UPDATE SET motivo = excluded.motivo')
      .bind(datos.fecha, limpiar(datos.motivo, 120) || null)
      .run();
    // Si estaba marcado como cerrado puntual, esa marca ya no tiene sentido.
    await env.DB.prepare('DELETE FROM cierres WHERE fecha = ?').bind(datos.fecha).run();
    return json({ ok: true });
  }

  // Cerrar un día con reservas dentro deja tirada a gente: avisamos y solo
  // seguimos si el personal lo confirma expresamente.
  const afectadas = await env.DB
    .prepare("SELECT COUNT(*) AS n, SUM(personas) AS personas FROM reservas WHERE fecha = ? AND estado <> 'cancelada'")
    .bind(datos.fecha)
    .first();

  if (afectadas.n > 0 && !datos.confirmado) {
    return json({
      ok: false,
      requiereConfirmacion: true,
      reservas: afectadas.n,
      comensales: afectadas.personas || 0
    });
  }

  await env.DB
    .prepare('INSERT INTO cierres (fecha, motivo) VALUES (?, ?) ON CONFLICT(fecha) DO UPDATE SET motivo = excluded.motivo')
    .bind(datos.fecha, limpiar(datos.motivo, 120) || null)
    .run();
  await env.DB.prepare('DELETE FROM aperturas WHERE fecha = ?').bind(datos.fecha).run();

  return json({ ok: true, reservasAfectadas: afectadas.n });
}

/** Quitar un día de cierre. */
export async function onRequestDelete({ request, env }) {
  const sinBase = exigirBase(env);
  if (sinBase) return sinBase;

  const sinSesion = await exigirSesion(request, env);
  if (sinSesion) return sinSesion;

  const url = new URL(request.url);
  const fecha = url.searchParams.get('fecha');
  if (!esFechaISO(fecha)) return fallo('Indica una fecha válida.');

  const tabla = url.searchParams.get('tipo') === 'apertura' ? 'aperturas' : 'cierres';
  await env.DB.prepare(`DELETE FROM ${tabla} WHERE fecha = ?`).bind(fecha).run();
  return json({ ok: true });
}
