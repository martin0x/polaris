import { auth, signOut } from "@/platform/auth/config";
import { manifests } from "@/systems";
import { createSystemRegistry } from "@/systems/registry";
import { TitleBar } from "@/app/_components/TitleBar";
import { Sidebar } from "@/app/_components/Sidebar";
import type { IconName } from "@/app/_components/Icon";

const registry = createSystemRegistry(manifests);

const FALLBACK_ICON: IconName = "folder";
const ALLOWED_ICONS: IconName[] = [
  "search", "plus", "compass", "calendar", "terminal", "book-open",
  "star", "list", "git-branch", "settings", "clock", "panel-right",
  "more-horizontal", "check", "x", "chevron-down", "chevron-right",
  "folder", "inbox", "hash", "moon", "user", "file-text", "bell",
  "sidebar", "list-todo",
];

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const systems = registry.navItems().map((item) => ({
    href: item.href,
    label: item.label,
    icon: (ALLOWED_ICONS.includes(item.icon as IconName)
      ? item.icon
      : FALLBACK_ICON) as IconName,
  }));

  const sidebarFooter = session?.user ? (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/auth/signin" });
      }}
      style={{ marginTop: 4 }}
    >
      <button
        type="submit"
        className="sb-item"
        style={{ width: "100%", color: "var(--danger)" }}
      >
        Sign out
      </button>
    </form>
  ) : null;

  return (
    <div className="app-shell">
      <TitleBar
        crumbs={["Polaris"]}
        syncState="ok"
        email={session?.user?.email}
      />
      <div className="body">
        <Sidebar systems={systems} footer={sidebarFooter} />
        <main className="main">
          <div className="content">{children}</div>
        </main>
      </div>
    </div>
  );
}
