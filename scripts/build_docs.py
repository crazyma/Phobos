#!/usr/bin/env python3
"""
docs 產生器：把 docs/**/*.md 轉成同名 .html，套用共用樣式模板。

保留手刻 HTML 的客製巧思：
  - <h2 data-num> 章節編號（來自 "## 1. 標題" / "## A. 標題"）
  - 響應式表格：<td data-label> 讓表格在手機摺疊
  - 程式碼區塊 vs. 架構圖區塊（含箭頭 ← ↓ 者歸為 .arch-diagram）
  - 巢狀清單、[x]/[ ] 待辦清單、blockquote、行內 **粗體** / `code` / [連結](url)

零依賴，Python 3 標準庫即可。用法：
  python3 scripts/build_docs.py            # 建置全部
  python3 scripts/build_docs.py <file.md>  # 只建置單一檔
"""
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

# ── 共用樣式模板 ────────────────────────────────────────────────────────────
STYLE = """
  :root {
    --bg: #fbfaf8; --fg: #1f2320; --muted: #6b7268; --accent: #8a3324;
    --line: #e3ddd3; --card: #ffffff; --code-bg: #f0ede6;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #14161a; --fg: #e7e4dd; --muted: #9a9d97; --accent: #d8836a;
      --line: #2c2f33; --card: #1b1e22; --code-bg: #20232a;
    }
  }
  :root[data-theme="light"] {
    --bg: #fbfaf8; --fg: #1f2320; --muted: #6b7268; --accent: #8a3324;
    --line: #e3ddd3; --card: #ffffff; --code-bg: #f0ede6;
  }
  :root[data-theme="dark"] {
    --bg: #14161a; --fg: #e7e4dd; --muted: #9a9d97; --accent: #d8836a;
    --line: #2c2f33; --card: #1b1e22; --code-bg: #20232a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--fg);
    font-family: -apple-system, "Segoe UI", "PingFang TC", "Noto Sans TC", sans-serif;
    line-height: 1.75; -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 820px; margin: 0 auto; padding: 3rem 1.5rem 6rem; }
  header.page-head { margin-bottom: 2.5rem; padding-bottom: 1.5rem; border-bottom: 1px solid var(--line); }
  header.page-head h1 { font-size: 1.7rem; margin: 0 0 .5rem; letter-spacing: -0.01em; }
  header.page-head p { margin: 0; color: var(--muted); font-size: .95rem; }
  .badges { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: 1rem; }
  .badge {
    font-size: .78rem; padding: .2rem .6rem; border: 1px solid var(--line);
    border-radius: 999px; color: var(--muted); background: var(--card);
  }
  .badge strong { color: var(--accent); }
  blockquote {
    margin: 0 0 1.5rem; padding: .75rem 1rem; background: var(--code-bg);
    border-left: 3px solid var(--accent); border-radius: 4px; color: var(--muted); font-size: .92rem;
  }
  blockquote p { margin: 0 0 .5rem; }
  blockquote p:last-child { margin: 0; }
  h2 { font-size: 1.25rem; margin: 2.75rem 0 1rem; padding-top: .25rem; color: var(--fg); }
  h2::before { content: attr(data-num); color: var(--accent); margin-right: .5rem; font-variant-numeric: tabular-nums; }
  h3 { font-size: 1.02rem; margin: 1.75rem 0 .75rem; color: var(--fg); }
  p { margin: 0 0 1rem; }
  ul, ol { padding-left: 1.4rem; margin: 0 0 1rem; }
  li { margin-bottom: .35rem; }
  strong { color: var(--fg); }
  a { color: var(--accent); }
  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    background: var(--code-bg); padding: .1rem .35rem; border-radius: 4px; font-size: .86em;
  }
  pre {
    background: var(--code-bg); border: 1px solid var(--line); border-radius: 8px;
    padding: 1rem 1.1rem; overflow-x: auto; margin: 0 0 1.25rem;
  }
  pre code { background: none; padding: 0; font-size: .82rem; line-height: 1.6; }
  table {
    width: 100%; border-collapse: collapse; margin: 0 0 1.5rem; font-size: .9rem;
    background: var(--card); border: 1px solid var(--line); border-radius: 8px; overflow: hidden;
  }
  th, td { text-align: left; padding: .55rem .8rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  thead th {
    background: var(--code-bg); font-weight: 600; color: var(--muted);
    font-size: .8rem; text-transform: uppercase; letter-spacing: .03em;
  }
  tbody tr:last-child td { border-bottom: none; }
  td code { white-space: nowrap; }
  .arch-diagram {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .82rem;
    white-space: pre; background: var(--code-bg); border: 1px solid var(--line);
    border-radius: 8px; padding: 1.1rem 1.2rem; overflow-x: auto; color: var(--muted); margin: 0 0 1.25rem;
  }
  .todo { list-style: none; padding-left: 0; }
  .todo li { position: relative; padding-left: 1.6rem; }
  .todo li::before {
    content: ""; position: absolute; left: 0; top: .3rem; width: 1rem; height: 1rem;
    border: 1.5px solid var(--muted); border-radius: 4px;
  }
  .todo li.done::before {
    content: "\\2713"; border-color: var(--accent); color: var(--accent);
    font-size: .8rem; line-height: 1rem; text-align: center; font-weight: 700;
  }
  section { margin-bottom: .5rem; }
  footer.page-foot {
    margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--line);
    color: var(--muted); font-size: .82rem;
  }
  @media (max-width: 640px) {
    .wrap { padding: 2rem 1.1rem 4rem; }
    table, thead, tbody, th, td, tr { display: block; }
    thead { display: none; }
    tbody tr { margin-bottom: .75rem; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    td { border-bottom: 1px solid var(--line); display: flex; gap: .5rem; }
    td::before { content: attr(data-label); font-weight: 600; color: var(--muted); min-width: 6.5rem; flex-shrink: 0; }
  }

  /* ── 側邊欄目錄 ──────────────────────────────────────────────────── */
  html { scroll-behavior: smooth; }
  h2, h3 { scroll-margin-top: 1.5rem; }
  .layout { display: flex; align-items: flex-start; max-width: 1180px; margin: 0 auto; }
  .layout > .wrap { flex: 1 1 auto; min-width: 0; margin: 0 auto; }
  .toc {
    position: sticky; top: 0; align-self: flex-start;
    flex: 0 0 250px; width: 250px; max-height: 100vh; overflow-y: auto;
    padding: 2.75rem 1rem 2rem 1.5rem; border-right: 1px solid var(--line);
  }
  .toc summary {
    list-style: none; cursor: pointer; user-select: none;
    font-size: .78rem; text-transform: uppercase; letter-spacing: .05em;
    color: var(--muted); margin-bottom: .75rem; pointer-events: none;
  }
  .toc summary::-webkit-details-marker { display: none; }
  .toc summary::after {
    content: "\\25be"; float: right; transition: transform .15s ease; pointer-events: none;
  }
  .toc-box:not([open]) summary::after { transform: rotate(-90deg); }
  .toc nav ul { list-style: none; padding-left: 0; margin: 0; }
  .toc nav li { margin: 0; }
  .toc nav a {
    display: block; text-decoration: none; color: var(--muted);
    font-size: .86rem; line-height: 1.4; padding: .32rem .55rem;
    border-left: 2px solid transparent; border-radius: 0 6px 6px 0;
    transition: color .12s, background .12s;
  }
  .toc nav a:hover { color: var(--fg); background: var(--code-bg); }
  .toc nav a.active {
    color: var(--accent); background: var(--code-bg); border-left-color: var(--accent); font-weight: 600;
  }
  .toc .toc-num { color: var(--accent); margin-right: .45rem; font-variant-numeric: tabular-nums; }
  .toc ul.sub { padding-left: .7rem; margin: .1rem 0 .35rem; }
  .toc ul.sub a { font-size: .8rem; padding: .24rem .55rem; color: var(--muted); }
  @media (max-width: 960px) {
    .layout { display: block; }
    .toc {
      position: static; width: auto; flex: none; max-height: none; overflow: visible;
      border-right: none; border-bottom: 1px solid var(--line);
      padding: 1.1rem 1.25rem; margin: 0;
    }
    .toc summary { pointer-events: auto; margin-bottom: 0; }
    .toc-box[open] summary { margin-bottom: .6rem; }
  }
"""

