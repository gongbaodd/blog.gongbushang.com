import { useEffect } from "react";
import { $pathname } from "./pathname";
import type { TransitionBeforeSwapEvent } from "astro:transitions/client";

interface IProps {
    links?: Array<{ label: string; href: string }>;
    title?: string;
    pathname: string;
}

export default function HeaderNanoStore({
    links, title, pathname
}: IProps) {
    useEffect(() => {
        $pathname.set(pathname);
    }, [links, title, pathname])

    useEffect(() => {
        const handler = (event: TransitionBeforeSwapEvent) => {
            $pathname.set(event.to.pathname)
        }

        document.addEventListener("astro:before-swap", handler);

        return () => {
            document.removeEventListener("astro:before-swap", handler)
        }
    }, [])

    return <></>;
}