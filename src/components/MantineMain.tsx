import { AppShell, Container, MantineProvider, Stack } from "@mantine/core";
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
        <AppShell.Main>
          <Container size="xl">
            <Stack gap="xl">{children}</Stack>
          </Container>
        </AppShell.Main>
      </AppShell>
    </MantineProvider>
  );
}
