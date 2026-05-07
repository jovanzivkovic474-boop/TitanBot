const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const Anthropic = require('@anthropic-ai/sdk');
const fetch = require('node-fetch');

// ============================================================
//  KONFIGURACIJA - izmijeni ovo
// ============================================================
const DISCORD_TOKEN = 'MTUwMTkzNjg1OTk1NjM3OTgxMQ.GmrSuG.IyHxYyzpsIZ1oSXF7V9zAqluEx-9qFkMeM1Q8E';
const ANTHROPIC_API_KEY = '1501936859956379811';
const KANAL_ID = '1449469932818399434'; // ID kanala gdje se šalju slike s kilovima
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// Globalna mapa: igrac -> ukupni kilovi (čuva se dok bot radi)
const ukupniKilovi = new Map();

// ---------------------------------------------------------------
// Pomoćna f-ja: skida sliku kao base64
// ---------------------------------------------------------------
async function slikaUBase64(url) {
  const res = await fetch(url);
  const buffer = await res.buffer();
  return buffer.toString('base64');
}

// ---------------------------------------------------------------
// Šalje sliku Claudeu i vraća parsiran JSON s kilovima
// ---------------------------------------------------------------
async function procitajKiloveNaSlici(base64Slika, mediaType) {
  const prompt = `Ovo je screenshot iz igre koji prikazuje kill feed ili listu killova.
Tvoj zadatak:
1. Pronađi SAMO igrače koji su u familiji "Red Lotus" (sa desne strane piše "Red Lotus").
2. Za svakog takvog igrača izvuci njegovo IME i broj KILLOVA.
3. Vrati SAMO validan JSON u ovom formatu, bez ikakvog teksta prije ili poslije:
{
  "igraci": [
    { "ime": "ImeIgraca", "kilovi": 123 },
    { "ime": "DrugiIgrac", "kilovi": 45 }
  ]
}
Ako ne pronađeš nijednog Red Lotus igrača, vrati: { "igraci": [] }`;

  const odgovor = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64Slika,
            },
          },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const tekst = odgovor.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');

  // Čisti eventualne ```json ``` wrappere
  const ociscen = tekst.replace(/```json|```/g, '').trim();
  return JSON.parse(ociscen);
}

// ---------------------------------------------------------------
// Gradi Discord embed s ukupnom listom
// ---------------------------------------------------------------
function napraviEmbed(noviIgraci, izvora) {
  // Ažuriraj globalnu mapu
  for (const { ime, kilovi } of noviIgraci) {
    const trenutno = ukupniKilovi.get(ime) || 0;
    ukupniKilovi.set(ime, trenutno + kilovi);
  }

  // Sortiraj po kilovima (najveći prvi)
  const sortirano = [...ukupniKilovi.entries()].sort((a, b) => b[1] - a[1]);

  const embed = new EmbedBuilder()
    .setTitle('🔴 Red Lotus — Ukupni Kilovi')
    .setColor(0xff2222)
    .setTimestamp();

  if (sortirano.length === 0) {
    embed.setDescription('Nema zabilježenih killova.');
    return embed;
  }

  const redovi = sortirano
    .map(([ime, kilovi], i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      return `${medal} **${ime}** — ${kilovi} kills`;
    })
    .join('\n');

  embed.setDescription(redovi);

  if (noviIgraci.length > 0) {
    const noviTekst = noviIgraci
      .map(({ ime, kilovi }) => `+${kilovi} → **${ime}**`)
      .join('\n');
    embed.addFields({ name: '📸 Novo sa ove slike', value: noviTekst });
  } else {
    embed.addFields({ name: '📸 Novo sa ove slike', value: 'Nije pronađen nijedan Red Lotus igrač.' });
  }

  embed.setFooter({ text: `Slika: ${izvora}` });
  return embed;
}

// ---------------------------------------------------------------
// Event: bot spreman
// ---------------------------------------------------------------
client.once('ready', () => {
  console.log(`✅ Bot prijavljen kao ${client.user.tag}`);
  console.log(`📡 Pratim kanal: ${KANAL_ID}`);
});

// ---------------------------------------------------------------
// Event: nova poruka
// ---------------------------------------------------------------
client.on('messageCreate', async (message) => {
  // Samo određeni kanal, ignorišemo botove
  if (message.channelId !== KANAL_ID) return;
  if (message.author.bot) return;

  // Provjeri ima li attachment koji je slika
  const slike = message.attachments.filter((a) => {
    const ct = a.contentType || '';
    return ct.startsWith('image/');
  });

  if (slike.size === 0) return;

  // Reakcija da bot "radi"
  await message.react('⏳');

  const rezultati = [];

  for (const [, attachment] of slike) {
    try {
      const mediaType = attachment.contentType || 'image/png';
      const base64 = await slikaUBase64(attachment.url);
      const podaci = await procitajKiloveNaSlici(base64, mediaType);
      rezultati.push(...(podaci.igraci || []));
    } catch (err) {
      console.error('Greška pri obradi slike:', err);
    }
  }

  // Spoji duplikate unutar iste poruke (isti igrač na više slika)
  const spojenoIzPoruke = new Map();
  for (const { ime, kilovi } of rezultati) {
    spojenoIzPoruke.set(ime, (spojenoIzPoruke.get(ime) || 0) + kilovi);
  }
  const noviIgraci = [...spojenoIzPoruke.entries()].map(([ime, kilovi]) => ({ ime, kilovi }));

  // Ukloni ⏳, dodaj ✅
  await message.reactions.resolve('⏳')?.remove();
  await message.react('✅');

  // Pošalji embed
  const embed = napraviEmbed(noviIgraci, message.author.username);
  await message.reply({ embeds: [embed] });
});

// ---------------------------------------------------------------
// Slash komanda /resetkilove (opcionalno)
// ---------------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'resetkilove') {
    ukupniKilovi.clear();
    await interaction.reply('✅ Svi kilovi su resetovani!');
  }
});

client.login(DISCORD_TOKEN);
