import type {
  MonitorTunnelApiItem,
  TunnelMetricApiItem,
  TunnelDiagnosisApiItem,
} from "@/api/types";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  RefreshCw,
  ArrowLeft,
  Activity,
  Zap,
  Globe,
  ArrowRightLeft,
  Wifi,
  WifiOff,
  Stethoscope,
} from "lucide-react";
import toast from "react-hot-toast";

import {
  getMonitorTunnels,
  getTunnelMetrics,
  diagnoseTunnel,
} from "@/api";
import { diagnoseTunnelStream } from "@/api/diagnosis-stream";
import { getDiagnosisQualityDisplay } from "@/pages/tunnel/diagnosis";
import { Button } from "@/shadcn-bridge/heroui/button";
import { Card, CardBody, CardHeader } from "@/shadcn-bridge/heroui/card";
import { Chip } from "@/shadcn-bridge/heroui/chip";
import { Select, SelectItem } from "@/shadcn-bridge/heroui/select";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@/shadcn-bridge/heroui/table";

interface TunnelMonitorViewProps {
  viewMode?: "list" | "grid";
}

const METRICS_MAX_ROWS = 5000;

interface TunnelQuality {
  loading: boolean;
  entryToExitLatency?: number;
  exitToBingLatency?: number;
  entryToExitLoss?: number;
  exitToBingLoss?: number;
  results?: TunnelDiagnosisApiItem[];
  timestamp?: number;
  error?: string;
}

