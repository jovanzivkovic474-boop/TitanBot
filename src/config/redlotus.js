import os
import re
import json
import discord
import cv2
import numpy as np
import pytesseract

from datetime import datetime
from difflib import get_close_matches, SequenceMatcher
from discord.ext import commands, tasks
from typing import Dict, List, Tuple, Optional

# =========================================================
# ENV / CONFIG
# =========================================================

DISCORD_TOKEN = os.getenv("DISCORD_TOKEN", "")
GUILD_ID = int(os.getenv("GUILD_ID", "0"))

WATCH_CHANNEL_ID = int(os.getenv("WATCH_CHANNEL_ID", "0"))
LOG_CHANNEL_ID = int(os.getenv("LOG_CHANNEL_ID", "0"))
ADMIN_ROLE_ID = int(os.getenv("ADMIN_ROLE_ID", "0"))

# Za Red Lotus stavi u Railway Variables:
# FAMILY_NAME=Red Lotus
FAMILY_NAME = os.getenv("FAMILY_NAME", "Red Lotus").strip()
KILL_VALUE = int(os.getenv("KILL_VALUE", "15000"))

BOT_NAME = os.getenv("BOT_NAME", "STATS").strip()
THUMBNAIL_URL = os.getenv("THUMBNAIL_URL", "").strip()
BANNER_URL = os.getenv("BANNER_URL", "").strip()

DATA_DIR = os.getenv("DATA_DIR", ".")
os.makedirs(DATA_DIR, exist_ok=True)

WEEKLY_DATA_FILE = os.path.join(DATA_DIR, "kill_lista.json")
MONTHLY_DATA_FILE = os.path.join(DATA_DIR, "mjesecna_kill_lista.json")
MONTHLY_RESET_META_FILE = os.path.join(DATA_DIR, "monthly_reset_meta.json")
LEARNED_NAMES_FILE = os.path.join(DATA_DIR, "learned_names.json")
KNOWN_PLAYERS_FILE = os.path.join(DATA_DIR, "known_players.json")

AUTO_LEARN_CUTOFF = 0.88
KNOWN_PLAYER_CUTOFF = 0.76
FORCE_KNOWN_AS_FAMILY = True
STRICT_KNOWN_ONLY = True  # V5 PRO: bot ne dodaje nista sto nije known/alias/learned  # V3: ako OCR ne procita Red Lotus, ali prepozna known playera, prihvati ga

# =========================================================
# KNOWN PLAYERS - BOT DODAJE SAMO OVA IMENA / ALIAS / LEARNED
# =========================================================

DEFAULT_KNOWN_PLAYERS = [
    "Mateja Matic",
    "Deda White",
    "Buki Honanza",
    "Kerzy Fuentes",
    "Adis Bossancher000",
    "Zed Elusive",
    "Edjrodj Sawaihsa",
    "Prento Primechief",
    "Albert Wesker",
    "Kimi Rixon",
    "Makii Primechief",
    "Tyson Elysium",
    "Any Elysium",
    "Jonah Tracer",
    "Riven Tracer",
    "Jmmor Elysium",

    # dodatni od ranije / rezerva
    "Skadin Zmaj",
    "Vladyy Kideksicc",
    "Ken Fring",
    "Makii Fraud",
    "Jozo Lahentaestamulocaa",
    "Mire Hayabusa",
    "Kerson Wayne",
]

# =========================================================
# ALIASES / OCR ISPRAVKE
# lijevo = pogresno OCR procitano
# desno = tacno ime
# =========================================================

ALIASES = {
    # FAMILY OCR
    "redlotus": "red lotus",
    "red iotus": "red lotus",
    "red lotu5": "red lotus",
    "red lotos": "red lotus",

    # MATEJA
    "mateja matic eg": "mateja matic",
    "matoja matic eg": "mateja matic",
    "matoja matic": "mateja matic",
    "mateja matlc": "mateja matic",
    "mateja matic": "mateja matic",

    # DEDA WHITE
    "deda vhite": "deda white",
    "deda uhite": "deda white",
    "deqa white": "deda white",
    "deda whlte": "deda white",
    "deda white": "deda white",

    # BUKI
    "buki honanzaa": "buki honanza",
    "buki honan2a": "buki honanza",
    "buki honan7a": "buki honanza",
    "buki honanza": "buki honanza",

    # KERZY
    "kerzy fuentos": "kerzy fuentes",
    "kerzy fuenles": "kerzy fuentes",
    "kerzy fuentes": "kerzy fuentes",

    # ADIS
    "adis bossancheroo": "adis bossancher000",
    "adis bossancherooo": "adis bossancher000",
    "adis bossancher0oo": "adis bossancher000",
    "adis bossancher000": "adis bossancher000",

    # ZED
    "zed eluslve": "zed elusive",
    "zed eluslue": "zed elusive",
    "zed elusive": "zed elusive",

    # EDJRODJ
    "edjrodjsawaihsa": "edjrodj sawaihsa",
    "edjrodj sawaihsa": "edjrodj sawaihsa",
    "edjrodj sawaiha": "edjrodj sawaihsa",
    "edjrodj sawaihsa": "edjrodj sawaihsa",

    # PRENTO
    "prento primechlef": "prento primechief",
    "prento primechiet": "prento primechief",
    "prento primechief": "prento primechief",

    # ALBERT
    "albert vesker": "albert wesker",
    "albert wesk3r": "albert wesker",
    "albert wesker": "albert wesker",

    # KIMI
    "kimi rlxon": "kimi rixon",
    "kimi rix0n": "kimi rixon",
    "kimi rixon": "kimi rixon",

    # MAKII PRIMECHIEF
    "makii primechlef": "makii primechief",
    "makii primechiet": "makii primechief",
    "makii primechief": "makii primechief",

    # TYSON
    "tyson elyslum": "tyson elysium",
    "tyson elysiun": "tyson elysium",
    "tyson elysium": "tyson elysium",

    # ANY
    "any elyslum": "any elysium",
    "any elysiun": "any elysium",
    "any elysium": "any elysium",

    # JONAH/RIVEN/JMMOR
    "jonah trager": "jonah tracer",
    "jonah tracer": "jonah tracer",
    "riven trager": "riven tracer",
    "riven tracer": "riven tracer",
    "jmmor elyslum": "jmmor elysium",
    "jmmor elysiun": "jmmor elysium",
    "jmmor elysium": "jmmor elysium",

    # OLD/RESERVE
    "skadin zmai": "skadin zmaj",
    "skadin znaj": "skadin zmaj",
    "vladyy kideksic": "vladyy kideksicc",
    "vladyy kidekslcc": "vladyy kideksicc",
    "vlady kideksicc": "vladyy kideksicc",
    "ken frlng": "ken fring",
    "ken fnng": "ken fring",
    "maki fraud": "makii fraud",
    "makii traud": "makii fraud",
    "jozo lahenta": "jozo lahentaestamulocaa",
    "jozo lahentaestamu": "jozo lahentaestamulocaa",
    "jozo lahentaestamuloca": "jozo lahentaestamulocaa",
    "mire hayabusa": "mire hayabusa",
    "kerson wayne": "kerson wayne",
}

