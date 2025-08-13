import { AppShell, Flex, Stack } from "@mantine/core";
import { useStore } from "@nanostores/react";
import layoutStore from "../stores/layout";
import CustomMantineProvider from "../stores/CustomMantineProvider";

export default function MantineMain({
  children,
  isStacked = true,
}: {
  children: React.ReactNode;
  isStacked?: boolean;
}) {
  const { headerHeight } = useStore(layoutStore);

  return (
    <CustomMantineProvider>
      <AppShell header={{ height: headerHeight }} padding="md">
        <AppShell.Main display={"flex"}>
          {isStacked ? (
              <Stack gap="xl" style={{ width: "100%"}} justify="space-between">{children}</Stack>
          ) : children}
        </AppShell.Main>
      </AppShell>
    </CustomMantineProvider>
  );
}