const formatTimestamp = (ts: number, rangeMs?: number): string => {
  const date = new Date(ts);
  const includeDate = (rangeMs ?? 0) >= 24 * 60 * 60 * 1000;

  if (includeDate) {
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export function TunnelMonitorView({ viewMode = "grid" }: TunnelMonitorViewProps) {
  const [tunnels, setTunnels] = useState<MonitorTunnelApiItem[]>([]);
  const [tunnelsLoading, setTunnelsLoading] = useState(false);
  const [tunnelsError, setTunnelsError] = useState<string | null>(null);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);

  // Detail view state
  const [detailTunnelId, setDetailTunnelId] = useState<number | null>(null);
  const [tunnelMetrics, setTunnelMetrics] = useState<TunnelMetricApiItem[]>([]);
  const [tunnelMetricsLoading, setTunnelMetricsLoading] = useState(false);
  const [tunnelMetricsError, setTunnelMetricsError] = useState<string | null>(null);
  const [, setTunnelMetricsTruncated] = useState(false);
  const [tunnelRangeMs, setTunnelRangeMs] = useState(60 * 60 * 1000);

  // Tunnel quality (diagnosis) state
  const [tunnelQualities, setTunnelQualities] = useState<Record<number, TunnelQuality>>({});
  const diagnosisAbortRef = useRef<Record<number, AbortController>>({});

  // Cleanup abort controllers on unmount
  useEffect(() => {
    return () => {
      Object.values(diagnosisAbortRef.current).forEach((c) => c.abort());
      diagnosisAbortRef.current = {};
    };
  }, []);

  const loadTunnels = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setTunnelsLoading(true);
    try {
      const response = await getMonitorTunnels();

      if (response.code === 0 && response.data) {
        setAccessDenied(null);
        setTunnelsError(null);
        setTunnels(response.data);
        return;
      }
      if (response.code === 403) {
        setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");
        setTunnelsError(null);
        setTunnels([]);
        return;
      }
      setTunnelsError(response.msg || "加载隧道列表失败");
      if (!silent) toast.error(response.msg || "加载隧道列表失败");
    } catch {
      if (!silent) {
        setTunnelsError("加载隧道列表失败");
        toast.error("加载隧道列表失败");
      }
    } finally {
      if (!silent) setTunnelsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTunnels();
  }, [loadTunnels]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadTunnels({ silent: true });
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [loadTunnels]);

  // Load tunnel metrics for detail view
  const loadTunnelMetrics = useCallback(
    async (tunnelId: number, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) setTunnelMetricsLoading(true);
      try {
        const end = Date.now();
        const start = end - tunnelRangeMs;
        const response = await getTunnelMetrics(tunnelId, start, end);

        if (response.code === 0 && Array.isArray(response.data)) {
          setAccessDenied(null);
          setTunnelMetricsError(null);
          setTunnelMetricsTruncated(response.data.length >= METRICS_MAX_ROWS);
          const ordered = [...response.data].sort(
            (a, b) => a.timestamp - b.timestamp,
          );
          setTunnelMetrics(ordered);
          return;
        }
        if (response.code === 403) {
          setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");
          setTunnelMetricsTruncated(false);
          setTunnelMetricsError(null);
          return;
        }
        setTunnelMetricsTruncated(false);
        setTunnelMetricsError(response.msg || "加载隧道指标失败");
        if (!silent) toast.error(response.msg || "加载隧道指标失败");
      } catch {
        setTunnelMetricsTruncated(false);
        if (!silent) setTunnelMetricsError("加载隧道指标失败");
      } finally {
        if (!silent) setTunnelMetricsLoading(false);
      }
    },
    [tunnelRangeMs],
  );

  useEffect(() => {
    if (detailTunnelId) {
      void loadTunnelMetrics(detailTunnelId);
    }
  }, [detailTunnelId, loadTunnelMetrics]);

  useEffect(() => {
    if (!detailTunnelId) return;
    const timer = window.setInterval(() => {
      void loadTunnelMetrics(detailTunnelId, { silent: true });
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [detailTunnelId, loadTunnelMetrics]);

  // Diagnose tunnel quality
  const diagnoseTunnelQuality = useCallback(async (tunnelId: number) => {
    // Abort if already running
    if (diagnosisAbortRef.current[tunnelId]) {
      diagnosisAbortRef.current[tunnelId].abort();
    }
    const abortController = new AbortController();
    diagnosisAbortRef.current[tunnelId] = abortController;

    setTunnelQualities((prev) => ({
      ...prev,
      [tunnelId]: { loading: true },
    }));

    try {
      // Try stream first
      const results: TunnelDiagnosisApiItem[] = [];
      const streamResult = await diagnoseTunnelStream(
        tunnelId,
        {
          onItem: (payload) => {
            results.push(payload.result);
          },
          onError: (msg) => {
            setTunnelQualities((prev) => ({
              ...prev,
              [tunnelId]: { loading: false, error: msg },
            }));
          },
        },
        abortController.signal,
      );

      if (streamResult.fallback) {
        // Fallback to non-stream API
        try {
          const response = await diagnoseTunnel(tunnelId);
          if (response.code === 0 && response.data?.results) {
            const apiResults = response.data.results;
            const quality = extractQualityFromResults(apiResults);
            setTunnelQualities((prev) => ({
              ...prev,
              [tunnelId]: {
                loading: false,
                ...quality,
                results: apiResults,
                timestamp: Date.now(),
              },
            }));
          } else {
            setTunnelQualities((prev) => ({
              ...prev,
              [tunnelId]: { loading: false, error: response.msg || "诊断失败" },
            }));
          }
        } catch {
          setTunnelQualities((prev) => ({
            ...prev,
            [tunnelId]: { loading: false, error: "诊断请求失败" },
          }));
        }
        return;
      }

      // Process stream results
      if (results.length > 0) {
        const quality = extractQualityFromResults(results);
        setTunnelQualities((prev) => ({
          ...prev,
          [tunnelId]: {
            loading: false,
            ...quality,
            results,
            timestamp: Date.now(),
          },
        }));
      } else {
        setTunnelQualities((prev) => ({
          ...prev,
          [tunnelId]: { loading: false, error: "未获取到诊断结果" },
        }));
      }
    } catch {
      if (!abortController.signal.aborted) {
        setTunnelQualities((prev) => ({
          ...prev,
          [tunnelId]: { loading: false, error: "诊断失败" },
        }));
      }
    } finally {
      delete diagnosisAbortRef.current[tunnelId];
    }
  }, []);

  const extractQualityFromResults = (
    results: TunnelDiagnosisApiItem[],
  ): Pick<TunnelQuality, "entryToExitLatency" | "exitToBingLatency" | "entryToExitLoss" | "exitToBingLoss"> => {
    // The diagnosis results contain hop-by-hop tests
    // We look for entry→exit (hop between entry and exit nodes)
    // and exit→Bing (the last hop to external target like bing.com)
    let entryToExitLatency: number | undefined;
    let exitToBingLatency: number | undefined;
    let entryToExitLoss: number | undefined;
    let exitToBingLoss: number | undefined;

    for (const r of results) {
      if (!r.success) continue;

      // Entry to Exit: chainType transitions from 1 (entry) to 3 (exit)
      if (r.fromChainType === 1 && r.toChainType === 3) {
        entryToExitLatency = r.averageTime;
        entryToExitLoss = r.packetLoss;
      }
      // Or if it's a mid-chain to exit
      if (r.fromChainType === 2 && r.toChainType === 3) {
        // Use this if no direct entry→exit
        if (entryToExitLatency === undefined) {
          entryToExitLatency = r.averageTime;
          entryToExitLoss = r.packetLoss;
        }
      }

      // Exit to external target (Bing / external)
      if (r.toChainType === undefined || r.toChainType === 0) {
        // This typically means it's the exit node testing external
        if (r.fromChainType === 3) {
          exitToBingLatency = r.averageTime;
          exitToBingLoss = r.packetLoss;
        }
      }
    }

    // If no chainType-based matching, use position-based heuristics
    if (entryToExitLatency === undefined && exitToBingLatency === undefined) {
      const successResults = results.filter((r) => r.success);
      if (successResults.length >= 2) {
        entryToExitLatency = successResults[0].averageTime;
        entryToExitLoss = successResults[0].packetLoss;
        exitToBingLatency = successResults[successResults.length - 1].averageTime;
        exitToBingLoss = successResults[successResults.length - 1].packetLoss;
      } else if (successResults.length === 1) {
        entryToExitLatency = successResults[0].averageTime;
        entryToExitLoss = successResults[0].packetLoss;
      }
    }

    return { entryToExitLatency, exitToBingLatency, entryToExitLoss, exitToBingLoss };
  };

  // Chart data
  const tunnelChartData = tunnelMetrics.map((m) => ({
    time: formatTimestamp(m.timestamp, tunnelRangeMs),
    bytesIn: m.bytesIn,
    bytesOut: m.bytesOut,
    connections: m.connections,
  }));

  const tunnelYAxisTickFormatter = (value: unknown) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    return formatBytes(n);
  };

  const tunnelTooltipFormatter = (value: unknown) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "-";
    return formatBytes(n);
  };

  const detailTunnel = detailTunnelId != null
    ? tunnels.find((t) => t.id === detailTunnelId)
    : null;

  // Aggregate stats
  const tunnelStats = useMemo(() => {
    const enabled = tunnels.filter((t) => t.status === 1).length;
    const disabled = tunnels.length - enabled;
    const diagnosed = Object.keys(tunnelQualities).filter((k) => {
      const q = tunnelQualities[Number(k)];
      return q && !q.loading && !q.error;
    }).length;

    return { total: tunnels.length, enabled, disabled, diagnosed };
  }, [tunnels, tunnelQualities]);

  // =====================
  // RENDER
  // =====================

  if (accessDenied) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Activity className="w-5 h-5 text-warning" />
          <h3 className="text-lg font-semibold">监控权限</h3>
        </CardHeader>
        <CardBody>
          <div className="text-sm text-default-600">{accessDenied}</div>
          <div className="text-xs text-default-500 mt-2">
            如需使用监控功能，请联系管理员在用户页面授予监控权限。
          </div>
        </CardBody>
      </Card>
    );
  }

  // ===== DETAIL VIEW =====
  if (detailTunnelId && detailTunnel) {
    const quality = tunnelQualities[detailTunnelId];

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3 flex-wrap">
          <Button size="sm" variant="flat" onPress={() => {
            setDetailTunnelId(null);
            setTunnelMetrics([]);
          }}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            返回隧道列表
          </Button>
          <div className="flex items-center gap-2">
            <ArrowRightLeft className={`w-5 h-5 ${detailTunnel.status === 1 ? "text-success" : "text-default-400"}`} />
            <h3 className="text-lg font-semibold">{detailTunnel.name}</h3>
            <Chip size="sm" color={detailTunnel.status === 1 ? "success" : "danger"} variant="flat">
              {detailTunnel.status === 1 ? "启用" : "禁用"}
            </Chip>
          </div>
        </div>

        {/* Quality KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border border-divider/60 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-background to-default-50/50">
            <CardBody className="py-3 px-4 flex flex-col items-center justify-center min-h-[5rem]">
              <span className="text-[11px] text-default-500 mb-1.5">入口 → 出口 延迟</span>
              <span className={`text-sm font-semibold font-mono ${quality?.entryToExitLatency !== undefined ? "text-primary" : ""}`}>
                {quality?.loading ? "检测中..." : quality?.entryToExitLatency !== undefined ? `${quality.entryToExitLatency.toFixed(0)}ms` : "-"}
              </span>
            </CardBody>
          </Card>
          <Card className="border border-divider/60 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-background to-default-50/50">
            <CardBody className="py-3 px-4 flex flex-col items-center justify-center min-h-[5rem]">
              <span className="text-[11px] text-default-500 mb-1.5">出口 → Bing 延迟</span>
              <span className={`text-sm font-semibold font-mono ${quality?.exitToBingLatency !== undefined ? "text-success" : ""}`}>
                {quality?.loading ? "检测中..." : quality?.exitToBingLatency !== undefined ? `${quality.exitToBingLatency.toFixed(0)}ms` : "-"}
              </span>
            </CardBody>
          </Card>
          <Card className="border border-divider/60 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-background to-default-50/50">
            <CardBody className="py-3 px-4 flex flex-col items-center justify-center min-h-[5rem]">
              <span className="text-[11px] text-default-500 mb-1.5">入口 → 出口 丢包</span>
              <span className={`text-sm font-semibold font-mono ${(quality?.entryToExitLoss ?? 0) > 0 ? "text-warning" : ""}`}>
                {quality?.loading ? "检测中..." : quality?.entryToExitLoss !== undefined ? `${quality.entryToExitLoss.toFixed(1)}%` : "-"}
              </span>
            </CardBody>
          </Card>
          <Card className="border border-divider/60 shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-background to-default-50/50">
            <CardBody className="py-3 px-4 flex flex-col items-center justify-center min-h-[5rem]">
              <span className="text-[11px] text-default-500 mb-1.5">出口 → Bing 丢包</span>
              <span className={`text-sm font-semibold font-mono ${(quality?.exitToBingLoss ?? 0) > 0 ? "text-warning" : ""}`}>
                {quality?.loading ? "检测中..." : quality?.exitToBingLoss !== undefined ? `${quality.exitToBingLoss.toFixed(1)}%` : "-"}
              </span>
            </CardBody>
          </Card>
        </div>

        {/* Diagnose Button */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            color="primary"
            variant="flat"
            isLoading={quality?.loading}
            onPress={() => diagnoseTunnelQuality(detailTunnelId)}
          >
            <Stethoscope className="w-4 h-4 mr-1" />
            {quality?.timestamp ? "重新检测质量" : "检测隧道质量"}
          </Button>
          {quality?.timestamp && (
            <span className="text-xs text-default-500">
              上次检测: {new Date(quality.timestamp).toLocaleTimeString("zh-CN")}
            </span>
          )}
          {quality?.error && (
            <span className="text-xs text-danger">{quality.error}</span>
          )}
        </div>

        {/* Diagnosis Details */}
        {quality?.results && quality.results.length > 0 && (
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold">诊断详情</h3>
            </CardHeader>
            <CardBody>
              <Table aria-label="诊断结果">
                <TableHeader>
                  <TableColumn>描述</TableColumn>
                  <TableColumn>节点</TableColumn>
                  <TableColumn>目标</TableColumn>
                  <TableColumn>延迟</TableColumn>
                  <TableColumn>丢包</TableColumn>
                  <TableColumn>状态</TableColumn>
                </TableHeader>
                <TableBody>
                  {quality.results.map((r, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <span className="text-sm">{r.description || "-"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-mono">{r.nodeName || "-"}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-mono">
                          {r.targetIp || "-"}{r.targetPort ? `:${r.targetPort}` : ""}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-mono">
                          {r.averageTime !== undefined ? `${r.averageTime.toFixed(0)}ms` : "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-mono">
                          {r.packetLoss !== undefined ? `${r.packetLoss.toFixed(1)}%` : "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Chip size="sm" color={r.success ? "success" : "danger"} variant="flat">
                          {r.success ? "成功" : "失败"}
                        </Chip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardBody>
          </Card>
        )}

        {/* Tunnel traffic chart */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h3 className="text-lg font-semibold">隧道流量趋势</h3>
            <div className="flex items-center gap-2">
              <Select
                className="w-36"
                selectedKeys={[String(tunnelRangeMs)]}
                onSelectionChange={(keys) => {
                  const v = Number(Array.from(keys)[0]);
                  if (v > 0) setTunnelRangeMs(v);
                }}
              >
                <SelectItem key={String(15 * 60 * 1000)}>15分钟</SelectItem>
                <SelectItem key={String(60 * 60 * 1000)}>1小时</SelectItem>
                <SelectItem key={String(6 * 60 * 60 * 1000)}>6小时</SelectItem>
                <SelectItem key={String(24 * 60 * 60 * 1000)}>24小时</SelectItem>
              </Select>
              <Button
                isLoading={tunnelMetricsLoading}
                size="sm"
                variant="flat"
                onPress={() => detailTunnelId && loadTunnelMetrics(detailTunnelId)}
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                刷新
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            {tunnelMetricsLoading ? (
              <div className="flex justify-center py-8"><RefreshCw className="w-6 h-6 animate-spin" /></div>
            ) : tunnelMetricsError ? (
              <div className="text-center py-8 text-danger text-sm">{tunnelMetricsError}</div>
            ) : tunnelMetrics.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer height="100%" width="100%">
                  <LineChart data={tunnelChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" fontSize={12} />
                    <YAxis fontSize={12} tickFormatter={tunnelYAxisTickFormatter} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "none", borderRadius: "8px" }}
                      labelStyle={{ color: "#fff" }}
                      formatter={tunnelTooltipFormatter}
                    />
                    <Line dataKey="bytesIn" dot={false} name="入站流量" stroke="#10b981" strokeWidth={2} type="monotone" />
                    <Line dataKey="bytesOut" dot={false} name="出站流量" stroke="#ef4444" strokeWidth={2} type="monotone" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-center py-8 text-default-500">暂无指标数据</div>
            )}
          </CardBody>
        </Card>
      </div>
    );
  }

  // ===== LIST/GRID VIEW =====
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <Chip color="primary" size="sm" variant="flat">隧道 {tunnelStats.enabled}/{tunnelStats.total}</Chip>
        {tunnelStats.diagnosed > 0 && (
          <Chip color="success" size="sm" variant="flat">已诊断 {tunnelStats.diagnosed}</Chip>
        )}
        <div className="ml-auto">
          <Button isLoading={tunnelsLoading} size="sm" variant="flat" onPress={() => loadTunnels()}>
            <RefreshCw className="w-4 h-4 mr-1" />
            刷新
          </Button>
        </div>
      </div>

      {tunnelsError ? (
        <Card>
          <CardBody>
            <div className="text-sm text-default-600">{tunnelsError}</div>
          </CardBody>
        </Card>
      ) : null}

      {viewMode === "grid" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tunnels.map((tunnel) => {
            const quality = tunnelQualities[tunnel.id];
            const isEnabled = tunnel.status === 1;
            const overallQuality = quality?.entryToExitLatency !== undefined
              ? getDiagnosisQualityDisplay(quality.entryToExitLatency, quality.entryToExitLoss ?? 0)
              : null;

            return (
              <Card
                key={tunnel.id}
                className="group relative overflow-hidden shadow-sm border border-divider dark:border-default-100 hover:-translate-y-1 hover:shadow-lg transition-all duration-300 h-full flex flex-col cursor-pointer bg-background"
                onClick={() => setDetailTunnelId(tunnel.id)}
              >
                {/* Top gradient bar */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${isEnabled ? "bg-success" : "bg-danger"}`} />

                {/* Decorative background glow */}
                <div className={`absolute -right-8 -top-8 w-24 h-24 rounded-full blur-2xl opacity-10 transition-opacity group-hover:opacity-20 ${isEnabled ? "bg-success" : "bg-danger"}`} />

                <CardHeader className="pb-2 pt-5 px-5 flex flex-row justify-between items-start gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative flex-shrink-0">
                      <div className="w-10 h-10 rounded-xl bg-default-100 dark:bg-default-50/10 flex items-center justify-center border border-divider">
                        <ArrowRightLeft className={`w-5 h-5 ${isEnabled ? "text-success" : "text-danger"}`} />
                      </div>
                      <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${isEnabled ? "bg-success" : "bg-danger"}`} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <h3 className="font-semibold text-foreground text-sm truncate">{tunnel.name}</h3>
                      <div className="flex items-center gap-1.5 text-[11px] text-default-500 mt-0.5">
                        <span className="font-mono">{isEnabled ? "启用" : "禁用"}</span>
                      </div>
                    </div>
                  </div>
                  {overallQuality && (
                    <Chip size="sm" color={overallQuality.color} variant="flat">
                      {overallQuality.text}
                    </Chip>
                  )}
                </CardHeader>

                <CardBody className="py-3 px-5 flex-1 flex flex-col justify-end gap-3 z-10 w-full overflow-hidden">
                  {/* Quality metrics */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="text-[10px] text-default-500 flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        入口→出口
                      </div>
                      <span className="font-mono text-xs font-semibold">
                        {quality?.loading ? (
                          <RefreshCw className="w-3 h-3 animate-spin inline" />
                        ) : quality?.entryToExitLatency !== undefined ? (
                          `${quality.entryToExitLatency.toFixed(0)}ms`
                        ) : "-"}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="text-[10px] text-default-500 flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        出口→Bing
                      </div>
                      <span className="font-mono text-xs font-semibold">
                        {quality?.loading ? (
                          <RefreshCw className="w-3 h-3 animate-spin inline" />
                        ) : quality?.exitToBingLatency !== undefined ? (
                          `${quality.exitToBingLatency.toFixed(0)}ms`
                        ) : "-"}
                      </span>
                    </div>
                  </div>

                  {/* Action area */}
                  <div className="flex justify-between items-center pt-2 border-t border-divider/50">
                    {quality?.error ? (
                      <span className="text-[11px] text-danger truncate">{quality.error}</span>
                    ) : quality?.timestamp ? (
                      <span className="text-[11px] text-default-500">
                        {new Date(quality.timestamp).toLocaleTimeString("zh-CN")}
                      </span>
                    ) : (
                      <span className="text-[11px] text-default-400">未检测</span>
                    )}
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      isLoading={quality?.loading}
                      onPress={() => {
                        diagnoseTunnelQuality(tunnel.id);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Stethoscope className="w-4 h-4 text-default-500" />
                    </Button>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="w-full">
          <Table aria-label="隧道列表">
            <TableHeader>
              <TableColumn>状态</TableColumn>
              <TableColumn>名称</TableColumn>
              <TableColumn>入口→出口</TableColumn>
              <TableColumn>出口→Bing</TableColumn>
              <TableColumn>质量</TableColumn>
              <TableColumn align="center">操作</TableColumn>
            </TableHeader>
            <TableBody emptyContent="暂无隧道">
              {tunnels.map((tunnel) => {
                const quality = tunnelQualities[tunnel.id];
                const isEnabled = tunnel.status === 1;
                const overallQuality = quality?.entryToExitLatency !== undefined
                  ? getDiagnosisQualityDisplay(quality.entryToExitLatency, quality.entryToExitLoss ?? 0)
                  : null;

                return (
                  <TableRow key={tunnel.id} className="border-b border-divider/50 last:border-b-0 cursor-pointer" onClick={() => setDetailTunnelId(tunnel.id)}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {isEnabled ? (
                          <Wifi className="w-3.5 h-3.5 text-success" />
                        ) : (
                          <WifiOff className="w-3.5 h-3.5 text-danger" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-semibold text-sm whitespace-nowrap">{tunnel.name}</span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs whitespace-nowrap">
                        {quality?.loading ? (
                          <RefreshCw className="w-3 h-3 animate-spin inline" />
                        ) : quality?.entryToExitLatency !== undefined ? (
                          `${quality.entryToExitLatency.toFixed(0)}ms`
                        ) : "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs whitespace-nowrap">
                        {quality?.loading ? (
                          <RefreshCw className="w-3 h-3 animate-spin inline" />
                        ) : quality?.exitToBingLatency !== undefined ? (
                          `${quality.exitToBingLatency.toFixed(0)}ms`
                        ) : "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {overallQuality ? (
                        <Chip size="sm" color={overallQuality.color} variant="flat">
                          {overallQuality.text}
                        </Chip>
                      ) : (
                        <span className="text-xs text-default-400">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-1">
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          isLoading={quality?.loading}
                          onPress={() => diagnoseTunnelQuality(tunnel.id)}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Stethoscope className="w-4 h-4 text-default-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
