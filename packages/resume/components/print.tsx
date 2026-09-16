import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { $isPrintSupported, PRINT_SUPPORT_STATUS, requestPrint } from "@/src/stores/print";
import { pdfPath, type ResumeLanguage, type ResumeRole } from "@/packages/resume/data";
import { Affix, Anchor, Button, Flex, Text } from "@mantine/core";
import { useStore } from "@nanostores/react";
import { Printer, FileDown } from "lucide-react";

export default function PrintButton({ role = "universal", language = "en" }: { role?: ResumeRole; language?: ResumeLanguage }) {
    const supportPrint = useStore($isPrintSupported)
    const pdfHref = pdfPath(role, language);
    return <CustomMantineProvider>
        {supportPrint !== PRINT_SUPPORT_STATUS.FALSE ? (
            <Affix position={{ bottom: 20, right: 20 }}>
                <Flex gap={8} align="center">
                    <Anchor href={pdfHref} download aria-label="Download PDF">
                        <Button variant="round" leftSection={<FileDown size={26} />} component="span">
                            <Flex direction={"column"}>
                                <Text size="xs">Download PDF</Text>
                            </Flex>
                        </Button>
                    </Anchor>
                    <Button variant="round" onClick={() => requestPrint()} aria-label="Print">
                        <Printer size={26} />
                    </Button>
                </Flex>
            </Affix>
        ) : (
            <Affix position={{ bottom: 20, right: 20 }}>
                <Anchor href={pdfHref} download aria-label="Download PDF">
                    <Button variant="round" leftSection={<FileDown size={26} />} component="span">
                        <Flex direction={"column"}>
                            <Text size="xs">Not Working?</Text>
                            <Text size="xs">Download PDF</Text>
                        </Flex>
                    </Button>
                </Anchor>
            </Affix>
        )}

    </CustomMantineProvider>
}
