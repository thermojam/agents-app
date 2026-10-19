import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateDocument } from '../src/document.ts'

const sourcePath = resolve('docs/agents-tools/source.json')
const documentPath = resolve('docs/agents-tools/document.json')
const source = JSON.parse(readFileSync(sourcePath, 'utf8'))
const document = JSON.parse(readFileSync(documentPath, 'utf8'))

function expectRejected(name: string, value: unknown, expected: string) {
    try {
        validateDocument(value, source)
        throw new Error(`${name}: проверка неожиданно приняла неверный документ`)
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes(expected)) {
            throw new Error(`${name}: ожидалась причина «${expected}», получено «${message}»`)
        }
        console.log(`Отклонено: ${name} — ${message}`)
    }
}

const accepted = validateDocument(document, source)
console.log(`Принято: ${accepted.title}; разделов: ${accepted.sections.length}; блоков: ${accepted.sections[0].blocks.length}`)

const missingTitle = structuredClone(document) as Record<string, unknown>
delete missingTitle.title
expectRejected('нет названия', missingTitle, 'document.title')

const unknownType = structuredClone(document) as { sections: Array<{ blocks: Array<Record<string, unknown>> }> }
unknownType.sections[0].blocks[0].type = 'quote'
expectRejected('неизвестный вид блока', unknownType, 'вид «quote» не разрешён')

const missingSourcePart = structuredClone(document) as { sections: Array<{ blocks: Array<Record<string, unknown>> }> }
missingSourcePart.sections[0].blocks[1].sourcePartId = 'section-404'
expectRejected('отсутствующая часть источника', missingSourcePart, 'часть источника «section-404» не найдена')
