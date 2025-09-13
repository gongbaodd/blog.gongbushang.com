import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Affix, Button, Flex, Text } from "@mantine/core";
import { Printer, File } from "lucide-react";
import { useEffect, useState } from "react";

export default function PrintButton() {
    const [supportPrint, setSupportPrint] = useState(globalThis.print !== undefined)

    useEffect(() => {
        const printWindowOpened = () => {
            setSupportPrint(false)
        }

        window.addEventListener("beforeprint", printWindowOpened);

        return () => {
            window.removeEventListener("beforeprint", printWindowOpened)
        }
    }, [])

    return <CustomMantineProvider>
        {supportPrint ? (
            <Affix position={{ bottom: 20, right: 20 }}>
                <Button variant="round" onClick={() => print()}>
                    <Printer size={26} />
                </Button>
            </Affix>
        ) : (
            <Affix position={{ bottom: 20, right: 20 }}>
                <Button variant="round" leftSection={<File size={26} />} onClick={() => location.href="https://res.cloudinary.com/dmq8ipket/image/upload/v1757748988/Resume_-_Jian_Gong_-_Web_Game_Dev_kkddqr.pdf"}>
                   <Flex direction={"column"}>
                        <Text size="xs">Not Working?</Text>
                        <Text size="xs">Download PDF</Text>
                    </Flex>
                </Button>
            </Affix>
        )}

    </CustomMantineProvider>
}