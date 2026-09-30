import { DROP_VIDEO_TYPES } from "@/lib/constants";

// A button (or big drop zone) that picks a Drop video from the phone or
// computer, or records one with the camera.
export function VideoPicker({
  label,
  capture = false,
  small = false,
  disabled,
  onFile,
}: {
  label: string;
  capture?: boolean;
  small?: boolean;
  disabled: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label
      className={
        small
          ? "btn-ghost cursor-pointer px-3 py-1.5"
          : `flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center hover:border-accent ${
              capture ? "pointer-fine:hidden" : ""
            }`
      }
    >
      {!small && (
        <span className="text-2xl" aria-hidden>
          {capture ? "●" : "▶"}
        </span>
      )}
      <span className={small ? "" : "font-semibold"}>{label}</span>
      {!small && (
        <span className="text-xs text-muted">{capture ? "Use your camera" : "From your phone or computer"}</span>
      )}
      <input
        type="file"
        accept={capture ? "video/*" : DROP_VIDEO_TYPES.join(",")}
        capture={capture ? "environment" : undefined}
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onFile(file);
        }}
        className="sr-only"
        aria-label={capture ? "Record a video" : "Drop video"}
      />
    </label>
  );
}
