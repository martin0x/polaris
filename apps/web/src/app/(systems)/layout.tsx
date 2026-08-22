import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@polaris/backend/convex/_generated/api";
import { SignOutButton } from "@/app/_components/SignOutButton";
import { manifests } from "@/systems";
import { createSystemRegistry } from "@/systems/registry";
import { TitleBar } from "@/app/_components/TitleBar";
import { Sidebar } from "@/app/_components/Sidebar";
import { SidebarProvider, ShellBody } from "@/app/_components/SidebarChrome";
import { type IconName } from "@/app/_components/Icon";
import { SystemCrumb } from "@/app/_components/SystemCrumb";

const registry = createSystemRegistry(manifests);

const FALLBACK_ICON: IconName = "folder";
const ALLOWED_ICONS: IconName[] = [
  "search", "plus", "compass", "calendar", "terminal", "book-open",
  "star", "list", "git-branch", "settings", "clock", "panel-right",
  "more-horizontal", "check", "x", "chevron-down", "chevron-right",
  "folder", "inbox", "hash", "moon", "user", "file-text", "bell",
  "sidebar", "list-todo", "archive", "edit-3", "trash-2", "tag", "command",
  "receipt", "repeat",
];

export default async function SystemsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = await convexAuthNextjsToken();
  const viewer = token
    ? await fetchQuery(api.users.viewer, {}, { token })
    : null;
  const systems = registry.navItems().map((item) => ({
    href: item.href,
    label: item.label,
    icon: (ALLOWED_ICONS.includes(item.icon as IconName)
      ? item.icon
      : FALLBACK_ICON) as IconName,
  }));

  const sidebarFooter = viewer ? (
    <div style={{ marginTop: 4 }}>
      <SignOutButton />
    </div>
  ) : null;

  return (
    <SidebarProvider>
      <div className="app-shell">
        <TitleBar
          crumbs={["Polaris", <SystemCrumb key="system" systems={systems} />]}
          email={viewer?.email}
        />
        <ShellBody>
          <Sidebar systems={systems} footer={sidebarFooter} />
          <main className="main">
            <div className="content">{children}</div>
          </main>
        </ShellBody>
      </div>
    </SidebarProvider>
  );
}
