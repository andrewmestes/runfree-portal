#!/usr/bin/env python3
"""
Convert an Asana task's html_notes into the portal's note HTML, and prove the
conversion lost nothing.

    python3 scripts/convert-asana-notes.py <dir> <gid> [<gid> ...]

Reads  <dir>/verify/<gid>.a.html  (the task's html_notes, Asana's exact bytes)
and  <dir>/verify/<gid>.a.txt  (the task's plain-text notes, Asana's own
rendering of the same thing). Writes <dir>/recaps/<gid>.html and
<dir>/recaps/<gid>.json (the recording URL that was lifted out of the top).
First used for the Kairos certification sessions (scripts/import-kairos.ts);
any Asana import whose notes carry a session write-up needs the same care.

Asana's notes are "pre-wrap": a newline in text is a line break, and blocks
(headings, lists, tables) sit between lines. The portal renders notes as
normal HTML, where a newline is just a space, so every line becomes a <p>.
The leading Loom link and its <object> embed become the session's
recording_url instead of text.

Checks, all of which must pass or nothing is written:
  1. The words, in order, are identical (no-break spaces counted as spaces).
  2. The line sequence matches Asana's plain text exactly: one line per
     paragraph, heading, list item and table cell.
  3. Tables, rows, cells, list items, headings, bold, italic, underline and
     links are all still there (minus the two lifted Loom links).
"""
import html
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(".")
VOID = {"br", "hr", "img"}
BLOCK = {"h1", "h2", "h3", "h4", "ul", "ol", "table", "blockquote", "hr", "pre", "object", "img"}
INLINE_MAP = {"strong": "strong", "b": "strong", "em": "em", "i": "em", "u": "u",
              "s": "s", "strike": "s", "del": "s"}


class Node:
    def __init__(self, tag, attrs=None):
        self.tag = tag
        self.attrs = dict(attrs or [])
        self.children = []


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root")
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag, attrs))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return
        raise ValueError(f"stray </{tag}>")

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def parse(src):
    t = Tree()
    t.feed(src)
    t.close()
    if len(t.stack) != 1:
        raise ValueError("unclosed: " + ", ".join(n.tag for n in t.stack[1:]))
    return t.root


def esc(s):
    return html.escape(s, quote=False)


def safe_href(url):
    url = (url or "").strip()
    return url if re.match(r"^(https?://|mailto:)", url, re.I) else None


def inline(node):
    """Serialize inline content. A newline inside it is a line break."""
    if isinstance(node, str):
        return esc(node).replace("\n", "<br>")
    inner = "".join(inline(c) for c in node.children)
    if node.tag == "br":
        return "<br>"
    if node.tag in INLINE_MAP:
        t = INLINE_MAP[node.tag]
        return f"<{t}>{inner}</{t}>"
    if node.tag == "a":
        href = safe_href(node.attrs.get("href"))
        return f'<a href="{html.escape(href)}">{inner}</a>' if href else inner
    if node.tag in BLOCK:
        return block(node)
    return inner  # span, code, … : keep the words


def children_skipping_blank(node):
    return [c for c in node.children if not (isinstance(c, str) and not c.strip())]


def block(node):
    tag = node.tag
    if tag in ("h1", "h2"):
        return "<h2>" + "".join(inline(c) for c in node.children).strip() + "</h2>"
    if tag in ("h3", "h4"):
        return "<h3>" + "".join(inline(c) for c in node.children).strip() + "</h3>"
    if tag in ("ul", "ol"):
        items = []
        for c in children_skipping_blank(node):
            if isinstance(c, str) or c.tag != "li":
                raise ValueError(f"unexpected {c!r} in <{tag}>")
            items.append("<li>" + "".join(inline(x) for x in c.children).strip() + "</li>")
        return f"<{tag}>" + "".join(items) + f"</{tag}>"
    if tag == "table":
        rows = []
        for r in children_skipping_blank(node):
            if isinstance(r, str) or r.tag not in ("tr", "tbody", "thead"):
                raise ValueError(f"unexpected {r!r} in <table>")
            trs = children_skipping_blank(r) if r.tag in ("tbody", "thead") else [r]
            for tr in trs:
                cells = []
                for td in children_skipping_blank(tr):
                    if isinstance(td, str) or td.tag not in ("td", "th"):
                        raise ValueError(f"unexpected {td!r} in <tr>")
                    cells.append("<td>" + "".join(inline(x) for x in td.children).strip() + "</td>")
                rows.append("<tr>" + "".join(cells) + "</tr>")
        return "<table><tbody>" + "".join(rows) + "</tbody></table>"
    if tag == "blockquote":
        return "<blockquote>" + "".join(inline(c) for c in node.children).strip() + "</blockquote>"
    if tag in ("hr", "img"):
        return ""
    if tag == "object":
        return "".join(inline(c) for c in node.children if not isinstance(c, str))
    if tag == "pre":
        return "<p>" + "".join(inline(c) for c in node.children) + "</p>"
    raise ValueError(f"no rule for <{tag}>")


def convert(src):
    root = parse(src)
    body = root.children[0] if len(root.children) == 1 and root.children[0].tag == "body" else None
    if body is None:
        raise ValueError("expected a single <body>")
    kids = list(body.children)

    # Lift the recording off the top: <a loom>, "\n", <object loom>, "\n".
    first = kids[0]
    if not (isinstance(first, Node) and first.tag == "a" and "loom.com/share/" in first.attrs.get("href", "")):
        raise ValueError("notes do not open with the Loom link")
    recording = first.attrs["href"]
    kids = kids[1:]
    while kids and isinstance(kids[0], str) and not kids[0].strip():
        kids = kids[1:]
    obj = kids[0]
    if not (isinstance(obj, Node) and obj.tag == "object" and "loom.com" in obj.attrs.get("data", "")):
        raise ValueError("the Loom link is not followed by its embed")
    kids = kids[1:]

    out, line = [], []

    def flush():
        s = "".join(line).strip(" \t\r\n")
        if s:
            out.append("<p>" + s + "</p>")
        line.clear()

    for node in kids:
        if isinstance(node, str):
            for i, part in enumerate(node.split("\n")):
                if i:
                    flush()
                if part:
                    line.append(esc(part))
        elif node.tag in BLOCK:
            flush()
            b = block(node)
            if b:
                out.append(b)
        else:
            line.append(inline(node))
    flush()
    return recording, "\n".join(out)


