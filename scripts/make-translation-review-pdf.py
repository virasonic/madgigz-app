"""MadGigz Spanish translation review sheet.

A printable A4 doc: for each screen, the English text next to the draft
Spanish, with a blank column for the reviewer to write corrections. Kept
non-technical - no keys, no code, just "here's what it says, is the Spanish
right?".
"""

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

OUT = "/Users/vir/Desktop/MadGigz APP/docs/madgigz-translation-review.pdf"

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

# (Screen title, [(English, Spanish draft), ...])
SECTIONS = [
    ("Welcome screen (first thing a new visitor sees)", [
        ("Local Gigs & Concerts", "Conciertos y Bolos"),
        ("I'm a Fan", "Soy fan"),
        ("Discover events, buy tickets, vibe out", "Descubre eventos, compra entradas, disfruta"),
        ("I'm an Artist", "Soy artista"),
        ("Claim your profile, sell your shows", "Reclama tu perfil, vende tus bolos"),
        ("Artist", "Artista"),
        ("Already have an account?", "¿Ya tienes cuenta?"),
    ]),
    ("Sign in", [
        ("Welcome back", "Bienvenido de nuevo"),
        ("Sign in to keep the vibe going.", "Inicia sesión para no perder el ritmo."),
        ("Email or username", "Email o usuario"),
        ("Password", "Contraseña"),
        ("Forgot password?", "¿Olvidaste la contraseña?"),
        ("Sign in", "Iniciar sesión"),
        ("Signing in...", "Iniciando sesión..."),
        ("or", "o"),
        ("Sign in with Google", "Iniciar sesión con Google"),
        ("Don't have an account?", "¿No tienes cuenta?"),
        ("Enter your email or username", "Introduce tu email o usuario"),
        ("Enter your password", "Introduce tu contraseña"),
        ("Incorrect email or password", "Email o contraseña incorrectos"),
    ]),
    ("Create account (sign up)", [
        ("Fan", "Fan"),
        ("Artist", "Artista"),
        ("Create your account", "Crea tu cuenta"),
        ("Let's get you set up in a minute.", "Te configuramos en un minuto."),
        ("Sign up with Google", "Registrarse con Google"),
        ("or with email", "o con email"),
        ("Username", "Usuario"),
        ("No spaces. Letters, numbers, dots, dashes and underscores.",
         "Sin espacios. Letras, números, puntos, guiones y guiones bajos."),
        ("That username is taken", "Ese usuario ya está cogido"),
        ("Username available", "Usuario disponible"),
        ("Email", "Email"),
        ("Date of birth", "Fecha de nacimiento"),
        ("Password", "Contraseña"),
        ("Confirm password", "Confirmar contraseña"),
        ("Continue", "Continuar"),
        ("Creating account...", "Creando cuenta..."),
        ("Username is required", "El usuario es obligatorio"),
        ("Usernames can't contain spaces", "El usuario no puede tener espacios"),
        ("Use 3-30 letters, numbers, dots, dashes or underscores",
         "Usa 3-30 letras, números, puntos, guiones o guiones bajos"),
        ("Enter a valid email", "Introduce un email válido"),
        ("Use at least 8 characters", "Usa al menos 8 caracteres"),
        ("Passwords don't match", "Las contraseñas no coinciden"),
        ("Enter your date of birth", "Introduce tu fecha de nacimiento"),
        ("You must be at least 16 to join MadGigz",
         "Debes tener al menos 16 años para unirte a MadGigz"),
        ("Complete the verification below", "Completa la verificación de abajo"),
    ]),
    ("Bottom navigation bar", [
        ("Feed", "Feed"),
        ("Explore", "Explorar"),
        ("Tickets", "Entradas"),
        ("Profile", "Perfil"),
    ]),
    ("Settings", [
        ("Settings", "Ajustes"),
        ("Edit Profile", "Editar perfil"),
        ("Photo", "Foto"),
        ("Bio & photo", "Bio y foto"),
        ("Language", "Idioma"),
        ("Send feedback", "Enviar comentarios"),
        ("Bug, help or an idea", "Fallo, ayuda o una idea"),
        ("Soon", "Pronto"),
    ]),
    ("Profile", [
        ("Attended", "Asistidos"),
        ("Saved", "Guardados"),
        ("Log Out", "Cerrar sesión"),
        ("Delete my account", "Eliminar mi cuenta"),
    ]),
    ("Buttons & shared words", [
        ("Save", "Guardar"),
        ("Saving...", "Guardando..."),
        ("Cancel", "Cancelar"),
        ("Done", "Listo"),
        ("Continue", "Continuar"),
        ("Loading...", "Cargando..."),
        ("Try again", "Reintentar"),
    ]),
]


def build():
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
        "A few notes: keep the word <b>MadGigz</b> as it is. Where you see <b>{16}</b> or a "
        "number in braces, it's filled in by the app — leave the braces alone. This covers the "
        "screens translated so far; more will follow.",
        note,
    ))

    col_widths = [56 * mm, 56 * mm, 66 * mm]

    for title, rows in SECTIONS:
        story.append(Paragraph(title, section))

        data = [[
            Paragraph("English", head),
            Paragraph("Español (borrador / draft)", head),
            Paragraph("Your correction — tu corrección", head),
        ]]
        for en, es in rows:
            data.append([Paragraph(en, cell_en), Paragraph(es, cell_es), ""])

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
