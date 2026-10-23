import { formatBudget, readBudget } from './budget.ts'

const budget = readBudget()
console.log(`${formatBudget(budget)}; статус: ${budget.status === 'verified' ? 'подтверждён' : 'неизвестно'}`)
