// Ручной сценарий E05/E06. Запускать при работающем `npm run dev`: `npm run e2e`.
// Ответы /suggest и сохранения подменяются: модель не вызывается, файлы работ не меняются.
import assert from 'node:assert/strict'
import {chromium} from 'playwright'

const url = process.env.E2E_URL ?? 'http://localhost:3000/'
const SUGGESTION = 'Проверочная правка блока'

const browser = await chromium.launch()
try {
    const page = await browser.newPage()
    await page.route('**/api/works/*/suggest', (route) =>
        route.fulfill({contentType: 'application/json', body: JSON.stringify({text: SUGGESTION})}),
    )
    await page.route('**/api/works/*', (route) => {
        if (route.request().method() === 'PUT') {
            return route.fulfill({contentType: 'application/json', body: JSON.stringify({changed: true, approvalRevoked: false})})
        }
        return route.continue()
    })

    await page.goto(url, {waitUntil: 'networkidle'})
    await page.getByRole('button', {name: 'building-agents'}).click()
    const textarea = page.locator('#block-text')
    await page.locator('.block-picker button', {hasText: 'Абзац'}).first().click()
    const manual = await textarea.inputValue()

    // E06: отклонение сохраняет ручной текст.
    await page.getByRole('button', {name: 'Предложить правку'}).click()
    await page.locator('.suggestion-text', {hasText: SUGGESTION}).waitFor()
    await page.getByRole('button', {name: 'Отклонить'}).click()
    assert.equal(await textarea.inputValue(), manual, 'отклонение изменило текст блока')

    // E06: принятие меняет только выбранный блок.
    await page.getByRole('button', {name: 'Предложить правку'}).click()
    await page.locator('.suggestion-text', {hasText: SUGGESTION}).waitFor()
    await page.getByRole('button', {name: 'Принять'}).click()
    assert.equal(await textarea.inputValue(), SUGGESTION, 'принятие не применило предложение')

    // E06: ответ на устаревший текст не принимается.
    await page.getByRole('button', {name: 'Предложить правку'}).click()
    await page.locator('.suggestion-text', {hasText: SUGGESTION}).waitFor()
    await textarea.fill(`${SUGGESTION} и новая ручная правка`)
    await page.getByText('предложение устарело').waitFor()
    assert.equal(await page.getByRole('button', {name: 'Принять'}).isDisabled(), true, 'устаревшее предложение можно принять')

    // E05: после правки сохранение доступно, и ответ сервера показан.
    await page.getByRole('button', {name: 'Сохранить'}).click()
    await page.getByText('Сохранено.').waitFor()
    console.log('E05/E06: отклонение, принятие и устаревший ответ проверены; сохранение подменено')
} finally {
    await browser.close()
}
