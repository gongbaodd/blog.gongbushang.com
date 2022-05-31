import React, { FC } from "react";
import Github from "./github";
import { rhythm } from "../utils/typography";
import Header, { HeaderProps } from "../components/Header";

const Footer: FC = () => {
  return (
    <footer>
      {`© ${new Date().getFullYear()}, Built with `}
      <a href="https://www.gatsbyjs.org">Gatsby</a>
    </footer>
  );
};

const Layout: FC<HeaderProps> = ({ children, location, ...options }) => {
  return <main>{children}</main>;
};

export default Layout;