PAGE = """<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>{style}</style>
</head>
<body>
<div class="layout">
{aside}  <div class="wrap">

  <header class="page-head">
    <h1>{h1}</h1>{subtitle}{badges}
  </header>

{body}
  <footer class="page-foot">
    自動由 <code>{src}</code> 產生 · <code>python3 scripts/build_docs.py</code>
  </footer>

  </div>
</div>
{script}
</body>
</html>
"""

TOC_SCRIPT = """<script>
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc nav a'));
  if (!links.length) return;
  var byId = {};
  var targets = [];
  links.forEach(function (a) {
    var id = a.getAttribute('href').slice(1);
    var el = document.getElementById(id);
    if (el) { byId[id] = a; targets.push(el); }
  });
  if ('IntersectionObserver' in window) {
    var visible = {};
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
      var active = null;
      for (var i = 0; i < targets.length; i++) {
        if (visible[targets[i].id]) { active = targets[i].id; break; }
      }
      links.forEach(function (a) { a.classList.remove('active'); });
      if (active && byId[active]) byId[active].classList.add('active');
    }, { rootMargin: '0px 0px -70% 0px', threshold: 0 });
    targets.forEach(function (t) { obs.observe(t); });
  }
  // 手機版預設收合目錄
  var box = document.querySelector('.toc-box');
  if (box && window.matchMedia('(max-width: 960px)').matches) box.removeAttribute('open');
})();
</script>"""

