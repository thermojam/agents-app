import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export const BUDGET_PATH = resolve('docs/agents-tools/budget.json')

export type BudgetRecord = {
    status: 'unknown' | 'verified'
    currency: 'RUB'
    projectLimitRubles: number | null
    spentRubles: number | null
    remainingRubles: number | null
    verifiedAt: string | null
    source: string | null
}

const UNKNOWN_BUDGET: BudgetRecord = {
    status: 'unknown',
    currency: 'RUB',
    projectLimitRubles: null,
    spentRubles: null,
    remainingRubles: null,
    verifiedAt: null,
    source: null,
}

export function readBudget(path = BUDGET_PATH): BudgetRecord {
    if (!existsSync(path)) return { ...UNKNOWN_BUDGET }
    try {
        const value = JSON.parse(readFileSync(path, 'utf8')) as Partial<BudgetRecord>
        if (value.status !== 'verified' && value.status !== 'unknown') return { ...UNKNOWN_BUDGET }
        return {
            ...UNKNOWN_BUDGET,
            ...value,
            currency: 'RUB',
        }
    } catch {
        return { ...UNKNOWN_BUDGET }
    }
}

function rubles(value: number | null): string {
    return value === null ? 'неизвестно' : `${value} ₽`
}

export function formatBudget(budget: BudgetRecord): string {
    return `Расход: ${rubles(budget.spentRubles)}; остаток: ${rubles(budget.remainingRubles)}`
}

export function assertPaidExperimentsAllowed(budget = readBudget()): BudgetRecord {
    if (budget.status !== 'verified' || budget.remainingRubles === null || budget.remainingRubles <= 0) {
        throw new Error(`Новый платный опыт остановлен до ручной сверки бюджета. ${formatBudget(budget)}`)
    }
    return budget
}
