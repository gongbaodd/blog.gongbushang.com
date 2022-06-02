import React, { FC } from "react";
import { useStaticQuery, graphql } from "gatsby";
import { GatsbyImage, IGatsbyImageData } from "gatsby-plugin-image";
import { Flex, Box, Divider, Text } from "@fluentui/react-northstar";
import Header from "../Header";

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
    <Box style={{ padding: "1.2rem", paddingTop: "3.6em" }}>
      <GatsbyImage
        image={fixed}
        alt={author?.name || ""}
        imgStyle={{ borderRadius: "50%" }}
      />
    </Box>
  );
};

type DesAuthor = NonNullable<
  NonNullable<Data["site"]>["siteMetadata"]
>["author"];

const Description: FC<{
  author: DesAuthor;
}> = ({ author }) => {
  return (
    <Box style={{ padding: "1.2rem" }}>
      <Flex column gap="gap.medium">
        <Divider content="Written by" />
        <Header />
        <Text content={author?.summary} align="center" />
      </Flex>
    </Box>
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
    <Flex column hAlign="center">
      <Avatar
        author={author}
        fixed={
          data?.avatar?.childImageSharp?.gatsbyImageData as IGatsbyImageData
        }
      />
      <Description author={author} />
    </Flex>
  );
};

export default Bio;
