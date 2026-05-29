"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { GlassButton } from "@/components/ui/GlassButton";
import { 
  Search, 
  Plus, 
  Filter, 
  MoreVertical
} from "lucide-react";
import { useState } from "react";

export default function CustomerMembersPage() {
  const [searchTerm, setSearchTerm] = useState("");

  const employees = [
    { id: "TC-001", name: "John Doe", email: "john@techcorp.com", role: "Manager", plan: "Gold Family", status: "Active" },
    { id: "TC-002", name: "Sarah Connor", email: "sarah@techcorp.com", role: "Engineer", plan: "Silver Individual", status: "Active" },
    { id: "TC-003", name: "Mike Ross", email: "mike@techcorp.com", role: "Associate", plan: "Silver Individual", status: "Active" },
    { id: "TC-004", name: "Jessica Pearson", email: "jessica@techcorp.com", role: "Director", plan: "Platinum Executive", status: "Active" },
    { id: "TC-005", name: "Louis Litt", email: "louis@techcorp.com", role: "Partner", plan: "Gold Family", status: "Inactive" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Employee Management</h1>
          <p className="text-slate-500">Manage your company&apos;s insured members.</p>
        </div>
        <GlassButton className="gap-2 bg-sky-600 hover:bg-sky-700 text-white border-sky-500">
          <Plus className="w-4 h-4" />
          Add Employee
        </GlassButton>
      </div>

      <GlassCard className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search employees by name, ID or email..." 
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <GlassButton variant="secondary" className="gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </GlassButton>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-3 font-medium">Employee</th>
                <th className="px-6 py-3 font-medium">Role</th>
                <th className="px-6 py-3 font-medium">Plan</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center text-sky-600 font-bold text-xs">
                        {emp.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{emp.name}</div>
                        <div className="text-xs text-slate-500">{emp.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{emp.role}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-full bg-slate-100 text-xs font-medium text-slate-600 border border-slate-200">
                      {emp.plan}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                      emp.status === 'Active' 
                        ? 'bg-emerald-50 text-emerald-600 border-emerald-100' 
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {emp.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button className="text-slate-400 hover:text-sky-600 transition-colors">
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
