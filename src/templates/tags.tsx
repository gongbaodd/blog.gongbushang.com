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
  data,
  location,
  pageContext: { tag },
}) => {
  return (
    <>
      <SEO title={tag} />

      <Layout tag={tag}>
        <Flex gap="gap.large">
          <Bio />
          <FlexItem grow>
            <Box as="article" style={{ paddingTop: "6.8rem" }}>
              <Posts />
            </Box>
          </FlexItem>

          <GroupLinks />
        </Flex>
      </Layout>
    </>
  );
};

export default CategoryTemplate;
