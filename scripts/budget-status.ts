import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { formatBudget, readBudget } from './budget.ts'

const budget = readBudget()
console.log(`${formatBudget(budget)}; статус: ${budget.status === 'verified' ? 'подтверждён' : 'неизвестно'}`)

const usagePath = resolve('docs/agents-tools/building-agents/usage.jsonl')
const usage = existsSync(usagePath)
    ? readFileSync(usagePath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line) as { totalTokens: number | null })
    : []
const tokens = usage.reduce((sum, record) => sum + (record.totalTokens ?? 0), 0)
console.log(`usage.jsonl: вызовов ${usage.length}, токенов ${tokens}. Пересчёт в ₽ нужен курс и цены модели.`)
