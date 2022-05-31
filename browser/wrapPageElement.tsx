import React from "react";
import { FluentProvider, teamsLightTheme } from "@fluentui/react-components";

export function wrapPageElement({ element }) {
  return <FluentProvider theme={teamsLightTheme}>{element}</FluentProvider>;
}
