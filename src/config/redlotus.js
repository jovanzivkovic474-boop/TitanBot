// ╔══════════════════════════════════════════════════════════════════╗
// ║           RED LOTUS KILL TRACKER - Discord Bot v1.0             ║
// ║       AI-powered kill reader from screenshots + merge           ║
// ╚══════════════════════════════════════════════════════════════════╝

require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");
const https = require("https");

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const CONFIG = {
  FAMILY_NAME: "Red Lotus",
  DATA_FILE: path.join(__dirname, "kills_data.json"),
  SESSION_FILE: path.join(__dirname, "sessions.json"),
  MAX_IMAGE_SIZE_MB: 20,
  ALLOWED_ROLES: [], // Prazno = svi mogu koristiti. Dodaj role ID-eve za restrikciju
  ADMIN_ROLE_ID: process.env.ADMIN_ROLE_ID || "",
};

// ─── INICIJALIZACIJA ─────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ─── DATA MANAGEMENT ─────────────────────────────────────────────────────────

function loadData() {
  if (!fs.existsSync(CONFIG.DATA_FILE)) {
    return { kills: {}, totalKills: 0, lastUpdated: null };
  }
  return JSON.parse(fs.readFileSync(CONFIG.DATA_FILE, "utf8"));
}

function saveData(data) {
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(CONFIG.DATA_FILE, JSON.stringify(data, null, 2));
}

function loadSessions() {
  if (!fs.existsSync(CONFIG.SESSION_FILE)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(CONFIG.SESSION_FILE, "utf8"));
}

function saveSessions(sessions) {
  fs.writeFileSync(CONFIG.SESSION_FILE, JSON.stringify(sessions, null, 2));
}

// ─── AI IMAGE ANALYSIS ────────────────────────────────────────────────────────

async function analyzeKillScreenshot(imageUrl) {
  // Preuzmi sliku kao base64
  const imageBuffer = await downloadImage(imageUrl);
  const base64Image = imageBuffer.toString("base64");

  const prompt = `Analizuj ovu sliku iz igre i izvuci SAMO podatke o kill feed-u / kill listi.

ZADATAK:
1. Pronađi sve ubojice (killere) koji pripadaju familiji/klanu "${CONFIG.FAMILY_NAME}"
2. Za svakog igrača iz "${CONFIG.FAMILY_NAME}" koji je napravio kill, izvuci:
   - Tačno ime igrača (case-sensitive)
   - Broj killova koji su vidljivi na slici

PRAVILA:
- Uključi SAMO igrače čije ime sadrži "${CONFIG.FAMILY_NAME}" ili koji su jasno označeni kao član te familije
- Ako je kill feed lista (više redova), broji svaki red kao jedan kill po ubojici
- Ignoriši žrtve (victims), samo nas zanimaju killeri
- Ako ne možeš jasno pročitati ime, preskoči ga

ODGOVORI ISKLJUČIVO u JSON formatu bez ikakvog teksta pre ili posle:
{
  "family": "${CONFIG.FAMILY_NAME}",
  "players": [
    {"name": "ImePIgraca", "kills": 5},
    {"name": "DrugIgrac", "kills": 3}
  ],
  "total_kills_found": 8,
  "confidence": "high/medium/low",
  "notes": "opciona napomena o kvalitetu slike ili problemima"
}

Ako ne postoje killovi od familije "${CONFIG.FAMILY_NAME}" na slici, vrati:
{"family": "${CONFIG.FAMILY_NAME}", "players": [], "total_kills_found": 0, "confidence": "high", "notes": "Nema killova od ove familije"}`;

  const response = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: getMediaType(imageUrl),
              data: base64Image,
            },
          },
          {
            type: "text",
            text: prompt,
          },
        ],
      },
    ],
  });

  const rawText = response.content[0].text.trim();

  // Čišćenje odgovora
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("AI nije vratio validan JSON odgovor");
  }

  return JSON.parse(jsonMatch[0]);
}

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────────────

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      })
      .on("error", reject);
  });
}

