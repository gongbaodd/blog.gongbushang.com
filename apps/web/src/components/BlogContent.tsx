import { useEffect, type ReactNode } from "react";
import { Paper, Title, Text, Group, Avatar, Badge, Divider, Stack, Anchor, Card } from "@mantine/core";
import { Calendar, Clock, List, Tag, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { useStore } from "@nanostores/react";
import { useMediaQuery } from "@mantine/hooks";
import { Carousel } from "../carousel/BlogCarousel";
import { $isLoading, $relates, request } from "@/src/stores/relates";
import classes from "./BlogContent.module.css";

export interface ILink {
	label: string;
	href: string;
}

export interface IHeading {
	depth: number;
	slug: string;
	text: string;
}

interface IContentProps {
	children: ReactNode;
	title: string;
	links: ILink[];
	/** `YYYY-MM-DD` (timezone-free). */
	date: string;
	time: string;
}

export default function BlogContent({ children, title, links, date, time }: IContentProps) {
	return (
		<CustomMantineProvider>
			<Paper shadow="md" radius="lg" p="xl">
				<Stack gap="xl">
					<Stack gap="lg">
						<Group mb="sm">
							{links.map(({ label, href }) => (
								<Anchor href={href} key={href}>
									<Badge variant="outline">{label}</Badge>
								</Anchor>
							))}
						</Group>
						<Group className="prose lg:prose-xl" visibleFrom="md">
							<h1>{title}</h1>
						</Group>
					</Stack>

					<Group justify="space-between" mt={24}>
						<Group>
							<Avatar src="/profile.jpg" size="lg" radius="xl" />
							<div>
								<Text>J.Gong</Text>
								<Group gap="xs">
									<Group gap={4}>
										<Calendar size={14} />
										<Text size="sm" c="dimmed">
											{date}
										</Text>
									</Group>
									<Group gap={4}>
										<Clock size={14} />
										<Text size="sm" c="dimmed">
											{time}
										</Text>
									</Group>
								</Group>
							</div>
						</Group>
					</Group>

					<Divider />
					<Stack className={"prose lg:prose-xl " + classes.content}>{children}</Stack>
				</Stack>
			</Paper>
		</CustomMantineProvider>
	);
}

export interface IMenuSeries {
	name: string;
	href: string;
	number?: number;
	total: number;
	prev?: { title: string; href: string };
	next?: { title: string; href: string };
}

export interface IMenuPost {
	title: string;
	date: string;
	cover?: { url: string; alt: string };
}

/** Left column: cover card, series nav, headings (TOC), tags. Simplified PostCard (PORT-3 ports the full card). */
export function BlogMenu({
	headings,
	links,
	post,
	series,
}: {
	post: IMenuPost;
	headings: IHeading[];
	links: ILink[];
	series?: IMenuSeries;
}) {
	return (
		<CustomMantineProvider>
			<Stack gap="xl" maw={300} mx={{ base: "auto", lg: 0 }} style={{ position: "sticky", top: 100 }}>
				<Card shadow="md" radius="lg" p={0}>
					{post.cover && (
						<Card.Section>
							<img
								src={post.cover.url}
								alt={post.cover.alt}
								style={{ display: "block", width: "100%", height: 160, objectFit: "cover" }}
							/>
						</Card.Section>
					)}
					<Stack gap="xs" p="lg">
						<Title order={4}>{post.title}</Title>
						<Group gap={4}>
							<Calendar size={14} />
							<Text size="sm" c="dimmed">
								{post.date}
							</Text>
						</Group>
					</Stack>
				</Card>

				{series && (
					<Card shadow="md" radius="lg" p="lg" data-series-nav>
						<Group mb="sm" gap="xs">
							<List size={20} />
							<Anchor href={series.href}>
								<Title order={4}>{series.name}</Title>
							</Anchor>
						</Group>
						{series.number != null && (
							<Text size="sm" c="dimmed" mb="sm">
								#{series.number} / {series.total}
							</Text>
						)}
						<Stack gap="xs">
							{series.prev && (
								<Group gap={4} wrap="nowrap">
									<ChevronLeft size={16} />
									<Anchor href={series.prev.href} size="sm" lineClamp={2}>
										{series.prev.title}
									</Anchor>
								</Group>
							)}
							{series.next && (
								<Group gap={4} wrap="nowrap">
									<ChevronRight size={16} />
									<Anchor href={series.next.href} size="sm" lineClamp={2}>
										{series.next.title}
									</Anchor>
								</Group>
							)}
						</Stack>
					</Card>
				)}

				<Card shadow="md" radius="lg" p="lg" visibleFrom="lg">
					<Group mb="lg">
						<List size={20} />
						<Title order={4}>Headings</Title>
					</Group>
					<Stack gap="lg">
						{headings.map((heading) => (
							<Anchor
								key={heading.slug}
								href={`#${heading.slug}`}
								style={{ whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}
							>
								{heading.text}
							</Anchor>
						))}
					</Stack>
				</Card>

				<Card shadow="md" radius="lg" p="lg" visibleFrom="lg">
					<Title order={4} mb="lg">
						Tags
					</Title>
					<Group gap="xs">
						{links.map(({ label, href }) => (
							<Anchor key={href} href={href}>
								<Badge
									variant="light"
									style={{ cursor: "pointer" }}
									leftSection={href.startsWith("/world/") ? <MapPin size={12} /> : <Tag size={12} />}
								>
									{label}
								</Badge>
							</Anchor>
						))}
					</Group>
				</Card>
			</Stack>
		</CustomMantineProvider>
	);
}

export function RelatePosts({ id }: { id: string }) {
	const relates = useStore($relates);
	const isLoading = useStore($isLoading);
	const isDesktop = useMediaQuery("(min-width: 75em)") ?? false;

	useEffect(() => {
		request(id);
	}, [id]);

	// TODO PORT-7: track("related_post_clicked", { from_slug, to_slug, rank }) via a delegated click handler.
	return (
		<CustomMantineProvider>
			<Paper
				shadow="md"
				className={classes.relates}
				radius="lg"
				p="lg"
				mt={isDesktop ? 0 : "xl"}
				style={isLoading ? { opacity: 0 } : {}}
			>
				<Stack gap="md">
					<Title order={2} size="h3">
						More to discover
					</Title>
					<Carousel
						posts={relates}
						vertical={isDesktop}
						height={isDesktop ? "calc(100dvh - 90px - 2 * var(--mantine-spacing-lg) - 2.5rem - var(--mantine-spacing-md))" : 560}
					/>
				</Stack>
			</Paper>
		</CustomMantineProvider>
	);
}
