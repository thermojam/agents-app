import {test} from 'node:test'
import assert from 'node:assert/strict'
import {SUGGESTION_MAX_CHARS, parseSuggestion} from '../scripts/suggest.ts'

test('берёт текст из JSON-объекта и убирает пробелы по краям', () => {
    assert.equal(parseSuggestion('{"text":"  Понятнее  "}'), 'Понятнее')
})

test('отклоняет ответ не в формате JSON', () => {
    assert.throws(() => parseSuggestion('Вот правка: ...'), /не в формате JSON/)
    assert.throws(() => parseSuggestion(null), /не в формате JSON/)
})

test('отклоняет лишние поля и не-объекты', () => {
    assert.throws(() => parseSuggestion('{"text":"ok","tool":"save"}'), /лишние поля/)
    assert.throws(() => parseSuggestion('["ok"]'), /JSON-объектом/)
})

test('отклоняет пустой и слишком длинный текст', () => {
    assert.throws(() => parseSuggestion('{"text":"   "}'), /непустую строку/)
    assert.throws(() => parseSuggestion(JSON.stringify({text: 'a'.repeat(SUGGESTION_MAX_CHARS + 1)})), /непустую строку/)
})
