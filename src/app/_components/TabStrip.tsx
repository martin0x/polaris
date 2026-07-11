"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export interface TabItem {
  label: string;
  href: string;
  /** Match only the exact path — for index tabs like /journal that would
   *  otherwise claim every sibling route as a prefix. */
  exact?: boolean;
}

/** Sub-nav tab strip shared by the systems. The longest matching prefix wins
 *  so detail routes highlight their parent tab (/expenses/abc → Activities)
 *  while sibling tabs keep their own (/expenses/trends → Trends). */
export function TabStrip({
  items,
  label,
  children,
}: {
  items: TabItem[];
  label: string;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = items.reduce<TabItem | null>((best, item) => {
    const matches = item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");
    if (!matches) return best;
    return !best || item.href.length > best.href.length ? item : best;
  }, null);

  return (
    <nav className="tab-strip" aria-label={label}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={active === item ? "active" : undefined}
          aria-current={active === item ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
      {children}
    </nav>
  );
}
