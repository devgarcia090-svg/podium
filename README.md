# Podium Café & Grill — web, carta y reservas

Web del restaurante con la carta completa, un sistema de reservas propio con
panel para el personal, y un generador de códigos QR para las mesas.

- `public/index.html` — portada: destacados, menú diario, fotos, horario y mapa.
- `public/carta.html` — carta completa, con buscador y botón de imprimir.
- `public/reservar.html` — formulario de reserva para el cliente.
- `public/admin.html` — panel del restaurante: ver, confirmar y cancelar reservas.
- `public/qr.html` — genera e imprime el cartel con el QR de la carta.
- `worker.js` + `src/` — la API de reservas.

Todo es HTML, CSS y JavaScript sin frameworks ni compilación: se edita y se sube.

---

## 1. Publicar la web

Es un **Worker con assets estáticos**: `worker.js` atiende `/api/*` (las reservas)
y todo lo demás (HTML, CSS, fotos) sale de `public/`.

Este repositorio contiene **solo la web de Podium**, con el `wrangler.toml` en la
raíz. Por eso la configuración de Cloudflare no tiene ningún truco:

| Campo | Valor |
|---|---|
| Git repository | `devgarcia090-svg/podium` |
| **Root directory** | *(vacío / `/`)* |
| Build command | *(vacío)* |
| Deploy command | `npx wrangler deploy` |
| Production branch | `main` |

> No metas aquí otras webs. Si en la raíz no hay `wrangler.toml`, wrangler se
> inventa un worker «Hello world» y elige como assets la primera carpeta que
> encuentre con un `index.html`, que es exactamente como se acabó publicando
> otra web encima de esta.

Las direcciones quedan limpias: `/`, `/carta`, `/reservar`, `/qr`, `/admin`.

## 2. Activar las reservas

### 2.1 La base de datos

Ya está creada (`podium-reservas`) y su `database_id` está puesto en
`wrangler.toml`. Si algún día hay que rehacerla:

```bash
npx wrangler d1 create podium-reservas          # copia el database_id a wrangler.toml
npx wrangler d1 execute podium-reservas --remote --file=schema.sql
```

### 2.2 La contraseña del panel

En **Settings → Variables and Secrets**, añade como *Secret*:

| Nombre | Valor |
|---|---|
| `ADMIN_PASSWORD` | la contraseña para entrar en `/admin` |
| `SESSION_SECRET` | un texto largo cualquiera e inventado (firma las sesiones) |

Vuelve a desplegar para que cojan efecto.

> Mientras no exista la base de datos, el formulario de reservas sigue
> funcionando: envía la reserva por WhatsApp al teléfono del local.

## 3. El QR de las mesas

Abre `tudominio.com/qr.html`, comprueba que la dirección es la definitiva y pulsa
**Imprimir cartel** (o **Descargar SVG** para llevarlo a la imprenta). El QR apunta
a la carta online, así que **al cambiar un precio no hay que reimprimir nada**.

---

## Cambios del día a día

| Qué quieres cambiar | Dónde |
|---|---|
| Precios, platos, menú del día | `public/assets/js/carta-datos.js` |
| Horario, teléfono, dirección, aforo máximo | `public/assets/js/config.js` |
| Plazas por turno y días cerrados | Panel `admin.html`, sin tocar código |
| Fotos del local | `public/assets/img/fotos/` |

El horario de `public/assets/js/config.js` lo usan a la vez la web y el servidor de reservas, así
que cambiándolo en un sitio se actualiza todo.

---

## Probar en local

```bash
cd podium
npm install wrangler
npx wrangler d1 execute podium-reservas --local --file=schema.sql
npx wrangler dev
```

Para probar el panel en local, crea un fichero `.dev.vars` (no se sube a git):

```
ADMIN_PASSWORD=loquesea
SESSION_SECRET=otracosa
```

---

## Antes de abrir la web al público

- **Rellenar los datos fiscales** marcados como `[COMPLETAR]` en
  `public/aviso-legal.html` y `public/privacidad.html`: razón social, NIF y un
  correo de contacto. Sin eso la web incumple la LSSI y el RGPD.
- **Decidir el dominio definitivo** antes de imprimir el QR, o habrá que
  reimprimirlo. Al cambiarlo, actualizar también `robots.txt`, `sitemap.xml` y
  la etiqueta `canonical` de la portada.

## Pendiente de confirmar

- **El horario** está tomado de Google y Restaurant Guru. Revísalo en
  `public/assets/js/config.js` y corrige lo que no cuadre.
- La carta se ha generado desde `carta-original.pdf`, **alérgenos incluidos**
  (venían como iconos de la tipografía `eicon`). Se han corregido erratas
  («Lecguga» → «Lechuga», «foa» → «foie»). Conviene repasar los precios.
- **36 platos no traían alérgenos declarados** en el PDF (por ejemplo la
  parrillada de marisco). La web los muestra como «alérgenos sin declarar»,
  nunca como libres de alérgenos, y el filtro avisa de que no puede filtrarlos.
  Conviene completarlos en `public/assets/js/carta-datos.js`.
