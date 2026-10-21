# Plataforma de publicación de propuestas

Publica sitios estáticos (un `.zip`, un archivo suelto o HTML pegado) en
`<nombre>.sites.whatever.tech`, al estilo de tiiny.host. Es un panel de una sola
página con un único usuario administrador.

- **frontend/**: React 19, Vite, TailwindCSS v4, shadcn-ui, TanStack Query y CodeMirror.
- **backend/**: Node.js, Fastify, MongoDB (metadatos y visitas) y disco local (archivos).

## Desarrollo

```bash
npm install
npm run db:up      # MongoDB en Docker (127.0.0.1:27017)
npm run dev        # API en :3000 + Vite en :5173
```

- Panel: <http://localhost:5173>. Sin `ADMIN_PASSWORD_HASH` en `backend/.env`, el login es `admin` / `admin`.
- Sitios: `http://<nombre>.localhost:3000`. Los navegadores resuelven `*.localhost` solos, así que no hay que tocar DNS ni `/etc/hosts`.

Los archivos se guardan en `backend/data/` (está en `.gitignore`).

## Funcionalidades

| Acción | Detalle |
| --- | --- |
| Publicar | `.zip` (se descomprime; si todo está dentro de una carpeta, se publica su contenido), archivo suelto, código pegado o ejemplo |
| Nombre | Comprobación de disponibilidad en vivo; nombres reservados: `www`, `api`, `app`… |
| Actualizar archivos | Reemplazar todo o añadir archivos. Cada cambio escribe una versión nueva y la activa de forma atómica |
| Personalizar | Cambiar el subdominio, protegerlo con contraseña y elegir la página de inicio |
| Editar HTML | Editor de archivos de texto (HTML/CSS/JS…) con Ctrl/⌘+S |
| Estadísticas | Visitas diarias a páginas HTML (7/30/90 días) |
| QR | Descarga en PNG |
| Menú ⋯ | Abrir, copiar enlace, descargar `.zip`, archivar y papelera (restaurar o eliminar definitivamente) |

Los sitios admiten URLs limpias (`/precios` sirve `precios.html`) e `index.html` en subcarpetas.

## Producción (VPS)

- Panel: <https://panel.sites.whatever.tech>. Login con `ADMIN_USERNAME` y la contraseña cuyo hash está en `ADMIN_PASSWORD_HASH`.
- Sitios: `https://<nombre>.sites.whatever.tech`.

### CI/CD (GitHub Actions)

- [ci.yml](.github/workflows/ci.yml): typecheck, lint y build en cada pull request.
- [deploy.yml](.github/workflows/deploy.yml): en cada push a `main`, pasa la CI y luego:
  1. Construye la imagen Docker.
  2. Genera `secrets.env` a partir de los secrets.
  3. Envía ambos por SSH al usuario `sitesdeploy` del VPS.
  4. Comprueba `/health`.

En el VPS, la clave de `sitesdeploy` solo puede ejecutar [app-deploy](deploy/vps/bin/app-deploy). Este script:
- carga la imagen;
- instala los secrets (solo acepta claves conocidas);
- reinicia el contenedor;
- si `/health` no responde, restaura la imagen y los secrets anteriores.

| Secret | Contenido |
| --- | --- |
| `MONGODB_URI` | Cadena de conexión de MongoDB Atlas |
| `ADMIN_PASSWORD_HASH` | `npm run hash-password -w backend -- <contraseña>` |
| `SESSION_SECRET` | 32+ caracteres aleatorios (cookie de sesión del panel) |
| `SITE_COOKIE_SECRET` | 32+ caracteres aleatorios (cookie de los sitios con contraseña) |
| `SSH_PRIVATE_KEY` | Clave privada de deploy; su pública está en `/etc/sites-platform/ci_deploy.pub` |
| `SSH_KNOWN_HOSTS` | `<IP> ssh-ed25519 …` del VPS |

Variables: `SSH_HOST` (IP del VPS) y `ADMIN_USERNAME` (`admin` por defecto).

Para cambiar la contraseña del panel, genera un hash nuevo, actualiza el secret `ADMIN_PASSWORD_HASH` y vuelve a lanzar el workflow Deploy.

### Servidor

[deploy/setup-server.sh](deploy/setup-server.sh) prepara el VPS con acceso root (alias SSH `whatever-vps`). Ejecuta [deploy/vps/install.sh](deploy/vps/install.sh), que es idempotente. Hay que lanzarlo la primera vez y cada vez que cambie `deploy/`; el workflow no toca la configuración del servidor.

Cada subdominio se publica igual que en WT_OutsourcingPlatform. Basta el DNS comodín `*.sites.whatever.tech` → IP del VPS, que ya existe; no se necesita un certificado comodín.

1. Al publicar o renombrar un proyecto, el backend pide por SSH `ensure <nombre>` al usuario `sitesprov`. Su clave solo puede ejecutar [sites-dispatch](deploy/vps/bin/sites-dispatch).
2. [site-ensure](deploy/vps/bin/site-ensure) emite el certificado de Let's Encrypt de ese subdominio (webroot) y escribe su server de nginx en `/etc/nginx/sites-platform/`. Si `nginx -t` falla, restaura el anterior.
3. Mientras tanto el panel muestra «Publicando». Tarda unos segundos. Si falla, muestra «Error HTTPS» y se reintenta al reiniciar el contenedor o al restaurar el proyecto.
4. Al eliminar definitivamente un proyecto, o al renombrarlo, [site-release](deploy/vps/bin/site-release) borra el server y el certificado del nombre que queda libre.

`certbot.timer` renueva los certificados solo. Let's Encrypt permite unos 50 certificados nuevos por semana para todo `whatever.tech`, compartidos con las demás plataformas.

La IP del VPS debe estar en Network Access de MongoDB Atlas. Haz copias de seguridad de MongoDB y de `/var/lib/sites-platform` (archivos publicados).
