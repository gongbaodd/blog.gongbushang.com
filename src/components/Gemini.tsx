import {
    ActionIcon,
    Avatar,
    Badge,
    Button,
    Card,
    Container,
    Divider,
    Group,
    Loader,
    Paper,
    ScrollArea,
    Stack,
    Text,
    Textarea,
    Tooltip,
} from "@mantine/core";
import {
    IconBolt,
    IconSend,
    IconSparkles,
    IconWand,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useEffect, useRef, type FormEvent } from "react";
import { useState } from "react";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import { createGeminiSession, requestModel, requestRecords } from "../stores/gemini";

dayjs.extend(relativeTime);

type ChatRole = "user" | "assistant";

type ChatMessage = {
    id: string;
    role: ChatRole;
    content: string;
    createdAt: number;
};

const createId = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

const initialMessages: ChatMessage[] = [
    {
        id: "welcome",
        role: "assistant",
        content:
            "Hi! I’m Gemini running inside this Mantine playground. Drop a prompt or pick a quick template to see how the interface responds.",
        createdAt: Date.now() - 1000 * 60,
    },
];

export default function Gemini() {
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
    const [input, setInput] = useState("");
    const [isThinking, setIsThinking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const viewportRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        requestModel();
        requestRecords();
        createGeminiSession();
    }, []);

    const scrollToBottom = () => {
        const node = viewportRef.current;
        if (!node) return;
        node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
    };

    const handleSend = async (preset?: string) => {
        const nextPrompt = (preset ?? input).trim();
        if (!nextPrompt || isThinking) {
            return;
        }

        const userMessage: ChatMessage = {
            id: createId(),
            role: "user",
            content: nextPrompt,
            createdAt: Date.now(),
        };

        setMessages((prev) => [...prev, userMessage]);
        if (!preset) {
            setInput("");
        }
        setIsThinking(true);
        setError(null);

        setIsThinking(false);
        setTimeout(scrollToBottom, 50);
    };

    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        void handleSend();
    };

    return (
        <CustomMantineProvider>
            <Container size="xl" py="xl">
                <Stack gap="xl">
                    <Stack gap="xl">
                        <Group
                            align="flex-start"
                            gap="xl"
                            wrap="wrap"
                            justify="space-between"
                            style={{ width: "100%" }}
                        >
                            <Card
                                withBorder
                                padding="lg"
                                radius="lg"
                                shadow="sm"
                                style={{ flex: "1 1 480px" }}
                            >
                                <Stack gap="md" style={{ height: 560 }}>
                                    <Group justify="space-between">
                                        <Group gap="xs">
                                            <Avatar radius="xl" color="blue">
                                                G
                                            </Avatar>
                                            <div>
                                                <Text fw={600}>Gemini sandbox</Text>
                                            </div>
                                        </Group>
                                    </Group>

                                    <Divider variant="dashed" />

                                    <ScrollArea
                                        style={{ flex: 1 }}
                                        viewportRef={viewportRef}
                                        h={380}
                                        type="auto"
                                        scrollbarSize={6}
                                        offsetScrollbars
                                    >
                                        <Stack gap="md" pr="sm">
                                            {messages.map((message) => {
                                                const isUser = message.role === "user";

                                                return (
                                                    <Group
                                                        key={message.id}
                                                        align="flex-start"
                                                        justify={isUser ? "flex-end" : "flex-start"}
                                                        gap="sm"
                                                    >
                                                        {!isUser && (
                                                            <Avatar radius="xl" color="blue" variant="filled">
                                                                G
                                                            </Avatar>
                                                        )}

                                                        <Paper
                                                            p="md"
                                                            radius="lg"
                                                            withBorder
                                                            bg={
                                                                isUser
                                                                    ? "var(--mantine-color-blue-0)"
                                                                    : "var(--mantine-color-gray-0)"
                                                            }
                                                            style={{ maxWidth: "82%" }}
                                                        >
                                                            <Stack gap={4}>
                                                                <Group gap={6}>
                                                                    <Text fw={600} size="sm">
                                                                        {isUser ? "You" : "Gemini"}
                                                                    </Text>
                                                                    <Text size="xs" c="dimmed">
                                                                        {dayjs(message.createdAt).fromNow()}
                                                                    </Text>
                                                                </Group>
                                                                <Text size="sm" style={{ whiteSpace: "pre-wrap" }}>
                                                                    {message.content}
                                                                </Text>
                                                            </Stack>
                                                        </Paper>

                                                        {isUser && (
                                                            <Avatar radius="xl" color="gray" variant="light">
                                                                You
                                                            </Avatar>
                                                        )}
                                                    </Group>
                                                );
                                            })}

                                            {isThinking && (
                                                <Group align="flex-start" gap="sm">
                                                    <Avatar radius="xl" color="blue">
                                                        G
                                                    </Avatar>
                                                    <Paper p="md" radius="lg" withBorder style={{ maxWidth: "78%" }}>
                                                        <Group gap="sm">
                                                            <Loader size="xs" color="blue" />
                                                            <Text size="sm" c="dimmed">
                                                                Gemini is drafting a reply…
                                                            </Text>
                                                        </Group>
                                                    </Paper>
                                                </Group>
                                            )}
                                        </Stack>
                                    </ScrollArea>

                                    {error && (
                                        <Text size="sm" c="red">
                                            {error}
                                        </Text>
                                    )}

                                    <form onSubmit={handleSubmit}>
                                        <Stack gap="xs">
                                            <Textarea
                                                aria-label="Prompt"
                                                placeholder="Ask Gemini anything…"
                                                value={input}
                                                minRows={3}
                                                autosize
                                                onChange={(event) => setInput(event.currentTarget.value)}
                                                onKeyDown={(event) => {
                                                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                                                        event.preventDefault();
                                                        void handleSend();
                                                    }
                                                }}
                                            />
                                            <Group justify="space-between">
                                                <Group gap="xs">
                                                </Group>
                                                <Button
                                                    type="submit"
                                                    rightSection={<IconSend size={16} />}
                                                    disabled={!input.trim() || isThinking}
                                                >
                                                    Send
                                                </Button>
                                            </Group>
                                        </Stack>
                                    </form>
                                </Stack>
                            </Card>
                        </Group>
                    </Stack>
                </Stack>
            </Container>
        </CustomMantineProvider>
    );
}