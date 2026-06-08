import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BarChart3, Check, Clock, Send, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getParsedApiError, type ParsedApiError } from '../api/error';
import { analysisApi } from '../api/analysis';
import { agentApi, type SkillInfo } from '../api/agent';
import { systemConfigApi } from '../api/systemConfig';
import { ApiErrorAlert, Button, ConfirmDialog, EmptyState, InlineAlert } from '../components/common';
import { DashboardStateBlock } from '../components/dashboard';
import { StockAutocomplete } from '../components/StockAutocomplete';
import { ReportMarkdownDrawer } from '../components/report/ReportMarkdownDrawer';
import { ReportSummary } from '../components/report';
import { TaskPanel } from '../components/tasks';
import { useDashboardLifecycle, useHomeDashboardState } from '../hooks';
import type { AnalysisReport, HistoryItem, StockHistoryRange, TaskInfo } from '../types/analysis';
import type { SetupStatusResponse } from '../types/systemConfig';
import { getSentimentColor } from '../types/analysis';
import { formatDateTime } from '../utils/format';
import { getReportText, normalizeReportLanguage } from '../utils/reportLanguage';
import { generateUUID } from '../utils/uuid';
import { resolveChatFollowUpContext, buildFollowUpPrompt } from '../utils/chatFollowUp';
import type { ChatFollowUpContext } from '../utils/chatFollowUp';

type MarketReviewNotice = {
  variant: 'success' | 'warning' | 'danger';
  title: string;
  message: string;
} | null;

// ─── Simple history item row ────────────────────────────────────────────────

