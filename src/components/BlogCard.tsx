import React, { type FC } from "react"
import { Card, CardContent, CardTitle, CardDescription, CardHeader, CardFooter } from "@/components/ui/card"
import { buttonVariants } from "./ui/button"
import { badgeVariants } from "./ui/badge"
import dayjs from "dayjs"
import { cn } from "@/lib/utils"

interface Props {
    title: string
    date: Date
    excerpt: string
    category: string
    link: string
}

const BlogCard: FC<Props> = ({ title, date, excerpt, category, link }) => {
    const year = dayjs(date).format("YYYY")
    const month = dayjs(date).format("MM")
    const monthName = dayjs(date).format("MMMM")
    const day = dayjs(date).format("DD")

    return (
        <Card>
            <CardHeader className="relative">
                <CardTitle>{title}</CardTitle>
                <a className={cn(badgeVariants({ variant: "secondary" }), "absolute top-0 right-1")} href={`/${category}`}>{category}</a>
                <CardDescription>
                    <a href={`/${category}/${year}/${month}`}>{monthName}</a>
                    <a href={`/${category}/${year}/${month}/${day}`}>{day}</a>,
                    <a href={`/${category}/${year}`}>{year}</a>
                </CardDescription>
            </CardHeader>
            <CardContent>
                <p>{excerpt}</p>
            </CardContent>
            <CardFooter className="flex-row-reverse">
                <a className={buttonVariants({ variant: "outline" })} href={link}>Read More</a>
            </CardFooter>
        </Card>
    )
}

export default BlogCard
