"use client";

import { GlassButton } from "@/components/ui/GlassButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { MobileRecordCard } from "@/components/ui/MobileRecordCard";
import { ResponsiveDataView } from "@/components/ui/ResponsiveDataView";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Download,
  DollarSign,
  ExternalLink,
  FileText,
  Landmark,
  ReceiptText,
  Search,
  TimerReset,
} from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { downloadText } from "@/lib/download";
import { formatCurrency, formatDateDisplay } from "@/lib/formats";
import { downloadDataUrlFile, openDataUrlInNewTab } from "@/lib/fileData";
import {
  ensureAdminClaimsSeed,
  getAdminClaimsServerSnapshot,
  getAdminClaimsSnapshot,
  subscribeAdminClaims,
} from "@/lib/claimsStore";
import { ensureProviderSeed, getProviderById, getProviderSession } from "@/lib/providerSession";

type PaymentBatchClaim = {
  id: string;
  patient: string;
  visitDate: string;
  diagnosis: string;
  amount: number;
  serviceType: string;
  pvFileName?: string;
  pvDataUrl?: string;
};

type PaymentBatch = {
  id: string;
  noticeNo: string;
  date: string;
  year: string;
  amount: number;
  status: "Paid";
  slipFileName: string;
  claims: PaymentBatchClaim[];
};

const getDateValue = (value?: string) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildStatementCsv = (batch: PaymentBatch) => {
  const header = "Claim ID,Patient,Visit Date,Service Type,Diagnosis,Amount";
  const rows = batch.claims.map((claim) =>
    [
      claim.id,
      claim.patient,
      claim.visitDate,
      claim.serviceType,
      claim.diagnosis,
      formatCurrency(claim.amount),
    ]
      .map((value) => `"${value}"`)
      .join(",")
  );

  return [header, ...rows].join("\n");
};

