import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Affix, Button } from "@mantine/core";
import { Printer } from "lucide-react";

export default function PrintButton() {
    return <CustomMantineProvider>
        <Affix position={{  bottom: 20, right: 20 }}>
            <Button variant="round" onClick={() => print()}>
                <Printer size={26} />
            </Button>
        </Affix>
    </CustomMantineProvider>
}