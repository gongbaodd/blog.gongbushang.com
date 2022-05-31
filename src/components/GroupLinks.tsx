import React from "react";
// import { Container } from "theme-ui";
import { CategoryLinks } from "../components/CategoryLink";
import { TagLinks } from "../components/TagLink";
import { SeriesLinks } from "../components/SeriesLink";

const GroupLinks = () => {
  return (
    <>
      <CategoryLinks />
      <TagLinks />
      <SeriesLinks />
    </>
  );
};

export default GroupLinks;
