#!/usr/bin/env python3
"""
DB 現況快照產生器：把 Postgres 的表結構、筆數與示範資料寫進 admin_private/current_table.md。

**只覆寫標記區塊**，人寫的用途說明、資料流向圖、投影規則、常用查詢一律保留：

    <!-- snapshot:begin KEY -->
    ...這裡的內容每次重跑都會被重新產生...
    <!-- snapshot:end KEY -->

KEY 一覽：
  meta                 檔頭（快照時間、PG 版本、DB 大小、migration 進度）
  counts               目錄表格的筆數欄（逐列比對表名後只換數字）
  enums                enum 型別總覽
  indexes              索引現況
  schema:<table>       該表的欄位表
  sample:<table>       該表的示範資料

目標檔不存在時，會產生一份含全部標記的骨架，用途說明留白待人補。

筆數一律用 count(*)——pg_stat_user_tables.n_live_tup 是 autovacuum 的估計值，
剛寫入未 ANALYZE 的表會不準（做第一版快照時它把 sync_runs 報成 0，實際有 1 筆）。

零依賴，Python 3 標準庫 + psql 即可。用法：
  python3 scripts/db/snapshot.py             # 重新產生標記區塊
  python3 scripts/db/snapshot.py --check     # 只檢查是否過期（CI 用），不寫檔
  python3 scripts/db/snapshot.py --print     # 印到 stdout，不動檔案
"""
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
TARGET = ROOT / "admin_private" / "current_table.md"
ENV_FILE = ROOT / ".env"

# 業務表的呈現順序：identity → 事件/狀態 → 賽事 → 球季 → 衍生 → 維運。
# 不在這份清單裡的表會被附加到最後（並在輸出時提示），drizzle schema 的內部表不收。
TABLE_ORDER = [
    "players",
    "teams",
    "transaction_events",
    "player_current_status",
    "games",
    "game_batting_lines",
    "game_pitching_lines",
    "season_batting_stats",
    "season_pitching_stats",
    "player_recent_form",
    "sync_runs",
    "raw_payloads",
]

# 取樣時的排序方式；沒列到的表用 PK 排序（見 sample_query）。
SAMPLE_ORDER = {
    "teams": "level, mlb_team_id",
    "transaction_events": "effective_date DESC",
    "games": "game_date_us DESC",
    "game_batting_lines": "game_pk DESC",
    "game_pitching_lines": "game_pk DESC",
    "season_batting_stats": "season DESC, player_id",
    "season_pitching_stats": "season DESC, player_id",
    "raw_payloads": "id DESC",
}

# 欄位太寬會洗版終端機的表，取樣時改用自訂投影。
SAMPLE_QUERIES = {
    "raw_payloads": """
        SELECT id, source, endpoint,
               left(params::text, 56) AS params_trunc,
               fetched_at,
               pg_size_pretty(length(payload::text)::bigint) AS payload_size
        FROM raw_payloads ORDER BY id DESC LIMIT {limit}
    """,
    "transaction_events": """
        SELECT id, source_tx_id, player_id, type, effective_date, announced_at,
               from_team_id, to_team_id, il_detail,
               left(description, 44) AS description_trunc, source
        FROM transaction_events ORDER BY effective_date DESC LIMIT {limit}
    """,
    "sync_runs": """
        SELECT id, kind, started_at, finished_at, status,
               left(detail::text, 48) AS detail_trunc
        FROM sync_runs ORDER BY id DESC LIMIT {limit}
    """,
}

SAMPLE_LIMIT = 5
MARKER_RE = re.compile(
    r"(<!-- snapshot:begin (?P<key>[^\s>]+) -->\n)(?P<body>.*?)(<!-- snapshot:end (?P=key) -->)",
    re.DOTALL,
)


# ── psql 呼叫 ───────────────────────────────────────────────────────────────

def psql_bin() -> str:
    """psql 可能沒進 PATH（Homebrew 的 postgresql@16 是 keg-only）。"""
    found = shutil.which("psql")
    if found:
        return found
    for candidate in sorted(Path("/opt/homebrew/opt").glob("postgresql@*/bin/psql"), reverse=True):
        return str(candidate)
    for candidate in ("/usr/local/bin/psql", "/usr/bin/psql"):
        if Path(candidate).exists():
            return candidate
    sys.exit("找不到 psql；請安裝 PostgreSQL client 或把它加進 PATH。")


def database_url() -> str:
    """環境變數優先，其次讀 repo 根的 .env（與 ETL、drizzle.config.ts 同源）。"""
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip("'\"")
    sys.exit("找不到 DATABASE_URL：請設環境變數或在 .env 裡指定。")


