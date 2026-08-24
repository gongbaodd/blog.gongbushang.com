import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Flex, Stack, Card, Badge, Image, Text, Group, SimpleGrid } from "@mantine/core";
import { Calendar } from "lucide-react";

const datas = [
  {
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1778330602/copy_of_copy_of_tlu_hvawhg_a86549_6afe2e.jpg",
    date: "JUL 2026",
    name: "Tallinn University",
    content:
      "Lecturing course \"From Atom to Products – Developing Design Systems in Figma\"",
  },
  {
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1778517285/header_xgzuqo.jpg",
    date: "2025-2026",
    name: "Kickstart Now OÜ",
    content:
      "Automated the translation pipeline; programmed game play and automation tests.",
  },
  {
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1778362981/AfterShip_sm_pb1k3l.webp",
    date: "2019-2021",
    name: "Aftership.com",
    content:
      "Automated crawler mapping workflows, reducing manual effort by 20% of sprint story points; led end-to-end testing initiatives, increasing test coverage to 96%.",
  },
  {
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1785759396/trip_yw7gaq.png",
    date: "2015-2019",
    name: "Trip.com",
    content:
      "Developed a frontend monitoring system that identified 90% of client-side issues before backend log analysis.",
  },
];

export default function Job() {
  return (
    <CustomMantineProvider theme="light">
      <SimpleGrid cols={2} spacing="sm">
        {datas.map((d) => {
          return (
            <Card key={d.name} padding="sm" radius="lg" withBorder bg="white" c="black">
              <Stack gap={4}>
                <Flex direction="row" gap={6} align="center">
                  <Image
                    src={d.image}
                    w={40}
                    h={40}
                    fit="contain"
                    style={{ flexShrink: 0, marginBottom: 0 }}
                  />
                  <Stack gap={4} style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      size="md"
                      style={{ fontWeight: 500, marginBottom: 0 }}
                    >
                      {d.name}
                    </Text>
                    <Badge
                      color="gray"
                      size="sm"
                      variant="default"
                      style={{
                        textOverflow: "none",
                      }}
                    >
                      <Group gap={6}>
                        <Calendar size={12} />
                        <Text size="xs" style={{ paddingTop: "4px" }}>
                          {d.date}
                        </Text>
                      </Group>
                    </Badge>
                  </Stack>
                </Flex>

                <Text size="xs">{d.content}</Text>
              </Stack>
            </Card>
          );
        })}
      </SimpleGrid>
    </CustomMantineProvider>
  );
}
