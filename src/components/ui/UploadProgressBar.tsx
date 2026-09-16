// The visual half of #183: a brand progress bar for a video upload in progress,
// shown beneath the posting button in both content-post surfaces (AddContentModal
// and ManageShowModal). The button still carries the "Uploading N%" text; this
// is the bar that fills. Same shape as the sold/capacity bar so the app has one
// progress-bar look. `pct` is 0-100.
export default function UploadProgressBar({ pct }: { pct: number }) {
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-muted/20"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-150 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
