import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type {
  ContentPreset,
  EditTargetsResponse,
  GlobalRevisionKind,
  PostRevisionResponse,
  RevisionRequest,
} from '../api/types'
import { notifyError, notifySuccess } from '../stores/toastStore'
import { DocumentReviewLayout } from '../components/edit/DocumentReviewLayout'
import { buildGlobalRevisionPayload } from '../components/edit/GlobalEditPanel'
import { EditSubmitFooter } from '../components/edit/EditSubmitFooter'
import { collectRevisionItems, type PageAnnotation } from '../lib/pageAnnotations'

export function EditJobPage() {
  const { id: jobId } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [currentIndex, setCurrentIndex] = useState(0)
  const [annotations, setAnnotations] = useState<PageAnnotation[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [globalKind, setGlobalKind] = useState<GlobalRevisionKind>('content')
  const [contentPreset, setContentPreset] = useState<ContentPreset | null>(null)
  const [contentComment, setContentComment] = useState('')
  const [customComment, setCustomComment] = useState('')

  const targetsQ = useQuery({
    queryKey: ['job', jobId, 'edit-targets'],
    queryFn: () =>
      api<EditTargetsResponse>('GET', `/api/jobs/${jobId}/edit-targets`),
    enabled: !!jobId,
  })

  const slides = targetsQ.data?.slides ?? []
  const isEditable = targetsQ.data?.editable ?? false
  const reason = targetsQ.data?.reason ?? null
  const documentHtmlUrl = targetsQ.data?.has_document_html
    ? targetsQ.data.document_html_url
    : null
  const documentOutline = targetsQ.data?.document_outline ?? []

  const annotationCount = useMemo(
    () => annotations.filter((a) => a.text.trim()).length,
    [annotations],
  )

  const filledPerPage = useMemo(
    () => collectRevisionItems(annotations),
    [annotations],
  )

  const globalPayload = useMemo(
    () =>
      buildGlobalRevisionPayload(globalKind, {
        colorDraft: {},
        fontFamily: '',
        visualStyle: '',
        contentPreset,
        contentComment,
        customComment,
      }),
    [globalKind, contentPreset, contentComment, customComment],
  )

  const hasGlobalRevision = globalPayload !== null
  const hasRevisionContent = filledPerPage.length > 0 || hasGlobalRevision

  const canSubmit = isEditable && confirmed && !submitting && hasRevisionContent

  useEffect(() => {
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = prev
    }
  }, [])

  const handleSubmit = async () => {
    if (!jobId) return
    if (!confirmed) {
      notifyError('请勾选确认后再提交')
      return
    }
    if (!hasRevisionContent) {
      notifyError('请至少添加一条批注或一项全局修改')
      return
    }

    const body: RevisionRequest = {
      mode: hasGlobalRevision && filledPerPage.length === 0 ? 'global' : 'per_page',
      items: filledPerPage.length > 0 ? filledPerPage : null,
      global_revision: globalPayload,
    }

    setSubmitting(true)
    try {
      const res = await api<PostRevisionResponse>(
        'POST',
        `/api/jobs/${jobId}/revisions`,
        body as unknown as Record<string, unknown>,
      )
      notifySuccess('修改任务已创建，正在排队…')
      navigate(`/jobs/${res.revision_job_id}`)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : '提交失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-0 flex flex-col overflow-hidden bg-office-bg dark:bg-[#1b1a19]"
      style={{ top: 'var(--app-header-height)' }}
    >
      {targetsQ.isLoading ? (
        <div className="flex flex-1 items-center justify-center text-slate-500">
          加载中…
        </div>
      ) : targetsQ.error ? (
        <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-6 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-300">
          无法加载文档：{String(targetsQ.error)}
        </div>
      ) : !isEditable ? (
        <div className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <h2 className="text-base font-medium">该任务暂不可编辑</h2>
          <p className="mt-1 text-sm">{reason ?? '请确认任务状态为已完成'}</p>
        </div>
      ) : (
        <>
          {reason && (
            <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              {reason}
            </div>
          )}

          <DocumentReviewLayout
            slides={slides}
            currentIndex={currentIndex}
            onCurrentIndexChange={setCurrentIndex}
            documentHtmlUrl={documentHtmlUrl}
            documentOutline={documentOutline}
            annotations={annotations}
            onAnnotationsChange={setAnnotations}
            globalKind={globalKind}
            onGlobalKindChange={setGlobalKind}
            contentPreset={contentPreset}
            onContentPresetChange={setContentPreset}
            contentComment={contentComment}
            onContentCommentChange={setContentComment}
            customComment={customComment}
            onCustomCommentChange={setCustomComment}
          />

          <EditSubmitFooter
            annotationCount={annotationCount}
            hasGlobalRevision={hasGlobalRevision}
            confirmed={confirmed}
            onConfirmedChange={setConfirmed}
            canSubmit={canSubmit}
            submitting={submitting}
            onSubmit={handleSubmit}
          />
        </>
      )}
    </div>
  )
}
