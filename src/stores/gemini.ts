import { FilesetResolver, TextEmbedder } from "@mediapipe/tasks-text"
import { atom } from "nanostores";

const $embedder = atom<TextEmbedder | null>(null)

type PostRecord = {
    id: string;
    records: unknown[];
}

const RECORDS_URL = "/llm/posts_records.ndjson"
const $records = atom<PostRecord[]>([])

// @ts-ignore
const $session = atom<LanguageModelSession | null>(null)


export async function createGeminiSession() {

    // @ts-ignore
    if (!LanguageModel) return

    // @ts-ignore
    const session = await LanguageModel.create()

    $session.set(session)
}

export async function requestModel() {
    const textFiles = await FilesetResolver.forTextTasks("/llm/wasm/");
    const textEmbedder = await TextEmbedder.createFromOptions(
        textFiles,
        {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-tasks/text_embedder/universal_sentence_encoder.tflite`
            },
            quantize: true
        }
    );

    $embedder.set(textEmbedder)
}

export async function requestRecords() {    
    // const { EntityDB} = await import("@babycommando/entity-db")

    const response = await fetch(RECORDS_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch records: ${response.statusText}`);
    }
    const text = await (await response.blob()).text()
    
    const records: PostRecord[] = text
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));

    // const db = new EntityDB({
    //     vectorPath: 'db'
    // })

    // for (const record of records) {
    //     await db.insertManualVectors({
    //        text: record.id,
    //        embedding: record.records
    //     })
    // }

    $records.set(records);
}

export { $records, $embedder }