function getMediaType(url) {
  const lower = url.toLowerCase();
  if (lower.includes(".png")) return "image/png";
  if (lower.includes(".gif")) return "image/gif";
  if (lower.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

function formatNumber(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getMedalEmoji(rank) {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  if (rank <= 5) return "🔴";
  return "⚔️";
}

function getRankTitle(kills) {
  if (kills >= 500) return "💀 LEGENDARY SLAYER";
  if (kills >= 200) return "🔥 MASTER KILLER";
  if (kills >= 100) return "⚔️ ELITE WARRIOR";
  if (kills >= 50) return "🗡️ VETERAN";
  if (kills >= 20) return "🏹 FIGHTER";
  return "🌱 RECRUIT";
}

// ─── MERGE KILLS LOGIC ───────────────────────────────────────────────────────

function mergeKillData(existingData, newPlayers) {
  const merged = { ...existingData };

  for (const player of newPlayers) {
    const name = player.name.trim();
    if (!name) continue;

    if (merged[name]) {
      merged[name].kills += player.kills;
      merged[name].screenshots += 1;
      merged[name].lastSeen = new Date().toISOString();
    } else {
      merged[name] = {
        kills: player.kills,
        screenshots: 1,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      };
    }
  }

  return merged;
}

// ─── EMBED BUILDERS ──────────────────────────────────────────────────────────

function buildSuccessEmbed(analysisResult, addedKills, sessionId) {
  const embed = new EmbedBuilder()
    .setColor(0xff2244)
    .setTitle("🔴 RED LOTUS — Kill Screenshot Analyzed")
    .setDescription(
      `**${analysisResult.players.length}** igrača detektovano • **${analysisResult.total_kills_found}** killova`
    )
    .setTimestamp();

  if (analysisResult.players.length > 0) {
    const playerList = analysisResult.players
      .sort((a, b) => b.kills - a.kills)
      .map(
        (p) =>
          `\`${p.name.padEnd(20)}\` **${p.kills}** kills ${p.kills >= 10 ? "🔥" : "⚔️"}`
      )
      .join("\n");

    embed.addFields({
      name: "📊 Detektovani killovi",
      value: playerList || "Nema podataka",
      inline: false,
    });
  }

  embed.addFields(
    {
      name: "🎯 AI Confidence",
      value: `\`${analysisResult.confidence.toUpperCase()}\``,
      inline: true,
    },
    {
      name: "📋 Session ID",
      value: `\`${sessionId}\``,
      inline: true,
    }
  );

  if (analysisResult.notes) {
    embed.addFields({
      name: "📝 Napomena",
      value: analysisResult.notes,
      inline: false,
    });
  }

  embed.setFooter({
    text: `Red Lotus Kill Tracker • Koristite /leaderboard za ukupni pregled`,
  });

  return embed;
}

function buildLeaderboardEmbed(data, page = 1) {
  const PAGE_SIZE = 10;
  const sorted = Object.entries(data.kills)
    .sort(([, a], [, b]) => b.kills - a.kills)
    .filter(([, v]) => v.kills > 0);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const start = (page - 1) * PAGE_SIZE;
  const pageData = sorted.slice(start, start + PAGE_SIZE);

  const embed = new EmbedBuilder()
    .setColor(0xff2244)
    .setTitle("🔴 RED LOTUS — Kill Leaderboard")
    .setDescription(
      `Ukupno **${formatNumber(data.totalKills)}** killova • **${sorted.length}** aktivnih ratnika`
    )
    .setTimestamp();

  if (pageData.length === 0) {
    embed.addFields({
      name: "📊 Leaderboard",
      value: "Nema podataka još. Pošalji screenshot sa komandom `!addkills`!",
      inline: false,
    });
  } else {
    const board = pageData
      .map(([name, stats], i) => {
        const rank = start + i + 1;
        const medal = getMedalEmoji(rank);
        const title = getRankTitle(stats.kills);
        return `${medal} **#${rank}** \`${name}\`\n    ╰ **${formatNumber(stats.kills)}** kills • ${title}`;
      })
      .join("\n\n");

    embed.addFields({
      name: `📊 Top Warriors (Strana ${page}/${totalPages})`,
      value: board,
      inline: false,
    });
  }

  if (data.lastUpdated) {
    const date = new Date(data.lastUpdated);
    embed.setFooter({
      text: `Poslednje ažuriranje: ${date.toLocaleDateString("sr")} ${date.toLocaleTimeString("sr")}`,
    });
  }

  return { embed, totalPages };
}

function buildStatsEmbed(playerName, stats, rank) {
  const embed = new EmbedBuilder()
    .setColor(0xff2244)
    .setTitle(`🔴 RED LOTUS — ${playerName}`)
    .setDescription(`${getRankTitle(stats.kills)}`)
    .addFields(
      { name: "⚔️ Ukupni Killovi", value: `**${formatNumber(stats.kills)}**`, inline: true },
      { name: "📸 Screenshots", value: `**${stats.screenshots}**`, inline: true },
      { name: "🏆 Rank", value: `**#${rank}**`, inline: true }
    )
    .setTimestamp();

  if (stats.firstSeen) {
    const first = new Date(stats.firstSeen);
    embed.addFields({
      name: "📅 Pridružen",
      value: first.toLocaleDateString("sr"),
      inline: true,
    });
  }

  return embed;
}

// ─── COMMAND HANDLERS ────────────────────────────────────────────────────────

async function handleAddKills(message) {
  // Provjera da li ima attachmenta
  if (message.attachments.size === 0) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle("❌ Nedostaje screenshot!")
          .setDescription(
            "Pošalji sliku zajedno sa komandom `!addkills`.\n\nPrimer: Priloži screenshot i napiši `!addkills`"
          ),
      ],
    });
  }

  const attachment = message.attachments.first();

  // Provjera fajl tipa
  if (!attachment.contentType?.startsWith("image/")) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle("❌ Pogrešan format!")
          .setDescription("Molim pošalji sliku (PNG, JPG, JPEG, WEBP)"),
      ],
    });
  }

  // Loading poruka
  const loadingMsg = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xffaa00)
        .setTitle("⏳ AI analizira screenshot...")
        .setDescription(
          `Tražim killove familije **${CONFIG.FAMILY_NAME}**...\nOvo može trajati 5-15 sekundi.`
        ),
    ],
  });

  try {
    // AI analiza
    const analysisResult = await analyzeKillScreenshot(attachment.url);

    // Ažuriramo podatke
    const data = loadData();
    const sessionId = `SES${Date.now().toString(36).toUpperCase()}`;

    if (analysisResult.players.length > 0) {
      data.kills = mergeKillData(data.kills, analysisResult.players);
      data.totalKills =
        (data.totalKills || 0) + analysisResult.total_kills_found;

      // Čuvamo session info
      const sessions = loadSessions();
      sessions[sessionId] = {
        timestamp: new Date().toISOString(),
        addedBy: message.author.id,
        players: analysisResult.players,
        totalKills: analysisResult.total_kills_found,
        imageUrl: attachment.url,
      };
      saveSessions(sessions);
    }

    saveData(data);

    // Edit loading poruke sa rezultatom
    await loadingMsg.edit({
      embeds: [
        buildSuccessEmbed(analysisResult, analysisResult.total_kills_found, sessionId),
      ],
    });
  } catch (err) {
    console.error("Error analyzing image:", err);
    await loadingMsg.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ Greška pri analizi!")
          .setDescription(
            `Nisam mogao analizirati sliku.\n\`\`\`${err.message}\`\`\``
          )
          .setFooter({ text: "Pokušaj ponovo sa jasnijim screenshotom" }),
      ],
    });
  }
}

