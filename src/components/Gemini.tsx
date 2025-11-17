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
  Title,
  Tooltip,
} from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import {
  IconBolt,
  IconHistory,
  IconSend,
  IconSparkles,
  IconWand,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { useEffect, type FormEvent } from "react";
import { useMemo, useRef, useState } from "react";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import { requestModel, requestRecords } from "../stores/gemini";

dayjs.extend(relativeTime);

type ChatRole = "user" | "assistant";

type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
};

type ToneMode = "precise" | "balanced" | "creative";

const MODELS = [
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro" },
  { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash" },
];

const QUICK_START = [
  "Summarize this week's AI news in three concise bullets.",
  "Outline a launch plan for a niche developer tool targeting indie hackers.",
  "Help me brainstorm a playful blog intro about wearable tech in Tallinn.",
  "Turn these notes into a punchy LinkedIn update about remote work rituals.",
];

const TONE_DESCRIPTION: Record<ToneMode, string> = {
  precise: "Optimized for accuracy & short, direct answers.",
  balanced: "Default tone with a mix of reasoning and creativity.",
  creative: "Adds storytelling flair and more speculative ideas.",
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

async function synthesizeResponse({
  prompt,
  model,
  tone,
  temperature,
}: {
  prompt: string;
  model: string;
  tone: ToneMode;
  temperature: number;
}) {
  const waitTime = 600 + Math.random() * 900;
  await new Promise((resolve) => setTimeout(resolve, waitTime));

  const toneHints: Record<ToneMode, string> = {
    precise: "structured takeaways and concrete next steps",
    balanced: "succinct context, reasoning, and a clear recommendation",
    creative: "imaginative ideas, narrative framing, and playful wording",
  };

  const bullets = [
    "Key insight → highlight the most actionable learning.",
    "Signal → mention the impact or opportunity window.",
    "Next move → propose a specific experiment to run.",
  ];

  return [
    `Here is a ${toneHints[tone]} for “${prompt}” using ${model}:`,
    "",
    `• ${bullets[0]}`,
    `• ${bullets[1]}`,
    `• ${bullets[2]}`,
    "",
    `Temperature set to ${temperature.toFixed(1)} so feel free to tweak the slider for a different vibe.`,
  ].join("\n");
}

export default function Gemini() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(MODELS[0].value);
  const [temperature, setTemperature] = useState(0.6);
  const [tone, setTone] = useState<ToneMode>("balanced");
  const [isThinking, setIsThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const isMobile = useMediaQuery("(max-width: 48em)");

  const userTurns = useMemo(() => messages.filter((m) => m.role === "user").length, [messages]);


  useEffect(() => {
    requestModel();
    requestRecords();
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

    try {
      const reply = await synthesizeResponse({ prompt: nextPrompt, model, tone, temperature });
      const assistantMessage: ChatMessage = {
        id: createId(),
        role: "assistant",
        content: reply,
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (responseError) {
      setError(
        responseError instanceof Error
          ? responseError.message
          : "Gemini could not complete that request. Try again.",
      );
    } finally {
      setIsThinking(false);
      setTimeout(scrollToBottom, 50);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void handleSend();
  };

  return (
    <CustomMantineProvider>
    <Container size="xl" py="xl">
      <Stack gap="xl">
        <Card withBorder padding="lg" radius="lg" shadow="sm">
          <Group justify="space-between" align="flex-start">
            <div>
              <Badge
                size="lg"
                color="blue"
                leftSection={<IconSparkles size={16} />}
                variant="light"
              >
                Gemini Studio
              </Badge>
              <Title order={2} mt="sm">
                Conversational AI built with Mantine
              </Title>
              <Text c="dimmed">
                Prototype and iterate on prompts directly on the blog. No API wiring required—this
                interface simulates Gemini’s pacing and UX.
              </Text>
            </div>
            <Stack gap={4} align="flex-end">
              <Group gap={6}>
                <IconHistory size={16} />
                <Text size="sm" fw={500}>
                  {userTurns} turn{userTurns === 1 ? "" : "s"}
                </Text>
              </Group>
              <Badge variant="dot" color={isThinking ? "yellow" : "green"}>
                {isThinking ? "Thinking" : "Ready"}
              </Badge>
            </Stack>
          </Group>
        </Card>

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
              <Stack gap="md" style={{ height: isMobile ? undefined : 560 }}>
                <Group justify="space-between">
                  <Group gap="xs">
                    <Avatar radius="xl" color="blue">
                      G
                    </Avatar>
                    <div>
                      <Text fw={600}>Gemini sandbox</Text>
                      <Text size="sm" c="dimmed">
                        Model: {MODELS.find((entry) => entry.value === model)?.label}
                      </Text>
                    </div>
                  </Group>
                  <Tooltip label={TONE_DESCRIPTION[tone]} withinPortal>
                    <Badge variant="light" leftSection={<IconWand size={14} />}>
                      {tone.charAt(0).toUpperCase() + tone.slice(1)}
                    </Badge>
                  </Tooltip>
                </Group>

                <Divider variant="dashed" />

                <ScrollArea
                  style={{ flex: 1 }}
                  viewportRef={viewportRef}
                  h={isMobile ? 360 : 380}
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
                        <Tooltip label="Increase creativity">
                          <ActionIcon
                            variant="subtle"
                            color="violet"
                            radius="lg"
                            onClick={() => setTone("creative")}
                          >
                            <IconSparkles size={18} />
                          </ActionIcon>
                        </Tooltip>
                        <Tooltip label="Tighten answers">
                          <ActionIcon
                            variant="subtle"
                            color="cyan"
                            radius="lg"
                            onClick={() => setTone("precise")}
                          >
                            <IconBolt size={18} />
                          </ActionIcon>
                        </Tooltip>
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