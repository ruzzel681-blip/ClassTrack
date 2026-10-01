import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Classroom, StudentInfo, AttendanceRecord, UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { StudentAttendanceHistoryModal } from './StudentAttendanceHistoryModal';
import { UserAvatar } from './UserAvatar';
import { logAuditEvent } from '../lib/audit';
import {
  UserPlus,
  Users,
  Copy,
  Check,
  Search,
  Trash2,
  Eye,
  ShieldBan,
  ShieldCheck,
  MessageSquare,
  FileSpreadsheet,
  Upload,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';

interface StudentRosterProps {
  classroom: Classroom;
  onRosterUpdated: () => void;
  onStartMessage?: (recipient: UserProfile) => void;
}

export const StudentRoster: React.FC<StudentRosterProps> = ({
  classroom,
  onRosterUpdated,
  onStartMessage,
}) => {
  const { userProfile } = useAuth();
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [attendanceStatsMap, setAttendanceStatsMap] = useState<
    Record<string, { total: number; present: number; late: number; absent: number; rate: number }>
  >({});
  const [loading, setLoading] = useState(true);

  // Add student form modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [studentSearchInput, setStudentSearchInput] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  // Bulk CSV Import modal
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);

  // Copy code feedback
  const [copiedCode, setCopiedCode] = useState(false);

  // Filter search
  const [filterQuery, setFilterQuery] = useState('');

  // Selected student for history modal
  const [selectedStudent, setSelectedStudent] = useState<StudentInfo | null>(null);

  if (!userProfile) return null;

  const isTeacher = userProfile.role === 'teacher';
  const blockedUids = classroom.blockedStudentUids || [];

  const fetchRosterAndStats = async () => {
    setLoading(true);
    try {
      // Fetch student profiles for studentUids using chunking to avoid 30-item in-query limit
      const uids = classroom.studentUids || [];
      const studentList: StudentInfo[] = [];

      if (uids.length > 0) {
        for (let i = 0; i < uids.length; i += 30) {
          const chunk = uids.slice(i, i + 30);
          const qUsers = query(collection(db, 'users'), where('uid', 'in', chunk));
          const userSnap = await getDocs(qUsers);
          userSnap.forEach((d) => {
            const u = d.data();
            studentList.push({
              uid: u.uid,
              studentId: u.studentId || classroom.studentsMap?.[u.uid]?.studentId || 'N/A',
              displayName: u.displayName || 'Student',
              email: u.email || '',
              avatar: u.avatar || '',
            });
          });
        }
      }

      // Check for any students stored in studentsMap not yet found
      uids.forEach((uid) => {
        if (!studentList.some((s) => s.uid === uid) && classroom.studentsMap?.[uid]) {
          studentList.push(classroom.studentsMap[uid]);
        }
      });

      setStudents(studentList);

      // Fetch attendance records for this classroom to calculate stats per student
      const qAtt = query(collection(db, 'attendance'), where('classId', '==', classroom.id));
      const attSnap = await getDocs(qAtt);

      const statsMap: Record<
        string,
        { total: number; present: number; late: number; absent: number; rate: number }
      > = {};

      attSnap.forEach((d) => {
        const r = d.data() as AttendanceRecord;
        if (!statsMap[r.studentUid]) {
          statsMap[r.studentUid] = { total: 0, present: 0, late: 0, absent: 0, rate: 100 };
        }
        statsMap[r.studentUid].total += 1;
        if (r.status === 'present') statsMap[r.studentUid].present += 1;
        else if (r.status === 'late') statsMap[r.studentUid].late += 1;
        else if (r.status === 'absent') statsMap[r.studentUid].absent += 1;
      });

      // Calculate rates
      Object.keys(statsMap).forEach((uid) => {
        const s = statsMap[uid];
        s.rate =
          s.total > 0
            ? Math.round(((s.present + s.late * 0.5) / s.total) * 100)
            : 100;
      });

      setAttendanceStatsMap(statsMap);
    } catch (err) {
      console.error('Error fetching roster details:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRosterAndStats();
  }, [classroom]);

  const handleAddStudentByInput = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    setAdding(true);

    const term = studentSearchInput.trim();
    if (!term) return;

    try {
      // Search user by studentId or email
      let q = query(collection(db, 'users'), where('studentId', '==', term));
      let snap = await getDocs(q);

      if (snap.empty) {
        q = query(collection(db, 'users'), where('email', '==', term.toLowerCase()));
        snap = await getDocs(q);
      }

      if (snap.empty) {
        setAddError('No student account found matching that Student ID or Email.');
        setAdding(false);
        return;
      }

      const targetDoc = snap.docs[0];
      const targetData = targetDoc.data();

      if (classroom.studentUids?.includes(targetData.uid)) {
        setAddError('This student is already on the roster.');
        setAdding(false);
        return;
      }

      const updatedStudentUids = [...(classroom.studentUids || []), targetData.uid];
      const updatedStudentsMap = {
        ...(classroom.studentsMap || {}),
        [targetData.uid]: {
          uid: targetData.uid,
          studentId: targetData.studentId || 'N/A',
          displayName: targetData.displayName,
          email: targetData.email,
          avatar: targetData.avatar || '',
          joinedAt: new Date().toISOString(),
        },
      };

      await updateDoc(doc(db, 'classes', classroom.id), {
        studentUids: updatedStudentUids,
        studentsMap: updatedStudentsMap,
        updatedAt: new Date().toISOString(),
      });

      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        userProfile.role,
        'STUDENT_ADDED',
        `Teacher added student ${targetData.displayName} (${targetData.studentId || targetData.email}) to class.`,
        classroom.id
      );

      setShowAddModal(false);
      setStudentSearchInput('');
      onRosterUpdated();
      await fetchRosterAndStats();
    } catch (err) {
      console.error('Error adding student:', err);
      setAddError('Failed to add student to class.');
    }
    setAdding(false);
  };

  const handleBulkImportCsv = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkCsvText.trim()) return;
    setBulkError(null);
    setBulkSuccessMsg(null);
    setBulkImporting(true);

    try {
      const lines = bulkCsvText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length === 0) {
        setBulkError('No CSV data provided.');
        setBulkImporting(false);
        return;
      }

      const newUids = [...(classroom.studentUids || [])];
      const newMap = { ...(classroom.studentsMap || {}) };
      let importedCount = 0;

      for (const line of lines) {
        // Support header row skipping if line starts with 'id' or 'student'
        if (line.toLowerCase().startsWith('student id') || line.toLowerCase().startsWith('id,name')) {
          continue;
        }

        // Split by comma or semicolon or tab
        const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^["']|["']$/g, ''));
        if (parts.length < 2) continue;

        const studentId = parts[0] || 'STU-' + Math.floor(1000 + Math.random() * 9000);
        const displayName = parts[1] || 'Student ' + studentId;
        const email = parts[2] || `${studentId.toLowerCase()}@classtrack.edu`;

        // Check if user already exists
        let uid = '';
        const qEmail = query(collection(db, 'users'), where('email', '==', email.toLowerCase()));
        const snap = await getDocs(qEmail);

        if (!snap.empty) {
          uid = snap.docs[0].id;
        } else {
          // Generate UID for student profile
          uid = 'stu_' + studentId.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now().toString().slice(-4);
          const studentDocRef = doc(db, 'users', uid);
          await setDoc(studentDocRef, {
            uid,
            studentId,
            displayName,
            email: email.toLowerCase(),
            role: 'student',
            approved: true,
            createdAt: new Date().toISOString(),
          });
        }

        if (!newUids.includes(uid)) {
          newUids.push(uid);
        }

        newMap[uid] = {
          uid,
          studentId,
          displayName,
          email,
          joinedAt: new Date().toISOString(),
        };

        importedCount++;
      }

      await updateDoc(doc(db, 'classes', classroom.id), {
        studentUids: newUids,
        studentsMap: newMap,
        updatedAt: new Date().toISOString(),
      });

      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        userProfile.role,
        'STUDENT_ADDED',
        `Teacher bulk imported ${importedCount} students via CSV.`,
        classroom.id
      );

      setBulkSuccessMsg(`Successfully imported and enrolled ${importedCount} students!`);
      setBulkCsvText('');
      onRosterUpdated();
      await fetchRosterAndStats();
      setTimeout(() => {
        setShowBulkModal(false);
        setBulkSuccessMsg(null);
      }, 1500);
    } catch (err: any) {
      console.error('Error bulk importing students:', err);
      setBulkError(err.message || 'Failed to bulk import students.');
    }
    setBulkImporting(false);
  };

  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setBulkCsvText(content);
    };
    reader.readAsText(file);
  };

  const handleToggleBlockStudent = async (studentUid: string, name: string) => {
    const isCurrentlyBlocked = blockedUids.includes(studentUid);
    const actionLabel = isCurrentlyBlocked ? 'unblock' : 'block/restrict';
    if (!confirm(`Are you sure you want to ${actionLabel} ${name} from this classroom?`)) return;

    try {
      const newBlockedList = isCurrentlyBlocked
        ? blockedUids.filter((id) => id !== studentUid)
        : [...blockedUids, studentUid];

      await updateDoc(doc(db, 'classes', classroom.id), {
        blockedStudentUids: newBlockedList,
        updatedAt: new Date().toISOString(),
      });

      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        userProfile.role,
        isCurrentlyBlocked ? 'STUDENT_UNBLOCKED' : 'STUDENT_BLOCKED',
        `Teacher ${isCurrentlyBlocked ? 'unblocked' : 'blocked/restricted'} student ${name} in class.`,
        classroom.id
      );

      onRosterUpdated();
    } catch (err) {
      console.error('Error toggling student block status:', err);
    }
  };

  const handleRemoveStudent = async (studentUid: string, name: string) => {
    if (!confirm(`Remove ${name} from this classroom roster?`)) return;

    try {
      const updatedUids = (classroom.studentUids || []).filter((id) => id !== studentUid);
      const updatedBlocked = (classroom.blockedStudentUids || []).filter((id) => id !== studentUid);
      const updatedMap = { ...(classroom.studentsMap || {}) };
      delete updatedMap[studentUid];

      await updateDoc(doc(db, 'classes', classroom.id), {
        studentUids: updatedUids,
        blockedStudentUids: updatedBlocked,
        studentsMap: updatedMap,
        updatedAt: new Date().toISOString(),
      });

      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        userProfile.role,
        'STUDENT_REMOVED',
        `Teacher removed student ${name} from class roster.`,
        classroom.id
      );

      onRosterUpdated();
      await fetchRosterAndStats();
    } catch (err) {
      console.error('Error removing student:', err);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(classroom.joinCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const filteredStudents = students.filter(
    (s) =>
      s.displayName.toLowerCase().includes(filterQuery.toLowerCase()) ||
      s.studentId.toLowerCase().includes(filterQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <div className="font-sans">
      {/* Roster Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-zinc-950 border border-zinc-800 rounded text-zinc-400">
            <Users className="w-5 h-5 text-zinc-300" />
          </div>
          <div>
            <h3 className="text-sm font-mono font-bold text-zinc-100 uppercase">
              Class Roster ({students.length} Enrolled)
            </h3>
            <p className="text-xs font-mono text-zinc-400">
              Instructor: {classroom.teacherName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          {/* Join Code Display */}
          <div className="bg-zinc-950 border border-zinc-800 px-3 py-1.5 rounded flex items-center gap-2">
            <span className="text-zinc-400 text-[10px] uppercase">Join Code:</span>
            <span className="font-bold text-zinc-100 tracking-wider">{classroom.joinCode}</span>
            <button
              onClick={handleCopyCode}
              className="p-1 text-zinc-400 hover:text-zinc-100 rounded"
              title="Copy Join Code"
            >
              {copiedCode ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {isTeacher && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowBulkModal(true)}
                className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-semibold flex items-center gap-1.5 transition-colors"
                title="Bulk import roster from CSV"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                Bulk CSV
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-3 py-1.5 rounded bg-sky-900 hover:bg-sky-800 border border-sky-700 text-sky-100 font-semibold flex items-center gap-1.5 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Add Student
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter / Search input */}
      <div className="mb-4 relative font-mono text-xs max-w-sm">
        <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="Filter roster by Name or Student ID..."
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          className="w-full bg-zinc-900 border border-zinc-800 rounded pl-9 pr-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
        />
      </div>

      {/* Roster Table */}
      {loading ? (
        <div className="text-center py-8 font-mono text-xs text-zinc-400">
          Loading student roster...
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="text-center py-8 font-mono text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded p-4">
          No students found matching current roster filter.
        </div>
      ) : (
        <>
          {/* Mobile Card Layout (< md) */}
          <div className="md:hidden space-y-3 font-mono text-xs">
            {filteredStudents.map((s) => {
              const stats = attendanceStatsMap[s.uid] || {
                total: 0,
                present: 0,
                late: 0,
                absent: 0,
                rate: 100,
              };
              const isBlocked = blockedUids.includes(s.uid);

              return (
                <div
                  key={s.uid}
                  className={`bg-zinc-900 border rounded-lg p-4 space-y-3 ${
                    isBlocked ? 'border-red-900/60 bg-red-950/20' : 'border-zinc-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <UserAvatar
                        displayName={s.displayName}
                        avatar={s.avatar}
                        role="student"
                        size="sm"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <h4 className="font-bold text-sm text-zinc-100">{s.displayName}</h4>
                          {isBlocked && (
                            <span className="px-1.5 py-0.2 rounded bg-red-950 text-red-400 border border-red-800 text-[9px] uppercase font-bold">
                              Restricted
                            </span>
                          )}
                        </div>
                        <p className="text-zinc-400 text-[11px]">ID: {s.studentId}</p>
                        <p className="text-zinc-500 text-[10px] truncate">{s.email}</p>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold shrink-0 ${
                        stats.rate < 85
                          ? 'bg-red-950 text-red-400 border border-red-800'
                          : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      }`}
                    >
                      {stats.rate}% Rate
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] bg-zinc-950 p-2.5 rounded border border-zinc-800/80">
                    <span className="text-zinc-400">Recorded Stats ({stats.total} days):</span>
                    <span className="font-medium">
                      <span className="text-emerald-400 font-bold">{stats.present}P</span> /{' '}
                      <span className="text-amber-400 font-bold">{stats.late}L</span> /{' '}
                      <span className="text-red-400 font-bold">{stats.absent}A</span>
                    </span>
                  </div>

                  <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setSelectedStudent(s)}
                        className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 inline-flex items-center gap-1 text-[11px] font-medium"
                      >
                        <Eye className="w-3.5 h-3.5 text-zinc-400" />
                        History
                      </button>

                      {onStartMessage && (
                        <button
                          onClick={() =>
                            onStartMessage({
                              uid: s.uid,
                              displayName: s.displayName,
                              email: s.email,
                              role: 'student',
                              approved: true,
                              studentId: s.studentId,
                              avatar: s.avatar,
                              createdAt: '',
                            })
                          }
                          className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sky-400 inline-flex items-center gap-1 text-[11px]"
                          title="Message Student"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {isTeacher && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleToggleBlockStudent(s.uid, s.displayName)}
                          className={`p-1.5 rounded border transition-colors ${
                            isBlocked
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800 hover:bg-emerald-900'
                              : 'bg-zinc-800 text-amber-400 border-zinc-700 hover:bg-amber-950'
                          }`}
                          title={isBlocked ? 'Unblock Student' : 'Restrict/Block Student'}
                        >
                          {isBlocked ? (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          ) : (
                            <ShieldBan className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          onClick={() => handleRemoveStudent(s.uid, s.displayName)}
                          className="p-1.5 text-zinc-500 hover:text-red-400 rounded transition-colors"
                          title="Remove from Class"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table Layout (>= md) */}
          <div className="hidden md:block border border-zinc-800 rounded-lg bg-zinc-900">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-950 text-zinc-400 border-b border-zinc-800 uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4">Attendance Rate</th>
                  <th className="py-3 px-4">P / L / A</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {filteredStudents.map((s) => {
                  const stats = attendanceStatsMap[s.uid] || {
                    total: 0,
                    present: 0,
                    late: 0,
                    absent: 0,
                    rate: 100,
                  };
                  const isBlocked = blockedUids.includes(s.uid);
                  return (
                    <tr
                      key={s.uid}
                      className={`hover:bg-zinc-800/50 transition-colors ${
                        isBlocked ? 'bg-red-950/15' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar
                            displayName={s.displayName}
                            avatar={s.avatar}
                            role="student"
                            size="sm"
                          />
                          <div>
                            <span className="font-medium text-zinc-100 block">{s.displayName}</span>
                            <span className="text-[11px] text-zinc-500">{s.email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-zinc-300 font-mono font-semibold">
                        {s.studentId}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            stats.rate < 85
                              ? 'bg-red-950 text-red-400 border border-red-800'
                              : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          }`}
                        >
                          {stats.rate}% ({stats.total} days)
                        </span>
                      </td>
                      <td className="py-3 px-4 text-zinc-300 text-[11px]">
                        <span className="text-emerald-400">{stats.present}P</span> /{' '}
                        <span className="text-amber-400">{stats.late}L</span> /{' '}
                        <span className="text-red-400">{stats.absent}A</span>
                      </td>
                      <td className="py-3 px-4">
                        {isBlocked ? (
                          <span className="px-2 py-0.5 rounded bg-red-950 text-red-400 border border-red-800 text-[10px] uppercase font-bold">
                            Restricted
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 text-[10px] uppercase">
                            Enrolled
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5">
                        <button
                          onClick={() => setSelectedStudent(s)}
                          className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 inline-flex items-center gap-1 text-[11px]"
                          title="View Full Attendance History Log"
                        >
                          <Eye className="w-3.5 h-3.5 text-zinc-400" />
                          History
                        </button>

                        {onStartMessage && (
                          <button
                            onClick={() =>
                              onStartMessage({
                                uid: s.uid,
                                displayName: s.displayName,
                                email: s.email,
                                role: 'student',
                                approved: true,
                                studentId: s.studentId,
                                avatar: s.avatar,
                                createdAt: '',
                              })
                            }
                            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sky-400 inline-flex items-center gap-1 text-[11px]"
                            title="Direct Message"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {isTeacher && (
                          <>
                            <button
                              onClick={() => handleToggleBlockStudent(s.uid, s.displayName)}
                              className={`p-1 rounded inline-block transition-colors ${
                                isBlocked
                                  ? 'text-emerald-400 hover:text-emerald-300'
                                  : 'text-amber-400 hover:text-amber-300'
                              }`}
                              title={isBlocked ? 'Unblock Student' : 'Restrict/Block Student'}
                            >
                              {isBlocked ? (
                                <ShieldCheck className="w-4 h-4" />
                              ) : (
                                <ShieldBan className="w-4 h-4" />
                              )}
                            </button>

                            <button
                              onClick={() => handleRemoveStudent(s.uid, s.displayName)}
                              className="p-1 text-zinc-500 hover:text-red-400 rounded inline-block transition-colors"
                              title="Remove from Class"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Add Student Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full p-6 text-zinc-200 font-mono text-xs">
            <h2 className="text-base font-bold uppercase tracking-wide border-b border-zinc-800 pb-3 mb-4">
              Add Student to Class Roster
            </h2>
            <form onSubmit={handleAddStudentByInput} className="space-y-4">
              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1">
                  Student ID or Registered Email
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. STU-1001 or alex.r@school.edu"
                  value={studentSearchInput}
                  onChange={(e) => setStudentSearchInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>

              {addError && (
                <div className="bg-red-950/70 border border-red-900 text-red-300 p-2.5 rounded">
                  {addError}
                </div>
              )}

              <div className="bg-zinc-950 border border-zinc-800 p-2.5 rounded text-[11px] text-zinc-400">
                Note: Students can also join themselves directly using the Class Join Code ({classroom.joinCode}).
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setAddError(null);
                  }}
                  className="px-4 py-2 border border-zinc-700 text-zinc-400 rounded hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="px-4 py-2 bg-sky-900 hover:bg-sky-800 border border-sky-700 text-sky-100 font-semibold rounded disabled:opacity-50"
                >
                  {adding ? 'Adding...' : 'Add to Roster'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk CSV Import Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-xl w-full p-6 text-zinc-200 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <h2 className="text-base font-bold uppercase tracking-wide">
                  Bulk Import Students (CSV)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowBulkModal(false);
                  setBulkError(null);
                  setBulkSuccessMsg(null);
                }}
                className="p-1 text-zinc-400 hover:text-zinc-100 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleBulkImportCsv} className="space-y-4">
              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1.5 font-semibold">
                  Upload CSV File or Paste Raw CSV Data
                </label>
                <div className="mb-2">
                  <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 cursor-pointer text-xs transition-colors">
                    <Upload className="w-3.5 h-3.5 text-sky-400" />
                    <span>Choose CSV file</span>
                    <input
                      type="file"
                      accept=".csv,text/csv,text/plain"
                      onChange={handleCsvFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                <textarea
                  rows={6}
                  placeholder={`StudentID, Full Name, Email\nSTU-101, Sarah Connor, sarah@school.edu\nSTU-102, John Doe, john.doe@school.edu\nSTU-103, Maya Lin, maya@school.edu`}
                  value={bulkCsvText}
                  onChange={(e) => setBulkCsvText(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600 font-mono text-[11px]"
                  required
                />
                <p className="text-zinc-500 text-[10px] mt-1">
                  Format: <code>StudentID, Full Name, Email</code> (one student per line, header row auto-ignored)
                </p>
              </div>

              {bulkError && (
                <div className="bg-red-950/70 border border-red-900 text-red-300 p-2.5 rounded flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{bulkError}</span>
                </div>
              )}

              {bulkSuccessMsg && (
                <div className="bg-emerald-950/70 border border-emerald-900 text-emerald-300 p-2.5 rounded flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{bulkSuccessMsg}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkModal(false);
                    setBulkError(null);
                    setBulkSuccessMsg(null);
                  }}
                  className="px-4 py-2 border border-zinc-700 text-zinc-400 rounded hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={bulkImporting}
                  className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 border border-emerald-700 text-emerald-100 font-semibold rounded disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {bulkImporting ? 'Importing Roster...' : 'Import & Enroll All'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Attendance History Modal */}
      {selectedStudent && (
        <StudentAttendanceHistoryModal
          isOpen={!!selectedStudent}
          onClose={() => setSelectedStudent(null)}
          student={selectedStudent}
          classId={classroom.id}
        />
      )}
    </div>
  );
};

