import React, { FC } from "react";
import { useStaticQuery, graphql } from "gatsby";
import { GatsbyImage, IGatsbyImageData } from "gatsby-plugin-image";
import { Flex, Image } from "@fluentui/react-northstar";
import { rhythm } from "../../utils/typography";

const query = graphql`
  query BioQuery {
    avatar: file(absolutePath: { regex: "/profile.jpg/" }) {
      childImageSharp {
        gatsbyImageData(width: 260, height: 260, layout: FIXED)
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
      imgStyle={{ borderRadius: "50%" }}
    />
  );
};

type DesAuthor = NonNullable<
  NonNullable<Data["site"]>["siteMetadata"]
>["author"];

const Description: FC<{
  author: DesAuthor;
}> = ({ author }) => {
  // return (
  //   <p>
  //     Written by
  //     <strong>{author?.name}</strong>
  //     <br />
  //     {`${author?.summary} `}
  //     <a
  //       href="https://gongbushang.com/contact"
  //       target="_blank"
  //       rel="noopener noreferrer"
  //     >
  //       找我玩呀
  //     </a>
  //   </p>
  // );
  return <></>;
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
