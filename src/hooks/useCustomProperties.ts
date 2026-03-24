"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CustomProperty, CustomStage } from "@prisma/client";

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error("Request failed");
  return res.json();
}

export function useCustomProperties() {
  return useQuery<CustomProperty[]>({
    queryKey: ["customProperties"],
    queryFn: () => fetchJSON("/api/custom-properties"),
  });
}

export function useCreateCustomProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; type: string; options?: string[] }) =>
      fetchJSON("/api/custom-properties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customProperties"] }),
  });
}

export function useDeleteCustomProperty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJSON(`/api/custom-properties/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customProperties"] }),
  });
}

export function useCustomStages() {
  return useQuery<CustomStage[]>({
    queryKey: ["customStages"],
    queryFn: () => fetchJSON("/api/custom-stages"),
  });
}

export function useCreateCustomStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; color: string }) =>
      fetchJSON("/api/custom-stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customStages"] }),
  });
}

export function useUpdateCustomStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<CustomStage>;
    }) =>
      fetchJSON(`/api/custom-stages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customStages"] }),
  });
}

export function useDeleteCustomStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJSON(`/api/custom-stages/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["customStages"] }),
  });
}
