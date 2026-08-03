import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import {
  Card,
  Image,
  Flex,
  Badge,
  Text,
  Group,
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
    content: "Computer Science",
    degree: "BSc",
    name: "Shenyang University of Technology",
    date: "2011-2015",
  },
  {
    key: "TLU",
    img: TLU_IMG,
    content: "Digital Learning Games",
    degree: "MSc",
    award:
      "National Scholarship for International Students, Education and Youth Board of Estonia (2026)",
    name: "Tallinn University",
    date: "2024-2026",
  },
  {
    key: "BAT",
    img: BAT_IMG,
    name: "Brandenburg University of Applied Sciences",
    content: "Interactive Environments",
    date: "Dec 2025",
    isSmall: true,
  },
  {
    key: "UL",
    img: UL_IMG,
    name: "Universidade Lusófona",
    date: "Jan 2026",
    content: "Data Science Applied To Geographic Information Systems",
    isSmall: true,
  },
];

export default function Education() {
  const main = data.filter((i) => !i.isSmall);
  const small = data.filter((i) => i.isSmall);

  return (
    <CustomMantineProvider theme="light">
      <Flex justify="space-between" align="stretch" direction="row" gap={8}>
        {main.map((i) => (
          <LargeSchoolCard
            key={i.key}
            img={i.img}
            date={i.date}
            name={i.name}
            content={i.content}
            award={i.award}
            degree={i.degree}
          />
        ))}
        <Stack gap={4}>
          {small.map((i) => (
            <CompactSchoolRow
              key={i.key}
              img={i.img}
              date={i.date}
              name={i.name}
              content={i.content}
            />
          ))}
        </Stack>
      </Flex>
    </CustomMantineProvider>
  );
}

interface ISchoolProps {
  img: string;
  date: string;
  name: string;
  content: string;
  award?: string;
  degree?: string;
}

function DateBadge({ date }: { date: string }) {
  return (
    <Badge
      color="gray"
      size="xs"
      variant="default"
      style={{
        textOverflow: "none",
      }}
    >
      <Group gap={4}>
        <Calendar size={10} />
        <Text size="xs" style={{ paddingTop: "2px" }}>
          {date}
        </Text>
      </Group>
    </Badge>
  );
}

function LargeSchoolCard(opts: ISchoolProps) {
  return (
    <Card padding="xs" radius="lg" maw={220} withBorder pos="relative" bg="white" c="black">
      {opts.degree ? (
        <Badge
          size="xs"
          color="gray"
          variant="filled"
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            zIndex: 1,
            borderRadius: "0 var(--mantine-radius-lg) 0 6px",
            textTransform: "none",
          }}
        >
          {opts.degree}
        </Badge>
      ) : null}
      <Stack gap={8}>
        <Flex direction="row" gap={6} align="center" style={{ minHeight: 64 }}>
          <Image
            src={opts.img}
            w={40}
            h={40}
            fit="contain"
            style={{ flexShrink: 0 }}
          />
          <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
            <Text size="sm" style={{ fontWeight: 500, marginBottom: 0 }}>
              {opts.name}
            </Text>
            <DateBadge date={opts.date} />
          </Stack>
        </Flex>
        <Stack gap={0}>
          <Text size="xs">{opts.content}</Text>
          {opts.award ? (
            <Text size="xs">
              <b>Award:</b> {opts.award}
            </Text>
          ) : null}
        </Stack>
      </Stack>
    </Card>
  );
}

function CompactSchoolRow(opts: ISchoolProps) {
  return (
    <Card padding="xs" radius="md" withBorder bg="white" c="black">
      <Flex direction="row" gap={6} align="center">
        <Image
          src={opts.img}
          w={24}
          h={24}
          fit="contain"
          style={{ flexShrink: 0 }}
        />
        <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
          <Text size="xs" style={{ fontWeight: 500, marginBottom: 0 }}>
            {opts.name}
          </Text>
          <DateBadge date={opts.date} />
          <Text size="xs">{opts.content}</Text>
        </Stack>
      </Flex>
    </Card>
  );
}
