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
  { title: 'Datos limpios', text: 'Las estadísticas no cuentan bots, vistas previas de enlaces ni al equipo.' },
  { title: 'Ahorra clics', text: 'Selecciona varias filas para archivar o actualizar en lote.' },
  { title: 'Atajo secreto', text: 'En el editor HTML, ⌘/Ctrl + S guarda y publica.' },
  { title: 'Para presentaciones', text: 'Cada proyecto tiene su código QR, descargable en PNG.' },
  { title: 'Un clic y listo', text: 'El ícono de copiar en Acciones deja el enlace listo para pegar.' },
  { title: 'Nada se pierde', text: 'Lo que mandas a la papelera se puede restaurar.' },
  INVITE,
  { title: 'Curiosidad cósmica', text: 'Mueve el cursor por el fondo: la nebulosa te sigue ✨' },
  { title: 'Todo en orden por aquí', text: 'Tus sitios siguen en línea.' },
]

// --- Login view ---------------------------------------------------------------------------------

/** Who grants access for now (single shared account, set up by the team). */
export const ACCESS_EMAIL = 'implementation@whatever.tech'

export const LOGIN_GREETING: Line = { title: '¡Hola! Soy Will Doo 👋', text: 'Inicia sesión y te acompaño a publicar tus proyectos.' }
export const LOGIN_INVITE: Line = { title: '¿Qué es esto?', text: 'Haz clic en mí y te cuento qué se puede hacer aquí 💬' }
export const LOGIN_FACTS: Line[] = [
  { title: 'Del otro lado', text: 'Te esperan tus proyectos, cada uno en su propio subdominio.' },
  { title: 'Recordatorio', text: 'Al entrar, tu sesión dura 7 días en este navegador.' },
  { title: 'Ojo con los intentos', text: 'Tras 5 contraseñas incorrectas hay que esperar 15 minutos.' },
  { title: '¿Sin acceso?', text: `Escríbele a ${ACCESS_EMAIL} y te lo dan.` },
  { title: 'Tranqui', text: 'Cuando escribas la contraseña, miro para otro lado 🙈' },
  LOGIN_INVITE,
  { title: 'Curiosidad cósmica', text: 'Mueve el cursor por el fondo: la nebulosa te sigue ✨' },
]
/** Said when the password field gets focus, while he looks away. */
export const SHY: Line = { title: 'No miro, prometido 🙈', text: 'Escribe tranquilo tu contraseña.' }

