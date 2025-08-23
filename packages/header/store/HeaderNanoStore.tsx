import { $pathname } from "./pathname";
import { useIsomorphicEffect } from "@mantine/hooks";

interface IProps {
    links?: Array<{ label: string; href: string }>;
    title?: string;
    pathname: string;
}

export default function HeaderNanoStore({
    links, title, pathname
}: IProps) {
    useIsomorphicEffect(() => {
        $pathname.set(pathname);
    }, [links, title, pathname])
    return <></>;
}