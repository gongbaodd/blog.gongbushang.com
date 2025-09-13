import { type ReactNode } from "react";
import { Typography } from "@mantine/core";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import classes from "./MantineResume.module.css"

interface Props {
    children: ReactNode
}

export default function MantineResume({ children }: Props) {
    return <CustomMantineProvider>
        <Typography className={classes.content}>{children}</Typography>
    </CustomMantineProvider>
}