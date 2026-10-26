import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {validateDocument, type DocumentContent, type SourceDocument} from '../src/document.ts'

const read = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
const source = read('../docs/agents-tools/building-agents/source.json') as SourceDocument
const valid = read('../docs/agents-tools/building-agents.json') as DocumentContent

function withBlock(block: unknown): unknown {
    const copy = structuredClone(valid)
    copy.sections[0].blocks.push(block)
    return copy
}

test('принимает актуальный документ работы', () => {
    assert.equal(validateDocument(valid, source).title, valid.title)
})

test('отклоняет ссылку на другую статью', () => {
    const copy = structuredClone(valid)
    copy.sourceUrl = 'https://developers.openai.com/other-article'
    assert.throws(() => validateDocument(copy, source), /должна совпадать/)
})

test('отклоняет блок неразрешённого вида', () => {
    const block = {id: 'script-block', type: 'script', text: 'x', sourcePartId: 'section-1'}
    assert.throws(() => validateDocument(withBlock(block), source), /не разрешён/)
})

test('отклоняет учебный пример без подписи', () => {
    const block = {id: 'plain-example', type: 'example', label: 'Обычный текст', isExample: true, text: 'x', sourcePartId: 'section-1'}
    assert.throws(() => validateDocument(withBlock(block), source), /Учебный пример/)
})
