import { requestHaiku } from './model.ts'

requestHaiku()
    .then((result) => {
        console.log(`Адрес: ${result.baseUrl}/chat/completions`)
        console.log(`Модель: ${result.model}`)
        console.log(`Запрос: ${result.prompt}`)
        console.log(`Ответ: ${result.answer}`)
        if (result.usage) console.log(`Использование: ${JSON.stringify(result.usage)}`)
    })
    .catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : 'Неизвестная ошибка запроса')
        process.exitCode = 1
    })
