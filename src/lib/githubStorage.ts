// ─── GitHub-backed YAML storage layer ────────────────────────────────────
// Each entity type is stored as individual YAML files inside a data/ folder
// in the user's GitHub repository.  Sub-entities (Despesas, Eventos)
// are embedded in their parent YAML so the data is self-contained.
//
// Folder structure:
//   data/prestacoes/{id}.yaml   — Prestacao + embedded Despesas
//   data/discursos/{id}.yaml
//   data/projetos/{id}.yaml
//   data/orientacoes/{id}.yaml
//   data/producao/{id}.yaml
//
// Binary attachments:
//   attachments/prestacoes/{id}/{filename}
//   attachments/despesas/{id}/{filename}
//   attachments/orientacoes/{id}/{filename}

import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import {
  getGitHubConfig,
  listDirectory,
  readFile,
  writeTextFile,
  writeBinaryFile,
  deleteFile as ghDeleteFile,
  decodeContent,
  getRawUrl,
} from './github'
import type {
  Prestacao,
  Despesa,
  Discurso,
  ProjetoFinanciado,
  Orientacao,
  Publicacao,
  Anexo,
  Nucleacao,
  Internacionalizacao,
} from '@/types'

// ─── Internal (persisted) shapes — user_id stripped, sub-entities embedded ──

type StoredAnexo = { id: string; name: string; size: number; type: string; path: string }

type StoredDespesa = {
  id: string
  descricao: string
  data: string
  valor: number
  numero_nota_fiscal?: string
  prestador_servico?: string
  rubrica?: string
  created_at: string
  anexos?: StoredAnexo[]
}

type StoredPrestacao = {
  id: string
  titulo: string
  numero_processo?: string
  numero_edital?: string
  nome_edital?: string
  agencia_fomento?: string
  vigencia_inicio?: string
  vigencia_fim?: string
  total_recursos?: number
  created_at: string
  updated_at: string
  anexo?: StoredAnexo   // legacy — kept for backward-compat when reading old YAMLs
  anexos?: StoredAnexo[]
  despesas: StoredDespesa[]
}

type StoredOrientacao = Omit<Orientacao, 'user_id' | 'projeto_original'> & {
  projeto_original?: StoredAnexo
}

// ─── SHA cache (avoids extra GET before every PUT) ────────────────────────

const shaCache = new Map<string, string>()

// Placeholder user_id for all entities in GitHub mode
const GH_USER = 'github-user'

// ─── Config helper ────────────────────────────────────────────────────────

function cfg() {
  const c = getGitHubConfig()
  if (!c) throw new Error('GitHub não configurado')
  return c
}

// ─── Anexo conversion ─────────────────────────────────────────────────────

function storedToAnexo(sa: StoredAnexo): Anexo {
  return {
    id: sa.id,
    name: sa.name,
    size: sa.size,
    type: sa.type,
    path: sa.path,
    url: getRawUrl(cfg(), sa.path),
  }
}

function anexoToStored(a: Anexo): StoredAnexo {
  return {
    id: a.id,
    name: a.name,
    size: a.size,
    type: a.type,
    path: a.path ?? '',
  }
}

// ─── Low-level YAML helpers ───────────────────────────────────────────────

async function readYaml<T>(filePath: string): Promise<T> {
  const { content, sha, encoding } = await readFile(cfg(), filePath)
  shaCache.set(filePath, sha)
  const text = encoding === 'base64' ? decodeContent(content) : content
  return yamlLoad(text) as T
}

async function writeYaml<T extends object>(filePath: string, data: T, msg: string): Promise<void> {
  const text = yamlDump(data, { indent: 2, lineWidth: -1, skipInvalid: true })
  const sha = shaCache.get(filePath)
  const result = await writeTextFile(cfg(), filePath, text, msg, sha)
  shaCache.set(filePath, result.content.sha)
}

async function deleteYaml(filePath: string, msg: string): Promise<void> {
  let sha = shaCache.get(filePath)
  if (!sha) {
    const { sha: s } = await readFile(cfg(), filePath)
    sha = s
  }
  await ghDeleteFile(cfg(), filePath, sha, msg)
  shaCache.delete(filePath)
}

async function listYamls(dirPath: string): Promise<string[]> {
  const entries = await listDirectory(cfg(), dirPath)
  return entries
    .filter((e) => e.type === 'file' && e.name.endsWith('.yaml'))
    .map((e) => e.path)
}

// ─── File attachment upload ───────────────────────────────────────────────

/**
 * Upload a binary file to attachments/{entityType}/{entityId}/{filename}
 * Returns an Anexo with a raw GitHub URL for immediate use.
 */
