import React, { FC } from "react";
import { PageProps } from "gatsby";

import { Flex, FlexItem, Grid, Segment } from "@fluentui/react-northstar";
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
          <FlexItem>
            <article>
              <GroupLink />
              <Posts />
            </article>
          </FlexItem>
        </Flex>
      </Layout>
    </>
  );
};

export default BlogIndex;
