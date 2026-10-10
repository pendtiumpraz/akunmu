"use client";

import { useEffect, useRef } from "react";

/** Ref that always holds the latest value, for callbacks used inside long-lived effects. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
