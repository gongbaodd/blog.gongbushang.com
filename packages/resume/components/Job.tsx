import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Flex, Stack, Card, Badge, Image, Text, Group } from "@mantine/core";
import { Calendar } from "lucide-react";

const datas = [
  {
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1778363157/Qunar_logo_mmk06d.png",
    date: "2015-2019",
    name: "Qunar.com",
    content: "Developed a frontend monitoring system that identified 90% of client-side issues before backend log analysis."
  },
  {
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1778362981/AfterShip_sm_pb1k3l.webp",
    date: "2019-2021",
    name: "Aftership.com",
    content: "Automated crawler mapping workflows, reducing manual effort by 20% of sprint story points; led end-to-end testing initiatives, increasing test coverage to 96%."
  },
  {
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1778517285/header_xgzuqo.jpg",
    date: "2025-2026",
    name: "Kickstart Now",
    content:  "Automated the cloud-to-local translation pipeline, enabling support for 12 languages."
  },
];

export default function Job() {
  return (
    <CustomMantineProvider theme="light">
      <Flex direction={"row"} justify={"space-between"}>
        {datas.map((d) => {
          return (
            <Card key={d.name} padding="sm" radius="lg" maw={220} withBorder>
              <Stack gap={4}>
                <Flex direction={"row"} gap={4}>
                  <Image src={d.image} maw={88} />
                  <Stack gap={4} style={{ alignSelf: "center" }}>
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
      </Flex>
    </CustomMantineProvider>
  );
}
