// Hands a video picked from the + button over to the Post page without a
// round trip: the + opens the camera/library right away, stores the file here,
// then navigates to /submit, which picks it up. Browser memory only.

let pending: File | null = null;

export function setPendingVideo(file: File) {
  pending = file;
}

export function peekPendingVideo(): File | null {
  return pending;
}

export function clearPendingVideo() {
  pending = null;
}
