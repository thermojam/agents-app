import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { validateDocument } from '../src/document.ts'
import { renderDocument } from '../src/preview.ts'

const source = JSON.parse(readFileSync(resolve('docs/agents-tools/source.json'), 'utf8'))
const document = JSON.parse(readFileSync(resolve('docs/agents-tools/document.json'), 'utf8'))
const unsafeDocument = structuredClone(document) as { sections: Array<{ blocks: Array<{ text?: string }> }> }
unsafeDocument.sections[0].blocks[3].text = '<script>пример</script>'

const html = renderDocument(validateDocument(unsafeDocument, source))
if (!html.includes('&lt;script&gt;пример&lt;/script&gt;')) {
    throw new Error('Опасный текст не был экранирован')
}
if (html.includes('<script>пример</script>')) {
    throw new Error('Опасный текст попал в HTML как исполняемый тег')
}
console.log('Безопасность текста: <script>пример</script> отображается как текст')