export async function uploadAnexo(
  entityType: string,
  entityId: string,
  file: File
): Promise<Anexo> {
  const c = cfg()
  const filePath = `attachments/${entityType}/${entityId}/${file.name}`

  // If the file already exists the GitHub API requires its SHA to update it.
  // Check the cache first to avoid an extra round-trip on the happy path.
  let existingSha = shaCache.get(filePath)
  if (!existingSha) {
    try {
      const existing = await readFile(c, filePath)
      existingSha = existing.sha
      shaCache.set(filePath, existingSha)
    } catch {
      // File doesn't exist yet — no SHA needed for creation.
    }
  }

  const result = await writeBinaryFile(c, filePath, file, `Upload ${file.name}`, existingSha)
  shaCache.set(filePath, result.content.sha)
  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    type: file.type,
    path: filePath,
    url: getRawUrl(c, filePath),
  }
}

/**
 * Fetch a binary attachment from GitHub via the Contents API (uses the stored PAT).
 * Returns a Blob so the file can be displayed inline without exposing raw GitHub URLs.
 */
export async function fetchAttachment(filePath: string): Promise<{ blob: Blob; name: string }> {
  const c = cfg()
  const data = await readFile(c, filePath)
  const clean = data.content.replace(/\n/g, '')
  const binStr = atob(clean)
  const bytes = new Uint8Array(binStr.length)
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
  const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
  const mimeMap: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  return { blob: new Blob([bytes], { type: mimeMap[ext] ?? 'application/octet-stream' }), name: data.name }
}

// ─── PRESTAÇÕES ───────────────────────────────────────────────────────────

export async function loadPrestacoes(): Promise<{
  prestacoes: Prestacao[]
  despesas: Despesa[]
}> {
  const files = await listYamls('data/prestacoes')
  const docs = await Promise.all(files.map((f) => readYaml<StoredPrestacao>(f)))

  const prestacoes: Prestacao[] = []
  const despesas: Despesa[] = []

  for (const doc of docs) {
    // Support legacy `anexo` (singular) and new `anexos` (array)
    const anexos = doc.anexos
      ? doc.anexos.map(storedToAnexo)
      : doc.anexo ? [storedToAnexo(doc.anexo)] : []
    prestacoes.push({ ...doc, user_id: GH_USER, anexos })
    for (const d of doc.despesas ?? []) {
      const dAnexos = (d.anexos ?? []).map(storedToAnexo)
      despesas.push({ ...d, user_id: GH_USER, prestacao_id: doc.id, anexos: dAnexos })
    }
  }

  return { prestacoes, despesas }
}

export async function savePrestacaoFile(
  prestacao: Prestacao,
  allDespesas: Despesa[]
): Promise<void> {
  const myDespesas = allDespesas.filter((d) => d.prestacao_id === prestacao.id)
  const doc: StoredPrestacao = {
    id: prestacao.id,
    titulo: prestacao.titulo,
    numero_processo: prestacao.numero_processo,
    numero_edital: prestacao.numero_edital,
    nome_edital: prestacao.nome_edital,
    agencia_fomento: prestacao.agencia_fomento,
    vigencia_inicio: prestacao.vigencia_inicio,
    vigencia_fim: prestacao.vigencia_fim,
    total_recursos: prestacao.total_recursos,
    created_at: prestacao.created_at,
    updated_at: new Date().toISOString(),
    anexos: (prestacao.anexos ?? []).map(anexoToStored),
    despesas: myDespesas.map((d) => ({
      id: d.id,
      descricao: d.descricao,
      data: d.data,
      valor: d.valor,
      numero_nota_fiscal: d.numero_nota_fiscal,
      prestador_servico: d.prestador_servico,
      rubrica: d.rubrica,
      created_at: d.created_at,
      anexos: (d.anexos ?? []).map(anexoToStored),
    })),
  }
  await writeYaml(`data/prestacoes/${prestacao.id}.yaml`, doc, `Update prestacao ${prestacao.id}`)
}

export async function deletePrestacaoFile(id: string): Promise<void> {
  await deleteYaml(`data/prestacoes/${id}.yaml`, `Delete prestacao ${id}`)
}

// ─── DISCURSOS ────────────────────────────────────────────────────────────

export async function loadDiscursos(): Promise<Discurso[]> {
  const files = await listYamls('data/discursos')
  const docs = await Promise.all(files.map((f) => readYaml<Omit<Discurso, 'user_id'>>(f)))
  return docs.map((d) => ({ ...d, user_id: GH_USER }))
}

