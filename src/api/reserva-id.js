import {
  json, fallo, esFechaISO, exigirSesion, exigirBase, disponibilidadDe, limpiar
} from '../servidor.js';

const ESTADOS = ['pendiente', 'confirmada', 'cancelada'];
const TELEFONO = /^[+\d][\d\s.\-()]{6,19}$/;

/**
 * Modificar una reserva desde el panel: cambiar el estado (confirmar, cancelar)
 * o los datos (fecha, hora, comensales, contacto y notas).
 */
export async function onRequestPatch({ request, env, params }) {
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

  const reserva = await env.DB.prepare('SELECT * FROM reservas WHERE id = ?').bind(params.id).first();
  if (!reserva) return fallo('No existe esa reserva.', 404);

  const cambios = {};

  if (datos.estado !== undefined) {
    const estado = limpiar(datos.estado, 20);
    if (!ESTADOS.includes(estado)) return fallo('Estado no válido.');
    cambios.estado = estado;
  }

  if (datos.nombre !== undefined) {
    const nombre = limpiar(datos.nombre, 80);
    if (nombre.length < 2) return fallo('El nombre no puede quedar vacío.');
    cambios.nombre = nombre;
  }

  if (datos.telefono !== undefined) {
    const telefono = limpiar(datos.telefono, 20);
    if (!TELEFONO.test(telefono)) return fallo('El teléfono no parece válido.');
    cambios.telefono = telefono;
  }

  if (datos.notas !== undefined) cambios.notas = limpiar(datos.notas, 300) || null;

  if (datos.personas !== undefined) {
    const personas = Number(datos.personas);
    if (!Number.isInteger(personas) || personas < 1 || personas > 99) {
      return fallo('El número de comensales no es válido.');
    }
    cambios.personas = personas;
  }

  // Cambio de día u hora: comprobamos que el turno existe en el horario del local.
  if (datos.fecha !== undefined || datos.hora !== undefined) {
    const fecha = datos.fecha !== undefined ? limpiar(datos.fecha, 10) : reserva.fecha;
    const hora = datos.hora !== undefined ? limpiar(datos.hora, 5) : reserva.hora;

    if (!esFechaISO(fecha)) return fallo('La fecha no es válida.');

    // El personal sí puede colocar una reserva a una hora que ya no se ofrece
    // al cliente, o en un día marcado como cerrado: ellos saben lo que hacen.
    const disponibilidad = await disponibilidadDe(env, fecha, { ignorarAntelacion: true, excluir: params.id });
    if (!disponibilidad.turnos.some((t) => t.hora === hora)) {
      return fallo(`Ese día no abrís a las ${hora}. Revisa el horario del local.`);
    }

    cambios.fecha = fecha;
    cambios.hora = hora;
  }

  const claves = Object.keys(cambios);
  if (!claves.length) return fallo('No has cambiado nada.');

  await env.DB
    .prepare(`UPDATE reservas SET ${claves.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
    .bind(...claves.map((c) => cambios[c]), params.id)
    .run();

  return json({ ok: true, ...cambios });
}
