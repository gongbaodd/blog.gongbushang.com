import { MantineProvider, type MantineColorScheme } from "@mantine/core";

export default function CustomMantineProvider({ children, theme }: { 
  children: React.ReactNode,
  theme?: MantineColorScheme
}) {
  return (
    <MantineProvider defaultColorScheme={theme ?? "auto"}>{children}</MantineProvider>
  );
}
