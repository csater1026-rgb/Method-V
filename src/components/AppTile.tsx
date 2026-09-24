import { DropPlaceholder } from "./DropVideo";

// The app's latest Drop poster, or its placeholder tile.
export function AppTile({ name, category, poster, size }: { name: string; category: string; poster: string | null; size: number }) {
  return (
    <span className="media-dark relative block shrink-0 overflow-hidden rounded-lg" style={{ width: size, height: size }}>
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="h-full w-full object-cover" />
      ) : (
        <>
          <DropPlaceholder name={name} category={category} variant="bare" />
          <span aria-hidden className="display absolute inset-0 flex items-center justify-center text-ink" style={{ fontSize: size * 0.5 }}>
            {name.charAt(0)}
          </span>
        </>
      )}
    </span>
  );
}
