import Link from "next/link";
import { auth, signOut } from "@/platform/auth/config";
import { manifests } from "@/systems";
import { createSystemRegistry } from "@/systems/registry";

const registry = createSystemRegistry(manifests);

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="flex min-h-screen">
      <nav className="w-64 border-r bg-gray-50 p-4">
        <Link href="/dashboard" className="block text-xl font-bold mb-8">
          Polaris
        </Link>

        <div className="space-y-1">
          <Link
            href="/dashboard"
            className="block rounded px-3 py-2 text-sm hover:bg-gray-200"
          >
            Dashboard
          </Link>

          {registry.navItems().map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded px-3 py-2 text-sm hover:bg-gray-200"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="mt-auto pt-8 border-t">
          <Link
            href="/settings"
            className="block rounded px-3 py-2 text-sm hover:bg-gray-200"
          >
            Settings
          </Link>
          {session?.user && (
            <div className="px-3 py-2 text-xs text-gray-500">
              {session.user.email}
            </div>
          )}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/auth/signin" });
            }}
          >
            <button
              type="submit"
              className="block w-full text-left rounded px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>

      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
