import { ActionIcon, Loader } from "@mantine/core";
import CustomMantineProvider from "../stores/CustomMantineProvider";

export default function MantineLoader() {
    return <CustomMantineProvider>
        <ActionIcon variant="outline" radius={"xl"}>
            <Loader size={16} />
        </ActionIcon>
    </CustomMantineProvider>
}