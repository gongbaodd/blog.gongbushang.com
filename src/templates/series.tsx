import React, { FC } from "react";
import { PageProps, graphql } from "gatsby";

import Layout from "../components/Layout";
import SEO from "../components/seo";
import Bio from "../components/bio";
import Posts from "../components/Posts";
import GroupLinks from "../components/GroupLinks";

export const pageQuery = graphql`
  query BlogPostsBySeries($seriesName: String!) {
    allMarkdownRemark(
      filter: { frontmatter: { series: { name: { eq: $seriesName } } } }
      sort: {
        order: ASC
        fields: [fields___date, fields___series_number]
      }
    ) {
      edges {
        node {
          excerpt
          frontmatter {
            series {
              name
              number
            }
            category
          }
          fields {
            slug
            date(formatString: "MMMM DD, YYYY")
            title
          }
        }
      }
    }
  }
`;

type PageData = Queries.BlogPostsBySeriesQuery;

export interface PageContext {
  seriesName: string;
}

const CategoryTemplate: FC<PageProps<PageData, PageContext>> = ({
  data,
  location,
  pageContext: { seriesName },
}) => {
  return (
    <Layout location={location} series={seriesName}>
      <SEO title={seriesName} />
      <Bio />
      <GroupLinks />
      <Posts data={data} />
    </Layout>
  );
};

export default CategoryTemplate;
