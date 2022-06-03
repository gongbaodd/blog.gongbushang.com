// @ts-check

const { createCategories } = require("./server/pages/categories");
const { createTSeries } = require("./server/pages/series");
const { createTags } = require("./server/pages/tags");

/**
 * @type {import("gatsby").GatsbyNode["createPages"]}
 */
async function createPages({ graphql, actions: { createPage } }) {
  await createCategories(graphql, createPage);
  await createTSeries(graphql, createPage);
  await createTags(graphql, createPage);
}

const { createMdNodeFields } = require("./server/onCreateMdNode");

/**
 * @type {import("gatsby").GatsbyNode["onCreateNode"]}
 */
async function onCreateNode({ node, actions, getNode }) {
  const { createNodeField } = actions;

  if (node.internal.type === "MarkdownRemark") {
    createMdNodeFields(node, getNode, createNodeField);
  }
}

exports.createPages = createPages;
exports.onCreateNode = onCreateNode;
