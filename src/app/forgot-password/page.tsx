"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { 
  User, 
  Building, 
  ArrowLeft,
  Mail,
  Building2,
  CheckCircle2
} from "lucide-react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { withBasePath } from "@/lib/basePath";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [role, setRole] = useState("member");

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      setSuccess(true);
    }, 1500);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <GlassCard className="w-full max-w-md flex flex-col items-center gap-6 py-10 px-8 animate-in fade-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative w-24 h-24">
             <Image 
              src={withBasePath("/logo-1.png")}
              alt="Medisync Logo" 
              fill 
              className="object-contain" 
            />
          </div>
          <h1 className="text-xl font-bold text-slate-800 mt-2">Password Recovery</h1>
          <p className="text-sm text-slate-500 text-center">
            Enter your credentials to receive a temporary password.
          </p>
        </div>

        {!success ? (
          <form onSubmit={handleReset} className="w-full flex flex-col gap-4">
            {/* Role Selection */}
            <div className="flex p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setRole("member")}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${role === "member" ? "bg-white text-sky-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Member
              </button>
              <button
                type="button"
                onClick={() => setRole("vendor")}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${role === "vendor" ? "bg-white text-sky-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Vendor
              </button>
              <button
                type="button"
                onClick={() => setRole("admin")}
                className={`flex-1 py-2 text-xs font-bold rounded-md transition-all ${role === "admin" ? "bg-white text-sky-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                Admin
              </button>
            </div>

            {/* Dynamic Fields */}
            {role === "member" && (
              <div className="space-y-4 animate-in slide-in-from-top-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 ml-1">Company ID</label>
                  <div className="relative">
                    <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 z-10" />
                    <input 
                      type="text" 
                      placeholder="Enter Company ID" 
                      className="w-full pl-10 pr-4 py-2.5 glass-input outline-none focus:ring-2 focus:ring-sky-500/50"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 ml-1">Staff ID</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 z-10" />
                    <input 
                      type="text" 
                      placeholder="Enter Staff ID" 
                      className="w-full pl-10 pr-4 py-2.5 glass-input outline-none focus:ring-2 focus:ring-sky-500/50"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {role === "vendor" && (
              <div className="space-y-4 animate-in slide-in-from-top-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 ml-1">Vendor ID</label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 z-10" />
                    <input 
                      type="text" 
                      placeholder="Enter Vendor ID" 
                      className="w-full pl-10 pr-4 py-2.5 glass-input outline-none focus:ring-2 focus:ring-sky-500/50"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            {role === "admin" && (
              <div className="space-y-4 animate-in slide-in-from-top-2">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 ml-1">Username / Staff ID</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 z-10" />
                    <input 
                      type="text" 
                      placeholder="Enter Admin ID" 
                      className="w-full pl-10 pr-4 py-2.5 glass-input outline-none focus:ring-2 focus:ring-sky-500/50"
                      required
                    />
                  </div>
                </div>
              </div>
            )}

            <GlassButton type="submit" className="w-full mt-2" isLoading={loading}>
              <Mail className="w-4 h-4 mr-2" />
              Send Recovery Email
            </GlassButton>
          </form>
        ) : (
          <div className="text-center space-y-4 py-4 animate-in fade-in zoom-in-95">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-2">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">Check your email</h3>
              <p className="text-sm text-slate-500 mt-2">
                We&apos;ve sent a temporary password to the email address associated with this account.
              </p>
            </div>
            <GlassButton variant="secondary" onClick={() => {
              if (role === 'member') router.push('/member/login');
              else if (role === 'vendor') router.push('/provider/login');
              else router.push('/admin/login');
            }} className="w-full">
              Back to Login
            </GlassButton>
          </div>
        )}

        {!success && (
          <Link href={role === 'member' ? '/member/login' : role === 'vendor' ? '/provider/login' : '/admin/login'} className="text-sm text-slate-400 hover:text-slate-600 flex items-center gap-2 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Login
          </Link>
        )}
      </GlassCard>
    </div>
  );
}
