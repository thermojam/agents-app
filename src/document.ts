export type SourcePart = {
    id: string
    heading: string
    text: string
}

export type SourceDocument = {
    requestedUrl: string
    url: string
    title: string
    fetchedAt: string
    parts: SourcePart[]
    text: string
}

type BlockBase = {
    id: string
    text: string
}

export type HeadingBlock = BlockBase & {
    type: 'heading'
    level: 1 | 2 | 3
    sourcePartId?: string
}

export type ParagraphBlock = BlockBase & {
    type: 'paragraph'
    sourcePartId: string
}

export type ListBlock = {
    id: string
    type: 'list'
    items: string[]
    sourcePartId: string
}

export type ExampleBlock = BlockBase & {
    type: 'example'
    label: 'Учебный пример'
    isExample: true
    sourcePartId?: string
}

export type DocumentBlock = HeadingBlock | ParagraphBlock | ListBlock | ExampleBlock

export type DocumentSection = {
    id: string
    title: string
    sourcePartId: string
    blocks: DocumentBlock[]
}

export type DocumentContent = {
    title: string
    sourceUrl: string
    sections: DocumentSection[]
}

const BLOCK_TYPES = new Set(['heading', 'paragraph', 'list', 'example'])
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function fail(path: string, message: string): never {
    throw new Error(`${path}: ${message}`)
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        fail(path, 'ожидался объект')
    }
    return value as Record<string, unknown>
}

function requiredString(record: Record<string, unknown>, key: string, path: string): string {
    const value = record[key]
    if (typeof value !== 'string' || value.trim() === '') {
        fail(`${path}.${key}`, 'нужно непустое текстовое значение')
    }
    return value.trim()
}

function optionalSourcePartId(
    record: Record<string, unknown>,
    path: string,
    partIds: Set<string>,
): string | undefined {
    const value = record.sourcePartId
    if (value === undefined) return undefined
    if (typeof value !== 'string' || !partIds.has(value)) {
        fail(`${path}.sourcePartId`, 'часть источника не найдена')
    }
    return value
}

function requiredSourcePartId(
    record: Record<string, unknown>,
    path: string,
    partIds: Set<string>,
): string {
    const value = requiredString(record, 'sourcePartId', path)
    if (!partIds.has(value)) {
        fail(`${path}.sourcePartId`, `часть источника «${value}» не найдена`)
    }
    return value
}

function validateBlock(
    value: unknown,
    path: string,
    partIds: Set<string>,
    blockIds: Set<string>,
): DocumentBlock {
    const record = asRecord(value, path)
    const id = requiredString(record, 'id', path)
    if (!ID_PATTERN.test(id)) fail(`${path}.id`, 'используйте id в формате kebab-case')
    if (blockIds.has(id)) fail(`${path}.id`, `id «${id}» уже используется`)
    blockIds.add(id)

    const type = requiredString(record, 'type', path) as DocumentBlock['type']
    if (!BLOCK_TYPES.has(type)) {
        fail(`${path}.type`, `вид «${type}» не разрешён`)
    }

    if (type === 'heading') {
        const level = record.level
        if (level !== 1 && level !== 2 && level !== 3) {
            fail(`${path}.level`, 'уровень должен быть 1, 2 или 3')
        }
        return {
            id,
            type,
            level,
            text: requiredString(record, 'text', path),
            sourcePartId: optionalSourcePartId(record, path, partIds),
        }
    }

    if (type === 'paragraph') {
        return {
            id,
            type,
            text: requiredString(record, 'text', path),
            sourcePartId: requiredSourcePartId(record, path, partIds),
        }
    }

    if (type === 'list') {
        if (!Array.isArray(record.items) || record.items.length === 0) {
            fail(`${path}.items`, 'нужен непустой список строк')
        }
        const items = record.items.map((item, index) => {
            if (typeof item !== 'string' || item.trim() === '') {
                fail(`${path}.items[${index}]`, 'нужна непустая строка')
            }
            return item.trim()
        })
        return {
            id,
            type,
            items,
            sourcePartId: requiredSourcePartId(record, path, partIds),
        }
    }

    if (record.label !== 'Учебный пример' || record.isExample !== true) {
        fail(`${path}`, 'учебный пример должен иметь label «Учебный пример» и isExample: true')
    }
    return {
        id,
        type,
        text: requiredString(record, 'text', path),
        label: 'Учебный пример',
        isExample: true,
        sourcePartId: optionalSourcePartId(record, path, partIds),
    }
}

export function validateDocument(value: unknown, source: SourceDocument): DocumentContent {
    const document = asRecord(value, 'document')
    const title = requiredString(document, 'title', 'document')
    const sourceUrl = requiredString(document, 'sourceUrl', 'document')
    try {
        const url = new URL(sourceUrl)
        if (url.protocol !== 'https:') fail('document.sourceUrl', 'разрешены только HTTPS-ссылки')
    } catch {
        fail('document.sourceUrl', 'нужна корректная HTTPS-ссылка')
    }

    const sourceParts = source.parts
    if (!Array.isArray(sourceParts) || sourceParts.length === 0) {
        fail('source.parts', 'источник не содержит частей')
    }
    const partIds = new Set(sourceParts.map((part) => part.id))
    if (!Array.isArray(document.sections) || document.sections.length === 0) {
        fail('document.sections', 'нужен хотя бы один раздел')
    }

    const sectionIds = new Set<string>()
    const blockIds = new Set<string>()
    const sections = document.sections.map((value, index) => {
        const path = `document.sections[${index}]`
        const section = asRecord(value, path)
        const id = requiredString(section, 'id', path)
        if (!ID_PATTERN.test(id)) fail(`${path}.id`, 'используйте id в формате kebab-case')
        if (sectionIds.has(id)) fail(`${path}.id`, `id «${id}» уже используется`)
        sectionIds.add(id)

        if (!Array.isArray(section.blocks) || section.blocks.length === 0) {
            fail(`${path}.blocks`, 'нужен хотя бы один блок')
        }
        return {
            id,
            title: requiredString(section, 'title', path),
            sourcePartId: requiredSourcePartId(section, path, partIds),
            blocks: section.blocks.map((block, blockIndex) =>
                validateBlock(block, `${path}.blocks[${blockIndex}]`, partIds, blockIds),
            ),
        }
    })

    return {title, sourceUrl, sections}
}
