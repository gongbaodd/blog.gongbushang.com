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
          paddingTop: "6.8rem",
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
