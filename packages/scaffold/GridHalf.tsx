import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Container, Grid } from "@mantine/core";
import type { ReactNode } from "react";

export default function GridHalf({left, right}: {left?: ReactNode, right?: ReactNode}) {
    return (
        <CustomMantineProvider>
            <Container fluid p={0} style={{ marginInline: "initial" }}>
                <Grid gutter="xl">
                    <Grid.Col span={{ base: 12, md: 6 }}>{left}</Grid.Col>
                    <Grid.Col span={{ base: 12, md: 6 }}>{right}</Grid.Col>
                </Grid>
            </Container>
        </CustomMantineProvider>

    )
}