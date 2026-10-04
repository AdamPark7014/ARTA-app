/*
 * Emojis locales por categoría (la CSP bloquea scripts y fuentes externas).
 * Palabras clave en español para buscar; el resto se encuentra por categoría.
 */

export type EmojiCategory = { id: string; label: string; icon: string; emojis: string[] };

const split = (s: string) => s.trim().split(/\s+/);

export const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'caras',
    label: 'Caras',
    icon: '😀',
    emojis: split(`😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔
      🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🤧 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁
      😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 💩 🤡 👻 👽 🤖
      😺 😸 😹 😻 😼 😽 🙀 😿 😾`),
  },
  {
    id: 'gestos',
    label: 'Gestos y personas',
    icon: '👋',
    emojis: split(`👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏
      ✍️ 💅 🤳 💪 👀 👁️ 👅 👄 🧠 🫶 👶 🧒 👦 👧 🧑 👨 👩 🧓 👴 👵 🙋 🙆 🙅 🤷 🤦 🙇 💁 🧑‍💻 👨‍💼 👩‍💼
      🧑‍🔧 👷 💂 🕵️ 🧑‍🍳 🧑‍🎤 🧑‍🎨 🦸 🧙 💃 🕺 👯 🚶 🏃`),
  },
  {
    id: 'naturaleza',
    label: 'Animales y naturaleza',
    icon: '🐶',
    emojis: split(`🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐔 🐧 🐦 🐤 🦆 🦅 🦉 🦇 🐺 🐗 🐴 🦄
      🐝 🐛 🦋 🐌 🐞 🐜 🐢 🐍 🦎 🐙 🦑 🦀 🐠 🐟 🐬 🐳 🦈 🐊 🐅 🐆 🦓 🐘 🦒 🐪 🐄 🐎 🐖 🐑 🐐 🦌 🐕 🐈
      🐓 🦃 🦜 🦩 🕊️ 🐇 🐿️ 🦔 🌵 🎄 🌲 🌳 🌴 🌱 🌿 ☘️ 🍀 🍁 🍂 🍃 🌷 🌹 🥀 🌺 🌸 🌼 🌻 🌞 🌝 🌚
      🌙 🌎 🪐 ☀️ 🌤️ ⛅ 🌥️ 🌦️ 🌧️ ⛈️ 🌩️ ❄️ ☃️ ⛄ 🌬️ 🌪️ 🌈 ☔ 🌊`),
  },
  {
    id: 'comida',
    label: 'Comida y bebida',
    icon: '🍕',
    emojis: split(`🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🍆 🥔 🥕 🌽 🌶️ 🥒 🥬 🥦 🧄 🧅 🍄
      🥜 🌰 🍞 🥐 🥖 🥨 🥯 🥞 🧇 🧀 🍖 🍗 🥩 🥓 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🫔 🥙 🧆 🥚 🍳 🥘 🍲 🥣 🥗
      🍿 🧂 🥫 🍱 🍘 🍙 🍚 🍛 🍜 🍝 🍠 🍢 🍣 🍤 🍥 🥮 🍡 🥟 🥠 🥡 🍦 🍧 🍨 🍩 🍪 🎂 🍰 🧁 🥧 🍫
      🍬 🍭 🍮 🍯 🍼 🥛 ☕ 🍵 🧃 🥤 🧋 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🧊 🥄 🍴 🍽️`),
  },
  {
    id: 'actividades',
    label: 'Actividades',
    icon: '🎉',
    emojis: split(`🎉 🎊 🎈 🎁 🎀 🪅 🎆 🎇 🧨 🎃 ⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🏓 🏸 🏒 🏏 ⛳ 🏹 🎣 🥊 🥋 🎽
      🛹 ⛸️ 🎿 🏂 🏋️ 🤸 ⛹️ 🤺 🏌️ 🏇 🧘 🏄 🏊 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🎗️ 🎫 🎟️ 🎪 🤹 🎭 🎨 🎬 🎤 🎧
      🎼 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩`),
  },
  {
    id: 'viajes',
    label: 'Viajes y lugares',
    icon: '✈️',
    emojis: split(`🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🛵 🏍️ 🚲 🛴 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚃 🚋 🚄 🚅 🚂
      🚆 🚇 🚉 ✈️ 🛫 🛬 🛩️ 💺 🚁 🚀 🛸 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ ⛽ 🚧 🚦 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡
      🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🏕️ ⛺ 🏠 🏡 🏗️ 🏭 🏢 🏬 🏥 🏦 🏨 🏪 🏫 💒 🏛️ ⛪ 🌅 🌄 🌠
      🏙️ 🌃 🌌 🌉 🇲🇽 🇺🇸 🇪🇸 🇨🇦 🇨🇴 🇦🇷 🇨🇱 🇵🇪 🇧🇷 🇬🇧 🇫🇷 🇩🇪 🇮🇹 🇯🇵 🏁 🚩 🏳️‍🌈`),
  },
  {
    id: 'objetos',
    label: 'Objetos',
    icon: '💡',
    emojis: split(`⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💾 💿 📷 📸 📹 🎥 📽️ 🎞️ 📞 ☎️ 📺 📻 🎙️ 🎚️ 🎛️ ⏱️ ⏲️ ⏰ 🕰️ ⏳ ⌛ 📡 🔋
      🔌 💡 🔦 🕯️ 🧯 💸 💵 💰 💳 💎 ⚖️ 🧰 🔧 🔨 🛠️ 🔩 ⚙️ 🧱 🧲 💣 🔪 🛡️ 🔮 🔭 🔬 🩹 🩺 💊 💉 🧪
      🌡️ 🧹 🧺 🧻 🧼 🔑 🗝️ 🚪 🛋️ 🛏️ 🧸 🖼️ 🛍️ 🛒 ✉️ 📩 📨 📧 💌 📥 📤 📦 🏷️ 📮 📜 📃 📄 📑 🧾
      📊 📈 📉 🗒️ 🗓️ 📆 📅 🗑️ 📇 🗃️ 🗄️ 📋 📁 📂 🗂️ 📰 📓 📒 📕 📗 📘 📙 📚 📖 🔖 🔗 📎 🖇️ 📐 📏
      📌 📍 ✂️ 🖊️ 🖋️ ✒️ 🖌️ 🖍️ 📝 ✏️ 🔍 🔎 🔒 🔓 🔐 📣 📢 🔔 🔕`),
  },
  {
    id: 'simbolos',
    label: 'Símbolos',
    icon: '❤️',
    emojis: split(`❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 ✅ ☑️ ✔️ ❌ ❎ ➕ ➖ ✖️ ❓ ❗ ‼️ ⁉️
      💯 🔥 ✨ ⭐ 🌟 💫 ⚡ 💥 💢 💦 💤 💬 💭 🗯️ ♻️ ⚠️ 🚫 ⛔ 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟥 🟧 🟨 🟩
      🟦 🟪 ⬛ ⬜ 🔺 🔻 🔸 🔹 ▶️ ⏸️ ⏹️ ⏺️ ⏭️ ⏮️ 🔁 ⬆️ ⬇️ ⬅️ ➡️ ↩️ ↪️ 🆗 🆕 🆒 🆓 🆙 🔝 🔜 #️⃣ 1️⃣
      2️⃣ 3️⃣ 4️⃣ 5️⃣ 6️⃣ 7️⃣ 8️⃣ 9️⃣ 🔟`),
  },
];

