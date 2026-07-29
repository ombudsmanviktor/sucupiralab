import { Fragment, useState, useEffect, useRef } from 'react'
import { Plus, Receipt, Pencil, Trash2, ChevronDown, ChevronUp, FileText, DollarSign, Paperclip, Download, Archive, Loader2, GripVertical, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd'
import { useAuth } from '@/contexts/AuthContext'
import { useDemoData } from '@/hooks/useDemoData'
import { useToast } from '@/hooks/useToast'
import { loadPrestacoes, savePrestacaoFile, deletePrestacaoFile, uploadAnexo, fetchAttachment } from '@/lib/githubStorage'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ToastContainer } from '@/components/ui/toast'
import type { Prestacao, Despesa, Anexo } from '@/types'

import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const RUBRICAS_SUGERIDAS = [
  'Material de Consumo',
  'Material Permanente',
  'Serviços de Terceiros - Pessoa Física',
  'Serviços de Terceiros - Pessoa Jurídica',
  'Diárias',
  'Passagens e Locomoção',
  'Bolsas',
  'Encargos Diversos',
  'Publicações',
  'Outros',
]

type DespesaSortField = 'descricao' | 'data' | 'prestador' | 'nf' | 'rubrica' | 'anexos' | 'valor'

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Returns a URL to open the file via the in-app FileViewer (authenticated). Falls back to blob URL for demo mode. */
function fileViewerUrl(anexo: Anexo): string {
  if (!anexo.path) return anexo.url
  const base = window.location.href.split('#')[0]
  return `${base}#/file/${anexo.path}`
}

/** Clickable table header that toggles ascending/descending sort for a despesa column. */
function SortHead({ field, label, align, className, sortField, sortDir, onSort }: {
  field: DespesaSortField
  label: string
  align?: 'right'
  className?: string
  sortField: DespesaSortField
  sortDir: 'asc' | 'desc'
  onSort: (field: DespesaSortField) => void
}) {
  const active = sortField === field
  return (
    <TableHead className={cn(align === 'right' ? 'text-right' : '', className)}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          'inline-flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200',
          align === 'right' && 'flex-row-reverse'
        )}
      >
        {label}
        {active ? (
          sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </button>
    </TableHead>
  )
}

function exportPDF(prestacoes: Prestacao[]) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('Prestações de Contas', 14, 22)
  doc.setFontSize(10)
  doc.text(`Exportado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 30)
  autoTable(doc, {
    startY: 36,
    head: [['Título', 'Agência', 'Vigência', 'Total Recursos']],
    body: prestacoes.map(p => [
      p.titulo,
      p.agencia_fomento ?? '—',
      p.vigencia_inicio ? `${formatDate(p.vigencia_inicio)} – ${formatDate(p.vigencia_fim ?? null)}` : '—',
      p.total_recursos != null ? formatCurrency(p.total_recursos) : '—',
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
  })
  doc.save('prestacoes.pdf')
}

function exportDespesasPDF(prestacao: Prestacao, myDespesas: Despesa[]) {
  const doc = new jsPDF()
  doc.setFontSize(14)
  doc.text(`Despesas — ${prestacao.titulo}`, 14, 22)
  doc.setFontSize(9)
  doc.text(`Exportado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 29)
  if (prestacao.agencia_fomento) doc.text(`Agência: ${prestacao.agencia_fomento}`, 14, 35)
  const total = myDespesas.reduce((s, d) => s + d.valor, 0)
  autoTable(doc, {
    startY: prestacao.agencia_fomento ? 40 : 34,
    head: [['Descrição', 'Data', 'Prestador', 'Nota Fiscal', 'Rubrica', 'Valor']],
    body: [
      ...myDespesas.map(d => [
        d.descricao,
        formatDate(d.data),
        d.prestador_servico ?? '—',
        d.numero_nota_fiscal ?? '—',
        d.rubrica ?? '—',
        formatCurrency(d.valor),
      ]),
      ['', '', '', '', 'Total', formatCurrency(total)],
    ],
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] },
    bodyStyles: { textColor: [40, 40, 40] },
    didParseCell: (data) => {
      if (data.row.index === myDespesas.length) {
        data.cell.styles.fontStyle = 'bold'
      }
    },
  })
  const slug = prestacao.titulo.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  doc.save(`despesas-${slug}.pdf`)
}

function exportDespesasExcel(prestacao: Prestacao, myDespesas: Despesa[]) {
  const rows = myDespesas.map(d => ({
    Descrição: d.descricao,
    Data: formatDate(d.data),
    'Prestador de Serviço': d.prestador_servico ?? '',
    'Nota Fiscal': d.numero_nota_fiscal ?? '',
    Rubrica: d.rubrica ?? '',
    'Valor (R$)': d.valor,
  }))
  const total = myDespesas.reduce((s, d) => s + d.valor, 0)
  rows.push({ Descrição: 'TOTAL', Data: '', 'Prestador de Serviço': '', 'Nota Fiscal': '', Rubrica: '', 'Valor (R$)': total })
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Despesas')
  const slug = prestacao.titulo.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  XLSX.writeFile(wb, `despesas-${slug}.xlsx`)
}

