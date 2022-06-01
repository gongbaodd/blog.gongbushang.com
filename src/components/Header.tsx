import React, { FC, PropsWithChildren } from "react";
import { Link, StaticQuery, graphql } from "gatsby";
import { Text } from "@fluentui/react-northstar";

export const titleQuery = graphql`
  query title {
    site {
      siteMetadata {
        title
      }
    }
  }
`;

type TitleQuery = Queries.titleQuery;

type Props = {
  category?: string;
  tag?: string;
  series?: string;
};

const defaultProps: Props = {
  category: "",
  tag: "",
  series: "",
};

export type HeaderProps = PropsWithChildren<Props>;

const Header: FC<HeaderProps> = () => {
  return (
    <Link to="/">
      <Text align="center" size="largest" style={{ width: "100%" }}>
        <StaticQuery<TitleQuery>
          query={titleQuery}
          render={(data) => data.site?.siteMetadata?.title}
        />
      </Text>
    </Link>
  );
};

Header.defaultProps = defaultProps;

export default Header;
