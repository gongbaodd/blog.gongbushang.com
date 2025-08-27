import Map, { Marker } from 'react-map-gl/maplibre';
import CustomMantineProvider from '@/src/stores/CustomMantineProvider';
import { Anchor, Card } from '@mantine/core';
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
}

export default function GLMap({ data }: IMapProps) {
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
            >
                <Map
                    initialViewState={{ longitude: 50, latitude: 58, zoom }}
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
            </Card>
        </CustomMantineProvider>
    );
}