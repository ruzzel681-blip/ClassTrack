import React, { useState } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Classroom } from '../types';
import { useAuth } from '../context/AuthContext';
import { logAuditEvent } from '../lib/audit';
import {
  Plus,
  KeyRound,
  Users,
  Copy,
  Check,
  Trash2,
  BookOpen,
  CheckCircle2,
  LogOut,
  Loader2,
  AlertCircle,
  Video,
} from 'lucide-react';

interface ClassesTabProps {
  classrooms: Classroom[];
  selectedClassroom: Classroom | null;
  onSelectClassroom: (classroom: Classroom) => void;
  onRefreshClassrooms: () => void;
}

export const ClassesTab: React.FC<ClassesTabProps> = ({
  classrooms,
  selectedClassroom,
  onSelectClassroom,
  onRefreshClassrooms,
}) => {
  const { userProfile } = useAuth();

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Form states
  const [className, setClassName] = useState('');
  const [section, setSection] = useState('');
  const [subject, setSubject] = useState('');
  const [meetUrlInput, setMeetUrlInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (!userProfile) return null;

  const isTeacher = userProfile.role === 'teacher';

  const getLocalClasses = (): Classroom[] => {
    try {
      const raw = localStorage.getItem('classtrack_custom_classes');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const saveLocalClasses = (list: Classroom[]) => {
    try {
      localStorage.setItem('classtrack_custom_classes', JSON.stringify(list));
    } catch {}
  };

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!className.trim()) return;

    setIsCreating(true);
    setCreateError(null);

    const trimmedName = className.trim();
    const trimmedSection = section.trim();
    const trimmedSubject = subject.trim();
    const cleanMeetUrl = meetUrlInput.trim()
      ? (meetUrlInput.trim().startsWith('http') ? meetUrlInput.trim() : `https://${meetUrlInput.trim()}`)
      : undefined;
    const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const newClassData: Classroom = {
      id: 'class_' + Date.now(),
      name: trimmedName,
      section: trimmedSection,
      subject: trimmedSubject,
      teacherId: userProfile.uid,
      teacherName: userProfile.displayName,
      joinCode,
      studentUids: [],
      meetUrl: cleanMeetUrl,
      createdAt: new Date().toISOString(),
    };

    try {
      try {
        const docRef = await addDoc(collection(db, 'classes'), {
          name: trimmedName,
          section: trimmedSection,
          subject: trimmedSubject,
          teacherId: userProfile.uid,
          teacherName: userProfile.displayName,
          joinCode,
          studentUids: [],
          meetUrl: cleanMeetUrl || '',
          createdAt: new Date().toISOString(),
        });
        newClassData.id = docRef.id;
      } catch (firestoreErr: any) {
        console.warn('Firestore direct write failed, backing up to local storage:', firestoreErr);
      }

      // Save to local custom classes so it is immediately accessible
      const current = getLocalClasses();
      saveLocalClasses([newClassData, ...current.filter((c) => c.id !== newClassData.id)]);

      if (cleanMeetUrl) {
        try {
          localStorage.setItem(`classtrack_meet_${newClassData.id}`, cleanMeetUrl);
        } catch {}
      }

      try {
        await logAuditEvent(
          userProfile.uid,
          userProfile.displayName,
          userProfile.role,
          'CLASS_CREATED',
          `Created class "${trimmedName}" (Code: ${joinCode})`,
          newClassData.id
        );
      } catch (_) {}

      setShowCreateModal(false);
      setClassName('');
      setSection('');
      setSubject('');
      setMeetUrlInput('');
      onSelectClassroom(newClassData);
      await onRefreshClassrooms();
    } catch (err: any) {
      console.error('Error creating class:', err);
      setCreateError(err.message || 'Failed to create classroom. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    const code = joinCodeInput.trim().toUpperCase();
    if (!code) return;

    try {
      const q = query(collection(db, 'classes'), where('joinCode', '==', code));
      const snap = await getDocs(q);

      if (snap.empty) {
        setJoinError('Invalid Join Code. Please verify with your teacher.');
        return;
      }

      const classDoc = snap.docs[0];
      const classData = classDoc.data() as Classroom;

      if (classData.studentUids?.includes(userProfile.uid)) {
        setJoinError('You are already enrolled in this class.');
        return;
      }

      const updatedStudentUids = [...(classData.studentUids || []), userProfile.uid];
      const updatedStudentsMap = {
        ...(classData.studentsMap || {}),
        [userProfile.uid]: {
          uid: userProfile.uid,
          studentId: userProfile.studentId || 'N/A',
          displayName: userProfile.displayName,
          email: userProfile.email,
          joinedAt: new Date().toISOString(),
        },
      };

      await updateDoc(doc(db, 'classes', classDoc.id), {
        studentUids: updatedStudentUids,
        studentsMap: updatedStudentsMap,
      });

      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        userProfile.role,
        'STUDENT_ADDED',
        `Joined class "${classData.name}" via code ${code}`,
        classDoc.id
      );

      setShowJoinModal(false);
      setJoinCodeInput('');
      await onRefreshClassrooms();
    } catch (err) {
      console.error('Error joining class:', err);
      setJoinError('Failed to join class. Please try again.');
    }
  };

  const handleDeleteClass = async (classId: string, name: string) => {
    if (!confirm(`Are you sure you want to delete class "${name}"? This action is permanent.`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, 'classes', classId));
    } catch (err) {
      console.warn('Firestore delete class notice:', err);
    }
    const current = getLocalClasses();
    saveLocalClasses(current.filter((c) => c.id !== classId));
    await onRefreshClassrooms();
  };

  const handleLeaveClass = async (classId: string, name: string) => {
    if (!confirm(`Are you sure you want to leave class "${name}"?`)) return;
    try {
      const classRef = doc(db, 'classes', classId);
      const classObj = classrooms.find((c) => c.id === classId);
      if (!classObj) return;

      const updatedUids = (classObj.studentUids || []).filter((id) => id !== userProfile.uid);
      const updatedMap = { ...(classObj.studentsMap || {}) };
      delete updatedMap[userProfile.uid];

      await updateDoc(classRef, {
        studentUids: updatedUids,
        studentsMap: updatedMap,
      });

      await logAuditEvent(
        userProfile.uid,
        userProfile.displayName,
        userProfile.role,
        'STUDENT_REMOVED',
        `Left class "${name}"`,
        classId
      );

      await onRefreshClassrooms();
    } catch (err) {
      console.error('Failed to leave class:', err);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="font-sans">
      {/* Top Header Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4 mb-6">
        <div>
          <h2 className="text-sm font-bold font-mono text-zinc-100 uppercase tracking-tight flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-sky-400" />
            Classroom Directory & Management
          </h2>
          <p className="text-xs font-mono text-zinc-400 mt-0.5">
            {isTeacher
              ? 'Create, manage, and switch active classrooms. The active class scopes Attendance, Rosters & Assignments.'
              : 'View enrolled classes, join new sections via code, or switch your active classroom view.'}
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs">
          {isTeacher && userProfile.approved && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-1.5 rounded bg-sky-900/90 hover:bg-sky-800 border border-sky-700 text-sky-100 font-medium flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Class
            </button>
          )}

          <button
            onClick={() => setShowJoinModal(true)}
            className="px-3.5 py-1.5 rounded border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium flex items-center gap-1.5 transition-colors"
          >
            <KeyRound className="w-3.5 h-3.5 text-zinc-400" />
            Join Class Code
          </button>
        </div>
      </div>

      {/* Class List - Mobile Cards (< md) & Desktop Table (>= md) */}
      {classrooms.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center font-mono text-xs">
          <BookOpen className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-zinc-200 uppercase mb-1">
            No Active Classrooms Found
          </h3>
          <p className="text-zinc-400 max-w-md mx-auto mb-6">
            {isTeacher
              ? 'Create a new class to get started with attendance tracking, roster management, and assignments.'
              : 'You have not joined any classes yet. Click "Join Class Code" and enter the 6-character code provided by your instructor.'}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => (isTeacher ? setShowCreateModal(true) : setShowJoinModal(true))}
              className="w-full sm:w-auto px-4 py-2 rounded bg-sky-900 border border-sky-700 text-sky-100 font-semibold hover:bg-sky-800"
            >
              {isTeacher ? 'Create First Class' : 'Join Class with Code'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile Card Grid (< md) */}
          <div className="md:hidden space-y-3 font-mono text-xs">
            {classrooms.map((c) => {
              const isActive = selectedClassroom?.id === c.id;
              return (
                <div
                  key={c.id}
                  className={`border rounded-lg p-4 transition-colors ${
                    isActive
                      ? 'bg-sky-950/30 border-sky-800/80'
                      : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h4 className="font-bold text-sm text-zinc-100">{c.name}</h4>
                      <p className="text-zinc-400 text-[11px]">
                        {c.section || 'General'} {c.subject ? `• ${c.subject}` : ''}
                      </p>
                    </div>
                    {isActive && (
                      <span className="px-2 py-0.5 rounded bg-sky-950 border border-sky-700 text-sky-400 font-bold text-[10px] uppercase shrink-0 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-sky-400" />
                        Active
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-zinc-400 text-[11px] mb-3 bg-zinc-950 p-2.5 rounded border border-zinc-800/80">
                    <div>
                      <span className="text-zinc-500 block uppercase text-[9px]">Instructor</span>
                      <span className="text-zinc-200 font-medium truncate block">{c.teacherName}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block uppercase text-[9px]">Enrolled</span>
                      <span className="text-zinc-200 font-medium flex items-center gap-1">
                        <Users className="w-3 h-3 text-zinc-400" />
                        {c.studentUids?.length || 0} students
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-800/80">
                    <div className="inline-flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 px-2 py-1 rounded">
                      <span className="text-zinc-500 text-[10px]">Code:</span>
                      <span className="font-bold text-zinc-100 tracking-wider">{c.joinCode}</span>
                      <button
                        onClick={() => handleCopyCode(c.joinCode)}
                        className="p-1 text-zinc-400 hover:text-zinc-100 rounded"
                        title="Copy Code"
                      >
                        {copiedCode === c.joinCode ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isActive ? (
                        <button
                          onClick={() => onSelectClassroom(c)}
                          className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 font-medium text-xs"
                        >
                          Select
                        </button>
                      ) : (
                        <span className="text-sky-400 font-bold uppercase text-[10px]">Active</span>
                      )}

                      {isTeacher && c.teacherId === userProfile.uid && (
                        <button
                          onClick={() => handleDeleteClass(c.id, c.name)}
                          className="p-1.5 text-zinc-500 hover:text-red-400 rounded transition-colors"
                          title="Delete Class"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}

                      {!isTeacher && (
                        <button
                          onClick={() => handleLeaveClass(c.id, c.name)}
                          className="p-1.5 text-zinc-500 hover:text-red-400 rounded transition-colors"
                          title="Leave Class"
                        >
                          <LogOut className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop View Table (>= md) */}
          <div className="hidden md:block border border-zinc-800 rounded-lg bg-zinc-900">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className="bg-zinc-950 text-zinc-400 border-b border-zinc-800 uppercase text-[11px] tracking-wider">
                  <th className="py-3 px-4 font-semibold">Class Name</th>
                  <th className="py-3 px-4 font-semibold">Section / Subject</th>
                  <th className="py-3 px-4 font-semibold">Instructor</th>
                  <th className="py-3 px-4 font-semibold">Enrolled</th>
                  <th className="py-3 px-4 font-semibold">Join Code</th>
                  <th className="py-3 px-4 font-semibold text-right">Scope & Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/80">
                {classrooms.map((c) => {
                  const isActive = selectedClassroom?.id === c.id;
                  return (
                    <tr
                      key={c.id}
                      className={`transition-colors ${
                        isActive ? 'bg-sky-950/20 hover:bg-sky-950/30' : 'hover:bg-zinc-800/50'
                      }`}
                    >
                      <td className="py-3.5 px-4 font-medium text-zinc-100">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-zinc-100">{c.name}</span>
                          {isActive && (
                            <span className="px-2 py-0.5 rounded bg-sky-950 border border-sky-700 text-sky-400 font-bold text-[10px] uppercase inline-flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-sky-400" />
                              Active Class
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-300">
                        {c.section || '—'} {c.subject ? `(${c.subject})` : ''}
                      </td>
                      <td className="py-3.5 px-4 text-zinc-300">{c.teacherName}</td>
                      <td className="py-3.5 px-4 text-zinc-300">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-300">
                          <Users className="w-3 h-3 text-zinc-400" />
                          {c.studentUids?.length || 0} students
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 px-2 py-1 rounded">
                          <span className="font-bold text-zinc-200 tracking-wider">
                            {c.joinCode}
                          </span>
                          <button
                            onClick={() => handleCopyCode(c.joinCode)}
                            className="p-1 text-zinc-400 hover:text-zinc-100 rounded"
                            title="Copy Join Code"
                          >
                            {copiedCode === c.joinCode ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right space-x-2">
                        {!isActive ? (
                          <button
                            onClick={() => onSelectClassroom(c)}
                            className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700 font-medium inline-flex items-center gap-1"
                          >
                            Set Active Class
                          </button>
                        ) : (
                          <span className="text-sky-400 text-[11px] font-bold uppercase px-2 py-1">
                            Currently Active
                          </span>
                        )}

                        {isTeacher && c.teacherId === userProfile.uid && (
                          <button
                            onClick={() => handleDeleteClass(c.id, c.name)}
                            className="p-1 text-zinc-500 hover:text-red-400 rounded inline-block transition-colors"
                            title="Delete Class"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}

                        {!isTeacher && (
                          <button
                            onClick={() => handleLeaveClass(c.id, c.name)}
                            className="p-1 text-zinc-500 hover:text-red-400 rounded inline-block transition-colors"
                            title="Leave Class"
                          >
                            <LogOut className="w-4 h-4" />
                          </button>
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

      {/* Create Class Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full p-6 text-zinc-200">
            <h2 className="text-base font-mono font-bold uppercase tracking-wide border-b border-zinc-800 pb-3 mb-4">
              Create New Classroom
            </h2>
            <form onSubmit={handleCreateClass} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1">
                  Class Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Mathematics 101"
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1">
                  Section / Period
                </label>
                <input
                  type="text"
                  placeholder="e.g. Section A"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  placeholder="e.g. Calculus & Algebra"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600"
                />
              </div>

              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Video className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Default Google Meet Link (Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. https://meet.google.com/abc-defg-hij"
                  value={meetUrlInput}
                  onChange={(e) => setMeetUrlInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 focus:outline-none focus:border-zinc-600 font-mono"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  You can also configure or change this anytime from the Announcements tab.
                </p>
              </div>

              {createError && (
                <div className="flex items-center gap-2 text-red-400 bg-red-950/60 border border-red-900 p-2.5 rounded text-xs">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  disabled={isCreating}
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateError(null);
                  }}
                  className="px-4 py-2 border border-zinc-700 text-zinc-400 rounded hover:bg-zinc-800 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="confirm-create-class-btn"
                  disabled={isCreating || !className.trim()}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 border border-sky-500 text-white font-semibold rounded inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Class</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Class Code Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full p-6 text-zinc-200">
            <h2 className="text-base font-mono font-bold uppercase tracking-wide border-b border-zinc-800 pb-3 mb-4">
              Join Classroom by Code
            </h2>
            <form onSubmit={handleJoinClass} className="space-y-4 font-mono text-xs">
              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1">
                  6-Character Join Code
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  placeholder="e.g. PX92KA"
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100 uppercase tracking-widest text-center font-bold text-lg focus:outline-none focus:border-zinc-600"
                />
              </div>

              {joinError && (
                <div className="text-red-400 bg-red-950/60 border border-red-900 p-2.5 rounded text-xs">
                  {joinError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinModal(false);
                    setJoinError(null);
                  }}
                  className="px-4 py-2 border border-zinc-700 text-zinc-400 rounded hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-sky-900 hover:bg-sky-800 border border-sky-700 text-sky-100 font-semibold rounded"
                >
                  Join Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
