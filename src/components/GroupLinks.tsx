import React from "react";
import { FlexItem, Box } from "@fluentui/react-northstar";

import { CategoryLinks } from "../components/CategoryLink";
import { TagLinks } from "../components/TagLink";
import { SeriesLinks } from "../components/SeriesLink";

const GroupLinks = () => {
  return (
    <FlexItem size="size.half">
      <Box
        as="section"
        style={{
          padding: "1.2rem 1.2rem 1.2rem 1.2rem",
        }}
      >
        <CategoryLinks />
        <TagLinks />
        <SeriesLinks />
      </Box>
    </FlexItem>
  );
};

export default GroupLinks;
