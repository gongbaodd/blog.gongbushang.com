import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Affix, Button } from "@mantine/core";
import { Printer, Download } from "lucide-react";
import { useEffect, useState } from "react";

export default function PrintButton() {
    const [supportPrint ,setSupportPrint] = useState(globalThis.print !== undefined)

    // useEffect(() => {
    //     setSupportPrint(globalThis.print !== undefined)
    // }, [])

    return <CustomMantineProvider>
        {supportPrint ? (
            <Affix position={{ bottom: 20, right: 20 }}>
                <Button variant="round" onClick={() => print()}>
                    <Printer size={26} />
                </Button>
            </Affix>
        ) : (
            <Affix position={{ bottom: 20, right: 20 }}>
                <Button variant="round" onClick={() => print()}>
                    <Download size={26} />
                </Button>
            </Affix>
        )}

    </CustomMantineProvider>
}