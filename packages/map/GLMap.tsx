import Map, { Marker } from 'react-map-gl/maplibre';
import CustomMantineProvider from '@/src/stores/CustomMantineProvider';
import { Anchor, Button, Card, Center, Group } from '@mantine/core';
import "maplibre-gl/dist/maplibre-gl.css"
import { MapPin } from 'lucide-react';
import { useMediaQuery } from '@mantine/hooks';


export interface IMapData {
    name: string
    location: {
        latitude: number
        longitude: number
    }
    id: string
}

interface IMapProps {
    data: IMapData[]
    showButton?: boolean
}

export default function GLMap({ data, showButton }: IMapProps) {
    const sm = useMediaQuery('(max-width: 48em)');
    const { zoom } = {
        get zoom() {
            if (sm) return 8
            return 2
        }
    }

    return (
        <CustomMantineProvider>
            <Card
                shadow="sm"
                padding={0}
                radius="lg"
                h={"40vh"}
                style={{ position: "relative" }}
            >
                <Map
                    initialViewState={{ longitude: 50, latitude: 45, zoom }}
                    style={{ width: "100%", height: "100%" }}
                    mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
                >
                    {data.map(d => {
                        return (
                            <Marker longitude={d.location.longitude} latitude={d.location.latitude} key={d.name}>
                                <Anchor
                                    onClick={() => { }}
                                    style={{ fontSize: "24px", cursor: "pointer" }}
                                    c={"red"}
                                >
                                 <MapPin fill='white' size={28}/>
                                </Anchor>
                            </Marker>
                        )
                    })}

                </Map>
                {showButton &&
                    <Group justify='center' style={{ position: 'absolute', left: 0, top: 0, width: "100%", height: "100%" }}>
                        <Center>
                            <Anchor href={"/world"}>
                                <Button size='xl'>See {data.length} Desinations</Button>
                            </Anchor>
                        </Center>
                    </Group>
                }
            </Card>
        </CustomMantineProvider>
    );
}