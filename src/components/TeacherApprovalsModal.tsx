import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { logAuditEvent } from '../lib/audit';
import { X, Check, Trash2, ShieldAlert } from 'lucide-react';

interface TeacherApprovalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApprovalsUpdated: () => void;
}

export const TeacherApprovalsModal: React.FC<TeacherApprovalsModalProps> = ({
  isOpen,
  onClose,
  onApprovalsUpdated,
}) => {
  const { userProfile } = useAuth();
  const [pendingTeachers, setPendingTeachers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchPendingTeachers = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'users'),
        where('role', '==', 'teacher'),
        where('approved', '==', false)
      );
      const snap = await getDocs(q);
      const list: UserProfile[] = [];
      snap.forEach((d) => {
        list.push(d.data() as UserProfile);
      });
      setPendingTeachers(list);
    } catch (err) {
      console.error('Error fetching pending teachers:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchPendingTeachers();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApprove = async (teacher: UserProfile) => {
    if (!userProfile) return;
    try {
      await updateDoc(doc(db, 'users', teacher.uid), {
        approved: true,
        approvedAt: new Date().toISOString(),
        approvedByUid: userProfile.uid,
        approvedByName: userProfile.displayName,
      });

      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        userProfile.role,
        'TEACHER_APPROVED',
        `Approved teacher account for ${teacher.displayName} (${teacher.email})`
      );

      setActionMessage(`Approved teacher account for ${teacher.displayName}.`);
      await fetchPendingTeachers();
      onApprovalsUpdated();
    } catch (err) {
      console.error('Failed to approve teacher:', err);
      setActionMessage('Failed to approve teacher.');
    }
  };

  const handleReject = async (teacher: UserProfile) => {
    if (!userProfile) return;
    if (!confirm(`Are you sure you want to reject and remove ${teacher.displayName}?`)) return;

    try {
      await deleteDoc(doc(db, 'users', teacher.uid));

      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        userProfile.role,
        'TEACHER_REJECTED',
        `Rejected teacher registration for ${teacher.displayName} (${teacher.email})`
      );

      setActionMessage(`Rejected registration for ${teacher.displayName}.`);
      await fetchPendingTeachers();
      onApprovalsUpdated();
    } catch (err) {
      console.error('Failed to reject teacher:', err);
      setActionMessage('Failed to reject teacher.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-xl w-full p-6 text-zinc-200">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-mono font-semibold text-zinc-100 uppercase tracking-wide">
              Teacher Account Approvals
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 p-1 rounded hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {actionMessage && (
          <div className="mb-4 text-xs font-mono bg-zinc-800 border border-zinc-700 text-zinc-300 p-2.5 rounded">
            {actionMessage}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center font-mono text-xs text-zinc-400">
            Loading pending teacher requests...
          </div>
        ) : pendingTeachers.length === 0 ? (
          <div className="py-8 text-center text-xs font-mono text-zinc-400 bg-zinc-950/40 rounded border border-zinc-800/60 p-4">
            No pending teacher approval requests found.
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
            {pendingTeachers.map((t) => (
              <div
                key={t.uid}
                className="bg-zinc-950 border border-zinc-800 rounded p-3 flex items-center justify-between gap-4 text-xs font-mono"
              >
                <div>
                  <div className="text-zinc-100 font-medium">{t.displayName}</div>
                  <div className="text-zinc-400 text-[11px]">{t.email}</div>
                  <div className="text-zinc-400 text-[10px] mt-1">
                    Requested:{' '}
                    {t.createdAt
                      ? new Date(t.createdAt).toLocaleDateString()
                      : 'Recently'}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(t)}
                    className="px-2.5 py-1 rounded bg-sky-900/80 hover:bg-sky-800 border border-sky-700 text-sky-200 font-medium flex items-center gap-1 transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(t)}
                    className="px-2.5 py-1 rounded bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 border-t border-zinc-800 pt-3 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded border border-zinc-700 text-zinc-300 text-xs font-mono hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
