"use client";

import { useEffect, useRef, useState } from "react";

// The Drop player on an app's page. The frame takes the video's shape: tall
// for a vertical (9:16) Drop, 16:9 for a horizontal one, so either shows whole
// and fills the frame. Without a video, `children` fill the tall frame.
export function DropFrame({ videoUrl, posterUrl, children }: { videoUrl: string | null; posterUrl: string | null; children?: React.ReactNode }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    // Its size may already be known before the page came alive.
    const v = ref.current;
    if (v && v.readyState >= 1) setWide(v.videoWidth > v.videoHeight);
  }, []);

  return (
    <div className={`media-dark relative ${wide ? "aspect-video" : "aspect-[9/16]"} overflow-hidden rounded-xl border border-line bg-surface`}>
      {videoUrl && (
        <video
          ref={ref}
          src={videoUrl}
          poster={posterUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full bg-black object-contain"
          onLoadedMetadata={(e) => setWide(e.currentTarget.videoWidth > e.currentTarget.videoHeight)}
        />
      )}
      {children}
    </div>
  );
}
