'use client';

import { useRef, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import {
  apiPatch,
  apiPost,
  extractErrorMessage,
} from '../../../shared/lib/apiClient';
import {
  AdminCollection,
  AdminDialog,
  AdminFeedback,
  RecordStatus,
  localDateTime,
  useAdminResource,
} from './AdminUi';

type Chunk = {
  id: string;
  title: string;
  docType: string;
  chunkIndex: number;
  content: string;
  sourceUrl: string | null;
  isActive: boolean;
  hasEmbedding: boolean;
  updatedAt: string;
};

type KnowledgeStats = {
  totalChunks: number;
  embeddedChunks: number;
  pendingChunks: number;
  embeddingConfigured: boolean;
};

export function KnowledgeView() {
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<Chunk | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const locked = useRef(false);
  const stats = useAdminResource<KnowledgeStats>(
    '/admin/ai/knowledge/stats',
    version,
  );
  const counts = stats.data;

  async function execute(work: () => Promise<string>, close = false) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setNotice('');
    setError('');
    try {
      setNotice(await work());
      if (close) setSelected(null);
      setVersion((value) => value + 1);
    } catch (failure: unknown) {
      setError(
        extractErrorMessage(
          failure,
          'Không lưu được thay đổi của kho tri thức.',
        ),
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  function open(chunk: Chunk | 'new') {
    setError('');
    setSelected(chunk);
  }

  function close() {
    if (!locked.current) {
      setError('');
      setSelected(null);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = (name: string) => String(form.get(name) ?? '').trim();
    const sourceUrl = field('sourceUrl');
    void execute(async () => {
      const result = await apiPost<{
        chunksCreated: number;
        chunksUpdated: number;
        chunksUnchanged: number;
      }>('/admin/ai/knowledge', {
        title: field('title'),
        docType: field('docType'),
        content: field('content'),
        ...(sourceUrl ? { sourceUrl } : {}),
      });
      return `Đã lưu tài liệu · ${result.chunksCreated} đoạn mới, ${result.chunksUpdated} cập nhật, ${result.chunksUnchanged} giữ nguyên.`;
    }, true);
  }

  return (
    <>
      <AdminCollection<Chunk>
        title="Kho tri thức RAG"
        description="Nhập chính sách và hướng dẫn dùng cho Chatbot, theo dõi trạng thái vector của từng đoạn."
        endpoint="/admin/ai/knowledge"
        searchLabel="Tiêu đề hoặc loại tài liệu"
        filters={[
          {
            key: 'status',
            label: 'Sử dụng',
            options: { ACTIVE: 'Đang sử dụng', HIDDEN: 'Đã ẩn' },
          },
        ]}
        version={version}
        onRefresh={stats.refresh}
        empty="Không có đoạn tri thức phù hợp."
        actions={
          <button
            type="button"
            className="btn btn-gradient-purple btn-sm admin-workspace-button"
            disabled={busy}
            onClick={() => open('new')}
          >
            <Plus size={16} aria-hidden="true" /> Nhập tài liệu
          </button>
        }
        beforeTable={(listError) => (
          <>
            {notice && (
              <div className="alert alert-success mb-0" role="status">
                {notice}
              </div>
            )}
            {error && !selected && <AdminFeedback error={error} />}
            {counts ? (
              <section
                className="admin-workspace-panel admin-knowledge-overview"
                aria-label="Trạng thái kho tri thức"
              >
                <dl className="admin-summary-strip">
                  <div>
                    <dt>Đang sử dụng</dt>
                    <dd>{counts.totalChunks}</dd>
                  </div>
                  <div>
                    <dt>Có vector</dt>
                    <dd>{counts.embeddedChunks}</dd>
                  </div>
                  <div>
                    <dt>Chờ tạo vector</dt>
                    <dd>{counts.pendingChunks}</dd>
                  </div>
                </dl>
                <div>
                  {counts.embeddingConfigured ? (
                    <button
                      type="button"
                      className="btn btn-outline-purple btn-sm"
                      disabled={busy || counts.pendingChunks === 0}
                      onClick={() =>
                        void execute(async () => {
                          const result = await apiPost<{
                            processed: number;
                            remaining: number;
                          }>('/admin/ai/knowledge/sync');
                          return `Đã tạo vector cho ${result.processed} đoạn. Còn ${result.remaining} đoạn chờ.`;
                        })
                      }
                    >
                      {busy ? 'Đang xử lý…' : 'Đồng bộ vector'}
                    </button>
                  ) : (
                    <p className="admin-record-meta mb-0">
                      Voyage AI chưa được cấu hình. Chatbot dùng tìm kiếm từ
                      khóa.
                    </p>
                  )}
                </div>
              </section>
            ) : stats.error && stats.error !== listError ? (
              <AdminFeedback error={stats.error} retry={stats.refresh} />
            ) : null}
          </>
        )}
        columns={[
          {
            heading: 'Tài liệu',
            render: (row) => (
              <>
                <strong>{row.title}</strong>
                <div className="admin-record-meta">
                  Đoạn {row.chunkIndex + 1} · {row.docType}
                </div>
              </>
            ),
          },
          {
            heading: 'Sử dụng',
            render: (row) => (
              <RecordStatus
                label={row.isActive ? 'Đang sử dụng' : 'Đã ẩn'}
                tone={row.isActive ? 'good' : 'neutral'}
              />
            ),
          },
          {
            heading: 'Vector',
            render: (row) => (
              <RecordStatus
                label={row.hasEmbedding ? 'Đã tạo' : 'Chưa tạo'}
                tone={row.hasEmbedding ? 'accent' : 'neutral'}
              />
            ),
          },
          {
            heading: 'Cập nhật',
            className: 'text-nowrap',
            render: (row) => localDateTime(row.updatedAt),
          },
          {
            heading: 'Nội dung',
            render: (row) => (
              <button
                type="button"
                className="btn btn-outline-purple btn-sm text-nowrap"
                disabled={busy}
                onClick={() => open(row)}
              >
                Xem đoạn
              </button>
            ),
          },
        ]}
      />
      {selected === 'new' && (
        <AdminDialog title="Nhập tài liệu" onClose={close}>
          <p className="admin-record-meta">
            Nếu trùng tiêu đề và loại, nội dung nhập sẽ thay toàn bộ tài liệu
            đang sử dụng.
          </p>
          {error && <AdminFeedback error={error} />}
          <form className="mt-3" onSubmit={save}>
            <fieldset disabled={busy} className="row g-3">
              <label className="col-md-8">
                Tiêu đề{' '}
                <input
                  className="form-control mt-1"
                  name="title"
                  maxLength={255}
                  required
                />
              </label>
              <label className="col-md-4">
                Loại tài liệu{' '}
                <input
                  className="form-control mt-1"
                  name="docType"
                  list="kb-doc-types"
                  defaultValue="policy"
                  maxLength={50}
                  required
                />
              </label>
              <datalist id="kb-doc-types">
                <option value="policy" />
                <option value="faq" />
                <option value="guide" />
              </datalist>
              <label className="col-12">
                Đường dẫn nguồn (tùy chọn){' '}
                <input
                  type="url"
                  className="form-control mt-1"
                  name="sourceUrl"
                  maxLength={500}
                  placeholder="https://…"
                />
              </label>
              <label className="col-12">
                Nội dung{' '}
                <textarea
                  className="form-control mt-1"
                  name="content"
                  rows={7}
                  maxLength={20000}
                  required
                />
              </label>
              <div className="col-12 d-flex gap-2">
                <button
                  className="btn btn-gradient-purple btn-sm"
                  type="submit"
                >
                  {busy ? 'Đang lưu…' : 'Lưu tài liệu'}
                </button>
                <button
                  className="btn btn-outline-secondary btn-sm"
                  type="button"
                  onClick={close}
                >
                  Đóng
                </button>
              </div>
            </fieldset>
          </form>
        </AdminDialog>
      )}
      {selected && selected !== 'new' && (
        <AdminDialog title={selected.title} onClose={close}>
          {error && <AdminFeedback error={error} />}
          <p className="admin-record-meta">
            Đoạn {selected.chunkIndex + 1} · {selected.docType}
          </p>
          <p className="admin-record-text">{selected.content}</p>
          {selected.sourceUrl && (
            <p className="admin-record-meta text-break">
              Nguồn {selected.sourceUrl}
            </p>
          )}
          <button
            className={`btn btn-sm ${selected.isActive ? 'btn-outline-danger' : 'btn-outline-purple'}`}
            type="button"
            disabled={busy}
            onClick={() => {
              const isActive = !selected.isActive;
              void execute(async () => {
                await apiPatch(`/admin/ai/knowledge/${selected.id}`, {
                  isActive,
                });
                return isActive
                  ? 'Đã đưa đoạn tri thức vào sử dụng.'
                  : 'Đã ẩn đoạn tri thức.';
              }, true);
            }}
          >
            {busy
              ? 'Đang cập nhật…'
              : selected.isActive
                ? 'Ẩn đoạn'
                : 'Đưa vào sử dụng'}
          </button>
        </AdminDialog>
      )}
    </>
  );
}
