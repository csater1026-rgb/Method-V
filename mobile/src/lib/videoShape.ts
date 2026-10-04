import { Image } from "expo-image";
import { useEffect, useState } from "react";

// Whether a Drop is horizontal (16:9), read from its thumbnail. The phone's
// own video size ignores rotation (an upright iPhone recording reads as
// sideways), but thumbnails are saved upright. No thumbnail: treat it as
// vertical, like phone recordings.
export function useIsWide(posterUrl: string | null | undefined): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    if (!posterUrl) return;
    let live = true;
    Image.loadAsync(posterUrl)
      .then((img) => live && setWide(img.width > img.height))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [posterUrl]);
  return wide;
}
