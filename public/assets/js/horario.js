// Cálculo de horarios y turnos. Sin DOM: lo usan la web y el servidor de reservas.

(function () {
  const P = globalThis.PODIUM;

  const euros = (n) => n.toFixed(2).replace('.', ',') + ' €';

  const aMinutos = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };

  const aHora = (min) => {
    const m = ((min % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };

  const tramoEnMinutos = (tramo) => {
    const a = aMinutos(tramo.abre);
    let c = aMinutos(tramo.cierra);
    if (c <= a) c += 1440;   // cierra de madrugada
    return [a, c];
  };

  const diaDeHorario = (diaSemana) => P.horario.find((d) => d.dia === diaSemana);

  const textoTramos = (dia) =>
    dia.cerrado || !dia.tramos.length
      ? 'Cerrado'
      : dia.tramos.map((t) => `${t.abre} - ${t.cierra}`).join(' · ');

  const fechaISO = (fecha) =>
    `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

  const aFecha = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  const fechaLarga = (iso) =>
    aFecha(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const fechaCorta = (iso) =>
    aFecha(iso).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

  // Comprueba también los tramos que vienen de la madrugada del día anterior.
  function estaAbierto(ahora = new Date()) {
    const minutosHoy = ahora.getHours() * 60 + ahora.getMinutes();
    for (const desplazamiento of [0, -1]) {
      const dia = diaDeHorario((ahora.getDay() + desplazamiento + 7) % 7);
      if (!dia || dia.cerrado) continue;
      for (const tramo of dia.tramos) {
        const [a, c] = tramoEnMinutos(tramo);
        const min = minutosHoy - desplazamiento * 1440;
        if (min >= a && min < c) return true;
      }
    }
    return false;
  }

  /**
   * Turnos reservables de una fecha YYYY-MM-DD, según el horario del local.
   * `ignorarAntelacion` lo usa el panel: el personal sí puede mover una reserva
   * a una hora de hoy que ya no se ofrece al cliente.
   */
  function turnosDeFecha(iso, ahora = new Date(), { ignorarAntelacion = false, tramos = null } = {}) {
    const dia = diaDeHorario(aFecha(iso).getDay());
    // `tramos` lo usa una apertura extraordinaria: ese día se abre aunque
    // normalmente sea de cierre semanal.
    const horarioDelDia = tramos || (dia && !dia.cerrado ? dia.tramos : null);
    if (!horarioDelDia) return [];

    const { intervaloMinutos, minutosAntesCierre, antelacionMinutos } = P.reservas;
    const esHoy = !ignorarAntelacion && iso === fechaISO(ahora);
    const minimoHoy = ahora.getHours() * 60 + ahora.getMinutes() + antelacionMinutos;

    const turnos = [];
    const vistos = new Set();
    for (const tramo of horarioDelDia) {
      const [abre, cierra] = tramoEnMinutos(tramo);
      for (let t = abre; t <= cierra - minutosAntesCierre; t += intervaloMinutos) {
        if (esHoy && t < minimoHoy) continue;
        const hora = aHora(t);
        if (vistos.has(hora)) continue;
        vistos.add(hora);
        turnos.push({ hora, turno: tramo.turno });
      }
    }
    return turnos;
  }

  /** A qué turno (Comida / Cena) pertenece una hora de una fecha. */
  function turnoDeHora(iso, hora) {
    const dia = diaDeHorario(aFecha(iso).getDay());
    // Si ese día es de cierre semanal pero hay reservas, es una apertura
    // extraordinaria: se mira contra el horario de apertura.
    const horarioDelDia = dia && !dia.cerrado ? dia.tramos : P.reservas.tramosApertura;
    if (!horarioDelDia) return '';

    const minutos = aMinutos(hora);
    for (const tramo of horarioDelDia) {
      const [abre, cierra] = tramoEnMinutos(tramo);
      const m = minutos < abre ? minutos + 1440 : minutos;
      if (m >= abre && m <= cierra) return tramo.turno;
    }
    return '';
  }

  Object.assign(globalThis, {
    euros, aMinutos, aHora, tramoEnMinutos, diaDeHorario, textoTramos,
    fechaISO, aFecha, fechaLarga, fechaCorta, estaAbierto, turnosDeFecha, turnoDeHora
  });
})();
