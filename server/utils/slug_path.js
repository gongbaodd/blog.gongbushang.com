const slugify = require("slugify");
const SLUG_REG = /\/(\d{4})-(\d{2})-(\d{2})-(.*)\//;

/**
 *
 * @param {string} slug
 * @param {string} category
 */
exports.slug2path = function (slug, category) {
  const match = slug.match(SLUG_REG) || [];

  const year = match[1];
  const month = match[2];
  const day = match[3];
  const title = match[4];

  const path = `${
    category ? `/${category}` : ""
  }/${year}/${month}/${day}/${slugify(title, { lower: true })}`;

  return {
    year,
    month,
    day,
    title,
    category,
    path,
  };
};
