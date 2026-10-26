import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { getWorkPaths, readApprovedDraft } from './approval.ts'
import type { SourceDocument } from '../src/document.ts'
import { renderDocument } from '../src/preview.ts'

export async function createPdf(workName: string): Promise<string> {
    const paths = getWorkPaths(workName)
    const source = JSON.parse(readFileSync('docs/agents-tools/source.json', 'utf8')) as SourceDocument
    const document = readApprovedDraft(paths.draftPath, paths.approvalPath, source)
    writeFileSync(paths.previewPath, renderDocument(document, '../../../public/fonts'))

    const browser = await chromium.launch()
    try {
        const page = await browser.newPage()
        await page.goto(pathToFileURL(paths.previewPath).href, {waitUntil: 'load'})
        await page.evaluate(async () => {
            await document.fonts.ready
            await document.fonts.load('11pt "Sligoil Micro"', 'Съешь ещё этих мягких французских булок')
        })

        const fontLoaded = await page.evaluate(() =>
            document.fonts.check('11pt "Sligoil Micro"', 'Съешь ещё этих мягких французских булок'),
        )
        if (!fontLoaded) throw new Error('Локальный шрифт Sligoil Micro не загрузился перед печатью')

        await page.pdf({
            path: paths.outputPath,
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
            margin: {top: '18mm', right: '18mm', bottom: '18mm', left: '18mm'},
        })
    } finally {
        await browser.close()
    }
    return paths.outputPath
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    const workName = process.argv[2]
    if (!workName) throw new Error('Использование: npm run pdf -- "ИМЯ_РАБОТЫ"')
    console.log(`PDF создан: ${await createPdf(workName)}`)
}