function MobileHistoryRow({
  item,
  isViewing,
  onClick,
}: {
  item: HistoryItem;
  isViewing: boolean;
  onClick: (id: number) => void;
}) {
  const sentimentColor =
    item.sentimentScore !== undefined ? getSentimentColor(item.sentimentScore) : null;
  const stockName = item.stockName || item.stockCode;

  const adviceLabel = (() => {
    const n = item.operationAdvice?.trim();
    if (!n) return '';
    if (n.includes('减仓')) return '减仓';
    if (n.includes('卖')) return '卖出';
    if (n.includes('观望') || n.includes('等待')) return '观望';
    if (n.includes('买') || n.includes('布局')) return '买入';
    return n.split(/[，。；、\s]/)[0] || '';
  })();

  return (
    <button
      type="button"
      onClick={() => onClick(item.id)}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-left transition-colors ${
        isViewing
          ? 'bg-primary/10 ring-1 ring-primary/30'
          : 'hover:bg-active active:bg-active'
      }`}
    >
      {/* Sentiment color bar */}
      {sentimentColor && (
        <div
          className="h-8 w-1 rounded-full flex-shrink-0"
          style={{ backgroundColor: sentimentColor }}
        />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-foreground">
            {stockName}
          </span>
          {sentimentColor && (
            <span
              className="shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
              style={{
                color: sentimentColor,
                backgroundColor: `${sentimentColor}15`,
              }}
            >
              {adviceLabel && `${adviceLabel} `}{item.sentimentScore}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          <span className="text-[11px] font-mono text-muted-text">
            {item.stockCode}
          </span>
          <span className="text-[11px] text-muted-text">·</span>
          <span className="text-[11px] text-muted-text">
            {formatDateTime(item.createdAt)}
          </span>
        </div>
      </div>
    </button>
  );
}

// ─── History bottom sheet ───────────────────────────────────────────────────

function HistoryBottomSheet({
  open,
  onClose,
  historyItems,
  isLoadingHistory,
  isLoadingMore,
  hasMore,
  selectedReportId,
  activeTasks,
  onLoadMore,
  onItemClick,
}: {
  open: boolean;
  onClose: () => void;
  historyItems: HistoryItem[];
  isLoadingHistory: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  selectedReportId?: number;
  activeTasks: TaskInfo[];
  onLoadMore: () => void;
  onItemClick: (id: number) => void;
}) {
  const contentRef = useRef<HTMLDivElement | null>(null);

  // Simple scroll-based load more
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const handler = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (dist < 400 && hasMore && !isLoadingMore && !isLoadingHistory) {
        onLoadMore();
      }
    };

    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [hasMore, isLoadingMore, isLoadingHistory, onLoadMore]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-end"
      onClick={onClose}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Sheet */}
      <div
        className="relative w-full max-h-[80vh] flex flex-col rounded-t-2xl border-t border-subtle bg-elevated shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-subtle px-4 py-3">
          <span className="text-sm font-semibold text-foreground">历史记录</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-text hover:bg-hover hover:text-foreground"
            aria-label="关闭"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div
          ref={contentRef}
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-3"
          style={{ minHeight: 0 }}
        >
          {/* Tasks */}
          {activeTasks.length > 0 && (
            <div className="mb-3">
              <TaskPanel tasks={activeTasks} />
            </div>
          )}

          {/* Loading / Empty */}
          {isLoadingHistory ? (
            <DashboardStateBlock loading compact title="加载历史记录中..." />
          ) : historyItems.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-muted-text">暂无历史分析记录</p>
              <p className="mt-1 text-xs text-muted-text">
                完成首次分析后，这里会保留最近结果。
              </p>
            </div>
          ) : (
            /* History list */
            <div className="space-y-2">
              {historyItems.map((item) => (
                <MobileHistoryRow
                  key={item.id}
                  item={item}
                  isViewing={selectedReportId === item.id}
                  onClick={onItemClick}
                />
              ))}

              {/* Loading more */}
              {isLoadingMore && (
                <div className="flex justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-subtle border-t-primary" />
                </div>
              )}

              {/* End marker */}
              {!hasMore && (
                <div className="py-4 text-center">
                  <div className="mx-auto h-px w-16 bg-subtle" />
                  <p className="mt-2 text-[10px] text-muted-text uppercase tracking-widest">
                    已到底部
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Helper functions for history trend ──────────────────────────────────────

const formatNum = (v?: number, d = 2): string =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(d) : '--';

const formatChangePct = (v?: number): string => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '--';
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
};

const formatShortTime = (v?: string | null): string => {
  const f = formatDateTime(v);
  return f.length > 11 ? f.slice(5) : f;
};

const formatModelName = (v?: string): string => {
  const m = v?.trim();
  if (!m) return '未记录';
  const parts = m.split('/').filter(Boolean);
  return parts[parts.length - 1] || m;
};

const getAdviceShort = (item: Pick<HistoryItem, 'operationAdvice' | 'trendPrediction'>): string => {
  const n = item.operationAdvice?.trim() || item.trendPrediction?.trim();
  if (!n) return '--';
  if (n.includes('减仓')) return '减仓';
  if (n.includes('卖')) return '卖出';
  if (n.includes('观望') || n.includes('等待')) return '观望';
  if (n.includes('买') || n.includes('布局')) return '买入';
  return n.split(/[，。；、\s]/)[0] || '--';
};

const getAdviceColor = (v: string): 'up' | 'down' | 'flat' => {
  if (v.includes('买') || v.includes('多') || v.includes('持有')) return 'up';
  if (v.includes('卖') || v.includes('减') || v.includes('空')) return 'down';
  return 'flat';
};

const adviceColorMap = {
  up: 'var(--home-price-up)',
  down: 'var(--home-price-down)',
  flat: 'var(--text-secondary)',
};

// ─── Mobile history trend full-screen overlay ────────────────────────────────

const RANGE_OPTIONS: Array<{ value: StockHistoryRange; label: string }> = [
  { value: 'all', label: '全部' },
  { value: '30d', label: '近30天' },
  { value: '90d', label: '近90天' },
];

function MobileHistoryTrend({
  report,
  items,
  total,
  hasMore,
  isLoading,
  isLoadingMore,
  error,
  filters,
  onClose,
  onRangeChange,
  onLoadMore,
  onSelectRecord,
  onRetry,
}: {
  report: AnalysisReport;
  items: HistoryItem[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error?: unknown;
  filters: { range: StockHistoryRange };
  onClose: () => void;
  onRangeChange: (range: StockHistoryRange) => void;
  onLoadMore: () => void;
  onSelectRecord: (id: number) => void;
  onRetry: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load more on scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = () => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (dist < 300 && hasMore && !isLoadingMore && !isLoading) {
        onLoadMore();
      }
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, [hasMore, isLoadingMore, isLoading, onLoadMore]);

  // Summary stats
  const summary = useMemo(() => {
    const scores = items
      .map((i) => i.sentimentScore)
      .filter((s): s is number => typeof s === 'number' && Number.isFinite(s));
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
    const current = items[0];
    return {
      total: total || items.length,
      avgScore: avg,
      currentAdvice: current ? getAdviceShort(current) : '--',
      currentScore: current?.sentimentScore,
      currentModel: formatModelName(current?.modelUsed || report.meta.modelUsed),
      latestTime: formatDateTime(items[0]?.createdAt || report.meta.createdAt),
    };
  }, [items, total, report]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-subtle bg-elevated px-3 py-2.5">
        <button type="button" onClick={onClose} className="flex items-center gap-1 text-sm text-secondary-text">
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <span className="text-sm font-semibold text-foreground">历史趋势</span>
        <div className="w-12 text-right">
          <span className="text-xs text-muted-text">{report.meta.stockCode}</span>
        </div>
      </div>

      {/* Range selector */}
      <div className="flex items-center gap-2 border-b border-subtle bg-elevated px-3 py-2">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onRangeChange(opt.value)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              filters.range === opt.value
                ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                : 'text-muted-text hover:bg-hover'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto touch-pan-y" style={{ minHeight: 0 }}>
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <DashboardStateBlock loading title="加载历史趋势中..." compact />
          </div>
        ) : error ? (
          <div className="flex h-32 items-center justify-center">
            <DashboardStateBlock
              title="加载失败"
              description="请稍后重试"
              compact
              action={
                <button type="button" onClick={() => void onRetry()} className="text-xs text-primary underline">
                  重试
                </button>
              }
            />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-32 items-center justify-center">
            <DashboardStateBlock title="暂无历史数据" description="完成多次分析后这里会展示趋势" compact />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-2 px-3 pt-3 pb-2">
              <div className="rounded-xl bg-surface px-2 py-2 text-center">
                <p className="text-[10px] text-muted-text">分析次数</p>
                <p className="text-sm font-bold text-foreground">{summary.total}</p>
              </div>
              <div className="rounded-xl bg-surface px-2 py-2 text-center">
                <p className="text-[10px] text-muted-text">当前观点</p>
                <p className="text-sm font-bold" style={{ color: adviceColorMap[getAdviceColor(summary.currentAdvice)] }}>
                  {summary.currentAdvice}
                </p>
              </div>
              <div className="rounded-xl bg-surface px-2 py-2 text-center">
                <p className="text-[10px] text-muted-text">当前分数</p>
                <p
                  className="text-sm font-bold"
                  style={{
                    color: summary.currentScore ? getSentimentColor(summary.currentScore) : 'inherit',
                  }}
                >
                  {formatNum(summary.currentScore, 0)}
                </p>
              </div>
              <div className="rounded-xl bg-surface px-2 py-2 text-center">
                <p className="text-[10px] text-muted-text">平均分</p>
                <p className="text-sm font-bold text-foreground">{formatNum(summary.avgScore, 1)}</p>
              </div>
            </div>

            {/* History list */}
            <div className="space-y-2 px-3 py-2">
              {items.map((item) => {
                const advice = getAdviceShort(item);
                const adviceColor = getAdviceColor(advice);
                const sentimentColor =
                  item.sentimentScore !== undefined ? getSentimentColor(item.sentimentScore) : null;
                const changeColor =
                  typeof item.changePct === 'number' && Number.isFinite(item.changePct)
                    ? item.changePct > 0
                      ? 'var(--home-price-up)'
                      : item.changePct < 0
                        ? 'var(--home-price-down)'
                        : undefined
                    : undefined;

                return (
                  <div
                    key={item.id}
                    className="rounded-xl border border-subtle bg-surface p-3"
                  >
                    {/* Top row: time, score, advice */}
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-muted-text">
                        {formatShortTime(item.createdAt)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold"
                          style={{
                            color: adviceColorMap[adviceColor],
                            backgroundColor: `${adviceColorMap[adviceColor]}15`,
                          }}
                        >
                          {advice}
                        </span>
                        {sentimentColor && (
                          <span
                            className="font-mono text-sm font-bold"
                            style={{ color: sentimentColor }}
                          >
                            {formatNum(item.sentimentScore, 0)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Middle row: price, change, volume */}
                    <div className="mt-2 flex items-center gap-3">
                      <span className="font-mono text-xs text-secondary-text">
                        ¥{formatNum(item.currentPrice)}
                      </span>
                      <span className="font-mono text-xs font-semibold" style={changeColor ? { color: changeColor } : undefined}>
                        {formatChangePct(item.changePct)}
                      </span>
                      <span className="font-mono text-[11px] text-muted-text">
                        量比 {formatNum(item.volumeRatio, 1)}
                      </span>
                      <span className="font-mono text-[11px] text-muted-text">
                        换手 {formatNum(item.turnoverRate, 1)}%
                      </span>
                    </div>

                    {/* Bottom row: model + action */}
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] text-muted-text">
                        {formatModelName(item.modelUsed)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRecord(item.id);
                          onClose();
                        }}
                        className="rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary"
                      >
                        查看报告
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Loading more */}
              {isLoadingMore && (
                <div className="flex justify-center py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-subtle border-t-primary" />
                </div>
              )}

              {/* End marker */}
              {!hasMore && (
                <div className="py-4 text-center">
                  <div className="mx-auto h-px w-16 bg-subtle" />
                  <p className="mt-2 text-[10px] text-muted-text uppercase tracking-widest">
                    已加载全部 {summary.total} 条
                  </p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Mobile ask AI overlay ──────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

function MobileAskAIOverlay({
  report,
  onClose,
}: {
  report: AnalysisReport;
  onClose: () => void;
}) {
  const stockCode = report.meta.stockCode;
  const stockName = report.meta.stockName || null;
  const recordId = report.meta.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState('');
  const [sessionId] = useState(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('dsa_chat_session_id') : null;
    return saved ?? generateUUID();
  });
  const [followUpContext, setFollowUpContext] = useState<ChatFollowUpContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  // Resolve follow-up context on mount
  useEffect(() => {
    isMountedRef.current = true;
    const initPrompt = buildFollowUpPrompt(stockCode, stockName);
    setInput(initPrompt);

    setFollowUpContext({
      stock_code: stockCode,
      stock_name: stockName,
    });

    if (recordId) {
      setContextLoading(true);
      void resolveChatFollowUpContext({
        stockCode,
        stockName,
        recordId,
      }).then((ctx) => {
        if (isMountedRef.current) {
          setFollowUpContext(ctx);
          setContextLoading(false);
        }
      }).catch(() => {
        if (isMountedRef.current) {
          setContextLoading(false);
        }
      });
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [stockCode, stockName, recordId]);

  // Scroll to bottom on new messages / loading
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading, progressText]);

  const handleSend = useCallback(async () => {
    const msgText = input.trim();
    if (!msgText || loading) return;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: msgText };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);
    setProgressText('正在连接...');

    const currentContext = followUpContext;
    setFollowUpContext(null);

    try {
      const payload = {
        message: msgText,
        session_id: sessionId,
        ...(currentContext ? { context: currentContext } : {}),
      };

      const response = await agentApi.chatStream(payload, { signal: ac.signal });
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let finalContent: string | null = null;

      const processLine = (line: string) => {
        if (!line.startsWith('data: ')) return;
        const event = JSON.parse(line.slice(6));
        if (event.type === 'done') {
          if (event.success === false) {
            throw new Error(event.content || event.message || '大模型调用出错');
          }
          finalContent = event.content ?? '';
          return;
        }
        if (event.type === 'error') {
          throw new Error(event.content || event.message || '分析出错');
        }
        if (event.type === 'thinking') {
          setProgressText(event.message || 'AI 正在思考...');
        } else if (event.type === 'tool_start') {
          setProgressText(`${event.display_name || event.tool}...`);
        } else if (event.type === 'tool_done') {
          setProgressText(`${event.display_name || event.tool} 完成`);
        } else if (event.type === 'generating') {
          setProgressText(event.message || '正在生成分析...');
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          try {
            processLine(line);
          } catch (parseErr: unknown) {
            if (parseErr instanceof Error && parseErr.name === 'AbortError') throw parseErr;
          }
        }
      }
      if (buf.trim().startsWith('data: ')) {
        try {
          processLine(buf.trim());
        } catch (parseErr: unknown) {
          if (parseErr instanceof Error && parseErr.name === 'AbortError') throw parseErr;
        }
      }

      if (!ac.signal.aborted && isMountedRef.current) {
        const assistantMsg: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: finalContent || '（无内容）',
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Silent on user abort
      } else {
        const msg = err instanceof Error ? err.message : '请求失败，请稍后重试';
        setError(msg);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
        setProgressText('');
      }
    }
  }, [input, loading, sessionId, followUpContext]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // Save session ID to localStorage
  useEffect(() => {
    localStorage.setItem('dsa_chat_session_id', sessionId);
  }, [sessionId]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-subtle bg-elevated px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-sm text-secondary-text"
        >
          <ArrowLeft className="h-4 w-4" />
          返回
        </button>
        <span className="text-sm font-semibold text-foreground">追问 AI</span>
        <div className="w-12 text-right">
          <span className="text-xs text-muted-text">{stockCode}</span>
        </div>
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto touch-pan-y px-3 py-3 space-y-3" style={{ minHeight: 0 }}>
        {messages.length === 0 && !loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Sparkles className="mx-auto h-8 w-8 text-primary/60 mb-2" />
              <p className="text-sm text-muted-text">向 AI 追问关于 {stockName || stockCode} 的分析</p>
              {contextLoading && (
                <p className="mt-1 text-xs text-muted-text">正在加载上下文...</p>
              )}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {/* Avatar */}
                <div
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                    msg.role === 'user'
                      ? 'bg-primary text-white'
                      : 'bg-primary/15 text-primary'
                  }`}
                >
                  {msg.role === 'user' ? 'U' : 'AI'}
                </div>

                {/* Message content */}
                <div
                  className={`max-w-[80%] min-w-0 rounded-2xl px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-surface text-foreground rounded-tl-sm'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm prose-invert max-w-none whitespace-pre-wrap break-words">
                      {msg.content}
                    </div>
                  ) : (
                    msg.content.split('\n').map((line, i) => (
                      <p key={i} className="mb-0.5 last:mb-0">
                        {line || ' '}
                      </p>
                    ))
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex gap-2">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-[10px] font-bold">
                  AI
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-surface px-3 py-2">
                  <div className="flex items-center gap-2 text-xs text-muted-text">
                    <div className="relative h-3 w-3 flex-shrink-0">
                      <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                      <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    </div>
                    <span>{progressText || '正在思考...'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="rounded-xl border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">
                {error}
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-subtle bg-elevated px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入你的问题... (Enter 发送)"
            disabled={loading}
            rows={1}
            className="flex-1 min-h-[36px] max-h-[120px] rounded-xl border border-subtle bg-surface px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary/50 disabled:opacity-60"
            style={{ height: 'auto' }}
            onInput={(e) => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = `${Math.min(t.scrollHeight, 120)}px`;
            }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || loading}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40 active:scale-95 transition-transform"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

const MobileHomePage: React.FC = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSubmittingMarketReview, setIsSubmittingMarketReview] = useState(false);
  const [marketReviewNotice, setMarketReviewNotice] = useState<MarketReviewNotice>(null);
  const [marketReviewError, setMarketReviewError] = useState<ParsedApiError | null>(null);
  const [marketReviewReport, setMarketReviewReport] = useState<string | null>(null);
  const [marketReviewReportCopied, setMarketReviewReportCopied] = useState(false);
  const [analysisSkills, setAnalysisSkills] = useState<SkillInfo[]>([]);
  const [selectedStrategyId, setSelectedStrategyId] = useState('');
  const [strategyMenuOpen, setStrategyMenuOpen] = useState(false);
  const [askAiOpen, setAskAiOpen] = useState(false);

  const marketReviewPollTimer = useRef<number | null>(null);
  const dashboardScrollRef = useRef<HTMLDivElement | null>(null);
  const strategyMenuRef = useRef<HTMLDivElement | null>(null);
  const strategyButtonRef = useRef<HTMLButtonElement | null>(null);
  const strategyItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const strategyInitialFocusIndexRef = useRef<number | null>(null);

  const stopMarketReviewPolling = useCallback(() => {
    if (marketReviewPollTimer.current !== null) {
      window.clearInterval(marketReviewPollTimer.current);
      marketReviewPollTimer.current = null;
    }
  }, []);

  const scrollMarketReviewFeedbackIntoView = useCallback(() => {
    const scrollContainer = dashboardScrollRef.current;
    if (!scrollContainer) return;
    if (typeof scrollContainer.scrollTo === 'function') {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    scrollContainer.scrollTop = 0;
  }, []);

  useEffect(() => stopMarketReviewPolling, [stopMarketReviewPolling]);

  const [setupStatus, setSetupStatus] = useState<SetupStatusResponse | null>(null);

  const {
    query,
    inputError,
    duplicateError,
    error,
    isAnalyzing,
    historyItems,
    isDeletingHistory,
    isLoadingHistory,
    isLoadingMore,
    hasMore,
    selectedReport,
    isLoadingReport,
    isHistoryTrendOpen,
    stockHistoryItems,
    stockHistoryTotal,
    stockHistoryHasMore,
    isLoadingStockHistory,
    isLoadingMoreStockHistory,
    stockHistoryError,
    stockHistoryFilters,
    activeTasks,
    markdownDrawerOpen,
    setQuery,
    clearError,
    loadInitialHistory,
    refreshHistory,
    loadMoreHistory,
    selectHistoryItem,
    submitAnalysis,
    notify,
    setNotify,
    syncTaskCreated,
    syncTaskUpdated,
    syncTaskFailed,
    refreshActiveTasks,
    removeTask,
    openMarkdownDrawer,
    closeMarkdownDrawer,
    openHistoryTrend,
    closeHistoryTrend,
    setStockHistoryRange,
    loadMoreStockHistory,
  } = useHomeDashboardState();

  useEffect(() => {
    document.title = '每日个股分析 - DSA';
  }, []);

  useEffect(() => {
    let active = true;
    systemConfigApi.getSetupStatus()
      .then((status) => {
        if (active) setSetupStatus(status);
      })
      .catch(() => {
        if (active) setSetupStatus(null);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    agentApi.getSkills()
      .then((response) => {
        if (active) setAnalysisSkills(response.skills);
      })
      .catch(() => {
        if (active) setAnalysisSkills([]);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!strategyMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && strategyMenuRef.current?.contains(target)) return;
      setStrategyMenuOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [strategyMenuOpen]);

  useEffect(() => {
    if (selectedStrategyId && !analysisSkills.some((s) => s.id === selectedStrategyId)) {
      setSelectedStrategyId('');
    }
  }, [analysisSkills, selectedStrategyId]);

  const reportLanguage = normalizeReportLanguage(selectedReport?.meta.reportLanguage);
  const reportText = getReportText(reportLanguage);
  const isMarketReviewHistoryReport = selectedReport?.meta.reportType === 'market_review';
  const isHistoryTrendUnavailable = !selectedReport || isMarketReviewHistoryReport || !selectedReport.meta.stockCode;

  useEffect(() => {
    if (!isHistoryTrendUnavailable || !isHistoryTrendOpen) return;
    closeHistoryTrend();
  }, [closeHistoryTrend, isHistoryTrendOpen, isHistoryTrendUnavailable]);

  const selectedStrategy = useMemo(
    () => analysisSkills.find((s) => s.id === selectedStrategyId),
    [analysisSkills, selectedStrategyId],
  );
  const selectedAnalysisSkills = useMemo(
    () => (selectedStrategyId ? [selectedStrategyId] : undefined),
    [selectedStrategyId],
  );
  const strategyOptions = useMemo(
    () => [
      { id: '', name: '默认策略', description: '沿用系统默认分析框架' },
      ...analysisSkills.map((s) => ({ id: s.id, name: s.name, description: s.description })),
    ],
    [analysisSkills],
  );

  const closeStrategyMenu = useCallback((restoreFocus = false) => {
    setStrategyMenuOpen(false);
    if (restoreFocus) strategyButtonRef.current?.focus();
  }, []);
  const selectStrategy = useCallback((id: string) => {
    setSelectedStrategyId(id);
    setStrategyMenuOpen(false);
  }, []);
  const focusStrategyItem = useCallback((index: number) => {
    const count = strategyOptions.length;
    if (count === 0) return;
    const next = (index + count) % count;
    strategyItemRefs.current[next]?.focus();
  }, [strategyOptions.length]);
  const getSelectedStrategyIndex = useCallback(() => {
    const i = strategyOptions.findIndex((o) => o.id === selectedStrategyId);
    return i >= 0 ? i : 0;
  }, [selectedStrategyId, strategyOptions]);

  useEffect(() => {
    strategyItemRefs.current = strategyItemRefs.current.slice(0, strategyOptions.length);
  }, [strategyOptions.length]);

  useEffect(() => {
    if (!strategyMenuOpen) return undefined;
    const targetIndex = strategyInitialFocusIndexRef.current ?? getSelectedStrategyIndex();
    strategyInitialFocusIndexRef.current = null;
    const timeout = window.setTimeout(() => focusStrategyItem(targetIndex), 0);
    return () => window.clearTimeout(timeout);
  }, [focusStrategyItem, getSelectedStrategyIndex, strategyMenuOpen]);

  const handleStrategyButtonKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const targetIndex = event.key === 'ArrowUp' ? strategyOptions.length - 1 : 0;
      if (strategyMenuOpen) {
        focusStrategyItem(targetIndex);
        return;
      }
      strategyInitialFocusIndexRef.current = targetIndex;
      setStrategyMenuOpen(true);
    },
    [focusStrategyItem, strategyMenuOpen, strategyOptions.length],
  );

  const handleStrategyMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const count = strategyOptions.length;
      if (count === 0) return;
      const current = strategyItemRefs.current.findIndex((el) => el === document.activeElement);
      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          closeStrategyMenu(true);
          break;
        case 'ArrowDown':
          event.preventDefault();
          focusStrategyItem(current >= 0 ? current + 1 : 0);
          break;
        case 'ArrowUp':
          event.preventDefault();
          focusStrategyItem(current >= 0 ? current - 1 : count - 1);
          break;
        case 'Home':
          event.preventDefault();
          focusStrategyItem(0);
          break;
        case 'End':
          event.preventDefault();
          focusStrategyItem(count - 1);
          break;
        case 'Tab':
          setStrategyMenuOpen(false);
          break;
      }
    },
    [closeStrategyMenu, focusStrategyItem, strategyOptions.length],
  );

  const setupNeedsAction = setupStatus ? !setupStatus.isComplete : false;
  const setupMissingLabels = useMemo(() => {
    if (!setupStatus) return '';
    return setupStatus.checks
      .filter((c) => c.required && c.status === 'needs_action')
      .map((c) => c.title)
      .slice(0, 3)
      .join('、');
  }, [setupStatus]);

  useDashboardLifecycle({
    loadInitialHistory,
    refreshHistory,
    refreshActiveTasks,
    syncTaskCreated,
    syncTaskUpdated,
    syncTaskFailed,
    removeTask,
  });

  const handleSubmitAnalysis = useCallback(
    (stockCode?: string, stockName?: string, selectionSource?: 'manual' | 'autocomplete' | 'import' | 'image') => {
      void submitAnalysis({
        stockCode,
        stockName,
        originalQuery: query,
        selectionSource: selectionSource ?? 'manual',
        skills: selectedAnalysisSkills,
      });
    },
    [query, selectedAnalysisSkills, submitAnalysis],
  );

  const handleAskFollowUp = useCallback(() => {
    if (selectedReport?.meta.id === undefined || isMarketReviewHistoryReport) return;
    setAskAiOpen(true);
  }, [selectedReport, isMarketReviewHistoryReport]);

  const handleReanalyze = useCallback(() => {
    if (!selectedReport || isMarketReviewHistoryReport) return;
    void submitAnalysis({
      stockCode: selectedReport.meta.stockCode,
      stockName: selectedReport.meta.stockName,
      originalQuery: selectedReport.meta.stockCode,
      selectionSource: 'manual',
      forceRefresh: true,
      skills: selectedAnalysisSkills,
    });
  }, [selectedAnalysisSkills, selectedReport, isMarketReviewHistoryReport, submitAnalysis]);

  // ── Market review polling ────────────────────────────────────────────────

  const pollMarketReviewStatus = useCallback(
    async (taskId: string) => {
      stopMarketReviewPolling();
      const maxAttempts = 120;
      const intervalMs = 2000;
      let attempts = 0;
      const poll = async (): Promise<boolean> => {
        if (attempts >= maxAttempts) {
          stopMarketReviewPolling();
          setMarketReviewReport(null);
          setMarketReviewNotice({
            variant: 'danger',
            title: '大盘复盘已超时',
            message: '任务长时间未返回最终结果，请在任务列表/历史中查看。',
          });
          scrollMarketReviewFeedbackIntoView();
          return false;
        }
        attempts += 1;
        try {
          const status = await analysisApi.getStatus(taskId);
          if (status.status === 'pending' || status.status === 'processing') {
            setMarketReviewReport(null);
            const progress = typeof status.progress === 'number' ? `${status.progress}%` : '进行中';
            setMarketReviewNotice({
              variant: 'warning',
              title: '大盘复盘进行中',
              message: `任务状态：${status.status}（${progress}）`,
            });
            return true;
          }
          if (status.status === 'completed') {
            stopMarketReviewPolling();
            const text = typeof status.marketReviewReport === 'string' ? status.marketReviewReport : '';
            setMarketReviewReport(text ? text.trim() : null);
            setMarketReviewNotice({
              variant: 'success',
              title: '大盘复盘已完成',
              message: text
                ? '大盘复盘任务已完成，结果如下：'
                : '大盘复盘任务已完成，结果已生成并按配置推送。',
            });
            setMarketReviewError(null);
            scrollMarketReviewFeedbackIntoView();
            return false;
          }
          if (status.status === 'failed') {
            stopMarketReviewPolling();
            setMarketReviewReport(null);
            setMarketReviewError(
              getParsedApiError({
                response: {
                  status: 500,
                  data: { error: 'market_review_failed', message: status.error || '大盘复盘执行失败。' },
                },
              }),
            );
            setMarketReviewNotice(null);
            scrollMarketReviewFeedbackIntoView();
            return false;
          }
          stopMarketReviewPolling();
          setMarketReviewReport(null);
          setMarketReviewNotice({
            variant: 'danger',
            title: '大盘复盘状态异常',
            message: `收到未知任务状态：${status.status}`,
          });
          scrollMarketReviewFeedbackIntoView();
          return false;
        } catch (err: unknown) {
          const parsed = getParsedApiError(err);
          if (attempts >= maxAttempts) {
            stopMarketReviewPolling();
            setMarketReviewReport(null);
            setMarketReviewError(parsed);
            setMarketReviewNotice(null);
            scrollMarketReviewFeedbackIntoView();
            return false;
          }
          return true;
        }
      };
      if (await poll()) {
        marketReviewPollTimer.current = window.setInterval(() => {
          void poll().then((shouldContinue) => {
            if (!shouldContinue) stopMarketReviewPolling();
          });
        }, intervalMs);
      }
    },
    [scrollMarketReviewFeedbackIntoView, stopMarketReviewPolling],
  );

  const handleTriggerMarketReview = useCallback(async () => {
    setIsSubmittingMarketReview(true);
    setMarketReviewNotice(null);
    setMarketReviewError(null);
    setMarketReviewReport(null);
    scrollMarketReviewFeedbackIntoView();
    try {
      const result = await analysisApi.triggerMarketReview({ sendNotification: notify });
      setMarketReviewNotice({
        variant: 'success',
        title: '大盘复盘已提交',
        message: result.message,
      });
      scrollMarketReviewFeedbackIntoView();
      if (result.taskId) await pollMarketReviewStatus(result.taskId);
    } catch (err: unknown) {
      setMarketReviewError(getParsedApiError(err));
      setMarketReviewNotice(null);
      scrollMarketReviewFeedbackIntoView();
    } finally {
      setIsSubmittingMarketReview(false);
    }
  }, [notify, pollMarketReviewStatus, scrollMarketReviewFeedbackIntoView]);

  const handleCopyMarketReviewReport = useCallback(() => {
    if (!marketReviewReport) return;
    void navigator.clipboard.writeText(marketReviewReport).then(
      () => {
        setMarketReviewReportCopied(true);
        setTimeout(() => setMarketReviewReportCopied(false), 2000);
      },
      (err) => console.error('复制失败:', err),
    );
  }, [marketReviewReport]);

  // ── History item click (closes sheet + selects) ──────────────────────────

  const handleHistoryItemClick = useCallback(
    (recordId: number) => {
      setSidebarOpen(false);
      void selectHistoryItem(recordId);
    },
    [selectHistoryItem],
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      {/* ── Scrollable main content ─────────────────────────────────────── */}
      <div
        ref={dashboardScrollRef}
        className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 touch-pan-y"
        style={{ minHeight: 0 }}
      >
        {/* ── Input section ────────────────────────────────────────────── */}
        <div className="mb-3 space-y-2">
          {/* Row 1: Input + Notify */}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <StockAutocomplete
                value={query}
                onChange={setQuery}
                onSubmit={(stockCode, stockName, selectionSource) => {
                  handleSubmitAnalysis(stockCode, stockName, selectionSource);
                }}
                placeholder="输入股票代码/名称"
                disabled={isAnalyzing}
                className={inputError ? 'border-danger/50' : undefined}
              />
            </div>
            {/* Notify toggle */}
            <label className="flex h-11 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-xl border border-subtle bg-surface px-2 text-xs text-secondary-text select-none active:bg-hover">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              推送
            </label>
          </div>

          {/* Row 2: History + Strategy + Actions */}
          <div className="flex items-center gap-2">
            {/* History button */}
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-subtle bg-surface text-secondary-text transition-colors hover:bg-hover hover:text-foreground"
              aria-label="历史记录"
            >
              <Clock className="h-4 w-4" />
            </button>

            {analysisSkills.length > 0 ? (
              <div ref={strategyMenuRef} className="relative">
                <button
                  ref={strategyButtonRef}
                  id="mobile-strategy-menu-button"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={strategyMenuOpen}
                  onClick={() => setStrategyMenuOpen((o) => !o)}
                  onKeyDown={handleStrategyButtonKeyDown}
                  disabled={isAnalyzing}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-subtle bg-surface text-secondary-text disabled:cursor-not-allowed disabled:opacity-60"
                  title={selectedStrategy?.name || '策略'}
                >
                  <SlidersHorizontal className="h-4 w-4" />
                </button>
                {strategyMenuOpen ? (
                  <div
                    id="mobile-strategy-menu"
                    role="menu"
                    aria-labelledby="mobile-strategy-menu-button"
                    onKeyDown={handleStrategyMenuKeyDown}
                    className="absolute left-0 top-full z-[120] mt-1 w-64 max-h-72 overflow-y-auto rounded-xl border border-subtle bg-elevated p-1 shadow-2xl"
                  >
                    {strategyOptions.map((option, index) => (
                      <button
                        key={option.id || 'default'}
                        ref={(node) => { strategyItemRefs.current[index] = node; }}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selectedStrategyId === option.id}
                        tabIndex={-1}
                        onClick={() => selectStrategy(option.id)}
                        className="flex w-full items-start gap-2.5 rounded-lg px-3 py-3 text-left transition-colors hover:bg-hover"
                      >
                        <Check
                          className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                            selectedStrategyId === option.id ? 'opacity-100' : 'opacity-0'
                          }`}
                        />
                        <span className="min-w-0">
                          <span className="block font-medium text-sm">{option.name}</span>
                          <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-text">
                            {option.description}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="w-9" />
            )}

            {/* Market review + Analyze */}
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isLoading={isSubmittingMarketReview}
                loadingText="提交中"
                onClick={() => void handleTriggerMarketReview()}
                className="flex h-9 flex-1 items-center justify-center gap-1 whitespace-nowrap text-xs"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                大盘复盘
              </Button>
              <button
                type="button"
                onClick={() => handleSubmitAnalysis()}
                disabled={!query || isAnalyzing}
                className="btn-primary flex h-9 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-lg text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAnalyzing ? (
                  <>
                    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    分析中
                  </>
                ) : (
                  '分析'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── Alerts ──────────────────────────────────────────────────── */}
        {inputError && (
          <InlineAlert
            variant="danger"
            title="输入有误"
            message={inputError}
            className="mb-2 rounded-xl px-3 py-2 text-xs shadow-none"
          />
        )}
        {!inputError && duplicateError && (
          <InlineAlert
            variant="warning"
            title="任务已存在"
            message={duplicateError}
            className="mb-2 rounded-xl px-3 py-2 text-xs shadow-none"
          />
        )}
        {setupNeedsAction && (
          <InlineAlert
            variant="warning"
            title="基础配置未完成"
            message={
              setupMissingLabels
                ? `还缺少 ${setupMissingLabels}，完成后即可开始最小可用分析。`
                : '还缺少基础配置，完成后即可开始最小可用分析。'
            }
            action={
              <Button type="button" variant="secondary" size="sm" onClick={() => navigate('/settings')}>
                去配置
              </Button>
            }
            className="mb-2 rounded-xl px-3 py-2 text-xs shadow-none"
          />
        )}
        {marketReviewNotice && (
          <InlineAlert
            variant={marketReviewNotice.variant}
            title={marketReviewNotice.title}
            message={marketReviewNotice.message}
            className="mb-2 rounded-xl px-3 py-2 text-xs shadow-none"
          />
        )}
        {marketReviewError && (
          <ApiErrorAlert
            error={marketReviewError}
            className="mb-2"
            onDismiss={() => setMarketReviewError(null)}
          />
        )}

        {/* Market review report */}
        {marketReviewReport && (
          <div className="mb-3 rounded-xl border border-subtle bg-surface/70 px-3 py-3 text-xs text-secondary-text shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-semibold text-foreground">大盘复盘报告</p>
              <button
                type="button"
                className="h-8 rounded-lg px-3 text-xs text-foreground"
                disabled={marketReviewReportCopied}
                onClick={() => void handleCopyMarketReviewReport()}
              >
                {marketReviewReportCopied ? '已复制' : '复制'}
              </button>
            </div>
            <pre
              data-testid="market-review-report"
              className="overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-background px-3 py-2 leading-relaxed"
            >
              {marketReviewReport}
            </pre>
          </div>
        )}

        {error && (
          <ApiErrorAlert error={error} className="mb-2" onDismiss={clearError} />
        )}

        {/* ── Report content ─────────────────────────────────────────── */}
        {isLoadingReport ? (
          <div className="flex h-32 flex-col items-center justify-center">
            <DashboardStateBlock title="加载报告中..." loading />
          </div>
        ) : selectedReport ? (
          <div className="space-y-3 pb-4">
            {/* Action bar */}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant="home-action-ai"
                size="sm"
                disabled={isAnalyzing || selectedReport.meta.id === undefined || isMarketReviewHistoryReport}
                onClick={handleReanalyze}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {reportText.reanalyze}
              </Button>
              <Button
                variant="home-action-ai"
                size="sm"
                disabled={selectedReport.meta.id === undefined || isMarketReviewHistoryReport}
                onClick={handleAskFollowUp}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                追问 AI
              </Button>
              <Button
                variant="home-action-ai"
                size="sm"
                disabled={isAnalyzing || selectedReport.meta.id === undefined || isMarketReviewHistoryReport}
                className={
                  isHistoryTrendOpen ? 'border-primary/70 bg-primary/15 text-primary shadow-glow-cyan' : undefined
                }
                onClick={() => {
                  if (isHistoryTrendOpen) {
                    closeHistoryTrend();
                    return;
                  }
                  void openHistoryTrend();
                }}
              >
                <BarChart3 className="h-4 w-4" />
                历史趋势
              </Button>
              <Button
                variant="home-action-ai"
                size="sm"
                disabled={selectedReport.meta.id === undefined}
                onClick={openMarkdownDrawer}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {reportText.fullReport}
              </Button>
            </div>

            {/* Report body */}
            {isHistoryTrendOpen ? (
              <MobileHistoryTrend
                key={`stock-history-${selectedReport.meta.id}`}
                report={selectedReport}
                items={stockHistoryItems}
                total={stockHistoryTotal}
                hasMore={stockHistoryHasMore}
                isLoading={isLoadingStockHistory}
                isLoadingMore={isLoadingMoreStockHistory}
                error={stockHistoryError}
                filters={stockHistoryFilters}
                onClose={closeHistoryTrend}
                onRangeChange={(range) => void setStockHistoryRange(range)}
                onLoadMore={() => void loadMoreStockHistory()}
                onSelectRecord={(recordId) => void selectHistoryItem(recordId)}
                onRetry={() => void openHistoryTrend()}
              />
            ) : (
              <ReportSummary data={selectedReport} isHistory />
            )}
          </div>
        ) : (
          <div className="flex min-h-[30vh] items-center justify-center">
            <EmptyState
              title="开始分析"
              description="输入股票代码进行分析，开始你的第一次分析吧。"
              className="max-w-sm border-dashed"
              icon={
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
            />
          </div>
        )}
      </div>

      {/* ── History bottom sheet ──────────────────────────────────────── */}
      <HistoryBottomSheet
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        historyItems={historyItems}
        isLoadingHistory={isLoadingHistory}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        selectedReportId={selectedReport?.meta.id}
        activeTasks={activeTasks}
        onLoadMore={() => void loadMoreHistory()}
        onItemClick={handleHistoryItemClick}
      />

      {/* ── Markdown drawer ──────────────────────────────────────────── */}
      {markdownDrawerOpen && selectedReport?.meta.id && (
        <ReportMarkdownDrawer
          key={selectedReport.meta.id}
          recordId={selectedReport.meta.id}
          stockName={selectedReport.meta.stockName || ''}
          stockCode={selectedReport.meta.stockCode}
          reportLanguage={reportLanguage}
          onClose={closeMarkdownDrawer}
        />
      )}

      {/* ── Ask AI overlay ───────────────────────────────────────────── */}
      {askAiOpen && selectedReport && (
        <MobileAskAIOverlay
          report={selectedReport}
          onClose={() => setAskAiOpen(false)}
        />
      )}

      {/* ── Delete confirm (kept for future batch-delete) ────────────── */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="删除历史记录"
        message="确认删除选中的历史记录吗？删除后将不可恢复。"
        confirmText={isDeletingHistory ? '删除中...' : '确认删除'}
        cancelText="取消"
        isDanger
        onConfirm={() => setShowDeleteConfirm(false)}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};

export default MobileHomePage;