# ── checks ──────────────────────────────────────────────────────────────────

def words(fragment, skip_leading_loom=False):
    root = parse(fragment)
    texts = []

    def walk(n, top=False):
        if isinstance(n, str):
            texts.append(n)
            return
        for c in n.children:
            walk(c)

    if skip_leading_loom:
        body = root.children[0]
        kids = list(body.children)
        # drop <a>, whitespace, <object>
        kids = kids[1:]
        while kids and isinstance(kids[0], str) and not kids[0].strip():
            kids = kids[1:]
        kids = kids[1:]
        for k in kids:
            walk(k) if isinstance(k, Node) else texts.append(k)
    else:
        walk(root)
    return " ".join(texts).replace("\xa0", " ").split()


def lines_from_html(fragment):
    """One line per <p>, heading, <li> and cell; a <br> inside splits it."""
    root = parse(fragment)
    lines = []

    def text_of(n):
        if isinstance(n, str):
            return n
        if n.tag == "br":
            return "\n"
        if n.tag == "a":
            # Asana's plain text writes a link as its address; the link and
            # its words are both kept in the HTML (checked by the word test).
            return n.attrs.get("href", "")
        return "".join(text_of(c) for c in n.children)

    def walk(n):
        if isinstance(n, str):
            return
        if n.tag in ("p", "h2", "h3", "li", "td", "blockquote"):
            # Asana's plain text marks a quote with "> "; ours is a real quote.
            mark = "> " if n.tag == "blockquote" else ""
            for part in text_of(n).split("\n"):
                lines.append(mark + part if part.strip() else part)
            return
        for c in n.children:
            walk(c)

    walk(root)
    return [re.sub(r"\s+", " ", l.replace("\xa0", " ")).strip() for l in lines if l.strip()]


def lines_from_txt(txt):
    ls = [re.sub(r"\s+", " ", l.replace("\xa0", " ")).strip() for l in txt.split("\n")]
    ls = [l for l in ls if l]
    # Asana's plain text opens with the Loom link and the embed's asset link.
    if not (ls[0].startswith("https://www.loom.com/share/") and "get_asset" in ls[1]):
        raise ValueError("plain text does not open with the two recording links")
    return ls[2:]


def tag_counts(fragment):
    counts = {}
    for m in re.finditer(r"<([a-z0-9]+)[\s>]", fragment):
        t = m.group(1)
        counts[t] = counts.get(t, 0) + 1
    return counts


def main(gids):
    (ROOT / "recaps").mkdir(exist_ok=True)
    for gid in gids:
        src = (ROOT / "verify" / f"{gid}.a.html").read_text(encoding="utf-8")
        txt = (ROOT / "verify" / f"{gid}.a.txt").read_text(encoding="utf-8")
        recording, out = convert(src)

        w_in, w_out = words(src, skip_leading_loom=True), words(out)
        assert w_in == w_out, f"{gid}: words differ at {next(i for i, (a, b) in enumerate(zip(w_in, w_out)) if a != b)}"

        l_txt, l_out = lines_from_txt(txt), lines_from_html(out)
        if l_txt != l_out:
            for i, (a, b) in enumerate(zip(l_txt, l_out)):
                if a != b:
                    raise AssertionError(f"{gid}: line {i} differs\n  asana: {a!r}\n  ours:  {b!r}")
            raise AssertionError(f"{gid}: {len(l_txt)} Asana lines vs {len(l_out)} of ours")

        ci, co = tag_counts(src), tag_counts(out)
        pairs = {
            "table": (ci.get("table", 0), co.get("table", 0)),
            "row": (ci.get("tr", 0), co.get("tr", 0)),
            "cell": (ci.get("td", 0) + ci.get("th", 0), co.get("td", 0)),
            "list item": (ci.get("li", 0), co.get("li", 0)),
            "heading": (sum(ci.get(h, 0) for h in ("h1", "h2", "h3", "h4")), co.get("h2", 0) + co.get("h3", 0)),
            "bold": (ci.get("strong", 0) + ci.get("b", 0), co.get("strong", 0)),
            "italic": (ci.get("em", 0) + ci.get("i", 0), co.get("em", 0)),
            "underline": (ci.get("u", 0), co.get("u", 0)),
            "link": (ci.get("a", 0) - 2, co.get("a", 0)),
        }
        bad = {k: v for k, v in pairs.items() if v[0] != v[1]}
        assert not bad, f"{gid}: structure changed {bad}"

        (ROOT / "recaps" / f"{gid}.html").write_text(out, encoding="utf-8")
        (ROOT / "recaps" / f"{gid}.json").write_text(json.dumps({"recording_url": recording}), encoding="utf-8")
        print(f"{gid}: {len(w_out)} words, {len(l_out)} lines, "
              + ", ".join(f"{v[1]} {k}{'s' if v[1] != 1 else ''}" for k, v in pairs.items())
              + f"  ·  {len(out):,} chars  ·  recording {recording}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("usage: convert-asana-notes.py <dir> <gid> [<gid> ...]")
    ROOT = Path(sys.argv[1]).resolve()
    main(sys.argv[2:])
