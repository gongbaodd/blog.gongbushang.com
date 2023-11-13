import React, { type FC } from "react"
import { Card, CardContent, CardTitle, CardDescription, CardHeader, CardFooter } from "@/components/ui/card"
import { buttonVariants } from "./ui/button"
import { badgeVariants } from "./ui/badge"
import dayjs from "dayjs"
import { cn } from "@/lib/utils"
import { FILTER_ENTRY } from "@/consts"

const DateFilter: FC<{ date: Date, filter: string }> = ({ date, filter }) => {
    const year = dayjs(date).format("YYYY")
    const month = dayjs(date).format("MM")
    const monthName = dayjs(date).format("MMMM")
    const day = dayjs(date).format("DD")

    const [entry, secondaryEntry] = filter.split("/")

    const { realEntry } = {
        get realEntry() {
            if (FILTER_ENTRY.TAG === entry || FILTER_ENTRY.SERIES === entry) {
                return `${entry}/${secondaryEntry}`
            }
            return entry
        }
    }

    const monthLink = `/${realEntry}/${year}/${month}`
    const dayLink = `/${realEntry}/${year}/${month}/${day}`
    const yearLink = `/${realEntry}/${year}`

    return (
        <>
            <a key={monthLink} href={monthLink}>{monthName}</a>
            <a key={dayLink} href={dayLink}>{day}</a>,
            <a key={yearLink} href={yearLink}>{year}</a>
        </>
    )
}


interface Props {
    title: string
    date: Date
    excerpt: string
    category: string
    link: string
    filter: string
}

const BlogCard: FC<Props> = ({ title, date, excerpt, category, link, filter }) => {

    return (
        <Card>
            <CardHeader className="relative">
                <CardTitle>{title}</CardTitle>
                <a className={cn(badgeVariants({ variant: "secondary" }), "absolute top-0 right-1")} href={`/${category}`}>{category}</a>
                <CardDescription>
                    <DateFilter date={date} filter={filter} />
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
