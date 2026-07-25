import { TabStrip } from "@/app/_components/TabStrip";

export default function HabitsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <TabStrip
        label="Habits sections"
        items={[
          { label: "Tracker", href: "/habits", exact: true },
          { label: "Charts", href: "/habits/charts" },
        ]}
      />
      {children}
    </>
  );
}
