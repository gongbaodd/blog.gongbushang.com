import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Container, Grid } from "@mantine/core";
import type { ReactNode } from "react";

interface IGridWithMenuProps {
    menuNode?: ReactNode
    gridContent?: ReactNode
}   

export function GridWithMenu({ menuNode, gridContent }: IGridWithMenuProps) {
    return (
        <CustomMantineProvider>
            <Container fluid style={{ marginInline: "initial" }} p={0}>
                <Grid gutter="lg">
                    <Grid.Col span={{ base: 12, md: 1.2 }}>
                        {menuNode}
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 10.8 }}>
                        {gridContent}
                    </Grid.Col>
                </Grid>
            </Container>
        </CustomMantineProvider>
    )
}