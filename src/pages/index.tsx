import React, { FC } from "react";
import { PageProps } from "gatsby";

import { Flex, FlexItem, Box } from "@fluentui/react-northstar";
import Bio from "../components/bio";
import Layout from "../components/Layout";
import SEO from "../components/seo";
import GroupLink from "../components/GroupLinks";
import Posts from "../components/Posts";

const BlogIndex: FC<PageProps> = () => {
  return (
    <>
      <SEO title="All posts" />

      <Layout>
        <Flex gap="gap.large">
          <Bio />

          <FlexItem grow>
            <Box as="article" style={{ paddingTop: "6.8rem" }}>
              <Posts />
            </Box>
          </FlexItem>

          <GroupLink />
        </Flex>
      </Layout>
    </>
  );
};

export default BlogIndex;
