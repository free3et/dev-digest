/* hooks/conventions.ts — React Query hooks for the Conventions Extractor page. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConventionCandidate,
  ConventionExtractResult,
  ConventionSkillDraft,
  ConventionUpdate,
} from "@devdigest/shared";
import { api } from "../api";

export function conventionsKey(repoId: string) {
  return ["conventions", repoId] as const;
}

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: conventionsKey(repoId ?? ""),
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ConventionExtractResult>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => qc.setQueryData(conventionsKey(repoId), data.candidates),
  });
}

export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ConventionUpdate }) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (row) => {
      qc.setQueryData<ConventionCandidate[]>(conventionsKey(repoId), (prev) =>
        (prev ?? []).map((c) => (c.id === row.id ? row : c)),
      );
    },
  });
}

export function useRejectConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<void>(`/conventions/${id}`),
    onSuccess: (_d, id) => {
      qc.setQueryData<ConventionCandidate[]>(conventionsKey(repoId), (prev) =>
        (prev ?? []).filter((c) => c.id !== id),
      );
    },
  });
}

export function useConventionSkillDraft(repoId: string) {
  return useMutation({
    mutationFn: () => api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill`),
  });
}
