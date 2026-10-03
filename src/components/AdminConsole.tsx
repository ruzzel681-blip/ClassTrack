import React, { useEffect, useMemo, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteField } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { logAuditEvent } from '../lib/audit';
import { UserAvatar } from './UserAvatar';
import { AuditLogView } from './AuditLogView';
import {
  ShieldCheck,
  Check,
  X,
  RotateCcw,
  Search,
  LogOut,
  Sun,
  Moon,
  Clock,
  History,
  Users,
} from 'lucide-react';

type TeacherState = 'pending' | 'approved' | 'revoked';
type Filter = TeacherState | 'all';

const stateOf = (t: UserProfile): TeacherState =>
  t.approved ? 'approved' : t.revoked ? 'revoked' : 'pending';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'revoked', label: 'Revoked / Rejected' },
  { id: 'all', label: 'All' },
];

const BADGE: Record<TeacherState, string> = {
  pending: 'text-amber-300 bg-amber-950/60 border-amber-800/80',
  approved: 'text-emerald-300 bg-emerald-950/60 border-emerald-800/80',
  revoked: 'text-red-300 bg-red-950/60 border-red-800/80',
};

export const AdminConsole: React.FC = () => {
  const { userProfile, logout, theme, toggleTheme } = useAuth();
  const [tab, setTab] = useState<'teachers' | 'audit'>('teachers');
  const [teachers, setTeachers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending');
  const [search, setSearch] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<UserProfile | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'teacher'));
    return onSnapshot(
      q,
      (snap) => {
        setTeachers(snap.docs.map((d) => d.data() as UserProfile));
        setLoading(false);
      },
      (err) => {
        console.error('Error loading teachers:', err);
        setMessage('Could not load teachers. Check that the Firestore rules are deployed.');
        setLoading(false);
      }
    );
  }, []);

  const counts = useMemo(
    () => ({
      pending: teachers.filter((t) => stateOf(t) === 'pending').length,
      approved: teachers.filter((t) => stateOf(t) === 'approved').length,
      revoked: teachers.filter((t) => stateOf(t) === 'revoked').length,
    }),
    [teachers]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return teachers
      .filter((t) => filter === 'all' || stateOf(t) === filter)
      .filter(
        (t) =>
          !q ||
          (t.displayName || '').toLowerCase().includes(q) ||
          (t.email || '').toLowerCase().includes(q) ||
          (t.department || '').toLowerCase().includes(q)
      )
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [teachers, filter, search]);

  if (!userProfile) return null;

  const approve = async (t: UserProfile) => {
    const wasRevoked = stateOf(t) === 'revoked';
    setBusyUid(t.uid);
    try {
      await updateDoc(doc(db, 'users', t.uid), {
        approved: true,
        approvedAt: new Date().toISOString(),
        approvedByUid: userProfile.uid,
        approvedByName: userProfile.displayName,
        revoked: false,
        revokedReason: deleteField(),
        revokedAt: deleteField(),
        revokedByUid: deleteField(),
        revokedByName: deleteField(),
        updatedAt: new Date().toISOString(),
      });
      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        'admin',
        wasRevoked ? 'TEACHER_RESTORED' : 'TEACHER_APPROVED',
        `${wasRevoked ? 'Restored' : 'Approved'} teacher account for ${t.displayName} (${t.email})`
      );
      setMessage(`${wasRevoked ? 'Restored access for' : 'Approved'} ${t.displayName}.`);
    } catch (err: any) {
      console.error(err);
      setMessage(`Failed to approve: ${err.message}`);
    }
    setBusyUid(null);
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    const t = revokeTarget;
    const wasApproved = stateOf(t) === 'approved';
    const finalReason =
      reason.trim() ||
      (wasApproved ? 'Teacher access was revoked by an administrator.' : 'Registration was not approved by an administrator.');
    setBusyUid(t.uid);
    try {
      await updateDoc(doc(db, 'users', t.uid), {
        approved: false,
        revoked: true,
        revokedReason: finalReason,
        revokedAt: new Date().toISOString(),
        revokedByUid: userProfile.uid,
        revokedByName: userProfile.displayName,
        updatedAt: new Date().toISOString(),
      });
      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        'admin',
        wasApproved ? 'TEACHER_REVOKED' : 'TEACHER_REJECTED',
        `${wasApproved ? 'Revoked teacher access for' : 'Rejected teacher registration for'} ${t.displayName} (${t.email}). Reason: ${finalReason}`
      );
      setMessage(`${wasApproved ? 'Revoked access for' : 'Rejected'} ${t.displayName}.`);
      setRevokeTarget(null);
      setReason('');
    } catch (err: any) {
      console.error(err);
      setMessage(`Failed to update: ${err.message}`);
    }
    setBusyUid(null);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans flex flex-col">
      {/* Top bar */}
      <header className="w-full border-b border-zinc-800/80 bg-zinc-950 px-4 sm:px-8 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold font-mono text-sm shrink-0">
            CT
          </div>
          <span className="font-mono text-base sm:text-lg font-bold tracking-tight text-zinc-100">ClassTrack</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border border-sky-800 bg-sky-950/70 text-sky-300 font-semibold uppercase">
            <ShieldCheck className="w-3 h-3" /> Admin
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden sm:flex items-center gap-2 mr-1">
            <UserAvatar displayName={userProfile.displayName} avatar={userProfile.avatar} size="sm" />
            <span className="text-xs font-mono text-zinc-300 max-w-[140px] truncate">{userProfile.displayName}</span>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl border border-zinc-700 bg-zinc-900/90 hover:bg-zinc-800 cursor-pointer"
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-600" />}
          </button>
          <button
            onClick={logout}
            className="px-3 py-2 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-xs font-mono flex items-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Tabs */}
        <div className="flex gap-2 font-mono text-xs">
          {[
            { id: 'teachers' as const, label: 'Teachers', icon: Users },
            { id: 'audit' as const, label: 'Audit Log', icon: History },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-3.5 py-2 rounded-lg border flex items-center gap-1.5 cursor-pointer transition-colors ${
                tab === id
                  ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                  : 'border-zinc-800 text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {id === 'teachers' && counts.pending > 0 && (
                <span className="ml-1 px-1.5 rounded-full bg-amber-500 text-zinc-950 font-bold text-[10px]">
                  {counts.pending}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'audit' && <AuditLogView />}

        {tab === 'teachers' && (
          <>
            <div>
              <h1 className="text-lg font-mono font-bold text-zinc-100 uppercase tracking-wide">
                Teacher Management
              </h1>
              <p className="text-xs text-zinc-400 mt-1">
                Approve new teachers and revoke access. A revoked teacher is locked out immediately, even if signed in.
              </p>
            </div>

            {message && (
              <div className="flex items-start justify-between gap-3 text-xs font-mono bg-zinc-900 border border-zinc-700 text-zinc-300 p-2.5 rounded">
                <span>{message}</span>
                <button onClick={() => setMessage(null)} className="text-zinc-500 hover:text-zinc-200 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Filters + search */}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-mono cursor-pointer transition-colors ${
                      filter === f.id
                        ? 'bg-zinc-800 border-zinc-600 text-zinc-100'
                        : 'border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                    }`}
                  >
                    {f.label}
                    {f.id !== 'all' && <span className="ml-1.5 opacity-70">{counts[f.id]}</span>}
                  </button>
                ))}
              </div>
              <div className="relative sm:w-64">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, department..."
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-xl pl-9 pr-3 py-2 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
                />
              </div>
            </div>

            {/* List */}
            {loading ? (
              <div className="py-10 text-center font-mono text-xs text-zinc-400">Loading teachers...</div>
            ) : visible.length === 0 ? (
              <div className="py-10 text-center text-xs font-mono text-zinc-400 bg-zinc-900/40 rounded border border-zinc-800 p-4">
                {filter === 'pending' ? 'No teachers are waiting for approval.' : 'No teachers match this filter.'}
              </div>
            ) : (
              <div className="space-y-3">
                {visible.map((t) => {
                  const st = stateOf(t);
                  return (
                    <div
                      key={t.uid}
                      className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <UserAvatar displayName={t.displayName} avatar={t.avatar} size="md" role="teacher" />
                        <div className="min-w-0 text-xs font-mono">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-zinc-100 font-semibold text-sm truncate">{t.displayName}</span>
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] uppercase font-bold ${BADGE[st]}`}>
                              {st}
                            </span>
                          </div>
                          <div className="text-zinc-400 mt-0.5">{t.email}</div>
                          <div className="text-zinc-500 text-[10px] mt-1 flex flex-wrap items-center gap-x-3">
                            {t.department && <span>{t.department}</span>}
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Registered {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'recently'}
                            </span>
                          </div>
                          {st === 'revoked' && t.revokedReason && (
                            <div className="text-red-300/90 text-[11px] mt-1.5">Reason: {t.revokedReason}</div>
                          )}
                          {st === 'approved' && t.approvedByName && (
                            <div className="text-zinc-500 text-[10px] mt-1">Approved by {t.approvedByName}</div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 self-end sm:self-center text-xs font-mono">
                        {st !== 'revoked' && (
                          <button
                            onClick={() => {
                              setRevokeTarget(t);
                              setReason('');
                            }}
                            disabled={busyUid === t.uid}
                            className="px-3 py-1.5 rounded bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" />
                            {st === 'approved' ? 'Revoke' : 'Reject'}
                          </button>
                        )}
                        {st !== 'approved' && (
                          <button
                            onClick={() => approve(t)}
                            disabled={busyUid === t.uid}
                            className="px-3 py-1.5 rounded bg-sky-900/80 hover:bg-sky-800 border border-sky-700 text-sky-200 font-medium flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {st === 'revoked' ? <RotateCcw className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                            {st === 'revoked' ? 'Restore' : 'Approve'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Revoke / reject modal */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full p-6 text-zinc-200 space-y-4">
            <div>
              <h2 className="text-base font-mono font-semibold text-zinc-100 uppercase tracking-wide">
                {stateOf(revokeTarget) === 'approved' ? 'Revoke teacher access?' : 'Reject registration?'}
              </h2>
              <p className="text-xs text-zinc-400 mt-1.5 leading-relaxed">
                {revokeTarget.displayName} ({revokeTarget.email}) will lose teacher access
                {stateOf(revokeTarget) === 'approved' ? ' right away, even if currently signed in' : ''}. You can restore
                them later.
              </p>
            </div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Reason (optional, shown to the teacher)"
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-blue-500 rounded-xl px-3 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none"
            />
            <div className="flex justify-end gap-2 text-xs font-mono">
              <button
                onClick={() => {
                  setRevokeTarget(null);
                  setReason('');
                }}
                className="px-4 py-1.5 rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmRevoke}
                disabled={busyUid === revokeTarget.uid}
                className="px-4 py-1.5 rounded bg-red-900 hover:bg-red-800 border border-red-700 text-red-100 cursor-pointer disabled:opacity-50"
              >
                {stateOf(revokeTarget) === 'approved' ? 'Revoke access' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