export default function PaymentHistoryPage() {
  const [expandedPv, setExpandedPv] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterYear, setFilterYear] = useState("All");

  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  if (isHydrated) {
    ensureProviderSeed();
    ensureAdminClaimsSeed();
  }

  const providerSession = isHydrated ? getProviderSession() : null;
  const provider = providerSession?.providerId ? getProviderById(providerSession.providerId) : null;
  const providerName = provider?.providerName || providerSession?.providerName || "City General Hospital";
  const adminClaims = useSyncExternalStore(
    subscribeAdminClaims,
    getAdminClaimsSnapshot,
    getAdminClaimsServerSnapshot
  );
  const providerClaims = useMemo(
    () => adminClaims.filter((claim) => claim.hospital === providerName),
    [adminClaims, providerName]
  );

  const approvedClaims = useMemo(
    () => providerClaims.filter((claim) => claim.status === "Approved" && claim.bankSlipFileName),
    [providerClaims]
  );
  const pendingClaims = useMemo(
    () => providerClaims.filter((claim) => ["In review", "In progress"].includes(claim.status)),
    [providerClaims]
  );

  const paymentBatches = useMemo(() => {
    const grouped = new Map<string, PaymentBatchClaim[] & { releasedAt?: string; slipFileName?: string }>();

    approvedClaims.forEach((claim) => {
      const releasedAt = (claim.bankSlipUploadedAt || claim.date || "").slice(0, 10);
      const slipFileName = claim.bankSlipFileName || "bank-slip";
      const key = `${releasedAt}__${slipFileName}`;
      const existing = grouped.get(key) || [];
      existing.push({
        id: claim.id,
        patient: claim.patient,
        visitDate: claim.date,
        diagnosis: claim.diagnosis || "Processed via admin approval",
        amount: claim.amount,
        serviceType: claim.serviceType || "General Medical",
        pvFileName: claim.pvFileName,
        pvDataUrl: claim.pvDataUrl,
      });
      existing.releasedAt = releasedAt;
      existing.slipFileName = slipFileName;
      grouped.set(key, existing);
    });

    const batches = Array.from(grouped.values())
      .map((claims) => ({
        date: claims.releasedAt || "",
        year: (claims.releasedAt || "").slice(0, 4),
        amount: claims.reduce((sum, claim) => sum + claim.amount, 0),
        status: "Paid" as const,
        slipFileName: claims.slipFileName || "bank-slip",
        claims: [...claims].sort((left, right) => right.visitDate.localeCompare(left.visitDate)),
      }))
      .sort((left, right) => getDateValue(right.date) - getDateValue(left.date))
      .map((batch, index) => {
        const dateKey = batch.date ? batch.date.replaceAll("-", "") : "00000000";
        const sequence = String(index + 1).padStart(3, "0");
        return {
          ...batch,
          id: `PV-${dateKey}-${sequence}`,
          noticeNo: `SN-${dateKey}-${sequence}`,
        };
      });

    return batches;
  }, [approvedClaims]);

  const availableYears = useMemo(() => {
    const years = Array.from(new Set(paymentBatches.map((batch) => batch.year).filter(Boolean)));
    return years.sort((left, right) => right.localeCompare(left));
  }, [paymentBatches]);

  const filteredBatches = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    return paymentBatches.filter((batch) => {
      const matchesYear = filterYear === "All" || batch.year === filterYear;
      if (!matchesYear) return false;
      if (!normalized) return true;

      return (
        batch.id.toLowerCase().includes(normalized) ||
        batch.noticeNo.toLowerCase().includes(normalized) ||
        batch.slipFileName.toLowerCase().includes(normalized) ||
        batch.claims.some(
          (claim) =>
            claim.id.toLowerCase().includes(normalized) ||
            claim.patient.toLowerCase().includes(normalized) ||
            claim.diagnosis.toLowerCase().includes(normalized)
        )
      );
    });
  }, [filterYear, paymentBatches, searchTerm]);

  const summary = useMemo(() => {
    const totalPaid = paymentBatches.reduce((sum, batch) => sum + batch.amount, 0);
    const totalPending = pendingClaims.reduce((sum, claim) => sum + claim.amount, 0);
    const latestRelease = paymentBatches[0];

    return {
      totalPaid,
      batchCount: paymentBatches.length,
      paidClaimsCount: approvedClaims.length,
      totalPending,
      pendingClaimsCount: pendingClaims.length,
      latestRelease,
    };
  }, [approvedClaims.length, paymentBatches, pendingClaims]);

  const settlementNotices = paymentBatches.map((batch) => ({
    noticeNo: batch.noticeNo,
    pv: batch.id,
    issuedOn: batch.date,
    gross: batch.amount,
    adjustment: 0,
    net: batch.amount,
  }));

  const toggleExpand = (id: string) => {
    setExpandedPv(expandedPv === id ? null : id);
  };

  return (
    <div className="space-y-6">
      <GlassCard className="overflow-hidden border-sky-100 bg-white/78 p-0 shadow-xl shadow-sky-100/40">
        <div className="relative p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(52,211,153,0.14),transparent_24%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
                <Landmark className="h-3.5 w-3.5" />
                Payment History
              </div>
              <h1 className="mt-4 text-2xl font-bold text-slate-900">Settlement and payment releases for {providerName}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                Current payment history is generated from approved provider claims and grouped by uploaded bank-in slip evidence.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/80 bg-white/75 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Latest Release</p>
                <p className="mt-1 text-xl font-bold text-slate-900">
                  {summary.latestRelease ? formatCurrency(summary.latestRelease.amount) : formatCurrency(0)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {summary.latestRelease ? formatDateDisplay(summary.latestRelease.date) : "No paid batch yet"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/80 bg-white/75 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Awaiting Release</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(summary.totalPending)}</p>
                <p className="mt-1 text-sm text-slate-600">{summary.pendingClaimsCount} claims still in review workflow</p>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <GlassCard className="flex items-center gap-4 border-emerald-100 bg-emerald-50/80 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-800">Total Paid</p>
            <p className="text-2xl font-bold text-emerald-700">{formatCurrency(summary.totalPaid)}</p>
          </div>
        </GlassCard>
        <GlassCard className="flex items-center gap-4 border-sky-100 bg-sky-50/80 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-sky-600">
            <CreditCard className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-sky-800">Paid Batches</p>
            <p className="text-2xl font-bold text-sky-700">{summary.batchCount}</p>
          </div>
        </GlassCard>
        <GlassCard className="flex items-center gap-4 border-violet-100 bg-violet-50/80 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <ReceiptText className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-violet-800">Paid Claims</p>
            <p className="text-2xl font-bold text-violet-700">{summary.paidClaimsCount}</p>
          </div>
        </GlassCard>
        <GlassCard className="flex items-center gap-4 border-amber-100 bg-amber-50/80 p-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <TimerReset className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-amber-800">Pending Claims</p>
            <p className="text-2xl font-bold text-amber-700">{summary.pendingClaimsCount}</p>
          </div>
        </GlassCard>
      </div>

      <GlassCard className="border-white/80 bg-white/78 p-5 shadow-lg shadow-sky-100/30">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <FileText className="h-5 w-5 text-sky-600" />
              Payment Vouchers
            </h2>
            <p className="mt-1 text-sm text-slate-500">Each batch is derived from approved claims sharing the same release evidence.</p>
          </div>
          <div className="flex w-full flex-col gap-3 lg:w-auto lg:flex-row">
            <div className="relative min-w-[280px]">
              <Search className="absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search PV, notice, slip, claim, patient..."
                className="w-full rounded-xl border border-slate-200 bg-white/80 py-2 pl-9 pr-4 text-sm text-slate-700 outline-none ring-0 placeholder:text-slate-400"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </div>
            <select
              className="rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-700 outline-none"
              value={filterYear}
              onChange={(event) => setFilterYear(event.target.value)}
            >
              <option value="All">All Years</option>
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ResponsiveDataView
          desktop={
            <div className="mt-5 overflow-hidden rounded-2xl border border-white/80 bg-white/65">
              <div className="divide-y divide-slate-100">
                {filteredBatches.length ? (
                  filteredBatches.map((batch) => (
                    <div key={batch.id}>
                      <div
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-4 px-5 py-4 transition-colors",
                          expandedPv === batch.id ? "bg-sky-50/70" : "hover:bg-slate-50/80"
                        )}
                        onClick={() => toggleExpand(batch.id)}
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-sm font-bold text-emerald-700">
                            PV
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900">{batch.id}</p>
                            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                              <Calendar className="h-3.5 w-3.5" />
                              {formatDateDisplay(batch.date)} • {batch.slipFileName}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-5">
                          <div className="text-right">
                            <p className="font-semibold text-slate-900">{formatCurrency(batch.amount)}</p>
                            <p className="text-xs text-slate-500">{batch.claims.length} paid claims</p>
                          </div>
                          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            {batch.status}
                          </span>
                          <div className="text-slate-400">
                            {expandedPv === batch.id ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                          </div>
                        </div>
                      </div>

                      {expandedPv === batch.id && (
                        <div className="border-t border-slate-100 bg-slate-50/80 px-5 py-4">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <h3 className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Claims Breakdown</h3>
                              <p className="mt-1 text-sm text-slate-500">{batch.noticeNo} linked to payment evidence</p>
                            </div>
                            <GlassButton
                              variant="secondary"
                              className="gap-2"
                              onClick={() => downloadText(`payment-${batch.id}.csv`, buildStatementCsv(batch), "text/csv")}
                            >
                              <Download className="h-4 w-4" />
                              Download Statement
                            </GlassButton>
                          </div>

                          <table className="mt-4 w-full text-left text-sm">
                            <thead>
                              <tr className="border-b border-slate-200">
                                <th className="py-2 font-medium text-slate-500">Claim ID</th>
                                <th className="py-2 font-medium text-slate-500">Patient</th>
                                <th className="py-2 font-medium text-slate-500">Visit Date</th>
                                <th className="py-2 font-medium text-slate-500">Service Type</th>
                                <th className="py-2 font-medium text-slate-500">Diagnosis</th>
                                <th className="py-2 font-medium text-slate-500">PV</th>
                                <th className="py-2 text-right font-medium text-slate-500">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {batch.claims.map((claim) => (
                                <tr key={claim.id} className="border-b border-slate-100 last:border-0">
                                  <td className="py-2 font-medium text-slate-700">{claim.id}</td>
                                  <td className="py-2 text-slate-600">{claim.patient}</td>
                                  <td className="py-2 text-slate-500">{formatDateDisplay(claim.visitDate)}</td>
                                  <td className="py-2 text-slate-500">{claim.serviceType}</td>
                                  <td className="py-2 text-slate-500">{claim.diagnosis}</td>
                                  <td className="py-2">
                                    {claim.pvFileName && claim.pvDataUrl ? (
                                      <div className="flex flex-wrap items-center gap-2">
                                        <button
                                          type="button"
                                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-slate-50"
                                          onClick={() => openDataUrlInNewTab(claim.pvDataUrl!)}
                                        >
                                          <ExternalLink className="h-3.5 w-3.5" />
                                          Open
                                        </button>
                                        <button
                                          type="button"
                                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                          onClick={() => downloadDataUrlFile(claim.pvDataUrl!, claim.pvFileName!)}
                                        >
                                          <Download className="h-3.5 w-3.5" />
                                          Download
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="text-xs text-slate-400">Not uploaded</span>
                                    )}
                                  </td>
                                  <td className="py-2 text-right font-semibold text-slate-800">{formatCurrency(claim.amount)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="px-5 py-10 text-center text-sm text-slate-500">
                    No paid batches match the current search or filter.
                  </div>
                )}
              </div>
            </div>
          }
          mobile={
            <div className="mt-5 space-y-3">
              {filteredBatches.length ? (
                filteredBatches.map((batch) => (
                  <MobileRecordCard
                    key={batch.id}
                    title={batch.id}
                    subtitle={`${formatDateDisplay(batch.date)} • ${batch.slipFileName}`}
                    badge={
                      <span className="inline-flex items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        {batch.status}
                      </span>
                    }
                    footer={
                      <div className="flex items-center justify-between gap-3">
                        <GlassButton variant="ghost" className="h-8 px-3 text-sky-600" onClick={() => toggleExpand(batch.id)}>
                          {expandedPv === batch.id ? "Hide Claims" : "View Claims"}
                        </GlassButton>
                        <span className="text-sm font-bold text-slate-800">{formatCurrency(batch.amount)}</span>
                      </div>
                    }
                  >
                    {expandedPv === batch.id ? (
                      <div className="space-y-3">
                        {batch.claims.map((claim) => (
                          <div key={claim.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-800">{claim.id}</p>
                                <p className="text-xs text-slate-500">
                                  {claim.patient} • {formatDateDisplay(claim.visitDate)}
                                </p>
                              </div>
                              <p className="text-sm font-bold text-slate-800">{formatCurrency(claim.amount)}</p>
                            </div>
                            <p className="mt-2 text-xs text-slate-600">{claim.serviceType}</p>
                            <p className="mt-1 text-xs text-slate-500">{claim.diagnosis}</p>
                            <div className="mt-3 rounded-lg border border-white/60 bg-white/60 p-2">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PV</p>
                              {claim.pvFileName && claim.pvDataUrl ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <GlassButton
                                    variant="secondary"
                                    className="h-8 gap-2 px-3 text-xs"
                                    onClick={() => openDataUrlInNewTab(claim.pvDataUrl!)}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                    Open PV
                                  </GlassButton>
                                  <GlassButton
                                    className="h-8 gap-2 px-3 text-xs"
                                    onClick={() => downloadDataUrlFile(claim.pvDataUrl!, claim.pvFileName!)}
                                  >
                                    <Download className="h-4 w-4" />
                                    Download PV
                                  </GlassButton>
                                </div>
                              ) : (
                                <p className="mt-1 text-xs text-slate-500">Not uploaded</p>
                              )}
                            </div>
                          </div>
                        ))}
                        <GlassButton
                          variant="secondary"
                          className="w-full gap-2"
                          onClick={() => downloadText(`payment-${batch.id}.csv`, buildStatementCsv(batch), "text/csv")}
                        >
                          <Download className="h-4 w-4" />
                          Download Statement
                        </GlassButton>
                      </div>
                    ) : (
                      <>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Claims Count</p>
                          <p className="mt-1 text-sm text-slate-700">{batch.claims.length}</p>
                        </div>
                        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Settlement Notice</p>
                          <p className="mt-1 text-sm text-slate-700">{batch.noticeNo}</p>
                        </div>
                      </>
                    )}
                  </MobileRecordCard>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-center text-sm text-slate-500">
                  No paid batches match the current search or filter.
                </div>
              )}
            </div>
          }
        />
      </GlassCard>

      <ResponsiveDataView
        desktop={
          <GlassCard className="overflow-hidden border-white/80 bg-white/78 p-0 shadow-lg shadow-sky-100/30">
            <div className="border-b border-white/70 bg-white/50 px-5 py-4">
              <h2 className="font-bold text-slate-900">Settlement Notices</h2>
              <p className="text-xs text-slate-500">Derived from released claim batches using the current approval logic.</p>
            </div>
            <div className="divide-y divide-slate-100">
              {settlementNotices.length ? (
                settlementNotices.map((notice) => (
                  <div key={notice.noticeNo} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{notice.noticeNo}</p>
                      <p className="text-xs text-slate-500">
                        {notice.pv} • Issued {formatDateDisplay(notice.issuedOn)}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <p className="text-slate-400">Gross</p>
                        <p className="font-semibold text-slate-700">{formatCurrency(notice.gross)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Adjustment</p>
                        <p className="font-semibold text-amber-700">{formatCurrency(notice.adjustment)}</p>
                      </div>
                      <div>
                        <p className="text-slate-400">Net</p>
                        <p className="font-bold text-emerald-700">{formatCurrency(notice.net)}</p>
                      </div>
                    </div>
                    <GlassButton
                      variant="secondary"
                      className="gap-2"
                      onClick={() =>
                        downloadText(
                          `${notice.noticeNo}.txt`,
                          [
                            `Settlement Notice: ${notice.noticeNo}`,
                            `Payment Voucher: ${notice.pv}`,
                            `Issued On: ${formatDateDisplay(notice.issuedOn)}`,
                            `Gross: ${formatCurrency(notice.gross)}`,
                            `Adjustment: ${formatCurrency(notice.adjustment)}`,
                            `Net: ${formatCurrency(notice.net)}`,
                          ].join("\n")
                        )
                      }
                    >
                      <Download className="h-4 w-4" />
                      Download Notice
                    </GlassButton>
                  </div>
                ))
              ) : (
                <div className="px-5 py-10 text-center text-sm text-slate-500">
                  No settlement notices available yet.
                </div>
              )}
            </div>
          </GlassCard>
        }
        mobile={
          <div className="space-y-3">
            <div className="px-1">
              <h2 className="font-bold text-slate-800">Settlement Notices</h2>
              <p className="text-xs text-slate-500">Derived from released claim batches using the current approval logic.</p>
            </div>
            {settlementNotices.length ? (
              settlementNotices.map((notice) => (
                <MobileRecordCard
                  key={notice.noticeNo}
                  title={notice.noticeNo}
                  subtitle={`${notice.pv} • Issued ${formatDateDisplay(notice.issuedOn)}`}
                  footer={
                    <div className="flex justify-end">
                      <GlassButton
                        variant="secondary"
                        className="gap-2"
                        onClick={() =>
                          downloadText(
                            `${notice.noticeNo}.txt`,
                            [
                              `Settlement Notice: ${notice.noticeNo}`,
                              `Payment Voucher: ${notice.pv}`,
                              `Issued On: ${formatDateDisplay(notice.issuedOn)}`,
                              `Gross: ${formatCurrency(notice.gross)}`,
                              `Adjustment: ${formatCurrency(notice.adjustment)}`,
                              `Net: ${formatCurrency(notice.net)}`,
                            ].join("\n")
                          )
                        }
                      >
                        <Download className="h-4 w-4" />
                        Download Notice
                      </GlassButton>
                    </div>
                  }
                >
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gross</p>
                    <p className="mt-1 text-sm text-slate-700">{formatCurrency(notice.gross)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Adjustment</p>
                    <p className="mt-1 text-sm text-amber-700">{formatCurrency(notice.adjustment)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Net</p>
                    <p className="mt-1 text-sm font-bold text-emerald-700">{formatCurrency(notice.net)}</p>
                  </div>
                </MobileRecordCard>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-center text-sm text-slate-500">
                No settlement notices available yet.
              </div>
            )}
          </div>
        }
      />
    </div>
  );
}
