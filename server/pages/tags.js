//@ts-check
const path = require("path");

const query = `
{
    allMarkdownRemark(sort: {order: DESC, fields: [fields___date]}) {
      group(field: fields___tag) {
        fieldValue
      }
    }
  }
`;

/**
 *
 * @param {import("gatsby").CreatePagesArgs["graphql"]} graphql
 * @param {import("gatsby").Actions["createPage"]} createPage
 * @returns
 */
async function createTags(graphql, createPage) {
  const result = await graphql(query);
  const CategoryTemplate = path.resolve(
    process.cwd(),
    "./src/templates/tags.tsx"
  );

  if (result.errors) {
    throw result.errors;
  }

  if (!result.data) {
    return;
  }

  result.data.allMarkdownRemark.group.forEach(({ fieldValue }) => {
    createPage({
      path: `tags/${fieldValue}`,
      component: CategoryTemplate,
      context: {
        tag: fieldValue,
      },
    });
  });
}

exports.createTags = createTags;
