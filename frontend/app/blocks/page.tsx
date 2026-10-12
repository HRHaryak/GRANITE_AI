"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowDownAZ,
  ArrowUpRight,
  Boxes,
  CalendarDays,
  Check,
  CheckCircle2,
  CheckSquare2,
  ChevronDown,
  CircleDot,
  Clock3,
  Filter,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";
import {
  listBlocks,
  listDemoUsers,
} from "../../lib/api";
import {
  useTranslation,
} from "../../lib/i18n";
import {
  getSelectedUserId,
} from "../../lib/storage";
import type {
  BlockOut,
  DemoUser,
} from "../../lib/types";

type FilterType =
  | "ALL"
  | "ANALYZED"
  | "PROCESSING"
  | "FAILED";

type SortType =
  | "NEWEST"
  | "OLDEST"
  | "CODE_ASC"
  | "CODE_DESC";

const FILTERS: FilterType[] = [
  "ALL",
  "ANALYZED",
  "PROCESSING",
  "FAILED",
];

function normalize(
  value: unknown,
) {
  return typeof value ===
    "string"
    ? value
        .trim()
        .toUpperCase()
    : "";
}

function isAnalyzed(
  status: string,
) {
  return [
    "ANALYZED",
    "VERIFIED",
    "COMPLETED",
  ].includes(
    normalize(status),
  );
}

function isProcessing(
  status: string,
) {
  return [
    "READY_FOR_ANALYSIS",
    "ANALYZING",
    "CAPTURE_IN_PROGRESS",
    "PROCESSING",
    "QUEUED",
    "RUNNING",
  ].includes(
    normalize(status),
  );
}

function isFailed(
  status: string,
) {
  return [
    "ANALYSIS_FAILED",
    "FAILED",
    "ERROR",
  ].includes(
    normalize(status),
  );
}