async function handleLeaderboard(message) {
  const data = loadData();

  if (!data.kills || Object.keys(data.kills).length === 0) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4444)
          .setTitle("📊 Red Lotus Leaderboard")
          .setDescription(
            "Nema podataka! Koristite `!addkills` sa screenshotom da dodate killove."
          ),
      ],
    });
  }

  const { embed, totalPages } = buildLeaderboardEmbed(data, 1);

  const row = new ActionRowBuilder();
  if (totalPages > 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId("lb_prev")
        .setLabel("◀ Nazad")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId("lb_next_1")
        .setLabel("Napred ▶")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(totalPages <= 1)
    );
    return message.reply({ embeds: [embed], components: [row] });
  }

  return message.reply({ embeds: [embed] });
}

async function handleStats(message, args) {
  const playerName = args.join(" ");
  if (!playerName) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff4444)
          .setDescription("❌ Unesite ime igrača: `!stats ImePIgraca`"),
      ],
    });
  }

  const data = loadData();
  const sorted = Object.entries(data.kills).sort(([, a], [, b]) => b.kills - a.kills);

  // Case-insensitive pretraga
  const match = sorted.find(
    ([name]) => name.toLowerCase() === playerName.toLowerCase()
  );

  if (!match) {
    // Pokušaj fuzzy search
    const fuzzy = sorted.filter(([name]) =>
      name.toLowerCase().includes(playerName.toLowerCase())
    );

    if (fuzzy.length === 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle("❌ Igrač nije pronađen")
            .setDescription(
              `**${playerName}** ne postoji u bazi.\nKoristite \`!leaderboard\` da vidite sve igrače.`
            ),
        ],
      });
    }

    // Prikaži slične
    const suggestions = fuzzy
      .slice(0, 5)
      .map(([name, s]) => `• \`${name}\` — ${s.kills} kills`)
      .join("\n");

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xffaa00)
          .setTitle("🔍 Slični igrači pronađeni")
          .setDescription(suggestions),
      ],
    });
  }

  const [name, stats] = match;
  const rank = sorted.findIndex(([n]) => n === name) + 1;

  return message.reply({ embeds: [buildStatsEmbed(name, stats, rank)] });
}

