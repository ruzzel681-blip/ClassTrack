import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AttendanceRecord, StudentInfo } from '../types';
import { X, Calendar, History, AlertTriangle } from 'lucide-react';

interface StudentAttendanceHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: StudentInfo;
  classId: string;
}

export const StudentAttendanceHistoryModal: React.FC<StudentAttendanceHistoryModalProps> = ({
  isOpen,
  onClose,
  student,
  classId,
}) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen || !student || !classId) return;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const q = query(
          collection(db, 'attendance'),
          where('classId', '==', classId),
          where('studentUid', '==', student.uid)
        );
        const snap = await getDocs(q);
        const list: AttendanceRecord[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...(d.data() as object) } as AttendanceRecord);
        });

        // Sort date descending
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setRecords(list);
      } catch (err) {
        console.error('Error fetching student attendance history:', err);
      }
      setLoading(false);
    };

    fetchHistory();
  }, [isOpen, student, classId]);

  if (!isOpen) return null;

  const total = records.length;
  const present = records.filter((r) => r.status === 'present').length;
  const late = records.filter((r) => r.status === 'late').length;
  const absent = records.filter((r) => r.status === 'absent').length;
  const rate = total > 0 ? Math.round(((present + late * 0.5) / total) * 100) : 100;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 font-sans">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-2xl w-full p-6 text-zinc-200">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
          <div>
            <h2 className="text-base font-mono font-bold text-zinc-100 uppercase tracking-wide">
              Attendance History: {student.displayName}
            </h2>
            <p className="text-xs font-mono text-zinc-400 mt-0.5">
              ID: {student.studentId} • Email: {student.email}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-100 p-1 rounded hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-2 bg-zinc-950 p-3 border border-zinc-800 rounded mb-4 font-mono text-center text-xs">
          <div>
            <div className="text-zinc-400 text-[10px] uppercase">Attendance Rate</div>
            <div className={`text-base font-bold ${rate < 85 ? 'text-red-400' : 'text-emerald-400'}`}>
              {rate}%
            </div>
          </div>
          <div>
            <div className="text-zinc-400 text-[10px] uppercase">Present</div>
            <div className="text-base font-bold text-emerald-400">{present}</div>
          </div>
          <div>
            <div className="text-zinc-400 text-[10px] uppercase">Late</div>
            <div className="text-base font-bold text-amber-400">{late}</div>
          </div>
          <div>
            <div className="text-zinc-400 text-[10px] uppercase">Absent</div>
            <div className="text-base font-bold text-red-400">{absent}</div>
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs font-mono text-zinc-400">
            Loading attendance history log...
          </div>
        ) : records.length === 0 ? (
          <div className="py-8 text-center text-xs font-mono text-zinc-400 bg-zinc-950 p-4 border border-zinc-800/60 rounded">
            No recorded attendance logs for this student yet.
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto border border-zinc-800 rounded bg-zinc-950">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900 text-zinc-400 uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Marked By</th>
                  <th className="py-2.5 px-3">Override Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-900/50">
                    <td className="py-2.5 px-3 text-zinc-200 font-medium">
                      {r.date}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          r.status === 'present'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : r.status === 'late'
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-red-950 text-red-400 border border-red-800'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                      {r.markedByName || 'Teacher'}
                    </td>
                    <td className="py-2.5 px-3 text-zinc-400 text-[11px]">
                      {r.overrides && r.overrides.length > 0 ? (
                        <div className="space-y-1">
                          {r.overrides.map((ov, idx) => (
                            <div
                              key={idx}
                              className="text-amber-300 bg-amber-950/40 border border-amber-900/50 p-1.5 rounded text-[10px]"
                            >
                              <div className="font-semibold flex items-center gap-1">
                                <History className="w-3 h-3 text-amber-400" />
                                Overridden from {ov.previousStatus} to {ov.newStatus} by {ov.modifiedByName}
                              </div>
                              {ov.reason && <div className="mt-0.5 text-zinc-300">"{ov.reason}"</div>}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-zinc-800 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded border border-zinc-700 text-zinc-300 font-mono text-xs hover:bg-zinc-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