export async function saveDiscurso(d: Discurso): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user_id: _u, ...stored } = d
  await writeYaml(`data/discursos/${d.id}.yaml`, stored, `Update discurso ${d.id}`)
}

export async function deleteDiscurso(id: string): Promise<void> {
  await deleteYaml(`data/discursos/${id}.yaml`, `Delete discurso ${id}`)
}

// ─── PROJETOS ─────────────────────────────────────────────────────────────

export async function loadProjetos(): Promise<ProjetoFinanciado[]> {
  const files = await listYamls('data/projetos')
  const docs = await Promise.all(
    files.map((f) => readYaml<Omit<ProjetoFinanciado, 'user_id'>>(f))
  )
  return docs.map((p) => ({ ...p, user_id: GH_USER }))
}

export async function saveProjeto(p: ProjetoFinanciado): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user_id: _u, ...stored } = p
  await writeYaml(`data/projetos/${p.id}.yaml`, stored, `Update projeto ${p.id}`)
}

export async function deleteProjeto(id: string): Promise<void> {
  await deleteYaml(`data/projetos/${id}.yaml`, `Delete projeto ${id}`)
}

// ─── ORIENTAÇÕES ──────────────────────────────────────────────────────────

export async function loadOrientacoes(): Promise<Orientacao[]> {
  const files = await listYamls('data/orientacoes')
  const docs = await Promise.all(files.map((f) => readYaml<StoredOrientacao>(f)))
  return docs.map((doc) => {
    const projeto_original = doc.projeto_original
      ? storedToAnexo(doc.projeto_original)
      : undefined
    return { ...doc, user_id: GH_USER, projeto_original }
  })
}

export async function saveOrientacaoFile(orientacao: Orientacao): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user_id: _u, projeto_original, ...rest } = orientacao
  const doc: StoredOrientacao = {
    ...rest,
    updated_at: new Date().toISOString(),
    projeto_original: projeto_original ? anexoToStored(projeto_original) : undefined,
  }
  await writeYaml(
    `data/orientacoes/${orientacao.id}.yaml`,
    doc,
    `Update orientacao ${orientacao.id}`
  )
}

export async function deleteOrientacaoFile(id: string): Promise<void> {
  await deleteYaml(`data/orientacoes/${id}.yaml`, `Delete orientacao ${id}`)
}

// ─── PRODUÇÃO ─────────────────────────────────────────────────────────────

export async function loadProducao(): Promise<Publicacao[]> {
  const files = await listYamls('data/producao')
  const docs = await Promise.all(files.map((f) => readYaml<Omit<Publicacao, 'user_id'>>(f)))
  return docs.map((p) => ({ ...p, user_id: GH_USER }))
}

export async function savePublicacao(p: Publicacao): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user_id: _u, ...stored } = p
  await writeYaml(`data/producao/${p.id}.yaml`, stored, `Update producao ${p.id}`)
}

export async function deletePublicacao(id: string): Promise<void> {
  await deleteYaml(`data/producao/${id}.yaml`, `Delete producao ${id}`)
}

// ─── NUCLEAÇÕES ───────────────────────────────────────────────────────────

export async function loadNucleacoes(): Promise<Nucleacao[]> {
  const files = await listYamls('data/nucleacoes')
  const docs = await Promise.all(files.map((f) => readYaml<Omit<Nucleacao, 'user_id'>>(f)))
  return docs.map((d) => ({ ...d, user_id: GH_USER }))
}

export async function saveNucleacao(n: Nucleacao): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user_id: _u, ...stored } = n
  await writeYaml(`data/nucleacoes/${n.id}.yaml`, stored, `Update nucleacao ${n.id}`)
}

export async function deleteNucleacao(id: string): Promise<void> {
  await deleteYaml(`data/nucleacoes/${id}.yaml`, `Delete nucleacao ${id}`)
}

// ─── INTERNACIONALIZAÇÃO ──────────────────────────────────────────────────

export async function loadInternacionalizacoes(): Promise<Internacionalizacao[]> {
  const files = await listYamls('data/internacionalizacao')
  const docs = await Promise.all(
    files.map((f) => readYaml<Omit<Internacionalizacao, 'user_id'>>(f))
  )
  return docs.map((d) => ({ ...d, user_id: GH_USER }))
}

export async function saveInternacionalizacao(item: Internacionalizacao): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { user_id: _u, ...stored } = item
  await writeYaml(
    `data/internacionalizacao/${item.id}.yaml`,
    stored,
    `Update internacionalizacao ${item.id}`
  )
}

export async function deleteInternacionalizacao(id: string): Promise<void> {
  await deleteYaml(`data/internacionalizacao/${id}.yaml`, `Delete internacionalizacao ${id}`)
}
