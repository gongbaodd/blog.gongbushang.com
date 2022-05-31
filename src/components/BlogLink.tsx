import React, { FC } from "react";
import { Link } from "gatsby";
import { sanitize } from "../utils/sanitize";
import {
  ChatMessage,
  BookmarkIcon,
  ArrowRightIcon,
  Button,
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
    <ChatMessage
      author={title}
      content={excerpt}
      timestamp={date}
      reactionGroup={[
        {
          key: category,
          content: <Link to={`/categories/${category}`}>category</Link>,
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
  );
};

export default BlogLink;
