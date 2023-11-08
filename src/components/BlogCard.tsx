import type { FC } from "react"
import React from "react"
import { Card, CardContent, CardTitle, CardDescription, CardHeader, CardFooter } from "@/components/ui/card"
import { Button } from "./ui/button"
import dayjs from "dayjs"

interface Props {
    title: string
    date: Date
}

const BlogCard: FC<Props> = ({ title, date }) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{dayjs(date).format("MMMM D, YYYY")}</CardDescription>
            </CardHeader>
            <CardContent></CardContent>
            <CardFooter className="flex-row-reverse">
                <Button variant="outline">Read More</Button>
            </CardFooter>
        </Card>
    )
}

export default BlogCard
