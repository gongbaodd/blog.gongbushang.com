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

      <Layout Profile={<Bio />} Article={<Posts />} Filter={<GroupLink />} />
    </>
  );
};

export default BlogIndex;
