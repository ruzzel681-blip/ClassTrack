import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Classroom, AttendanceRecord, StudentInfo } from '../types';
import {
  FileText,
  Download,
  Printer,
  AlertTriangle,
  Users,
  CheckCircle,
  Clock,
  XCircle,
  Filter,
} from 'lucide-react';

interface ReportsViewProps {
  classroom: Classroom;
}

interface StudentReportSummary {
  student: StudentInfo;
  totalDays: number;
  present: number;
  late: number;
  absent: number;
  attendanceRate: number;
  atRisk: boolean;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ classroom }) => {
  const [reports, setReports] = useState<StudentReportSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState<number>(85);
  const [filterMode, setFilterMode] = useState<'all' | 'at_risk'>('all');

  const fetchClassReportData = async () => {
    setLoading(true);
    try {
      const uids = classroom.studentUids || [];
      const studentList: StudentInfo[] = [];

      if (uids.length > 0) {
        const qUsers = query(collection(db, 'users'), where('uid', 'in', uids.slice(0, 30)));
        const userSnap = await getDocs(qUsers);
        userSnap.forEach((d) => {
          const u = d.data();
          studentList.push({
            uid: u.uid,
            studentId: u.studentId || classroom.studentsMap?.[u.uid]?.studentId || 'N/A',
            displayName: u.displayName || 'Student',
            email: u.email || '',
          });
        });
      }

      // Query all attendance records for classroom
      const qAtt = query(collection(db, 'attendance'), where('classId', '==', classroom.id));
      const attSnap = await getDocs(qAtt);

      const statsMap: Record<
        string,
        { totalDays: number; present: number; late: number; absent: number }
      > = {};

      attSnap.forEach((d) => {
        const r = d.data() as AttendanceRecord;
        if (!statsMap[r.studentUid]) {
          statsMap[r.studentUid] = { totalDays: 0, present: 0, late: 0, absent: 0 };
        }
        statsMap[r.studentUid].totalDays += 1;
        if (r.status === 'present') statsMap[r.studentUid].present += 1;
        else if (r.status === 'late') statsMap[r.studentUid].late += 1;
        else if (r.status === 'absent') statsMap[r.studentUid].absent += 1;
      });

      const list: StudentReportSummary[] = studentList.map((st) => {
        const stStats = statsMap[st.uid] || { totalDays: 0, present: 0, late: 0, absent: 0 };
        const rate =
          stStats.totalDays > 0
            ? Math.round(((stStats.present + stStats.late * 0.5) / stStats.totalDays) * 100)
            : 100;

        return {
          student: st,
          totalDays: stStats.totalDays,
          present: stStats.present,
          late: stStats.late,
          absent: stStats.absent,
          attendanceRate: rate,
          atRisk: rate < threshold,
        };
      });

      // Sort by attendance rate ascending (at-risk top)
      list.sort((a, b) => a.attendanceRate - b.attendanceRate);
      setReports(list);
    } catch (err) {
      console.error('Error calculating class report:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchClassReportData();
  }, [classroom, threshold]);

  const filteredReports = reports.filter((r) => {
    if (filterMode === 'at_risk') return r.attendanceRate < threshold;
    return true;
  });

  const totalEnrolled = reports.length;
  const atRiskCount = reports.filter((r) => r.attendanceRate < threshold).length;
  const totalClassDays = reports.reduce((acc, r) => Math.max(acc, r.totalDays), 0);
  const avgRate =
    reports.length > 0
      ? Math.round(reports.reduce((acc, r) => acc + r.attendanceRate, 0) / reports.length)
      : 100;

  const handleExportCSV = () => {
    const headers = ['Student ID', 'Student Name', 'Email', 'Total Recorded Days', 'Present', 'Late', 'Absent', 'Attendance Rate (%)', 'Status'];
    const rows = filteredReports.map((r) => [
      r.student.studentId,
      `"${r.student.displayName}"`,
      r.student.email,
      r.totalDays,
      r.present,
      r.late,
      r.absent,
      `${r.attendanceRate}%`,
      r.attendanceRate < threshold ? 'AT RISK' : 'SATISFACTORY',
    ]);

    const csvContent = [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `ClassTrack_Attendance_Report_${classroom.name.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="font-sans">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-zinc-800 pb-3 mb-4 font-mono text-xs">
        <div>
          <h3 className="text-sm font-bold text-zinc-100 uppercase">
            Attendance & Risk Analytics
          </h3>
          <p className="text-zinc-400 text-[11px]">
            Comprehensive student attendance statistics & early intervention threshold alerts
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            Export CSV
          </button>
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium flex items-center gap-1.5 transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-zinc-400" />
            Print
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 font-mono text-xs">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3.5">
          <div className="text-zinc-400 text-[10px] uppercase">Class Average Rate</div>
          <div className="text-xl font-bold text-sky-400 mt-1">{avgRate}%</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3.5">
          <div className="text-zinc-400 text-[10px] uppercase">Enrolled Students</div>
          <div className="text-xl font-bold text-zinc-100 mt-1">{totalEnrolled}</div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3.5">
          <div className="text-zinc-400 text-[10px] uppercase">At-Risk Students (&lt;{threshold}%)</div>
          <div className={`text-xl font-bold mt-1 ${atRiskCount > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {atRiskCount}
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3.5">
          <div className="text-zinc-400 text-[10px] uppercase">Total Days Tracked</div>
          <div className="text-xl font-bold text-zinc-100 mt-1">{totalClassDays}</div>
        </div>
      </div>

      {/* Filter / Threshold bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3.5 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400" />
          <span className="text-zinc-300 font-medium">Filter View:</span>
          <div className="inline-flex bg-zinc-950 p-1 border border-zinc-800 rounded">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded text-[11px] uppercase font-bold transition-colors ${
                filterMode === 'all'
                  ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              All Students ({reports.length})
            </button>
            <button
              onClick={() => setFilterMode('at_risk')}
              className={`px-2.5 py-1 rounded text-[11px] uppercase font-bold transition-colors ${
                filterMode === 'at_risk'
                  ? 'bg-red-950 text-red-300 border border-red-800'
                  : 'text-zinc-400 hover:text-red-400'
              }`}
            >
              At-Risk Only ({atRiskCount})
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-[11px]">Risk Threshold:</span>
          <input
            type="number"
            min={50}
            max={100}
            value={threshold}
            onChange={(e) => setThreshold(parseInt(e.target.value) || 85)}
            className="w-16 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-zinc-100 text-center font-bold focus:outline-none focus:border-zinc-600"
          />
          <span className="text-zinc-400">%</span>
        </div>
      </div>

      {/* Report Table - Mobile Cards (< md) & Desktop Table (>= md) */}
      {loading ? (
        <div className="text-center py-8 font-mono text-xs text-zinc-400">
          Generating class attendance report...
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="text-center py-8 font-mono text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded p-4">
          No students matching the selected report threshold filter.
        </div>
      ) : (
        <>
          {/* Mobile Card Layout (< md) */}
          <div className="md:hidden space-y-3 font-mono text-xs">
            {filteredReports.map((r) => (
              <div
                key={r.student.uid}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-sm text-zinc-100">{r.student.displayName}</h4>
                    <p className="text-zinc-400 text-[11px]">ID: {r.student.studentId}</p>
                    <p className="text-zinc-500 text-[10px] truncate">{r.student.email}</p>
                  </div>

                  {r.attendanceRate < threshold ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 font-bold text-[10px] uppercase shrink-0">
                      <AlertTriangle className="w-3 h-3 text-red-400" />
                      At Risk
                    </span>
                  ) : (
                    <span className="inline-block px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold text-[10px] uppercase shrink-0">
                      Satisfactory
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-2.5 rounded border border-zinc-800/80 text-[11px]">
                  <div>
                    <span className="text-zinc-500 uppercase text-[9px] block">Attendance Rate</span>
                    <span
                      className={`font-bold text-sm ${
                        r.attendanceRate < threshold ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {r.attendanceRate}%
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 uppercase text-[9px] block">Days Breakdown</span>
                    <span className="text-zinc-200">
                      <span className="text-emerald-400 font-bold">{r.present}P</span> /{' '}
                      <span className="text-amber-400 font-bold">{r.late}L</span> /{' '}
                      <span className="text-red-400 font-bold">{r.absent}A</span>
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table Layout (>= md) */}
          <div className="hidden md:block border border-zinc-800 rounded-lg bg-zinc-900">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-950 text-zinc-400 border-b border-zinc-800 uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Present</th>
                  <th className="py-3 px-4">Late</th>
                  <th className="py-3 px-4">Absent</th>
                  <th className="py-3 px-4">Attendance Rate</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {filteredReports.map((r) => (
                  <tr key={r.student.uid} className="hover:bg-zinc-800/50 transition-colors">
                    <td className="py-3 px-4 text-zinc-300 font-semibold">{r.student.studentId}</td>
                    <td className="py-3 px-4 font-medium text-zinc-100">{r.student.displayName}</td>
                    <td className="py-3 px-4 text-zinc-400 text-[11px]">{r.student.email}</td>
                    <td className="py-3 px-4 text-emerald-400 font-semibold">{r.present}</td>
                    <td className="py-3 px-4 text-amber-400 font-semibold">{r.late}</td>
                    <td className="py-3 px-4 text-red-400 font-semibold">{r.absent}</td>
                    <td className="py-3 px-4 font-bold text-sm">
                      <span
                        className={
                          r.attendanceRate < threshold ? 'text-red-400' : 'text-emerald-400'
                        }
                      >
                        {r.attendanceRate}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {r.attendanceRate < threshold ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 font-bold text-[10px] uppercase">
                          <AlertTriangle className="w-3 h-3 text-red-400" />
                          At Risk
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold text-[10px] uppercase">
                          Good
                        </span>
                      )}
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
