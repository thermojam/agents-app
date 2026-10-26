import {existsSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync} from 'node:fs'
import type {IncomingMessage, ServerResponse} from 'node:http'
import {join, resolve} from 'node:path'
import {defineConfig, type Plugin} from 'vite'
import react from '@vitejs/plugin-react'
import {validateDocument} from './src/document'

const worksDir = resolve('docs/agents-tools')
const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function send(res: ServerResponse, status: number, body: unknown) {
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<string> {
    let body = ''
    for await (const chunk of req) {
        body += chunk
        if (body.length > 1_000_000) throw new Error('Запрос слишком большой')
    }
    return body
}

// Только для локальной разработки: читает и сохраняет draft.json работы.
// Пути собираются из проверенного имени работы и фиксированных файлов, поэтому ключ модели недоступен.
function worksApi(): Plugin {
    return {
        name: 'works-api',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use('/api/works', async (req, res) => {
                try {
                    const name = (req.url ?? '/').split('?')[0].slice(1)
                    if (name === '' && req.method === 'GET') {
                        const names = readdirSync(worksDir, {withFileTypes: true})
                            .filter((entry) => entry.isDirectory() && namePattern.test(entry.name))
                            .map((entry) => entry.name)
                            .filter((entry) => existsSync(join(worksDir, entry, 'draft.json')))
                        return send(res, 200, names)
                    }
                    if (!namePattern.test(name)) return send(res, 404, {error: 'Работа не найдена'})

                    const sourcePath = join(worksDir, 'source.json')
                    const draftPath = join(worksDir, name, 'draft.json')
                    const approvalPath = join(worksDir, name, 'approval.json')
                    if (!existsSync(draftPath)) return send(res, 404, {error: 'Работа не найдена'})
                    const source = JSON.parse(readFileSync(sourcePath, 'utf8'))

                    if (req.method === 'GET') {
                        return send(res, 200, {source, draft: JSON.parse(readFileSync(draftPath, 'utf8'))})
                    }
                    if (req.method === 'PUT') {
                        const document = validateDocument(JSON.parse(await readBody(req)), source)
                        const text = `${JSON.stringify(document, null, 2)}\n`
                        if (readFileSync(draftPath, 'utf8') === text) {
                            return send(res, 200, {changed: false, approvalRevoked: false})
                        }
                        const temporaryPath = `${draftPath}.tmp-${process.pid}`
                        writeFileSync(temporaryPath, text)
                        renameSync(temporaryPath, draftPath)
                        const approvalRevoked = existsSync(approvalPath)
                        if (approvalRevoked) unlinkSync(approvalPath)
                        return send(res, 200, {changed: true, approvalRevoked})
                    }
                    return send(res, 405, {error: 'Метод не поддерживается'})
                } catch (error) {
                    return send(res, 400, {error: error instanceof Error ? error.message : String(error)})
                }
            })
        },
    }
}

export default defineConfig({
    plugins: [react(), worksApi()],
    server: {
        open: true,
        port: 3000,
    }
})
