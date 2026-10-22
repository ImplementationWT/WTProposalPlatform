// What Will Doo knows: short facts for his speech bubbles, and the answers he gives in chat. He only
// talks about this platform; anything else gets a playful deflection back to it. Everything here
// describes features that exist in the app, so keep it in sync when they change.

export interface Line {
  title: string
  text: string
}

export interface Reply {
  text: string
  /** Suggested next questions, shown as chips under the answer. */
  follow?: string[]
}

export interface BrainContext {
  /** e.g. ".propuestas.whatever.tech" */
  sitesSuffix?: string
  maxUploadMb?: number
}

export const GREETING: Line = { title: '¡Hola! Soy Will Doo 👋', text: 'Me quedo por aquí viendo qué publicamos hoy.' }

/** Always his second bubble, right after the hello; later it also comes up among the facts. */
export const INVITE: Line = { title: '¿Dudas?', text: 'Haz clic en mí y pregúntame lo que quieras sobre la plataforma 💬' }

/** Things he says unprompted while floating around. */
export const FACTS: Line[] = [
  { title: '¿Qué proyecto lanzamos hoy?', text: 'Súbelo y yo lo miro desde aquí.' },
  { title: '¿Sabías que…?', text: 'Cada proyecto vive en su propio subdominio, con HTTPS incluido.' },
  { title: 'Tip rápido', text: 'La flechita de «Subir archivo» te deja pegar HTML directo.' },
  { title: 'Dato curioso', text: 'Los .zip se descomprimen solos al publicar.' },
  { title: '¿Proyecto confidencial?', text: 'Protégelo con contraseña en ⋯ → Personalizar.' },
  { title: 'Spoiler', text: 'El ícono de barras te dice si el cliente ya lo abrió 👀' },
  { title: 'Ahorra clics', text: 'Selecciona varias filas para archivar o actualizar en lote.' },
  { title: 'Atajo secreto', text: 'En el editor HTML, ⌘/Ctrl + S guarda y publica.' },
  { title: 'Para presentaciones', text: 'Cada proyecto tiene su código QR, descargable en PNG.' },
  { title: 'Nada se pierde', text: 'Lo que mandas a la papelera se puede restaurar.' },
  INVITE,
  { title: 'Curiosidad cósmica', text: 'Mueve el cursor por el fondo: la nebulosa te sigue ✨' },
  { title: 'Todo en orden por aquí', text: 'Tus sitios siguen en línea.' },
]

export const STARTERS = ['¿Qué puedo hacer aquí?', '¿Cómo publico un proyecto?', '¿Cómo lo protejo con contraseña?', '¿Cómo sé si el cliente lo abrió?']

const OFF_TOPIC = [
  'Mis circuitos solo están entrenados en esta plataforma 🤖. De eso no sé nada, pero sí sé publicar un proyecto en diez segundos. ¿Te cuento cómo?',
  'Uy, eso está fuera de mi órbita 🛸. Pregúntame sobre publicar, compartir o proteger proyectos y ahí sí brillo.',
  'Para todo lo que no sea sobre el funcionamiento de esta plataforma, mi respuesta oficial es 01101110 01101111 😅. ¿Probamos con algo de tus proyectos?',
  'Interesante… pero yo solo floto alrededor de los proyectos. Intenta con «¿cómo veo las visitas?».',
  'Si me preguntas eso se me recalienta el visor 🔥. Lo mío es publicar proyectos: pregúntame lo que quieras de eso.',
]

interface Intent {
  keys: string[]
  answer: (ctx: Required<BrainContext>) => string
  follow?: string[]
}

