// Animaciones de entrada, contadores y cabecera al desplazar.
// Sin librerías: IntersectionObserver y transiciones CSS, para no cargar la web.

(function () {
  const sinMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const animables = [...document.querySelectorAll('[data-anima]')];

  // Quien tenga activado "reducir movimiento" ve todo directamente.
  if (sinMovimiento) {
    animables.forEach((e) => e.classList.add('visible'));
    document.querySelectorAll('[data-contador]').forEach((e) => {
      e.textContent = e.dataset.contador;
    });
    return;
  }

  // Los elementos hermanos entran escalonados, no todos de golpe.
  const porPadre = new Map();
  for (const el of animables) {
    const hermanos = porPadre.get(el.parentElement) || [];
    el.style.transitionDelay = `${Math.min(hermanos.length * 90, 450)}ms`;
    hermanos.push(el);
    porPadre.set(el.parentElement, hermanos);
  }

  const observador = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      entrada.target.classList.add('visible');
      observador.unobserve(entrada.target);
    }
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });

  animables.forEach((el) => observador.observe(el));

  // --- Contadores de las cifras de portada ---

  const animarContador = (el) => {
    const objetivo = parseFloat(el.dataset.contador.replace(',', '.'));
    const decimales = (el.dataset.contador.split(',')[1] || '').length;
    const duracion = 1100;
    const inicio = performance.now();

    const paso = (ahora) => {
      const avance = Math.min((ahora - inicio) / duracion, 1);
      const suave = 1 - Math.pow(1 - avance, 3);
      el.textContent = (objetivo * suave).toFixed(decimales).replace('.', ',');
      if (avance < 1) requestAnimationFrame(paso);
    };
    requestAnimationFrame(paso);
  };

  const observadorCifras = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      animarContador(entrada.target);
      observadorCifras.unobserve(entrada.target);
    }
  }, { threshold: 0.5 });

  document.querySelectorAll('[data-contador]').forEach((el) => {
    el.textContent = '0';
    observadorCifras.observe(el);
  });

  // --- La cabecera se compacta al bajar ---

  const cabecera = document.querySelector('.cabecera');
  if (cabecera) {
    let pendiente = false;
    const revisar = () => {
      cabecera.classList.toggle('cabecera--compacta', window.scrollY > 30);
      pendiente = false;
    };
    addEventListener('scroll', () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(revisar);
    }, { passive: true });
    revisar();
  }
})();
