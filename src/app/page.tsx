import Image from "next/image";
import Link from "next/link";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { withBasePath } from "@/lib/basePath";
import { Shield, Stethoscope, Briefcase } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-slate-50">
      <div className="mx-auto w-full max-w-6xl px-6 py-12 md:py-16">
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-10">
          <div className="flex items-start gap-4">
            <div className="relative w-14 h-14 md:w-16 md:h-16 shrink-0">
              <Image src={withBasePath("/logo-1.png")} alt="Medisync Logo" fill className="object-contain" priority />
            </div>
            <div className="pt-1">
              <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">
                Medisync TPA System
              </h1>
              <p className="mt-2 text-base md:text-lg text-slate-600">
                Choose your portal to continue.
              </p>
            </div>
          </div>
          <div className="hidden md:block relative w-56 h-14">
            <Image src={withBasePath("/logo-2.png")} alt="Logo" fill className="object-contain" />
          </div>
        </header>

        <section className="mt-10 md:mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <GlassCard className="p-8 flex flex-col gap-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-100 flex items-center justify-center">
                <Shield className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">Member</p>
                <p className="mt-1 text-sm text-slate-600">
                  Reimbursement claim submission and benefits.
                </p>
              </div>
            </div>
            <div className="mt-auto">
              <Link href="/member/login" className="w-full">
                <GlassButton className="w-full justify-center py-4 text-base">Login</GlassButton>
              </Link>
            </div>
          </GlassCard>

          <GlassCard className="p-8 flex flex-col gap-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-100 flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">Provider</p>
                <p className="mt-1 text-sm text-slate-600">
                  Panel invoice submission and compliance.
                </p>
              </div>
            </div>
            <div className="mt-auto">
              <Link href="/provider/login" className="w-full">
                <GlassButton className="w-full justify-center py-4 text-base">Login</GlassButton>
              </Link>
            </div>
          </GlassCard>

          <GlassCard className="p-8 flex flex-col gap-6">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-100 flex items-center justify-center">
                <Briefcase className="w-5 h-5 text-sky-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">Admin</p>
                <p className="mt-1 text-sm text-slate-600">
                  TPA operations and system management.
                </p>
              </div>
            </div>
            <div className="mt-auto">
              <Link href="/admin/login" className="w-full">
                <GlassButton className="w-full justify-center py-4 text-base">Login</GlassButton>
              </Link>
            </div>
          </GlassCard>
        </section>
      </div>
    </div>
  );
}
