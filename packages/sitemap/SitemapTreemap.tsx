import { Box, Text } from "@mantine/core";
import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import ReactErrorBoundary from "@/src/components/ReactErrorBoundary";
import type { ISitemapCategoryNode } from "./buildSitemapTree";
import { canLabel, categoryColor, tooltipText } from "./cell";

interface ISitemapTreemapProps {
  categories: ISitemapCategoryNode[];
}

/** Props Recharts hands to a custom treemap cell, plus the fields we put on year nodes. */
interface ICellProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  depth?: number;
  name?: string;
  value?: number;
  href?: string;
  category?: string;
  colorIndex?: number;
}

function TreemapCell({
  x = 0,
  y = 0,
  width = 0,
  height = 0,
  depth = 0,
  name = "",
  value = 0,
  href,
  category = "",
  colorIndex = 0,
}: ICellProps) {
  // Depth 1 is the category group: draw only its outline so year cells stay readable.
  if (depth < 2 || !href) {
    return depth === 1 ? (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill="none"
        stroke="var(--mantine-color-body)"
        strokeWidth={4}
        pointerEvents="none"
      />
    ) : null;
  }

  const showLabel = canLabel(width, height);

  return (
    <a href={href} aria-label={tooltipText(category, name, value)}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={categoryColor(colorIndex)}
        stroke="var(--mantine-color-body)"
        strokeWidth={1}
        style={{ cursor: "pointer" }}
      />
      {showLabel && (
        <>
          <text
            x={x + 8}
            y={y + 20}
            fill="#fff"
            fontSize={14}
            fontWeight={600}
            pointerEvents="none"
          >
            {category}
          </text>
          <text x={x + 8} y={y + 38} fill="#fff" fontSize={12} pointerEvents="none">
            {name} · {value}
          </text>
        </>
      )}
    </a>
  );
}

interface ITooltipPayload {
  payload?: ICellProps;
}

function TreemapTooltip({ active, payload }: { active?: boolean; payload?: ITooltipPayload[] }) {
  const node = payload?.[0]?.payload;
  if (!active || !node?.href) return null;

  return (
    <Box
      p="xs"
      style={{
        background: "var(--mantine-color-body)",
        border: "1px solid var(--mantine-color-default-border)",
        borderRadius: "var(--mantine-radius-sm)",
      }}
    >
      <Text size="sm">{tooltipText(node.category ?? "", node.name ?? "", node.value ?? 0)}</Text>
    </Box>
  );
}

export default function SitemapTreemap({ categories }: ISitemapTreemapProps) {
  return (
    <CustomMantineProvider>
      {/* The link list rendered below the chart is the fallback, so a failed chart renders nothing. */}
      <ReactErrorBoundary label="Sitemap treemap failed:" fallback={null}>
        <Box
          style={{ width: "100%", height: "clamp(360px, 62vw, 640px)" }}
          role="img"
          aria-label="Treemap of posts by category and year. The same links are listed below."
        >
          {/* initialDimension lets the server render a real chart instead of a 0x0 container. */}
          <ResponsiveContainer
            width="100%"
            height="100%"
            initialDimension={{ width: 1000, height: 560 }}
          >
            <Treemap
              data={categories}
              dataKey="value"
              nameKey="name"
              content={<TreemapCell />}
              isAnimationActive={false}
            >
              <Tooltip content={<TreemapTooltip />} />
            </Treemap>
          </ResponsiveContainer>
        </Box>
      </ReactErrorBoundary>
    </CustomMantineProvider>
  );
}
