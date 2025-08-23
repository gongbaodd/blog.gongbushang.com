import { useEffect } from "react";
import { $pathname } from "./pathname";

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
    return <></>;
}