IGNORED_NAME_PREFIXES = [
    "gg",
    "ic",
    "i c",
    "s ae",
    "sae",
    "s a e",
    "sc",
    "sg",
    "cl",
]

OCR_GARBAGE_WORDS = {
    "white", "sharks", "red", "lotus", "top", "ubica", "rat", "za", "resurs",
    "pobednicka", "familija", "kill", "kills"
}

missing_vars = []
if not DISCORD_TOKEN:
    missing_vars.append("DISCORD_TOKEN")
if GUILD_ID == 0:
    missing_vars.append("GUILD_ID")
if WATCH_CHANNEL_ID == 0:
    missing_vars.append("WATCH_CHANNEL_ID")
if LOG_CHANNEL_ID == 0:
    missing_vars.append("LOG_CHANNEL_ID")

# =========================================================
# DISCORD SETUP
# =========================================================

intents = discord.Intents.default()
intents.message_content = True
intents.messages = True
intents.guilds = True

bot = commands.Bot(command_prefix="!", intents=intents, help_command=None)

# =========================================================
# EMBED STIL
# =========================================================

COLOR_INFO = 0x3498DB
COLOR_SUCCESS = 0x2ECC71
COLOR_WARNING = 0xF1C40F
COLOR_DANGER = 0xE74C3C

BOT_FOOTER = f"{BOT_NAME} • {FAMILY_NAME} Tracker"

# =========================================================
# POMOCNE FUNKCIJE
# =========================================================

def normalize_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()

def normalize_name_basic(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    return normalize_spaces(text)

def family_name_normalized() -> str:
    return normalize_name_basic(FAMILY_NAME)

def format_player_name(name: str) -> str:
    return " ".join(part.capitalize() for part in name.split())

def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize_name_basic(a), normalize_name_basic(b)).ratio()

def clean_player_prefixes(name: str) -> str:
    n = normalize_spaces(name)
    n_low = normalize_name_basic(n)

    changed = True
    while changed:
        changed = False
        for prefix in IGNORED_NAME_PREFIXES:
            pref = normalize_name_basic(prefix)
            if n_low.startswith(pref + " "):
                original_parts = n.split()
                prefix_parts = prefix.split()
                n = " ".join(original_parts[len(prefix_parts):]).strip()
                n_low = normalize_name_basic(n)
                changed = True
                break

    return normalize_spaces(n)

def is_name_garbage(name: str) -> bool:
    n = normalize_name_basic(name)
    if not n:
        return True
    parts = n.split()
    if len(parts) == 0:
        return True
    if len(parts) == 1 and parts[0] in OCR_GARBAGE_WORDS:
        return True
    if all(p in OCR_GARBAGE_WORDS for p in parts):
        return True
    return False