export type SceneName = 'login' | 'app'
export interface Scene {
  greeting: Line
  /** Always his second bubble. */
  invite: Line
  facts: Line[]
}
export const SCENES: Record<SceneName, Scene> = {
  login: { greeting: LOGIN_GREETING, invite: LOGIN_INVITE, facts: LOGIN_FACTS },
  app: { greeting: GREETING, invite: INVITE, facts: FACTS },
}

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
    keys: ['estadistic', 'visitas', 'vistas', 'metricas', 'analitica', 'cuantas personas', 'abrio', 'abrieron', 'vio', 'leyo', 'registro', 'visitantes', 'personas unicas'],
    answer: () =>
      'El ícono de barras de cada fila muestra personas únicas, visitas (veces que lo abrieron) y páginas vistas en 7, 30 o 90 días, ' +
      'más un registro con cada visita: cuándo fue, desde qué dispositivo y de dónde llegó. No cuenta bots, vistas previas de enlaces ni al equipo 👀',
    follow: ['¿Cómo lo comparto?', '¿Para qué sirve el QR?'],
  },
  {
    keys: ['qr', 'imprimir', 'impresa', 'presentacion'],
    answer: () => 'El ícono de QR genera el código del proyecto: puedes copiar el enlace o descargarlo en PNG para una presentación o un impreso.',
  },
  {
    keys: ['compartir', 'comparto', 'enviar', 'envio', 'mandar', 'cliente', 'copiar'],
    answer: () =>
      'El ícono de copiar de cada fila (en Acciones) deja el enlace listo para pegar; también está el QR. Si es confidencial, protégelo con contraseña antes de enviarlo.',
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

// What he answers on the login screen: only about getting in. Facts come from backend/src/auth.ts
// (7-day session, 5 failures -> 15-minute lockout, username trimmed, password case-sensitive).
export const LOGIN_STARTERS = ['¿Cómo consigo acceso?', 'Olvidé mi contraseña', '¿Por qué no puedo entrar?', '¿Qué es esta plataforma?']

const LOGIN_OFF_TOPIC = [
  'Uy, eso está fuera de mi órbita 🛸. Aquí te ayudo a entrar: pregúntame cómo conseguir acceso o qué hacer si no puedes iniciar sesión.',
  'Para todo lo que no sea sobre el acceso a esta plataforma, mi respuesta oficial es 01101110 01101111 😅. ¿Te ayudo a entrar?',
  'Primero lo primero: inicia sesión 🔐. Si algo no te deja entrar, pregúntame y lo vemos.',
]

const LOGIN_INTENTS: Intent[] = [
  {
    keys: ['acceso', 'cuenta', 'usuario', 'registr', 'crear cuenta', 'darme de alta', 'alta', 'entrar por primera', 'invitacion', 'credenciales', 'quien me da'],
    answer: () =>
      `Por ahora el acceso lo da el equipo de implementación: escríbele a ${ACCESS_EMAIL} y te pasan tu usuario y contraseña.`,
    follow: ['Olvidé mi contraseña', '¿Qué es esta plataforma?'],
  },
  {
    keys: ['olvide', 'olvido', 'recuperar', 'restablecer', 'resetear', 'reset', 'cambiar contrasena', 'nueva contrasena', 'no me acuerdo', 'no recuerdo'],
    answer: () => `Todavía no hay recuperación automática. Escríbele a ${ACCESS_EMAIL} y te ayudan con una contraseña nueva.`,
    follow: ['¿Por qué no puedo entrar?'],
  },
  {
    keys: ['bloque', 'intentos', 'demasiados', 'esperar', 'espera', 'minutos', '429'],
    answer: () =>
      'Tras 5 contraseñas incorrectas seguidas, el acceso se bloquea 15 minutos desde ese equipo. Pasado ese tiempo puedes volver a intentarlo.',
    follow: ['Olvidé mi contraseña', '¿Cómo consigo acceso?'],
  },
  {
    keys: ['no puedo entrar', 'no me deja', 'no funciona', 'incorrect', 'error', 'falla', 'no entra', 'invalid', 'no puedo iniciar'],
    answer: () =>
      'Revisa que la contraseña esté bien escrita: distingue mayúsculas y minúsculas. Después de 5 intentos fallidos hay que esperar 15 minutos. ' +
      `Si sigue sin funcionar, escríbele a ${ACCESS_EMAIL}.`,
    follow: ['Olvidé mi contraseña', '¿Cómo consigo acceso?'],
  },
  {
    keys: ['cuanto dura', 'sesion', 'recordar', 'mantener', 'cada vez', 'siempre tengo que', 'expira', 'caduca'],
    answer: () => 'Al entrar, tu sesión dura 7 días en este navegador. Si quieres cerrarla antes, usa «Salir», arriba a la derecha del panel.',
  },
  {
    keys: ['seguro', 'segura', 'seguridad', 'privacidad', 'me ves', 'miras', 'cookie'],
    answer: () =>
      'Tu sesión se guarda en una cookie protegida que el navegador no deja leer a otras páginas. Y cuando escribes la contraseña, yo miro para otro lado 🙈',
  },
  {
    keys: ['que es esto', 'que es esta', 'para que sirve', 'que puedo hacer', 'que se puede', 'que hace', 'plataforma', 'como funciona', 'que mas'],
    answer: () =>
      'Es el Publicador de subdominios de Whatever Tech: subimos el HTML de cada proyecto y lo publicamos en su propio subdominio, listo para compartir con el cliente, con estadísticas de visitas y acceso privado. Inicia sesión para empezar 🚀',
    follow: ['¿Cómo consigo acceso?'],
  },
  {
    // Platform how-tos asked before signing in: valid questions, answered inside.
    keys: ['publicar', 'publico', 'subir', 'subo', 'zip', 'html', 'proyecto', 'subdominio', 'compartir', 'estadistic', 'visitas', 'qr', 'archivar', 'papelera', 'editar'],
    answer: () => '¡Esa me la sé! 😉 Te la respondo adentro: inicia sesión, hazme clic y vuelve a preguntarme.',
    follow: ['¿Cómo consigo acceso?'],
  },
  {
    keys: ['hola', 'buenas', 'hey', 'que tal', 'saludos', 'buen dia', 'buenos dias'],
    answer: () => '¡Hola! 👋 ¿Te ayudo a entrar? Puedo contarte cómo conseguir acceso o qué hacer si no puedes iniciar sesión.',
    follow: LOGIN_STARTERS.slice(0, 3),
  },
  {
    keys: ['gracias', 'genial', 'perfecto', 'buenisimo', 'excelente', 'crack'],
    answer: () => '¡A ti! Te espero del otro lado 🛸',
  },
  {
    keys: ['quien eres', 'que eres', 'will doo', 'como te llamas', 'tu nombre', 'eres un robot'],
    answer: () => 'Soy Will Doo, la mascota de Whatever Tech 🤖. Aquí te ayudo a entrar, y adentro te acompaño mientras publicas tus proyectos.',
    follow: ['¿Cómo consigo acceso?'],
  },
]

const BRAINS: Record<SceneName, { intents: Intent[]; offTopic: string[]; starters: string[] }> = {
  app: { intents: INTENTS, offTopic: OFF_TOPIC, starters: STARTERS },
  login: { intents: LOGIN_INTENTS, offTopic: LOGIN_OFF_TOPIC, starters: LOGIN_STARTERS },
}

/** Opening message and suggested questions for the chat in each view. */
export const CHAT_INTRO: Record<SceneName, { text: string; follow: string[] }> = {
  app: { text: '¡Hola! Soy Will Doo 🤖 Pregúntame lo que quieras sobre el Publicador de subdominios.', follow: STARTERS },
  login: { text: '¡Hola! Soy Will Doo 🤖 ¿Problemas para entrar? Pregúntame lo que quieras sobre el acceso.', follow: LOGIN_STARTERS },
}

/** Lowercase, no accents, no punctuation, single spaces: so "¿Cómo publico?" matches "como publico". */
const normalize = (text: string) =>
  ` ${text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `

let offTopicTurn = Math.floor(Math.random() * 10)

export function reply(question: string, ctx: BrainContext, scene: SceneName = 'app'): Reply {
  const brain = BRAINS[scene]
  const q = normalize(question)
  const full: Required<BrainContext> = { sitesSuffix: ctx.sitesSuffix ?? '.propuestas.whatever.tech', maxUploadMb: ctx.maxUploadMb ?? 50 }
  let best: Intent | null = null
  let bestScore = 0
  for (const intent of brain.intents) {
    const score = intent.keys.reduce((n, k) => (q.includes(normalize(k).trimEnd()) ? n + 1 : n), 0)
    if (score > bestScore) {
      best = intent
      bestScore = score
    }
  }
  if (!best) {
    offTopicTurn += 1
    return { text: brain.offTopic[offTopicTurn % brain.offTopic.length], follow: brain.starters.slice(0, 2) }
  }
  return { text: best.answer(full), follow: best.follow }
}
