// ============================================================
//  RED LOTUS KILL TRACKER BOT
//  Potrebno: npm install discord.js @anthropic-ai/sdk node-fetch
// ============================================================

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

// ============================================================
//  KONFIGURACIJA — stavi u .env fajl ili Railway Variables
// ============================================================
const DISCORD_TOKEN   = process.env.DISCORD_TOKEN;
const ANTHROPIC_KEY   = process.env.ANTHROPIC_API_KEY;
const KANAL_ID        = process.env.KANAL_ID;        // ID kanala za slike
const PREFIX          = '!';                          // prefix za komande
// ============================================================

if (!DISCORD_TOKEN || !ANTHROPIC_KEY || !KANAL_ID) {
  console.error('❌ Nedostaju env varijable! Provjeri DISCORD_TOKEN, ANTHROPIC_API_KEY, KANAL_ID');
  process.exit(1);
}

const client    = new Anthropic({ apiKey: ANTHROPIC_KEY });
const discord   = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ---------------------------------------------------------------
//  BAZA KILLOVA  →  Map<string, number>
//  Čuva se u memoriji dok bot radi
// ---------------------------------------------------------------
const killBaza = new Map();
let ukupnoSlika = 0;

// ---------------------------------------------------------------
//  Skida sliku i konvertuje u base64
// ---------------------------------------------------------------
async function dajBase64(url) {
  const res    = await fetch(url);
  const buffer = await res.buffer();
  return buffer.toString('base64');
}

// ---------------------------------------------------------------
//  Šalje sliku Claudeu, vraća [{ ime, kilovi }]
// ---------------------------------------------------------------
async function procitajSliku(base64, mediaType) {
  const res = await client.messages.create({
    model      : 'claude-opus-4-5',
    max_tokens : 1024,
    messages   : [
      {
        role   : 'user',
        content: [
          {
            type  : 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `Ovo je screenshot iz igre sa kill feedom ili kill listom.

ZADATAK:
- Pronađi SAMO igrače koji su označeni kao "Red Lotus" (piše sa desne strane pored imena).
- Za svakog izvuci: tačno IME igrača i broj KILLOVA.
- Vrati ISKLJUČIVO validan JSON, bez ikakvog teksta ispred ili iza.

FORMAT:
{
  "igraci": [
    { "ime": "ImePlayers", "kilovi": 123 },
    { "ime": "DrugiPlayer", "kilovi": 45 }
  ]
}

Ako nema Red Lotus igrača vrati: { "igraci": [] }`,
          },
        ],
      },
    ],
  });

  const tekst   = res.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const ociscen = tekst.replace(/```json|```/g, '').trim();
  const parsed  = JSON.parse(ociscen);
  return parsed.igraci || [];
}

// ---------------------------------------------------------------
//  Dodaje igrače u globalnu bazu (spaja duplikate)
// ---------------------------------------------------------------
function dodajUBazu(igraci) {
  for (const { ime, kilovi } of igraci) {
    const kljuc    = ime.toLowerCase().trim();
    const trenutno = killBaza.get(kljuc) || 0;
    // Čuvamo originalno ime (prvo koje smo vidjeli)
    if (!killBaza.has(kljuc)) {
      killBaza.set(kljuc, { ime, kilovi });
    } else {
      killBaza.get(kljuc).kilovi += kilovi;
    }
  }
}

// ---------------------------------------------------------------
//  Pravi sortiranu listu za embed
// ---------------------------------------------------------------
function getSortiranaLista() {
  return [...killBaza.values()].sort((a, b) => b.kilovi - a.kilovi);
}

// ---------------------------------------------------------------
//  Pravi Discord Embed sa ukupnom listom
// ---------------------------------------------------------------
function napraviEmbed(noviIgraci = [], brSlika = 0) {
  const lista = getSortiranaLista();

  const embed = new EmbedBuilder()
    .setTitle('🔴 RED LOTUS — Kill Tracker')
    .setColor(0xcc0000)
    .setTimestamp()
    .setFooter({ text: `Ukupno obrađenih slika: ${brSlika}` });

  if (lista.length === 0) {
    embed.setDescription('> Nema zabilježenih killova još uvijek.');
    return embed;
  }

  // Ukupna lista
  const redovi = lista.map(({ ime, kilovi }, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
    return `${medal} \`${ime}\` — **${kilovi} kills**`;
  }).join('\n');

  embed.addFields({ name: '📊 Ukupna Rang Lista', value: redovi });

  // Šta je novo sa ove slike
  if (noviIgraci.length > 0) {
    const novo = noviIgraci.map(({ ime, kilovi }) => `\`${ime}\` +${kilovi}`).join('\n');
    embed.addFields({ name: '📸 Novo sa ove slike', value: novo });
  } else {
    embed.addFields({ name: '📸 Novo sa ove slike', value: 'Nije pronađen nijedan Red Lotus igrač.' });
  }

  return embed;
}

