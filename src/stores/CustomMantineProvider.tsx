import { useId, useRef } from "react";
import { MantineProvider, type MantineColorScheme } from "@mantine/core";

export default function CustomMantineProvider({
  children,
  theme,
}: {
  children: React.ReactNode;
  theme?: MantineColorScheme;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const islandId = useId().replace(/:/g, "");
  const forced = theme === "light" || theme === "dark" ? theme : undefined;

  if (forced) {
    const selector = `[data-mantine-island="${islandId}"]`;
    return (
      <div ref={rootRef} data-mantine-island={islandId} style={{ width: "100%" }}>
        <MantineProvider
          withGlobalClasses={false}
          forceColorScheme={forced}
          cssVariablesSelector={selector}
          getRootElement={() => rootRef.current ?? undefined}
        >
          {children}
        </MantineProvider>
      </div>
    );
  }

  return <MantineProvider withGlobalClasses={false} defaultColorScheme={theme ?? "auto"}>{children}</MantineProvider>;
}
