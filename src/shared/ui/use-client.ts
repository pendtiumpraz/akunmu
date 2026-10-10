"use client";

import { useSyncExternalStore } from "react";

const subscribeNothing = () => () => undefined;

/** True after hydration; false during server rendering. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

/** The page origin (https://host) in the browser, an empty string on the server. */
export function useOrigin(): string {
  return useSyncExternalStore(
    subscribeNothing,
    () => window.location.origin,
    () => "",
  );
}
