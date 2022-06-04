import React, { FC, useState } from "react";
import { graphql, useStaticQuery } from "gatsby";
import { Box } from "@fluentui/react-northstar";
import useInfiniteScroll from "react-infinite-scroll-hook";
import BlogLink from "../components/BlogLink";

export const pageQuery = graphql`
  query Pages {
    allMarkdownRemark(sort: { fields: fields___date, order: DESC }) {
      edges {
        node {
          id
          excerpt
          fields {
            slug
            date(formatString: "MMMM DD, YYYY")
            title
          }
          frontmatter {
            category
          }
        }
      }
    }
  }
`;

type Query = Queries.PagesQuery;

interface Props {
  // eslint-disable-next-line react/require-default-props
  data?: Query;
}

const Posts: FC<Props> = ({ data }) => {
  const {
    allMarkdownRemark: { edges },
  } = data || useStaticQuery<Query>(pageQuery);

  const [loading, setLoading] = useState(false);
  const [lastCurr, setLastCurr] = useState(1);
  const [items, setItems] = useState(edges.slice(0, lastCurr));
  const [hasNextPage, setHasNextPage] = useState(true);

  const [scrollRef] = useInfiniteScroll({
    loading,
    hasNextPage,
    onLoadMore: () => {
      setLoading(true);
      setLastCurr(lastCurr + 1);
      setItems(edges.slice(0, lastCurr));
      if (lastCurr === edges.length) {
        setHasNextPage(false);
      }
      setLoading(false);
    },
  });

  return (
    <Box
      as="article"
      style={{ padding: "1.2rem 1.2rem 1.2rem 1.2rem" }}
      ref={scrollRef}
    >
      {items.map(({ node }) => {
        const { title, date, slug } = node.fields || {};
        const { category: cate } = node.frontmatter || {};

        return (
          <BlogLink
            slug={slug || ""}
            date={date || ""}
            category={cate || ""}
            title={title || ""}
            key={node.id}
            excerpt={node.excerpt || ""}
          />
        );
      })}
    </Box>
  );
};

export default Posts;
