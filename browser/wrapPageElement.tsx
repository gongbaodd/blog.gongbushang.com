import React from "react";
import { Provider, teamsDarkTheme } from "@fluentui/react-northstar";

export function wrapPageElement({ element }) {
  return <Provider theme={teamsDarkTheme}>{element}</Provider>;
}
