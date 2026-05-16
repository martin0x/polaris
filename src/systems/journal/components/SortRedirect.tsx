"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const STORAGE_KEY = "polaris:journal:sortOrder";

export function SortRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const current = searchParams.get("sort");
    if (current) return;

    const stored = localStorage.getItem(STORAGE_KEY) as "asc" | "desc" | null;
    const sort = stored ?? "desc";

    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", sort);
    router.replace(`?${params.toString()}`);
  }, [router, searchParams]);

  return null;
}
