"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SORT_ORDER_KEY, parseSortOrder } from "../lib/sort-preference";

export function SortRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("sort")) return;

    const sort = parseSortOrder(localStorage.getItem(SORT_ORDER_KEY));
    const params = new URLSearchParams(searchParams.toString());
    params.set("sort", sort);
    router.replace(`?${params.toString()}`);
  }, [router, searchParams]);

  return null;
}
