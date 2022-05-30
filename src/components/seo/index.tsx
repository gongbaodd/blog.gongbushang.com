/**
 * SEO component that queries for data with
 *  Gatsby's useStaticQuery React hook
 *
 * See: https://www.gatsbyjs.org/docs/use-static-query/
 */

import React from "react";
import Helmet from "react-helmet";
import { useStaticQuery, graphql } from "gatsby";

export const SeoQuery = graphql`
  query SEO {
    site {
      siteMetadata {
        title
        description
        social {
          twitter
        }
      }
    }
  }
`;

interface SeoProps {
  description?: string;
  lang?: string;
  meta?: Record<string, string | null | undefined>[];
  title: string;
}

function SEO({ description, lang, meta = [], title }: SeoProps) {
  const { site } = useStaticQuery<Queries.SEOQuery>(SeoQuery);

  const metaDescription = description || site?.siteMetadata?.description;

  const newMeta = [
    ...meta,
    {
      name: "description",
      content: metaDescription,
    },
    {
      property: "og:title",
      content: title,
    },
    {
      property: "og:description",
      content: metaDescription,
    },
    {
      property: "og:type",
      content: "website",
    },
    {
      name: "twitter:card",
      content: "summary",
    },
    {
      name: "twitter:creator",
      content: site?.siteMetadata?.social?.twitter,
    },
    {
      name: "twitter:title",
      content: title,
    },
    {
      name: "twitter:description",
      content: metaDescription,
    },
    {
      name: "referrer",
      content: "no-referrer",
    },
  ];

  return (
    <Helmet
      htmlAttributes={{
        lang,
      }}
      title={title}
      titleTemplate={`%s | ${site?.siteMetadata?.title}`}
      meta={newMeta}
    />
  );
}

SEO.defaultProps = {
  lang: "en",
  meta: [],
  description: "",
};

export default SEO;
