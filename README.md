# Plataforma de publicación de propuestas

Publica sitios estáticos (un `.zip`, un archivo suelto o HTML pegado) en
`<nombre>.site.whatever.tech`, al estilo de tiiny.host. Es un panel de una sola
página y sin login.

- **frontend/**: React 19, Vite, TailwindCSS v4, shadcn-ui, TanStack Query y CodeMirror.
- **backend/**: Node.js, Fastify, MongoDB (metadatos y visitas) y disco local (archivos).

## Desarrollo

```bash
npm install
npm run db:up      # MongoDB en Docker (127.0.0.1:27017)
npm run dev        # API en :3000 + Vite en :5173
```

- Panel: <http://localhost:5173>
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

```bash
npm ci && npm run build
cp backend/.env.example backend/.env   # y ajústalo
npm start                              # Fastify sirve API, panel y sitios en :3000
```

Ejemplo de nginx con wildcard en [deploy/nginx.conf](deploy/nginx.conf). Necesitas:

1. DNS `*.site.whatever.tech` → IP del VPS.
2. Un certificado wildcard (Let's Encrypt con reto DNS-01).
3. **Proteger el panel**: no tiene login, así que cualquiera con acceso puede publicar o borrar. Usa basic auth en nginx, una lista de IPs o una VPN.

Haz copias de seguridad de MongoDB y de `DATA_DIR`.
