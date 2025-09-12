import type { ReactNode } from "react";
import { Typography } from "@mantine/core";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";

interface Props {
    children: ReactNode
}

export default function MantineResume({ children }: Props) {
    return <CustomMantineProvider>
        <Typography>{children}</Typography>
    </CustomMantineProvider>
}