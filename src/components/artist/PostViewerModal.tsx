"use client";

import Image from "next/image";
import { ContentPost } from "@/lib/types";
import { useT } from "@/lib/i18n/LocaleProvider";
import { useDragToDismiss } from "@/components/ui/useDragToDismiss";
import { streamIframeUrl } from "@/lib/cloudflare-stream";

// #184: tap one of your own posts to actually view/play it, instead of a dead
// 56px thumbnail. A Cloudflare Stream video (#138) plays in Stream's self-
// contained iframe player (HLS + controls, no hls.js needed for a one-off);
// a legacy Supabase video plays in a native <video controls>; an image shows
// full-size. Read-only viewer — deletion still lives on the list row.
export default function PostViewerModal({
  post,
  onClose,
}: {
  post: ContentPost;
  onClose: () => void;
}) {
  const { t } = useT();
  const { handleProps, sheetStyle } = useDragToDismiss(onClose);

  const streamUid = post.mediaType === "video" ? post.streamUid ?? null : null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 lg:items-center lg:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-4 pb-8 lg:rounded-3xl lg:pb-4 lg:shadow-2xl"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          {...handleProps}
          className="mx-auto -mt-1 mb-2 flex w-full justify-center pb-2 pt-2 lg:hidden"
        >
          <div className="h-1 w-10 rounded-full bg-muted/30" />
        </div>

        <div className="flex justify-end lg:mb-1">
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-muted transition-colors hover:bg-primary hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl bg-background">
          {post.mediaType === "video" ? (
            streamUid ? (
              <div className="relative mx-auto aspect-[9/16] max-h-[70vh] w-full">
                <iframe
                  src={streamIframeUrl(streamUid)}
                  title={post.caption || t("manageShow.tabContent")}
                  allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
                  allowFullScreen
                  className="absolute inset-0 h-full w-full border-0"
                />
              </div>
            ) : (
              <video
                src={post.videoUrl}
                controls
                autoPlay
                playsInline
                className="mx-auto max-h-[70vh] w-full object-contain"
              />
            )
          ) : (
            <div className="relative mx-auto aspect-[3/4] max-h-[70vh] w-full">
              <Image
                src={post.image}
                alt={post.caption || ""}
                fill
                sizes="(max-width: 448px) 100vw, 448px"
                className="object-contain"
              />
            </div>
          )}
        </div>

        {post.caption && (
          <p className="mt-3 text-sm text-foreground">{post.caption}</p>
        )}
      </div>
    </div>
  );
}