// Order breaks ties: earlier intents win when two match equally well.
const INTENTS: Intent[] = [
  {
    keys: ['que puedo hacer', 'que se puede', 'para que sirve', 'que hace', 'funciones', 'que mas', 'opciones', 'ayuda', 'como funciona'],
    answer: () =>
      'Aquí publicamos los proyectos de Whatever Tech, cada uno en su propio subdominio. Puedes:\n' +
      '• Publicar un .zip, un archivo o HTML pegado\n' +
      '• Actualizar archivos, editar el HTML o cambiar el enlace\n' +
      '• Protegerlo con contraseña\n' +
      '• Ver sus visitas y descargar su QR\n' +
      '• Archivar, mandar a la papelera o restaurar, incluso varios a la vez',
    follow: ['¿Cómo publico un proyecto?', '¿Cómo veo las visitas?', '¿Puedo actualizar varios a la vez?'],
  },
  {
    keys: ['hola', 'buenas', 'hey', 'que tal', 'saludos', 'buen dia', 'buenos dias'],
    answer: () => '¡Hola! 👋 Estoy aquí para ayudarte con el Publicador de subdominios. ¿Quieres saber cómo publicar, actualizar o compartir un proyecto?',
    follow: STARTERS.slice(0, 3),
  },
  {
    keys: ['gracias', 'genial', 'perfecto', 'buenisimo', 'excelente', 'crack', 'te quiero'],
    answer: () => '¡A ti! Si surge otra duda, aquí sigo flotando. 🛸',
  },
  {
    keys: ['quien eres', 'que eres', 'will doo', 'como te llamas', 'tu nombre', 'eres un robot'],
    answer: () =>
      'Soy Will Doo, la mascota de Whatever Tech 🤖. Vivo en el fondo de esta página, vigilo que los proyectos salgan bien publicados y respondo dudas sobre la plataforma.',
    follow: ['¿Qué puedo hacer aquí?'],
  },
  {
    keys: ['publicar', 'publico', 'subir', 'subo', 'cargar', 'nuevo proyecto', 'nueva propuesta', 'crear', 'zip', 'pegar'],
    answer: ({ sitesSuffix, maxUploadMb }) =>
      `Pulsa «Subir archivo» y elige un .zip o un archivo suelto (hasta ${maxUploadMb} MB), o usa la flechita para pegar código HTML. ` +
      `Ponle un nombre: será su enlace, nombre${sitesSuffix}. Al publicar, el .zip se descomprime solo.`,
    follow: ['¿Qué nombre le pongo?', '¿Cuánto puede pesar?', '¿Cómo lo comparto?'],
  },
  {
    keys: ['nombre', 'enlace', 'link', 'url', 'subdominio', 'dominio', 'direccion', 'renombrar'],
    answer: ({ sitesSuffix }) =>
      `Cada proyecto vive en su propio subdominio: nombre${sitesSuffix}. Usa minúsculas, números y guiones; te aviso al instante si el nombre está libre. ` +
      'Puedes cambiarlo en ⋯ → Personalizar, pero la dirección anterior deja de funcionar.',
    follow: ['¿Cómo lo comparto?', '¿Cómo lo protejo con contraseña?'],
  },
  {
    keys: ['varios', 'varias', 'todos', 'todas', 'masiv', 'en lote', 'seleccion', 'seleccionar', 'multiple'],
    answer: () =>
      'Marca el cuadrado a la izquierda de cada fila (o el de arriba para todos) y aparece una barra abajo. Desde ahí puedes actualizar archivos o el acceso de todos a la vez, archivarlos o mandarlos a la papelera.',
    follow: ['¿Qué pasa si archivo uno?', '¿Puedo recuperar algo borrado?'],
  },
  {
    keys: ['actualizar', 'reemplazar', 'modificar', 'nueva version', 'cambiar archivo', 'añadir archivo', 'anadir'],
    answer: () =>
      'En «Actualizar» tienes tres caminos: reemplazar o añadir archivos, personalizar (enlace, acceso y página de inicio) y editar el HTML, CSS o JS directo en el navegador.',
    follow: ['¿Cómo edito el HTML?', '¿Puedo actualizar varios a la vez?'],
  },
  {
    keys: ['editar', 'editor', 'codigo', 'css', 'javascript', ' js', 'corregir', 'typo', 'error de texto'],
    answer: () =>
      'Actualizar → «Editar HTML» abre un editor con tus archivos de texto (HTML, CSS, JS…). Cambias lo que quieras y con ⌘/Ctrl + S se guarda y publica al instante.',
    follow: ['¿Cómo cambio la página de inicio?'],
  },
  {
    keys: ['contrasena', 'password', 'clave', 'privad', 'proteg', 'acceso', 'seguridad', 'confidencial', 'acceso publico'],
    answer: () =>
      'En ⋯ → Personalizar → Acceso elige «Protegido con contraseña» (mínimo 4 caracteres). Quien abra el enlace tendrá que escribirla antes de ver el proyecto, y en la tabla verás el candado «Privado».',
    follow: ['¿Cómo lo comparto?', '¿Cómo veo las visitas?'],
  },
  {
    keys: ['estadistic', 'visitas', 'vistas', 'metricas', 'analitica', 'cuantas personas', 'abrio', 'abrieron', 'vio', 'leyo'],
    answer: () =>
      'El ícono de barras de cada fila muestra las visitas a sus páginas HTML: últimos 7, 30 o 90 días y el total histórico. Ideal para saber si el cliente ya lo abrió 👀',
    follow: ['¿Cómo lo comparto?', '¿Para qué sirve el QR?'],
  },
  {
    keys: ['qr', 'imprimir', 'impresa', 'presentacion'],
    answer: () => 'El ícono de QR genera el código del proyecto: puedes copiar el enlace o descargarlo en PNG para una presentación o un impreso.',
  },
  {
    keys: ['compartir', 'comparto', 'enviar', 'envio', 'mandar', 'cliente', 'copiar'],
    answer: () =>
      'En ⋯ → «Copiar enlace» lo tienes listo para pegar, o abre el QR. Si es confidencial, protégelo con contraseña antes de enviarlo.',
    follow: ['¿Cómo lo protejo con contraseña?', '¿Cómo sé si el cliente lo abrió?'],
  },
  {
    keys: ['archivar', 'archivo uno', 'archivo una', 'archivad', 'ocultar', 'desactivar', 'pausar', 'desarchivar'],
    answer: () =>
      'Archivar deja el sitio fuera de línea sin borrarlo: nadie puede abrir el enlace. Los archivados están en el ícono de caja, arriba a la derecha del panel, y puedes desarchivarlos cuando quieras.',
  },
  {
    keys: ['eliminar', 'borrar', 'borrado', 'papelera', 'restaurar', 'recuperar'],
    answer: () =>
      'Lo que mandas a la papelera (ícono de basurero, arriba a la derecha del panel) se puede restaurar. Solo «Eliminar definitivamente» borra archivos y estadísticas para siempre y deja el nombre libre.',
  },
  {
    keys: ['buscar', 'busco', 'encontrar', 'busqueda'],
    answer: () => 'Usa la barra «Buscar…» del panel: filtra por nombre en la vista donde estés (activos, archivados o papelera).',
  },
  {
    keys: ['descargar', 'backup', 'respaldo', 'copia de seguridad'],
    answer: () => 'En ⋯ → «Descargar .zip» bajas todos los archivos del sitio tal como están publicados.',
  },
  {
    keys: ['https', 'certificado', 'ssl', 'publicando', 'error https', 'no carga', 'no abre'],
    answer: () =>
      'Cada subdominio recibe su certificado HTTPS automáticamente. Mientras se emite verás «Publicando»; si aparece «Error HTTPS», se reintenta al reiniciar el servidor o al restaurar el proyecto.',
  },
  {
    keys: ['pagina de inicio', 'index', 'portada', 'home', 'inicio'],
    answer: () => 'Si tu sitio tiene varias páginas HTML, en ⋯ → Personalizar → «Página de inicio» eliges cuál se abre primero.',
  },
  {
    keys: ['tamano', 'limite', 'pesado', 'pesa', 'peso', 'mb', 'grande'],
    answer: ({ maxUploadMb }) => `Cada subida puede pesar hasta ${maxUploadMb} MB. Si te pasas, comprime las imágenes o súbelas dentro de un .zip.`,
  },
  {
    keys: ['salir', 'cerrar sesion', 'logout'],
    answer: () => 'Arriba a la derecha está «Salir». Yo me quedo aquí cuidando el fondo. 🌌',
  },
  {
    keys: ['nebulosa', 'estrellas', 'cursor', 'fondo', 'animacion', 'espacio'],
    answer: () => 'Mueve el cursor por el fondo y verás la nebulosa seguirte. Las estrellas son de verdad… bueno, casi ✨',
  },
]

/** Lowercase, no accents, no punctuation, single spaces: so "¿Cómo publico?" matches "como publico". */
const normalize = (text: string) =>
  ` ${text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `

let offTopicTurn = Math.floor(Math.random() * OFF_TOPIC.length)

export function reply(question: string, ctx: BrainContext): Reply {
  const q = normalize(question)
  const full: Required<BrainContext> = { sitesSuffix: ctx.sitesSuffix ?? '.propuestas.whatever.tech', maxUploadMb: ctx.maxUploadMb ?? 50 }
  let best: Intent | null = null
  let bestScore = 0
  for (const intent of INTENTS) {
    const score = intent.keys.reduce((n, k) => (q.includes(normalize(k).trimEnd()) ? n + 1 : n), 0)
    if (score > bestScore) {
      best = intent
      bestScore = score
    }
  }
  if (!best) {
    offTopicTurn = (offTopicTurn + 1) % OFF_TOPIC.length
    return { text: OFF_TOPIC[offTopicTurn], follow: STARTERS.slice(0, 2) }
  }
  return { text: best.answer(full), follow: best.follow }
}
