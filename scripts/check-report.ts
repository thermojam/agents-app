import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { validateDocument } from '../src/document.ts'
import type { DocumentContent, SourceDocument } from '../src/document.ts'
import { buildQualityReport, markReportHumanVerified, writeQualityReport } from './report.ts'

const source = JSON.parse(readFileSync('docs/agents-tools/source.json', 'utf8')) as SourceDocument
const fixture = JSON.parse(readFileSync('docs/agents-tools/building-agents/draft.json', 'utf8')) as DocumentContent
const temporaryDir = mkdtempSync(join(tmpdir(), 'agents-app-report-check-'))
const reportPath = join(temporaryDir, 'report.json')
const manualReviewPath = join(temporaryDir, 'manual-review.md')

try {
    const report = writeQualityReport(reportPath, manualReviewPath, fixture, source)
    const savedReport = JSON.parse(readFileSync(reportPath, 'utf8')) as typeof report
    if (savedReport.structural.status !== 'passed' || savedReport.manualReview.status !== 'pending') {
        throw new Error(`Неверный статус обязательного отчёта: ${JSON.stringify(savedReport)}`)
    }
    if (!existsSync(manualReviewPath) || !readFileSync(manualReviewPath, 'utf8').includes('Ожидает сверки человеком')) {
        throw new Error('Лист ручной сверки не создан')
    }
    const verified = markReportHumanVerified(reportPath, manualReviewPath, fixture)
    if (verified.manualReview.status !== 'verified' || !verified.manualReview.humanVerified) {
        throw new Error('Явное подтверждение не отметило ручную сверку')
    }
    writeQualityReport(reportPath, manualReviewPath, fixture, source)

    const missingSourcePart = structuredClone(fixture) as DocumentContent
    missingSourcePart.sections[0].blocks[0] = {
        ...missingSourcePart.sections[0].blocks[0],
        sourcePartId: 'section-404',
    } as typeof missingSourcePart.sections[0]['blocks'][0]
    try {
        validateDocument(missingSourcePart, source)
        throw new Error('Несуществующая ссылка неожиданно прошла проверку')
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('sourcePartId')) throw error
    }

    const wrongSourceUrl = structuredClone(fixture) as DocumentContent
    wrongSourceUrl.sourceUrl = 'https://developers.openai.com/other-article'
    try {
        validateDocument(wrongSourceUrl, source)
        throw new Error('Ссылка на другую статью неожиданно принята')
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('должна совпадать')) throw error
    }

    const unlabelledExample = structuredClone(fixture) as DocumentContent
    const example = unlabelledExample.sections.flatMap((section) => section.blocks).find((block) => block.type === 'example')
    if (!example || example.type !== 'example') throw new Error('Фикстура не содержит учебный пример')
    const rawExample = {...example, label: 'Обычный текст'}
    try {
        validateDocument(
            {
                ...unlabelledExample,
                sections: unlabelledExample.sections.map((section) => ({
                    ...section,
                    blocks: section.blocks.map((block) => (block.id === example.id ? rawExample : block)),
                })),
            },
            source,
        )
        throw new Error('Неподписанный пример неожиданно принят')
    } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('Учебный пример')) throw error
    }

    const unsupportedClaim = structuredClone(fixture) as DocumentContent
    const paragraph = unsupportedClaim.sections[0].blocks.find((block) => block.type === 'paragraph')
    if (!paragraph || paragraph.type !== 'paragraph') throw new Error('Фикстура не содержит абзаца')
    paragraph.text = 'Статья гарантирует результат для любого проекта навсегда.'
    const acceptedByStructure = validateDocument(unsupportedClaim, source)
    const claimReport = buildQualityReport(acceptedByStructure, source)
    if (claimReport.structural.status !== 'passed' || claimReport.manualReview.status !== 'pending') {
        throw new Error('Структурный отчёт неверно объявил неподтверждённый тезис доказанным')
    }
    if (!claimReport.manualReview.items.some((item) => item.id === 'unsupported-promises' && item.status === 'pending')) {
        throw new Error('В отчёте нет ручной проверки неподтверждённых обещаний')
    }

    writeFileSync(join(temporaryDir, 'unsupported-claim.json'), JSON.stringify(unsupportedClaim, null, 2))
    console.log('T16: ссылка и неподписанный пример отклонены; формально валидное неподтверждённое обещание оставлено ручной сверке')
} finally {
    rmSync(temporaryDir, {recursive: true, force: true})
}
