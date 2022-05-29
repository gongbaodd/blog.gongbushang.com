import React, { FC } from "react";
import { graphql, useStaticQuery } from "gatsby";
import BlogLink from "../components/BlogLink";

export const pageQuery = graphql`
  query Pages {
    allMarkdownRemark(sort: { fields: fields___date, order: DESC }) {
      edges {
        node {
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
  data?: Query;
}

const Posts: FC<Props> = ({ data }) => {
  const {
    allMarkdownRemark: { edges },
  } = data || useStaticQuery<Query>(pageQuery);

  return (
    <>
      {edges.map(({ node }) => {
        const { title, date, slug } = node.fields || {};
        const { category: cate } = node.frontmatter || {};

        return (
          <BlogLink
            slug={slug || ""}
            date={date || ""}
            category={cate || ""}
            title={title || ""}
            key={slug}
            excerpt={node.excerpt || ""}
          />
        );
      })}
    </>
  );
};

export default Posts;
