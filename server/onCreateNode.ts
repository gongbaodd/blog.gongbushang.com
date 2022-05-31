import { createFilePath } from "gatsby-source-filesystem";
import { CreateNodeArgs, Node } from "gatsby";
import _ from "lodash";
import { slug2path } from "./utils/slug_path";

interface MdNode extends Node {
  frontmatter: {
    category: string | null;
    tag: string[] | null;
    series: {
      name: string;
      slug: string;
      number?: number;
    } | null;
  };
}

const createMdNodeFields = (
  node: MdNode,
  getNode: CreateNodeArgs["getNode"],
  createNodeField: CreateNodeArgs["actions"]["createNodeField"]
) => {
  const value = createFilePath({ node, getNode });
  const { category, tag, series } = node.frontmatter;
  const { path, year, month, day, title } = slug2path(value, category || "");

  createNodeField({
    name: "slug",
    node,
    value: path,
  });

  createNodeField({
    name: "year",
    node,
    value: year,
  });

  createNodeField({
    name: "month",
    node,
    value: month,
  });

  createNodeField({
    name: "day",
    node,
    value: day,
  });

  createNodeField({
    name: "title",
    node,
    value: title,
  });

  createNodeField({
    name: "date",
    node,
    value: new Date([year, month, day].join("-")),
  });

  createNodeField({
    name: "tag",
    node,
    value: _.map<string>(tag, (t: string) => t.toLowerCase()),
  });

  if (series) {
    createNodeField({
      name: "series",
      node,
      value: series.slug,
    });

    createNodeField({
      name: "series_number",
      node,
      value: series.number || 0,
    });
  }
};

const onCreateNode = ({ node, actions, getNode }: CreateNodeArgs<MdNode>) => {
  const { createNodeField } = actions;

  if (node.internal.type === "MarkdownRemark") {
    createMdNodeFields(node, getNode, createNodeField);
  }
};

export default onCreateNode;
