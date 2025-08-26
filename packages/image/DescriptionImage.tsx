import type { ReactNode } from "react"
import CustomMantineProvider from "../../src/stores/CustomMantineProvider"
import { Image, SimpleGrid, Stack } from "@mantine/core"

interface Props {
    src: string
    alt: string
    children: ReactNode
}

export default function DescriptionImage({ src, alt, children }: Props) {
    return <CustomMantineProvider>
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={"md"}>
            <Image src={src} alt={alt} mah={500} />
            <Stack gap={"lg"} pt="lg">
                {children}
            </Stack>
        </SimpleGrid>
    </CustomMantineProvider>
}