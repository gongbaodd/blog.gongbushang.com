const images = [
  {
    resolve: "gatsby-remark-relative-images",
  },
  {
    resolve: "gatsby-remark-images",
    options: {
      maxWidth: 590,
      showCaptions: true,
      withWebp: true,
      linkImagesToOriginal: true,
      tracedSVG: true,
      wrapperStyle: "margin:0;",
    },
  },
];

const ketax = [
  {
    resolve: `gatsby-remark-katex`,
    options: {
      // Add any KaTeX options from https://github.com/KaTeX/KaTeX/blob/master/docs/options.md here
      strict: `ignore`,
    },
  },
];

const iframe = [
  {
    resolve: "gatsby-remark-responsive-iframe",
    options: {
      wrapperStyle: "margin-bottom: 1.0725rem",
    },
  },
];

const prismjs = [
  {
    resolve: "gatsby-remark-prismjs",
    options: {
      classPrefix: "language-",
      showLineNumbers: true,
    },
  },
];

const externalLink = [
  {
    resolve: "gatsby-remark-external-links",
    options: {
      target: "_blank",
      rel: "noopener noreferrer",
    },
  },
];

const linkedFiles = [
  {
    resolve: "gatsby-remark-copy-linked-files",
    options: {
      destinationDir: "assets",
    },
  },
];

module.exports = [
  {
    resolve: "gatsby-transformer-remark",
    options: {
      plugins: [
        ...images,
        ...iframe,
        ...prismjs,
        ...externalLink,
        ...linkedFiles,
        ...ketax,
        "gatsby-remark-smartypants",
      ],
    },
  },
];
