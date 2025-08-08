import { AppShell, Container, MantineProvider, Stack } from "@mantine/core";
import { useStore } from "@nanostores/react";
import layoutStore from "../stores/layout";
import CustomMantineProvider from "../stores/CustomMantineProvider";

export default function MantineMain({
  children,
}: {
  children: React.ReactNode;
}) {
  const { headerHeight } = useStore(layoutStore);

  return (
    <CustomMantineProvider>
      <AppShell header={{ height: headerHeight }} padding="md">
        <AppShell.Main>
          <Container fluid>
            <Stack gap="xl">{children}</Stack>
          </Container>
        </AppShell.Main>
      </AppShell>
    </CustomMantineProvider>
  );
}
