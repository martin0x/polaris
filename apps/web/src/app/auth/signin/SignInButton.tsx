"use client";

import { useAuthActions } from "@convex-dev/auth/react";

export default function SignInButton() {
  const { signIn } = useAuthActions();
  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={() => void signIn("google", { redirectTo: "/" })}
    >
      Sign in with Google
    </button>
  );
}
