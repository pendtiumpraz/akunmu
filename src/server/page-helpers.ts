import { notFound } from "next/navigation";
import { AppError } from "@/shared/http/errors";

/** Runs a service call for a page and turns a 404 AppError into Next's not-found page. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof AppError && error.status === 404) notFound();
    throw error;
  }
}
