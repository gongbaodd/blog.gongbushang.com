import React, { FC } from "react";
import { PageProps, graphql } from "gatsby";
import { Flex, FlexItem, Box } from "@fluentui/react-northstar";

import Layout from "../components/Layout";
import SEO from "../components/seo";
import Bio from "../components/bio";
import Posts from "../components/Posts";
import GroupLinks from "../components/GroupLinks";

export const pageQuery = graphql`
  query BlogPostsByCategory($category: String!) {
    allMarkdownRemark(
      filter: { frontmatter: { category: { eq: $category } } }
      sort: { fields: fields___date, order: DESC }
    ) {
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

type PageData = Queries.BlogPostsByCategoryQuery;

export interface PageContext {
  category: string;
}

const CategoryTemplate: FC<PageProps<PageData, PageContext>> = ({
  pageContext: { category },
  data,
}) => {
  return (
    <>
      <SEO title={category} />

      <Layout
        Profile={<Bio />}
        Article={
          <Box as="article" style={{ paddingTop: "6.8rem" }}>
            <Posts data={data} />
          </Box>
        }
        Filter={<GroupLinks />}
      ></Layout>
    </>
  );
};

export default CategoryTemplate;
