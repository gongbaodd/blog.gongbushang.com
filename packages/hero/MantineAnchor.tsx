import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Anchor } from "@mantine/core";
import type { ReactNode } from "react";

export default function MantineAnchor({ href, children }: { href: string, children?: ReactNode }) {
    return <CustomMantineProvider>
        <Anchor href={href} onClick={e => {
            e.preventDefault()
        }}>{children}</Anchor>
    </CustomMantineProvider>
}