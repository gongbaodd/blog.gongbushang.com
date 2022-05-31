import React, { FC } from "react";
import Github from "./github";
import Header, { HeaderProps } from "../components/Header";
import { Flex } from "@fluentui/react-northstar";

const Footer: FC = () => {
  return (
    <footer>
      {`© ${new Date().getFullYear()}, Built with `}
      <a href="https://www.gatsbyjs.org">Gatsby</a>
    </footer>
  );
};

const Layout: FC<HeaderProps> = ({ children, location, ...options }) => {
  return (
    <Flex fill as="main" hAlign="center">
      {children}
    </Flex>
  );
};

export default Layout;
