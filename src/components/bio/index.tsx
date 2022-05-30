/**
 * Bio component that queries for data
 * with Gatsby's useStaticQuery component
 *
 * See: https://www.gatsbyjs.org/docs/use-static-query/
 */

import React, { FC } from "react";
import { useStaticQuery, graphql } from "gatsby";
import { GatsbyImage, IGatsbyImageData } from "gatsby-plugin-image";

import { rhythm } from "../../utils/typography";

const query = graphql`
  query BioQuery {
    avatar: file(absolutePath: { regex: "/profile.jpg/" }) {
      childImageSharp {
        gatsbyImageData(width: 50, height: 50, layout: FIXED)
      }
    }
    site {
      siteMetadata {
        author {
          name
          summary
        }
        social {
          twitter
        }
      }
    }
  }
`;

type Data = Queries.BioQueryQuery;
type AvatarImg = NonNullable<
  NonNullable<Data["avatar"]>["childImageSharp"]
>["gatsbyImageData"];
type AvatarAlt = NonNullable<
  NonNullable<Data["site"]>["siteMetadata"]
>["author"];

const Avatar: FC<{
  fixed: AvatarImg;
  author: AvatarAlt;
}> = ({ fixed, author }) => {
  return (
    <GatsbyImage
      image={fixed}
      alt={author?.name || ""}
      style={{
        marginRight: rhythm(1 / 2),
        marginBottom: 0,
        minWidth: 50,
        borderRadius: "100%",
      }}
      imgStyle={{
        borderRadius: "50%",
      }}
    />
  );
};

type DesAuthor = NonNullable<
  NonNullable<Data["site"]>["siteMetadata"]
>["author"];

const Description: FC<{
  author: DesAuthor;
}> = ({ author }) => {
  return (
    <p>
      Written by
      <strong>{author?.name}</strong>
      <br />
      {`${author?.summary} `}
      <a
        href="https://gongbushang.com/contact"
        target="_blank"
        rel="noopener noreferrer"
      >
        找我玩呀
      </a>
    </p>
  );
};

const errMeta: NonNullable<Data["site"]>["siteMetadata"] = {
  author: {
    name: "",
    summary: "",
  },
  social: {
    twitter: "",
  },
};

const Bio: FC = () => {
  const data = useStaticQuery<Data>(query);
  const { author } = data?.site?.siteMetadata || errMeta;
  return (
    <div style={{ display: "flex" }}>
      <Avatar
        author={author}
        fixed={
          data?.avatar?.childImageSharp?.gatsbyImageData as IGatsbyImageData
        }
      />
      <Description author={author} />
    </div>
  );
};

export default Bio;
