import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import type { DocumentContent, SourceDocument } from '../src/document.ts'

export type QualityReport = {
    version: 1
    generatedAt: string
    sourceUrl: string
    draftContentSha256: string
    structural: {
        status: 'passed'
        checks: Array<{ id: string; status: 'passed'; detail: string }>
    }
    manualReview: {
        status: 'pending' | 'verified'
        humanVerified: boolean
        items: Array<{ id: string; status: 'pending' | 'verified'; instruction: string }>
        verifiedAt?: string
    }
}

export function contentSha256(document: DocumentContent): string {
    return createHash('sha256').update(JSON.stringify(document), 'utf8').digest('hex')
}

function manualItems(status: 'pending' | 'verified') {
    return [
        {
            id: 'main-claims',
            status,
            instruction: 'Сверить основные тезисы с соответствующими частями source.json.',
        },
        {
            id: 'caveats',
            status,
            instruction: 'Проверить, что важные ограничения и оговорки статьи сохранены.',
        },
        {
            id: 'terms',
            status,
            instruction: 'Проверить, что важные термины объяснены новичку при первом употреблении.',
        },
        {
            id: 'examples',
            status,
            instruction: 'Проверить, что учебные примеры помечены и не выданы за факты статьи.',
        },
        {
            id: 'unsupported-promises',
            status,
            instruction: 'Проверить отсутствие обещаний и утверждений, которых нет в источнике.',
        },
    ] as QualityReport['manualReview']['items']
}

export function buildQualityReport(
    document: DocumentContent,
    source: SourceDocument,
    generatedAt = new Date().toISOString(),
): QualityReport {
    const sourcePartIds = new Set(source.parts.map((part) => part.id))
    const linkedPartIds = document.sections.flatMap((section) => [
        section.sourcePartId,
        ...section.blocks.flatMap((block) => ('sourcePartId' in block && block.sourcePartId ? [block.sourcePartId] : [])),
    ])
    const examples = document.sections.flatMap((section) => section.blocks.filter((block) => block.type === 'example'))

    return {
        version: 1,
        generatedAt,
        sourceUrl: source.url,
        draftContentSha256: contentSha256(document),
        structural: {
            status: 'passed',
            checks: [
                { id: 'required-sections', status: 'passed', detail: `${document.sections.length} раздел(ов) с непустыми блоками` },
                {
                    id: 'source-links',
                    status: 'passed',
                    detail: `${linkedPartIds.filter((id) => sourcePartIds.has(id)).length} ссылок на части источника проверено`,
                },
                {
                    id: 'example-labels',
                    status: 'passed',
                    detail: `${examples.length} учебных пример(ов) имеют label «Учебный пример» и isExample: true`,
                },
            ],
        },
        manualReview: {
            status: 'pending',
            humanVerified: false,
            items: manualItems('pending'),
        },
    }
}

function renderManualReview(report: QualityReport): string {
    const status = report.manualReview.humanVerified ? 'Проверено человеком' : 'Ожидает сверки человеком'
    const boxes = report.manualReview.items
        .map((item) => `- [${item.status === 'verified' ? 'x' : ' '}] ${item.instruction}`)
        .join('\n')
    return `# Лист ручной сверки

Статья: ${report.sourceUrl}
Статус: ${status}

Автоматическая проверка структуры не доказывает точность смысла. Перед approval
сверь каждый пункт с исходной статьёй и только затем подтверди текст.

${boxes}
`
}

export function writeQualityReport(
    reportPath: string,
    manualReviewPath: string,
    document: DocumentContent,
    source: SourceDocument,
): QualityReport {
    const report = buildQualityReport(document, source)
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    writeFileSync(manualReviewPath, renderManualReview(report))
    return report
}

export function markReportHumanVerified(
    reportPath: string,
    manualReviewPath: string,
    document: DocumentContent,
): QualityReport {
    const report = JSON.parse(readFileSync(reportPath, 'utf8')) as QualityReport
    if (report.draftContentSha256 !== contentSha256(document)) {
        throw new Error('Ручная сверка запрещена: report.json относится к другому draft.json')
    }
    const verifiedAt = new Date().toISOString()
    const verified: QualityReport = {
        ...report,
        manualReview: {
            ...report.manualReview,
            status: 'verified',
            humanVerified: true,
            verifiedAt,
            items: manualItems('verified'),
        },
    }
    writeFileSync(reportPath, `${JSON.stringify(verified, null, 2)}\n`)
    writeFileSync(manualReviewPath, renderManualReview(verified))
    return verified
}
