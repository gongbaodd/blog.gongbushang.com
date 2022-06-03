// @ts-check

const { createFilePath } = require("gatsby-source-filesystem");
const { slug2path } = require("./utils/slug_path");
const _ = require("lodash");

/**
 * @param {import("gatsby").Node} node
 * @param {import("gatsby").CreateNodeArgs["getNode"]} getNode
 * @param {import("gatsby").Actions["createNodeField"]} createNodeField
 */
const createMdNodeFields = (node, getNode, createNodeField) => {
  const value = createFilePath({ node, getNode });
  // const { category, tag, series } = node.frontmatter || {
  //   category: "",
  //   tag: "",
  //   series: "",
  // };
  const category = _.get(node.frontmatter, "category", "");
  const tag = _.get(node.frontmatter, "tag", "");
  const series = _.get(node.frontmatter, "series", null);

  const { path, year, month, day, title } = slug2path(value, category || "");

  createNodeField({
    node,
    name: "slug",
    value: path,
  });

  createNodeField({
    node,
    name: "year",
    value: year,
  });

  createNodeField({
    node,
    name: "month",
    value: month,
  });

  createNodeField({
    node,
    name: "day",
    value: day,
  });

  createNodeField({
    node,
    name: "title",
    value: title,
  });

  createNodeField({
    node,
    name: "date",
    value: new Date([year, month, day].join("-")),
  });

  createNodeField({
    node,
    name: "tag",
    value: _.map(tag, (t) => t.toLowerCase()),
  });

  if (series) {
    createNodeField({
      name: "series",
      value: series.slug,
      node,
    });

    createNodeField({
      name: "series_number",
      value: series.number || 0,
      node,
    });
  }
};

exports.createMdNodeFields = createMdNodeFields;
