import {
  json, fallo, esFechaISO, diasDesdeHoy, REGLAS, exigirBase, haySesion, disponibilidadDe
} from '../servidor.js';

/**
 * Turnos libres de una fecha.
 * Público para el formulario de reserva; con sesión abierta y `?panel=1`
 * devuelve además las horas que ya no se ofrecen al cliente, para poder mover
 * una reserva desde el panel.
 */
export async function onRequestGet({ request, env }) {
  const sinBase = exigirBase(env);
  if (sinBase) return sinBase;

  const url = new URL(request.url);
  const fecha = url.searchParams.get('fecha');
  if (!esFechaISO(fecha)) return fallo('Indica una fecha válida.');

  const modoPanel = url.searchParams.get('panel') === '1' && (await haySesion(request, env));

  if (modoPanel) {
    const excluir = url.searchParams.get('excluir') || null;
    return json(await disponibilidadDe(env, fecha, { ignorarAntelacion: true, excluir }));
  }

  const dias = diasDesdeHoy(fecha);
  if (dias < 0) return json({ cerrado: true, motivo: 'Esa fecha ya ha pasado.', turnos: [] });
  if (dias > REGLAS.diasVistaMaximos) {
    return json({
      cerrado: true,
      motivo: `Solo aceptamos reservas con ${REGLAS.diasVistaMaximos} días de antelación como máximo.`,
      turnos: []
    });
  }

  return json(await disponibilidadDe(env, fecha));
}
