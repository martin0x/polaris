import SignInButton from "./SignInButton";

export default function SignInPage() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: "var(--sp-8)",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        {/* Plain <img> rather than next/image: SVGs don't benefit from Next's
            image optimizer, and the optimizer refuses SVGs without the
            `dangerouslyAllowSVG` opt-in (which we don't want). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/polaris-wordmark.svg"
          alt="Polaris"
          width={240}
          height={56}
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
        <SignInButton />
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
