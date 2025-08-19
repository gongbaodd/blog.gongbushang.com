import { Container, Flex } from "@mantine/core";
import CustomMantineProvider from "../stores/CustomMantineProvider";
import Folder from "../bits/Components/Folder/Folder";

export default function Years() {
    return (
        <CustomMantineProvider>
            <Container fluid style={{ marginInline: "initial" }}>
                <Flex>
                    <Folder />
                </Flex>
            </Container>
        </CustomMantineProvider>
    )
}