import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseDraftAnswer, saveValidatedDraft } from './draft.ts'
import type { SourceDocument } from '../src/document.ts'
import { renderDocument } from '../src/preview.ts'

const source = JSON.parse(readFileSync('docs/agents-tools/source.json', 'utf8')) as SourceDocument
const validDocument = JSON.parse(readFileSync('docs/agents-tools/document.json', 'utf8'))
const temporaryDir = mkdtempSync(join(tmpdir(), 'agents-app-draft-check-'))
const draftPath = join(temporaryDir, 'draft.json')

try {
    const parsed = parseDraftAnswer(`\`\`\`json\n${JSON.stringify(validDocument)}\n\`\`\``)
    saveValidatedDraft(draftPath, parsed, source)
    const previous = readFileSync(draftPath, 'utf8')

    const invalidDocument = structuredClone(validDocument) as {
        sections: Array<{ blocks: Array<{ sourcePartId?: string }> }>
    }
    invalidDocument.sections[0].blocks[1].sourcePartId = 'section-404'

    try {
        saveValidatedDraft(draftPath, invalidDocument, source)
        throw new Error('Неверный ответ неожиданно принят')
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('section-404')) throw error
    }

    if (readFileSync(draftPath, 'utf8') !== previous) {
        throw new Error('Неверный ответ заменил последний корректный draft.json')
    }

    console.log('Корректный JSON принят, неверный ответ отклонён, предыдущий draft.json сохранён')

    if (process.argv.includes('--write-fixture')) {
        const workDir = 'docs/agents-tools/building-agents'
        const fixtureDraftPath = join(workDir, 'draft.json')
        const fixturePreviewPath = join(workDir, 'preview.html')
        mkdirSync(workDir, { recursive: true })
        const fixture = saveValidatedDraft(fixtureDraftPath, validDocument, source)
        writeFileSync(fixturePreviewPath, renderDocument(fixture, '../../../public/fonts'))
        console.log(`Локальный T08-ответ сохранён: ${fixtureDraftPath}`)
        console.log(`Локальный просмотр создан: ${fixturePreviewPath}`)
    }
} finally {
    rmSync(temporaryDir, { recursive: true, force: true })
}
