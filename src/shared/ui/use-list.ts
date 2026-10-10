"use client";

import { useEffect, useState } from "react";
import type { Paginated } from "../http/client";
import { useApi } from "./use-api";

/** Paginated list with debounced search and a trash view (GET …/trashed). */
export function useList<T>(listPath: string, trashPath: string, filters: Record<string, string | undefined> = {}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [trashed, setTrashed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = new URLSearchParams({ page: String(page), per_page: "20" });
  if (debounced) query.set("search", debounced);
  for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
  const base = trashed ? trashPath : listPath;
  const separator = base.includes("?") ? "&" : "?";
  const result = useApi<Paginated<T>>(`${base}${separator}${query.toString()}`);

  return {
    ...result,
    page,
    setPage,
    search,
    setSearch,
    trashed,
    toggleTrash: () => {
      setTrashed((value) => !value);
      setPage(1);
    },
  };
}
