import { AppShell, Stack } from "@mantine/core";
import { useStore } from "@nanostores/react";
import layoutStore from "@/src/stores/layout";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import classes from "./MantineMain.module.css"

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
      <AppShell header={{ height: headerHeight }} className={classes.app} >
        <AppShell.Main display={"flex"}>
          {isStacked ? (
              <Stack gap="xl" style={{ width: "100%"}} justify="space-between">{children}</Stack>
          ) : children}
        </AppShell.Main>
      </AppShell>
    </CustomMantineProvider>
  );
}
