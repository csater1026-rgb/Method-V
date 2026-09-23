import { useCallback, useEffect, useState } from "react";

// Loads data for a screen, with pull-to-refresh and an error message.
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- callers pass the inputs that matter
  const run = useCallback(load, deps);

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      setData(await run());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setRefreshing(false);
    }
  }, [run]);

  useEffect(() => {
    let live = true;
    run()
      .then((d) => live && (setData(d), setError(null)))
      .catch((e) => live && setError(e instanceof Error ? e.message : "Something went wrong."));
    return () => {
      live = false;
    };
  }, [run]);

  return { data, error, refreshing, reload, setData };
}
