import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import {
  Box,
  Card,
  Image,
  Flex,
  Badge,
  Text,
  Group,
  Title,
  Stack,
} from "@mantine/core";
import { Calendar } from "lucide-react";

const SUT_IMG =
  "https://res.cloudinary.com/dmq8ipket/image/upload/v1778328777/STU_kinje0.jpg";
const TLU_IMG =
  "https://res.cloudinary.com/dmq8ipket/image/upload/v1778330602/copy_of_copy_of_tlu_hvawhg_a86549_6afe2e.jpg";
const BAT_IMG =
  "https://res.cloudinary.com/dmq8ipket/image/upload/v1778330088/BAT_ihgz7p.jpg";
const UL_IMG =
  "https://res.cloudinary.com/dmq8ipket/image/upload/v1778330248/UniversidadeLusofona-logo_wxfo5o.jpg";

const data = [
  {
    key: "SUT",
    img: SUT_IMG,
    content: "Bachelor in Computer Science",
    name: "Shenyang University of Technology",
    date: "2011-2015",
  },
  {
    key: "TLU",
    img: TLU_IMG,
    content: "Master in Digital Learning Games",
    name: "Tallinn University",
    date: "2024-2026",
  },
  {
    key: "BAT",
    img: BAT_IMG,
    name: "Brandenburg University of Applied Sciences",
    content: "Interactive Environments",
    date: "Dec 2025",
  },
  {
    key: "UL",
    img: UL_IMG,
    name: "Universidade Lusófona",
    date: "Jan 2026",
    content: "Data Science Applied To Geographic Information Systems"
  },
];

export default function Education() {
  return (
    <CustomMantineProvider>
      <Flex justify="space-between" align="center" direction="row" gap={10}>
        {data.map((i) => {
          return <SchoolCard img={i.img} date={i.date} name={i.name} content={i.content} />;
        })}
      </Flex>
    </CustomMantineProvider>
  );
}

interface IProps {
  img: string;
  date: string;
  name: string;
  content: string;
}

function SchoolCard(opts: IProps) {
  return (
    <Box maw={148} mah={124}>
      <Stack gap={"sm"}>
        <Card padding="sm" radius="lg" maw={124} withBorder>
          <Image src={opts.img} />
          <Flex justify={"center"}>
            <Badge
              color="gray"
              size="sm"
              variant="default"
              style={{ textOverflow: "none" }}
            >
              <Group gap={6}>
                <Calendar size={12} />
                <Text size="xs" style={{ paddingTop: "4px" }}>{opts.date}</Text>
              </Group>
            </Badge>
          </Flex>
        </Card>
        <Stack gap={"sm"}>
          <Text size="md" style={{ fontWeight: 500, marginBottom: 0 }}>{opts.name}</Text>
          <Text size="xs">{opts.content}</Text>
        </Stack>
      </Stack>
    </Box>
  );
}