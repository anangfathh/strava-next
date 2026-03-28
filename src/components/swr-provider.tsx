"use client";

import { SWRConfig } from "swr";

type SWRProviderProps = {
  children: React.ReactNode;
};

async function jsonFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json()) as T | { error?: string; message?: string };

  if (!response.ok) {
    const err = payload as { error?: string; message?: string };
    throw new Error(err.error ?? err.message ?? `Request failed (${response.status})`);
  }

  return payload as T;
}

export function SwrProvider({ children }: SWRProviderProps) {
  return (
    <SWRConfig
      value={{
        fetcher: jsonFetcher,
        revalidateOnFocus: false,
        revalidateOnReconnect: true,
        dedupingInterval: 60_000,
        focusThrottleInterval: 60_000,
        shouldRetryOnError: false,
        keepPreviousData: true,
      }}
    >
      {children}
    </SWRConfig>
  );
}
