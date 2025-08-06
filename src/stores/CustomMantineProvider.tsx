import { MantineProvider } from "@mantine/core";

export default function CustomMantineProvider({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider defaultColorScheme="auto">{children}</MantineProvider>
  );
}
