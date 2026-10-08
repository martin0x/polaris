import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  Children,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { ImageResponse } from "next/og";
import { iconPaths, type IconName } from "@/app/_components/Icon";
import { HEADLINE, SYSTEMS } from "@/app/_landing/content";

// The social card behind opengraph-image.tsx and twitter-image.tsx — what a
// portfolio, Slack, or iMessage shows when the landing page is shared.

export const SOCIAL_ALT =
  "Polaris — software for one life. A journal, an expense tracker, and a " +
  "habit tracker on one personal platform.";
export const SOCIAL_SIZE = { width: 1200, height: 630 };

// Satori renders outside the browser and can't resolve CSS custom
// properties, so the card carries literal values. They mirror :root in
// globals.css (the source of truth) — change both together.
const T = {
  paper0: "#fefcf7",
  paper1: "#faf7ef",
  paper2: "#f5f0e4",
  paper3: "#ece6d5",
  ink1: "#2e2a23",
  ink2: "#4a4439",
  ink3: "#6b6454",
  ink4: "#9a9281",
  accent: "#3c2ea3",
  heading: "#8a5a3a",
  shadowSm: "0 1px 2px rgba(40, 32, 20, 0.06), 0 1px 0 rgba(40, 32, 20, 0.03)",
};

// Static TTF cuts of the landing page's IBM Plex faces (Satori reads
// ttf/otf/woff, not the woff2 next/font serves). Sources, subsetting, and
// license: fonts/README.md.
const FONT_DIR = join(process.cwd(), "src/app/_og/fonts");

async function font(file: string) {
  return readFile(join(FONT_DIR, file));
}

/** Satori's SVG serializer chokes on fragments, and Icon's paths are
 *  fragment-wrapped — unwrap them into a flat child list. */
function flatten(node: ReactNode): ReactNode[] {
  return Children.toArray(node).flatMap((child) =>
    isValidElement(child) && child.type === Fragment
      ? flatten((child as ReactElement<{ children?: ReactNode }>).props.children)
      : [child],
  );
}

/** The Lucide icon at stroke 1.5, same as Icon — colors are explicit
 *  because there's no CSS cascade to supply currentColor. */
function CardIcon({ name, size, color }: { name: IconName; size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {flatten(iconPaths(name))}
    </svg>
  );
}

export async function renderSocialCard(): Promise<ImageResponse> {
  const [serif, serifMedium, sans, sansSemi, mono] = await Promise.all([
    font("IBMPlexSerif-Regular.ttf"),
    font("IBMPlexSerif-Medium.ttf"),
    font("IBMPlexSans-Regular.ttf"),
    font("IBMPlexSans-SemiBold.ttf"),
    font("IBMPlexMono-Medium.ttf"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "60px 72px 52px",
          background: T.paper0,
          fontFamily: "Plex Sans",
          color: T.ink1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <svg width={36} height={36} viewBox="0 0 64 64">
            <path
              d="M32 4 L34.6 29.4 L60 32 L34.6 34.6 L32 60 L29.4 34.6 L4 32 L29.4 29.4 Z"
              fill={T.accent}
            />
            <circle cx="32" cy="32" r="2.6" fill={T.paper0} />
          </svg>
          <span
            style={{
              fontFamily: "Plex Serif",
              fontWeight: 500,
              fontSize: 32,
              color: T.ink1,
            }}
          >
            Polaris
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: "Plex Mono",
              fontSize: 18,
              color: T.ink4,
            }}
          >
            github.com/martin0x/polaris
          </span>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 56,
          }}
        >
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <span
              style={{
                fontFamily: "Plex Mono",
                fontSize: 17,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: T.ink3,
              }}
            >
              A personal operating system
            </span>
            <span
              style={{
                // Narrower than the column so the break lands at
                // "Software for / one life." instead of orphaning "life."
                maxWidth: 480,
                marginTop: 16,
                fontFamily: "Plex Serif",
                fontWeight: 500,
                fontSize: 80,
                lineHeight: 1.04,
                letterSpacing: "-0.015em",
                color: T.heading,
              }}
            >
              {HEADLINE}
            </span>
            <span
              style={{
                marginTop: 24,
                fontFamily: "Plex Serif",
                fontSize: 29,
                lineHeight: 1.4,
                color: T.ink2,
              }}
            >
              My own productivity systems, built and rebuilt in code I own.
            </span>
          </div>

          <div
            style={{
              width: 404,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {SYSTEMS.map((s) => (
              <div
                key={s.key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: "18px 22px",
                  background: T.paper1,
                  border: `1px solid ${T.paper3}`,
                  borderRadius: 10,
                  boxShadow: T.shadowSm,
                }}
              >
                <div
                  style={{
                    width: 46,
                    height: 46,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 6,
                    background: T.paper2,
                    color: T.ink1,
                  }}
                >
                  <CardIcon name={s.icon} size={24} color={T.ink1} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span
                    style={{ fontWeight: 600, fontSize: 22 }}
                  >
                    {s.name}
                  </span>
                  <span style={{ fontSize: 17, color: T.ink3 }}>{s.short}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <span
          style={{ fontFamily: "Plex Mono", fontSize: 16, color: T.ink4 }}
        >
          One user · built for one life
        </span>
      </div>
    ),
    {
      ...SOCIAL_SIZE,
      fonts: [
        { name: "Plex Serif", data: serif, weight: 400, style: "normal" },
        { name: "Plex Serif", data: serifMedium, weight: 500, style: "normal" },
        { name: "Plex Sans", data: sans, weight: 400, style: "normal" },
        { name: "Plex Sans", data: sansSemi, weight: 600, style: "normal" },
        { name: "Plex Mono", data: mono, weight: 500, style: "normal" },
      ],
    },
  );
}
