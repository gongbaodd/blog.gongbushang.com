import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Anchor } from "@mantine/core";
import { useState, type ReactNode } from "react";
import classes from "./Hero.module.css"

export default function MantineAnchor({ href, children, loader }: { href: string, children?: ReactNode, loader?: ReactNode }) {
    const [hover, setHover] = useState(false)

    return <CustomMantineProvider>
        <Anchor
            href={href}
            onClick={e => {
                e.preventDefault()
            }}
            onPointerEnter={_ => setHover(true)}
            onPointerOut={_ => setHover(false)}
        >
            {children}
        </Anchor>
        {hover && (
            <div className={classes.loader}>
                {loader}
            </div>
        )}
    </CustomMantineProvider>
}