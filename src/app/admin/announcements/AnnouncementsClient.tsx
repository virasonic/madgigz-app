"use client";

import { FormEvent, useRef, useState, useTransition } from "react";
import {
  createAnnouncement,
  createTextAnnouncement,
  deleteAnnouncement,
  updateAnnouncementLocale,
} from "./actions";

export interface AdminAnnouncement {
  id: string;
  headline: string | null;
  caption: string;
  headlineEs: string | null;
  captionEs: string | null;
  mediaUrl: string | null;
  mediaType: string;
  accentColor: string | null;
  createdAt: string;
}

// The two brand accents the template offers. Orange is MadGigz's own voice,
// teal reads as fan-facing - the same split the generated cards use.
const ACCENTS = [
  { label: "Orange", value: "#d76616" },
  { label: "Teal", value: "#54c3bd" },
];

export default function AnnouncementsClient({ items }: { items: AdminAnnouncement[] }) {
  const [mode, setMode] = useState<"template" | "upload">("template");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex gap-2">
        {(
          [
            ["template", "Write a card"],
            ["upload", "Upload media"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={`rounded-full px-4 py-1.5 text-sm font-heading ${
              mode === value ? "bg-primary text-foreground" : "bg-surface text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "template" ? <TemplateComposer /> : <UploadComposer />}

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-sm uppercase tracking-wide text-muted">
          Live on the feed ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted">Nothing posted yet.</p>
        ) : (
          items.map((item) => <Row key={item.id} item={item} />)
        )}
      </section>
    </div>
  );
}

function TemplateComposer() {
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  // Optional Spanish variants. Leave blank and the card is English-only for
  // everyone; fill them and Spanish readers get this text instead (addendum_043).
  const [headlineEs, setHeadlineEs] = useState("");
  const [bodyEs, setBodyEs] = useState("");
  const [accent, setAccent] = useState(ACCENTS[0].value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTextAnnouncement({ headline, body, accent, headlineEs, bodyEs });
      if (result.error) {
        setError(result.error);
        return;
      }
      setHeadline("");
      setBody("");
      setHeadlineEs("");
      setBodyEs("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 rounded-2xl bg-surface p-5 md:flex-row">
      <div className="flex flex-1 flex-col gap-4">
        <h2 className="font-heading text-sm uppercase tracking-wide text-muted">New card</h2>

        <input
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
          maxLength={120}
          placeholder="Headline — the big line"
          className="w-full rounded-xl border border-muted/20 bg-background px-4 py-3 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="A line or two underneath (optional)"
          className="w-full rounded-xl border border-muted/20 bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
        />

        {/* Optional Spanish. Filled in, a Spanish-language fan sees these instead;
            left blank, everyone sees the English above. */}
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-muted/20 p-3">
          <span className="text-xs font-heading uppercase tracking-wide text-muted">
            Spanish (optional)
          </span>
          <input
            value={headlineEs}
            onChange={(e) => setHeadlineEs(e.target.value)}
            maxLength={120}
            placeholder="Titular — la línea grande"
            className="w-full rounded-xl border border-muted/20 bg-background px-4 py-3 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <textarea
            value={bodyEs}
            onChange={(e) => setBodyEs(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Una línea o dos debajo (opcional)"
            className="w-full rounded-xl border border-muted/20 bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted">Accent</span>
          {ACCENTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setAccent(option.value)}
              aria-label={option.label}
              className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-surface ${
                accent === option.value ? "ring-foreground" : "ring-transparent"
              }`}
              style={{ backgroundColor: option.value }}
            />
          ))}
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button
          type="submit"
          disabled={isPending || !headline.trim()}
          className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-heading text-foreground hover:bg-primary-dark disabled:opacity-50"
        >
          {isPending ? "Posting..." : "Post to feed"}
        </button>
      </div>

      {/* Live preview of the exact template the feed renders, at feed
          proportions. What you see here is what a fan scrolls past. */}
      <div className="shrink-0">
        <p className="mb-2 text-xs text-muted">Preview</p>
        <div
          className="flex h-[380px] w-[214px] flex-col justify-center overflow-hidden rounded-2xl bg-background px-5"
          style={{
            backgroundImage: `radial-gradient(120% 80% at 15% 12%, ${accent}55, transparent 60%), radial-gradient(120% 80% at 90% 95%, #0d5c6d55, transparent 55%)`,
          }}
        >
          <span
            className="mb-3 w-fit rounded-full px-2 py-0.5 text-[10px] font-heading uppercase tracking-wide text-foreground"
            style={{ backgroundColor: accent }}
          >
            From MadGigz
          </span>
          <p className="font-display text-lg leading-tight text-foreground">
            {headline || "Your headline"}
          </p>
          {body && <p className="mt-2 text-xs text-muted">{body}</p>}
        </div>
      </div>
    </form>
  );
}

