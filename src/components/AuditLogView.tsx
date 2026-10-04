import React, { useEffect, useState } from 'react';
import { collection, query, getDocs, limit, orderBy } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AuditLogEntry, AuditActionType } from '../types';
import { ShieldCheck, Search, Filter, History } from 'lucide-react';

export const AuditLogView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'auditLogs'),
        orderBy('timestamp', 'desc'),
        limit(100)
      );
      const snap = await getDocs(q);
      const list: AuditLogEntry[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as object) } as AuditLogEntry);
      });
      setLogs(list);
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const filteredLogs = logs.filter((log) => {
    if (filterAction !== 'ALL' && log.action !== filterAction) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        log.userName?.toLowerCase().includes(q) ||
        log.details?.toLowerCase().includes(q) ||
        log.action?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3 mb-4 font-mono text-xs">
        <div>
          <h3 className="text-sm font-bold text-zinc-100 uppercase flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-sky-400" />
            Security & System Audit Log
          </h3>
          <p className="text-zinc-400 text-[11px]">
            Immutable chronological audit history of account logins, attendance overrides, teacher approvals & roster changes
          </p>
        </div>

        <button
          onClick={fetchAuditLogs}
          className="px-3 py-1.5 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium self-start sm:self-auto"
        >
          Refresh Log
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4 font-mono text-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by user name or action details..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded pl-9 pr-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-[11px] shrink-0">Filter Action:</span>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-700"
          >
            <option value="ALL">All Actions</option>
            <option value="LOGIN">LOGIN</option>
            <option value="ATTENDANCE_OVERRIDE">ATTENDANCE_OVERRIDE</option>
            <option value="ATTENDANCE_MARKED">ATTENDANCE_MARKED</option>
            <option value="TEACHER_APPROVED">TEACHER_APPROVED</option>
            <option value="STUDENT_ADDED">STUDENT_ADDED</option>
            <option value="STUDENT_REMOVED">STUDENT_REMOVED</option>
            <option value="CLASS_CREATED">CLASS_CREATED</option>
            <option value="ASSIGNMENT_CREATED">ASSIGNMENT_CREATED</option>
            <option value="WORK_GRADED">WORK_GRADED</option>
          </select>
        </div>
      </div>

      {/* Audit Log Stream - Mobile Cards (< md) & Desktop Table (>= md) */}
      {loading ? (
        <div className="text-center py-8 font-mono text-xs text-zinc-400">
          Loading audit log stream...
        </div>
      ) : filteredLogs.length === 0 ? (
        <div className="text-center py-8 font-mono text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded p-4">
          No audit log entries matching current search filter.
        </div>
      ) : (
        <>
          {/* Mobile Cards Layout (< md) */}
          <div className="md:hidden space-y-3 font-mono text-xs">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-3.5 space-y-2"
              >
                <div className="flex items-start justify-between gap-2 border-b border-zinc-800 pb-2">
                  <div>
                    <span className="text-zinc-200 font-bold block">{log.userName}</span>
                    <span className="text-[10px] text-zinc-500 uppercase">{log.userRole}</span>
                  </div>

                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase border shrink-0 ${
                      log.action === 'ATTENDANCE_OVERRIDE'
                        ? 'bg-amber-950 text-amber-300 border-amber-800'
                        : log.action === 'TEACHER_APPROVED'
                        ? 'bg-purple-950 text-purple-300 border-purple-800'
                        : log.action === 'LOGIN'
                        ? 'bg-zinc-950 text-zinc-400 border-zinc-800'
                        : 'bg-sky-950 text-sky-300 border-sky-800'
                    }`}
                  >
                    {log.action}
                  </span>
                </div>

                <div className="text-zinc-300 font-sans text-xs leading-relaxed">
                  {log.details}
                </div>

                <div className="text-[10px] text-zinc-500 pt-1 border-t border-zinc-800/80">
                  {new Date(log.timestamp).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table Layout (>= md) */}
          <div className="hidden md:block border border-zinc-800 rounded-lg bg-zinc-900">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-950 text-zinc-400 border-b border-zinc-800 uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Action Type</th>
                  <th className="py-3 px-4">Audit Log Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-800/50 transition-colors">
                    <td className="py-3 px-4 text-zinc-400 text-[11px] whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="py-3 px-4 text-zinc-200 font-medium whitespace-nowrap">
                      {log.userName}
                      <span className="text-[10px] text-zinc-500 block uppercase">
                        {log.userRole}
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                          log.action === 'ATTENDANCE_OVERRIDE'
                            ? 'bg-amber-950 text-amber-300 border-amber-800'
                            : log.action === 'TEACHER_APPROVED'
                            ? 'bg-purple-950 text-purple-300 border-purple-800'
                            : log.action === 'LOGIN'
                            ? 'bg-zinc-950 text-zinc-400 border-zinc-800'
                            : 'bg-sky-950 text-sky-300 border-sky-800'
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-zinc-300 text-xs font-sans">
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
