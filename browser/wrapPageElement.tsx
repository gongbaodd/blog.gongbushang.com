import React from "react";
import { Provider, teamsTheme } from "@fluentui/react-northstar";

export function wrapPageElement({ element }) {
  return <Provider theme={teamsTheme}>{element}</Provider>;
}