def query(sql: str, *, aligned: bool = False) -> str:
    """aligned=True 保留 psql 的表格排版（示範資料用）；否則回傳 | 分隔的裸值。"""
    args = [PSQL, URL, "-X", "-P", "pager=off"]
    if not aligned:
        args += ["-t", "-A", "-F", "|"]
    args += ["-c", sql]
    proc = subprocess.run(args, capture_output=True, text=True)
    if proc.returncode != 0:
        sys.exit(f"psql 失敗：\n{proc.stderr.strip()}")
    return proc.stdout.strip("\n")


def rows(sql: str) -> list[list[str]]:
    out = query(sql)
    return [line.split("|") for line in out.splitlines() if line]


# ── 各區塊的產生 ────────────────────────────────────────────────────────────

def render_meta() -> str:
    version = query("SELECT version()").split(" on ")[0]
    size = query("SELECT pg_size_pretty(pg_database_size(current_database()))")
    db = query("SELECT current_database()")
    # hash 要取「最後套用的那筆」，不是字串 max——兩者不一定是同一列。
    migrations = rows("""
        SELECT (SELECT count(*) FROM drizzle.__drizzle_migrations),
               coalesce(left(hash, 8), '—'),
               coalesce(to_char(to_timestamp(created_at/1000), 'YYYY-MM-DD HH24:MI'), '—')
        FROM drizzle.__drizzle_migrations
        ORDER BY created_at DESC, id DESC LIMIT 1
    """)
    n, hash_prefix, applied = migrations[0] if migrations else ("0", "—", "—")
    # 顯示連線字串時抹掉密碼。
    safe_url = re.sub(r"://([^:/@]+):[^@]*@", r"://\1:***@", URL)
    return (
        f"> 快照時間：{datetime.now().strftime('%Y-%m-%d %H:%M')}"
        f"（由 `scripts/db/snapshot.py` 產生）\n"
        f"> 連線：`{safe_url}`（database `{db}`）\n"
        f"> 環境：{version}\n"
        f"> DB 大小：{size}／Drizzle migration 已套用 {n} 筆"
        f"（最新 `{hash_prefix}` @ {applied}）\n"
    )


def table_counts() -> dict[str, int]:
    """一律 count(*)——n_live_tup 是估計值，剛寫入未 ANALYZE 會不準。"""
    tables = present_tables()
    union = "\nUNION ALL ".join(
        f"SELECT '{t}' AS t, count(*) AS n FROM {t}" for t in tables
    )
    return {r[0]: int(r[1]) for r in rows(union)}


@lru_cache(maxsize=1)
def present_tables() -> list[str]:
    """實際存在的 public 表，依 TABLE_ORDER 排序；新表附加在後面。單次執行內快取（警告只印一次）。"""
    live = {r[0] for r in rows(
        "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
    )}
    ordered = [t for t in TABLE_ORDER if t in live]
    extra = sorted(live - set(ordered))
    if extra:
        print(f"⚠️  TABLE_ORDER 沒收錄的新表（已附加在最後）：{', '.join(extra)}", file=sys.stderr)
    return ordered + extra


def render_counts(counts: dict[str, int], existing: str) -> str:
    """
    目錄表格：只換筆數欄，保留人寫的「用途一句話」。
    比對每列的表名（第 3 欄的 `code`），找不到對應的列原樣留著。
    區塊本來就是空的（新檔骨架）時，生成完整目錄、用途留白待補。
    """
    if not existing.strip():
        return "\n".join(
            # 錨點沿用 GitHub 規則：底線保留、點與反引號去掉（對應 "# 1. `players`"）。
            f"| {i} | [`{t}`](#{i}-{t}) | {counts.get(t, 0)} | _待補_ |"
            for i, t in enumerate(present_tables(), 1)
        ) + "\n"

    out = []
    for line in existing.splitlines():
        m = re.match(r"^\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)$", line)
        if not m:
            out.append(line)
            continue
        idx, name_cell, count_cell, rest = m.groups()
        tm = re.search(r"`([a-z_.]+)`", name_cell)
        if tm and tm.group(1) in counts:
            n = counts[tm.group(1)]
            out.append(f"|{idx}|{name_cell}| {n} |{rest}")
        else:
            out.append(line)
    return "\n".join(out) + "\n"


def render_enums() -> str:
    data = rows("""
        SELECT t.typname, string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder)
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public'
        GROUP BY t.typname ORDER BY t.typname
    """)
    lines = ["| Enum | 值 |", "|---|---|"]
    for name, labels in data:
        pretty = ", ".join(f"`{v.strip()[1:-1]}`" for v in labels.split(", "))
        lines.append(f"| `{name}` | {pretty} |")
    return "\n".join(lines) + "\n"


