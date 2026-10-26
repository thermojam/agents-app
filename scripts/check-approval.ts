import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contentSha256, getWorkPaths, readApprovedDraft, saveApproval } from './approval.ts'
import { createPdf } from './pdf.ts'
import type { DocumentContent, SourceDocument } from '../src/document.ts'

const source = JSON.parse(readFileSync('docs/agents-tools/building-agents/source.json', 'utf8')) as SourceDocument
const fixture = JSON.parse(readFileSync('docs/agents-tools/building-agents/draft.json', 'utf8')) as DocumentContent
const workName = `approval-check-${process.pid}`
const paths = getWorkPaths(workName)

mkdirSync(paths.workDir, {recursive: true})
try {
    writeFileSync(paths.draftPath, `${JSON.stringify(fixture, null, 2)}\n`)
    writeFileSync(join(paths.workDir, 'source.json'), `${JSON.stringify(source, null, 2)}\n`)

    try {
        await createPdf(workName)
        throw new Error('PDF неожиданно создан без approval.json')
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('ещё не утверждён')) throw error
    }

    const approval = saveApproval(paths.approvalPath, fixture)
    const approved = readApprovedDraft(paths.draftPath, paths.approvalPath, source)
    if (approval.contentSha256 !== contentSha256(approved)) {
        throw new Error('Контрольная строка не совпадает с утверждённым содержанием')
    }

    const outputPath = await createPdf(workName)
    if (!existsSync(outputPath) || readFileSync(outputPath).byteLength === 0) {
        throw new Error('После утверждения PDF не создан')
    }

    const changed = structuredClone(fixture)
    changed.sections[0].blocks[1].text += ' Изменено после утверждения.'
    writeFileSync(paths.draftPath, `${JSON.stringify(changed, null, 2)}\n`)
    try {
        await createPdf(workName)
        throw new Error('PDF неожиданно создан после изменения draft.json')
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (!message.includes('черновик изменился')) throw error
    }

    console.log('Без approval печать запрещена; после approval PDF создан; изменение draft.json сделало approval недействительным')
} finally {
    rmSync(join(paths.workDir), {recursive: true, force: true})
}
