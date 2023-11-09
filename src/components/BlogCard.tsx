import type { FC } from "react"
import React from "react"
import { Card, CardContent, CardTitle, CardDescription, CardHeader, CardFooter } from "@/components/ui/card"
import { buttonVariants } from "./ui/button"
import dayjs from "dayjs"

interface Props {
    title: string
    date: Date
    excerpt: string
}

const BlogCard: FC<Props> = ({ title, date, excerpt }) => {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>{dayjs(date).format("MMMM D, YYYY")}</CardDescription>
            </CardHeader>
            <CardContent>
                <p>{excerpt}</p>
            </CardContent>
            <CardFooter className="flex-row-reverse">
                <a className={buttonVariants({ variant: "outline" })}>Read More</a>
            </CardFooter>
        </Card>
    )
}

export default BlogCard
