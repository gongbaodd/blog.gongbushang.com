import React, { FC } from "react";
import { PageProps, graphql } from "gatsby";
import { Flex, FlexItem, Box } from "@fluentui/react-northstar";

import Layout from "../components/Layout";
import SEO from "../components/seo";
import Bio from "../components/bio";
import Posts from "../components/Posts";
import GroupLinks from "../components/GroupLinks";

export const pageQuery = graphql`
  query BlogPostsByTags($tag: String!) {
    allMarkdownRemark(
      filter: { fields: { tag: { in: [$tag] } } }
      sort: { fields: fields___date, order: DESC }
    ) {
      edges {
        node {
          excerpt
          fields {
            slug
            date(formatString: "MMMM DD, YYYY")
            title
            tag
          }
          frontmatter {
            category
          }
        }
      }
    }
  }
`;

type PageData = Queries.BlogPostsByTagsQuery;

export interface PageContext {
  tag: string;
}

const CategoryTemplate: FC<PageProps<PageData, PageContext>> = ({
  pageContext: { tag },
  data,
}) => {
  return (
    <>
      <SEO title={tag} />

      <Layout
        Profile={<Bio />}
        Article={<Posts data={data} />}
        Filter={<GroupLinks />}
      ></Layout>
    </>
  );
};

export default CategoryTemplate;