async function handleReset(message) {
  // Admin check
  if (
    CONFIG.ADMIN_ROLE_ID &&
    !message.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID) &&
    !message.member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription("❌ Nemate permisiju za ovu komandu!"),
      ],
    });
  }

  const confirmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("confirm_reset")
      .setLabel("✅ DA, resetuj sve")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("cancel_reset")
      .setLabel("❌ Otkaži")
      .setStyle(ButtonStyle.Secondary)
  );

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("⚠️ POTVRDA RESETA")
        .setDescription(
          "Da li ste sigurni da želite obrisati SVE kill podatke?\n**Ova akcija je NEPOVRATNA!**"
        ),
    ],
    components: [confirmRow],
  });
}

async function handleRemovePlayer(message, args) {
  if (
    CONFIG.ADMIN_ROLE_ID &&
    !message.member.roles.cache.has(CONFIG.ADMIN_ROLE_ID) &&
    !message.member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription("❌ Nemate permisiju za ovu komandu!"),
      ],
    });
  }

  const playerName = args.join(" ");
  if (!playerName) {
    return message.reply("❌ Unesite ime: `!removeplayer ImePigraca`");
  }

  const data = loadData();
  const found = Object.keys(data.kills).find(
    (n) => n.toLowerCase() === playerName.toLowerCase()
  );

  if (!found) {
    return message.reply(`❌ Igrač **${playerName}** nije pronađen.`);
  }

  const kills = data.kills[found].kills;
  delete data.kills[found];
  data.totalKills = Math.max(0, (data.totalKills || 0) - kills);
  saveData(data);

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x00ff88)
        .setDescription(
          `✅ Igrač **${found}** uklonjen iz baze (${kills} killova oduzeto)`
        ),
    ],
  });
}

