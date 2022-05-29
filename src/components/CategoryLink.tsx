import { graphql, useStaticQuery } from "gatsby";
import React from "react";
import CountLink from "./CountLink";

export const categoryQuery = graphql`
  query Categories {
    allMarkdownRemark {
      group(field: frontmatter___category) {
        fieldValue
        totalCount
      }
    }
  }
`;

type Query = Queries.CategoriesQuery;

export const CategoryLinks = () => {
  const {
    allMarkdownRemark: { group: categories },
  } = useStaticQuery<Query>(categoryQuery);

  return (
    <>
      {categories.map(({ fieldValue, totalCount }) => (
        <CountLink
          to={`/categories/${fieldValue}`}
          key={fieldValue}
          fieldValue={fieldValue || ""}
          totalCount={totalCount}
        />
      ))}
    </>
  );
};
