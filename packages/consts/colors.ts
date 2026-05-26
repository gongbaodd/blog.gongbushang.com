const prefix = "--mantine-color-";

export const TITLE_COLOR_MAP = Object.entries({
  "pink-2": "#fcc2d7",
  "indigo-2": "#bac8ff",
  "yellow-2": "#ffec99",
  "green-4": "#69db7c",
  "orange-2": "#ffd8a8",
  "teal-2": "#96f2d7",
  "violet-2": "#d0bfff",
  "cyan-2": "#99e9f2",
  "grape-3": "#e599f7",
  "blue-2": "#a5d8ff",
  "lime-2": "#d8f5a2",
  "dark-8": "#1f1f1f",
  "red-3": "#ffa8a8",
  "gray-2": "#e9ecef",
}).reduce<Record<string, string>>(
  (sum, [name, value]) => ({ ...sum, [prefix + name]: value }),
  {},
);

export const POST_CARD_UNDERLINE_COLORS = Object.keys(TITLE_COLOR_MAP);
