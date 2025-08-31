import { AppShell, LoadingOverlay, Stack } from "@mantine/core";
import { useStore } from "@nanostores/react";
import layoutStore from "@/src/stores/layout";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import classes from "./MantineMain.module.css"
import { useEffect, useState } from "react";

export default function MantineMain({
  children,
  isStacked = true,
}: {
  children: React.ReactNode;
  isStacked?: boolean;
}) {
  const { headerHeight } = useStore(layoutStore)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    function onPrepare() {
      setLoading(true)
    }

    document.addEventListener("astro:before-preparation", onPrepare)

    return () => {
      document.removeEventListener("astro:before-preparation", onPrepare)
    }
  }, [])

  const { className } = {
    get className() {
      if (loading) return [classes.app, classes.loading].join(" ")

      return classes.app
    }
  }

  return (
    <CustomMantineProvider>
      <AppShell header={{ height: headerHeight }} className={className}  >
        <AppShell.Main display={"flex"}>
          {isStacked ? (
            <Stack gap="xl" style={{ width: "100%" }} justify="space-between">{children}</Stack>
          ) : children}

          <LoadingOverlay 
            visible={loading}
            overlayProps={{ radius: 'sm', blur: 2 }}
            loaderProps={{ color: 'blue', type: 'bars' }}
            style={{ position: "fixed" }}
          />
        </AppShell.Main>
      </AppShell>
    </CustomMantineProvider>
  );
}
