import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { DocumentContent, SourceDocument } from '../src/document.ts'
import { validateDocument } from '../src/document.ts'
import { contentSha256, getWorkPaths, saveApproval } from './approval.ts'
import { createPdf } from './pdf.ts'
import { renderDocument } from '../src/preview.ts'

const workName = 't17-page-review'
const source = JSON.parse(readFileSync('docs/agents-tools/building-agents/source.json', 'utf8')) as SourceDocument
const paths = getWorkPaths(workName)
const pagesDir = join(paths.workDir, 'pages')
const reviewPath = join(paths.workDir, 'review.json')

const fixture: DocumentContent = {
    title: 'Проверка итогового PDF: длинный русский заголовок, который должен переноситься без обрезания',
    sourceUrl: source.url,
    sections: [
        {
            id: 'page-review',
            title: 'Проверка переноса, полей и читаемости',
            sourcePartId: 'section-1',
            blocks: [
                {
                    id: 'long-heading',
                    type: 'heading',
                    level: 1,
                    text: 'Длинный заголовок раздела проверяет перенос строки и сохранение отступа перед следующим текстом',
                },
                {
                    id: 'russian-text',
                    type: 'paragraph',
                    text:
                        'Русский текст нужен здесь не для красоты: он проверяет кириллицу, межстрочный интервал и читаемость после встраивания локального шрифта Sligoil Micro в настоящий PDF.',
                    sourcePartId: 'section-1',
                },
                {
                    id: 'long-link',
                    type: 'paragraph',
                    text:
                        'Длинная ссылка для проверки переноса: https://developers.openai.com/tracks/building-agents?utm_source=pdf-page-review&reference=long-pdf-page-review-reference-for-wrapping-across-several-lines',
                    sourcePartId: 'section-1',
                },
                {
                    id: 'long-list',
                    type: 'list',
                    items: Array.from({length: 24}, (_, index) =>
                        `Пункт ${index + 1}: программа сохраняет содержание, применяет только правила шаблона и не принимает произвольное оформление из данных документа.`,
                    ),
                    sourcePartId: 'section-1',
                },
                {
                    id: 'last-paragraph',
                    type: 'paragraph',
                    text:
                        'Последний абзац должен остаться видимым на последней странице. При сравнении HTML и PDF особенно проверяем, что конец текста не ушёл за нижнее поле и что переход между разделами не создаёт пустую страницу.',
                    sourcePartId: 'section-1',
                },
            ],
        },
    ],
}

function pdfInfo(pdfPath: string): { pages: number; pageSize: string } {
    const info = execFileSync('pdfinfo', [pdfPath], {encoding: 'utf8'})
    const pages = Number(info.match(/^Pages:\s+(\d+)/m)?.[1])
    const pageSize = info.match(/^Page size:\s+(.+)$/m)?.[1]?.trim() ?? ''
    if (!Number.isInteger(pages) || pages < 2 || !pageSize.includes('A4')) {
        throw new Error(`PDF не подтвердил страницы A4: ${info}`)
    }
    return {pages, pageSize}
}

function renderPages(pdfPath: string): number {
    rmSync(pagesDir, {recursive: true, force: true})
    mkdirSync(pagesDir, {recursive: true})
    execFileSync('pdftoppm', ['-png', '-r', '120', pdfPath, join(pagesDir, 'page')])
    return readdirSync(pagesDir).filter((name) => name.endsWith('.png')).length
}

function writeReviewReport(info: { pages: number; pageSize: string }, imageCount: number, pdfText: string): void {
    const previous = existsSync(reviewPath)
        ? (JSON.parse(readFileSync(reviewPath, 'utf8')) as { status?: string; reviewedAt?: string; notes?: string[] })
        : {}
    const report = {
        ticket: 'T17',
        status: previous.status === 'reviewed' ? 'reviewed' : 'pending_manual_review',
        pdf: 'guide.pdf',
        preview: 'preview.html',
        pages: info.pages,
        pageImages: imageCount,
        pageSize: info.pageSize,
        contentSha256: contentSha256(fixture),
        textChecks: {
            title: containsPdfText(pdfText, fixture.title),
            longLink: containsPdfText(pdfText, 'long-pdf-page-review-reference-for-wrapping-across-several-lines'),
            russianText: containsPdfText(pdfText, 'Русский текст нужен здесь'),
            lastParagraph: containsPdfText(pdfText, 'Последний абзац должен остаться видимым'),
        },
        ...(previous.reviewedAt ? {reviewedAt: previous.reviewedAt} : {}),
        ...(previous.notes ? {notes: previous.notes} : {}),
    }
    writeFileSync(reviewPath, `${JSON.stringify(report, null, 2)}\n`)
}

function containsPdfText(pdfText: string, expected: string): boolean {
    return pdfText.includes(expected) || pdfText.replaceAll(/\s+/g, '').includes(expected.replaceAll(/\s+/g, ''))
}

async function main() {
    mkdirSync(paths.workDir, {recursive: true})
    writeFileSync(paths.draftPath, `${JSON.stringify(fixture, null, 2)}\n`)
    const document = validateDocument(fixture, source)
    const previewHtml = renderDocument(document, '../../../public/fonts')
    for (const rule of ['font-family: "Sligoil Micro", Arial, sans-serif', 'font-size: 28pt', 'color: #141414', 'color: #0066ff', '@page', 'size: A4', 'margin: 18mm']) {
        if (!previewHtml.includes(rule)) throw new Error(`В шаблоне отсутствует разрешённое правило: ${rule}`)
    }
    writeFileSync(paths.previewPath, previewHtml)
    saveApproval(paths.approvalPath, document)
    const outputPath = await createPdf(workName)
    const info = pdfInfo(outputPath)
    const imageCount = renderPages(outputPath)
    if (imageCount !== info.pages) throw new Error(`Изображений страниц: ${imageCount}, страниц в PDF: ${info.pages}`)

    const pdfText = execFileSync('pdftotext', ['-layout', outputPath, '-'], {encoding: 'utf8'})
    for (const [name, present] of Object.entries({
        title: containsPdfText(pdfText, fixture.title),
        longLink: containsPdfText(pdfText, 'long-pdf-page-review-reference-for-wrapping-across-several-lines'),
        russianText: containsPdfText(pdfText, 'Русский текст нужен здесь'),
        lastParagraph: containsPdfText(pdfText, 'Последний абзац должен остаться видимым'),
    })) {
        if (!present) throw new Error(`PDF не содержит проверяемое содержание: ${name}`)
    }
    writeReviewReport(info, imageCount, pdfText)
    console.log(`T17: создан ${outputPath}; страниц A4: ${info.pages}; PNG для осмотра: ${imageCount}`)
    console.log(`Отчёт: ${reviewPath}`)
}

await main()
