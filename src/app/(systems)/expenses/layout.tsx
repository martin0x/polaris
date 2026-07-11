import { TabStrip } from "@/app/_components/TabStrip";

export default function ExpensesLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TabStrip
        label="Expenses sections"
        items={[
          { label: "Activities", href: "/expenses" },
          { label: "Trends", href: "/expenses/trends" },
          { label: "Types", href: "/expenses/types" },
        ]}
      />
      {children}
    </>
  );
}
