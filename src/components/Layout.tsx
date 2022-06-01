import React, { FC, PropsWithChildren } from "react";
import { Flex, Box, Divider, Text } from "@fluentui/react-northstar";

const Footer: FC = () => {
  return (
    <footer>
      <Text align="center">
        {`© ${new Date().getFullYear()}, Built with `}
        <a href="https://www.gatsbyjs.org">Gatsby</a>
      </Text>
    </footer>
  );
};

const Layout: FC<PropsWithChildren<Record<string, unknown>>> = ({
  children,
}) => {
  return (
    <Box as="main">
      <Flex hAlign="center" style={{ minHeight: "90vh" }}>
        {children}
      </Flex>
      <Divider />
      <Box style={{ height: "3.6rem" }}>
        <Footer />
      </Box>
    </Box>
  );
};

export default Layout;
