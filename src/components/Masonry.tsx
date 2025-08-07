import React from "react";
import { Box, Container, MantineProvider } from "@mantine/core";
import { Masonry } from "@mui/lab";
import { Card, Text, Badge, Group } from "@mantine/core";
import { Clock, Eye } from "lucide-react";

export interface BlogPost {
  id: number;
  title: string;
  excerpt: string;
  image: string;
  category: string;
  author: string;
  date: string;
  readTime: number;
  views: string;
  type: "vertical" | "horizontal" | "square";
}

export const blogPosts: BlogPost[] = [
  {
    id: 1,
    title: "The Future of Web Design: Embracing Minimalism",
    excerpt:
      "Discover how minimalist design principles are shaping the future of web interfaces and user experiences.",
    image: "https://images.pexels.com/photos/196644/pexels-photo-196644.jpeg",
    category: "Design",
    author: "Sarah Chen",
    date: "Dec 15, 2024",
    readTime: 5,
    views: "2.1k",
    type: "vertical",
  },
  {
    id: 2,
    title: "AI Revolution in Creative Industries",
    excerpt:
      "How artificial intelligence is transforming creative workflows and opening new possibilities for artists and designers.",
    image: "https://images.pexels.com/photos/8386440/pexels-photo-8386440.jpeg",
    category: "Technology",
    author: "Marcus Johnson",
    date: "Dec 14, 2024",
    readTime: 8,
    views: "3.5k",
    type: "horizontal",
  },
  {
    id: 3,
    title: "Sustainable Design Practices",
    excerpt:
      "Exploring eco-friendly approaches to digital design and development.",
    image: "https://images.pexels.com/photos/1647962/pexels-photo-1647962.jpeg",
    category: "Design",
    author: "Emily Rodriguez",
    date: "Dec 13, 2024",
    readTime: 6,
    views: "1.8k",
    type: "square",
  },
  {
    id: 4,
    title: "Mastering Modern CSS Grid Layouts",
    excerpt:
      "Advanced techniques for creating responsive and flexible layouts using CSS Grid.",
    image: "https://images.pexels.com/photos/270404/pexels-photo-270404.jpeg",
    category: "Technology",
    author: "David Kim",
    date: "Dec 12, 2024",
    readTime: 7,
    views: "4.2k",
    type: "vertical",
  },
  {
    id: 5,
    title: "The Art of Typography in Digital Spaces",
    excerpt:
      "Understanding how typography shapes user perception and engagement in digital products.",
    image: "https://images.pexels.com/photos/261763/pexels-photo-261763.jpeg",
    category: "Design",
    author: "Lisa Thompson",
    date: "Dec 11, 2024",
    readTime: 4,
    views: "2.7k",
    type: "square",
  },
  {
    id: 6,
    title: "Building Accessible Web Applications",
    excerpt:
      "A comprehensive guide to creating inclusive digital experiences for all users.",
    image: "https://images.pexels.com/photos/4348401/pexels-photo-4348401.jpeg",
    category: "Technology",
    author: "Alex Rivera",
    date: "Dec 10, 2024",
    readTime: 9,
    views: "5.1k",
    type: "horizontal",
  },
  {
    id: 7,
    title: "Color Theory for Digital Designers",
    excerpt:
      "Mastering the psychology and application of color in digital design projects.",
    image: "https://images.pexels.com/photos/1193743/pexels-photo-1193743.jpeg",
    category: "Design",
    author: "Maya Patel",
    date: "Dec 9, 2024",
    readTime: 5,
    views: "3.2k",
    type: "vertical",
  },
  {
    id: 8,
    title: "Mobile-First Development Strategies",
    excerpt:
      "Best practices for building applications that perform excellently on mobile devices.",
    image: "https://images.pexels.com/photos/887751/pexels-photo-887751.jpeg",
    category: "Technology",
    author: "James Wilson",
    date: "Dec 8, 2024",
    readTime: 6,
    views: "2.9k",
    type: "square",
  },
  {
    id: 9,
    title: "Creative Inspiration from Nature",
    excerpt:
      "How natural patterns and forms can inspire innovative design solutions.",
    image: "https://images.pexels.com/photos/414612/pexels-photo-414612.jpeg",
    category: "Lifestyle",
    author: "Rachel Green",
    date: "Dec 7, 2024",
    readTime: 4,
    views: "1.6k",
    type: "horizontal",
  },
  {
    id: 10,
    title: "The Psychology of User Interface Design",
    excerpt:
      "Understanding how psychological principles influence user behavior and interface effectiveness.",
    image: "https://images.pexels.com/photos/3184306/pexels-photo-3184306.jpeg",
    category: "Design",
    author: "Dr. Michael Brown",
    date: "Dec 6, 2024",
    readTime: 8,
    views: "4.7k",
    type: "vertical",
  },
  {
    id: 11,
    title: "Emerging Frontend Frameworks 2025",
    excerpt:
      "A comprehensive look at the next generation of frontend development tools and frameworks.",
    image: "https://images.pexels.com/photos/574071/pexels-photo-574071.jpeg",
    category: "Technology",
    author: "Anna Kowalski",
    date: "Dec 5, 2024",
    readTime: 7,
    views: "6.3k",
    type: "square",
  },
  {
    id: 12,
    title: "Minimalist Workspace Design",
    excerpt:
      "Creating productive and inspiring work environments through thoughtful minimalist design.",
    image: "https://images.pexels.com/photos/1181406/pexels-photo-1181406.jpeg",
    category: "Lifestyle",
    author: "Tom Anderson",
    date: "Dec 4, 2024",
    readTime: 3,
    views: "2.4k",
    type: "horizontal",
  },
];

