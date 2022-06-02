import React, { FC, ReactNode } from "react";
import {
  Flex,
  Box,
  Divider,
  Text,
  Grid,
  Segment,
} from "@fluentui/react-northstar";
import { useMediaQuery } from "react-responsive";

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

const Layout: FC<{
  Profile: ReactNode;
  Article: ReactNode;
  Filter?: ReactNode;
}> = ({ Profile, Article, Filter }) => {
  const isTabletOrMobile = useMediaQuery({ query: "(max-width: 1024px)" });

  const columnsInDesktop = Filter
    ? "min-content 1.6fr minmax(min-content,1fr)"
    : "min-content 1.6fr ";
  const columnsInMobile = "";

  const rowsInDesktop = "1fr min-content";
  const rowsInMobile = "repeat(4, min-content)";

  const ContentPaddingInDesktop = Filter ? "6.8rem" : "";

  return (
    <Grid
      as="main"
      columns={isTabletOrMobile ? columnsInMobile : columnsInDesktop}
      rows={isTabletOrMobile ? rowsInMobile : rowsInDesktop}
    >
      {Profile}
      <Box
        style={{ paddingTop: isTabletOrMobile ? "" : ContentPaddingInDesktop }}
      >
        {Article}
      </Box>
      <Box
        style={{ paddingTop: isTabletOrMobile ? "" : ContentPaddingInDesktop }}
      >
        {Filter}
      </Box>
      <Box style={{ gridColumn: "span 3" }}>
        <Footer />
      </Box>
    </Grid>
  );
};

export default Layout;
