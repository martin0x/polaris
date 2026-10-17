"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";

export function SignOutButton() {
  const { signOut } = useAuthActions();
  const router = useRouter();
  return (
    <button
      type="button"
      className="sb-item"
      style={{ width: "100%", color: "var(--danger)" }}
      aria-label="Sign out"
      title="Sign out"
      onClick={async () => {
        await signOut();
        router.push("/auth/signin");
      }}
    >
      <Icon name="log-out" size={14} />
      <span className="sb-label">Sign out</span>
    </button>
  );
}
