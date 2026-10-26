import {test} from 'node:test'
import assert from 'node:assert/strict'
import {renderDocument} from '../src/preview.ts'
import type {DocumentContent} from '../src/document.ts'

function documentWith(text: string): DocumentContent {
    return {
        title: 'Тест',
        sourceUrl: 'https://openai.com/ru-RU/index/teens-learn-and-plan/',
        sections: [{
            id: 'section',
            title: 'Раздел',
            sourcePartId: 'section-1',
            blocks: [{id: 'paragraph', type: 'paragraph', text, sourcePartId: 'section-1'}],
        }],
    }
}

test('экранирует HTML в тексте блока', () => {
    const html = renderDocument(documentWith('<img src=x onerror="alert(1)"> & <script>1</script>'))
    assert.ok(!html.includes('<img src=x'))
    assert.ok(!html.includes('<script>1</script>'))
    assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &lt;script&gt;1&lt;/script&gt;'))
})

test('отказывает в источнике не по HTTPS', () => {
    const document = {...documentWith('текст'), sourceUrl: 'http://openai.com/ru-RU/index/teens-learn-and-plan/'}
    assert.throws(() => renderDocument(document), /HTTPS/)
})
