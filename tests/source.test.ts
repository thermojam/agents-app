import {test} from 'node:test'
import assert from 'node:assert/strict'
import {fetchSource} from '../scripts/source.ts'

const page = '<div class="tgme_widget_message_text js-message_text" dir="auto">Первая строка<br>Вторая часть</div>'

test('пост t.me читается из превью и сохраняет адрес поста', async () => {
    const original = globalThis.fetch
    globalThis.fetch = async (url) => {
        assert.equal(String(url), 'https://t.me/s/riverapeople/3066')
        return new Response(page, {headers: {'content-type': 'text/html; charset=utf-8'}})
    }
    try {
        const source = await fetchSource('https://t.me/riverapeople/3066')
        assert.equal(source.url, 'https://t.me/riverapeople/3066')
        assert.equal(source.title, 'Первая строка')
        assert.match(source.text, /Вторая часть/)
    } finally {
        globalThis.fetch = original
    }
})

test('адрес t.me без номера поста отклоняется', async () => {
    await assert.rejects(fetchSource('https://t.me/riverapeople'), /посты t\.me/)
})
