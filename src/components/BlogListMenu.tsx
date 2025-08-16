import { Anchor, Avatar, Badge, Button, ButtonGroup, Group, Loader, Spoiler, Stack, Text } from "@mantine/core";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import { IconBook, IconFolder, IconTag } from "@tabler/icons-react";
import { Children, useCallback, useState, type MouseEventHandler, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useStore } from "@nanostores/react";
import { $category, $series, $tag, requestAllCategories, requestAllSeries, requestAllTags } from "../stores/links";

interface IMenuProps {
    title: String;
    children: ReactNode;
    loadFunc: Function;
}

function Menu({ title, children, loadFunc }: IMenuProps) {
    const [expanded, setExpanded] = useState(false)
    const [loading, setLoading] = useState(false)
    const load = useCallback(async () => {
        if (!expanded) {
            setLoading(true)
            await loadFunc()
            setLoading(false)
        }
        setExpanded(!expanded)
    }, [expanded])

    return (
        <CustomMantineProvider>
            <Stack gap="xs">
                <Group>
                    <IconFolder size={20} />
                    <Text fw={600} size="lg">{title}</Text>
                </Group>
                <Spoiler
                    expanded={expanded}
                    showLabel={""}
                    hideLabel={""}
                    mb={0}
                >
                    {children}
                </Spoiler>
                <Button c="gray" variant="transparent" style={{ alignSelf: "flex-start" }} p={0} onClick={load}>
                    {loading ? <Loader size="xs" /> : expanded ? <ChevronUp /> : <ChevronDown />}
                </Button>
            </Stack>
        </CustomMantineProvider>
    )
}

export function MenuCategory() {
    const categories = useStore($category)
    return (
        <Menu title={"Category"} loadFunc={requestAllCategories}>
            <Stack>
                {categories.map(({ label, href }) => (
                    <Anchor href={href} key={label}>
                        <Button
                            variant={"default"}
                            color="blue"
                            justify="flex-start"
                            fullWidth
                            size="sm"
                        >
                            {label}
                        </Button>
                    </Anchor>
                ))}
            </Stack>
        </Menu>
    );
}

export function MenuSeries() {
    const series = useStore($series)
    return (
        <Menu title={"Series"} loadFunc={requestAllSeries}>
            <Stack gap="xs">
                {series.map(({ label, href }) => (
                    <Anchor href={href} key={label}>
                        <Button
                            variant={"default"}
                            color="blue"
                            justify="flex-start"
                            fullWidth
                            size="sm"
                        >
                            {label}
                        </Button>
                    </Anchor>
                ))}
            </Stack>
        </Menu>
    );
}

export function MenuTag() {
    const tags = useStore($tag)
    return (
        <Menu title={"Tags"} loadFunc={requestAllTags}>
            <Group gap="xs">
                {tags.map(({ label, href }) => (
                    <Anchor href={href} key={label}>
                        <Badge
                            variant={"outline"}
                            color="green"
                            style={{ cursor: "pointer" }}
                            size="sm"
                        >
                            {label}
                        </Badge>
                    </Anchor>
                ))}
            </Group>
        </Menu>
    );
}

