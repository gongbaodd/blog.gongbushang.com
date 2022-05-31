import React, { FC } from "react";
import { PageProps } from "gatsby";

import { Flex, FlexItem, Box } from "@fluentui/react-northstar";
import Bio from "../components/bio";
import Layout from "../components/Layout";
import SEO from "../components/seo";
import GroupLink from "../components/GroupLinks";
import Posts from "../components/Posts";

const BlogIndex: FC<PageProps> = ({ location }) => {
  return (
    <>
      <SEO title="All posts" />

      <Layout location={location}>
        <Flex gap="gap.large">
          <Bio />

          <FlexItem push>
            <Box as="article" style={{ width: "26rem", paddingTop: "6.8rem" }}>
              <Posts />
            </Box>
          </FlexItem>

          <FlexItem>
            <Box
              as="section"
              style={{ paddingTop: "6.8rem", paddingRight: "1.2rem" }}
            >
              <GroupLink />
            </Box>
          </FlexItem>
        </Flex>
      </Layout>
    </>
  );
};

export default BlogIndex;
