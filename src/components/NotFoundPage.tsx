import { Container, Title, Text, Button, Group, Stack, Center } from '@mantine/core';
import { IconHome, IconArrowLeft } from '@tabler/icons-react';
import CustomMantineProvider from '../stores/CustomMantineProvider';

export default function NotFoundPage() {
    return (
        <CustomMantineProvider>
            <Container size="md" style={{ alignSelf: "center"}}>
                <Center>
                    <Stack align="center" gap="xl">
                        <div style={{ textAlign: 'center' }}>
                            <Title
                                order={1}
                                size="8rem"
                                fw={900}
                                style={{
                                    background: 'linear-gradient(45deg, #228be6, #15aabf)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    backgroundClip: 'text',
                                    lineHeight: 1,
                                    marginBottom: '1rem'
                                }}
                            >
                                404
                            </Title>

                            <Title order={2} size="2rem" fw={600} mb="md" c="dimmed">
                                Page Not Found
                            </Title>

                            <Text size="lg" c="dimmed" maw={500} mx="auto" mb="xl">
                                The page you're looking for doesn't exist. It might have been moved,
                                deleted, or you entered the wrong URL.
                            </Text>
                        </div>

                        <Group gap="md">
                            <Button
                                component="a"
                                href="/"
                                leftSection={<IconHome size={16} />}
                                size="md"
                                variant="filled"
                            >
                                Go Home
                            </Button>

                            <Button
                                onClick={() => window.history.back()}
                                leftSection={<IconArrowLeft size={16} />}
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