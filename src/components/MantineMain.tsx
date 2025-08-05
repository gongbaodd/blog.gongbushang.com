import { AppShell, MantineProvider } from "@mantine/core";
import { useStore } from "@nanostores/react";
import layoutStore from "../stores/layout";

export default function MantineMain({
  children,
}: {
  children: React.ReactNode;
}) {
  const { headerHeight } = useStore(layoutStore);

  return (
    <MantineProvider>
      <AppShell header={{ height: headerHeight }} padding="md">
        <AppShell.Main>{children}</AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}
