"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { runGigImport, type ImportResult, type RowStatus } from "./gig-import";

// A worked example so an admin sees the exact shape before pasting. Tab-separated
// here for readability; a spreadsheet copy-paste lands the same way.
const SAMPLE = `title\tartist\tvenue\tdate\ttime\tprice\tticket_url\tgenre\tage
Noche Flamenca\tRosalía\tLa Riviera\t2026-09-12\t21:00\t28\thttps://entradium.com/e/rosalia\tFlamenco\t18+
Indie Night\tHinds\tSala But\t14/09/2026\t20:30\t18\thttps://dice.fm/event/hinds\tIndie\t16+`;

const STATUS_STYLE: Record<RowStatus, string> = {
  ok: "bg-teal-500/15 text-teal-300",
  created: "bg-green-500/15 text-green-300",
  duplicate: "bg-amber-500/15 text-amber-300",
  invalid: "bg-danger/15 text-danger",
};

const STATUS_LABEL: Record<RowStatus, string> = {
  ok: "Ready",
  created: "Created",
  duplicate: "Duplicate",
  invalid: "Invalid",
};

export default function GigImportClient() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file again re-fires onChange.
    e.target.value = "";
    if (!file) return;
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    setResult(null);
  }

  function preview() {
    startTransition(async () => setResult(await runGigImport(text, false)));
  }

  function commit() {
    startTransition(async () => setResult(await runGigImport(text, true)));
  }

  const canImport = result != null && !result.committed && !result.error && result.summary.ok > 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-surface p-5">
        <label className="mb-2 block font-heading text-sm text-foreground">
          Upload or paste gigs (spreadsheet or CSV)
        </label>
        <p className="mb-3 text-xs text-muted">
          First row is the header. Required columns: <strong>title, artist, venue, date,
          ticket_url</strong>. Optional: time, price, <strong>lineup</strong>, genre, age,
          description, image, capacity. Upload a <strong>.csv</strong> file, or copy straight from
          Google Sheets / Excel (tab-separated) and paste below. A multi-act bill in{" "}
          <strong>lineup</strong> (or a comma-separated <strong>artist</strong>) fills the line-up.
          Dates read as YYYY-MM-DD or DD/MM/YYYY. Every imported show is an external-ticketing
          listing owned by MadGigz.
        </p>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            onChange={onFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending}
            className="rounded-full bg-surface px-4 py-2 font-heading text-sm text-foreground ring-1 ring-muted/30 disabled:opacity-50"
          >
            Upload CSV file
          </button>
          {fileName && (
            <span className="text-xs text-muted">
              Loaded <strong className="text-foreground">{fileName}</strong> — review below, then
              Preview.
            </span>
          )}
        </div>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFileName(null);
          }}
          rows={10}
          spellCheck={false}
          placeholder={SAMPLE}
          className="w-full resize-y rounded-xl border border-muted/20 bg-background p-3 font-mono text-xs text-foreground placeholder:text-muted/50 focus:border-accent focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={preview}
            disabled={pending || !text.trim()}
            className="rounded-full bg-surface px-5 py-2.5 font-heading text-sm text-foreground ring-1 ring-muted/30 disabled:opacity-50"
          >
            {pending ? "Checking…" : "Preview"}
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={pending || !canImport}
            className="rounded-full bg-primary px-5 py-2.5 font-heading text-sm text-foreground disabled:opacity-40"
          >
            {result != null && canImport
              ? `Import ${result.summary.ok} valid ${result.summary.ok === 1 ? "gig" : "gigs"}`
              : "Import"}
          </button>
          <button
            type="button"
            onClick={() => setText(SAMPLE)}
            disabled={pending}
            className="text-xs text-accent underline underline-offset-2"
          >
            Load sample
          </button>
        </div>
      </div>

      {result?.error && (
        <p className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{result.error}</p>
      )}

      {result && !result.error && (
        <div className="rounded-2xl bg-surface p-5">
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            {result.committed ? (
              <span className="font-heading text-foreground">
                Imported {result.summary.created} of {result.summary.total} rows.
              </span>
            ) : (
              <span className="font-heading text-foreground">
                {result.summary.ok} ready · {result.summary.duplicate} duplicate ·{" "}
                {result.summary.invalid} invalid
              </span>
            )}
            {result.committed && result.summary.created > 0 && (
              <Link href="/admin/events" className="text-xs text-accent underline underline-offset-2">
                View events
              </Link>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-muted/20 text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3 font-heading">#</th>
                  <th className="py-2 pr-3 font-heading">Status</th>
                  <th className="py-2 pr-3 font-heading">Title</th>
                  <th className="py-2 pr-3 font-heading">Venue</th>
                  <th className="py-2 pr-3 font-heading">Date</th>
                  <th className="py-2 font-heading">Note</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.line} className="border-b border-muted/10 align-top">
                    <td className="py-2 pr-3 text-muted">{row.line}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-heading ${STATUS_STYLE[row.status]}`}
                      >
                        {STATUS_LABEL[row.status]}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-foreground">{row.title || <em className="text-muted">—</em>}</td>
                    <td className="py-2 pr-3 text-muted">{row.venue || "—"}</td>
                    <td className="py-2 pr-3 text-muted">{row.date || "—"}</td>
                    <td className="py-2 text-xs text-muted">{row.reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
