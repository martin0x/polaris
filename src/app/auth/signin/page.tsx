import Image from "next/image";
import { signIn } from "@/platform/auth/config";

export default function SignInPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: "var(--sp-8)",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <Image
          src="/brand/polaris-wordmark.svg"
          alt="Polaris"
          width={240}
          height={56}
          priority
          style={{
            display: "block",
            margin: "0 auto var(--sp-5)",
            height: 56,
            width: "auto",
          }}
        />
        <p
          className="lead"
          style={{
            marginBottom: "var(--sp-8)",
            color: "var(--ink-3)",
          }}
        >
          A personal operating system.
        </p>
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button type="submit" className="btn btn-primary">
            Sign in with Google
          </button>
        </form>
        <p
          className="caption"
          style={{
            marginTop: "var(--sp-6)",
            color: "var(--ink-4)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
          }}
        >
          One user · built for one life
        </p>
      </div>
    </main>
  );
}
