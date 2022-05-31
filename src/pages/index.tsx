import React, { FC } from "react";
import { PageProps } from "gatsby";

import { Flex, FlexItem } from "@fluentui/react-northstar";
import Bio from "../components/bio";
import Layout from "../components/Layout";
import SEO from "../components/seo";
import GroupLink from "../components/GroupLinks";
import Posts from "../components/Posts";

const BlogIndex: FC<PageProps> = ({ location }) => {
  // return (
  //   <Layout location={location}>
  //     <SEO title="All posts" />
  //     <Bio />
  //     <GroupLink />
  //     <article>
  //       <Posts />
  //     </article>
  //   </Layout>
  // );
  return (
    <Flex gap="gap.smaller">
      <Bio />
      <FlexItem>
        <article>
          <Posts />
        </article>
      </FlexItem>
    </Flex>
  );
};

export default BlogIndex;
