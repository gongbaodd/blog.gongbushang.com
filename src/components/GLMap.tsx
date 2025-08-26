import Map, { Marker } from 'react-map-gl/maplibre';
import CustomMantineProvider from '../stores/CustomMantineProvider';
import { Card } from '@mantine/core';

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
        <Map
            initialViewState={{ longitude: 24.7536, latitude: 59.4370, zoom: 4 }}
            style={{ width: "100%", height: 500 }}
            mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
        >
            {/* marker is INSIDE <Map> */}
            <Marker longitude={24.7536} latitude={59.4370} anchor="bottom">
                📍
            </Marker>
            <Marker longitude={12.4964} latitude={41.9028} anchor="bottom">
                📍
            </Marker>
        </Map>
    )


    // return (
        // <CustomMantineProvider>
        //     <Card
        //         shadow="sm"
        //         padding={0}
        //         radius="lg"
        //     >
                // <Map
                //     initialViewState={{ longitude: 60, latitude: 45, zoom: 1 }}
                //     style={{ width: 1200, height: 600 }}
                //     mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
                // >
                //     {data.map(d => {
                //         return (
                //             <Marker longitude={d.location.longitude} latitude={d.location.latitude} key={d.name}>
                //                 <div
                //                     onClick={() => {}}
                //                     style={{ fontSize: "24px", cursor: "pointer" }}
                //                 >
                //                     📍
                //                 </div>
                //             </Marker>
                //         )
                //     })}

                // </Map>
        //     </Card>
        // </CustomMantineProvider>
    // );
}