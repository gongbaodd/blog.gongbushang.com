import Map, { Marker } from 'react-map-gl/maplibre';
import CustomMantineProvider from '../stores/CustomMantineProvider';
import { Anchor, Card } from '@mantine/core';
import "maplibre-gl/dist/maplibre-gl.css"
import { MapPin } from 'lucide-react';

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
    return (
        <CustomMantineProvider>
            <Card
                shadow="sm"
                padding={0}
                radius="lg"
                h={"80vh"}
            >
                <Map
                    initialViewState={{ longitude: 60, latitude: 45, zoom: 3 }}
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