function UploadComposer() {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isVideo, setIsVideo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createAnnouncement(data);
      if (result.error) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      setPreview(null);
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="flex gap-5 rounded-2xl bg-surface p-5">
      <label className="flex h-40 w-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-muted/30 bg-background text-center text-xs text-muted">
        {preview ? (
          isVideo ? (
            <video src={preview} className="h-full w-full object-cover" muted />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- local blob preview
            <img src={preview} alt="" className="h-full w-full object-cover" />
          )
        ) : (
          <span className="px-2">Tap to choose image or video</span>
        )}
        <input
          type="file"
          name="media"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setIsVideo(file.type.startsWith("video/"));
            setPreview(URL.createObjectURL(file));
          }}
        />
      </label>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <textarea
          name="caption"
          rows={3}
          maxLength={500}
          placeholder="Caption to show under the media"
          className="w-full rounded-xl border border-muted/20 bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        {/* Optional Spanish caption — shown to Spanish readers when set. */}
        <textarea
          name="caption_es"
          rows={3}
          maxLength={500}
          placeholder="Texto en español (opcional)"
          className="w-full rounded-xl border border-dashed border-muted/20 bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <p className="text-xs text-muted">
          For a designed graphic or a video. For plain text on the brand card, use “Write a card”.
        </p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="w-fit rounded-lg bg-primary px-4 py-2 text-sm font-heading text-foreground hover:bg-primary-dark disabled:opacity-50"
        >
          {isPending ? "Posting..." : "Post to feed"}
        </button>
      </div>
    </form>
  );
}

function Row({ item }: { item: AdminAnnouncement }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Text/template announcements carry a headline; uploads (image/video) are
  // caption-only. Key off the headline's presence, not media_type — older posts
  // predate the media_type:"text" convention and would otherwise hide the
  // Spanish headline field.
  const isText = item.mediaType === "text" || Boolean(item.headline);

  // Local copies so the row reflects a save without a full page reload. Editing
  // toggles the inline Spanish fields.
  const [headlineEs, setHeadlineEs] = useState(item.headlineEs ?? "");
  const [captionEs, setCaptionEs] = useState(item.captionEs ?? "");
  const [editing, setEditing] = useState(false);
  const [draftHeadline, setDraftHeadline] = useState(headlineEs);
  const [draftCaption, setDraftCaption] = useState(captionEs);

  const hasEs = Boolean(headlineEs || captionEs);

  function openEditor() {
    setDraftHeadline(headlineEs);
    setDraftCaption(captionEs);
    setError(null);
    setEditing(true);
  }

  function saveEs() {
    setError(null);
    startTransition(async () => {
      const result = await updateAnnouncementLocale({
        id: item.id,
        headlineEs: isText ? draftHeadline : "",
        captionEs: draftCaption,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setHeadlineEs(isText ? draftHeadline.trim() : "");
      setCaptionEs(draftCaption.trim());
      setEditing(false);
    });
  }

  return (
    <div className="flex items-start gap-4 rounded-2xl bg-surface p-4">
      {item.mediaType === "text" ? (
        <div
          className="flex h-24 w-16 shrink-0 items-center justify-center rounded-lg px-1 text-center"
          style={{
            backgroundImage: `radial-gradient(120% 80% at 15% 12%, ${item.accentColor ?? "#d76616"}66, transparent 60%)`,
            backgroundColor: "#0a0807",
          }}
        >
          <span className="font-display text-[9px] leading-tight text-foreground">
            {(item.headline ?? "").slice(0, 30)}
          </span>
        </div>
      ) : item.mediaType === "video" ? (
        <video src={item.mediaUrl ?? ""} className="h-24 w-16 shrink-0 rounded-lg object-cover" muted />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary Storage URL in an internal panel
        <img src={item.mediaUrl ?? ""} alt="" className="h-24 w-16 shrink-0 rounded-lg object-cover" />
      )}
      <div className="min-w-0 flex-1">
        {item.headline && <p className="text-sm font-heading text-foreground">{item.headline}</p>}
        <p className="text-sm text-muted">{item.caption}</p>

        {!editing && hasEs && (
          <p className="mt-1 text-xs text-accent">
            ES: {headlineEs}
            {headlineEs && captionEs ? " — " : ""}
            {captionEs}
          </p>
        )}

        {editing ? (
          <div className="mt-2 flex flex-col gap-2 rounded-xl border border-dashed border-muted/20 p-3">
            <span className="text-xs font-heading uppercase tracking-wide text-muted">Spanish</span>
            {isText && (
              <input
                value={draftHeadline}
                onChange={(e) => setDraftHeadline(e.target.value)}
                maxLength={120}
                placeholder="Titular en español"
                className="w-full rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            )}
            <textarea
              value={draftCaption}
              onChange={(e) => setDraftCaption(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={isText ? "Texto en español (opcional)" : "Texto en español"}
              className="w-full rounded-lg border border-muted/20 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveEs}
                disabled={isPending}
                className="rounded-lg bg-primary px-3 py-1.5 text-xs font-heading text-foreground hover:bg-primary-dark disabled:opacity-50"
              >
                {isPending ? "Saving..." : "Save Spanish"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError(null);
                }}
                disabled={isPending}
                className="rounded-lg px-3 py-1.5 text-xs font-heading text-muted hover:bg-muted/20 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={openEditor}
            className="mt-1 text-xs font-heading text-accent hover:underline"
          >
            {hasEs ? "Edit Spanish" : "+ Add Spanish"}
          </button>
        )}

        <p className="mt-1 text-xs text-muted">
          {new Date(item.createdAt).toLocaleString("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      <button
        onClick={() =>
          startTransition(async () => {
            const result = await deleteAnnouncement(item.id);
            if (result.error) setError(result.error);
          })
        }
        disabled={isPending}
        className="shrink-0 rounded-lg bg-surface-raised px-3 py-1.5 text-xs font-heading text-muted hover:bg-muted/20 disabled:opacity-50"
      >
        {isPending ? "..." : "Remove"}
      </button>
    </div>
  );
}
