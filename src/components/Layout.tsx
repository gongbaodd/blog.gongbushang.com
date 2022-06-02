import React, { FC, ReactNode } from "react";
import {
  Flex,
  Box,
  Divider,
  Text,
  Grid,
  Segment,
} from "@fluentui/react-northstar";

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
  const columns = Filter
    ? "min-content 1fr minmax(min-content,1fr)"
    : "min-content 1fr ";

  return (
    <Grid as="main" columns={columns} rows="1fr min-content">
      {Profile}
      {Article}
      {Filter}
      <Box style={{ gridColumn: "span 3" }}>
        <Footer />
      </Box>
    </Grid>
  );
};

export default Layout;
