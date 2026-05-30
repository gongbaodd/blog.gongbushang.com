import { Box, Chip, Group } from "@mantine/core";
import { getCategoryColor } from "../postsData";
import classes from "../ParticleHero.module.css";

interface ILegendCategoryChipsProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

function CategorySwatch({ color }: { color?: string }) {
  return (
    <Box
      component="span"
      className={
        color
          ? classes.legendSwatch
          : `${classes.legendSwatch} ${classes.legendSwatchAll}`
      }
      style={color ? { background: color } : undefined}
      aria-hidden
    />
  );
}

function ChipLabel({ color, children }: { color?: string; children: string }) {
  return (
    <Group gap={6} wrap="nowrap" className={classes.legendChipLabel}>
      <CategorySwatch color={color} />
      <span>{children}</span>
    </Group>
  );
}

export default function LegendCategoryChips({
  categories,
  selectedCategory,
  onSelectCategory,
}: ILegendCategoryChipsProps) {
  return (
    <Chip.Group
      value={selectedCategory}
      onChange={(value) => value && onSelectCategory(value)}
      aria-label="Category filter"
    >
      <Group
        gap="xs"
        wrap="wrap"
        justify="flex-end"
        className={classes.legendChips}
      >
        <Chip value="all" size="xs" variant="outline">
          <ChipLabel>All</ChipLabel>
        </Chip>
        {categories.map((category) => {
          const color = getCategoryColor(category);
          return (
            <Chip key={category} value={category} size="xs" variant="outline">
              <ChipLabel color={color}>{category.toUpperCase()}</ChipLabel>
            </Chip>
          );
        })}
      </Group>
    </Chip.Group>
  );
}