const BlogMasonry: React.FC = () => {
  return (
    <MantineProvider>
      <Box style={{ width: '100%', maxWidth: 1200, mx: 'auto' }}>
        <Masonry columns={{ xs: 1, sm: 2, md: 3, lg: 4, xl: 5 }} spacing={3}>
          {blogPosts.map((post) => (
            <BlogCard key={post.id} post={post} />
          ))}
        </Masonry>
      </Box>
    </MantineProvider>
  );
};

export default BlogMasonry;

interface BlogCardProps {
  post: BlogPost;
}

const BlogCard: React.FC<BlogCardProps> = ({ post }) => {
  const getCardClass = () => {
    switch (post.type) {
      case "vertical":
        return "masonry-item-vertical";
      case "horizontal":
        return "masonry-item-horizontal";
      case "square":
        return "masonry-item-square";
      default:
        return "masonry-item-square";
    }
  };

  return (
    <div className={getCardClass()}>
      <Card
        shadow="sm"
        padding="0"
        radius="lg"
        className="h-full overflow-hidden group hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
      >
        <div className="relative overflow-hidden">
          <img
            src={post.image}
            alt={post.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          <Badge
            className="absolute top-3 left-3 z-10"
            variant="filled"
            color={
              post.category === "Design"
                ? "blue"
                : post.category === "Technology"
                ? "green"
                : "orange"
            }
          >
            {post.category}
          </Badge>
        </div>

        <div className="p-4">
          <Text size="lg" fw={600} className="text-gray-900 mb-2 line-clamp-2">
            {post.title}
          </Text>

          <Text size="sm" className="text-gray-600 mb-3 line-clamp-3">
            {post.excerpt}
          </Text>

          <Group
            justify="space-between"
            align="center"
            className="text-gray-500"
          >
            <Group gap="xs">
              <Clock className="w-4 h-4" />
              <Text size="xs">{post.readTime} min read</Text>
            </Group>

            <Group gap="xs">
              <Eye className="w-4 h-4" />
              <Text size="xs">{post.views}</Text>
            </Group>
          </Group>

          <Text size="xs" className="text-gray-400 mt-2">
            {post.author} • {post.date}
          </Text>
        </div>
      </Card>
    </div>
  );
};
