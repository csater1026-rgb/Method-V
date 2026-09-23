export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

export const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
export const fail = (error: string): Result<never> => ({ ok: false, error });

// Messages raised by the database's own functions are written for people;
// anything else (permissions, constraint names) isn't.
export function friendly(message: string | undefined, fallback: string): string {
  return message && !/permission|violates|function|column|relation|JWT/i.test(message) ? message : fallback;
}
