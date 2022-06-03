const path = require("path");

const query = `
{
    allMarkdownRemark(sort: {order: DESC, fields: [fields___date]}) {
      group(field: frontmatter___category) {
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
async function createCategories(graphql, createPage) {
  const result = await graphql(query);
  const CategoryTemplate = path.resolve(
    process.cwd(),
    "./src/templates/categories.tsx"
  );

  if (result.errors) {
    throw result.errors;
  }

  if (!result.data) {
    return;
  }

  result.data.allMarkdownRemark.group.forEach(({ fieldValue }) => {
    createPage({
      path: `categories/${fieldValue}`,
      component: CategoryTemplate,
      context: {
        category: fieldValue,
      },
    });
  });
}

exports.createCategories = createCategories;
