import { AppShell, MantineProvider } from "@mantine/core";

export default function MantineMain({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MantineProvider>
      <AppShell header={{ height: 70 }} padding="md">
        <AppShell.Main>{children}</AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}
