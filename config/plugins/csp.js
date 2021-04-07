const _ = require("lodash/fp");

module.exports = [
  {
    resolve: "gatsby-plugin-csp",
    options: {
      disableOnDev: true,
      reportOnly: false,
      mergeScriptHashes: false,
      mergeStyleHashes: false,
      mergeDefaultDirectives: true,
      directives: _.compose(
        _.mapKeys((k) => `${k}-src`),
        _.mapValues((v) => v.join(" "))
      )({
        script: [
          "'self'",
          "www.google-analytics.com",
          "*.sentry.io",
          "'unsafe-inline'",
          "utteranc.es",
          "*.utteranc.es",
          "*.cloudflareinsights.com",
        ],
        style: ["'self'", "'unsafe-inline'", "utteranc.es", "*.utteranc.es"],
        img: ["*", "data:", "*.cloudflareinsights.com"],
        default: [
          "'self'",
          "utteranc.es",
          "*.utteranc.es",
          "fonts.gstatic.com",
        ],
        connect: [
          "'self'",
          "www.google-analytics.com",
          "stats.g.doubleclick.net",
        ],
      }),
    },
  },
];
