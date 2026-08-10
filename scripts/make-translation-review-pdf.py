"""MadGigz Spanish translation review sheet.

A printable A4 doc: for each screen, the English text next to the draft
Spanish, with a blank column for the reviewer to write corrections. Kept
non-technical - no keys, no code, just "here's what it says, is the Spanish
right?".

The strings come straight from the app's message catalogs, exported to
docs/i18n-catalog.json by scripts/export-i18n-json.mjs - so this sheet can't
drift from what the app actually shows. To refresh after any wording change:

    node scripts/export-i18n-json.mjs
    python3 scripts/make-translation-review-pdf.py
"""

import html
import json
import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CATALOG = os.path.join(ROOT, "docs", "i18n-catalog.json")
OUT = os.path.join(ROOT, "docs", "madgigz-translation-review.pdf")

ORANGE = colors.HexColor("#d76616")
MAROON = colors.HexColor("#73241d")
INK = colors.HexColor("#2a2320")
MUTED = colors.HexColor("#6b6157")
CREAMBG = colors.HexColor("#faf7ef")
LINE = colors.HexColor("#e4ddcf")

styles = getSampleStyleSheet()
h1 = ParagraphStyle("h1", parent=styles["Title"], textColor=MAROON, fontSize=22, spaceAfter=4)
sub = ParagraphStyle("sub", parent=styles["Normal"], textColor=MUTED, fontSize=10.5, leading=15)
section = ParagraphStyle(
    "section", parent=styles["Heading2"], textColor=ORANGE, fontSize=13, spaceBefore=14, spaceAfter=6
)
cell_en = ParagraphStyle("en", parent=styles["Normal"], fontSize=9.5, leading=12.5, textColor=INK)
cell_es = ParagraphStyle("es", parent=styles["Normal"], fontSize=9.5, leading=12.5, textColor=INK)
head = ParagraphStyle(
    "head", parent=styles["Normal"], fontSize=9, leading=11, textColor=colors.white, alignment=TA_LEFT
)
note = ParagraphStyle("note", parent=styles["Normal"], fontSize=8.5, leading=11, textColor=MUTED)

# Human titles for each catalog section, in a sensible reading order. Sections
# present in the catalog but missing here still get rendered (title-cased) so
# nothing is silently dropped when a new section is added.
SECTION_TITLES = [
    ("landing", "Welcome screen"),
    ("signin", "Sign in"),
    ("signup", "Create account"),
    ("verifyEmail", "Verify email"),
    ("completeProfile", "Finish Google sign-up"),
    ("artistClaim", "Claim artist profile"),
    ("forgotPassword", "Forgot password"),
    ("resetPassword", "Reset password"),
    ("nav", "Bottom navigation"),
    ("feed", "Feed"),
    ("explore", "Explore"),
    ("savedPage", "Tickets page"),
    ("ticket", "Buy / view ticket"),
    ("eventPage", "Shared event page"),
    ("publicEvent", "Shared event - buttons"),
    ("profile", "Profile"),
    ("editProfile", "Edit profile"),
    ("settings", "Settings"),
    ("payout", "Artist payouts"),
    ("addShow", "Add a show"),
    ("manageShow", "Manage a show"),
    ("addContent", "Post an update"),
    ("scan", "Scan tickets"),
    ("pickers", "Show form - venue / lineup / fees"),
    ("follow", "Follow button"),
    ("share", "Share button"),
    ("report", "Report a post"),
    ("feedback", "Send feedback"),
    ("notifications", "Notifications"),
    ("deleteAccount", "Delete account"),
    ("language", "Language switch"),
    ("common", "Shared words & buttons"),
]


def cell_text(value):
    """Escape for reportlab's mini-HTML and make {braces} stand out a little."""
    return html.escape(value)


def build():
    with open(CATALOG, encoding="utf-8") as f:
        catalog = json.load(f)
    en, es = catalog["en"], catalog["es"]

    ordered = [s for s, _ in SECTION_TITLES]
    extras = [s for s in en if s not in ordered]
    sections = SECTION_TITLES + [(s, s.replace("_", " ").title()) for s in extras]

    doc = SimpleDocTemplate(
        OUT, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
        title="MadGigz - Spanish translation review",
    )
    story = []

    story.append(Paragraph("MadGigz — Spanish translation review", h1))
    story.append(Paragraph(
        "Please check the Spanish below against the English and write any fix in the last "
        "column. You only need to read — no computer skills needed.<br/>"
        "<b>Por favor, revisa el español y escribe cualquier corrección en la última columna. "
        "Solo hay que leer.</b>",
        sub,
    ))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "A few notes: keep the word <b>MadGigz</b> and brand names (Instagram, Spotify, "
        "YouTube…) as they are. Where you see something in <b>{braces}</b> — like {name} or "
        "{count} — it's filled in by the app, so leave the braces and the word inside exactly "
        "as they are. The three dots … and the euro € stay too. This covers every screen in "
        "the app.",
        note,
    ))

    col_widths = [56 * mm, 56 * mm, 66 * mm]

    for key, title in sections:
        rows = en.get(key)
        if not isinstance(rows, dict):
            continue

        story.append(Paragraph(title, section))

        data = [[
            Paragraph("English", head),
            Paragraph("Español (borrador / draft)", head),
            Paragraph("Your correction — tu corrección", head),
        ]]
        for name, en_val in rows.items():
            if not isinstance(en_val, str):
                continue
            es_val = es.get(key, {}).get(name, "")
            data.append([
                Paragraph(cell_text(en_val), cell_en),
                Paragraph(cell_text(es_val), cell_es),
                "",
            ])

        table = Table(data, colWidths=col_widths, repeatRows=1)
        table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), MAROON),
            ("BACKGROUND", (0, 1), (1, -1), CREAMBG),
            ("BACKGROUND", (2, 1), (2, -1), colors.white),
            ("GRID", (0, 0), (-1, -1), 0.5, LINE),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ]))
        story.append(table)

    doc.build(story)
    print("wrote", OUT)


build()
