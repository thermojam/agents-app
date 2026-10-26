/// <reference types="vite/client" />
import {type DocumentContent, type SourceDocument, validateDocument} from './document'

const files = import.meta.glob<unknown>(
    ['../docs/agents-tools/*.json', '!../docs/agents-tools/budget.json'],
    {eager: true, import: 'default'},
)
const source = files['../docs/agents-tools/source.json'] as SourceDocument

export type Work = {
    name: string
    document?: DocumentContent
    error?: string
}

export const works: Work[] = Object.entries(files)
    .filter(([path]) => !/\/(source|budget)\.json$/.test(path))
    .map(([path, json]) => {
        const name = path.split('/').pop()!.replace(/\.json$/, '')
        try {
            return {name, document: validateDocument(json, source)}
        } catch (error) {
            return {name, error: error instanceof Error ? error.message : String(error)}
        }
    })
