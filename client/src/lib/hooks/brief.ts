/* hooks/brief.ts — the stored PR Brief (GET is a pure read; generate is a paid LLM call). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBrief, PrBriefResponse } from "@devdigest/shared";

const key = (prId: string | null | undefined) => ["pr-brief", prId] as const;

/** The stored brief for a PR (null until generated) + whether the PR head moved since. */
export function usePrBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: key(prId),
    queryFn: () => api.get<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** Generate (or refresh) the brief; on success the cache is set directly, on error it is left alone. */
export function useGeneratePrBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBrief>(`/pulls/${prId}/brief`),
    onSuccess: (brief) => {
      qc.setQueryData<PrBriefResponse>(key(prId), { brief, stale: false });
    },
  });
}
