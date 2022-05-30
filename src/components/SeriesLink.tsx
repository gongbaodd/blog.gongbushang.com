import { graphql, useStaticQuery } from "gatsby";
import React from "react";
import CountLink from "./CountLink";

export const SeriesQuery = graphql`
  query Serieses {
    allMarkdownRemark {
      group(field: frontmatter___series___slug) {
        fieldValue
        totalCount
        edges {
          node {
            frontmatter {
              series {
                name
              }
            }
          }
        }
      }
    }
  }
`;

type Query = Queries.SeriesesQuery;

export const SeriesLinks = () => {
  const {
    allMarkdownRemark: { group: tags },
  } = useStaticQuery<Query>(SeriesQuery);

  return (
    <>
      {tags.map(
        ({
          fieldValue,
          totalCount,
          edges: [
            {
              node: { frontmatter },
            },
          ],
        }) => {
          return (
            <CountLink
              to={`/series/${fieldValue}`}
              key={fieldValue}
              fieldValue={frontmatter?.series?.name || ""}
              totalCount={totalCount}
            />
          );
        }
      )}
    </>
  );
};
