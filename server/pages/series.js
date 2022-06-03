// @ts-check
const path = require("path");

const query = `
{
  allMarkdownRemark(sort: {fields: [fields___date, fields___series_number], order: ASC}) {
    group(field: frontmatter___series___slug) {
      fieldValue
      edges {
        node {
          frontmatter {
            series {
              name
            }
          }
        }
      }
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
async function createTSeries(graphql, createPage) {
  const result = await graphql(query);
  const CategoryTemplate = path.resolve(
    process.cwd(),
    "./src/templates/series.tsx"
  );

  if (result.errors) {
    throw result.errors;
  }

  if (!result.data) {
    return;
  }

  result.data.allMarkdownRemark.group.forEach(
    ({
      fieldValue,
      edges: [
        {
          node: {
            frontmatter: {
              series: { name },
            },
          },
        },
      ],
    }) => {
      createPage({
        path: `series/${fieldValue}`,
        component: CategoryTemplate,
        context: {
          seriesName: name,
        },
      });
    }
  );
}

exports.createTSeries = createTSeries;
