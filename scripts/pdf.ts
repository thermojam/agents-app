import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { validateDocument } from '../src/document.ts'

const workName = process.argv[2]
if (!workName || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workName)) {
    throw new Error('Использование: npm run pdf -- "ИМЯ_РАБОТЫ"')
}

const workDir = resolve('docs/agents-tools', workName)
const source = JSON.parse(readFileSync(resolve('docs/agents-tools/source.json'), 'utf8'))
const document = JSON.parse(readFileSync(resolve('docs/agents-tools/document.json'), 'utf8'))
validateDocument(document, source)

const previewPath = join(workDir, 'preview.html')
const outputPath = join(workDir, 'guide.pdf')
const browser = await chromium.launch()
try {
    const page = await browser.newPage()
    await page.goto(pathToFileURL(previewPath).href, { waitUntil: 'load' })
    await page.evaluate(async () => {
        await document.fonts.ready
        await document.fonts.load('11pt Inter', 'Съешь ещё этих мягких французских булок')
    })

    const fontLoaded = await page.evaluate(() =>
        document.fonts.check('11pt Inter', 'Съешь ещё этих мягких французских булок'),
    )
    if (!fontLoaded) throw new Error('Локальный Inter не загрузился перед печатью')

    await page.pdf({
        path: outputPath,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: {top: '18mm', right: '18mm', bottom: '18mm', left: '18mm'},
    })
} finally {
    await browser.close()
}

console.log(`PDF создан: ${outputPath}`)