function exportExcel(prestacoes: Prestacao[]) {
  const ws = XLSX.utils.json_to_sheet(prestacoes.map(p => ({
    Título: p.titulo,
    'Nº Processo': p.numero_processo ?? '',
    Edital: p.nome_edital ?? '',
    Agência: p.agencia_fomento ?? '',
    'Vigência Início': p.vigencia_inicio ?? '',
    'Vigência Fim': p.vigencia_fim ?? '',
    'Total Recursos': p.total_recursos ?? '',
  })))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Prestações')
  XLSX.writeFile(wb, 'prestacoes.xlsx')
}

const emptyPrestacao: Omit<Prestacao, 'id' | 'user_id' | 'created_at' | 'updated_at'> = {
  titulo: '', numero_processo: '', numero_edital: '', nome_edital: '',
  agencia_fomento: '', vigencia_inicio: '', vigencia_fim: '', total_recursos: undefined,
  observacoes_rubricas: '',
}

const emptyDespesa: Omit<Despesa, 'id' | 'user_id' | 'prestacao_id' | 'created_at'> = {
  descricao: '', data: '', valor: 0, numero_nota_fiscal: '', prestador_servico: '', rubrica: '',
}

export function Prestacoes() {
  const { isDemoMode } = useAuth()
  const demo = useDemoData()
  const { toasts, toast, dismiss } = useToast()

  const [prestacoes, setPrestacoes] = useState<Prestacao[]>(isDemoMode ? demo.prestacoes : [])
  const [despesas, setDespesas] = useState<Despesa[]>(isDemoMode ? demo.despesas : [])
  const [loading, setLoading] = useState(!isDemoMode)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Prestação form
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Prestacao | null>(null)
  const [form, setForm] = useState(emptyPrestacao)

  // Despesa form
  const [showDespesaForm, setShowDespesaForm] = useState(false)
  const [despesaForm, setDespesaForm] = useState(emptyDespesa)
  const [currentPrestacaoId, setCurrentPrestacaoId] = useState<string | null>(null)
  const [editingDespesa, setEditingDespesa] = useState<Despesa | null>(null)

  // Attachment maps keyed by entity id
  const [prestacaoAnexos, setPrestacaoAnexos] = useState<Map<string, Anexo[]>>(new Map())
  const [despesaAnexos, setDespesaAnexos] = useState<Map<string, Anexo[]>>(new Map())

  // Pending attachments while forms are open
  // Existing files (from GitHub) have `path` set; newly picked files don't.
  // pendingPrestacaoFiles / pendingDespesaFiles hold only the *new* File objects,
  // parallel to the pending anexos that lack `path`.
  const [pendingPrestacaoAnexos, setPendingPrestacaoAnexos] = useState<Anexo[]>([])
  const [pendingPrestacaoFiles, setPendingPrestacaoFiles] = useState<File[]>([])
  const [pendingDespesaAnexos, setPendingDespesaAnexos] = useState<Anexo[]>([])
  const [pendingDespesaFiles, setPendingDespesaFiles] = useState<File[]>([])

  const [expandedDespesaFiles, setExpandedDespesaFiles] = useState<string | null>(null)
  const [zippingId, setZippingId] = useState<string | null>(null)

  // Despesa table sort (applies to whichever prestação is expanded)
  const [sortField, setSortField] = useState<DespesaSortField>('data')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const prestacaoFileRef = useRef<HTMLInputElement>(null)
  const despesaFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isDemoMode) return
    loadPrestacoes().then(({ prestacoes: p, despesas: d }) => {
      setPrestacoes(p)
      setDespesas(d)
      const pMap = new Map<string, Anexo[]>()
      p.forEach(pr => { if (pr.anexos?.length) pMap.set(pr.id, pr.anexos) })
      setPrestacaoAnexos(pMap)
      const dMap = new Map<string, Anexo[]>()
      d.forEach(de => { if (de.anexos?.length) dMap.set(de.id, de.anexos) })
      setDespesaAnexos(dMap)
      setLoading(false)
    }).catch(err => {
      toast({ title: 'Erro ao carregar', description: err.message, variant: 'destructive' })
      setLoading(false)
    })
  }, [isDemoMode])

  const totalRecursos = prestacoes.reduce((s, p) => s + (p.total_recursos ?? 0), 0)
  const totalDespesas = despesas.reduce((s, d) => s + d.valor, 0)

  // ── Helpers for removing pending files ──────────────────────────────────

  function removePrestacaoAnexo(index: number) {
    const a = pendingPrestacaoAnexos[index]
    if (!a.path) {
      const newFileIdx = pendingPrestacaoAnexos.slice(0, index).filter(x => !x.path).length
      setPendingPrestacaoFiles(prev => prev.filter((_, i) => i !== newFileIdx))
    }
    setPendingPrestacaoAnexos(prev => prev.filter((_, i) => i !== index))
  }

  function removeDespesaAnexo(index: number) {
    const a = pendingDespesaAnexos[index]
    if (!a.path) {
      const newFileIdx = pendingDespesaAnexos.slice(0, index).filter(x => !x.path).length
      setPendingDespesaFiles(prev => prev.filter((_, i) => i !== newFileIdx))
    }
    setPendingDespesaAnexos(prev => prev.filter((_, i) => i !== index))
  }

  // ── Prestação CRUD ───────────────────────────────────────────────────────

  function openNew() {
    setEditing(null)
    setForm(emptyPrestacao)
    setPendingPrestacaoAnexos([])
    setPendingPrestacaoFiles([])
    setShowForm(true)
  }

  function openEdit(p: Prestacao) {
    setEditing(p)
    setForm({
      titulo: p.titulo,
      numero_processo: p.numero_processo ?? '',
      numero_edital: p.numero_edital ?? '',
      nome_edital: p.nome_edital ?? '',
      agencia_fomento: p.agencia_fomento ?? '',
      vigencia_inicio: p.vigencia_inicio ?? '',
      vigencia_fim: p.vigencia_fim ?? '',
      total_recursos: p.total_recursos,
      observacoes_rubricas: p.observacoes_rubricas ?? '',
    })
    setPendingPrestacaoAnexos(prestacaoAnexos.get(p.id) ?? [])
    setPendingPrestacaoFiles([])
    setShowForm(true)
  }

  function handlePrestacaoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    const newAnexos: Anexo[] = files.map(file => ({
      id: crypto.randomUUID(), name: file.name, size: file.size,
      url: URL.createObjectURL(file), type: file.type,
    }))
    setPendingPrestacaoAnexos(prev => [...prev, ...newAnexos])
    setPendingPrestacaoFiles(prev => [...prev, ...files])
    e.target.value = ''
  }

  async function handleSave() {
    if (!form.titulo.trim()) { toast({ title: 'Título obrigatório', variant: 'destructive' }); return }

    if (isDemoMode) {
      let savedId: string
      if (editing) {
        setPrestacoes(prev => prev.map(p => p.id === editing.id ? { ...p, ...form, updated_at: new Date().toISOString() } : p))
        savedId = editing.id
      } else {
        const newP: Prestacao = { id: crypto.randomUUID(), user_id: 'demo-user-id', ...form, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
        setPrestacoes(prev => [newP, ...prev])
        savedId = newP.id
      }
      if (pendingPrestacaoAnexos.length > 0) {
        setPrestacaoAnexos(prev => { const next = new Map(prev); next.set(savedId, pendingPrestacaoAnexos); return next })
      }
    } else {
      const now = new Date().toISOString()
      const id = editing ? editing.id : crypto.randomUUID()
      const existingAnexos = pendingPrestacaoAnexos.filter(a => a.path)
      let newUploaded: Anexo[] = []
      if (pendingPrestacaoFiles.length > 0) {
        try {
          for (const f of pendingPrestacaoFiles) {
            newUploaded.push(await uploadAnexo('prestacoes', id, f))
          }
        } catch (err: any) {
          toast({ title: 'Erro ao fazer upload', description: err.message, variant: 'destructive' }); return
        }
      }
      const allAnexos = [...existingAnexos, ...newUploaded]
      const prestacao: Prestacao = {
        id, user_id: 'github-user', ...form,
        total_recursos: form.total_recursos ? Number(form.total_recursos) : undefined,
        anexos: allAnexos,
        created_at: editing?.created_at ?? now,
        updated_at: now,
      }
      try {
        await savePrestacaoFile(prestacao, despesas)
      } catch (err: any) {
        toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' }); return
      }
      setPrestacoes(prev => editing ? prev.map(p => p.id === id ? prestacao : p) : [prestacao, ...prev])
      setPrestacaoAnexos(prev => { const next = new Map(prev); next.set(id, allAnexos); return next })
    }

    toast({ title: editing ? 'Prestação atualizada' : 'Prestação criada' })
    setShowForm(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Remover esta prestação?')) return
    if (isDemoMode) {
      setPrestacoes(prev => prev.filter(p => p.id !== id))
      setDespesas(prev => prev.filter(d => d.prestacao_id !== id))
      toast({ title: 'Prestação removida' })
      return
    }
    try {
      await deletePrestacaoFile(id)
    } catch (err: any) {
      toast({ title: 'Erro ao remover', variant: 'destructive' }); return
    }
    setPrestacoes(prev => prev.filter(p => p.id !== id))
    setDespesas(prev => prev.filter(d => d.prestacao_id !== id))
    toast({ title: 'Prestação removida' })
  }

  // ── Despesa CRUD ─────────────────────────────────────────────────────────

  function handleDespesaFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    const newAnexos: Anexo[] = files.map(file => ({
      id: crypto.randomUUID(), name: file.name, size: file.size,
      url: URL.createObjectURL(file), type: file.type,
    }))
    setPendingDespesaAnexos(prev => [...prev, ...newAnexos])
    setPendingDespesaFiles(prev => [...prev, ...files])
    e.target.value = ''
  }

  function openNewDespesa(prestacaoId: string) {
    setEditingDespesa(null)
    setCurrentPrestacaoId(prestacaoId)
    setDespesaForm(emptyDespesa)
    setPendingDespesaAnexos([])
    setPendingDespesaFiles([])
    setShowDespesaForm(true)
  }

  function openEditDespesa(d: Despesa) {
    setEditingDespesa(d)
    setCurrentPrestacaoId(d.prestacao_id)
    setDespesaForm({
      descricao: d.descricao, data: d.data, valor: d.valor,
      numero_nota_fiscal: d.numero_nota_fiscal ?? '',
      prestador_servico: d.prestador_servico ?? '',
      rubrica: d.rubrica ?? '',
    })
    setPendingDespesaAnexos(despesaAnexos.get(d.id) ?? [])
    setPendingDespesaFiles([])
    setShowDespesaForm(true)
  }

  async function handleSaveDespesa() {
    if (!despesaForm.descricao.trim()) { toast({ title: 'Descrição obrigatória', variant: 'destructive' }); return }

    if (isDemoMode) {
      if (editingDespesa) {
        const updated: Despesa = { ...editingDespesa, ...despesaForm, valor: Number(despesaForm.valor) }
        setDespesas(prev => prev.map(d => d.id === editingDespesa.id ? updated : d))
        setDespesaAnexos(prev => { const next = new Map(prev); next.set(editingDespesa.id, pendingDespesaAnexos); return next })
      } else {
        const nd: Despesa = { id: crypto.randomUUID(), user_id: 'demo-user-id', prestacao_id: currentPrestacaoId!, ...despesaForm, valor: Number(despesaForm.valor), created_at: new Date().toISOString() }
        setDespesas(prev => [...prev, nd])
        if (pendingDespesaAnexos.length > 0) {
          setDespesaAnexos(prev => { const next = new Map(prev); next.set(nd.id, pendingDespesaAnexos); return next })
        }
      }
    } else {
      const id = editingDespesa ? editingDespesa.id : crypto.randomUUID()
      const now = new Date().toISOString()
      const existingAnexos = pendingDespesaAnexos.filter(a => a.path)
      let newUploaded: Anexo[] = []
      if (pendingDespesaFiles.length > 0) {
        try {
          for (const f of pendingDespesaFiles) {
            newUploaded.push(await uploadAnexo('despesas', id, f))
          }
        } catch (err: any) {
          toast({ title: 'Erro ao fazer upload', description: err.message, variant: 'destructive' }); return
        }
      }
      const allAnexos = [...existingAnexos, ...newUploaded]
      const nd: Despesa = {
        id, user_id: 'github-user', prestacao_id: currentPrestacaoId!,
        ...despesaForm, valor: Number(despesaForm.valor),
        anexos: allAnexos,
        created_at: editingDespesa?.created_at ?? now,
      }
      const updatedDespesas = editingDespesa
        ? despesas.map(d => d.id === id ? nd : d)
        : [...despesas, nd]
      const parentPrestacao = prestacoes.find(p => p.id === currentPrestacaoId!)!
      try {
        await savePrestacaoFile(parentPrestacao, updatedDespesas)
      } catch (err: any) {
        toast({ title: 'Erro ao salvar despesa', description: err.message, variant: 'destructive' }); return
      }
      setDespesas(updatedDespesas)
      setDespesaAnexos(prev => { const next = new Map(prev); next.set(id, allAnexos); return next })
    }

    toast({ title: editingDespesa ? 'Despesa atualizada' : 'Despesa adicionada' })
    setShowDespesaForm(false)
    setDespesaForm(emptyDespesa)
    setPendingDespesaAnexos([])
    setPendingDespesaFiles([])
    setEditingDespesa(null)
  }

  async function handleDeleteDespesa(despesaId: string, prestacaoId: string) {
    if (!confirm('Remover esta despesa?')) return
    const updatedDespesas = despesas.filter(d => d.id !== despesaId)
    if (!isDemoMode) {
      const parentPrestacao = prestacoes.find(p => p.id === prestacaoId)!
      try {
        await savePrestacaoFile(parentPrestacao, updatedDespesas)
      } catch (err: any) {
        toast({ title: 'Erro ao remover despesa', description: err.message, variant: 'destructive' }); return
      }
    }
    setDespesas(updatedDespesas)
    toast({ title: 'Despesa removida' })
  }

  // ── Sorting ──────────────────────────────────────────────────────────────

  function toggleSort(field: DespesaSortField) {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function sortDespesas(list: Despesa[]): Despesa[] {
    const dir = sortDir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      switch (sortField) {
        case 'descricao': return a.descricao.localeCompare(b.descricao) * dir
        case 'data': return (a.data ?? '').localeCompare(b.data ?? '') * dir
        case 'prestador': return (a.prestador_servico ?? '').localeCompare(b.prestador_servico ?? '') * dir
        case 'nf': return (a.numero_nota_fiscal ?? '').localeCompare(b.numero_nota_fiscal ?? '') * dir
        case 'rubrica': return (a.rubrica ?? '').localeCompare(b.rubrica ?? '') * dir
        case 'anexos': return ((despesaAnexos.get(a.id)?.length ?? 0) - (despesaAnexos.get(b.id)?.length ?? 0)) * dir
        case 'valor': return (a.valor - b.valor) * dir
        default: return 0
      }
    })
  }

  // ── Drag and drop: move despesa between prestações ──────────────────────

  async function moveDespesa(despesa: Despesa, destPrestacaoId: string) {
    const destPrestacao = prestacoes.find(p => p.id === destPrestacaoId)
    if (!destPrestacao) return
    const updatedDespesas = despesas.map(d => d.id === despesa.id ? { ...d, prestacao_id: destPrestacaoId } : d)

    if (isDemoMode) {
      setDespesas(updatedDespesas)
      toast({ title: 'Despesa movida', description: `Movida para "${destPrestacao.titulo}"` })
      return
    }

    const sourcePrestacao = prestacoes.find(p => p.id === despesa.prestacao_id)
    try {
      if (sourcePrestacao) await savePrestacaoFile(sourcePrestacao, updatedDespesas)
      await savePrestacaoFile(destPrestacao, updatedDespesas)
    } catch (err: any) {
      toast({ title: 'Erro ao mover despesa', description: err.message, variant: 'destructive' }); return
    }
    setDespesas(updatedDespesas)
    toast({ title: 'Despesa movida', description: `Movida para "${destPrestacao.titulo}"` })
  }

  function handleDragEnd(result: DropResult) {
    const { destination, draggableId } = result
    if (!destination || !destination.droppableId.startsWith('prestacao-')) return
    const destPrestacaoId = destination.droppableId.slice('prestacao-'.length)
    const despesa = despesas.find(d => d.id === draggableId)
    if (!despesa || despesa.prestacao_id === destPrestacaoId) return
    moveDespesa(despesa, destPrestacaoId)
  }

  // ── ZIP export ───────────────────────────────────────────────────────────

  async function exportDespesasZip(prestacao: Prestacao, myDespesas: Despesa[]) {
    if (zippingId) return
    setZippingId(prestacao.id)
    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      const slug = prestacao.titulo.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

      // Excel de despesas
      const rows = myDespesas.map(d => ({
        Descrição: d.descricao,
        Data: formatDate(d.data),
        'Prestador de Serviço': d.prestador_servico ?? '',
        'Nota Fiscal': d.numero_nota_fiscal ?? '',
        Rubrica: d.rubrica ?? '',
        'Valor (R$)': d.valor,
      }))
      const total = myDespesas.reduce((s, d) => s + d.valor, 0)
      rows.push({ Descrição: 'TOTAL', Data: '', 'Prestador de Serviço': '', 'Nota Fiscal': '', Rubrica: '', 'Valor (R$)': total })
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Despesas')
      zip.file(`despesas-${slug}.xlsx`, XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))

      // Documentos da prestação (editais etc.)
      const pAnexos = prestacaoAnexos.get(prestacao.id) ?? []
      for (const a of pAnexos) {
        const buf = await fetchBuf(a)
        zip.file(`documentos/${a.name}`, buf)
      }

      // Anexos por despesa
      for (const d of myDespesas) {
        const dAnexos = despesaAnexos.get(d.id) ?? []
        for (const a of dAnexos) {
          const buf = await fetchBuf(a)
          const folder = `despesas/${d.data ?? 'sem-data'} ${d.descricao.slice(0, 30).replace(/[/\\?%*:|"<>]/g, '_')}`
          zip.file(`${folder}/${a.name}`, buf)
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `prestacao-${slug}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
      toast({ title: 'ZIP gerado com sucesso' })
    } catch (err: any) {
      toast({ title: 'Erro ao gerar ZIP', description: err.message, variant: 'destructive' })
    } finally {
      setZippingId(null)
    }
  }

  async function fetchBuf(a: Anexo): Promise<ArrayBuffer> {
    if (!isDemoMode && a.path) {
      const { blob } = await fetchAttachment(a.path)
      return blob.arrayBuffer()
    }
    return fetch(a.url).then(r => r.arrayBuffer())
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="animate-fade-in space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Hidden file inputs */}
      <input ref={prestacaoFileRef} type="file" className="hidden"
        accept="application/pdf,image/*,.doc,.docx" multiple onChange={handlePrestacaoFileChange} />
      <input ref={despesaFileRef} type="file" className="hidden"
        accept="application/pdf,image/*,.doc,.docx" multiple onChange={handleDespesaFileChange} />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Prestações de Contas</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Gerenciamento de projetos financiados</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => exportExcel(prestacoes)}>
            <FileText className="w-4 h-4" /> Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF(prestacoes)}>
            <FileText className="w-4 h-4" /> PDF
          </Button>
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4" /> Nova Prestação
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Prestações</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{prestacoes.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Recursos</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalRecursos)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total Despesas</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalDespesas)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Prestações Cadastradas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-gray-200 dark:border-gray-700 border-t-blue-500 rounded-full animate-spin" />
            </div>
          ) : prestacoes.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-gray-400 dark:text-gray-500">
              <Receipt className="w-10 h-10 mb-2" />
              <p className="text-sm">Nenhuma prestação cadastrada</p>
              <Button variant="ghost" size="sm" className="mt-3" onClick={openNew}>Adicionar primeira prestação</Button>
            </div>
          ) : (
            <DragDropContext onDragEnd={handleDragEnd}>
            <div>
              {prestacoes.map(p => {
                const isOpen = expanded === p.id
                const myDespesas = sortDespesas(despesas.filter(d => d.prestacao_id === p.id))
                const myAnexos = prestacaoAnexos.get(p.id) ?? []
                const myTotalGasto = myDespesas.reduce((s, d) => s + d.valor, 0)
                const mySaldo = p.total_recursos != null ? p.total_recursos - myTotalGasto : null
                return (
                  <div key={p.id} className="border-b border-gray-100 dark:border-gray-700 last:border-0">
                    <Droppable droppableId={`prestacao-${p.id}`} type="DESPESA">
                      {(dropProvided, dropSnapshot) => (
                        <div
                          ref={dropProvided.innerRef}
                          {...dropProvided.droppableProps}
                          className={cn(
                            'flex items-center gap-3 px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors',
                            dropSnapshot.isDraggingOver && 'bg-blue-50 dark:bg-blue-950 ring-2 ring-inset ring-blue-400'
                          )}
                          onClick={() => setExpanded(isOpen ? null : p.id)}
                        >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 dark:text-white truncate">{p.titulo}</span>
                          {p.agencia_fomento && <Badge variant="secondary">{p.agencia_fomento}</Badge>}
                          {myAnexos.length === 1 && (
                            <a href={fileViewerUrl(myAnexos[0])} target="_blank" rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                              title={myAnexos[0].name}>
                              <Paperclip className="w-3 h-3" />
                              <span className="truncate max-w-[120px]">{myAnexos[0].name}</span>
                            </a>
                          )}
                          {myAnexos.length > 1 && (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                              <Paperclip className="w-3 h-3" />
                              <Badge variant="secondary">{myAnexos.length} docs</Badge>
                            </span>
                          )}
                          {dropSnapshot.isDraggingOver && (
                            <span className="text-xs font-medium text-blue-600 dark:text-blue-300">Soltar aqui para mover a despesa</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                          {p.numero_processo && <span>Proc.: {p.numero_processo}</span>}
                          {p.vigencia_inicio && <span>{formatDate(p.vigencia_inicio)} – {formatDate(p.vigencia_fim ?? null)}</span>}
                          {p.total_recursos != null && <span className="font-medium text-green-700">Financiado: {formatCurrency(p.total_recursos)}</span>}
                          <span className="font-medium text-orange-600 dark:text-orange-400">Gasto: {formatCurrency(myTotalGasto)}</span>
                          {mySaldo != null && (
                            <span className={cn('font-medium', mySaldo >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400')}>
                              Saldo: {formatCurrency(mySaldo)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Badge variant="outline">{myDespesas.length} despesa{myDespesas.length !== 1 ? 's' : ''}</Badge>
                        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); openEdit(p) }} title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); handleDelete(p.id) }} title="Excluir">
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                        {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400 dark:text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
                      </div>
                          {dropProvided.placeholder}
                        </div>
                      )}
                    </Droppable>

                    {isOpen && (
                      <div className="px-6 pb-4 bg-gray-50 dark:bg-gray-900">
                        {/* Prestação documents (shown when multiple) */}
                        {myAnexos.length > 1 && (
                          <div className="mb-4">
                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Documentos</h3>
                            <div className="flex flex-wrap gap-2">
                              {myAnexos.map(a => (
                                <a key={a.id} href={fileViewerUrl(a)} target="_blank" rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                  <Paperclip className="w-3 h-3" />
                                  <span>{a.name}</span>
                                  <span className="text-gray-400">({formatFileSize(a.size)})</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Despesas</h3>
                          <div className="flex gap-1.5">
                            {myDespesas.length > 0 && (
                              <>
                                <Button variant="outline" size="sm" onClick={() => exportDespesasExcel(p, myDespesas)} title="Exportar despesas para Excel">
                                  <FileText className="w-3.5 h-3.5" /> Excel
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => exportDespesasPDF(p, myDespesas)} title="Exportar despesas para PDF">
                                  <FileText className="w-3.5 h-3.5" /> PDF
                                </Button>
                                <Button variant="outline" size="sm" onClick={() => exportDespesasZip(p, myDespesas)} disabled={zippingId === p.id} title="Baixar planilha + anexos em ZIP">
                                  {zippingId === p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                                  {zippingId === p.id ? 'Gerando…' : 'ZIP'}
                                </Button>
                              </>
                            )}
                            <Button variant="outline" size="sm" onClick={() => openNewDespesa(p.id)}>
                              <Plus className="w-3.5 h-3.5" /> Nova Despesa
                            </Button>
                          </div>
                        </div>
                        {myDespesas.length === 0 ? (
                          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">Nenhuma despesa registrada</p>
                        ) : (
                          <Table className="table-fixed w-full">
                            <TableHeader>
                              <TableRow>
                                <TableHead className="w-8"></TableHead>
                                <SortHead field="descricao" label="Descrição" className="w-[26%]" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                                <SortHead field="data" label="Data" className="w-[82px] whitespace-nowrap" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                                <SortHead field="prestador" label="Prestador" className="w-[14%]" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                                <SortHead field="nf" label="NF" className="w-[12%]" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                                <SortHead field="rubrica" label="Rubrica" className="w-[14%]" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                                <SortHead field="anexos" label="Anexos" className="w-[58px]" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                                <SortHead field="valor" label="Valor" align="right" className="w-[100px]" sortField={sortField} sortDir={sortDir} onSort={toggleSort} />
                                <TableHead className="w-[68px]"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <Droppable droppableId={`despesas-${p.id}`} type="DESPESA" isDropDisabled>
                              {(bodyProvided) => (
                                <TableBody ref={bodyProvided.innerRef} {...bodyProvided.droppableProps}>
                                  {myDespesas.map((d, idx) => {
                                    const dAnexos = despesaAnexos.get(d.id) ?? []
                                    const isFilesOpen = expandedDespesaFiles === d.id
                                    return (
                                      <Fragment key={d.id}>
                                        <Draggable draggableId={d.id} index={idx}>
                                          {(dragProvided, dragSnapshot) => (
                                            <TableRow
                                              ref={dragProvided.innerRef}
                                              {...dragProvided.draggableProps}
                                              className={cn(dragSnapshot.isDragging && 'bg-blue-50 dark:bg-blue-950 shadow-lg')}
                                            >
                                              <TableCell className="w-8 px-2">
                                                <span
                                                  {...dragProvided.dragHandleProps}
                                                  className="inline-flex cursor-grab text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 active:cursor-grabbing"
                                                  title="Arrastar para mover para outra prestação"
                                                >
                                                  <GripVertical className="w-4 h-4" />
                                                </span>
                                              </TableCell>
                                              <TableCell className="max-w-0">
                                                <span className="block truncate font-medium" title={d.descricao}>{d.descricao}</span>
                                              </TableCell>
                                              <TableCell className="whitespace-nowrap">{formatDate(d.data)}</TableCell>
                                              <TableCell className="max-w-0">
                                                <span className="block truncate" title={d.prestador_servico ?? ''}>{d.prestador_servico ?? '—'}</span>
                                              </TableCell>
                                              <TableCell className="max-w-0">
                                                <span className="block truncate font-mono text-xs" title={d.numero_nota_fiscal ?? ''}>{d.numero_nota_fiscal ?? '—'}</span>
                                              </TableCell>
                                              <TableCell className="max-w-0">
                                                <span className="block truncate" title={d.rubrica ?? ''}>{d.rubrica ?? '—'}</span>
                                              </TableCell>
                                              <TableCell>
                                                {dAnexos.length > 0 ? (
                                                  <button
                                                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                                                    onClick={() => setExpandedDespesaFiles(isFilesOpen ? null : d.id)}
                                                  >
                                                    <Paperclip className="w-3 h-3" />
                                                    <Badge variant="secondary" className="text-xs px-1.5 py-0">{dAnexos.length}</Badge>
                                                  </button>
                                                ) : (
                                                  <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="text-right font-medium text-green-700">{formatCurrency(d.valor)}</TableCell>
                                              <TableCell>
                                                <div className="flex items-center gap-0.5 justify-end">
                                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditDespesa(d)} title="Editar">
                                                    <Pencil className="w-3 h-3" />
                                                  </Button>
                                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteDespesa(d.id, d.prestacao_id)} title="Remover">
                                                    <Trash2 className="w-3 h-3 text-red-500" />
                                                  </Button>
                                                </div>
                                              </TableCell>
                                            </TableRow>
                                          )}
                                        </Draggable>
                                        {isFilesOpen && dAnexos.length > 0 && (
                                          <TableRow key={`${d.id}-files`}>
                                            <TableCell colSpan={9} className="bg-blue-50 dark:bg-blue-950 py-2 px-4">
                                              <div className="flex flex-col gap-1">
                                                {dAnexos.map(a => (
                                                  <a key={a.id} href={fileViewerUrl(a)} target="_blank" rel="noreferrer"
                                                    className="inline-flex items-center gap-2 text-xs text-blue-700 hover:underline">
                                                    <Download className="w-3 h-3 flex-shrink-0" />
                                                    <span>{a.name}</span>
                                                    <span className="text-gray-400">({formatFileSize(a.size)})</span>
                                                  </a>
                                                ))}
                                              </div>
                                            </TableCell>
                                          </TableRow>
                                        )}
                                      </Fragment>
                                    )
                                  })}
                                  <TableRow>
                                    <TableCell colSpan={7} className="font-semibold text-right text-gray-700 dark:text-gray-200">Total:</TableCell>
                                    <TableCell className="text-right font-bold text-green-700">{formatCurrency(myDespesas.reduce((s, d) => s + d.valor, 0))}</TableCell>
                                    <TableCell />
                                  </TableRow>
                                </TableBody>
                              )}
                            </Droppable>
                          </Table>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            </DragDropContext>
          )}
        </CardContent>
      </Card>

      {/* ── Prestação form dialog ─────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={open => {
        setShowForm(open)
        if (!open) { setPendingPrestacaoAnexos([]); setPendingPrestacaoFiles([]) }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto dark:bg-gray-900 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Prestação' : 'Nova Prestação de Contas'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Título *</Label>
              <Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Título da prestação" />
            </div>
            <div className="space-y-1.5">
              <Label>Nº do Processo</Label>
              <Input value={form.numero_processo} onChange={e => setForm(f => ({ ...f, numero_processo: e.target.value }))} placeholder="Ex: 403212/2023-1" />
            </div>
            <div className="space-y-1.5">
              <Label>Agência de Fomento</Label>
              <Input value={form.agencia_fomento} onChange={e => setForm(f => ({ ...f, agencia_fomento: e.target.value }))} placeholder="Ex: CNPq, FAPERJ, CAPES" />
            </div>
            <div className="space-y-1.5">
              <Label>Nº do Edital</Label>
              <Input value={form.numero_edital} onChange={e => setForm(f => ({ ...f, numero_edital: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Nome do Edital</Label>
              <Input value={form.nome_edital} onChange={e => setForm(f => ({ ...f, nome_edital: e.target.value }))} placeholder="Ex: Edital Universal" />
            </div>
            <div className="space-y-1.5">
              <Label>Vigência Início</Label>
              <Input type="date" value={form.vigencia_inicio} onChange={e => setForm(f => ({ ...f, vigencia_inicio: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Vigência Fim</Label>
              <Input type="date" value={form.vigencia_fim} onChange={e => setForm(f => ({ ...f, vigencia_fim: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Total de Recursos (R$)</Label>
              <Input type="number" value={form.total_recursos ?? ''} onChange={e => setForm(f => ({ ...f, total_recursos: e.target.value ? Number(e.target.value) : undefined }))} placeholder="0,00" />
            </div>

            <div className="sm:col-span-2 space-y-1.5">
              <Label>Observações sobre Rubricas</Label>
              <Textarea
                value={form.observacoes_rubricas ?? ''}
                onChange={e => setForm(f => ({ ...f, observacoes_rubricas: e.target.value }))}
                placeholder="Descreva as rubricas, restrições ou orientações específicas sobre o uso dos recursos…"
                rows={4}
              />
            </div>

            {/* Edital attachments — multiple */}
            <div className="sm:col-span-2 space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              <Label>Documentos do Edital</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" type="button" onClick={() => prestacaoFileRef.current?.click()}>
                  <Paperclip className="w-4 h-4" /> Adicionar Arquivos
                </Button>
                <span className="text-xs text-gray-400 dark:text-gray-500">PDF, imagem, DOC (múltiplos)</span>
              </div>
              {pendingPrestacaoAnexos.length > 0 && (
                <div className="space-y-1.5 mt-1">
                  {pendingPrestacaoAnexos.map((a, i) => (
                    <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 border border-blue-100 dark:bg-blue-950 dark:border-blue-900">
                      <Paperclip className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-blue-800 dark:text-blue-300 truncate">{a.name}</p>
                        <p className="text-xs text-blue-400">{formatFileSize(a.size)}</p>
                      </div>
                      <div className="flex gap-1 items-center">
                        {a.url && (
                          <a href={fileViewerUrl(a)} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800">
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button className="text-red-400 hover:text-red-600 ml-1" onClick={() => removePrestacaoAnexo(i)} title="Remover">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
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

      {/* ── Despesa form dialog ───────────────────────────────────────────── */}
      <Dialog open={showDespesaForm} onOpenChange={open => {
        setShowDespesaForm(open)
        if (!open) { setPendingDespesaAnexos([]); setPendingDespesaFiles([]); setEditingDespesa(null) }
      }}>
        <DialogContent className="dark:bg-gray-900 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle>{editingDespesa ? 'Editar Despesa' : 'Nova Despesa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Input value={despesaForm.descricao} onChange={e => setDespesaForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descrição da despesa" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Data</Label>
                <Input type="date" value={despesaForm.data} onChange={e => setDespesaForm(f => ({ ...f, data: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor (R$)</Label>
                <Input type="number" value={despesaForm.valor || ''} onChange={e => setDespesaForm(f => ({ ...f, valor: Number(e.target.value) }))} placeholder="0,00" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Prestador de Serviço</Label>
              <Input value={despesaForm.prestador_servico} onChange={e => setDespesaForm(f => ({ ...f, prestador_servico: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Nº da Nota Fiscal</Label>
              <Input value={despesaForm.numero_nota_fiscal} onChange={e => setDespesaForm(f => ({ ...f, numero_nota_fiscal: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Rubrica</Label>
              <Input
                list="rubricas-sugeridas"
                value={despesaForm.rubrica}
                onChange={e => setDespesaForm(f => ({ ...f, rubrica: e.target.value }))}
                placeholder="Ex: Material de Consumo"
              />
              <datalist id="rubricas-sugeridas">
                {RUBRICAS_SUGERIDAS.map(r => <option key={r} value={r} />)}
              </datalist>
            </div>

            {/* Despesa attachments */}
            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              <Label>Anexar Documentos</Label>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" type="button" onClick={() => despesaFileRef.current?.click()}>
                  <Paperclip className="w-4 h-4" /> Adicionar Arquivos
                </Button>
                <span className="text-xs text-gray-400 dark:text-gray-500">PDF, imagem, DOC (múltiplos)</span>
              </div>
              {pendingDespesaAnexos.length > 0 && (
                <div className="space-y-1.5 mt-1">
                  {pendingDespesaAnexos.map((a, i) => (
                    <div key={a.id} className="flex items-center gap-2 p-2 rounded-lg bg-blue-50 border border-blue-100 dark:bg-blue-950 dark:border-blue-900">
                      <Paperclip className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-blue-800 dark:text-blue-300 truncate">{a.name}</p>
                        <p className="text-xs text-blue-400">{formatFileSize(a.size)}</p>
                      </div>
                      <div className="flex gap-1 items-center">
                        {a.url && (
                          <a href={fileViewerUrl(a)} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-800">
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button className="text-red-400 hover:text-red-600 ml-1" onClick={() => removeDespesaAnexo(i)} title="Remover">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDespesaForm(false)}>Cancelar</Button>
            <Button onClick={handleSaveDespesa}>{editingDespesa ? 'Salvar' : 'Adicionar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
