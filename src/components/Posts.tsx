import React, { FC, useState, useEffect } from "react";
import { graphql, useStaticQuery } from "gatsby";
import { Box } from "@fluentui/react-northstar";
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

  const [lastCurr, setLastCurr] = useState(5);
  const [items, setItems] = useState(edges.slice(0, lastCurr));
  const [hasNextPage, setHasNextPage] = useState(lastCurr < edges.length);

  useEffect(() => {
    function scroll() {
      if (hasNextPage) {
        const curr = lastCurr + 5;

        setItems(edges.slice(0, curr));
        setHasNextPage(curr < edges.length);
        setLastCurr(curr);

        window.removeEventListener("scroll", scroll);
        window.removeEventListener("wheel", scroll);
      }
    }
    window.addEventListener("scroll", scroll);
    window.addEventListener("wheel", scroll);
  }, [lastCurr]);

  return (
    <Box as="article" style={{ padding: "1.2rem 1.2rem 1.2rem 1.2rem" }}>
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
