import React, { FC, PropsWithChildren } from "react";
import { Link, PageProps, StaticQuery, graphql } from "gatsby";
import { rhythm, scale } from "../utils/typography";

// eslint-disable-next-line no-undef
const rootPath = `${__PATH_PREFIX__}/`;
// eslint-disable-next-line quotes
const quote = '"';
const TOKEN_FUNC = "token function";
const TOKEN_PUNC = "token punctuation";
const TOKEN_STR = "token string";
const TOKEN_OP = "token operator";

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

export type HeaderProps = PropsWithChildren<
  Props & {
    location: PageProps["location"];
  }
>;

const FilterOption: FC<{
  name: Exclude<keyof HeaderProps, "location">;
  value: string;
}> = ({ name, value }) => {
  return (
    <>
      <small className={TOKEN_PUNC}>{`,{${name}:`}</small>
      <span className={TOKEN_OP}>
        <small>{quote}</small>
        {value}
        <small>{quote}</small>
      </span>
      <small className={TOKEN_PUNC}>{"});"}</small>
    </>
  );
};

const Header: FC<HeaderProps> = ({ location, category, tag, series }) => {
  const isRoot = location.pathname === rootPath;
  const style = isRoot
    ? {
        ...scale(1.5),
        marginBottom: rhythm(1.5),
        marginTop: 0,
      }
    : {
        marginTop: 0,
      };

  return (
    <h1 style={style}>
      <small className={TOKEN_FUNC}>blog</small>
      <small className={TOKEN_PUNC}>(</small>
      <Link className={TOKEN_STR} style={{ textDecoration: "none" }} to="/">
        <small>{quote}</small>
        <StaticQuery<TitleQuery>
          query={titleQuery}
          render={(data) => data.site?.siteMetadata?.title}
        />
        <small>{quote}</small>
      </Link>
      {category && <FilterOption name="category" value={category} />}
      {tag && <FilterOption name="tag" value={tag} />}
      {series && <FilterOption name="series" value={series} />}
      {!category && !tag && !series && <small className={TOKEN_PUNC}>);</small>}
    </h1>
  );
};

Header.defaultProps = defaultProps;

export default Header;
