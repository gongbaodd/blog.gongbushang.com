import { Container, Title, Text, Button, Group, Stack, Center } from "@mantine/core";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";

// Inline copies of Tabler's home / arrow-left icons: apps/web has no @tabler/icons-react dependency.
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const IconHome = () => (
  <Icon>
    <path d="M5 12l-2 0l9 -9l9 9l-2 0" />
    <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7" />
    <path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6" />
  </Icon>
);

const IconArrowLeft = () => (
  <Icon>
    <path d="M5 12l14 0" />
    <path d="M5 12l6 6" />
    <path d="M5 12l6 -6" />
  </Icon>
);

export default function NotFoundPage() {
  return (
    <CustomMantineProvider>
      <Container size="md" style={{ alignSelf: "center" }}>
        <Center>
          <Stack align="center" gap="xl">
            <div style={{ textAlign: "center" }}>
              <Title
                order={1}
                size="8rem"
                fw={900}
                style={{
                  background: "linear-gradient(45deg, #228be6, #15aabf)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  lineHeight: 1,
                  marginBottom: "1rem",
                }}
              >
                404
              </Title>

              <Title order={2} size="2rem" fw={600} mb="md" c="dimmed">
                Page Not Found
              </Title>

              <Text size="lg" c="dimmed" maw={500} mx="auto" mb="xl">
                The page you're looking for doesn't exist. It might have been moved, deleted, or you
                entered the wrong URL.
              </Text>
            </div>

            <Group gap="md">
              <Button
                component="a"
                href="/"
                leftSection={<IconHome />}
                size="md"
                variant="filled"
              >
                Go Home
              </Button>

              <Button
                onClick={() => window.history.back()}
                leftSection={<IconArrowLeft />}
                size="md"
                variant="outline"
              >
                Go Back
              </Button>
            </Group>
          </Stack>
        </Center>
      </Container>
    </CustomMantineProvider>
  );
}