// ---------------------------------------------------------------
//  EVENT: Bot spreman
// ---------------------------------------------------------------
discord.once('ready', () => {
  console.log(`✅ Bot online: ${discord.user.tag}`);
  console.log(`📡 Pratim kanal: ${KANAL_ID}`);
  discord.user.setActivity('🔴 Red Lotus Kill Tracker', { type: 3 });
});

// ---------------------------------------------------------------
//  EVENT: Nova poruka
// ---------------------------------------------------------------
discord.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  // ── KOMANDE ──────────────────────────────────────────────────

  // !lista — prikaži trenutnu rang listu
  if (message.content === `${PREFIX}lista`) {
    const embed = napraviEmbed([], ukupnoSlika);
    return message.reply({ embeds: [embed] });
  }

  // !reset — obriši sve killove
  if (message.content === `${PREFIX}reset`) {
    killBaza.clear();
    ukupnoSlika = 0;
    return message.reply('✅ Svi killovi su resetovani!');
  }

  // !top — top 3 igrača
  if (message.content === `${PREFIX}top`) {
    const lista = getSortiranaLista().slice(0, 3);
    if (lista.length === 0) return message.reply('Nema killova još uvijek.');
    const tekst = lista.map(({ ime, kilovi }, i) => {
      const medal = ['🥇', '🥈', '🥉'][i];
      return `${medal} **${ime}** — ${kilovi} kills`;
    }).join('\n');
    const embed = new EmbedBuilder()
      .setTitle('🔴 Red Lotus — Top 3')
      .setColor(0xcc0000)
      .setDescription(tekst)
      .setTimestamp();
    return message.reply({ embeds: [embed] });
  }

  // !pomoc — lista komandi
  if (message.content === `${PREFIX}pomoc`) {
    const embed = new EmbedBuilder()
      .setTitle('📖 Red Lotus Bot — Komande')
      .setColor(0xcc0000)
      .addFields(
        { name: '`!lista`',  value: 'Prikaži ukupnu rang listu killova' },
        { name: '`!top`',    value: 'Prikaži top 3 igrača' },
        { name: '`!reset`',  value: 'Obriši sve killove i počni iznova' },
        { name: '`!pomoc`',  value: 'Prikaži ovu poruku' },
        { name: 'Slika',     value: `Pošalji sliku u <#${KANAL_ID}> da bot pročita killove` },
      );
    return message.reply({ embeds: [embed] });
  }

  // ── OBRADA SLIKA (samo u kill kanalu) ────────────────────────
  if (message.channelId !== KANAL_ID) return;

  const slike = message.attachments.filter(a => {
    const ct = (a.contentType || '').toLowerCase();
    return ct.startsWith('image/');
  });

  if (slike.size === 0) return;

  // Reakcija "radi"
  await message.react('⏳').catch(() => {});

  let sviNoviIgraci = [];
  let greska = false;

  for (const [, att] of slike) {
    try {
      const mediaType = att.contentType || 'image/png';
      const base64    = await dajBase64(att.url);
      const igraci    = await procitajSliku(base64, mediaType);
      sviNoviIgraci.push(...igraci);
      ukupnoSlika++;
    } catch (err) {
      console.error('Greška pri obradi slike:', err.message);
      greska = true;
    }
  }

  // Spoji duplikate unutar iste poruke
  const spojeno = new Map();
  for (const { ime, kilovi } of sviNoviIgraci) {
    const k = ime.toLowerCase().trim();
    spojeno.set(k, { ime, kilovi: (spojeno.get(k)?.kilovi || 0) + kilovi });
  }
  const noviIgraci = [...spojeno.values()];

  // Dodaj u globalnu bazu
  dodajUBazu(noviIgraci);

  // Ukloni ⏳
  await message.reactions.resolve('⏳')?.remove().catch(() => {});

  if (greska) {
    await message.react('❌').catch(() => {});
  } else {
    await message.react('✅').catch(() => {});
  }

  // Pošalji embed
  const embed = napraviEmbed(noviIgraci, ukupnoSlika);
  await message.reply({ embeds: [embed] });
});

// ---------------------------------------------------------------
//  Prijava
// ---------------------------------------------------------------
discord.login(DISCORD_TOKEN);