def render_schema(table: str) -> str:
    cols = rows(f"""
        SELECT c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.table_name = '{table}'
        ORDER BY c.ordinal_position
    """)
    pk = {r[0] for r in rows(f"""
        SELECT a.attname FROM pg_index i
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = '{table}'::regclass AND i.indisprimary
    """)}
    fks = {r[0]: (r[1], r[2]) for r in rows(f"""
        SELECT att.attname, cl.relname, att2.attname
        FROM pg_constraint con
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
        JOIN pg_class cl ON cl.oid = con.confrelid
        JOIN pg_attribute att2 ON att2.attrelid = con.confrelid AND att2.attnum = con.confkey[1]
        WHERE con.conrelid = '{table}'::regclass AND con.contype = 'f'
          AND array_length(con.conkey, 1) = 1
    """)}
    uniques = {r[0] for r in rows(f"""
        SELECT att.attname FROM pg_constraint con
        JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
        WHERE con.conrelid = '{table}'::regclass AND con.contype = 'u'
          AND array_length(con.conkey, 1) = 1
    """)}

    lines = ["| 欄位 | 型別 | 約束 |", "|---|---|---|"]
    for name, data_type, udt, nullable, default in cols:
        typ = udt if data_type == "USER-DEFINED" else data_type
        typ = {"timestamp with time zone": "timestamptz", "character varying": "varchar"}.get(typ, typ)
        if default and default.startswith("nextval("):
            typ = "bigserial" if "bigint" in data_type else "serial"
        marks = []
        if name in pk:
            marks.append("**PK**")
        if name in fks:
            ref_t, ref_c = fks[name]
            marks.append(f"→ `{ref_t}.{ref_c}`")
        if name in uniques:
            marks.append("UNIQUE")
        if nullable == "NO" and name not in pk:
            marks.append("NOT NULL")
        if default and not default.startswith("nextval("):
            d = default.split("::")[0].strip("'")
            marks.append(f"預設 `{d}`")
        lines.append(f"| `{name}` | `{typ}` | {' '.join(marks) or '—'} |")

    if len(pk) > 1:
        order = [c[0] for c in cols if c[0] in pk]
        lines.append("")
        lines.append(f"**複合 PK**：`({', '.join(order)})`")
    return "\n".join(lines) + "\n"


def sample_query(table: str) -> str:
    if table in SAMPLE_QUERIES:
        return SAMPLE_QUERIES[table].format(limit=SAMPLE_LIMIT).strip()
    order = SAMPLE_ORDER.get(table)
    if not order:
        pk = [r[0] for r in rows(f"""
            SELECT a.attname FROM pg_index i
            JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = '{table}'::regclass AND i.indisprimary
        """)]
        order = ", ".join(pk) if pk else "1"
    return f"SELECT * FROM {table} ORDER BY {order} LIMIT {SAMPLE_LIMIT}"


def render_sample(table: str, count: int) -> str:
    if count == 0:
        return "_（目前無資料）_\n"
    out = query(sample_query(table), aligned=True)
    # 砍掉 psql 結尾的「(N 筆資料)」，改用我們自己的標註。
    body = re.sub(r"\n\([^)]*\)\s*$", "", out).rstrip()
    shown = min(count, SAMPLE_LIMIT)
    label = f"全部 {count} 筆" if count <= SAMPLE_LIMIT else f"{shown}／{count} 筆"
    return f"**示範資料（{label}）**\n\n```\n{body}\n```\n"


def render_indexes() -> str:
    data = rows("""
        SELECT tablename, indexname, indexdef FROM pg_indexes
        WHERE schemaname = 'public' ORDER BY tablename, indexname
    """)
    extra = [(t, n) for t, n, d in data if not n.endswith(("_pkey", "_pk"))]
    lines = [f"共 {len(data)} 個索引。"]
    if extra:
        lines += ["", "主鍵以外：", "", "| 表 | 索引 |", "|---|---|"]
        lines += [f"| `{t}` | `{n}` |" for t, n in extra]
    else:
        lines.append("")
        lines.append("**主鍵與 unique 約束以外，目前沒有任何額外索引。**")
    return "\n".join(lines) + "\n"


# ── 標記區塊的替換 ──────────────────────────────────────────────────────────

