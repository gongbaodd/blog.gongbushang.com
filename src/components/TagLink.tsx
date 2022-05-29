import { graphql, useStaticQuery } from "gatsby";
import React from "react";
import CountLink from "./CountLink";

export const tagQuery = graphql`
  query Tag {
    allMarkdownRemark {
      group(field: fields___tag) {
        fieldValue
        totalCount
      }
    }
  }
`;

type Query = Queries.TagQuery;

export const TagLinks = () => {
  const {
    allMarkdownRemark: { group: tags },
  } = useStaticQuery<Query>(tagQuery);

  return (
    <>
      {tags.map(({ fieldValue, totalCount }) => (
        <CountLink
          to={`/tags/${fieldValue}`}
          key={fieldValue}
          fieldValue={fieldValue || ""}
          totalCount={totalCount}
        />
      ))}
    </>
  );
};