ARROW_CHARS = set("←↑→↓")


# ── 行內轉換 ─────────────────────────────────────────────────────────────────
def inline(text):
    # 先保護行內 code，避免內部被當成 **粗體**
    spans = []

    def stash(m):
        spans.append("<code>" + html.escape(m.group(1)) + "</code>")
        return "\x00%d\x00" % (len(spans) - 1)

    text = re.sub(r"`([^`]+)`", stash, text)
    text = html.escape(text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\x00(\d+)\x00", lambda m: spans[int(m.group(1))], text)
    return text


# ── 清單（含巢狀、[x] 待辦）────────────────────────────────────────────────
LIST_RE = re.compile(r"^(\s*)([-*]|\d+\.)\s+(.*)$")


def render_list(lines, base_indent):
    items = []
    ordered = None
    start_num = None
    i = 0
    while i < len(lines):
        m = LIST_RE.match(lines[i])
        if not m or len(m.group(1)) != base_indent:
            break
        marker, text = m.group(2), m.group(3)
        is_ord = bool(re.match(r"\d+\.", marker))
        if ordered is None:
            ordered = is_ord
            if is_ord:
                start_num = int(marker[:-1])
        # 待辦框
        done = None
        cb = re.match(r"^\[([ xX])\]\s+(.*)$", text)
        if cb:
            done = cb.group(1).lower() == "x"
            text = cb.group(2)
        # 收集更深縮排的子項
        i += 1
        child = []
        while i < len(lines):
            cm = LIST_RE.match(lines[i])
            if cm and len(cm.group(1)) > base_indent:
                child.append(lines[i])
                i += 1
            else:
                break
        inner = inline(text)
        if child:
            child_indent = min(len(LIST_RE.match(c).group(1)) for c in child)
            inner += "\n" + render_list(child, child_indent)
        cls = ""
        if done is not None:
            cls = ' class="done"' if done else ' class=""'
        items.append("<li%s>%s</li>" % (cls, inner))
    has_todo = any('class="done"' in it or 'class=""' in it for it in items)
    tag = "ol" if ordered else "ul"
    attrs = ""
    if ordered and start_num and start_num != 1:
        attrs += ' start="%d"' % start_num
    if has_todo and not ordered:
        attrs += ' class="todo"'
    return "<%s%s>\n%s\n</%s>" % (tag, attrs, "\n".join(items), tag)


# ── 表格 ─────────────────────────────────────────────────────────────────────
def split_row(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def render_table(rows):
    head = split_row(rows[0])
    body = [split_row(r) for r in rows[2:]]
    th = "".join("<th>%s</th>" % inline(c) for c in head)
    out = ["<table>", "<thead><tr>%s</tr></thead>" % th, "<tbody>"]
    for r in body:
        tds = []
        for idx, c in enumerate(r):
            label = head[idx] if idx < len(head) else ""
            tds.append('<td data-label="%s">%s</td>' % (html.escape(label), inline(c)))
        out.append("<tr>%s</tr>" % "".join(tds))
    out.append("</tbody>")
    out.append("</table>")
    return "\n".join(out)


def is_table_sep(line):
    return bool(re.match(r"^\s*\|?[\s:|-]+\|[\s:|-]*$", line)) and "-" in line


# ── 側邊欄目錄 ───────────────────────────────────────────────────────────────
def build_toc(headings):
    """headings: [{id, num, label, children:[{id, label}]}] → <aside> HTML（空則回傳 ""）"""
    if not headings:
        return ""
    lis = []
    for h in headings:
        num = '<span class="toc-num">%s</span>' % h["num"] if h["num"] else ""
        inner = '<a href="#%s">%s%s</a>' % (h["id"], num, h["label"])
        if h["children"]:
            subs = "".join(
                '<li><a href="#%s">%s</a></li>' % (c["id"], c["label"]) for c in h["children"]
            )
            inner += '<ul class="sub">%s</ul>' % subs
        lis.append("<li>%s</li>" % inner)
    nav = '<nav><ul>%s</ul></nav>' % "".join(lis)
    return ('  <aside class="toc"><details class="toc-box" open>'
            '<summary>目錄</summary>%s</details></aside>\n' % nav)


# ── 主轉換 ───────────────────────────────────────────────────────────────────
def convert(md, src_rel):
    lines = md.split("\n")
    n = len(lines)
    i = 0

    # 標題
    h1 = ""
    while i < n:
        if lines[i].strip() == "":
            i += 1
            continue
        m = re.match(r"^#\s+(.*)$", lines[i])
        if m:
            h1 = m.group(1).strip()
            i += 1
        break

    # 選用 metadata：緊接標題的 blockquote → 副標；<!--badges: a=b; c=d--> → 徽章
    subtitle_html = ""
    badges_html = ""
    while i < n and lines[i].strip() == "":
        i += 1
    if i < n:
        mb = re.match(r"^<!--\s*badges:\s*(.*?)\s*-->$", lines[i].strip())
        if mb:
            pairs = [p.strip() for p in mb.group(1).split(";") if p.strip()]
            chips = []
            for p in pairs:
                if "=" in p:
                    k, v = p.split("=", 1)
                    chips.append('<span class="badge"><strong>%s</strong> %s</span>'
                                 % (inline(k.strip()), inline(v.strip())))
                else:
                    chips.append('<span class="badge">%s</span>' % inline(p))
            badges_html = '\n    <div class="badges">' + "".join(chips) + "</div>"
            i += 1
    while i < n and lines[i].strip() == "":
        i += 1
    if i < n and lines[i].lstrip().startswith(">"):
        quote = []
        while i < n and lines[i].lstrip().startswith(">"):
            quote.append(re.sub(r"^\s*>\s?", "", lines[i]))
            i += 1
        paras = [inline(p.strip()) for p in "\n".join(quote).split("\n") if p.strip()]
        subtitle_html = "\n    <p>" + "<br>".join(paras) + "</p>"

    blocks = []          # (kind, html)
    headings = []        # 側邊欄目錄用
    sec_idx = 0          # h2 計數
    sub_idx = 0          # 目前 h2 底下的 h3 計數
    while i < n:
        line = lines[i]
        stripped = line.strip()

        if stripped == "":
            i += 1
            continue

        # 水平線 → 略過（章節靠 h2 間距分隔）
        if re.match(r"^---+$", stripped):
            i += 1
            continue

        # 圍籬程式碼 / 架構圖
        if stripped.startswith("```"):
            lang = stripped[3:].strip()
            i += 1
            buf = []
            while i < n and not lines[i].strip().startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1  # 跳過收尾 ```
            content = "\n".join(buf)
            if not lang and any(ch in ARROW_CHARS for ch in content):
                blocks.append(("arch", '<div class="arch-diagram">%s</div>' % html.escape(content)))
            else:
                blocks.append(("pre", "<pre><code>%s</code></pre>" % html.escape(content)))
            continue

        # 標題 h2 / h3
        m = re.match(r"^(#{2,3})\s+(.*)$", line)
        if m:
            level = len(m.group(1))
            text = m.group(2).strip()
            if level == 2:
                sec_idx += 1
                sub_idx = 0
                hid = "sec-%d" % sec_idx
                dm = re.match(r"^([0-9]+|[A-Z])\.\s+(.*)$", text)
                if dm:
                    num, label = dm.group(1), inline(dm.group(2))
                    blocks.append(("h2", '<h2 id="%s" data-num="%s">%s</h2>' % (hid, num, label)))
                else:
                    num, label = "", inline(text)
                    blocks.append(("h2", '<h2 id="%s">%s</h2>' % (hid, label)))
                headings.append({"id": hid, "num": num, "label": label, "children": []})
            else:
                sub_idx += 1
                hid = "sec-%d-%d" % (sec_idx, sub_idx)
                label = inline(text)
                blocks.append(("h3", '<h3 id="%s">%s</h3>' % (hid, label)))
                if headings:
                    headings[-1]["children"].append({"id": hid, "label": label})
                else:
                    headings.append({"id": hid, "num": "", "label": label, "children": []})
            i += 1
            continue

        # 表格
        if "|" in line and i + 1 < n and is_table_sep(lines[i + 1]):
            rows = [line]
            i += 1
            rows.append(lines[i])  # 分隔列
            i += 1
            while i < n and "|" in lines[i] and lines[i].strip():
                rows.append(lines[i])
                i += 1
            blocks.append(("table", render_table(rows)))
            continue

        # blockquote
        if stripped.startswith(">"):
            quote = []
            while i < n and lines[i].lstrip().startswith(">"):
                quote.append(re.sub(r"^\s*>\s?", "", lines[i]))
                i += 1
            paras = [inline(p.strip()) for p in "\n".join(quote).split("\n") if p.strip()]
            body = "".join("<p>%s</p>" % p for p in paras)
            blocks.append(("quote", "<blockquote>%s</blockquote>" % body))
            continue

        # 清單
        if LIST_RE.match(line):
            buf = []
            while i < n and (LIST_RE.match(lines[i]) or
                             (lines[i].strip() and lines[i][:1] == " " and not lines[i].lstrip().startswith(("#", ">", "```")))):
                buf.append(lines[i])
                i += 1
            base = min(len(LIST_RE.match(b).group(1)) for b in buf if LIST_RE.match(b))
            blocks.append(("list", render_list(buf, base)))
            continue

        # 段落
        para = []
        while i < n and lines[i].strip() and not lines[i].lstrip().startswith(("#", ">", "```", "|", "-", "*")) and not LIST_RE.match(lines[i]):
            para.append(lines[i].strip())
            i += 1
        if not para:  # 保險：吃掉一行避免無限迴圈
            para.append(stripped)
            i += 1
        blocks.append(("p", "<p>%s</p>" % inline(" ".join(para))))

    # 依 h2 包 <section>
    out = []
    open_section = False
    for kind, htmlb in blocks:
        if kind == "h2":
            if open_section:
                out.append("  </section>")
            out.append("  <section>")
            open_section = True
        out.append("    " + htmlb.replace("\n", "\n    "))
    if open_section:
        out.append("  </section>")
    body = "\n".join(out) + "\n"

    return PAGE.format(
        title=html.escape(h1),
        style=STYLE,
        h1=inline(h1),
        subtitle=subtitle_html,
        badges=badges_html,
        body=body,
        src=html.escape(src_rel),
        aside=build_toc(headings),
        script=TOC_SCRIPT,
    )


def build_file(md_path):
    md = md_path.read_text(encoding="utf-8")
    src_rel = str(md_path.relative_to(ROOT))
    out = convert(md, src_rel)
    html_path = md_path.with_suffix(".html")
    html_path.write_text(out, encoding="utf-8")
    return html_path


def main(argv):
    if len(argv) > 1:
        targets = [Path(argv[1]).resolve()]
    else:
        targets = sorted(DOCS.rglob("*.md"))
    for md in targets:
        if md.suffix != ".md":
            continue
        out = build_file(md)
        print("built", out.relative_to(ROOT))


if __name__ == "__main__":
    main(sys.argv)
