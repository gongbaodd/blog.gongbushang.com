import React, { FC } from "react";
import { Link } from "gatsby";
import {
  ChatMessage,
  BookmarkIcon,
  ArrowRightIcon,
  Box,
} from "@fluentui/react-northstar";

interface Props {
  date: string;
  category: string | null;
  slug: string;
  title: string;
  excerpt: string;
}

const BlogLink: FC<Props> = ({ date, category, slug, title, excerpt }) => {
  return (
    <Box style={{ paddingBottom: "2.4rem" }}>
      <ChatMessage
        author={title}
        content={excerpt}
        timestamp={date}
        reactionGroup={[
          {
            key: category,
            content: <Link to={`/categories/${category}`}>{category}</Link>,
            icon: <BookmarkIcon />,
          },
        ]}
        badge={{
          icon: (
            <Link to={slug}>
              <ArrowRightIcon />
            </Link>
          ),
        }}
      />
    </Box>
  );
};

export default BlogLink;