function safeDate(
  value: unknown,
) {
  if (
    typeof value !==
      "string" ||
    !value.trim()
  ) {
    return null;
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date;
}

async function deleteBlockAsSelectedAdmin(
  id: string,
): Promise<void> {
  const selectedUserId =
    getSelectedUserId();

  if (!selectedUserId) {
    throw new Error(
      "No selected administrator session was found.",
    );
  }

  const apiUrl = (
    process.env
      .NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:8000"
  ).replace(/\/$/, "");

  const response =
    await fetch(
      `${apiUrl}/api/v1/granite-blocks/${encodeURIComponent(
        id,
      )}`,
      {
        method: "DELETE",
        headers: {
          "x-selected-user-id":
            selectedUserId,
        },
        cache: "no-store",
      },
    );

  if (!response.ok) {
    const raw =
      await response
        .text()
        .catch(() => "");

    let detail = raw;

    try {
      const parsed =
        raw
          ? (JSON.parse(
              raw,
            ) as {
              detail?: unknown;
            })
          : {};

      if (
        typeof parsed.detail ===
        "string"
      ) {
        detail =
          parsed.detail;
      }
    } catch {
      // Keep plain backend text.
    }

    throw new Error(
      detail ||
        `Delete failed with HTTP ${response.status}`,
    );
  }
}

export default function BlocksPage() {
  const {
    t,
    language,
  } = useTranslation();

  const isTe =
    language === "te";

  const [
    blocks,
    setBlocks,
  ] = useState<
    BlockOut[] | null
  >(null);

  const [
    query,
    setQuery,
  ] = useState("");

  const [
    filter,
    setFilter,
  ] = useState<FilterType>(
    "ALL",
  );

  const [
    sort,
    setSort,
  ] = useState<SortType>(
    "NEWEST",
  );

  const [
    error,
    setError,
  ] = useState<
    string | null
  >(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    selectedUser,
    setSelectedUser,
  ] = useState<
    DemoUser | null
  >(null);

  const [
    selectionMode,
    setSelectionMode,
  ] = useState(false);

  const [
    selectedIds,
    setSelectedIds,
  ] = useState<
    Set<string>
  >(() => new Set());

  const [
    showDeleteConfirm,
    setShowDeleteConfirm,
  ] = useState(false);

  const [
    deleting,
    setDeleting,
  ] = useState(false);

  const [
    deleteProgress,
    setDeleteProgress,
  ] = useState({
    done: 0,
    total: 0,
  });

  const [
    deleteError,
    setDeleteError,
  ] = useState<
    string | null
  >(null);

  const isAdmin =
    normalize(
      selectedUser?.role,
    ) === "ADMIN";

  const loadBlocks =
    useCallback(
      async () => {
        setLoading(true);
        setError(null);

        try {
          const result =
            await listBlocks();

          setBlocks(
            Array.isArray(
              result,
            )
              ? result
              : [],
          );
        } catch (cause) {
          setBlocks(null);

          setError(
            cause instanceof Error
              ? cause.message
              : String(cause),
          );
        } finally {
          setLoading(false);
        }
      },
      [],
    );

  useEffect(() => {
    void loadBlocks();
  }, [loadBlocks]);

  useEffect(() => {
    let cancelled =
      false;

    async function resolveSelectedUser() {
      const selectedUserId =
        getSelectedUserId();

      if (
        !selectedUserId
      ) {
        if (!cancelled) {
          setSelectedUser(
            null,
          );
        }

        return;
      }

      try {
        const users =
          await listDemoUsers();

        const matched =
          Array.isArray(users)
            ? users.find(
                (user) =>
                  user.id ===
                  selectedUserId,
              ) ?? null
            : null;

        if (!cancelled) {
          setSelectedUser(
            matched,
          );
        }
      } catch {
        if (!cancelled) {
          setSelectedUser(
            null,
          );
        }
      }
    }

    void resolveSelectedUser();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key ===
          "Escape" &&
        selectionMode &&
        !deleting
      ) {
        setSelectionMode(
          false,
        );
        setSelectedIds(
          new Set(),
        );
      }
    };

    window.addEventListener(
      "keydown",
      onKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        onKeyDown,
      );
    };
  }, [
    selectionMode,
    deleting,
  ]);

  const counts =
    useMemo(() => {
      const source =
        blocks ?? [];

      return {
        ALL:
          source.length,
        ANALYZED:
          source.filter(
            (block) =>
              isAnalyzed(
                block.status,
              ),
          ).length,
        PROCESSING:
          source.filter(
            (block) =>
              isProcessing(
                block.status,
              ),
          ).length,
        FAILED:
          source.filter(
            (block) =>
              isFailed(
                block.status,
              ),
          ).length,
      };
    }, [blocks]);

  const visible =
    useMemo(() => {
      if (!blocks) {
        return [];
      }

      const needle =
        query
          .trim()
          .toLowerCase();

      const filtered =
        blocks.filter(
          (block) => {
            const searchable =
              [
                block.block_code,
                block.quarry_id,
                block.status,
              ]
                .filter(
                  (
                    value,
                  ): value is string =>
                    typeof value ===
                    "string",
                )
                .join(" ")
                .toLowerCase();

            if (
              needle &&
              !searchable.includes(
                needle,
              )
            ) {
              return false;
            }

            if (
              filter ===
              "ANALYZED"
            ) {
              return isAnalyzed(
                block.status,
              );
            }

            if (
              filter ===
              "PROCESSING"
            ) {
              return isProcessing(
                block.status,
              );
            }

            if (
              filter ===
              "FAILED"
            ) {
              return isFailed(
                block.status,
              );
            }

            return true;
          },
        );

      return [
        ...filtered,
      ].sort((a, b) => {
        const aDate =
          safeDate(
            a.capture_date,
          )?.getTime() ??
          0;

        const bDate =
          safeDate(
            b.capture_date,
          )?.getTime() ??
          0;

        if (
          sort ===
          "OLDEST"
        ) {
          return (
            aDate - bDate
          );
        }

        if (
          sort ===
          "CODE_ASC"
        ) {
          return (
            a.block_code ||
            ""
          ).localeCompare(
            b.block_code ||
              "",
          );
        }

        if (
          sort ===
          "CODE_DESC"
        ) {
          return (
            b.block_code ||
            ""
          ).localeCompare(
            a.block_code ||
              "",
          );
        }

        return (
          bDate - aDate
        );
      });
    }, [
      blocks,
      filter,
      query,
      sort,
    ]);

  useEffect(() => {
    if (!blocks) {
      return;
    }

    const validIds =
      new Set(
        blocks.map(
          (block) =>
            block.id,
        ),
      );

    setSelectedIds(
      (current) => {
        const next =
          new Set(
            [
              ...current,
            ].filter(
              (id) =>
                validIds.has(
                  id,
                ),
            ),
          );

        return next.size ===
          current.size
          ? current
          : next;
      },
    );
  }, [blocks]);

  const visibleIds =
    useMemo(
      () =>
        visible.map(
          (block) =>
            block.id,
        ),
      [visible],
    );

  const selectedVisibleCount =
    visibleIds.filter(
      (id) =>
        selectedIds.has(
          id,
        ),
    ).length;

  const allVisibleSelected =
    visibleIds.length > 0 &&
    selectedVisibleCount ===
      visibleIds.length;

  const selectedCount =
    selectedIds.size;

  function toggleOne(
    id: string,
  ) {
    if (
      !isAdmin ||
      deleting ||
      !selectionMode
    ) {
      return;
    }

    setSelectedIds(
      (current) => {
        const next =
          new Set(
            current,
          );

        if (
          next.has(id)
        ) {
          next.delete(id);
        } else {
          next.add(id);
        }

        return next;
      },
    );
  }

  function toggleSelectAllVisible() {
    if (
      !isAdmin ||
      deleting ||
      visibleIds.length ===
        0
    ) {
      return;
    }

    setSelectedIds(
      (current) => {
        const next =
          new Set(
            current,
          );

        if (
          allVisibleSelected
        ) {
          visibleIds.forEach(
            (id) =>
              next.delete(
                id,
              ),
          );
        } else {
          visibleIds.forEach(
            (id) =>
              next.add(id),
          );
        }

        return next;
      },
    );
  }

  function enterSelectionMode() {
    if (
      !isAdmin ||
      deleting
    ) {
      return;
    }

    setSelectionMode(
      true,
    );
    setDeleteError(
      null,
    );
  }

  function exitSelectionMode() {
    if (deleting) {
      return;
    }

    setSelectionMode(
      false,
    );
    setSelectedIds(
      new Set(),
    );
    setDeleteError(
      null,
    );
  }

  function clearSelection() {
    if (deleting) {
      return;
    }

    setSelectedIds(
      new Set(),
    );
  }

  async function deleteSelectedBlocks() {
    if (
      !isAdmin ||
      deleting ||
      selectedIds.size ===
        0
    ) {
      return;
    }

    const ids = [
      ...selectedIds,
    ];

    setDeleting(true);
    setDeleteError(
      null,
    );
    setDeleteProgress({
      done: 0,
      total: ids.length,
    });

    const failedIds: string[] =
      [];

    const failedMessages: string[] =
      [];

    for (
      let index = 0;
      index <
      ids.length;
      index += 1
    ) {
      const id =
        ids[index];

      try {
        await deleteBlockAsSelectedAdmin(
          id,
        );
      } catch (cause) {
        failedIds.push(
          id,
        );

        failedMessages.push(
          cause instanceof Error
            ? cause.message
            : String(cause),
        );
      } finally {
        setDeleteProgress({
          done:
            index + 1,
          total:
            ids.length,
        });
      }
    }

    setSelectedIds(
      new Set(
        failedIds,
      ),
    );

    setShowDeleteConfirm(
      false,
    );

    setDeleting(false);

    await loadBlocks();

    if (
      failedIds.length ===
      0
    ) {
      setSelectionMode(
        false,
      );
    } else {
      setDeleteError(
        isTe
          ? `${
              ids.length -
              failedIds.length
            } బ్లాక్‌లు తొలగించబడ్డాయి. ${failedIds.length} బ్లాక్‌లు తొలగించలేకపోయాం. ${
              failedMessages[0] ||
              ""
            }`
          : `${
              ids.length -
              failedIds.length
            } block(s) deleted. ${failedIds.length} block(s) could not be deleted. ${
              failedMessages[0] ||
              ""
            }`,
      );
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f5fbfa] text-slate-900 dark:bg-[#0d2428] dark:text-slate-100">
      <BlocksBackground />

      <div className="relative mx-auto w-full max-w-[1720px] px-3 pb-28 pt-4 sm:px-5 lg:px-6">
        <motion.header
          initial={{
            opacity: 0,
            y: -8,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.45,
            ease: [
              0.16,
              1,
              0.3,
              1,
            ],
          }}
          className="relative overflow-hidden rounded-[28px] border border-teal-200/80 bg-white/90 p-4 shadow-[0_22px_65px_rgba(15,23,42,.07)] backdrop-blur-2xl dark:border-teal-300/15 dark:bg-[#123238]/94 sm:p-5"
        >
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400" />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_460px] xl:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50 px-2.5 py-1 text-[6px] font-black uppercase tracking-[0.13em] text-teal-700 dark:border-teal-300/15 dark:bg-teal-300/[0.05] dark:text-teal-200">
                  <Boxes size={9} />
                  GRANITE BLOCK REGISTER
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[6px] font-black uppercase tracking-[0.12em] text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05] dark:text-emerald-200">
                  <ShieldCheck size={9} />
                  BACKEND RECORDS
                </span>
              </div>

              <h1 className="mt-3 text-[31px] font-black leading-[1.02] tracking-[-0.055em] text-slate-950 sm:text-[40px] dark:text-white">
                {isTe
                  ? "గ్రానైట్ బ్లాక్ ఇంటెలిజెన్స్"
                  : "Granite Block Intelligence"}
              </h1>

              <p className="mt-2 max-w-3xl text-[10px] leading-5 text-slate-500 dark:text-slate-400">
                {isTe
                  ? "క్యాప్చర్ చేసిన ప్రతి బ్లాక్‌ను శోధించండి, ఫిల్టర్ చేయండి మరియు దాని విశ్లేషణ రికార్డును తెరవండి."
                  : "Search every captured granite record, review its current analysis state, and open only the block you want to inspect."}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  href="/capture"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] bg-teal-600 px-4 text-[7px] font-black uppercase tracking-[0.1em] text-white shadow-[0_10px_24px_rgba(13,148,136,.20)] transition hover:-translate-y-0.5 hover:bg-teal-700"
                >
                  <Plus size={13} />
                  {isTe
                    ? "కొత్త విశ్లేషణ"
                    : "New Analysis"}
                </Link>

                <button
                  type="button"
                  onClick={() =>
                    void loadBlocks()
                  }
                  disabled={
                    loading ||
                    deleting
                  }
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] border border-slate-200 bg-slate-50 px-4 text-[7px] font-black uppercase tracking-[0.1em] text-slate-600 transition hover:border-teal-200/80 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-40 dark:border-slate-600/30 dark:bg-slate-700/15 dark:text-slate-300"
                >
                  <RefreshCw
                    size={12}
                    className={
                      loading
                        ? "animate-spin"
                        : ""
                    }
                  />
                  {isTe
                    ? "రిఫ్రెష్"
                    : "Refresh"}
                </button>

                {isAdmin ? (
                  <button
                    type="button"
                    onClick={
                      selectionMode
                        ? exitSelectionMode
                        : enterSelectionMode
                    }
                    disabled={
                      deleting
                    }
                    className={[
                      "inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] border px-4 text-[7px] font-black uppercase tracking-[0.1em] transition disabled:opacity-40",
                      selectionMode
                        ? "border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-300/20 dark:bg-cyan-300/[0.06] dark:text-teal-200"
                        : "border-slate-200 bg-white text-slate-600 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-600/30 dark:bg-slate-700/15 dark:text-slate-300",
                    ].join(" ")}
                  >
                    {selectionMode ? (
                      <X size={12} />
                    ) : (
                      <CheckSquare2 size={12} />
                    )}

                    {selectionMode
                      ? isTe
                        ? "ఎంపిక ముగించండి"
                        : "Done Selecting"
                      : isTe
                        ? "బ్లాక్‌లను ఎంచుకోండి"
                        : "Select Blocks"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
              <RegisterMetric
                label={
                  isTe
                    ? "మొత్తం"
                    : "Total"
                }
                value={
                  loading
                    ? null
                    : counts.ALL
                }
                icon={
                  <Boxes size={13} />
                }
                tone="sky"
              />

              <RegisterMetric
                label={
                  isTe
                    ? "పూర్తి"
                    : "Analyzed"
                }
                value={
                  loading
                    ? null
                    : counts.ANALYZED
                }
                icon={
                  <CheckCircle2 size={13} />
                }
                tone="good"
              />

              <RegisterMetric
                label={
                  isTe
                    ? "ప్రాసెసింగ్"
                    : "Processing"
                }
                value={
                  loading
                    ? null
                    : counts.PROCESSING
                }
                icon={
                  <Activity size={13} />
                }
                tone="amber"
              />

              <RegisterMetric
                label={
                  isTe
                    ? "శ్రద్ధ"
                    : "Attention"
                }
                value={
                  loading
                    ? null
                    : counts.FAILED
                }
                icon={
                  <AlertTriangle size={13} />
                }
                tone={
                  counts.FAILED >
                  0
                    ? "rose"
                    : "neutral"
                }
              />
            </div>
          </div>
        </motion.header>

        <section className="sticky top-3 z-30 mt-4 rounded-[20px] border border-slate-200/90 bg-white/90 p-3 shadow-[0_14px_36px_rgba(15,23,42,.06)] backdrop-blur-xl dark:border-slate-600/30 dark:bg-[#182a42]/90">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                size={13}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                value={
                  query
                }
                onChange={(
                  event,
                ) =>
                  setQuery(
                    event
                      .target
                      .value,
                  )
                }
                placeholder={
                  isTe
                    ? "బ్లాక్ కోడ్, క్వారీ లేదా స్టేటస్ వెతకండి..."
                    : "Search block code, quarry or status..."
                }
                className="h-10 w-full rounded-[12px] border border-slate-200 bg-slate-50 pl-9 pr-3 text-[8px] font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:ring-4 focus:ring-cyan-100/60 dark:border-slate-600/30 dark:bg-slate-700/15 dark:text-slate-200 dark:focus:border-teal-300/20 dark:focus:ring-teal-300/[0.05]"
              />
            </div>

            <div className="flex min-w-0 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {FILTERS.map(
                (item) => {
                  const active =
                    filter ===
                    item;

                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() =>
                        setFilter(
                          item,
                        )
                      }
                      className={[
                        "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-[12px] border px-3 text-[6.5px] font-black uppercase tracking-[0.08em] transition",
                        active
                          ? "border-teal-300 bg-teal-50 text-teal-700 shadow-sm dark:border-teal-300/20 dark:bg-cyan-300/[0.06] dark:text-teal-200"
                          : "border-slate-200 bg-white text-slate-400 hover:border-teal-200/80 hover:text-teal-700 dark:border-slate-600/30 dark:bg-slate-700/12 dark:text-slate-500",
                      ].join(" ")}
                    >
                      <Filter
                        size={10}
                      />
                      {item}
                      <span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[5px] dark:bg-slate-700/20">
                        {
                          counts[
                            item
                          ]
                        }
                      </span>
                    </button>
                  );
                },
              )}
            </div>

            <div className="relative shrink-0">
              <ArrowDownAZ
                size={12}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <select
                value={sort}
                onChange={(
                  event,
                ) =>
                  setSort(
                    event
                      .target
                      .value as SortType,
                  )
                }
                className="h-10 appearance-none rounded-[12px] border border-slate-200 bg-white pl-9 pr-8 text-[6.5px] font-black uppercase tracking-[0.08em] text-slate-500 outline-none transition hover:border-teal-200/80 focus:border-teal-300 dark:border-slate-600/30 dark:bg-slate-700/12 dark:text-slate-400"
              >
                <option value="NEWEST">
                  Newest
                </option>
                <option value="OLDEST">
                  Oldest
                </option>
                <option value="CODE_ASC">
                  Code A-Z
                </option>
                <option value="CODE_DESC">
                  Code Z-A
                </option>
              </select>

              <ChevronDown
                size={11}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
            </div>
          </div>

          <AnimatePresence>
            {selectionMode &&
            isAdmin ? (
              <motion.div
                initial={{
                  opacity: 0,
                  height: 0,
                }}
                animate={{
                  opacity: 1,
                  height: "auto",
                }}
                exit={{
                  opacity: 0,
                  height: 0,
                }}
                className="overflow-hidden"
              >
                <div className="mt-3 flex flex-col gap-2 border-t border-slate-200/80 pt-3 dark:border-slate-600/30 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-[6px] font-black uppercase tracking-[0.09em] text-teal-700 dark:border-teal-300/15 dark:bg-cyan-300/[0.05] dark:text-teal-200">
                      <CheckSquare2 size={10} />
                      {selectedCount} SELECTED
                    </span>

                    <button
                      type="button"
                      onClick={
                        toggleSelectAllVisible
                      }
                      disabled={
                        visibleIds.length ===
                          0 ||
                        deleting
                      }
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-2.5 text-[6px] font-black uppercase tracking-[0.08em] text-slate-500 transition hover:border-teal-200/80 hover:text-teal-700 disabled:opacity-35 dark:border-slate-600/30 dark:bg-slate-700/12 dark:text-slate-400"
                    >
                      {allVisibleSelected ? (
                        <CheckSquare2 size={10} />
                      ) : (
                        <Square size={10} />
                      )}

                      {allVisibleSelected
                        ? "Unselect visible"
                        : "Select visible"}
                    </button>

                    {selectedCount >
                    0 ? (
                      <button
                        type="button"
                        onClick={
                          clearSelection
                        }
                        disabled={
                          deleting
                        }
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-[10px] px-2.5 text-[6px] font-black uppercase tracking-[0.08em] text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-35 dark:hover:bg-slate-700/20 dark:hover:text-slate-200"
                      >
                        <X size={10} />
                        Clear
                      </button>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setShowDeleteConfirm(
                        true,
                      )
                    }
                    disabled={
                      selectedCount ===
                        0 ||
                      deleting
                    }
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[11px] bg-rose-600 px-3 text-[6px] font-black uppercase tracking-[0.09em] text-white shadow-[0_8px_20px_rgba(225,29,72,.16)] transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Trash2 size={11} />
                    Delete selected
                  </button>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>

        {deleteError ? (
          <div className="mt-3 flex items-start gap-3 rounded-[15px] border border-rose-200 bg-rose-50 px-3 py-3 text-[8px] text-rose-700 dark:border-rose-300/15 dark:bg-rose-300/[0.05] dark:text-rose-200">
            <AlertTriangle
              size={13}
              className="mt-0.5 shrink-0"
            />
            <span>
              {
                deleteError
              }
            </span>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 flex flex-col gap-3 rounded-[18px] border border-rose-200 bg-rose-50/88 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-rose-300/15 dark:bg-rose-300/[0.05]">
            <div className="flex gap-3">
              <AlertTriangle
                size={17}
                className="mt-0.5 shrink-0 text-rose-600"
              />

              <div>
                <p className="text-[9px] font-black text-slate-800 dark:text-slate-100">
                  {isTe
                    ? "బ్లాక్‌లను లోడ్ చేయలేకపోయాం"
                    : "Unable to load blocks"}
                </p>

                <p className="mt-1 break-words text-[7px] leading-4 text-rose-600">
                  {error}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                void loadBlocks()
              }
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[11px] border border-rose-200 bg-white px-3 text-[6px] font-black uppercase tracking-[0.08em] text-rose-700 dark:border-rose-300/15 dark:bg-slate-700/15 dark:text-rose-200"
            >
              <RefreshCw size={11} />
              {isTe
                ? "మళ్లీ ప్రయత్నించండి"
                : "Retry"}
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {[
              0,
              1,
              2,
              3,
              4,
              5,
            ].map(
              (item) => (
                <div
                  key={item}
                  className="h-[168px] animate-pulse rounded-[20px] border border-slate-200 bg-white/80 dark:border-slate-600/30 dark:bg-slate-700/15"
                />
              ),
            )}
          </div>
        ) : null}

        {!loading &&
        blocks &&
        blocks.length ===
          0 ? (
          <div className="mt-6">
            <EmptyState
              title={t(
                "no_blocks_found",
              )}
              subtitle={t(
                "no_blocks_found_sub",
              )}
            />
          </div>
        ) : null}

        {!loading &&
        blocks &&
        blocks.length > 0 &&
        visible.length ===
          0 ? (
          <div className="mt-6">
            <EmptyState
              title={t(
                "no_match_blocks",
              )}
              subtitle={t(
                "no_match_blocks_sub",
              )}
            />
          </div>
        ) : null}

        {!loading &&
        visible.length > 0 ? (
          <>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 px-1">
              <div>
                <p className="text-[6px] font-black uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  BLOCK RECORDS
                </p>

                <p className="mt-0.5 text-[7px] font-semibold text-slate-500 dark:text-slate-400">
                  Showing{" "}
                  <strong className="font-black text-slate-700 dark:text-slate-200">
                    {
                      visible.length
                    }
                  </strong>{" "}
                  of{" "}
                  <strong className="font-black text-slate-700 dark:text-slate-200">
                    {
                      blocks?.length ??
                      0
                    }
                  </strong>
                </p>
              </div>

              {selectionMode ? (
                <span className="text-[5.5px] font-black uppercase tracking-[0.09em] text-teal-600 dark:text-teal-300">
                  SELECTION MODE · CHECKBOXES VISIBLE
                </span>
              ) : (
                <span className="text-[5.5px] font-black uppercase tracking-[0.09em] text-slate-400 dark:text-slate-500">
                  OPEN A CARD TO INSPECT ANALYSIS
                </span>
              )}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {visible.map(
                (
                  block,
                  index,
                ) => {
                  const captureDate =
                    safeDate(
                      block.capture_date,
                    );

                  const quarryReference =
                    typeof block.quarry_id ===
                      "string" &&
                    block.quarry_id
                      ? block.quarry_id.slice(
                          0,
                          8,
                        )
                      : null;

                  const selected =
                    selectedIds.has(
                      block.id,
                    );

                  const analyzed =
                    isAnalyzed(
                      block.status,
                    );

                  const processing =
                    isProcessing(
                      block.status,
                    );

                  const failed =
                    isFailed(
                      block.status,
                    );

                  return (
                    <motion.article
                      key={
                        block.id
                      }
                      initial={{
                        opacity: 0,
                        y: 8,
                      }}
                      animate={{
                        opacity: 1,
                        y: 0,
                      }}
                      transition={{
                        duration: 0.34,
                        delay:
                          Math.min(
                            index *
                              0.025,
                            0.2,
                          ),
                      }}
                      whileHover={
                        selectionMode
                          ? undefined
                          : {
                              y: -3,
                            }
                      }
                      className={[
                        "group relative overflow-hidden rounded-[20px] border bg-white/90 shadow-[0_12px_34px_rgba(15,23,42,.055)] transition duration-300 dark:bg-[#182a42]/90",
                        selected
                          ? "border-teal-400 shadow-[0_16px_40px_rgba(20,184,166,.14)] ring-2 ring-teal-200/70 dark:border-teal-300/40 dark:ring-teal-300/[0.08]"
                          : failed
                            ? "border-rose-200/90 dark:border-rose-300/15"
                            : processing
                              ? "border-amber-200/90 dark:border-amber-300/15"
                              : analyzed
                                ? "border-emerald-200/85 dark:border-emerald-300/15"
                                : "border-slate-200/90 hover:border-teal-200/80 dark:border-slate-600/30 dark:hover:border-teal-300/15",
                      ].join(
                        " ",
                      )}
                    >
                      <div
                        className={[
                          "absolute inset-x-0 top-0 h-[2px]",
                          selected
                            ? "bg-gradient-to-r from-teal-500 via-cyan-400 to-emerald-400"
                            : analyzed
                              ? "bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-300"
                              : processing
                                ? "bg-gradient-to-r from-amber-400 via-orange-300 to-teal-300"
                                : failed
                                  ? "bg-gradient-to-r from-rose-500 via-orange-400 to-amber-300"
                                  : "bg-gradient-to-r from-slate-200 via-teal-200 to-transparent dark:from-slate-600/30 dark:via-teal-300/10",
                        ].join(
                          " ",
                        )}
                      />

                      {selectionMode &&
                      isAdmin ? (
                        <button
                          type="button"
                          onClick={() =>
                            toggleOne(
                              block.id,
                            )
                          }
                          disabled={
                            deleting
                          }
                          aria-label={`${isTe ? "బ్లాక్ ఎంచుకోండి" : "Select block"} ${
                            block.block_code ||
                            block.id
                          }`}
                          className={[
                            "absolute left-3 top-3 z-20 grid h-8 w-8 place-items-center rounded-[10px] border shadow-sm backdrop-blur transition",
                            selected
                              ? "border-teal-400 bg-teal-500 text-white"
                              : "border-slate-200 bg-white/92 text-slate-300 hover:border-teal-300 hover:text-teal-600 dark:border-slate-600/30 dark:bg-[#203653]/92 dark:text-slate-500",
                          ].join(
                            " ",
                          )}
                        >
                          {selected ? (
                            <Check
                              size={13}
                            />
                          ) : (
                            <Square
                              size={13}
                            />
                          )}
                        </button>
                      ) : null}

                      {selectionMode ? (
                        <button
                          type="button"
                          onClick={() =>
                            toggleOne(
                              block.id,
                            )
                          }
                          disabled={
                            !isAdmin ||
                            deleting
                          }
                          className="block w-full p-4 text-left sm:p-4.5"
                        >
                          <BlockCardContent
                            block={
                              block
                            }
                            captureDate={
                              captureDate
                            }
                            quarryReference={
                              quarryReference
                            }
                            isTe={
                              isTe
                            }
                            t={t}
                            selectionMode={
                              true
                            }
                            selected={
                              selected
                            }
                          />
                        </button>
                      ) : (
                        <Link
                          href={`/blocks/${block.id}`}
                          className="block p-4 outline-none transition focus-visible:ring-2 focus-visible:ring-teal-300/50 sm:p-4.5"
                        >
                          <BlockCardContent
                            block={
                              block
                            }
                            captureDate={
                              captureDate
                            }
                            quarryReference={
                              quarryReference
                            }
                            isTe={
                              isTe
                            }
                            t={t}
                            selectionMode={
                              false
                            }
                            selected={
                              false
                            }
                          />
                        </Link>
                      )}
                    </motion.article>
                  );
                },
              )}
            </div>
          </>
        ) : null}
      </div>

      <AnimatePresence>
        {showDeleteConfirm &&
        isAdmin ? (
          <motion.div
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            exit={{
              opacity: 0,
            }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-blocks-title"
          >
            <motion.div
              initial={{
                opacity: 0,
                scale: 0.97,
                y: 12,
              }}
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
              }}
              exit={{
                opacity: 0,
                scale: 0.97,
                y: 12,
              }}
              className="w-full max-w-md rounded-[24px] border border-rose-200 bg-white p-5 shadow-[0_30px_90px_rgba(15,23,42,.22)] dark:border-rose-300/15 dark:bg-[#182a42] sm:p-6"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[13px] bg-rose-50 text-rose-600 dark:bg-rose-300/[0.06] dark:text-rose-300">
                  <Trash2
                    size={19}
                  />
                </span>

                <div>
                  <h3
                    id="delete-blocks-title"
                    className="text-[17px] font-black tracking-[-0.03em] text-slate-900 dark:text-white"
                  >
                    {isTe
                      ? `${selectedCount} బ్లాక్‌లను తొలగించాలా?`
                      : `Delete ${selectedCount} selected block${
                          selectedCount ===
                          1
                            ? ""
                            : "s"
                        }?`}
                  </h3>

                  <p className="mt-2 text-[8px] leading-4 text-slate-500 dark:text-slate-400">
                    {isTe
                      ? "ఇది శాశ్వత చర్య. ఈ బ్లాక్‌లకు సంబంధించిన క్యాప్చర్, ఫోటోలు, విశ్లేషణ మరియు ఫలితాలు కూడా బ్యాక్‌ఎండ్ నియమాల ప్రకారం తొలగించబడవచ్చు."
                      : "This is permanent. Capture data, photos, analyses and related results may also be removed according to the backend delete rules."}
                  </p>
                </div>
              </div>

              {deleting &&
              deleteProgress.total >
                0 ? (
                <div className="mt-5 rounded-[13px] border border-slate-200 bg-slate-50 p-3 dark:border-slate-600/30 dark:bg-slate-700/15">
                  <div className="flex items-center justify-between text-[6px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">
                    <span>
                      {isTe
                        ? "తొలగిస్తోంది"
                        : "Deleting"}
                    </span>

                    <span>
                      {
                        deleteProgress.done
                      }
                      /
                      {
                        deleteProgress.total
                      }
                    </span>
                  </div>

                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600/30">
                    <div
                      className="h-full rounded-full bg-rose-600 transition-all duration-300"
                      style={{
                        width: `${
                          deleteProgress.total
                            ? (deleteProgress.done /
                                deleteProgress.total) *
                              100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() =>
                    setShowDeleteConfirm(
                      false,
                    )
                  }
                  disabled={
                    deleting
                  }
                  className="inline-flex min-h-10 items-center justify-center rounded-[12px] border border-slate-200 bg-white px-4 text-[7px] font-black uppercase tracking-[0.08em] text-slate-600 disabled:opacity-40 dark:border-slate-600/30 dark:bg-slate-700/15 dark:text-slate-300"
                >
                  {isTe
                    ? "రద్దు"
                    : "Cancel"}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    void deleteSelectedBlocks()
                  }
                  disabled={
                    deleting ||
                    selectedCount ===
                      0
                  }
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-rose-600 px-4 text-[7px] font-black uppercase tracking-[0.08em] text-white transition hover:bg-rose-700 disabled:opacity-40"
                >
                  <Trash2
                    size={12}
                  />

                  {deleting
                    ? isTe
                      ? "తొలగిస్తోంది..."
                      : "Deleting..."
                    : isTe
                      ? "అవును, తొలగించండి"
                      : "Delete permanently"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function BlockCardContent({
  block,
  captureDate,
  quarryReference,
  isTe,
  t,
  selectionMode,
  selected,
}: {
  block: BlockOut;
  captureDate: Date | null;
  quarryReference: string | null;
  isTe: boolean;
  t: ReturnType<
    typeof useTranslation
  >["t"];
  selectionMode: boolean;
  selected: boolean;
}) {
  const analyzed =
    isAnalyzed(
      block.status,
    );

  const processing =
    isProcessing(
      block.status,
    );

  const failed =
    isFailed(
      block.status,
    );

  const stateCopy =
    analyzed
      ? isTe
        ? "విశ్లేషణ అందుబాటులో ఉంది"
        : "Analysis available"
      : processing
        ? isTe
          ? "విశ్లేషణ కొనసాగుతోంది"
          : "Analysis in progress"
        : failed
          ? isTe
            ? "శ్రద్ధ అవసరం"
            : "Needs attention"
          : isTe
            ? "క్యాప్చర్ రికార్డు"
            : "Capture record";

  return (
    <div
      className={
        selectionMode
          ? "pl-9"
          : ""
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={[
              "relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[13px] border",
              analyzed
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05] dark:text-emerald-200"
                : processing
                  ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-300/15 dark:bg-amber-300/[0.05] dark:text-amber-200"
                  : failed
                    ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-300/15 dark:bg-rose-300/[0.05] dark:text-rose-200"
                    : "border-teal-200/80 bg-teal-50 text-teal-700 dark:border-teal-300/15 dark:bg-teal-300/[0.05] dark:text-teal-200",
            ].join(
              " ",
            )}
          >
            <Layers3
              size={17}
            />

            {processing ? (
              <motion.span
                animate={{
                  rotate: 360,
                }}
                transition={{
                  duration: 2.8,
                  repeat:
                    Infinity,
                  ease: "linear",
                }}
                className="absolute inset-[4px] rounded-[10px] border border-dashed border-amber-300/65 dark:border-amber-300/15"
              />
            ) : null}
          </span>

          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h3 className="max-w-full truncate text-[14px] font-black tracking-[-0.035em] text-slate-900 dark:text-white">
                {block.block_code ||
                  (isTe
                    ? "పేరు లేని బ్లాక్"
                    : "Unnamed block")}
              </h3>

              <StatusBadge
                status={
                  block.status
                }
              />
            </div>

            <p className="mt-1 text-[6px] font-semibold text-slate-400 dark:text-slate-500">
              {stateCopy}
            </p>
          </div>
        </div>

        {!selectionMode ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-slate-200 bg-slate-50 text-slate-400 transition group-hover:border-teal-200/80 group-hover:bg-teal-50 group-hover:text-teal-700 dark:border-slate-600/30 dark:bg-slate-700/15 dark:text-slate-500">
            <ArrowUpRight
              size={12}
            />
          </span>
        ) : selected ? (
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-[5px] font-black uppercase tracking-[0.08em] text-teal-700 dark:border-teal-300/15 dark:bg-cyan-300/[0.05] dark:text-teal-200">
            SELECTED
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-[11px] border border-slate-200/80 bg-slate-50/75 px-2.5 py-2 dark:border-slate-600/30 dark:bg-slate-700/10">
          <div className="flex items-center gap-1.5 text-slate-400">
            <CalendarDays
              size={10}
            />

            <span className="text-[4.8px] font-black uppercase tracking-[0.08em]">
              {isTe
                ? "క్యాప్చర్"
                : "Captured"}
            </span>
          </div>

          <p className="mt-1 truncate text-[6.5px] font-black text-slate-700 dark:text-slate-300">
            {captureDate
              ? captureDate.toLocaleDateString()
              : "—"}
          </p>
        </div>

        <div className="rounded-[11px] border border-slate-200/80 bg-slate-50/75 px-2.5 py-2 dark:border-slate-600/30 dark:bg-slate-700/10">
          <div className="flex items-center gap-1.5 text-slate-400">
            <CircleDot
              size={10}
            />

            <span className="text-[4.8px] font-black uppercase tracking-[0.08em]">
              {t(
                "quarry_ref",
              )}
            </span>
          </div>

          <p className="mt-1 truncate font-mono text-[6.5px] font-black text-slate-700 dark:text-slate-300">
            {quarryReference ||
              "—"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200/70 pt-3 dark:border-slate-600/25">
        <div className="flex items-center gap-1.5">
          {analyzed ? (
            <CheckCircle2
              size={10}
              className="text-emerald-500"
            />
          ) : processing ? (
            <Clock3
              size={10}
              className="text-amber-500"
            />
          ) : failed ? (
            <AlertTriangle
              size={10}
              className="text-rose-500"
            />
          ) : (
            <Boxes
              size={10}
              className="text-sky-500"
            />
          )}

          <span className="text-[5.5px] font-black uppercase tracking-[0.07em] text-slate-400 dark:text-slate-500">
            {selectionMode
              ? selected
                ? "CLICK TO UNSELECT"
                : "CLICK CARD TO SELECT"
              : "OPEN ANALYSIS RECORD"}
          </span>
        </div>

        {!selectionMode ? (
          <span className="inline-flex items-center gap-1 text-[5.5px] font-black uppercase tracking-[0.07em] text-teal-600 opacity-0 transition group-hover:opacity-100 dark:text-teal-300">
            INSPECT
            <ArrowUpRight
              size={9}
            />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function RegisterMetric({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | null;
  icon: React.ReactNode;
  tone:
    | "sky"
    | "good"
    | "amber"
    | "rose"
    | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-200 bg-emerald-50/78 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05] dark:text-emerald-200"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50/78 text-amber-700 dark:border-amber-300/15 dark:bg-amber-300/[0.05] dark:text-amber-200"
        : tone === "rose"
          ? "border-rose-200 bg-rose-50/78 text-rose-700 dark:border-rose-300/15 dark:bg-rose-300/[0.05] dark:text-rose-200"
          : tone === "sky"
            ? "border-teal-200/80 bg-teal-50/78 text-teal-700 dark:border-teal-300/15 dark:bg-teal-300/[0.05] dark:text-teal-200"
            : "border-slate-200 bg-slate-50/78 text-slate-600 dark:border-slate-600/30 dark:bg-slate-700/15 dark:text-slate-300";

  return (
    <div
      className={`rounded-[15px] border px-3 py-2.5 ${toneClass}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span>
          {icon}
        </span>

        <Sparkles
          size={9}
          className="opacity-30"
        />
      </div>

      <p className="mt-2 text-[5px] font-black uppercase tracking-[0.1em] opacity-65">
        {label}
      </p>

      {value === null ? (
        <div className="mt-1 h-5 w-10 animate-pulse rounded bg-white/45 dark:bg-slate-700/20" />
      ) : (
        <p className="mt-0.5 text-[18px] font-black leading-none tracking-[-0.045em]">
          {value}
        </p>
      )}
    </div>
  );
}

function BlocksBackground() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 overflow-hidden"
    >
      <motion.div
        animate={{
          x: [
            0,
            30,
            -10,
            0,
          ],
          y: [
            0,
            24,
            40,
            0,
          ],
        }}
        transition={{
          duration: 24,
          repeat:
            Infinity,
          ease: "easeInOut",
        }}
        className="absolute -left-28 -top-28 h-[520px] w-[520px] rounded-full bg-teal-200/20 blur-[130px] dark:bg-teal-400/[0.035]"
      />

      <motion.div
        animate={{
          x: [
            0,
            -38,
            16,
            0,
          ],
          y: [
            0,
            42,
            -6,
            0,
          ],
        }}
        transition={{
          duration: 30,
          repeat:
            Infinity,
          ease: "easeInOut",
        }}
        className="absolute -right-36 top-[26%] h-[560px] w-[560px] rounded-full bg-cyan-200/15 blur-[140px] dark:bg-cyan-400/[0.03]"
      />
    </div>
  );
}
