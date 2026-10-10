"use client";

import { useCallback, useEffect, useState, type SetStateAction } from "react";
import { api, ApiClientError } from "../http/client";

type Snapshot<T> = { key: string | null; data: T | null; error: ApiClientError | null };

/**
 * Loads a GET endpoint; pass null to skip. Loading is derived from whether the latest response
 * matches the current request, so state only changes in async callbacks. Previous data stays
 * visible while a new request is in flight.
 */
export function useApi<T>(path: string | null) {
  const [version, setVersion] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({ key: null, data: null, error: null });
  const key = path ? `${version}:${path}` : null;

  useEffect(() => {
    if (!path || !key) return;
    const controller = new AbortController();
    api<T>(path, { signal: controller.signal })
      .then((result) => setSnapshot({ key, data: result.data, error: null }))
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        const error = caught instanceof ApiClientError ? caught : new ApiClientError("", 0);
        setSnapshot((previous) => ({ key, data: previous.data, error }));
      });
    return () => controller.abort();
  }, [path, key]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  const setData = useCallback(
    (update: SetStateAction<T | null>) =>
      setSnapshot((previous) => ({
        ...previous,
        data: typeof update === "function" ? (update as (current: T | null) => T | null)(previous.data) : update,
      })),
    [],
  );

  return {
    data: snapshot.data,
    setData,
    error: snapshot.key === key ? snapshot.error : null,
    loading: key !== null && snapshot.key !== key,
    reload,
  };
}