def load_json_file(path: str, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default

def save_json_file(path: str, data) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def load_data(file_path: str) -> Dict[str, int]:
    raw = load_json_file(file_path, {})
    return {str(k): int(v) for k, v in raw.items()}

def save_data(file_path: str, data: Dict[str, int]) -> None:
    save_json_file(file_path, data)

def reset_data(file_path: str) -> None:
    save_data(file_path, {})

def load_learned_names() -> Dict[str, str]:
    data = load_json_file(LEARNED_NAMES_FILE, {})
    cleaned = {}
    for k, v in data.items():
        cleaned[normalize_name_basic(str(k))] = normalize_name_basic(str(v))
    return cleaned

def save_learned_names(data: Dict[str, str]) -> None:
    save_json_file(LEARNED_NAMES_FILE, data)

def learn_name(observed_name: str, canonical_name: str) -> None:
    learned = load_learned_names()
    observed_name = normalize_name_basic(observed_name)
    canonical_name = normalize_name_basic(canonical_name)
    if observed_name and canonical_name:
        learned[observed_name] = canonical_name
        save_learned_names(learned)

def load_known_players() -> List[str]:
    """
    Uvijek spoji DEFAULT_KNOWN_PLAYERS + known_players.json.
    Ovo je bitno jer Railway volume vec ima stari known_players.json,
    pa se novi igraci iz koda inace ne bi automatski dodali.
    """
    data = load_json_file(KNOWN_PLAYERS_FILE, [])
    if not isinstance(data, list):
        data = []

    merged = []
    seen = set()

    for name in DEFAULT_KNOWN_PLAYERS + [str(x).strip() for x in data if str(x).strip()]:
        key = normalize_name_basic(name)
        if key and key not in seen:
            seen.add(key)
            merged.append(format_player_name(key))

    save_json_file(KNOWN_PLAYERS_FILE, merged)
    return merged

def save_known_players(players: List[str]) -> None:
    unique = []
    seen = set()
    for p in players:
        key = normalize_name_basic(p)
        if key and key not in seen:
            seen.add(key)
            unique.append(format_player_name(key))
    save_json_file(KNOWN_PLAYERS_FILE, unique)

def get_all_known_canonical_names() -> List[str]:
    names = set()

    for _, value in ALIASES.items():
        v = normalize_name_basic(value)
        if v and v != family_name_normalized():
            names.add(v)

    learned = load_learned_names()
    for _, value in learned.items():
        v = normalize_name_basic(value)
        if v:
            names.add(v)

    weekly = load_data(WEEKLY_DATA_FILE)
    monthly = load_data(MONTHLY_DATA_FILE)

    for name in weekly.keys():
        names.add(normalize_name_basic(name))
    for name in monthly.keys():
        names.add(normalize_name_basic(name))

    for name in load_known_players():
        names.add(normalize_name_basic(name))

    return sorted(names)

def resolve_against_known_players(raw_name: str) -> Optional[str]:
    raw = normalize_name_basic(raw_name)
    if not raw:
        return None

    known_players = load_known_players()
    if not known_players:
        return None

    normalized_map = {normalize_name_basic(name): name for name in known_players}
    candidates = list(normalized_map.keys())

    matches = get_close_matches(raw, candidates, n=1, cutoff=KNOWN_PLAYER_CUTOFF)
    if matches:
        return normalize_name_basic(normalized_map[matches[0]])

    best_name = None
    best_score = 0.0
    for cand in candidates:
        score = similarity(raw, cand)
        if score > best_score:
            best_score = score
            best_name = cand

    if best_name and best_score >= KNOWN_PLAYER_CUTOFF:
        return normalize_name_basic(normalized_map[best_name])

    return None

def is_allowed_canonical_name(canonical_name: str) -> bool:
    """
    V5 PRO whitelist:
    Ime mora biti u known_players ili learned vrijednostima.
    Ovo sprjecava random OCR imena.
    """
    c = normalize_name_basic(canonical_name)
    if not c:
        return False

    known_set = {normalize_name_basic(x) for x in load_known_players()}
    learned_values = {normalize_name_basic(v) for v in load_learned_names().values()}
    default_set = {normalize_name_basic(x) for x in DEFAULT_KNOWN_PLAYERS}

    return c in known_set or c in learned_values or c in default_set

def resolve_known_player_from_text_loose(text: str) -> Optional[str]:
    """
    V5 PRO fallback:
    Kad OCR linija ima smece, probaj naci najblize known ime unutar cijelog teksta.
    """
    raw = normalize_name_basic(text)
    if not raw:
        return None

    raw = re.sub(r"\b\d+\b", " ", raw)
    for word in OCR_GARBAGE_WORDS:
        raw = re.sub(rf"\b{re.escape(word)}\b", " ", raw)
    raw = normalize_spaces(raw)

    if not raw:
        return None

    best = None
    best_score = 0.0
    for known in load_known_players():
        k = normalize_name_basic(known)
        score = similarity(raw, k)

        known_parts = set(k.split())
        raw_parts = set(raw.split())
        overlap = len(known_parts & raw_parts)
        if overlap:
            score += min(0.12, overlap * 0.06)

        if score > best_score:
            best_score = score
            best = k

    if best and best_score >= 0.72:
        return best
    return None

def resolve_player_name(raw_name: str) -> Tuple[str, str]:
    """
    V5 PRO:
    - nema novih random imena
    - prioritet alias/known/learned
    - fuzzy samo prema whitelist known igracima
    """
    raw_name = clean_player_prefixes(raw_name)
    raw_name = normalize_name_basic(raw_name)

    if not raw_name:
        return "", "empty"

    if raw_name in ALIASES:
        alias_value = normalize_name_basic(ALIASES[raw_name])
        if alias_value == family_name_normalized():
            return "", "family_alias_rejected"
        if is_allowed_canonical_name(alias_value):
            return alias_value, "alias"
        return "", "alias_not_known"

    learned = load_learned_names()
    if raw_name in learned:
        learned_name = normalize_name_basic(learned[raw_name])
        if is_allowed_canonical_name(learned_name):
            return learned_name, "learned"

    known_match = resolve_against_known_players(raw_name)
    if known_match and is_allowed_canonical_name(known_match):
        learn_name(raw_name, known_match)
        return known_match, "known_players"

    loose_match = resolve_known_player_from_text_loose(raw_name)
    if loose_match and is_allowed_canonical_name(loose_match):
        learn_name(raw_name, loose_match)
        return loose_match, "known_loose"

    known_names = sorted({normalize_name_basic(x) for x in load_known_players()})
    matches = get_close_matches(raw_name, known_names, n=1, cutoff=AUTO_LEARN_CUTOFF)

    if matches:
        canonical = normalize_name_basic(matches[0])
        learn_name(raw_name, canonical)
        return canonical, "fuzzy_known"

    return "", "rejected_unknown"

def find_best_player_key(data: Dict[str, int], player_name: str) -> Optional[str]:
    if not data:
        return None

    player_name_norm = normalize_name_basic(player_name)

    for name in data.keys():
        if normalize_name_basic(name) == player_name_norm:
            return name

    partial_matches = []
    for name in data.keys():
        norm_name = normalize_name_basic(name)
        if player_name_norm in norm_name or norm_name in player_name_norm:
            partial_matches.append(name)

    if len(partial_matches) == 1:
        return partial_matches[0]

    normalized_to_original = {normalize_name_basic(name): name for name in data.keys()}
    candidates = list(normalized_to_original.keys())
    matches = get_close_matches(player_name_norm, candidates, n=1, cutoff=0.65)

    if matches:
        return normalized_to_original[matches[0]]

    best_key = None
    best_score = 0.0
    for original in data.keys():
        score = similarity(player_name, original)
        if score > best_score:
            best_score = score
            best_key = original

    if best_key and best_score >= 0.65:
        return best_key

    return None

def is_reset_allowed(member: discord.Member) -> bool:
    if member.guild_permissions.administrator:
        return True
    if member.guild_permissions.manage_guild:
        return True

    if ADMIN_ROLE_ID:
        for role in member.roles:
            if int(role.id) == int(ADMIN_ROLE_ID):
                return True
    return False

def ensure_admin(ctx: commands.Context) -> bool:
    return isinstance(ctx.author, discord.Member) and is_reset_allowed(ctx.author)

def sort_scoreboard(data: Dict[str, int]) -> List[Tuple[str, int]]:
    return sorted(data.items(), key=lambda x: (-x[1], x[0].lower()))

def make_embed(title: str, description: str = "", color: int = COLOR_INFO) -> discord.Embed:
    embed = discord.Embed(title=title, description=description, color=color)
    embed.set_footer(text=BOT_FOOTER)
    if THUMBNAIL_URL:
        embed.set_thumbnail(url=THUMBNAIL_URL)
    if BANNER_URL:
        embed.set_image(url=BANNER_URL)
    return embed

def build_weekly_score_embed_with_bonus(data: Dict[str, int]) -> discord.Embed:
    if not data:
        return make_embed(
            f"🏆 Sedmični {FAMILY_NAME} Ranking",
            "```diff\n- Sedmična lista je trenutno prazna.\n```",
            COLOR_WARNING
        )

    sorted_players = sort_scoreboard(data)
    top_15 = sorted_players[:15]
    lines = []
    medal_map = {1: "🥇", 2: "🥈", 3: "🥉"}

    for rank, (name, kills) in enumerate(top_15, start=1):
        bonus = kills * KILL_VALUE
        icon = medal_map.get(rank, f"`#{rank}`")
        lines.append(f"{icon} **{format_player_name(name)}** — `{kills}` killova • 💸 `{bonus:,}$`")

    embed = make_embed(f"🏆 Sedmični {FAMILY_NAME} Ranking", "\n".join(lines), COLOR_WARNING)

    embed.add_field(name="👥 Igrača", value=str(len(sorted_players)), inline=True)
    embed.add_field(name="💀 Ukupno killova", value=str(sum(data.values())), inline=True)

    if sorted_players:
        leader_name, leader_kills = sorted_players[0]
        leader_bonus = leader_kills * KILL_VALUE
        embed.add_field(
            name="👑 Lider",
            value=f"**{format_player_name(leader_name)}**\n`{leader_kills}` killova • 💸 `{leader_bonus:,}$`",
            inline=True
        )

    return embed

def build_monthly_score_embed(data: Dict[str, int]) -> discord.Embed:
    if not data:
        return make_embed(
            f"📆 Mjesečni {FAMILY_NAME} Ranking",
            "```diff\n- Mjesečna lista je trenutno prazna.\n```",
            COLOR_INFO
        )

    sorted_players = sort_scoreboard(data)
    top_15 = sorted_players[:15]
    lines = []
    medal_map = {1: "🥇", 2: "🥈", 3: "🥉"}

    for rank, (name, kills) in enumerate(top_15, start=1):
        icon = medal_map.get(rank, f"`#{rank}`")
        lines.append(f"{icon} **{format_player_name(name)}** — `{kills}` killova")

    embed = make_embed(f"📆 Mjesečni {FAMILY_NAME} Ranking", "\n".join(lines), COLOR_INFO)
    embed.add_field(name="👥 Igrača", value=str(len(sorted_players)), inline=True)
    embed.add_field(name="💀 Ukupno killova", value=str(sum(data.values())), inline=True)

    if sorted_players:
        leader_name, leader_kills = sorted_players[0]
        embed.add_field(
            name="👑 Lider",
            value=f"**{format_player_name(leader_name)}**\n`{leader_kills}` killova",
            inline=True
        )

    return embed

def add_scores_to_file(file_path: str, found_scores: Dict[str, int]) -> Dict[str, int]:
    total = load_data(file_path)
    for name, kills in found_scores.items():
        total[name] = total.get(name, 0) + kills
    save_data(file_path, total)
    return total

def load_reset_meta() -> dict:
    return load_json_file(MONTHLY_RESET_META_FILE, {})

def save_reset_meta(data: dict) -> None:
    save_json_file(MONTHLY_RESET_META_FILE, data)

def check_and_reset_monthly_if_needed() -> bool:
    now = datetime.now()
    current_key = f"{now.year}-{now.month:02d}"

    meta = load_reset_meta()
    last_reset_key = meta.get("last_monthly_reset")

    if now.day == 1 and now.hour >= 4 and last_reset_key != current_key:
        reset_data(MONTHLY_DATA_FILE)
        save_reset_meta({"last_monthly_reset": current_key})
        return True
    return False

async def read_attachment_bytes(attachment: discord.Attachment) -> bytes:
    data = await attachment.read()
    if not data:
        raise ValueError("Attachment je prazan.")
    return data

async def send_log_embed(title: str, description: str, color: int = COLOR_INFO):
    if not LOG_CHANNEL_ID:
        return

    channel = bot.get_channel(LOG_CHANNEL_ID)
    if channel is None:
        try:
            channel = await bot.fetch_channel(LOG_CHANNEL_ID)
        except Exception:
            return

    try:
        await channel.send(embed=make_embed(title, description, color))
    except Exception:
        pass

# =========================================================
# OCR V2.5
# =========================================================

def build_variants(img_gray: np.ndarray) -> List[np.ndarray]:
    """
    LIGHT-STABLE OCR:
    Manje OCR prolaza = manje timeouta na Railway.
    I dalje radi contrast + threshold, ali bez previse teskih varijanti.
    """
    variants = []

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    base = clahe.apply(img_gray)
    base = cv2.convertScaleAbs(base, alpha=1.55, beta=8)
    variants.append(base)

    blur = cv2.GaussianBlur(base, (3, 3), 0)
    _, th = cv2.threshold(blur, 145, 255, cv2.THRESH_BINARY)
    variants.append(th)

    return variants

def preprocess_image_regions(image_bytes: bytes) -> Dict[str, List[np.ndarray]]:
    np_arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

    if img is None:
        raise ValueError("Slika nije mogla da se učita.")

    img = cv2.resize(img, None, fx=2.4, fy=2.4, interpolation=cv2.INTER_CUBIC)
    h, w = img.shape[:2]

    board = img[int(h * 0.02):int(h * 0.95), int(w * 0.36):int(w * 0.995)]
    names_region = board[:, int(board.shape[1] * 0.00):int(board.shape[1] * 0.56)]
    kills_region = board[:, int(board.shape[1] * 0.48):int(board.shape[1] * 0.76)]
    family_region = board[:, int(board.shape[1] * 0.72):int(board.shape[1] * 1.00)]

    board_gray = cv2.cvtColor(board, cv2.COLOR_BGR2GRAY)
    names_gray = cv2.cvtColor(names_region, cv2.COLOR_BGR2GRAY)
    kills_gray = cv2.cvtColor(kills_region, cv2.COLOR_BGR2GRAY)
    family_gray = cv2.cvtColor(family_region, cv2.COLOR_BGR2GRAY)

    return {
        "board": build_variants(board_gray),
        "names": build_variants(names_gray),
        "kills": build_variants(kills_gray),
        "family": build_variants(family_gray),
    }

def ocr_lines_tesseract(image: np.ndarray, configs: List[str]) -> List[Tuple[str, float]]:
    all_lines: List[Tuple[str, float]] = []

    for config in configs:
        data = pytesseract.image_to_data(
            image,
            lang="eng",
            config=config,
            output_type=pytesseract.Output.DICT
        )

        grouped: Dict[Tuple[int, int, int], List[Tuple[int, str, float]]] = {}
        n = len(data["text"])

        for i in range(n):
            text = data["text"][i].strip()
            if not text:
                continue

            try:
                conf = float(data["conf"][i])
            except Exception:
                conf = -1.0

            if conf < 5:
                continue

            key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
            left = int(data["left"][i])
            grouped.setdefault(key, []).append((left, text, conf))

        for _, parts in grouped.items():
            parts.sort(key=lambda x: x[0])
            line = normalize_spaces(" ".join(t for _, t, _ in parts))
            if line:
                avg_conf = sum(c for _, _, c in parts) / max(1, len(parts))
                all_lines.append((line, avg_conf))

    deduped = []
    seen = set()
    for line, conf in all_lines:
        key = normalize_name_basic(line)
        if key not in seen:
            seen.add(key)
            deduped.append((line, conf))

    return deduped

def clean_line_for_parse(line: str) -> str:
    line = normalize_spaces(line)
    replacements = {
        "|": " ", "¢": " ", "€": " ", "©": " ", "™": " ",
        "®": " ", "§": " ", "•": " ", "°": " "
    }
    for old, new in replacements.items():
        line = line.replace(old, new)

    compact_family = FAMILY_NAME.replace(" ", "")
    line = re.sub(re.escape(compact_family), FAMILY_NAME, line, flags=re.IGNORECASE)
    return normalize_spaces(line)

def contains_family_name(line: str) -> bool:
    return family_name_normalized() in normalize_name_basic(line)

def extract_known_player_from_line_without_family(line: str) -> Optional[Tuple[str, int, str]]:
    """
    V5 PRO FALLBACK:
    Ako OCR ne uhvati 'Red Lotus', ali prepozna known player + kill,
    prihvati igraca. Korisno kad je desna kolona slaba ili razdvojena.
    """
    if not FORCE_KNOWN_AS_FAMILY:
        return None

    cleaned = clean_line_for_parse(line)
    cleaned_no_damage = re.sub(r"\(\s*\d+\s*\)", "", cleaned)
    cleaned_no_damage = normalize_spaces(cleaned_no_damage)

    numbers = [int(x) for x in re.findall(r"\b\d{1,2}\b", cleaned_no_damage)]
    possible_kills = [n for n in numbers if 0 <= n <= 50]
    if not possible_kills:
        return None

    name_part = re.sub(r"\(\s*\d+\s*\)", "", cleaned)
    name_part = re.sub(r"^\s*\d{1,2}\s+", "", name_part)
    name_part = re.sub(r"\b\d{1,2}\b", " ", name_part)
    name_part = normalize_spaces(re.sub(r"[^a-zA-Z0-9 ]", " ", name_part))
    name_part = clean_player_prefixes(name_part)

    if not name_part or is_name_garbage(name_part):
        return None

    canonical_name, source = resolve_player_name(name_part)

    if not canonical_name:
        loose = resolve_known_player_from_text_loose(name_part)
        if loose:
            canonical_name = loose
            source = "fallback_loose"
        else:
            return None

    if not is_allowed_canonical_name(canonical_name):
        return None

    kills = min(possible_kills)

    return canonical_name, kills, f"fallback_known_no_family:{source}"

def parse_name_and_kills_from_line(line: str) -> Optional[Tuple[str, int, str]]:
    original_line = line
    line = clean_line_for_parse(line)

    has_family = contains_family_name(line)

    if not has_family:
        fallback = extract_known_player_from_line_without_family(line)
        if fallback:
            canonical_name, kills, source = fallback
            return canonical_name, kills, f"{source} | {original_line}"
        return None

    line_no_damage = re.sub(r"\(\s*\d+\s*\)", "", line)
    line_no_damage = normalize_spaces(line_no_damage)
    fam_pattern = re.escape(FAMILY_NAME)

    patterns = [
        rf"^\s*(\d{{1,2}})\s+(.+?)\s+(\d+)\s+{fam_pattern}\s*$",
        rf"^\s*(\d{{1,2}})\s+(.+?)\s+(\d+)\s+{fam_pattern}\b",
    ]

    for pat in patterns:
        match = re.search(pat, line_no_damage, flags=re.IGNORECASE)
        if match:
            raw_name = clean_player_prefixes(match.group(2).strip())
            raw_name = normalize_spaces(re.sub(r"[^a-zA-Z0-9 ]", " ", raw_name))
            kills = int(match.group(3))
            if raw_name and not is_name_garbage(raw_name) and 0 <= kills <= 50:
                return raw_name, kills, original_line

    family_index = line_no_damage.lower().find(FAMILY_NAME.lower())
    if family_index == -1:
        return None

    left_side = line_no_damage[:family_index].strip()
    kill_match = re.search(r"(\d+)\s*$", left_side)
    if not kill_match:
        return None

    kills = int(kill_match.group(1))
    raw_name = left_side[:kill_match.start()].strip()
    raw_name = re.sub(r"^\d{1,2}\s+", "", raw_name).strip()
    raw_name = clean_player_prefixes(raw_name)
    raw_name = normalize_spaces(re.sub(r"[^a-zA-Z0-9 ]", " ", raw_name))

    if not raw_name or is_name_garbage(raw_name) or not (0 <= kills <= 50):
        return None

    return raw_name, kills, original_line

def choose_best_kills(candidates: List[Tuple[int, float]]) -> int:
    if not candidates:
        return 0

    score_map: Dict[int, float] = {}
    count_map: Dict[int, int] = {}

    for kills, conf in candidates:
        score = max(conf, 1.0)

        # anti-number-error: blaga prednost manjim brojevima
        if kills <= 3:
            score += 2.5
        elif kills <= 7:
            score += 1.2

        score_map[kills] = score_map.get(kills, 0.0) + score
        count_map[kills] = count_map.get(kills, 0) + 1

    ranked = sorted(score_map.items(), key=lambda x: (-x[1], -count_map.get(x[0], 0), x[0]))
    best_kills = ranked[0][0]

    # posebno protiv 1 -> 15 / 1 -> 13 / 1 -> 17
    if best_kills >= 10:
        for small in [1, 2, 3]:
            if small in score_map and score_map[small] >= score_map[best_kills] * 0.82:
                return small

    return best_kills

def extract_scores_from_image(image_bytes: bytes):
    regions = preprocess_image_regions(image_bytes)

    board_configs = [
        "--oem 1 --psm 6",
        "--oem 1 --psm 4",
    ]

    parse_logs: List[str] = []
    all_lines: List[str] = []

    per_player_candidates: Dict[str, List[Tuple[int, float]]] = {}

    for idx, variant in enumerate(regions["board"], start=1):
        lines_with_conf = ocr_lines_tesseract(variant, board_configs)

        for line, line_conf in lines_with_conf:
            all_lines.append(line)
            parsed = parse_name_and_kills_from_line(line)
            if not parsed:
                continue

            raw_name, kills, _ = parsed
            canonical_name, source = resolve_player_name(raw_name)

            if not canonical_name or is_name_garbage(canonical_name) or not is_allowed_canonical_name(canonical_name):
                parse_logs.append(
                    f"REJECTED | raw={raw_name} | kills={kills} | source={source} | line={line}"
                )
                continue

            per_player_candidates.setdefault(canonical_name, []).append((kills, line_conf))
            parse_logs.append(
                f"OK | board_variant={idx} | {raw_name} -> {canonical_name} | kills={kills} | conf={line_conf:.1f} | source={source}"
            )

    found: Dict[str, int] = {}
    for canonical_name, candidates in per_player_candidates.items():
        best_kills = choose_best_kills(candidates)
        if best_kills > 0:
            found[canonical_name] = best_kills

    deduped_lines = []
    seen = set()
    for line in all_lines:
        key = normalize_name_basic(line)
        if key not in seen:
            seen.add(key)
            deduped_lines.append(line)

    return found, deduped_lines, parse_logs

# =========================================================
# TASKS
# =========================================================

@tasks.loop(minutes=5)
async def monthly_reset_task():
    try:
        did_reset = check_and_reset_monthly_if_needed()
        if did_reset:
            await send_log_embed(
                "📆 AUTO RESET MJESEČNE LISTE",
                "Mjesečna lista je automatski resetovana prvog u mjesecu u 04:00.",
                COLOR_WARNING
            )
    except Exception as e:
        await send_log_embed("❌ GREŠKA AUTO RESETA", f"```diff\n- {e}\n```", COLOR_DANGER)

# =========================================================
# EVENTS
# =========================================================

@bot.event
async def on_ready():
    print(f"Bot online kao {bot.user} | ID: {bot.user.id}")
    print(f"DATA_DIR: {DATA_DIR}")
    print(f"FAMILY_NAME: {FAMILY_NAME}")
    print(f"GUILD_ID: {GUILD_ID}")
    print("WATCH_CHANNEL_ID:", WATCH_CHANNEL_ID)
    print("LOG_CHANNEL_ID:", LOG_CHANNEL_ID)
    print("ADMIN_ROLE_ID:", ADMIN_ROLE_ID)

    for guild in bot.guilds:
        print(f"CONNECTED GUILD: {guild.name} | ID: {guild.id}")

    if missing_vars:
        print("Nedostaju ENV varijable:", ", ".join(missing_vars))

    load_known_players()

    did_reset = check_and_reset_monthly_if_needed()
    if did_reset:
        await send_log_embed(
            "📆 AUTO RESET MJESEČNE LISTE",
            "Mjesečna lista je resetovana pri pokretanju bota.",
            COLOR_WARNING
        )

    if not monthly_reset_task.is_running():
        monthly_reset_task.start()

@bot.event
async def on_message(message: discord.Message):
    if message.author.bot:
        return

    await bot.process_commands(message)

    if message.guild is None or message.guild.id != GUILD_ID:
        return

    if message.channel.id != WATCH_CHANNEL_ID:
        return

    if not message.attachments:
        return

    merged_found: Dict[str, int] = {}
    all_parse_logs: List[str] = []
    all_lines_seen: List[str] = []

    for attachment in message.attachments:
        try:
            filename_lower = (attachment.filename or "").lower()
            content_type = attachment.content_type or ""

            is_image = (
                content_type.startswith("image/")
                or filename_lower.endswith(".png")
                or filename_lower.endswith(".jpg")
                or filename_lower.endswith(".jpeg")
                or filename_lower.endswith(".webp")
            )

            if not is_image:
                continue

            image_bytes = await read_attachment_bytes(attachment)
            found, lines, parse_logs = extract_scores_from_image(image_bytes)

            all_lines_seen.extend(lines)
            all_parse_logs.extend(parse_logs)

            for name, kills in found.items():
                if name in merged_found:
                    merged_found[name] = max(merged_found[name], kills)
                else:
                    merged_found[name] = kills

        except Exception as e:
            await send_log_embed(
                "❌ GREŠKA PRI OBRADI SLIKE",
                f"```diff\n- {attachment.filename}: {e}\n```",
                COLOR_DANGER
            )

    if not merged_found:
        raw_preview = "\n".join(all_lines_seen[:30]) if all_lines_seen else "Nema pročitanih linija."
        await send_log_embed(
            f"⚠ OCR NIJE NAŠAO {FAMILY_NAME} IGRAČE",
            "```yaml\n" + raw_preview[:3500] + "\n```",
            COLOR_WARNING
        )

        await message.channel.send(embed=make_embed(
            f"⚠ Nije pronađen nijedan {FAMILY_NAME} igrač",
            "Nije prepoznat known Red Lotus igrač. Dodaj igrača sa `!addknown Ime Prezime` ili alias iz OCR loga.",
            COLOR_WARNING
        ))
        return

    weekly_total = add_scores_to_file(WEEKLY_DATA_FILE, merged_found)
    add_scores_to_file(MONTHLY_DATA_FILE, merged_found)

    await message.channel.send(embed=build_weekly_score_embed_with_bonus(weekly_total))

    log_preview = "\n".join(all_parse_logs[:35]) if all_parse_logs else "Nema parse logova."
    await send_log_embed("📄 OCR LOG", "```yaml\n" + log_preview[:3500] + "\n```", COLOR_INFO)

# =========================================================
# COMMANDS
# =========================================================

@bot.command(name="lista")
async def lista(ctx: commands.Context):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return
    await ctx.send(embed=build_weekly_score_embed_with_bonus(load_data(WEEKLY_DATA_FILE)))

@bot.command(name="mjesecnalista")
async def mjesecnalista(ctx: commands.Context):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return
    await ctx.send(embed=build_monthly_score_embed(load_data(MONTHLY_DATA_FILE)))

@bot.command(name="resetlista")
async def resetlista(ctx: commands.Context):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return
    if not ensure_admin(ctx):
        await ctx.send(embed=make_embed("❌ Pristup odbijen", "Nemaš dozvolu za `!resetlista`.", COLOR_DANGER))
        return
    reset_data(WEEKLY_DATA_FILE)
    await ctx.send(embed=make_embed("🧹 Sedmična lista resetovana", "Sedmična kill lista je uspješno obrisana.", COLOR_WARNING))

@bot.command(name="resetmjesecnalista")
async def resetmjesecnalista(ctx: commands.Context):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return
    if not ensure_admin(ctx):
        await ctx.send(embed=make_embed("❌ Pristup odbijen", "Nemaš dozvolu za `!resetmjesecnalista`.", COLOR_DANGER))
        return
    reset_data(MONTHLY_DATA_FILE)
    await ctx.send(embed=make_embed("🧹 Mjesečna lista resetovana", "Mjesečna kill lista je uspješno obrisana.", COLOR_WARNING))

@bot.command(name="remove")
async def remove_player(ctx: commands.Context, *, player_name: str):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return
    if not ensure_admin(ctx):
        await ctx.send(embed=make_embed("❌ Pristup odbijen", "Nemaš dozvolu za ovu komandu.", COLOR_DANGER))
        return

    data = load_data(WEEKLY_DATA_FILE)
    found_key = find_best_player_key(data, player_name)

    if not found_key:
        await ctx.send(embed=make_embed("⚠ Igrač nije pronađen", f"Nije pronađen igrač: **{player_name}**", COLOR_WARNING))
        return

    removed_kills = data[found_key]
    del data[found_key]
    save_data(WEEKLY_DATA_FILE, data)

    await ctx.send(embed=make_embed(
        "🧹 Igrač obrisan",
        f"Igrač **{format_player_name(found_key)}** je uklonjen sa sedmične liste.\n💀 Obrisano killova: `{removed_kills}`",
        COLOR_SUCCESS
    ))

@bot.command(name="removemjesec")
async def remove_monthly_player(ctx: commands.Context, *, player_name: str):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return
    if not ensure_admin(ctx):
        await ctx.send(embed=make_embed("❌ Pristup odbijen", "Nemaš dozvolu za ovu komandu.", COLOR_DANGER))
        return

    data = load_data(MONTHLY_DATA_FILE)
    found_key = find_best_player_key(data, player_name)

    if not found_key:
        await ctx.send(embed=make_embed("⚠ Igrač nije pronađen", f"Nije pronađen igrač: **{player_name}**", COLOR_WARNING))
        return

    removed_kills = data[found_key]
    del data[found_key]
    save_data(MONTHLY_DATA_FILE, data)

    await ctx.send(embed=make_embed(
        "🧹 Igrač obrisan",
        f"Igrač **{format_player_name(found_key)}** je uklonjen sa mjesečne liste.\n💀 Obrisano killova: `{removed_kills}`",
        COLOR_SUCCESS
    ))

@bot.command(name="add")
async def add_player_kills(ctx: commands.Context, *, args: str):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return
    if not ensure_admin(ctx):
        await ctx.send(embed=make_embed("❌ Pristup odbijen", "Nemaš dozvolu za ovu komandu.", COLOR_DANGER))
        return

    match = re.match(r"(.+?)\s*\|\s*(\d+)$", args.strip())
    if not match:
        await ctx.send(embed=make_embed("⚠ Pogrešan format", "Koristi:\n```bash\n!add Ime Prezime | 5\n```", COLOR_WARNING))
        return

    raw_name = match.group(1)
    kills = int(match.group(2))
    canonical_name, source = resolve_player_name(raw_name)

    if not canonical_name:
        await ctx.send(embed=make_embed("⚠ Ime nije poznato", "Prvo dodaj igrača sa `!addknown Ime Prezime`.", COLOR_WARNING))
        return

    weekly_data = load_data(WEEKLY_DATA_FILE)
    monthly_data = load_data(MONTHLY_DATA_FILE)

    weekly_data[canonical_name] = weekly_data.get(canonical_name, 0) + kills
    monthly_data[canonical_name] = monthly_data.get(canonical_name, 0) + kills

    save_data(WEEKLY_DATA_FILE, weekly_data)
    save_data(MONTHLY_DATA_FILE, monthly_data)

    bonus = kills * KILL_VALUE

    embed = make_embed(
        "➕ Killovi dodani",
        (
            f"**{format_player_name(canonical_name)}**\n"
            f"💀 Dodano killova: `{kills}`\n"
            f"💸 Bonus: `{bonus:,}$`\n"
            f"🧠 Source: `{source}`"
        ),
        COLOR_SUCCESS
    )
    embed.add_field(name="Sedmično", value=str(weekly_data[canonical_name]), inline=True)
    embed.add_field(name="Mjesečno", value=str(monthly_data[canonical_name]), inline=True)
    await ctx.send(embed=embed)

@bot.command(name="addmjesec")
async def add_monthly_kills(ctx: commands.Context, *, args: str):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return
    if not ensure_admin(ctx):
        await ctx.send(embed=make_embed("❌ Pristup odbijen", "Nemaš dozvolu za ovu komandu.", COLOR_DANGER))
        return

    match = re.match(r"(.+?)\s*\|\s*(\d+)$", args.strip())
    if not match:
        await ctx.send(embed=make_embed("⚠ Pogrešan format", "Koristi:\n```bash\n!addmjesec Ime Prezime | 5\n```", COLOR_WARNING))
        return

    raw_name = match.group(1)
    kills = int(match.group(2))
    canonical_name, source = resolve_player_name(raw_name)

    if not canonical_name:
        await ctx.send(embed=make_embed("⚠ Ime nije poznato", "Prvo dodaj igrača sa `!addknown Ime Prezime`.", COLOR_WARNING))
        return

    monthly_data = load_data(MONTHLY_DATA_FILE)
    monthly_data[canonical_name] = monthly_data.get(canonical_name, 0) + kills
    save_data(MONTHLY_DATA_FILE, monthly_data)

    await ctx.send(embed=make_embed(
        "➕ Dodani mjesečni killovi",
        (
            f"**{format_player_name(canonical_name)}**\n"
            f"💀 Dodano: `{kills}` killova\n"
            f"📆 Ukupno mjesečno: `{monthly_data[canonical_name]}`\n"
            f"🧠 Source: `{source}`"
        ),
        COLOR_SUCCESS
    ))

@bot.command(name="set")
async def set_weekly_kills(ctx: commands.Context, *, args: str):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return
    if not ensure_admin(ctx):
        await ctx.send(embed=make_embed("❌ Pristup odbijen", "Nemaš dozvolu za ovu komandu.", COLOR_DANGER))
        return

    match = re.match(r"(.+?)\s*\|\s*(\d+)$", args.strip())
    if not match:
        await ctx.send(embed=make_embed("⚠ Pogrešan format", "Koristi:\n```bash\n!set Ime Prezime | 20\n```", COLOR_WARNING))
        return

    raw_name = match.group(1)
    kills = int(match.group(2))
    canonical_name, source = resolve_player_name(raw_name)

    if not canonical_name:
        await ctx.send(embed=make_embed("⚠ Ime nije poznato", "Prvo dodaj igrača sa `!addknown Ime Prezime`.", COLOR_WARNING))
        return

    weekly_data = load_data(WEEKLY_DATA_FILE)
    weekly_data[canonical_name] = kills
    save_data(WEEKLY_DATA_FILE, weekly_data)

    bonus = kills * KILL_VALUE
    await ctx.send(embed=make_embed(
        "✏ Sedmična lista ažurirana",
        (
            f"**{format_player_name(canonical_name)}**\n"
            f"💀 Novi sedmični killovi: `{kills}`\n"
            f"💸 Bonus: `{bonus:,}$`\n"
            f"🧠 Source: `{source}`"
        ),
        COLOR_INFO
    ))

@bot.command(name="setmjesec")
async def set_monthly_kills(ctx: commands.Context, *, args: str):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return
    if not ensure_admin(ctx):
        await ctx.send(embed=make_embed("❌ Pristup odbijen", "Nemaš dozvolu za ovu komandu.", COLOR_DANGER))
        return

    match = re.match(r"(.+?)\s*\|\s*(\d+)$", args.strip())
    if not match:
        await ctx.send(embed=make_embed("⚠ Pogrešan format", "Koristi:\n```bash\n!setmjesec Ime Prezime | 20\n```", COLOR_WARNING))
        return

    raw_name = match.group(1)
    kills = int(match.group(2))
    canonical_name, source = resolve_player_name(raw_name)

    if not canonical_name:
        await ctx.send(embed=make_embed("⚠ Ime nije poznato", "Prvo dodaj igrača sa `!addknown Ime Prezime`.", COLOR_WARNING))
        return

    monthly_data = load_data(MONTHLY_DATA_FILE)
    monthly_data[canonical_name] = kills
    save_data(MONTHLY_DATA_FILE, monthly_data)

    await ctx.send(embed=make_embed(
        "✏ Mjesečna lista ažurirana",
        (
            f"**{format_player_name(canonical_name)}**\n"
            f"💀 Novi mjesečni killovi: `{kills}`\n"
            f"🧠 Source: `{source}`"
        ),
        COLOR_INFO
    ))

@bot.command(name="learned")
async def learned(ctx: commands.Context):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return

    data = load_learned_names()
    if not data:
        await ctx.send(embed=make_embed("🧠 Naučena imena", "Bot još nije naučio nijedno ime.", COLOR_WARNING))
        return

    lines = [f"{k} -> {v}" for k, v in list(data.items())[:40]]
    await ctx.send(embed=make_embed("🧠 Naučena imena", "```yaml\n" + "\n".join(lines) + "\n```", COLOR_INFO))

@bot.command(name="known")
async def known_players_command(ctx: commands.Context):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return

    players = load_known_players()
    if not players:
        await ctx.send(embed=make_embed("📋 Known Players", "Lista je prazna.", COLOR_WARNING))
        return

    lines = players[:60]
    await ctx.send(embed=make_embed("📋 Known Players", "```yaml\n" + "\n".join(lines) + "\n```", COLOR_INFO))

@bot.command(name="addknown")
async def add_known_player(ctx: commands.Context, *, player_name: str):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return
    if not ensure_admin(ctx):
        await ctx.send(embed=make_embed("❌ Pristup odbijen", "Nemaš dozvolu za ovu komandu.", COLOR_DANGER))
        return

    players = load_known_players()
    players.append(player_name)
    save_known_players(players)

    await ctx.send(embed=make_embed("✅ Dodan known player", f"Dodano ime: **{player_name}**", COLOR_SUCCESS))

@bot.command(name="alias")
async def add_alias(ctx: commands.Context, *, args: str):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return
    if not ensure_admin(ctx):
        await ctx.send(embed=make_embed("❌ Pristup odbijen", "Nemaš dozvolu za ovu komandu.", COLOR_DANGER))
        return

    match = re.match(r"(.+?)\s*\|\s*(.+)$", args.strip())
    if not match:
        await ctx.send(embed=make_embed(
            "⚠ Pogrešan format",
            "Koristi:\n```bash\n!alias pogresno ime | tacno ime\n```",
            COLOR_WARNING
        ))
        return

    wrong = normalize_name_basic(match.group(1))
    correct = normalize_name_basic(match.group(2))

    if not wrong or not correct:
        await ctx.send(embed=make_embed("⚠ Greška", "Alias nije validan.", COLOR_WARNING))
        return

    ALIASES[wrong] = correct
    learn_name(wrong, correct)

    await ctx.send(embed=make_embed("✅ Alias dodat", f"`{wrong}` → `{correct}`", COLOR_SUCCESS))

@bot.command(name="komande")
async def komande(ctx: commands.Context):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return

    image_path = os.path.join(".", "komande.png")
    if not os.path.exists(image_path):
        await ctx.send("⚠ Slika `komande.png` nije pronađena u projektu.")
        return

    await ctx.send(file=discord.File(image_path))

@bot.command(name="help")
async def help_command(ctx: commands.Context):
    if ctx.guild is None or ctx.guild.id != GUILD_ID:
        return

    embed = make_embed(f"📘 {BOT_NAME} Komande", f"Glavne komande za {FAMILY_NAME} listu.", COLOR_INFO)

    embed.add_field(
        name="🏆 Sedmična lista",
        value=(
            "`!lista`\n"
            "`!resetlista`\n"
            "`!remove Ime`\n"
            "`!set Ime | broj`"
        ),
        inline=False
    )

    embed.add_field(
        name="📆 Mjesečna lista",
        value=(
            "`!mjesecnalista`\n"
            "`!resetmjesecnalista`\n"
            "`!removemjesec Ime`\n"
            "`!setmjesec Ime | broj`\n"
            "`!addmjesec Ime | broj`"
        ),
        inline=False
    )

    embed.add_field(
        name="➕ Ručno dodavanje",
        value="`!add Ime | broj`",
        inline=False
    )

    embed.add_field(
        name="🧠 OCR / Known players",
        value="`!learned`\n`!known`\n`!addknown Ime`\n`!alias pogresno | tacno`\n`!komande`",
        inline=False
    )

    await ctx.send(embed=embed)

@bot.event
async def on_command_error(ctx, error):
    print("COMMAND ERROR:", repr(error))

if __name__ == "__main__":
    if missing_vars:
        print("UPOZORENJE: Nedostaju ENV varijable:", ", ".join(missing_vars))
    bot.run(DISCORD_TOKEN)
