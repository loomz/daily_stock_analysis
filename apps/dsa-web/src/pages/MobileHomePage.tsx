import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, Check, Clock, SlidersHorizontal } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { getParsedApiError, type ParsedApiError } from '../api/error';
import { analysisApi } from '../api/analysis';
import { agentApi, type SkillInfo } from '../api/agent';
import { systemConfigApi } from '../api/systemConfig';
import { ApiErrorAlert, Button, ConfirmDialog, EmptyState, InlineAlert } from '../components/common';
import { DashboardStateBlock } from '../components/dashboard';
import { StockAutocomplete } from '../components/StockAutocomplete';
import { HistoryList, StockHistoryTrendDrawer } from '../components/history';
import { ReportMarkdownDrawer } from '../components/report/ReportMarkdownDrawer';
import { ReportSummary } from '../components/report';
import { TaskPanel } from '../components/tasks';
import { useDashboardLifecycle, useHomeDashboardState } from '../hooks';
import type { SetupStatusResponse } from '../types/systemConfig';
import { getReportText, normalizeReportLanguage } from '../utils/reportLanguage';

type MarketReviewNotice = {
  variant: 'success' | 'warning' | 'danger';
  title: string;
  message: string;
} | null;

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
    selectedHistoryIds,
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
    selectedIds,
    setQuery,
    clearError,
    loadInitialHistory,
    refreshHistory,
    loadMoreHistory,
    selectHistoryItem,
    toggleHistorySelection,
    toggleSelectAllVisible,
    deleteSelectedHistory,
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
    if (selectedStrategyId && !analysisSkills.some((skill) => skill.id === selectedStrategyId)) {
      setSelectedStrategyId('');
    }
  }, [analysisSkills, selectedStrategyId]);

  const reportLanguage = normalizeReportLanguage(selectedReport?.meta.reportLanguage);
  const reportText = getReportText(reportLanguage);
  const isMarketReviewHistoryReport = selectedReport?.meta.reportType === 'market_review';
  const isHistoryTrendUnavailable = !selectedReport || selectedReport.meta.reportType === 'market_review'
    || !selectedReport.meta.stockCode;

  useEffect(() => {
    if (!isHistoryTrendUnavailable || !isHistoryTrendOpen) {
      return;
    }
    closeHistoryTrend();
  }, [closeHistoryTrend, isHistoryTrendOpen, isHistoryTrendUnavailable]);

  const selectedStrategy = useMemo(
    () => analysisSkills.find((skill) => skill.id === selectedStrategyId),
    [analysisSkills, selectedStrategyId],
  );
  const selectedAnalysisSkills = useMemo(
    () => (selectedStrategyId ? [selectedStrategyId] : undefined),
    [selectedStrategyId],
  );
  const strategyOptions = useMemo(
    () => [
      { id: '', name: '默认策略', description: '沿用系统默认分析框架' },
      ...analysisSkills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
      })),
    ],
    [analysisSkills],
  );
  const closeStrategyMenu = useCallback((restoreFocus = false) => {
    setStrategyMenuOpen(false);
    if (restoreFocus) strategyButtonRef.current?.focus();
  }, []);
  const selectStrategy = useCallback((strategyId: string) => {
    setSelectedStrategyId(strategyId);
    setStrategyMenuOpen(false);
  }, []);
  const focusStrategyItem = useCallback((index: number) => {
    const itemCount = strategyOptions.length;
    if (itemCount === 0) return;
    const nextIndex = (index + itemCount) % itemCount;
    strategyItemRefs.current[nextIndex]?.focus();
  }, [strategyOptions.length]);
  const getSelectedStrategyIndex = useCallback(() => {
    const selectedIndex = strategyOptions.findIndex((option) => option.id === selectedStrategyId);
    return selectedIndex >= 0 ? selectedIndex : 0;
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
  const handleStrategyButtonKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const targetIndex = event.key === 'ArrowUp' ? strategyOptions.length - 1 : 0;
    if (strategyMenuOpen) {
      focusStrategyItem(targetIndex);
      return;
    }
    strategyInitialFocusIndexRef.current = targetIndex;
    setStrategyMenuOpen(true);
  }, [focusStrategyItem, strategyMenuOpen, strategyOptions.length]);
  const handleStrategyMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    const itemCount = strategyOptions.length;
    if (itemCount === 0) return;
    const currentIndex = strategyItemRefs.current.findIndex((item) => item === document.activeElement);
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        closeStrategyMenu(true);
        break;
      case 'ArrowDown':
        event.preventDefault();
        focusStrategyItem(currentIndex >= 0 ? currentIndex + 1 : 0);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusStrategyItem(currentIndex >= 0 ? currentIndex - 1 : itemCount - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusStrategyItem(0);
        break;
      case 'End':
        event.preventDefault();
        focusStrategyItem(itemCount - 1);
        break;
      case 'Tab':
        setStrategyMenuOpen(false);
        break;
      default:
        break;
    }
  }, [closeStrategyMenu, focusStrategyItem, strategyOptions.length]);
  const setupNeedsAction = setupStatus ? !setupStatus.isComplete : false;
  const setupMissingLabels = useMemo(() => {
    if (!setupStatus) return '';
    return setupStatus.checks
      .filter((check) => check.required && check.status === 'needs_action')
      .map((check) => check.title)
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
    if (selectedReport?.meta.id === undefined || selectedReport.meta.reportType === 'market_review') return;
    const code = selectedReport.meta.stockCode;
    const name = selectedReport.meta.stockName;
    const rid = selectedReport.meta.id;
    navigate(`/chat?stock=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}&recordId=${rid}`);
  }, [navigate, selectedReport]);

  const handleReanalyze = useCallback(() => {
    if (!selectedReport || selectedReport.meta.reportType === 'market_review') return;
    void submitAnalysis({
      stockCode: selectedReport.meta.stockCode,
      stockName: selectedReport.meta.stockName,
      originalQuery: selectedReport.meta.stockCode,
      selectionSource: 'manual',
      forceRefresh: true,
      skills: selectedAnalysisSkills,
    });
  }, [selectedAnalysisSkills, selectedReport, submitAnalysis]);

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
            const marketReviewText = typeof status.marketReviewReport === 'string'
              ? status.marketReviewReport
              : '';
            setMarketReviewReport(marketReviewText ? marketReviewText.trim() : null);
            setMarketReviewNotice({
              variant: 'success',
              title: '大盘复盘已完成',
              message: marketReviewText ? '大盘复盘任务已完成，结果如下：' : '大盘复盘任务已完成，结果已生成并按配置推送。',
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

  const handleDeleteSelectedHistory = useCallback(() => {
    void deleteSelectedHistory();
    setShowDeleteConfirm(false);
  }, [deleteSelectedHistory]);

  const handleHistoryItemClick = useCallback((recordId: number) => {
    void selectHistoryItem(recordId);
  }, [selectHistoryItem]);

  const sidebarContent = useMemo(
    () => (
      <div className="space-y-3">
        <TaskPanel tasks={activeTasks} />
        <HistoryList
          items={historyItems}
          isLoading={isLoadingHistory}
          isLoadingMore={isLoadingMore}
          hasMore={hasMore}
          selectedId={selectedReport?.meta.id}
          selectedIds={selectedIds}
          isDeleting={isDeletingHistory}
          onItemClick={handleHistoryItemClick}
          onLoadMore={() => void loadMoreHistory()}
          onToggleItemSelection={toggleHistorySelection}
          onToggleSelectAll={toggleSelectAllVisible}
          onDeleteSelected={() => setShowDeleteConfirm(true)}
        />
      </div>
    ),
    [
      activeTasks,
      hasMore,
      historyItems,
      isDeletingHistory,
      isLoadingHistory,
      isLoadingMore,
      handleHistoryItemClick,
      loadMoreHistory,
      selectedIds,
      selectedReport?.meta.id,
      toggleHistorySelection,
      toggleSelectAllVisible,
    ],
  );

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-subtle bg-elevated px-3 py-2.5">
        <h1 className="text-base font-bold text-foreground">每日个股分析</h1>
      </div>

      {/* Scrollable content */}
      <div
        ref={dashboardScrollRef}
        className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-3 touch-pan-y"
      >
        {/* Input section */}
        <div className="mb-3 space-y-2.5">
          <StockAutocomplete
            value={query}
            onChange={setQuery}
            onSubmit={(stockCode, stockName, selectionSource) => {
              handleSubmitAnalysis(stockCode, stockName, selectionSource);
            }}
            placeholder="输入股票代码或名称，如 600519、贵州茅台、AAPL"
            disabled={isAnalyzing}
            className={inputError ? 'border-danger/50' : undefined}
          />

          {/* Strategy + buttons row */}
          <div className="flex items-center gap-2">
            {analysisSkills.length > 0 ? (
              <div ref={strategyMenuRef} className="relative flex-1">
                <button
                  ref={strategyButtonRef}
                  id="mobile-strategy-menu-button"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={strategyMenuOpen}
                  aria-controls={strategyMenuOpen ? 'mobile-strategy-menu' : undefined}
                  onClick={() => setStrategyMenuOpen((open) => !open)}
                  onKeyDown={handleStrategyButtonKeyDown}
                  disabled={isAnalyzing}
                  className="flex h-11 w-full items-center gap-1.5 rounded-xl border border-subtle bg-surface px-3 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <SlidersHorizontal className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{selectedStrategy?.name || '策略'}</span>
                </button>
                {strategyMenuOpen ? (
                  <div
                    id="mobile-strategy-menu"
                    role="menu"
                    aria-labelledby="mobile-strategy-menu-button"
                    onKeyDown={handleStrategyMenuKeyDown}
                    className="absolute left-0 right-0 top-full z-[120] mt-1 max-h-72 overflow-y-auto rounded-xl border border-subtle bg-elevated p-1 shadow-2xl"
                  >
                    {strategyOptions.map((option, index) => {
                      const selected = selectedStrategyId === option.id;
                      return (
                        <button
                          key={option.id || 'default'}
                          ref={(node) => { strategyItemRefs.current[index] = node; }}
                          type="button"
                          role="menuitemradio"
                          aria-checked={selected}
                          tabIndex={-1}
                          onClick={() => selectStrategy(option.id)}
                          className="flex w-full items-start gap-2.5 rounded-lg px-3 py-3 text-left transition-colors hover:bg-hover"
                        >
                          <Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${selected ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block font-medium">{option.name}</span>
                            <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-text">{option.description}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex-1" />
            )}

            {/* Notify toggle */}
            <label className="flex h-11 min-w-[3.5rem] cursor-pointer items-center justify-center gap-1 rounded-xl border border-subtle bg-surface px-2 text-xs text-secondary-text select-none active:bg-hover">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-primary"
              />
              推送
            </label>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              isLoading={isSubmittingMarketReview}
              loadingText="提交中"
              onClick={() => void handleTriggerMarketReview()}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap"
            >
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              大盘复盘
            </Button>
            <button
              type="button"
              onClick={() => handleSubmitAnalysis()}
              disabled={!query || isAnalyzing}
              className="btn-primary flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap text-sm"
            >
              {isAnalyzing ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  分析中
                </>
              ) : '分析'}
            </button>
          </div>
        </div>

        {/* Error / alerts */}
        {inputError || duplicateError ? (
          <>
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
          </>
        ) : null}

        {setupNeedsAction ? (
          <div className="mb-2">
            <InlineAlert
              variant="warning"
              title="基础配置未完成"
              message={
                setupMissingLabels
                  ? `还缺少 ${setupMissingLabels}，完成后即可开始最小可用分析。`
                  : '还缺少基础配置，完成后即可开始最小可用分析。'
              }
              action={
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => navigate('/settings')}
                >
                  去配置
                </Button>
              }
              className="rounded-xl px-3 py-2 text-xs shadow-none"
            />
          </div>
        ) : null}

        {/* Market review notice */}
        {marketReviewNotice && (
          <div className="mb-2">
            <InlineAlert
              variant={marketReviewNotice.variant}
              title={marketReviewNotice.title}
              message={marketReviewNotice.message}
              className="rounded-xl px-3 py-2 text-xs shadow-none"
            />
          </div>
        )}

        {marketReviewError && (
          <div className="mb-2">
            <ApiErrorAlert error={marketReviewError} className="mb-1" onDismiss={() => setMarketReviewError(null)} />
          </div>
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

        {/* Report content */}
        {isLoadingReport ? (
          <div className="flex h-32 flex-col items-center justify-center">
            <DashboardStateBlock title="加载报告中..." loading />
          </div>
        ) : selectedReport ? (
          <div className="space-y-3 pb-4">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="rounded-lg p-2 text-secondary-text transition-colors hover:bg-hover hover:text-foreground"
                aria-label="历史记录"
              >
                <Clock className="h-5 w-5" />
              </button>
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
                className={isHistoryTrendOpen ? 'border-primary/70 bg-primary/15 text-primary shadow-glow-cyan' : undefined}
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
            {isHistoryTrendOpen ? (
              <StockHistoryTrendDrawer
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
              icon={(
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              )}
            />
          </div>
        )}

      </div>

      {/* History sidebar drawer */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-40" onClick={() => setSidebarOpen(false)}>
          <div className="page-drawer-overlay absolute inset-0" />
          <div
            className="dashboard-card absolute bottom-0 left-0 top-0 flex w-72 flex-col overflow-hidden !rounded-none !rounded-r-xl p-3 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {sidebarContent}
          </div>
        </div>
      ) : null}

      {/* Markdown drawer */}
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

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="删除历史记录"
        message={
          selectedHistoryIds.length === 1
            ? '确认删除这条历史记录吗？删除后将不可恢复。'
            : `确认删除选中的 ${selectedHistoryIds.length} 条历史记录吗？删除后将不可恢复。`
        }
        confirmText={isDeletingHistory ? '删除中...' : '确认删除'}
        cancelText="取消"
        isDanger={true}
        onConfirm={handleDeleteSelectedHistory}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
};

export default MobileHomePage;
