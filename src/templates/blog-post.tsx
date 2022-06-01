import React, { FC } from "react";
import { Link, graphql, PageProps } from "gatsby";
import withUtterances from "with-utterances";
import {
  Card,
  Flex,
  Box,
  CardHeader,
  CardBody,
  Text,
  Button,
  FlexItem,
  ArrowLeftIcon,
  ArrowRightIcon,
} from "@fluentui/react-northstar";

import Bio from "../components/bio";
import Layout from "../components/Layout";
import SEO from "../components/seo";

const sanitize = (html: string) => html;

export const pageQuery = graphql`
  query BlogPostBySlug($slug: String!) {
    markdownRemark(fields: { slug: { eq: $slug } }) {
      id
      excerpt(pruneLength: 160)
      html
      frontmatter {
        category
      }
      fields {
        slug
        date(formatString: "MMMM DD, YYYY")
        title
      }
    }
  }
`;

interface PageData {
  markdownRemark: {
    id: string;
    excerpt: string;
    html: string;
    frontmatter: {
      category?: string;
    };
    fields: {
      slug: string;
      date: string;
      title: string;
    };
  };
}

type RefPageData = PageData["markdownRemark"] & {
  fields: {
    slug: string;
  };
};

const BlogPostTemplate: FC<
  PageProps<PageData, { previous: RefPageData; next: RefPageData }>
> = ({ data, pageContext }) => {
  const post = data.markdownRemark;
  const { previous, next } = pageContext;
  const { title, date } = post.fields;

  return (
    <>
      <SEO title={title} description={post.excerpt} />

      <Layout>
        <Flex gap="gap.large">
          <Bio />
          <Box style={{ padding: "2.4rem" }}>
            <Flex column gap="gap.large">
              <Card fluid>
                <CardHeader>
                  <Text content={date} />
                </CardHeader>
                <CardBody>
                  <section
                    className="blog_post"
                    dangerouslySetInnerHTML={{
                      __html: sanitize(post.html),
                    }}
                  />
                </CardBody>
              </Card>

              <FlexItem>
                <Flex space="between">
                  {previous && (
                    <Link to={previous.fields.slug} rel="prev">
                      <Button
                        icon={<ArrowLeftIcon />}
                        iconPosition="before"
                        primary
                      >
                        {previous.fields.title}
                      </Button>
                    </Link>
                  )}

                  {next && (
                    <Link to={next.fields.slug} rel="next">
                      <Button
                        icon={<ArrowRightIcon />}
                        iconPosition="after"
                        primary
                      >
                        {next.fields.title}
                      </Button>
                    </Link>
                  )}
                </Flex>
              </FlexItem>
            </Flex>
          </Box>
        </Flex>
      </Layout>
    </>
  );
};

export default withUtterances(
  // TODO: Fix this
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  BlogPostTemplate as any,
  "gongbaodd/gongbaodd.github.io",
  "dark-blue",
  "og:title",
  "comments"
);