async function handleHelp(message) {
  const embed = new EmbedBuilder()
    .setColor(0xff2244)
    .setTitle("🔴 RED LOTUS KILL TRACKER — Komande")
    .setDescription("Bot za praćenje killova familije Red Lotus")
    .addFields(
      {
        name: "📸 `!addkills`",
        value: "Priloži screenshot uz komandu. Bot će AI analizom izvući killove Red Lotus igrača i dodati ih u bazu.",
        inline: false,
      },
      {
        name: "🏆 `!leaderboard`",
        value: "Prikaži rang listu svih igrača po broju killova.",
        inline: false,
      },
      {
        name: "📊 `!stats [ime]`",
        value: "Prikaži statistiku za određenog igrača.\nPrimer: `!stats RedLotus_Player`",
        inline: false,
      },
      {
        name: "🗑️ `!removeplayer [ime]`",
        value: "(Admin) Ukloni igrača iz baze.",
        inline: false,
      },
      {
        name: "🔄 `!reset`",
        value: "(Admin) Resetuj sve podatke.",
        inline: false,
      }
    )
    .setFooter({ text: `Red Lotus Kill Tracker • Familija: ${CONFIG.FAMILY_NAME}` });

  return message.reply({ embeds: [embed] });
}

// ─── EVENT HANDLERS ───────────────────────────────────────────────────────────

client.once("ready", () => {
  console.log(`
╔══════════════════════════════════════════════╗
║   🔴 RED LOTUS KILL TRACKER — ONLINE!        ║
║   Bot: ${client.user.tag.padEnd(34)}║
║   Familija: ${CONFIG.FAMILY_NAME.padEnd(31)}║
╚══════════════════════════════════════════════╝
  `);

  client.user.setPresence({
    activities: [{ name: "🔴 Red Lotus Killove | !help", type: 3 }],
    status: "online",
  });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!")) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    switch (command) {
      case "addkills":
      case "kills":
      case "upload":
        await handleAddKills(message);
        break;
      case "leaderboard":
      case "lb":
      case "top":
        await handleLeaderboard(message);
        break;
      case "stats":
      case "player":
        await handleStats(message, args);
        break;
      case "reset":
        await handleReset(message);
        break;
      case "removeplayer":
      case "remove":
        await handleRemovePlayer(message, args);
        break;
      case "help":
      case "komande":
        await handleHelp(message);
        break;
    }
  } catch (err) {
    console.error(`Greška pri komandi ${command}:`, err);
    message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(`❌ Interna greška: \`${err.message}\``),
      ],
    });
  }
});

// Button interactions (leaderboard paginacija i reset potvrda)
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isButton()) return;

  const { customId } = interaction;

  // Reset potvrda
  if (customId === "confirm_reset") {
    saveData({ kills: {}, totalKills: 0, lastUpdated: null });
    saveSessions({});
    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff88)
          .setTitle("✅ Reset Uspješan")
          .setDescription("Svi kill podaci su obrisani."),
      ],
      components: [],
    });
  }

  if (customId === "cancel_reset") {
    return interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff88)
          .setDescription("✅ Reset otkazan."),
      ],
      components: [],
    });
  }

  // Leaderboard paginacija
  if (customId.startsWith("lb_")) {
    const data = loadData();
    const { embed, totalPages } = buildLeaderboardEmbed(data);
    return interaction.update({ embeds: [embed] });
  }
});

// ─── POKRETANJE ───────────────────────────────────────────────────────────────

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ GREŠKA: DISCORD_TOKEN nije postavljen u .env fajlu!");
  process.exit(1);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("❌ GREŠKA: ANTHROPIC_API_KEY nije postavljen u .env fajlu!");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
