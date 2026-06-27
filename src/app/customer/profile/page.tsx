"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { Building2, Mail, Phone, MapPin, Save } from "lucide-react";

export default function CustomerProfilePage() {
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Company Profile</h1>
          <p className="text-sm text-slate-500">Manage company details and billing information.</p>
        </div>
        <GlassButton className="gap-2 bg-sky-600 hover:bg-sky-700 text-white border-sky-500">
          <Save className="w-4 h-4" />
          Save Changes
        </GlassButton>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <GlassCard className="space-y-6">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-sky-500" />
              Company Details
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Company Name</label>
                <input 
                  type="text" 
                  defaultValue="Tech Corp Sdn Bhd"
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
                  disabled
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Company ID</label>
                <input 
                  type="text" 
                  defaultValue="CMP-001"
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
                  disabled
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Registration No.</label>
                <input 
                  type="text" 
                  defaultValue="202301001234"
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Industry</label>
                <input 
                  type="text" 
                  defaultValue="Technology / Software"
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-white"
                />
              </div>
            </div>
          </GlassCard>

          <GlassCard className="space-y-6">
            <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-sky-500" />
              Contact Information
            </h2>
            
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Address</label>
                <textarea 
                  defaultValue="Level 32, Menara Tech, Jalan Tun Razak, 50400 Kuala Lumpur"
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 bg-white h-24 resize-none"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">HR Contact Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="email" 
                      defaultValue="hr@techcorp.com"
                      className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      defaultValue="+603-2100 8888"
                      className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>

        <div className="space-y-6">
          <GlassCard className="bg-gradient-to-br from-sky-500 to-blue-600 text-white border-none">
            <h3 className="font-bold mb-2">Current Plan</h3>
            <p className="text-sm opacity-90 mb-4">Corporate Gold Package</p>
            <div className="space-y-2 text-sm opacity-80 mb-6">
              <p>• 150 Employees Covered</p>
              <p>• Outpatient + Specialist + Dental</p>
              <p>• RM 50,000 Annual Limit / pax</p>
            </div>
            <GlassButton className="w-full bg-white/20 hover:bg-white/30 text-white border-white/20">
              View Plan Details
            </GlassButton>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