def build_blocks(existing_bodies: dict[str, str]) -> dict[str, str]:
    counts = table_counts()
    blocks = {
        "meta": render_meta(),
        "enums": render_enums(),
        "indexes": render_indexes(),
        "counts": render_counts(counts, existing_bodies.get("counts", "")),
    }
    for t in present_tables():
        blocks[f"schema:{t}"] = render_schema(t)
        blocks[f"sample:{t}"] = render_sample(t, counts.get(t, 0))
    return blocks


def splice(text: str, blocks: dict[str, str]) -> tuple[str, list[str], list[str]]:
    seen, missing = [], []

    def replace(m: re.Match) -> str:
        key = m.group("key")
        if key not in blocks:
            missing.append(key)
            return m.group(0)
        seen.append(key)
        return m.group(1) + blocks[key] + m.group(4)

    out = MARKER_RE.sub(replace, text)
    unused = [k for k in blocks if k not in seen]
    return out, missing, unused


def skeleton(blocks: dict[str, str]) -> str:
    """目標檔不存在時的骨架；用途說明留白待人補。"""
    parts = [
        "# Phobos DB — 現況表結構快照\n",
        "<!-- snapshot:begin meta -->\n<!-- snapshot:end meta -->\n",
        "本檔由 `scripts/db/snapshot.py` 產生標記區塊，其餘敘述由人維護。",
        "權威規格見 `docs/spec/spec-01-domain-and-data-model.md` 與 `lib/db/schema/*.ts`。\n",
        "## 目錄\n",
        "| # | 表 | 筆數 | 用途一句話 |\n|---|---|---:|---|",
        "<!-- snapshot:begin counts -->",  # 內容由 render_counts 填
    ]
    tables = present_tables()
    parts += [
        "<!-- snapshot:end counts -->\n",
        "## Enum 型別總覽\n",
        "<!-- snapshot:begin enums -->\n<!-- snapshot:end enums -->\n",
        "---\n",
    ]
    for i, t in enumerate(tables, 1):
        parts += [
            f"# {i}. `{t}`\n",
            "**用途**：_待補_\n",
            f"<!-- snapshot:begin schema:{t} -->\n<!-- snapshot:end schema:{t} -->\n",
            f"<!-- snapshot:begin sample:{t} -->\n<!-- snapshot:end sample:{t} -->\n",
            "---\n",
        ]
    parts += [
        "## 索引現況\n",
        "<!-- snapshot:begin indexes -->\n<!-- snapshot:end indexes -->\n",
    ]
    return "\n".join(parts)


TIMESTAMP_LINE_RE = re.compile(r"^> 快照時間：.*$", re.MULTILINE)


def normalize(text: str) -> str:
    """--check 用：抹掉快照時間，只比對真正的結構／資料差異。"""
    return TIMESTAMP_LINE_RE.sub("> 快照時間：<ignored>", text)


def main(argv: list[str]) -> int:
    check = "--check" in argv
    to_stdout = "--print" in argv

    existing = TARGET.read_text(encoding="utf-8") if TARGET.exists() else None
    existing_bodies = (
        {m.group("key"): m.group("body") for m in MARKER_RE.finditer(existing)}
        if existing else {}
    )

    blocks = build_blocks(existing_bodies)

    if existing is None:
        if check:
            print(f"✗ {TARGET.relative_to(ROOT)} 不存在", file=sys.stderr)
            return 1
        out = skeleton(blocks)
        out, _, _ = splice(out, blocks)
        print(f"目標檔不存在，已產生骨架：{TARGET.relative_to(ROOT)}（用途說明待補）")
    else:
        out, missing, unused = splice(existing, blocks)
        if missing:
            print(f"⚠️  檔案裡有腳本不認得的標記：{', '.join(missing)}", file=sys.stderr)
        if unused:
            print(f"⚠️  下列區塊在檔案裡沒有對應標記，未寫入：{', '.join(sorted(unused))}", file=sys.stderr)

    if to_stdout:
        sys.stdout.write(out)
        return 0

    if check:
        # 快照時間每次都不同，比對時抹掉——否則 --check 永遠報不同步。
        if normalize(existing) != normalize(out):
            print(f"✗ {TARGET.relative_to(ROOT)} 與 DB 現況不同步——請跑 python3 scripts/db/snapshot.py", file=sys.stderr)
            return 1
        print(f"✓ {TARGET.relative_to(ROOT)} 與 DB 現況同步")
        return 0

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    changed = existing != out
    TARGET.write_text(out, encoding="utf-8")
    print(f"{'已更新' if changed else '無變更'}：{TARGET.relative_to(ROOT)}")
    return 0


PSQL = psql_bin()
URL = database_url()

if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
