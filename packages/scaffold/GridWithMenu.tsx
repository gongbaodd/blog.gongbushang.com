import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Box, Container, Grid, type GridColProps } from "@mantine/core";
import type { ReactNode } from "react";
import classes from "./GridWithMenu.module.css";

interface IGridWithMenuProps {
  menuCol: GridColProps["span"];
  contentCol: GridColProps["span"];
  menuNode?: ReactNode;
  gridContent?: ReactNode;
  sidebarNode?: ReactNode;
}

export function GridWithMenu({
  menuNode,
  gridContent,
  menuCol,
  contentCol,
  sidebarNode,
}: IGridWithMenuProps) {
  if (sidebarNode) {
    return (
      <CustomMantineProvider>
        <Box className={classes.threeCol}>
          <Box>{menuNode}</Box>
          <Box>{gridContent}</Box>
          <Box>{sidebarNode}</Box>
        </Box>
      </CustomMantineProvider>
    );
  }

  return (
    <CustomMantineProvider>
      <Container fluid style={{ marginInline: "initial" }} p={0}>
        <Grid gap="lg">
          <Grid.Col span={menuCol}>{menuNode}</Grid.Col>
          <Grid.Col span={contentCol}>{gridContent}</Grid.Col>
        </Grid>
      </Container>
    </CustomMantineProvider>
  );
}
