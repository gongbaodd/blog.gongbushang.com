import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Card, Flex, Stack, Text, Badge, Anchor } from "@mantine/core";

const data = [
  {
    key: "xd drone",
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1778359976/Screenshot_20260509_235020_ygfgdn.png",
    name: "XR Drone simulator",
    height: 160,
    items: ["Unity", "MRTK", "PID Control", "ML Agent", "PyTorch"],
    url: "https://github.com/gongbaodd/xr-drone-thesis/blob/master/main.pdf",
  },
  {
    key: "grandpa",
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1778358907/grandpa_hrnltl.jpg",
    name: "Kickstart Now OÜ",
    content: "Grandpa's Bee Haven",
    height: 120,
    items: ["Unity", "Localization"],
    url: "https://store.steampowered.com/app/3209160/Grandpas_Bee_Haven/",
  },
  {
    key: "tetris",
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1758702645/Screenshot_2025-09-24_112929_iaqeay.png",
    name: "Tetris AI",
    height: 200,
    items: ["PixiJS", "Mini-Max"],
    url: "https://www.growgen.xyz/fe/2025/09/09/tetris-ai",
  },
  {
    key: "missile",
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1778365995/defender_instruction_erc481_j9xs7w.png",
    name: "3D Missile Command MMRPG",
    height: 200,
    items: ["BabylonJS", "Colyseus", "Node.js"],
    url: "https://www.growgen.xyz/plan/2025/10/08/remake-of-missile-command",
  },
  {
    key: "hearing",
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1778360397/hearing-aid.Auxz8chm_vscant.jpg",
    name: "Hearing Aid",
    height: 220,
    items: ["Arduino", "Edge ML", "MFCC", "CNN"],
    url: "https://www.growgen.xyz/plan/2025/08/02/week-32-edge-impulse",
  },
  {
    key: "ninja_paws",
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1757494717/Screenshot_2025-09-10_115254_xrklg6.png",
    name: "Ninja Paws",
    height: 160,
    items: ["Unity", "Behavior Tree"],
    url: "https://www.growgen.xyz/lab/2025/07/04/ninja-paws",
  },
  {
    key: "school_tour",
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1757489746/1747656883140_hkuw9u.jpg",
    name: "Tallinn University XR tour",
    height: 200,
    items: ["BabylonJS", "3DGS"],
    url: "https://www.growgen.xyz/lab/2025/05/19/tlu-xr-tour",
  },
  {
    key: "kitchen",
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1778361472/Screenshot_20260510_001659-1_gaycsj.png",
    name: "Baltic Kitchen Kaos",
    height: 180,
    items: ["Unity", "ReactJS", "MediaPipe"],
    url: "https://www.growgen.xyz/lab/2025/05/20/baltic-kitchen-chaos",
  },
  {
    key: "Enchanted",
    image:
      "https://img.itch.zone/aW1nLzE5ODg1ODg3LnBuZw==/347x500/AC%2BLS0.png",
    name: "Enchanted Wizard",
    height: 200,
    items: ["Godot"],
    url: "https://www.growgen.xyz/lab/2025/02/15/enchanted-wizard",
  },
  {
    key: "Aftership.com",
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1778362981/AfterShip_sm_pb1k3l.webp",
    name: "Aftership.com",
    content: `Courier Information Service | Crawler | Analytics Dashboard`,
    height: 240,
    items: [
      "Google K8S",
      "AWS",
      "Python",
      "ReactJS",
      "Node.js",
      "Shopify Polaris",
    ],
    fit: "contain",
    url: "https://www.aftership.com",
  },
  {
    key: "Qunar.com",
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1778363157/Qunar_logo_mmk06d.png",
    name: "Qunar.com",
    content:
      "Cashier Service  | Withdraw Service  | Bank Card Management  | Frontend Analytics  | Testing Tool",
    height: 240,
    items: ["jQuery", "React Native", "Node.js", "Grafana"],
    fit: "contain",
    url: "https://www.qunar.com",
  },
  {
    key: "GrowGen.xyz",
    image:
      "https://res.cloudinary.com/dmq8ipket/image/upload/v1778367308/Screenshot_20260510_015306-1_z8otjx.png",
    name: "Read More on My Website",
    height: 280,
    items: ["Astro", "ReactJS", "Mantine"],
    url: "https://www.growgen.xyz/lab",
  },
];

const columns = [0, 1, 2];

export default function Work() {
  return (
    <CustomMantineProvider theme="light">
      <Flex direction={"row"} justify={"space-between"}>
        {columns.map((col) => {
          return (
            <Stack key={col} maw={228} gap="sm">
              {data
                .filter((_d, i) => i % columns.length === col)
                .map((d) => {
                  return (
                    <Anchor href={d.url} target={"_blank"} className="work">
                      <Stack key={d.key} gap={0}>
                        <Card
                          padding="sm"
                          radius="lg"
                          withBorder
                          miw={224}
                          mih={d.height ?? 180}
                          style={{
                            backgroundImage: `url(${d.image})`,
                            backgroundSize: d.fit ?? "cover",
                          }}
                        >
                          <Stack gap={2}>
                            {d.items &&
                              d.items.map((item) => {
                                return (
                                  <Badge
                                    color="gray"
                                    variant="default"
                                    size="sm"
                                    style={{
                                      textTransform: "none",
                                      opacity: 0.85,
                                    }}
                                  >
                                    <Text
                                      key={item}
                                      size="sm"
                                      style={{ marginBottom: 0 }}
                                    >
                                      {item}
                                    </Text>
                                  </Badge>
                                );
                              })}
                          </Stack>
                        </Card>
                        <Stack gap={0}>
                          <Text
                            size="md"
                            style={{ fontWeight: 500, marginBottom: 0 }}
                          >
                            {d.name}
                          </Text>
                          {d.content && (
                            <Text size="sm" style={{ marginBottom: 0 }}>
                              {d.content}
                            </Text>
                          )}
                        </Stack>
                      </Stack>
                    </Anchor>
                  );
                })}
            </Stack>
          );
        })}
      </Flex>
    </CustomMantineProvider>
  );
}
