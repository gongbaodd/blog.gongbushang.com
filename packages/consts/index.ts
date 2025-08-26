// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = 'GrowGen | 给我整';
export const SITE_TITLE_NICK = "GrowGen | 整";
export const SITE_DESCRIPTION = `生命在于折腾`;

export enum FILTER_ENTRY {
    ALL = 'all',
    TAG = 'tag',
    SERIES = 'series',
    YEAR = 'year',
}

export const ROUTES = [
    { label: "Home", href: "/" },
    { label: "Blog", href: "/all" },
    { label: "Travel", href: "/world" },
    { label: "Archive", href: "/year" },
]

export const PV_URL = "https://pv.growgen.xyz/"

export const POST_COUNT_PER_PAGE = 20;


export enum POST_CARD_LAYOUT {
  xs = "xs",
  sm = "sm",
  md = "md",
  lg = "lg",
  xl = "xl",
}

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
  "gray-2": "#e9ecef"
})
.reduce<Record<string, string>>((sum, [name, value]) => ({ ...sum, [prefix + name]: value }), {})

export const POST_CARD_UNDERLINE_COLORS = Object.keys(TITLE_COLOR_MAP)


export const POST_CARD_CLASSNAMES = [
  "liquid_cheese",
  "protruding_squares",
  "wintery_sunburst",
  "subtle_prism",
  "bullseye_gradient",
  "spectrum_gradient",
  "wavy_fingerprint",
  "radient_gradient",
  "endless_constellation",
  "zig_zag",
  "repeating_chevrons",
  "large_triangles",
  "abstract_envelope",
  "diamond_sunset",
  "square_versatiles",
  "geometric_intersaction",
  "diagonal_stripes",
  "hollowed_boxes",
  "rose_petals",
  "confetti_doodles",
  "dragon_scales",
  "quantum_gradient",
  "cornered_staires",
  "slanted_gradient",
  "dalmatian_spots",
  "tortoise_shell",
  "alternating_arrowhead",
  "repeating_triangles",
  "bermuda_triangle",
  "bermuda_square",
  "bermuda_diamond",
  "parabolic_rectangle",
  "parabolic_pentagon",
  "parabolic_ellipse",
  "parabolic_triangle",
  "polka_dots",
  "colorful_stingrays",
  "varying_stripes",
  "vanishing_stripes",
  "sun_tornado",
  "scattered_forcefields",
  "page_turner",
  "abstract_timekeeper",
  "rainbow_vortex",
  "subtle_stripes",
  "pattern_randomized",
  "flat_mountains",
  "bermuda_circle",
];