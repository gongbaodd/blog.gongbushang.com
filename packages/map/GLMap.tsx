import Map, { Marker } from "react-map-gl/maplibre";
import CustomMantineProvider from "@/src/stores/CustomMantineProvider";
import { Anchor, Button, Card, Group, Stack } from "@mantine/core";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPin } from "lucide-react";
import { useMediaQuery } from "@mantine/hooks";
import { useStore } from "@nanostores/react";
import { $cities, requestCitiesData } from "./store/city";
import { useEffect } from "react";
import { AsciiReveal, AsciiSkeleton } from "ascii-reveal";
import ReactErrorBoundary from "@/src/components/ReactErrorBoundary";
import { $pathnameNormalized } from "../header/store/pathname";
import { ROUTE_HREF } from "../consts";

export interface IMapData {
  name: string;
  slug: string;
  location: {
    latitude: number;
    longitude: number;
  };
  id: string;
}

interface IMapProps {
  showButton?: boolean;
  /** Build-time destination count, shown until the cities data arrives. */
  cityCount?: number;
}

export default function GLMap({ cityCount = 0 }: IMapProps) {
  const data = useStore($cities);
  const pathname = useStore($pathnameNormalized);
  const showButton = pathname !== ROUTE_HREF.World;
  const loadingCities = data.length === 0;

  const sm = useMediaQuery("(max-width: 48em)");
  const { zoom } = {
    get zoom() {
      if (sm) return 8;
      return 2;
    },
  };

  useEffect(() => {
    requestCitiesData();
  }, []);

  return (
    <CustomMantineProvider>
      <Card
        shadow="sm"
        padding={"lg"}
        radius="lg"
        h={"40vh"}
        display="flex"
        style={{ flexDirection: "column" }}
      >
        <Card.Section
          flex={showButton ? undefined : 1}
          h={showButton ? "30vh" : undefined}
          style={showButton ? { position: "relative" } : { minHeight: 0, position: "relative" }}
        >
          {loadingCities && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10,
                overflow: "hidden",
                pointerEvents: "none",
                background: "var(--mantine-color-body)",
                "--ascii-skeleton": "var(--mantine-primary-color-filled)",
              } as React.CSSProperties}
            >
              {/* A skeleton's glyph pattern has a fixed width (~900px), so tile it across wide maps. */}
              <div style={{ display: "flex", width: "100%", height: "100%" }}>
                {[1, 2, 3].map((seed) => (
                  <AsciiSkeleton
                    key={seed}
                    as="div"
                    rows={40}
                    height="100%"
                    seed={seed}
                    style={{ flex: "1 1 0", minWidth: 0 }}
                  />
                ))}
              </div>
            </div>
          )}
          <ReactErrorBoundary label="GLMap failed to render">
            <Map
              initialViewState={{ longitude: 50, latitude: 45, zoom }}
              style={{ width: "100%", height: "100%" }}
              mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
            >
              {data.map((d) => {
                return (
                  <Marker
                    longitude={d.location.longitude}
                    latitude={d.location.latitude}
                    key={d.slug}
                  >
                    <Anchor
                      href={`/world/${d.slug}`}
                      style={{ fontSize: "24px", cursor: "pointer" }}
                      c={"red"}
                    >
                      <MapPin fill="white" size={28} />
                    </Anchor>
                  </Marker>
                );
              })}
            </Map>
          </ReactErrorBoundary>
        </Card.Section>

        {showButton && (
          <AsciiReveal
            loading={loadingCities}
            shimmer={false}
            revealOnMount={false}
            selector="[data-ascii-text]"
          >
            <Group justify="center" h={"10vh"}>
              <Anchor href={"/world"}>
                <Button size="xl">
                  <span data-ascii-text>See {data.length || cityCount} Destinations</span>
                </Button>
              </Anchor>
            </Group>
          </AsciiReveal>
        )}
      </Card>
    </CustomMantineProvider>
  );
}
