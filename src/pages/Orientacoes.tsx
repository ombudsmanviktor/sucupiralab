import { useState, useEffect, useRef } from 'react'
import {
  Plus, GraduationCap, Pencil, Trash2, FileText, ChevronDown, ChevronUp,
  BookOpen, Link2, Paperclip, Download, X, CalendarDays, Archive, ArchiveRestore,
  Upload, Loader2,
} from 'lucide-react'
import { dump, load } from 'js-yaml'
import { useAuth } from '@/contexts/AuthContext'
import { useDemoData } from '@/hooks/useDemoData'
import { useToast } from '@/hooks/useToast'
import { loadOrientacoes, saveOrientacaoFile, deleteOrientacaoFile, uploadAnexo } from '@/lib/githubStorage'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { ToastContainer } from '@/components/ui/toast'
import type { Orientacao, Tarefa, NotaReuniao, Anexo } from '@/types'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

/* ─── Helpers ─────────────────────────────────────────────────────────── */

/** Authenticated file URL: in-app FileViewer for GitHub mode, blob URL for demo. */
function fileViewerUrl(anexo: Anexo): string {
  if (!anexo.path) return anexo.url
  const base = window.location.href.split('#')[0]
  return `${base}#/file/${anexo.path}`
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function downloadNotasMarkdown(o: Orientacao) {
  const reunioes = o.reunioes ?? []
  const sorted = [...reunioes].sort((a, b) => {
    if (a.data && b.data) return b.data.localeCompare(a.data)
    if (a.data) return -1
    if (b.data) return 1
    return 0
  })
  const lines: string[] = [
    `# Notas de Orientação`,
    ``,
    `**Orientado(a):** ${o.nome_orientando}`,
    `**Curso:** ${o.curso}`,
  ]
  if (o.titulo_provisorio) lines.push(`**Título Provisório:** ${o.titulo_provisorio}`)
  if (o.ano_ingresso) lines.push(`**Ano de Ingresso:** ${o.ano_ingresso}`)
  if (o.previsao_conclusao) lines.push(`**Previsão de Conclusão:** ${o.previsao_conclusao}`)
  lines.push(``, `---`, ``)
  if (sorted.length === 0) {
    lines.push(`_Nenhuma anotação registrada._`)
  } else {
    sorted.forEach(r => {
      lines.push(r.data ? `## ${r.data}` : `## (sem data)`)
      lines.push(``, r.texto, ``)
      if (r.anexo) lines.push(`📎 ${r.anexo.name}`, ``)
    })
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reunioes-${o.nome_orientando.replace(/\s+/g, '-').toLowerCase()}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function exportPDF(orientacoes: Orientacao[]) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('Orientações', 14, 22)
  autoTable(doc, {
    startY: 30,
    head: [['Orientado(a)', 'Curso', 'Título Provisório', 'Ingresso', 'Conclusão']],
    body: orientacoes.map(o => [
      o.nome_orientando, o.curso, o.titulo_provisorio ?? '—',
      o.ano_ingresso ? String(o.ano_ingresso) : '—', o.previsao_conclusao ?? '—',
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [190, 24, 93] },
  })
  doc.save('orientacoes.pdf')
}

function exportExcel(orientacoes: Orientacao[]) {
  const ws = XLSX.utils.json_to_sheet(orientacoes.map(o => ({
    'Orientado(a)': o.nome_orientando,
    Curso: o.curso,
    'Título Provisório': o.titulo_provisorio ?? '',
    'Ano Ingresso': o.ano_ingresso ?? '',
    'Previsão Conclusão': o.previsao_conclusao ?? '',
    'Exame de Qualificação': o.exame_qualificacao ? 'Sim' : '',
  })))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Orientações')
  XLSX.writeFile(wb, 'orientacoes.xlsx')
}

function exportAllYAML(orientacoes: Orientacao[], tarefas: Tarefa[]) {
  const data = orientacoes.map(o => ({
    id: o.id,
    nome_orientando: o.nome_orientando,
    curso: o.curso,
    ...(o.titulo_provisorio ? { titulo_provisorio: o.titulo_provisorio } : {}),
    ...(o.ano_ingresso != null ? { ano_ingresso: o.ano_ingresso } : {}),
    ...(o.previsao_conclusao ? { previsao_conclusao: o.previsao_conclusao } : {}),
    ...(o.exame_qualificacao ? { exame_qualificacao: true } : {}),
    ...(o.arquivada ? { arquivada: true } : {}),
    leituras: o.leituras ?? [],
    links_documentos: o.links_documentos ?? [],
    reunioes: (o.reunioes ?? []).map(r => ({
      id: r.id,
      ...(r.data ? { data: r.data } : {}),
      texto: r.texto,
      ...(r.anexo ? { anexo: { name: r.anexo.name, size: r.anexo.size, ...(r.anexo.path ? { path: r.anexo.path } : {}) } } : {}),
    })),
    tarefas: tarefas.filter(t => t.orientacao_id === o.id).map(t => ({
      id: t.id,
      descricao: t.descricao,
      concluida: t.concluida,
      created_at: t.created_at,
    })),
    ...(o.projeto_original ? {
      projeto_original: {
        name: o.projeto_original.name,
        size: o.projeto_original.size,
        ...(o.projeto_original.path ? { path: o.projeto_original.path } : {}),
      },
    } : {}),
    created_at: o.created_at,
    updated_at: o.updated_at,
  }))
  const header = `# Exportação de Orientações — SucupiraLAB\n# Gerado em: ${new Date().toISOString()}\n\n`
  const yamlStr = dump(data, { lineWidth: -1, sortKeys: false })
  const blob = new Blob([header + yamlStr], { type: 'text/yaml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `orientacoes-${new Date().toISOString().slice(0, 10)}.yaml`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ─── Constants ───────────────────────────────────────────────────────── */

const CURSOS = ['Doutorado', 'Mestrado', 'Iniciação Científica', 'TCC', 'Pós-Doutorado']

const CURSO_COLORS: Record<string, string> = {
  Doutorado: 'bg-pink-100 text-pink-700',
  Mestrado: 'bg-purple-100 text-purple-700',
  'Iniciação Científica': 'bg-blue-100 text-blue-700',
  TCC: 'bg-teal-100 text-teal-700',
  'Pós-Doutorado': 'bg-orange-100 text-orange-700',
}

const needsQualificacao = (curso: string) =>
  curso === 'Mestrado' || curso === 'Doutorado'

/* ─── Form type ──────────────────────────────────────────────────────── */

type OrientacaoForm = {
  nome_orientando: string
  curso: string
  titulo_provisorio: string
  ano_ingresso?: number
  previsao_conclusao: string
  exame_qualificacao: boolean
}

const emptyForm: OrientacaoForm = {
  nome_orientando: '', curso: 'Mestrado', titulo_provisorio: '',
  ano_ingresso: undefined, previsao_conclusao: '',
  exame_qualificacao: false,
}

/* ─── Component ──────────────────────────────────────────────────────── */

export function Orientacoes() {
  const { isDemoMode } = useAuth()
  const demo = useDemoData()
  const { toasts, toast, dismiss } = useToast()

  const [orientacoes, setOrientacoes] = useState<Orientacao[]>(isDemoMode ? demo.orientacoes : [])
  const [tarefas, setTarefas] = useState<Tarefa[]>(isDemoMode ? demo.tarefas : [])
  const [loading, setLoading] = useState(!isDemoMode)

  // Dialog / form
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Orientacao | null>(null)
  const [form, setForm] = useState<OrientacaoForm>(emptyForm)
  const [pendingProjetoOriginal, setPendingProjetoOriginal] = useState<Anexo | null>(null)
  const [pendingProjetoFile, setPendingProjetoFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  // Expand/collapse cards
  const [expanded, setExpanded] = useState<string | null>(null)

  // Archived section
  const [showArchived, setShowArchived] = useState(false)

  // Tarefa inline add
  // Reunião inline add
  const [activeReuniaoId, setActiveReuniaoId] = useState<string | null>(null)
  const [novaReuniaoData, setNovaReuniaoData] = useState('')
  const [novaReuniaoTexto, setNovaReuniaoTexto] = useState('')
  const [novaReuniaoFile, setNovaReuniaoFile] = useState<File | null>(null)
  const reuniaoFileRef = useRef<HTMLInputElement>(null)

  // Leitura inline add
  const [novaLeitura, setNovaLeitura] = useState('')
  const [activeLeituraId, setActiveLeituraId] = useState<string | null>(null)

  // Link inline add
  const [novaLink, setNovaLink] = useState('')
  const [activeLinkId, setActiveLinkId] = useState<string | null>(null)

  useEffect(() => {
    if (isDemoMode) return
    loadOrientacoes().then(({ orientacoes: o, tarefas: t }) => {
      setOrientacoes(o)
      setTarefas(t)
      setLoading(false)
    }).catch(err => { toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' }); setLoading(false) })
  }, [isDemoMode])

  /* ── Form open/close ── */

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setPendingProjetoOriginal(null)
    setPendingProjetoFile(null)
    setShowForm(true)
  }

  function openEdit(o: Orientacao) {
    setEditing(o)
    setForm({
      nome_orientando: o.nome_orientando,
      curso: o.curso,
      titulo_provisorio: o.titulo_provisorio ?? '',
      ano_ingresso: o.ano_ingresso,
      previsao_conclusao: o.previsao_conclusao ?? '',
      exame_qualificacao: o.exame_qualificacao ?? false,
    })
    setPendingProjetoOriginal(null)
    setPendingProjetoFile(null)
    setShowForm(true)
  }

  /* ── CRUD ── */

  async function handleSave() {
    if (!form.nome_orientando.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' })
      return
    }
    const projeto_original = pendingProjetoOriginal ?? editing?.projeto_original ?? undefined

    const payload = {
      nome_orientando: form.nome_orientando,
      curso: form.curso,
      titulo_provisorio: form.titulo_provisorio,
      ano_ingresso: form.ano_ingresso ? Number(form.ano_ingresso) : undefined,
      previsao_conclusao: form.previsao_conclusao,
      exame_qualificacao: form.exame_qualificacao,
      leituras: editing?.leituras ?? [],
      links_documentos: editing?.links_documentos ?? [],
      projeto_original,
    }

    if (isDemoMode) {
      if (editing) {
        setOrientacoes(prev => prev.map(o =>
          o.id === editing.id ? { ...o, ...payload, updated_at: new Date().toISOString() } : o
        ))
      } else {
        setOrientacoes(prev => [{
          id: Date.now().toString(),
          user_id: 'demo-user-id',
          ...payload,
          reunioes: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        } as Orientacao, ...prev])
      }
      toast({ title: editing ? 'Orientação atualizada' : 'Orientação criada' })
      setPendingProjetoOriginal(null)
      setShowForm(false)
      return
    }

    const now = new Date().toISOString()
    const id = editing ? editing.id : crypto.randomUUID()
    let savedProjetoOriginal: Anexo | undefined = pendingProjetoOriginal ?? editing?.projeto_original ?? undefined
    if (pendingProjetoFile) {
      savedProjetoOriginal = await uploadAnexo('orientacoes', id, pendingProjetoFile)
    }
    const ghOrientacao: Orientacao = {
      id,
      user_id: 'github-user',
      ...payload,
      projeto_original: savedProjetoOriginal,
      reunioes: editing?.reunioes ?? [],
      created_at: editing?.created_at ?? now,
      updated_at: now,
    }
    try {
      await saveOrientacaoFile(ghOrientacao, tarefas)
    } catch (err: any) { toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' }); return }
    setOrientacoes(prev => editing ? prev.map(o => o.id === id ? ghOrientacao : o) : [ghOrientacao, ...prev])
    toast({ title: editing ? 'Orientação atualizada' : 'Orientação criada' })
    setPendingProjetoOriginal(null)
    setPendingProjetoFile(null)
    setShowForm(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta orientação?')) return
    if (isDemoMode) {
      setOrientacoes(prev => prev.filter(o => o.id !== id))
      setTarefas(prev => prev.filter(t => t.orientacao_id !== id))
      toast({ title: 'Orientação removida' })
      return
    }
    try {
      await deleteOrientacaoFile(id)
    } catch (err: any) { toast({ title: 'Erro ao remover', variant: 'destructive' }); return }
    setOrientacoes(prev => prev.filter(o => o.id !== id))
    setTarefas(prev => prev.filter(t => t.orientacao_id !== id))
    toast({ title: 'Orientação removida' })
  }

  /* ── Archive ── */

  async function handleArchive(o: Orientacao) {
    const updated: Orientacao = { ...o, arquivada: !o.arquivada, updated_at: new Date().toISOString() }
    if (isDemoMode) {
      setOrientacoes(prev => prev.map(x => x.id === o.id ? updated : x))
      toast({ title: o.arquivada ? 'Orientação reativada' : 'Orientação arquivada' })
      return
    }
    try {
      await saveOrientacaoFile(updated, tarefas)
      setOrientacoes(prev => prev.map(x => x.id === o.id ? updated : x))
      toast({ title: o.arquivada ? 'Orientação reativada' : 'Orientação arquivada' })
    } catch (err: any) {
      toast({ title: 'Erro ao arquivar', description: err.message, variant: 'destructive' })
    }
  }

  /* ── Import YAML ── */

  async function handleImportYAML(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    try {
      const text = await file.text()
      const raw = load(text) as any[]
      if (!Array.isArray(raw)) throw new Error('Arquivo inválido: esperado array YAML')

      const importedOrientacoes: Orientacao[] = []
      const importedTarefas: Tarefa[] = []

      for (const item of raw) {
        const o: Orientacao = {
          id: item.id ?? crypto.randomUUID(),
          user_id: isDemoMode ? 'demo-user-id' : 'github-user',
          nome_orientando: item.nome_orientando ?? '',
          curso: item.curso ?? 'Mestrado',
          titulo_provisorio: item.titulo_provisorio,
          ano_ingresso: item.ano_ingresso,
          previsao_conclusao: item.previsao_conclusao,
          exame_qualificacao: item.exame_qualificacao,
          arquivada: item.arquivada,
          leituras: item.leituras ?? [],
          links_documentos: item.links_documentos ?? [],
          reunioes: (item.reunioes ?? []).map((r: any) => ({
            id: r.id ?? crypto.randomUUID(),
            ...(r.data ? { data: r.data } : {}),
            texto: r.texto ?? '',
            ...(r.anexo ? { anexo: r.anexo as Anexo } : {}),
          })),
          ...(item.projeto_original ? { projeto_original: item.projeto_original as Anexo } : {}),
          created_at: item.created_at ?? new Date().toISOString(),
          updated_at: item.updated_at ?? new Date().toISOString(),
        }
        importedOrientacoes.push(o)

        const itemTarefas: Tarefa[] = (item.tarefas ?? []).map((t: any) => ({
          id: t.id ?? crypto.randomUUID(),
          user_id: isDemoMode ? 'demo-user-id' : 'github-user',
          orientacao_id: o.id,
          descricao: t.descricao ?? '',
          concluida: t.concluida ?? false,
          created_at: t.created_at ?? new Date().toISOString(),
        }))
        importedTarefas.push(...itemTarefas)
      }

      // Merge: overwrite by id, append new
      setOrientacoes(prev => {
        const map = new Map(prev.map(x => [x.id, x]))
        importedOrientacoes.forEach(o => map.set(o.id, o))
        return Array.from(map.values())
      })
      setTarefas(prev => {
        const ids = new Set(importedTarefas.map(t => t.orientacao_id))
        const kept = prev.filter(t => !ids.has(t.orientacao_id))
        return [...kept, ...importedTarefas]
      })

      if (!isDemoMode) {
        for (let i = 0; i < importedOrientacoes.length; i++) {
          const o = importedOrientacoes[i]
          const its = importedTarefas.filter(t => t.orientacao_id === o.id)
          await saveOrientacaoFile(o, its)
        }
      }

      toast({ title: `${importedOrientacoes.length} orientação(ões) importada(s)` })
    } catch (err: any) {
      toast({ title: 'Erro ao importar', description: err.message, variant: 'destructive' })
    } finally {
      setImporting(false)
    }
  }

  /* ── Tarefas ── */

  /* ── Reuniões ── */

  async function addReuniao(orientacaoId: string) {
    if (!novaReuniaoTexto.trim()) return

    let anexo: Anexo | undefined
    if (novaReuniaoFile) {
      if (isDemoMode) {
        anexo = {
          id: crypto.randomUUID(),
          name: novaReuniaoFile.name,
          size: novaReuniaoFile.size,
          url: URL.createObjectURL(novaReuniaoFile),
          type: novaReuniaoFile.type,
        }
      } else {
        try {
          anexo = await uploadAnexo('orientacoes', orientacaoId, novaReuniaoFile)
        } catch (err: any) {
          toast({ title: 'Erro ao fazer upload', description: err.message, variant: 'destructive' })
          return
        }
      }
    }

    const entry: NotaReuniao = {
      id: crypto.randomUUID(),
      ...(novaReuniaoData ? { data: novaReuniaoData } : {}),
      texto: novaReuniaoTexto.trim(),
      ...(anexo ? { anexo } : {}),
    }
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o : { ...o, reunioes: [...(o.reunioes ?? []), entry] }
    )
    setOrientacoes(updatedOrientacoes)
    setNovaReuniaoTexto('')
    setNovaReuniaoData('')
    setNovaReuniaoFile(null)
    setActiveReuniaoId(null)
    if (!isDemoMode) {
      const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
      saveOrientacaoFile(updatedO, tarefas).catch(() => {})
    }
  }

  function deleteReuniao(orientacaoId: string, reuniaoId: string) {
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o
        : { ...o, reunioes: (o.reunioes ?? []).filter(r => r.id !== reuniaoId) }
    )
    setOrientacoes(updatedOrientacoes)
    if (!isDemoMode) {
      const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
      saveOrientacaoFile(updatedO, tarefas).catch(() => {})
    }
  }

  function deleteReuniaoAnexo(orientacaoId: string, reuniaoId: string) {
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o
        : {
            ...o, reunioes: (o.reunioes ?? []).map(r =>
              r.id !== reuniaoId ? r : { ...r, anexo: undefined }
            ),
          }
    )
    setOrientacoes(updatedOrientacoes)
    if (!isDemoMode) {
      const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
      saveOrientacaoFile(updatedO, tarefas).catch(() => {})
    }
  }

  /* ── Leituras ── */

  async function addLeitura(orientacaoId: string) {
    if (!novaLeitura.trim()) return
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o
        : { ...o, leituras: [...(o.leituras ?? []), novaLeitura.trim()], updated_at: new Date().toISOString() }
    )
    setOrientacoes(updatedOrientacoes)
    setNovaLeitura('')
    setActiveLeituraId(null)
    if (!isDemoMode) {
      const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
      saveOrientacaoFile(updatedO, tarefas).catch(() => {})
    }
  }

  function deleteLeitura(orientacaoId: string, idx: number) {
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o
        : { ...o, leituras: (o.leituras ?? []).filter((_, i) => i !== idx), updated_at: new Date().toISOString() }
    )
    setOrientacoes(updatedOrientacoes)
    if (!isDemoMode) {
      const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
      saveOrientacaoFile(updatedO, tarefas).catch(() => {})
    }
  }

  /* ── Links ── */

  async function addLink(orientacaoId: string) {
    if (!novaLink.trim()) return
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o
        : { ...o, links_documentos: [...(o.links_documentos ?? []), novaLink.trim()], updated_at: new Date().toISOString() }
    )
    setOrientacoes(updatedOrientacoes)
    setNovaLink('')
    setActiveLinkId(null)
    if (!isDemoMode) {
      const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
      saveOrientacaoFile(updatedO, tarefas).catch(() => {})
    }
  }

  function deleteLink(orientacaoId: string, idx: number) {
    const updatedOrientacoes = orientacoes.map(o =>
      o.id !== orientacaoId ? o
        : { ...o, links_documentos: (o.links_documentos ?? []).filter((_, i) => i !== idx), updated_at: new Date().toISOString() }
    )
    setOrientacoes(updatedOrientacoes)
    if (!isDemoMode) {
      const updatedO = updatedOrientacoes.find(o => o.id === orientacaoId)!
      saveOrientacaoFile(updatedO, tarefas).catch(() => {})
    }
  }

  /* ── File pickers ── */

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingProjetoOriginal({
      id: crypto.randomUUID(),
      name: file.name,
      size: file.size,
      url: URL.createObjectURL(file),
      type: file.type,
    })
    setPendingProjetoFile(file)
    e.target.value = ''
  }

  function handleReuniaoFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setNovaReuniaoFile(file)
    e.target.value = ''
  }

  /* ── Grouped list ── */

  const activeOrientacoes = orientacoes.filter(o => !o.arquivada)
  const archivedOrientacoes = orientacoes.filter(o => o.arquivada)
  const byCurso = CURSOS.filter(c => activeOrientacoes.some(o => o.curso === c))

  /* ─── Render ──────────────────────────────────────────────────────── */

  return (
    <div className="animate-fade-in space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Hidden file inputs */}
      <input type="file" ref={fileRef} className="hidden" onChange={handleFileSelect} />
      <input type="file" ref={reuniaoFileRef} className="hidden" onChange={handleReuniaoFileSelect} />

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-100 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-pink-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Orientações</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Gestão de orientandos(as) e tarefas</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportExcel(orientacoes)}>
            <FileText className="w-4 h-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF(orientacoes)}>
            <FileText className="w-4 h-4" /> PDF
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportAllYAML(orientacoes, tarefas)} title="Exporta todas as orientações em YAML para backup ou importação">
            <Download className="w-4 h-4" /> Exportar Todas
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => importFileRef.current?.click()}
            disabled={importing}
            title="Importar orientações de um arquivo YAML exportado anteriormente"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Importar
          </Button>
          <input
            ref={importFileRef}
            type="file"
            accept=".yaml,.yml"
            className="hidden"
            onChange={handleImportYAML}
          />
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4" /> Nova Orientação
          </Button>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <Card className="sm:col-span-1">
          <CardContent className="pt-5 pb-4">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
            <p className="text-3xl font-bold text-gray-900 dark:text-white">{activeOrientacoes.length}</p>
          </CardContent>
        </Card>
        {CURSOS.map(c => (
          <Card key={c}>
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-tight">{c}</p>
              <p className="text-3xl font-bold text-pink-700">
                {activeOrientacoes.filter(o => o.curso === c).length}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── List ── */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-gray-200 dark:border-gray-700 border-t-pink-500 rounded-full animate-spin" />
        </div>
      ) : orientacoes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-gray-400 dark:text-gray-500">
            <GraduationCap className="w-10 h-10 mb-2" />
            <p className="text-sm">Nenhum(a) orientando(a) cadastrado(a)</p>
            <Button variant="ghost" size="sm" className="mt-3" onClick={openNew}>
              Adicionar primeiro(a) orientando(a)
            </Button>
          </CardContent>
        </Card>
      ) : (
        byCurso.map(curso => (
          <div key={curso}>
            <div className="flex items-center gap-2 mb-3">
              <Badge className={`${CURSO_COLORS[curso] ?? 'bg-gray-100 text-gray-700'} border-0`}>
                {curso}
              </Badge>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {orientacoes.filter(o => o.curso === curso).length}
              </span>
            </div>
            <div className="space-y-3">
              {activeOrientacoes.filter(o => o.curso === curso).map(o => {
                const isOpen = expanded === o.id
                const reunioes = o.reunioes ?? []
                const sortedReunioes = [...reunioes].sort((a, b) => {
                  if (a.data && b.data) return b.data.localeCompare(a.data)
                  if (a.data) return -1
                  if (b.data) return 1
                  return 0
                })

                return (
                  <Card key={o.id} className="hover:shadow-md transition-shadow">
                    {/* Card header */}
                    <div
                      className="flex items-center gap-3 px-6 py-4 cursor-pointer"
                      onClick={() => setExpanded(isOpen ? null : o.id)}
                    >
                      <div className="w-9 h-9 rounded-full bg-pink-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm font-bold text-pink-700">
                          {o.nome_orientando.charAt(0)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 dark:text-white">{o.nome_orientando}</span>
                          <Badge className={`${CURSO_COLORS[o.curso] ?? 'bg-gray-100 text-gray-700'} border-0 text-xs`}>
                            {o.curso}
                          </Badge>
                          {needsQualificacao(o.curso) && o.exame_qualificacao && (
                            <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">
                              Qualificado(a)
                            </Badge>
                          )}
                        </div>
                        {o.titulo_provisorio && (
                          <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-0.5">{o.titulo_provisorio}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 mt-0.5 flex-wrap">
                          {o.ano_ingresso && <span>Ingresso: {o.ano_ingresso}</span>}
                          {o.previsao_conclusao && <span>Conclusão: {o.previsao_conclusao}</span>}
                          {reunioes.length > 0 && (
                            <span>{reunioes.length} reunião(ões)</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="ghost" size="icon"
                          onClick={e => { e.stopPropagation(); openEdit(o) }}
                          title="Editar"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          title="Arquivar orientação concluída"
                          onClick={e => { e.stopPropagation(); handleArchive(o) }}
                        >
                          <Archive className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                        </Button>
                        <Button
                          variant="ghost" size="icon"
                          onClick={e => { e.stopPropagation(); handleDelete(o.id) }}
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                        {isOpen
                          ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                          : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                        }
                      </div>
                    </div>

                    {/* Expanded tabs */}
                    {isOpen && (
                      <div className="border-t border-gray-100 dark:border-gray-700 px-6 py-4">
                        <Tabs defaultValue="reunioes">
                          <TabsList className="mb-4 flex-wrap h-auto gap-1">
                            <TabsTrigger value="reunioes">
                              Reuniões ({reunioes.length})
                            </TabsTrigger>
                            <TabsTrigger value="leituras">
                              Leituras ({(o.leituras ?? []).length})
                            </TabsTrigger>
                            <TabsTrigger value="links">
                              Links ({(o.links_documentos ?? []).length})
                            </TabsTrigger>
                            {o.projeto_original && (
                              <TabsTrigger value="projeto">Projeto</TabsTrigger>
                            )}
                          </TabsList>

                          {/* ── Reuniões tab ── */}
                          <TabsContent value="reunioes">
                            {/* Toolbar */}
                            <div className="flex justify-end mb-3">
                              <Button
                                variant="outline" size="sm"
                                onClick={() => downloadNotasMarkdown(o)}
                                disabled={reunioes.length === 0}
                              >
                                <Download className="w-3.5 h-3.5" /> Baixar Markdown
                              </Button>
                            </div>

                            {/* Entry list — timeline */}
                            <div className="space-y-0 mb-4">
                              {sortedReunioes.length === 0 && (
                                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                                  Nenhuma anotação registrada
                                </p>
                              )}
                              {sortedReunioes.map((r, idx) => (
                                <div key={r.id} className="flex gap-3 group">
                                  {/* Timeline dot + line */}
                                  <div className="flex flex-col items-center pt-1.5 flex-shrink-0">
                                    <div className="w-2 h-2 rounded-full bg-pink-400 flex-shrink-0" />
                                    {idx < sortedReunioes.length - 1 && (
                                      <div className="w-px flex-1 bg-gray-200 dark:bg-gray-700 my-1" style={{ minHeight: 24 }} />
                                    )}
                                  </div>
                                  {/* Content */}
                                  <div className="flex-1 pb-4">
                                    {r.data ? (
                                      <div className="flex items-center gap-1.5 mb-1">
                                        <CalendarDays className="w-3 h-3 text-gray-400 dark:text-gray-500" />
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{r.data}</span>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-gray-400 dark:text-gray-500 italic mb-1 block">
                                        Sem data
                                      </span>
                                    )}
                                    <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{r.texto}</p>
                                    {/* Attachment */}
                                    {r.anexo && (
                                      <div className="mt-2 flex items-center gap-2">
                                        <a
                                          href={fileViewerUrl(r.anexo)}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-2 py-1 rounded-md transition-colors"
                                        >
                                          <Paperclip className="w-3 h-3 flex-shrink-0" />
                                          <span className="truncate max-w-[200px]">{r.anexo.name}</span>
                                          <span className="text-gray-400 dark:text-gray-500 ml-0.5">
                                            ({formatFileSize(r.anexo.size)})
                                          </span>
                                        </a>
                                        <button
                                          onClick={() => deleteReuniaoAnexo(o.id, r.id)}
                                          className="text-gray-300 dark:text-gray-600 hover:text-red-500 transition-colors"
                                          title="Remover anexo"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                  {/* Delete reunião */}
                                  <button
                                    onClick={() => deleteReuniao(o.id, r.id)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 flex-shrink-0 mt-0.5"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>

                            {/* Add entry form */}
                            <div
                              className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-2 bg-gray-50 dark:bg-gray-800"
                              onClick={e => e.stopPropagation()}
                            >
                              <div className="flex items-center gap-2">
                                <CalendarDays className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                <Input
                                  type="date"
                                  value={activeReuniaoId === o.id ? novaReuniaoData : ''}
                                  onChange={e => {
                                    setActiveReuniaoId(o.id)
                                    setNovaReuniaoData(e.target.value)
                                  }}
                                  className="h-7 text-xs w-40"
                                />
                                <span className="text-xs text-gray-400 dark:text-gray-500">data opcional</span>
                              </div>
                              <Textarea
                                value={activeReuniaoId === o.id ? novaReuniaoTexto : ''}
                                onChange={e => {
                                  setActiveReuniaoId(o.id)
                                  setNovaReuniaoTexto(e.target.value)
                                }}
                                placeholder="Anotação da reunião..."
                                rows={2}
                                className="text-sm"
                              />
                              {/* File attachment */}
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => { setActiveReuniaoId(o.id); reuniaoFileRef.current?.click() }}
                                  className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 rounded border border-gray-200 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-400 transition-colors bg-white dark:bg-gray-900"
                                >
                                  <Paperclip className="w-3.5 h-3.5" />
                                  {activeReuniaoId === o.id && novaReuniaoFile
                                    ? novaReuniaoFile.name
                                    : 'Anexar arquivo'}
                                </button>
                                {activeReuniaoId === o.id && novaReuniaoFile && (
                                  <button
                                    onClick={() => setNovaReuniaoFile(null)}
                                    className="text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
                                    title="Remover arquivo"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <div className="flex justify-end">
                                <Button
                                  size="sm" variant="outline"
                                  onClick={() => {
                                    setActiveReuniaoId(o.id)
                                    addReuniao(o.id)
                                  }}
                                  disabled={
                                    !(activeReuniaoId === o.id && novaReuniaoTexto.trim())
                                  }
                                >
                                  <Plus className="w-3.5 h-3.5" /> Adicionar
                                </Button>
                              </div>
                            </div>
                          </TabsContent>

                          {/* ── Leituras tab ── */}
                          <TabsContent value="leituras">
                            <div className="space-y-1.5 mb-3">
                              {(o.leituras ?? []).map((l, i) => (
                                <div
                                  key={i}
                                  className="flex items-start gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 group"
                                >
                                  <BookOpen className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 mt-0.5 flex-shrink-0" />
                                  <span className="text-sm text-gray-700 dark:text-gray-200 flex-1">{l}</span>
                                  <button
                                    onClick={() => deleteLeitura(o.id, i)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 flex-shrink-0"
                                    title="Remover"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              {(o.leituras ?? []).length === 0 && (
                                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">
                                  Nenhuma leitura indicada
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                              <Input
                                value={activeLeituraId === o.id ? novaLeitura : ''}
                                onChange={e => { setActiveLeituraId(o.id); setNovaLeitura(e.target.value) }}
                                onKeyDown={e => { if (e.key === 'Enter') addLeitura(o.id) }}
                                placeholder="Referência (Enter para adicionar)"
                                className="flex-1"
                              />
                              <Button
                                size="sm" variant="outline"
                                onClick={() => { setActiveLeituraId(o.id); addLeitura(o.id) }}
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            </div>
                          </TabsContent>

                          {/* ── Links tab ── */}
                          <TabsContent value="links">
                            <div className="space-y-1.5 mb-3">
                              {(o.links_documentos ?? []).map((link, i) => (
                                <div
                                  key={i}
                                  className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 group"
                                >
                                  <Link2 className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                  <a
                                    href={link}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm text-blue-600 truncate flex-1 hover:underline"
                                  >
                                    {link}
                                  </a>
                                  <button
                                    onClick={() => deleteLink(o.id, i)}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 flex-shrink-0"
                                    title="Remover"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                              {(o.links_documentos ?? []).length === 0 && (
                                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-2">
                                  Nenhum link cadastrado
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                              <Input
                                value={activeLinkId === o.id ? novaLink : ''}
                                onChange={e => { setActiveLinkId(o.id); setNovaLink(e.target.value) }}
                                onKeyDown={e => { if (e.key === 'Enter') addLink(o.id) }}
                                placeholder="https://... (Enter para adicionar)"
                                className="flex-1"
                              />
                              <Button
                                size="sm" variant="outline"
                                onClick={() => { setActiveLinkId(o.id); addLink(o.id) }}
                              >
                                <Plus className="w-4 h-4" />
                              </Button>
                            </div>
                          </TabsContent>

                          {/* ── Tarefas tab ── */}
                          {/* ── Projeto Original tab (conditional) ── */}
                          {o.projeto_original && (
                            <TabsContent value="projeto">
                              <a
                                href={fileViewerUrl(o.projeto_original)}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
                              >
                                <Paperclip className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                                    {o.projeto_original.name}
                                  </p>
                                  <p className="text-xs text-gray-400 dark:text-gray-500">
                                    {formatFileSize(o.projeto_original.size)}
                                  </p>
                                </div>
                                <Download className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300" />
                              </a>
                            </TabsContent>
                          )}
                        </Tabs>
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          </div>
        ))
      )}

      {/* ── Orientações Concluídas (arquivadas) ── */}
      {!loading && archivedOrientacoes.length > 0 && (
        <div className="mt-2 pt-4 border-t border-dashed border-gray-200 dark:border-gray-700">
          <button
            className="flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-300 transition-colors mb-3"
            onClick={() => setShowArchived(v => !v)}
          >
            {showArchived ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            <Archive className="w-4 h-4" />
            <span>Orientações Concluídas ({archivedOrientacoes.length})</span>
          </button>
          {showArchived && (
            <div className="space-y-1.5">
              {archivedOrientacoes.map(o => (
                <div
                  key={o.id}
                  className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-lg group hover:border-gray-200 dark:hover:border-gray-600 transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-gray-400 dark:text-gray-500">
                      {o.nome_orientando.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{o.nome_orientando}</span>
                    {o.titulo_provisorio && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{o.titulo_provisorio}</p>
                    )}
                  </div>
                  <Badge className={`${CURSO_COLORS[o.curso] ?? 'bg-gray-100 text-gray-700'} border-0 text-xs opacity-60`}>
                    {o.curso}
                  </Badge>
                  {o.previsao_conclusao && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 hidden sm:inline">{o.previsao_conclusao}</span>
                  )}
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      title="Reativar orientação"
                      onClick={() => handleArchive(o)}
                    >
                      <ArchiveRestore className="w-3.5 h-3.5 text-green-500" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      title="Editar"
                      onClick={() => openEdit(o)}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      title="Excluir"
                      onClick={() => handleDelete(o.id)}
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Form Dialog ── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-gray-900 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Editar Orientação' : 'Nova Orientação'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              {/* Nome — full width */}
              <div className="col-span-2 space-y-1.5">
                <Label>Nome do(a) Orientando(a) *</Label>
                <Input
                  value={form.nome_orientando}
                  onChange={e => setForm(f => ({ ...f, nome_orientando: e.target.value }))}
                  placeholder="Nome completo"
                />
              </div>

              {/* Curso */}
              <div className="space-y-1.5">
                <Label>Curso *</Label>
                <select
                  value={form.curso}
                  onChange={e => setForm(f => ({
                    ...f, curso: e.target.value, exame_qualificacao: false,
                  }))}
                  className="flex h-9 w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 dark:text-white px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  {CURSOS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              {/* Título Provisório */}
              <div className="space-y-1.5">
                <Label>Título Provisório</Label>
                <Input
                  value={form.titulo_provisorio}
                  onChange={e => setForm(f => ({ ...f, titulo_provisorio: e.target.value }))}
                  placeholder="Título da dissertação/tese"
                />
              </div>

              {/* Ano de Ingresso + Previsão de Conclusão */}
              <div className="space-y-1.5">
                <Label>Ano de Ingresso</Label>
                <Input
                  type="number"
                  value={form.ano_ingresso ?? ''}
                  onChange={e => setForm(f => ({
                    ...f, ano_ingresso: e.target.value ? Number(e.target.value) : undefined,
                  }))}
                  placeholder="2023"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Previsão de Conclusão</Label>
                <Input
                  value={form.previsao_conclusao}
                  onChange={e => setForm(f => ({ ...f, previsao_conclusao: e.target.value }))}
                  placeholder="Ex: 2025/1"
                />
              </div>

              {/* Projeto Original */}
              <div className="col-span-2 space-y-1.5">
                <Label>Projeto Original</Label>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Paperclip className="w-4 h-4" /> Anexar Arquivo
                  </Button>
                  {pendingProjetoOriginal && (
                    <span className="flex items-center gap-1.5 text-sm text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-lg">
                      <FileText className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                      {pendingProjetoOriginal.name}
                      <span className="text-xs text-gray-400 dark:text-gray-500 ml-0.5">
                        ({formatFileSize(pendingProjetoOriginal.size)})
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingProjetoOriginal(null)}
                        className="ml-1 text-gray-400 dark:text-gray-500 hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  )}
                  {!pendingProjetoOriginal && editing?.projeto_original && (
                    <span className="text-sm text-gray-500 dark:text-gray-400 italic">
                      Atual: {editing.projeto_original.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Exame de Qualificação */}
              {needsQualificacao(form.curso) && (
                <div className="col-span-2 flex items-center gap-2.5">
                  <Checkbox
                    id="exame-qualificacao"
                    checked={form.exame_qualificacao}
                    onCheckedChange={v => setForm(f => ({
                      ...f, exame_qualificacao: Boolean(v),
                    }))}
                  />
                  <Label htmlFor="exame-qualificacao" className="cursor-pointer font-normal">
                    Exame de Qualificação realizado
                  </Label>
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave}>{editing ? 'Salvar' : 'Criar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
