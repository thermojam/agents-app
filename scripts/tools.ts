import { mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { DocumentContent } from '../src/document.ts'
import { getDocumentStatus } from './document-status.ts'
import { saveValidatedDraft } from './draft.ts'
import { getWorkPaths, readValidatedDraft } from './approval.ts'
import { createPdf } from './pdf.ts'
import { fetchSource, saveSource } from './source.ts'
import { ARTICLE_TERMS, findUnexplainedTerms } from './terms.ts'
import type { SourceDocument } from './source.ts'
import type { ToolDefinition } from './model.ts'
import { writeQualityReport } from './report.ts'

export const CURRENT_WORK_NAME = 'building-agents'
const SOURCE_PATH = resolve('docs/agents-tools', CURRENT_WORK_NAME, 'source.json')

export const DOCUMENT_TOOL_DEFINITIONS: ToolDefinition[] = [
    {
        type: 'function',
        function: {
            name: 'fetch_article',
            description: 'Загружает одну разрешённую статью OpenAI и сохраняет её как источник текущей работы.',
            parameters: {
                type: 'object',
                properties: { url: { type: 'string', description: 'HTTPS-ссылка на статью OpenAI' } },
                required: ['url'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'save_draft',
            description: 'Проверяет и сохраняет содержание черновика текущей работы.',
            parameters: {
                type: 'object',
                properties: { document: { type: 'object', description: 'Содержание документа в согласованной структуре' } },
                required: ['document'],
                additionalProperties: false,
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'validate_draft',
            description: 'Проверяет сохранённый черновик текущей работы по структуре и ссылкам на источник.',
            parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_document_status',
            description: 'Возвращает состояние текущей работы: черновик, просмотр, approval и PDF.',
            parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
        },
    },
    {
        type: 'function',
        function: {
            name: 'find_unexplained_terms',
            description: 'Ищет в текущем черновике термины из фиксированного списка (guardrails, RAG, MCP, jailbreak) и отмечает те, для которых не найдено простое объяснение. Это подсказка для ручной проверки понятности, а не доказательство качества текста.',
            parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
        },
    },
    {
        type: 'function',
        function: {
            name: 'render_pdf',
            description: 'Создаёт PDF текущей работы только если её содержание утверждено человеком.',
            parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
        },
    },
]

type ToolArguments = Record<string, unknown>

function readSource(): SourceDocument {
    return JSON.parse(readFileSync(SOURCE_PATH, 'utf8')) as SourceDocument
}

function asArguments(value: unknown): ToolArguments {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Аргументы инструмента должны быть JSON-объектом')
    }
    return value as ToolArguments
}

function parseArguments(rawArguments: string): ToolArguments {
    try {
        return asArguments(JSON.parse(rawArguments))
    } catch (error) {
        if (error instanceof Error && error.message === 'Аргументы инструмента должны быть JSON-объектом') throw error
        throw new Error('Аргументы инструмента должны быть корректным JSON-объектом')
    }
}

function assertExactFields(args: ToolArguments, toolName: string, required: string[]): void {
    const allowed = new Set(required)
    for (const key of Object.keys(args)) {
        if (!allowed.has(key)) throw new Error(`${toolName}: поле «${key}» не разрешено`)
    }
    for (const key of required) {
        if (!(key in args)) throw new Error(`${toolName}: отсутствует поле «${key}»`)
    }
}

function requiredString(args: ToolArguments, toolName: string, field: string): string {
    const value = args[field]
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`${toolName}: поле «${field}» должно быть непустой строкой`)
    }
    return value.trim()
}

function requiredDocument(args: ToolArguments, toolName: string): unknown {
    const value = args.document
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${toolName}: поле «document» должно быть объектом`)
    }
    return value
}

function countBlocks(document: DocumentContent): number {
    return document.sections.reduce((total, section) => total + section.blocks.length, 0)
}

export async function executeTool(name: unknown, rawArguments: unknown): Promise<string> {
    if (typeof name !== 'string' || !DOCUMENT_TOOL_DEFINITIONS.some((tool) => tool.function.name === name)) {
        throw new Error(`Инструмент «${String(name)}» не разрешён`)
    }
    if (typeof rawArguments !== 'string') throw new Error(`${name}: аргументы должны быть JSON-строкой`)

    const args = parseArguments(rawArguments)
    const paths = getWorkPaths(CURRENT_WORK_NAME)

    if (name === 'fetch_article') {
        assertExactFields(args, name, ['url'])
        const source = await fetchSource(requiredString(args, name, 'url'))
        saveSource(source, paths.workDir)
        return JSON.stringify({
            saved: true,
            url: source.url,
            title: source.title,
            parts: source.parts.map(({ id, heading, text }) => ({ id, heading, text })),
        })
    }

    if (name === 'save_draft') {
        assertExactFields(args, name, ['document'])
        const source = readSource()
        mkdirSync(paths.workDir, { recursive: true })
        const document = saveValidatedDraft(paths.draftPath, requiredDocument(args, name), source)
        const report = writeQualityReport(paths.reportPath, paths.manualReviewPath, document, source)
        return JSON.stringify({
            workName: CURRENT_WORK_NAME,
            saved: true,
            blocks: countBlocks(document),
            structuralCheck: report.structural.status,
            manualReview: report.manualReview.status,
        })
    }

    if (name === 'validate_draft') {
        assertExactFields(args, name, [])
        const source = readSource()
        const document = readValidatedDraft(paths.draftPath, source)
        const report = writeQualityReport(paths.reportPath, paths.manualReviewPath, document, source)
        return JSON.stringify({
            workName: CURRENT_WORK_NAME,
            valid: true,
            blocks: countBlocks(document),
            structuralCheck: report.structural.status,
            manualReview: report.manualReview.status,
        })
    }

    if (name === 'get_document_status') {
        assertExactFields(args, name, [])
        return JSON.stringify(getDocumentStatus())
    }

    if (name === 'find_unexplained_terms') {
        assertExactFields(args, name, [])
        const report = findUnexplainedTerms(readValidatedDraft(paths.draftPath, readSource()), ARTICLE_TERMS)
        return JSON.stringify({
            workName: CURRENT_WORK_NAME,
            unexplainedTerms: report.unexplainedTerms,
            allExplained: report.allExplained,
            terms: report.terms,
        })
    }

    assertExactFields(args, name, [])
    await createPdf(CURRENT_WORK_NAME)
    return JSON.stringify({ workName: CURRENT_WORK_NAME, created: true })
}