/** Palabras clave (español, sin acentos) para la búsqueda del selector. */
const KEYWORDS: Record<string, string> = {
  '😀': 'sonrisa feliz contento',
  '😃': 'sonrisa feliz alegre',
  '😄': 'sonrisa feliz risa',
  '😁': 'sonrisa dientes feliz',
  '😆': 'risa carcajada',
  '😅': 'risa nervios sudor uf',
  '🤣': 'risa carcajada rodar jaja',
  '😂': 'risa llorar jaja lol',
  '🙂': 'sonrisa leve bien',
  '🙃': 'al reves ironia',
  '😉': 'guino complice',
  '😊': 'sonrojo feliz gracias',
  '😇': 'angel inocente',
  '🥰': 'amor enamorado corazones',
  '😍': 'amor enamorado ojos corazon',
  '🤩': 'estrellas wow genial',
  '😘': 'beso',
  '😋': 'rico delicioso sabroso',
  '😜': 'lengua broma guino',
  '🤪': 'loco broma',
  '🤑': 'dinero',
  '🤗': 'abrazo',
  '🤭': 'ups risita',
  '🤫': 'silencio secreto',
  '🤔': 'pensar duda hmm',
  '🤐': 'callado secreto',
  '🤨': 'sospecha ceja',
  '😐': 'neutral serio',
  '😑': 'sin expresion meh',
  '😶': 'sin palabras',
  '😏': 'picaro sonrisa ladeada',
  '😒': 'aburrido molesto',
  '🙄': 'ojos en blanco fastidio',
  '😬': 'mueca incomodo',
  '😌': 'alivio tranquilo',
  '😔': 'triste pensativo',
  '😪': 'sueno cansado',
  '😴': 'dormir sueno zzz',
  '😷': 'cubrebocas enfermo',
  '🤒': 'enfermo fiebre',
  '🤢': 'nausea asco',
  '🤮': 'vomito asco',
  '🥵': 'calor',
  '🥶': 'frio',
  '🤯': 'explota mente impresionante',
  '🤠': 'vaquero',
  '🥳': 'fiesta celebrar cumpleanos',
  '😎': 'lentes cool genial',
  '🤓': 'nerd',
  '🧐': 'monoculo analizar',
  '😕': 'confundido',
  '😟': 'preocupado',
  '😮': 'sorpresa asombro',
  '😲': 'asombro sorpresa',
  '😳': 'sonrojado apenado',
  '🥺': 'por favor suplica',
  '😨': 'miedo',
  '😰': 'ansiedad sudor',
  '😢': 'triste lagrima',
  '😭': 'llorar llanto triste',
  '😱': 'grito miedo panico',
  '😩': 'agotado cansado',
  '🥱': 'bostezo aburrido',
  '😤': 'triunfo bufido',
  '😡': 'enojo furia',
  '😠': 'enojo molesto',
  '🤬': 'groseria enojo',
  '💀': 'calavera muerto',
  '💩': 'popo',
  '🤡': 'payaso',
  '👻': 'fantasma',
  '🤖': 'robot',
  '👋': 'hola adios saludo mano',
  '👌': 'ok perfecto',
  '✌️': 'paz victoria',
  '🤞': 'suerte dedos cruzados',
  '🤘': 'rock',
  '🤙': 'llamame',
  '👈': 'izquierda senalar',
  '👉': 'derecha senalar',
  '👆': 'arriba senalar',
  '👇': 'abajo senalar',
  '👍': 'bien ok si pulgar arriba me gusta',
  '👎': 'mal no pulgar abajo',
  '✊': 'puno fuerza',
  '👊': 'puno golpe',
  '👏': 'aplauso bravo',
  '🙌': 'celebrar manos arriba hurra',
  '🤝': 'trato acuerdo apreton',
  '🙏': 'gracias por favor rezar',
  '💪': 'fuerza musculo',
  '👀': 'ojos mirar viendo',
  '🧠': 'cerebro idea',
  '🫶': 'corazon manos amor',
  '🤷': 'no se encoger',
  '🤦': 'facepalm',
  '🙋': 'mano levantada yo',
  '🙇': 'reverencia perdon',
  '💃': 'bailar baile',
  '🕺': 'bailar baile',
  '🏃': 'correr prisa',
  '🐶': 'perro',
  '🐱': 'gato',
  '🦊': 'zorro',
  '🐻': 'oso',
  '🦁': 'leon',
  '🐵': 'mono',
  '🙈': 'mono no ver',
  '🙉': 'mono no oir',
  '🙊': 'mono no hablar',
  '🦄': 'unicornio',
  '🐝': 'abeja',
  '🦋': 'mariposa',
  '🐢': 'tortuga lento',
  '🌵': 'cactus',
  '🌹': 'rosa flor',
  '🌻': 'girasol flor',
  '🌸': 'flor cerezo',
  '🌞': 'sol',
  '☀️': 'sol',
  '🌙': 'luna noche',
  '⭐': 'estrella',
  '🌈': 'arcoiris',
  '❄️': 'nieve frio',
  '🌧️': 'lluvia',
  '☔': 'lluvia paraguas',
  '🌊': 'ola mar',
  '🍕': 'pizza',
  '🍔': 'hamburguesa',
  '🍟': 'papas',
  '🌮': 'taco',
  '🌯': 'burrito',
  '🌶️': 'chile picante',
  '🥑': 'aguacate',
  '🍿': 'palomitas',
  '🎂': 'pastel cumpleanos',
  '🍰': 'pastel',
  '🍩': 'dona',
  '🍪': 'galleta',
  '🍫': 'chocolate',
  '☕': 'cafe',
  '🍵': 'te',
  '🍺': 'cerveza chela',
  '🍻': 'brindis cervezas salud',
  '🥂': 'brindis salud champana',
  '🍷': 'vino',
  '🥃': 'tequila mezcal whisky',
  '🍹': 'coctel',
  '🍾': 'champana celebrar',
  '🎉': 'fiesta celebrar felicidades',
  '🎊': 'confeti fiesta',
  '🎈': 'globo fiesta',
  '🎁': 'regalo',
  '🎆': 'fuegos artificiales',
  '⚽': 'futbol balon',
  '🏆': 'trofeo ganar campeon',
  '🥇': 'oro primero medalla',
  '🎤': 'microfono cantar',
  '🎧': 'audifonos musica',
  '🎸': 'guitarra',
  '🎬': 'cine claqueta grabar',
  '🎭': 'teatro',
  '🎨': 'arte pintura',
  '🎯': 'diana objetivo',
  '🎮': 'videojuego',
  '🚗': 'carro coche auto',
  '🚚': 'camion entrega',
  '✈️': 'avion viaje vuelo',
  '🚀': 'cohete lanzamiento',
  '🏠': 'casa',
  '🏢': 'oficina edificio',
  '🇲🇽': 'mexico bandera',
  '📱': 'celular telefono',
  '💻': 'laptop computadora',
  '📷': 'camara foto',
  '🎥': 'video camara',
  '📞': 'telefono llamada',
  '⏰': 'alarma reloj',
  '⏳': 'espera tiempo',
  '💡': 'idea foco',
  '💰': 'dinero bolsa',
  '💸': 'dinero gasto',
  '💳': 'tarjeta pago',
  '🔧': 'herramienta llave',
  '🔨': 'martillo',
  '⚙️': 'engrane configuracion',
  '📦': 'paquete caja envio',
  '📊': 'grafica',
  '📈': 'subida grafica crecimiento',
  '📉': 'bajada grafica',
  '📅': 'calendario fecha',
  '📋': 'portapapeles lista',
  '📁': 'carpeta',
  '📌': 'pin chincheta fijar',
  '📍': 'ubicacion lugar',
  '📎': 'clip adjunto',
  '📝': 'nota escribir',
  '✏️': 'lapiz',
  '🔍': 'buscar lupa',
  '🔒': 'candado privado',
  '🔑': 'llave',
  '📣': 'megafono anuncio',
  '🔔': 'campana aviso',
  '❤️': 'corazon amor rojo',
  '💛': 'corazon amarillo',
  '💚': 'corazon verde',
  '💙': 'corazon azul',
  '💜': 'corazon morado',
  '🖤': 'corazon negro',
  '💔': 'corazon roto',
  '✅': 'listo hecho check palomita',
  '✔️': 'check palomita',
  '❌': 'no error cancelar equis',
  '❓': 'pregunta duda',
  '❗': 'importante exclamacion',
  '💯': 'cien perfecto',
  '🔥': 'fuego genial',
  '✨': 'brillos magia',
  '⚡': 'rayo rapido',
  '💥': 'explosion',
  '💬': 'mensaje globo',
  '⚠️': 'advertencia cuidado',
  '🚫': 'prohibido',
  '🔴': 'rojo',
  '🟢': 'verde',
  '🟡': 'amarillo',
  '🆕': 'nuevo',
  '🆗': 'ok',
};

function fold(s: string) {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

let all: string[] | null = null;

export function searchEmoji(q: string, limit = 64): string[] {
  const term = fold(q.trim());
  if (!term) return [];
  all ??= EMOJI_CATEGORIES.flatMap((c) => c.emojis);
  const hits: string[] = [];
  for (const e of all) {
    const words = KEYWORDS[e];
    if (words && words.split(' ').some((w) => w.startsWith(term)) && !hits.includes(e)) hits.push(e);
    if (hits.length >= limit) break;
  }
  return hits;
}

const RECENT_KEY = 'arta.chat.emoji.recent';

export function recentEmojis(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, 24) : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(e: string) {
  try {
    const next = [e, ...recentEmojis().filter((x) => x !== e)].slice(0, 24);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* sin almacenamiento */
  }
}
