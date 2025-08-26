import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Container, Grid, type GridColProps, type StyleProp } from "@mantine/core";
import type { ComponentProps, ReactNode } from "react";

interface IGridWithMenuProps {
    menuCol: GridColProps["span"]
    contentCol:GridColProps["span"]
    menuNode?: ReactNode
    gridContent?: ReactNode
}   

export function GridWithMenu({ menuNode, gridContent, menuCol, contentCol }: IGridWithMenuProps) {

    return (
        <CustomMantineProvider>
            <Container fluid style={{ marginInline: "initial" }} p={0}>
                <Grid gutter="lg">
                    <Grid.Col span={menuCol}>
                        {menuNode}
                    </Grid.Col>
                    <Grid.Col span={contentCol}>
                        {gridContent}
                    </Grid.Col>
                </Grid>
            </Container>
        </CustomMantineProvider>
    )
}