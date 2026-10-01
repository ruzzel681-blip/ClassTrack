import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Classroom, AttendanceStatus, AttendanceRecord, StudentInfo } from '../types';
import { useAuth } from '../context/AuthContext';
import { logAuditEvent } from '../lib/audit';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock,
  XCircle,
  History,
  Check,
  AlertCircle,
  Save,
  Fingerprint,
  UserCheck,
} from 'lucide-react';

interface DailyAttendanceProps {
  classroom: Classroom;
}

export const DailyAttendance: React.FC<DailyAttendanceProps> = ({ classroom }) => {
  const { userProfile } = useAuth();
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<
    Record<string, AttendanceRecord>
  >({});
  const [loading, setLoading] = useState(true);
  const [selfCheckingIn, setSelfCheckingIn] = useState(false);

  // Override Modal state
  const [overrideModal, setOverrideModal] = useState<{
    studentUid: string;
    studentName: string;
    studentId: string;
    oldStatus: AttendanceStatus;
    newStatus: AttendanceStatus;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [savingOverride, setSavingOverride] = useState(false);

  // Quick message feedback
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  if (!userProfile) return null;

  const isTeacher = userProfile.role === 'teacher';
  const isStudent = userProfile.role === 'student';
  const isBlocked = classroom.blockedStudentUids?.includes(userProfile.uid);

  // Dynamic Session Passcode (Anti-Proxy Check-in)
  const [sessionPasscode, setSessionPasscode] = useState<string>(() => {
    return localStorage.getItem(`classtrack_passcode_${classroom.id}_${todayStr}`) || '7429';
  });
  const [isCheckInOpen, setIsCheckInOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem(`classtrack_checkin_open_${classroom.id}_${todayStr}`);
    return saved !== null ? saved === 'true' : true;
  });
  const [studentPasscodeInput, setStudentPasscodeInput] = useState('');
  const [passcodeError, setPasscodeError] = useState<string | null>(null);

  const handleGenerateNewPasscode = () => {
    const newCode = Math.floor(1000 + Math.random() * 9000).toString();
    setSessionPasscode(newCode);
    localStorage.setItem(`classtrack_passcode_${classroom.id}_${todayStr}`, newCode);
    setStatusMsg(`Generated new session passcode: ${newCode}`);
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const handleToggleCheckInOpen = () => {
    const newState = !isCheckInOpen;
    setIsCheckInOpen(newState);
    localStorage.setItem(`classtrack_checkin_open_${classroom.id}_${todayStr}`, String(newState));
    setStatusMsg(newState ? 'Self check-in opened for students' : 'Self check-in closed');
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const fetchAttendanceForDate = async (dateStr: string) => {
    setLoading(true);
    try {
      // Get student profiles from classroom map with chunked Firestore queries
      const uids = classroom.studentUids || [];
      const studentList: StudentInfo[] = [];

      if (uids.length > 0) {
        // Chunk UIDs into batches of 30 for Firestore IN queries
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
            });
          });
        }
      }

      // If any UIDs weren't in user docs but exist in classroom.studentsMap, supplement them
      uids.forEach((uid) => {
        if (!studentList.some((s) => s.uid === uid) && classroom.studentsMap?.[uid]) {
          studentList.push(classroom.studentsMap[uid]);
        }
      });

      setStudents(studentList);

      // Query attendance for this classId and date
      const qAtt = query(
        collection(db, 'attendance'),
        where('classId', '==', classroom.id),
        where('date', '==', dateStr)
      );
      const attSnap = await getDocs(qAtt);
      const attMap: Record<string, AttendanceRecord> = {};

      attSnap.forEach((d) => {
        const rec = { id: d.id, ...(d.data() as object) } as AttendanceRecord;
        attMap[rec.studentUid] = rec;
      });

      setAttendanceRecords(attMap);
    } catch (err) {
      console.error('Error fetching attendance for date:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAttendanceForDate(selectedDate);
  }, [classroom, selectedDate]);

  const handleDateChange = (deltaDays: number) => {
    const cur = new Date(selectedDate);
    cur.setDate(cur.getDate() + deltaDays);
    setSelectedDate(cur.toISOString().split('T')[0]);
  };

  const handleStudentSelfCheckIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!isStudent || isBlocked || selfCheckingIn) return;

    if (!isCheckInOpen) {
      setPasscodeError('Self check-in is currently closed by the instructor.');
      return;
    }

    if (sessionPasscode && studentPasscodeInput.trim() !== sessionPasscode.trim()) {
      setPasscodeError('Invalid 4-digit session code. Please enter the code shown on the classroom board.');
      return;
    }

    setPasscodeError(null);
    setSelfCheckingIn(true);

    try {
      const attId = `${classroom.id}_${todayStr}_${userProfile.uid}`;
      const attRef = doc(db, 'attendance', attId);
      const existingDoc = attendanceRecords[userProfile.uid];

      const newRecord: AttendanceRecord = {
        id: attId,
        classId: classroom.id,
        date: todayStr,
        studentUid: userProfile.uid,
        studentId: userProfile.studentId || 'STU-AUTO',
        studentName: userProfile.displayName,
        status: 'present',
        markedByUid: userProfile.uid,
        markedByName: `${userProfile.displayName} (Verified Self)`,
        selfCheckIn: true,
        createdAt: existingDoc?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        overrides: existingDoc?.overrides || [],
      };

      await setDoc(attRef, newRecord);

      setAttendanceRecords((prev) => ({
        ...prev,
        [userProfile.uid]: newRecord,
      }));

      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        userProfile.role,
        'SELF_CHECK_IN',
        `Student verified self-check-in with session code for ${todayStr}.`,
        classroom.id
      );

      setStatusMsg('Successfully verified and checked in for today!');
      setTimeout(() => setStatusMsg(null), 3500);
    } catch (err) {
      console.error('Self check-in error:', err);
      setStatusMsg('Failed to check in. Please check connection.');
    }
    setSelfCheckingIn(false);
  };

  const handleSetStatus = async (
    student: StudentInfo,
    newStatus: AttendanceStatus
  ) => {
    if (!isTeacher) return;

    const existingDoc = attendanceRecords[student.uid];

    // Check if this is an override on an already existing record for a previous day or existing entry
    if (existingDoc && existingDoc.status !== newStatus) {
      // Prompt for override reason modal
      setOverrideModal({
        studentUid: student.uid,
        studentName: student.displayName,
        studentId: student.studentId,
        oldStatus: existingDoc.status,
        newStatus,
      });
      setOverrideReason('');
      return;
    }

    // Direct mark if new or same status
    try {
      const attId = existingDoc?.id || `${classroom.id}_${selectedDate}_${student.uid}`;
      const attRef = doc(db, 'attendance', attId);

      const newRecord: AttendanceRecord = {
        id: attId,
        classId: classroom.id,
        date: selectedDate,
        studentUid: student.uid,
        studentId: student.studentId,
        studentName: student.displayName,
        status: newStatus,
        markedByUid: userProfile.uid,
        markedByName: userProfile.displayName,
        selfCheckIn: false,
        createdAt: existingDoc?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        overrides: existingDoc?.overrides || [],
      };

      await setDoc(attRef, newRecord);

      setAttendanceRecords((prev) => ({
        ...prev,
        [student.uid]: newRecord,
      }));

      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        userProfile.role,
        'ATTENDANCE_MARKED',
        `Marked ${student.displayName} (${student.studentId}) as ${newStatus.toUpperCase()} for ${selectedDate}.`,
        classroom.id
      );
    } catch (err) {
      console.error('Failed to set attendance:', err);
    }
  };

  const handleConfirmOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideModal || !userProfile) return;
    setSavingOverride(true);

    try {
      const studentUid = overrideModal.studentUid;
      const existingDoc = attendanceRecords[studentUid];
      const attId = existingDoc?.id || `${classroom.id}_${selectedDate}_${studentUid}`;
      const attRef = doc(db, 'attendance', attId);

      const overrideLog = {
        previousStatus: overrideModal.oldStatus,
        newStatus: overrideModal.newStatus,
        modifiedByUid: userProfile.uid,
        modifiedByName: userProfile.displayName,
        timestamp: new Date().toISOString(),
        reason: overrideReason.trim() || 'Teacher manual correction',
      };

      const updatedOverrides = [...(existingDoc?.overrides || []), overrideLog];

      const updatedRecord: AttendanceRecord = {
        id: attId,
        classId: classroom.id,
        date: selectedDate,
        studentUid,
        studentId: overrideModal.studentId,
        studentName: overrideModal.studentName,
        status: overrideModal.newStatus,
        markedByUid: userProfile.uid,
        markedByName: userProfile.displayName,
        selfCheckIn: false,
        createdAt: existingDoc?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        overrides: updatedOverrides,
      };

      await setDoc(attRef, updatedRecord);

      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        userProfile.role,
        'ATTENDANCE_OVERRIDE',
        `Attendance override for ${overrideModal.studentName} on ${selectedDate}: ${overrideModal.oldStatus} -> ${overrideModal.newStatus}. Reason: "${overrideReason.trim()}"`,
        classroom.id
      );

      setAttendanceRecords((prev) => ({
        ...prev,
        [studentUid]: updatedRecord,
      }));

      setStatusMsg(`Attendance overridden for ${overrideModal.studentName}.`);
      setTimeout(() => setStatusMsg(null), 3000);
      setOverrideModal(null);
    } catch (err) {
      console.error('Failed to override attendance:', err);
    }
    setSavingOverride(false);
  };

  const handleMarkAll = async (status: AttendanceStatus) => {
    if (!isTeacher || students.length === 0) return;

    try {
      for (const student of students) {
        const attId = `${classroom.id}_${selectedDate}_${student.uid}`;
        const attRef = doc(db, 'attendance', attId);
        const existing = attendanceRecords[student.uid];

        const rec: AttendanceRecord = {
          id: attId,
          classId: classroom.id,
          date: selectedDate,
          studentUid: student.uid,
          studentId: student.studentId,
          studentName: student.displayName,
          status,
          markedByUid: userProfile.uid,
          markedByName: userProfile.displayName,
          createdAt: existing?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          overrides: existing?.overrides || [],
        };

        await setDoc(attRef, rec);
      }

      await fetchAttendanceForDate(selectedDate);
      setStatusMsg(`Marked all students as ${status.toUpperCase()} for ${selectedDate}.`);
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (err) {
      console.error('Failed bulk mark:', err);
    }
  };

  // Student specific view
  const studentViewRecord = !isTeacher ? attendanceRecords[userProfile.uid] : null;

  return (
    <div className="font-sans">
      {/* Date Picker Bar */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4 flex flex-col md:flex-row md:items-center justify-between gap-4 font-mono text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDateChange(-1)}
            className="p-1.5 rounded border border-zinc-700 hover:bg-zinc-800 text-zinc-300"
            title="Previous Day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="relative flex items-center bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-zinc-100 font-semibold">
            <Calendar className="w-4 h-4 text-zinc-400 mr-2" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-zinc-100 focus:outline-none cursor-pointer"
            />
          </div>

          <button
            onClick={() => handleDateChange(1)}
            className="p-1.5 rounded border border-zinc-700 hover:bg-zinc-800 text-zinc-300"
            title="Next Day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            onClick={() => setSelectedDate(todayStr)}
            className="px-2.5 py-1.5 rounded border border-zinc-700 hover:bg-zinc-800 text-zinc-300 font-medium text-[11px]"
          >
            Today
          </button>
        </div>

        {/* Teacher Batch Controls */}
        {isTeacher && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-zinc-500 uppercase text-[10px] hidden sm:inline">
              Batch Mark:
            </span>
            <button
              onClick={() => handleMarkAll('present')}
              className="px-2.5 py-1 rounded bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 font-medium text-[11px] flex items-center gap-1"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              All Present
            </button>
            <button
              onClick={() => handleMarkAll('absent')}
              className="px-2.5 py-1 rounded bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 font-medium text-[11px] flex items-center gap-1"
            >
              <XCircle className="w-3.5 h-3.5" />
              All Absent
            </button>
          </div>
        )}
      </div>

      {statusMsg && (
        <div className="mb-4 bg-sky-950/80 border border-sky-800 text-sky-200 p-2.5 rounded font-mono text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-sky-400" />
          {statusMsg}
        </div>
      )}

      {/* Teacher Active Session Passcode Card */}
      {isTeacher && selectedDate === todayStr && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 mb-4 font-mono text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-zinc-400 uppercase tracking-wider text-[11px] font-semibold">
                  Live Classroom Check-In Session:
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                    isCheckInOpen
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                      : 'bg-red-950 text-red-300 border-red-800'
                  }`}
                >
                  {isCheckInOpen ? 'Active (Open)' : 'Closed'}
                </span>
              </div>
              <p className="text-zinc-400 text-[11px]">
                Students must enter this 4-digit code in class to verify physical attendance and prevent remote proxy check-ins.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-zinc-950 border border-zinc-700 px-4 py-2 rounded-lg text-center shadow-inner">
                <span className="text-[10px] uppercase text-zinc-500 block font-semibold">Session PIN</span>
                <span className="text-lg font-bold text-sky-400 tracking-widest">{sessionPasscode}</span>
              </div>

              <div className="flex flex-col gap-1.5">
                <button
                  type="button"
                  onClick={handleGenerateNewPasscode}
                  className="px-2.5 py-1 text-[11px] rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition-colors"
                >
                  Regenerate PIN
                </button>
                <button
                  type="button"
                  onClick={handleToggleCheckInOpen}
                  className={`px-2.5 py-1 text-[11px] rounded font-medium border transition-colors ${
                    isCheckInOpen
                      ? 'bg-red-950 hover:bg-red-900 text-red-300 border-red-800'
                      : 'bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border-emerald-800'
                  }`}
                >
                  {isCheckInOpen ? 'Close Check-In' : 'Open Check-In'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Student View Banner with Self Check-in button & Passcode Input */}
      {!isTeacher && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 mb-4 font-mono text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-zinc-400 uppercase tracking-wider text-[11px] mb-2">
                Your Attendance for {selectedDate}:
              </h3>
              {studentViewRecord ? (
                <div className="flex items-center gap-3">
                  <span
                    className={`px-3 py-1 rounded font-bold uppercase text-sm border ${
                      studentViewRecord.status === 'present'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                        : studentViewRecord.status === 'late'
                        ? 'bg-amber-950 text-amber-400 border-amber-800'
                        : 'bg-red-950 text-red-400 border-red-800'
                    }`}
                  >
                    {studentViewRecord.status}
                  </span>
                  <span className="text-zinc-400 text-xs">
                    {studentViewRecord.selfCheckIn ? (
                      <span className="text-sky-400 flex items-center gap-1">
                        <Fingerprint className="w-3.5 h-3.5" /> Verified Self Check-In
                      </span>
                    ) : (
                      `Marked by ${studentViewRecord.markedByName}`
                    )}{' '}
                    at{' '}
                    {new Date(studentViewRecord.updatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ) : (
                <div className="text-zinc-500 italic">
                  Attendance not marked for this date yet.
                </div>
              )}
            </div>

            {/* Self check-in with Passcode Verification for today */}
            {selectedDate === todayStr && !studentViewRecord && !isBlocked && (
              <form onSubmit={handleStudentSelfCheckIn} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {isCheckInOpen ? (
                  <>
                    <div>
                      <input
                        type="text"
                        maxLength={4}
                        placeholder="4-digit PIN"
                        value={studentPasscodeInput}
                        onChange={(e) => setStudentPasscodeInput(e.target.value)}
                        className="w-full sm:w-28 px-3 py-2 bg-zinc-950 border border-zinc-700 rounded text-zinc-100 text-center font-bold tracking-widest placeholder:text-zinc-600 focus:outline-none focus:border-sky-500"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={selfCheckingIn}
                      className="px-4 py-2 rounded bg-emerald-900 hover:bg-emerald-800 border border-emerald-700 text-emerald-100 font-bold flex items-center justify-center gap-2 shadow-lg transition-all"
                    >
                      <Fingerprint className="w-4 h-4 text-emerald-300" />
                      {selfCheckingIn ? 'Verifying...' : 'Verify & Check-In'}
                    </button>
                  </>
                ) : (
                  <span className="text-zinc-500 italic text-[11px] bg-zinc-950 px-3 py-2 rounded border border-zinc-800">
                    Self check-in is currently closed by instructor
                  </span>
                )}
              </form>
            )}
          </div>

          {passcodeError && (
            <div className="mt-3 p-2 bg-red-950/80 border border-red-800 text-red-300 rounded text-[11px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{passcodeError}</span>
            </div>
          )}
        </div>
      )}

      {/* Attendance Roster - Mobile Cards (< md) & Desktop Table (>= md) */}
      {loading ? (
        <div className="text-center py-8 font-mono text-xs text-zinc-400">
          Loading daily attendance roster...
        </div>
      ) : students.length === 0 ? (
        <div className="text-center py-8 font-mono text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded p-4">
          No students enrolled in this class roster. Add students in the "Roster" tab.
        </div>
      ) : (
        <>
          {/* Mobile Card Layout (< md) */}
          <div className="md:hidden space-y-3 font-mono text-xs">
            {students.map((s) => {
              const rec = attendanceRecords[s.uid];
              const status = rec?.status;

              return (
                <div
                  key={s.uid}
                  className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-zinc-100">{s.displayName}</h4>
                      <span className="text-zinc-400 text-[11px]">ID: {s.studentId}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {rec?.selfCheckIn && (
                        <span className="px-1.5 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800 text-[9px] uppercase font-bold flex items-center gap-0.5">
                          <Fingerprint className="w-2.5 h-2.5" /> Self
                        </span>
                      )}
                      {status ? (
                        <span
                          className={`px-2.5 py-0.5 rounded font-bold text-[10px] uppercase border shrink-0 ${
                            status === 'present'
                              ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                              : status === 'late'
                              ? 'bg-amber-950 text-amber-400 border-amber-800'
                              : 'bg-red-950 text-red-400 border-red-800'
                          }`}
                        >
                          {status}
                        </span>
                      ) : (
                        <span className="text-zinc-500 text-[10px] uppercase shrink-0">Unmarked</span>
                      )}
                    </div>
                  </div>

                  {rec?.overrides && rec.overrides.length > 0 && (
                    <div className="text-amber-400 inline-flex items-center gap-1 bg-amber-950/40 border border-amber-900/50 px-2 py-0.5 rounded text-[10px]">
                      <History className="w-3 h-3" />
                      {rec.overrides.length} override history entry
                    </div>
                  )}

                  {isTeacher && (
                    <div className="pt-2 border-t border-zinc-800 flex items-center justify-between gap-1">
                      <span className="text-zinc-500 text-[10px] uppercase">Mark:</span>
                      <div className="grid grid-cols-3 gap-1.5 w-full max-w-[240px]">
                        <button
                          onClick={() => handleSetStatus(s, 'present')}
                          className={`py-1.5 rounded font-bold text-[10px] uppercase transition-colors text-center ${
                            status === 'present'
                              ? 'bg-emerald-800 text-emerald-100 border border-emerald-600'
                              : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-emerald-400'
                          }`}
                        >
                          Present
                        </button>
                        <button
                          onClick={() => handleSetStatus(s, 'late')}
                          className={`py-1.5 rounded font-bold text-[10px] uppercase transition-colors text-center ${
                            status === 'late'
                              ? 'bg-amber-800 text-amber-100 border border-amber-600'
                              : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-amber-400'
                          }`}
                        >
                          Late
                        </button>
                        <button
                          onClick={() => handleSetStatus(s, 'absent')}
                          className={`py-1.5 rounded font-bold text-[10px] uppercase transition-colors text-center ${
                            status === 'absent'
                              ? 'bg-red-900 text-red-100 border border-red-700'
                              : 'bg-zinc-950 border border-zinc-800 text-zinc-400 hover:text-red-400'
                          }`}
                        >
                          Absent
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop Table Layout (>= md) */}
          <div className="hidden md:block border border-zinc-800 rounded-lg bg-zinc-900">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="bg-zinc-950 text-zinc-400 border-b border-zinc-800 uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Current Status</th>
                  <th className="py-3 px-4">Method / Override</th>
                  {isTeacher && <th className="py-3 px-4 text-right">Attendance Control</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {students.map((s) => {
                  const rec = attendanceRecords[s.uid];
                  const status = rec?.status;

                  return (
                    <tr key={s.uid} className="hover:bg-zinc-800/50 transition-colors">
                      <td className="py-3 px-4 text-zinc-300 font-semibold">{s.studentId}</td>
                      <td className="py-3 px-4 font-medium text-zinc-100">{s.displayName}</td>
                      <td className="py-3 px-4">
                        {status ? (
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded font-bold text-[10px] uppercase border ${
                              status === 'present'
                                ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                                : status === 'late'
                                ? 'bg-amber-950 text-amber-400 border-amber-800'
                                : 'bg-red-950 text-red-400 border-red-800'
                            }`}
                          >
                            {status}
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-[10px] uppercase">Unmarked</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-zinc-400 text-[11px]">
                        <div className="flex items-center gap-2">
                          {rec?.selfCheckIn && (
                            <span className="text-sky-400 inline-flex items-center gap-1 bg-sky-950/50 border border-sky-900/60 px-1.5 py-0.5 rounded text-[10px]">
                              <Fingerprint className="w-3 h-3" /> Self Check-in
                            </span>
                          )}
                          {rec?.overrides && rec.overrides.length > 0 ? (
                            <span className="text-amber-400 inline-flex items-center gap-1 bg-amber-950/40 border border-amber-900/50 px-2 py-0.5 rounded text-[10px]">
                              <History className="w-3 h-3" />
                              {rec.overrides.length} override(s)
                            </span>
                          ) : !rec?.selfCheckIn ? (
                            <span className="text-zinc-600">—</span>
                          ) : null}
                        </div>
                      </td>

                      {isTeacher && (
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1 bg-zinc-950 p-1 border border-zinc-800 rounded">
                            <button
                              onClick={() => handleSetStatus(s, 'present')}
                              className={`px-2 py-1 rounded font-bold text-[10px] uppercase transition-colors ${
                                status === 'present'
                                  ? 'bg-emerald-800 text-emerald-100 border border-emerald-600'
                                  : 'text-zinc-400 hover:text-emerald-400 hover:bg-zinc-900'
                              }`}
                            >
                              Present
                            </button>
                            <button
                              onClick={() => handleSetStatus(s, 'late')}
                              className={`px-2 py-1 rounded font-bold text-[10px] uppercase transition-colors ${
                                status === 'late'
                                  ? 'bg-amber-800 text-amber-100 border border-amber-600'
                                  : 'text-zinc-400 hover:text-amber-400 hover:bg-zinc-900'
                              }`}
                            >
                              Late
                            </button>
                            <button
                              onClick={() => handleSetStatus(s, 'absent')}
                              className={`px-2 py-1 rounded font-bold text-[10px] uppercase transition-colors ${
                                status === 'absent'
                                  ? 'bg-red-900 text-red-100 border border-red-700'
                                  : 'text-zinc-400 hover:text-red-400 hover:bg-zinc-900'
                              }`}
                            >
                              Absent
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Override Reason Prompt Modal */}
      {overrideModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full p-6 text-zinc-200 font-mono text-xs">
            <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 mb-4">
              <History className="w-5 h-5 text-amber-400" />
              <h2 className="text-base font-bold uppercase tracking-wide">
                Override Attendance Record
              </h2>
            </div>

            <p className="text-zinc-300 mb-3">
              You are changing attendance for{' '}
              <strong className="text-zinc-100">{overrideModal.studentName}</strong> ({overrideModal.studentId}) on{' '}
              <strong className="text-zinc-100">{selectedDate}</strong>:
            </p>

            <div className="bg-zinc-950 border border-zinc-800 p-3 rounded mb-4 flex items-center justify-between text-xs">
              <div>
                <span className="text-zinc-500 uppercase text-[10px] block">Previous Status</span>
                <span className="font-bold text-red-400 uppercase">{overrideModal.oldStatus}</span>
              </div>
              <ChevronRight className="w-4 h-4 text-zinc-500" />
              <div>
                <span className="text-zinc-500 uppercase text-[10px] block">New Status</span>
                <span className="font-bold text-emerald-400 uppercase">{overrideModal.newStatus}</span>
              </div>
            </div>

            <form onSubmit={handleConfirmOverride} className="space-y-4">
              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1">
                  Reason for Override *
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Doctor's note provided, parent phone call, tardy slip from office..."
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded p-2.5 text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setOverrideModal(null)}
                  className="px-4 py-2 border border-zinc-700 text-zinc-400 rounded hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingOverride}
                  className="px-4 py-2 bg-amber-900 hover:bg-amber-800 border border-amber-700 text-amber-100 font-semibold rounded disabled:opacity-50"
                >
                  {savingOverride ? 'Logging Override...' : 'Confirm & Log Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

