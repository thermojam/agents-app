import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { validateDocument } from '../src/document.ts'
import { renderDocument } from '../src/preview.ts'

const workName = process.argv[2]
if (!workName || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(workName)) {
    throw new Error('Использование: npm run preview -- "ИМЯ_РАБОТЫ"')
}

const workDir = resolve('docs/agents-tools')
const source = JSON.parse(readFileSync(join(workDir, 'source.json'), 'utf8'))
const document = JSON.parse(readFileSync(join(workDir, `${workName}.json`), 'utf8'))
const validatedDocument = validateDocument(document, source)
const outputDir = join(workDir, workName)
mkdirSync(outputDir, { recursive: true })
const outputPath = join(outputDir, 'preview.html')

writeFileSync(outputPath, renderDocument(validatedDocument, '../../../public/fonts/InterVariable.woff2'))
console.log(`Просмотр создан: ${outputPath}`)
