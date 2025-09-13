import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { $isPrintSupported, PRINT_SUPPORT_STATUS, requestPDF, requestPrint } from "@/src/stores/print";
import { Affix, Button, Flex, Text } from "@mantine/core";
import { useStore } from "@nanostores/react";
import { Printer, File } from "lucide-react";

export default function PrintButton() {
    const supportPrint = useStore($isPrintSupported)
    return <CustomMantineProvider>
        {supportPrint !== PRINT_SUPPORT_STATUS.FALSE ? (
            <Affix position={{ bottom: 20, right: 20 }}>
                <Button variant="round" onClick={() => requestPrint()}>
                    <Printer size={26} />
                </Button>
            </Affix>
        ) : (
            <Affix position={{ bottom: 20, right: 20 }}>
                <Button variant="round" leftSection={<File size={26} />} onClick={() => requestPDF()}>
                   <Flex direction={"column"}>
                        <Text size="xs">Not Working?</Text>
                        <Text size="xs">Download PDF</Text>
                    </Flex>
                </Button>
            </Affix>
        )}

    </CustomMantineProvider>
}