import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Classroom, Assignment, Submission, StudentInfo } from '../types';
import { useAuth } from '../context/AuthContext';
import { logAuditEvent } from '../lib/audit';
import { FileUploadZone, UploadedFileMeta } from './FileUploadZone';
import { AttachmentViewer } from './AttachmentViewer';
import { UserAvatar } from './UserAvatar';
import {
  FileText,
  Plus,
  Calendar,
  CheckCircle,
  Clock,
  Upload,
  GraduationCap,
  Trash2,
  X,
  ExternalLink,
  Award,
  Paperclip,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

interface AssignmentsListProps {
  classroom: Classroom;
}

export const AssignmentsList: React.FC<AssignmentsListProps> = ({ classroom }) => {
  const { userProfile } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissionsMap, setSubmissionsMap] = useState<Record<string, Submission[]>>({});
  const [loading, setLoading] = useState(true);

  // New assignment modal
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [maxPoints, setMaxPoints] = useState('100');
  const [assignmentFile, setAssignmentFile] = useState<UploadedFileMeta | null>(null);
  const [creatingAssignment, setCreatingAssignment] = useState(false);

  // Submit work modal for student
  const [selectedAssignment, setSelectedAssignment] = useState<Assignment | null>(null);
  const [submissionText, setSubmissionText] = useState('');
  const [submissionFile, setSubmissionFile] = useState<UploadedFileMeta | null>(null);
  const [submittingWork, setSubmittingWork] = useState(false);

  // View Submissions & Grade modal for teacher
  const [gradingAssignment, setGradingAssignment] = useState<Assignment | null>(null);
  const [gradeInputs, setGradeInputs] = useState<Record<string, { score: string; feedback: string }>>({});
  const [savingGradeId, setSavingGradeId] = useState<string | null>(null);

  if (!userProfile) return null;

  const isTeacher = userProfile.role === 'teacher';

  const fetchAssignmentsAndSubmissions = async () => {
    setLoading(true);
    const list: Assignment[] = [];
    const subMap: Record<string, Submission[]> = {};

    try {
      // Fetch assignments for class
      const qAssign = query(
        collection(db, 'assignments'),
        where('classId', '==', classroom.id)
      );
      const assignSnap = await getDocs(qAssign);
      assignSnap.forEach((d) => {
        list.push({ id: d.id, ...(d.data() as object) } as Assignment);
      });

      // Fetch all submissions for this class
      const qSub = query(
        collection(db, 'submissions'),
        where('classId', '==', classroom.id)
      );
      const subSnap = await getDocs(qSub);
      subSnap.forEach((d) => {
        const sub = { id: d.id, ...(d.data() as object) } as Submission;
        if (!subMap[sub.assignmentId]) subMap[sub.assignmentId] = [];
        subMap[sub.assignmentId].push(sub);
      });
    } catch (err) {
      console.warn('Firestore assignments query notice:', err);
    }

    // Merge local assignments cache
    try {
      const localAssign = localStorage.getItem(`classtrack_assign_${classroom.id}`);
      if (localAssign) {
        const parsed: Assignment[] = JSON.parse(localAssign);
        parsed.forEach((pa) => {
          if (!list.some((a) => a.id === pa.id)) {
            list.push(pa);
          }
        });
      }

      const localSubs = localStorage.getItem(`classtrack_subs_${classroom.id}`);
      if (localSubs) {
        const parsedSubs: Submission[] = JSON.parse(localSubs);
        parsedSubs.forEach((ps) => {
          if (!subMap[ps.assignmentId]) subMap[ps.assignmentId] = [];
          if (!subMap[ps.assignmentId].some((s) => s.id === ps.id)) {
            subMap[ps.assignmentId].push(ps);
          }
        });
      }
    } catch (_) {}

    list.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    setAssignments(list);
    setSubmissionsMap(subMap);
    setLoading(false);
  };

  useEffect(() => {
    fetchAssignmentsAndSubmissions();
  }, [classroom]);

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    setCreatingAssignment(true);

    const newAssign: Assignment = {
      id: 'assign_' + Date.now(),
      classId: classroom.id,
      title: title.trim(),
      instructions: instructions.trim(),
      dueDate,
      maxPoints: parseInt(maxPoints) || 100,
      attachmentUrl: assignmentFile?.url,
      attachmentName: assignmentFile?.name,
      attachmentSize: assignmentFile?.size,
      attachmentType: assignmentFile?.type,
      teacherId: userProfile.uid,
      teacherName: userProfile.displayName,
      createdAt: new Date().toISOString(),
    };

    try {
      try {
        const docRef = await addDoc(collection(db, 'assignments'), {
          classId: newAssign.classId,
          title: newAssign.title,
          instructions: newAssign.instructions,
          dueDate: newAssign.dueDate,
          maxPoints: newAssign.maxPoints,
          attachmentUrl: newAssign.attachmentUrl || '',
          attachmentName: newAssign.attachmentName || '',
          attachmentSize: newAssign.attachmentSize || '',
          attachmentType: newAssign.attachmentType || '',
          teacherId: newAssign.teacherId,
          teacherName: newAssign.teacherName,
          createdAt: newAssign.createdAt,
        });
        newAssign.id = docRef.id;
      } catch (firestoreErr) {
        console.warn('Firestore write assignment notice:', firestoreErr);
      }

      // Save to local cache
      try {
        const key = `classtrack_assign_${classroom.id}`;
        const prev = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify([newAssign, ...prev]));
      } catch (_) {}

      try {
        await logAuditEvent(
          userProfile.uid,
          userProfile.displayName,
          userProfile.role,
          'ASSIGNMENT_CREATED',
          `Created assignment "${title.trim()}" due ${dueDate}`,
          classroom.id
        );
      } catch (_) {}

      setTitle('');
      setInstructions('');
      setDueDate('');
      setMaxPoints('100');
      setAssignmentFile(null);
      setShowCreate(false);
      await fetchAssignmentsAndSubmissions();
    } catch (err) {
      console.error('Error creating assignment:', err);
    } finally {
      setCreatingAssignment(false);
    }
  };

  const handleSubmitWork = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAssignment) return;
    setSubmittingWork(true);

    const subId = `${selectedAssignment.id}_${userProfile.uid}`;
    const newSubmission: Submission = {
      id: subId,
      assignmentId: selectedAssignment.id,
      classId: classroom.id,
      studentUid: userProfile.uid,
      studentName: userProfile.displayName,
      studentId: userProfile.studentId || 'STU-' + userProfile.uid.slice(0, 6).toUpperCase(),
      content: submissionText.trim(),
      attachmentUrl: submissionFile?.url,
      attachmentName: submissionFile?.name,
      attachmentSize: submissionFile?.size,
      attachmentType: submissionFile?.type,
      submittedAt: new Date().toISOString(),
      status: 'submitted',
    };

    try {
      try {
        const subRef = doc(db, 'submissions', subId);
        await setDoc(subRef, {
          ...newSubmission,
          attachmentUrl: newSubmission.attachmentUrl || '',
          attachmentName: newSubmission.attachmentName || '',
          attachmentSize: newSubmission.attachmentSize || '',
          attachmentType: newSubmission.attachmentType || '',
        });
      } catch (firestoreErr) {
        console.warn('Firestore write submission notice:', firestoreErr);
      }

      // Local storage backup
      try {
        const key = `classtrack_subs_${classroom.id}`;
        const prev: Submission[] = JSON.parse(localStorage.getItem(key) || '[]');
        const filtered = prev.filter((s) => s.id !== subId);
        localStorage.setItem(key, JSON.stringify([newSubmission, ...filtered]));
      } catch (_) {}

      try {
        await logAuditEvent(
          userProfile.uid,
          userProfile.displayName,
          userProfile.role,
          'WORK_SUBMITTED',
          `Submitted work for assignment "${selectedAssignment.title}"`,
          classroom.id
        );
      } catch (_) {}

      setSelectedAssignment(null);
      setSubmissionText('');
      setSubmissionFile(null);
      await fetchAssignmentsAndSubmissions();
    } catch (err) {
      console.error('Error submitting work:', err);
    } finally {
      setSubmittingWork(false);
    }
  };

  const handleSaveGrade = async (sub: Submission) => {
    const input = gradeInputs[sub.id];
    if (!input || !gradingAssignment) return;

    setSavingGradeId(sub.id);
    const scoreNum = parseFloat(input.score) || 0;
    const feedbackText = input.feedback.trim();

    try {
      try {
        const subRef = doc(db, 'submissions', sub.id);
        await updateDoc(subRef, {
          score: scoreNum,
          feedback: feedbackText,
          status: 'graded',
          gradedAt: new Date().toISOString(),
          gradedByName: userProfile.displayName,
          gradedByUid: userProfile.uid,
        });
      } catch (firestoreErr) {
        console.warn('Firestore update submission grade notice:', firestoreErr);
      }

      // Update local storage
      try {
        const key = `classtrack_subs_${classroom.id}`;
        const prev: Submission[] = JSON.parse(localStorage.getItem(key) || '[]');
        const updated = prev.map((s) =>
          s.id === sub.id
            ? {
                ...s,
                score: scoreNum,
                feedback: feedbackText,
                status: 'graded' as const,
                gradedAt: new Date().toISOString(),
                gradedByName: userProfile.displayName,
              }
            : s
        );
        localStorage.setItem(key, JSON.stringify(updated));
      } catch (_) {}

      try {
        await logAuditEvent(
          userProfile.uid,
          userProfile.displayName,
          userProfile.role,
          'WORK_GRADED',
          `Graded submission for ${sub.studentName} on "${gradingAssignment.title}": ${scoreNum}/${gradingAssignment.maxPoints}`,
          classroom.id
        );
      } catch (_) {}

      await fetchAssignmentsAndSubmissions();
    } catch (err) {
      console.error('Error saving grade:', err);
    } finally {
      setSavingGradeId(null);
    }
  };

  const handleDeleteAssignment = async (id: string, aTitle: string) => {
    if (!confirm(`Delete assignment "${aTitle}"?`)) return;
    try {
      try {
        await deleteDoc(doc(db, 'assignments', id));
      } catch (firestoreErr) {
        console.warn('Firestore delete assignment notice:', firestoreErr);
      }

      // Remove from local cache
      try {
        const key = `classtrack_assign_${classroom.id}`;
        const prev: Assignment[] = JSON.parse(localStorage.getItem(key) || '[]');
        localStorage.setItem(key, JSON.stringify(prev.filter((a) => a.id !== id)));
      } catch (_) {}

      await fetchAssignmentsAndSubmissions();
    } catch (err) {
      console.error('Error deleting assignment:', err);
    }
  };

  return (
    <div className="font-sans">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3 mb-4 font-mono text-xs">
        <div>
          <h3 className="text-sm font-bold text-zinc-100 uppercase flex items-center gap-2">
            <FileText className="w-4 h-4 text-sky-400" />
            Course Assignments & Homework
          </h3>
          <p className="text-zinc-400 text-[11px] mt-0.5">
            Manage assignments, file attachments, student submissions, and grading
          </p>
        </div>

        {isTeacher && (
          <button
            onClick={() => setShowCreate(true)}
            className="w-full sm:w-auto px-3.5 py-2 rounded bg-sky-600 hover:bg-sky-500 border border-sky-500 text-white font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create Assignment
          </button>
        )}
      </div>

      {/* Assignment List */}
      {loading ? (
        <div className="text-center py-12 font-mono text-xs text-zinc-400">
          Loading course assignments...
        </div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-12 font-mono text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          No assignments created for this class yet.
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((a) => {
            const subs = submissionsMap[a.id] || [];
            const studentSub = !isTeacher
              ? subs.find((s) => s.studentUid === userProfile.uid)
              : null;

            return (
              <div
                key={a.id}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 sm:p-5 font-mono text-xs text-zinc-200 shadow-sm"
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-zinc-800/80 pb-3 mb-3">
                  <div className="min-w-0">
                    <h4 className="text-base font-bold text-zinc-100 break-words">{a.title}</h4>
                    <div className="text-[11px] text-zinc-400 mt-1 flex flex-wrap items-center gap-2 sm:gap-3">
                      <span className="flex items-center gap-1 text-zinc-300">
                        <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                        Due: <strong>{a.dueDate}</strong>
                      </span>
                      <span>•</span>
                      <span className="text-sky-400 font-semibold">Max Points: {a.maxPoints} pts</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    {isTeacher ? (
                      <>
                        <button
                          onClick={() => {
                            setGradingAssignment(a);
                            // Pre-fill existing grades into inputs
                            const initInputs: Record<string, { score: string; feedback: string }> = {};
                            subs.forEach((s) => {
                              initInputs[s.id] = {
                                score: s.score !== undefined ? String(s.score) : '',
                                feedback: s.feedback || '',
                              };
                            });
                            setGradeInputs(initInputs);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <GraduationCap className="w-4 h-4 text-sky-400" />
                          <span>Submissions ({subs.length})</span>
                        </button>

                        <button
                          onClick={() => handleDeleteAssignment(a.id, a.title)}
                          className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
                          title="Delete Assignment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <div>
                        {studentSub ? (
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase border flex items-center gap-1.5 ${
                                studentSub.status === 'graded'
                                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                  : 'bg-sky-950 text-sky-300 border-sky-800'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {studentSub.status === 'graded'
                                ? `Score: ${studentSub.score}/${a.maxPoints}`
                                : 'Turned In'}
                            </span>
                            <button
                              onClick={() => {
                                setSelectedAssignment(a);
                                setSubmissionText(studentSub.content);
                                setSubmissionFile(
                                  studentSub.attachmentUrl
                                    ? {
                                        url: studentSub.attachmentUrl,
                                        name: studentSub.attachmentName || 'Submitted File',
                                        size: studentSub.attachmentSize,
                                        type: studentSub.attachmentType,
                                      }
                                    : null
                                );
                              }}
                              className="px-3 py-1.5 rounded-lg border border-zinc-700 hover:bg-zinc-800 text-zinc-300 text-xs transition-colors cursor-pointer"
                            >
                              Edit Work
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedAssignment(a);
                              setSubmissionText('');
                              setSubmissionFile(null);
                            }}
                            className="px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 border border-sky-500 text-white font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Upload & Submit Work</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Instructions */}
                <div className="text-zinc-200 font-sans text-sm leading-relaxed whitespace-pre-wrap break-words mb-3">
                  {a.instructions}
                </div>

                {/* Teacher's Attached Assignment Materials */}
                {a.attachmentUrl && (
                  <div className="mt-3 pt-3 border-t border-zinc-800/80">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Paperclip className="w-3 h-3 text-sky-400" />
                      <span>Assignment Material & Resources</span>
                    </div>
                    <AttachmentViewer
                      url={a.attachmentUrl}
                      name={a.attachmentName || 'Assignment Brief'}
                      size={a.attachmentSize}
                      type={a.attachmentType}
                    />
                  </div>
                )}

                {/* Student's Own Submitted Work Preview */}
                {!isTeacher && studentSub && (
                  <div className="mt-3 bg-zinc-950 border border-zinc-800/90 rounded-lg p-3.5 text-xs space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span className="font-semibold text-zinc-200">Your Submission</span>
                      <span>
                        Turned in:{' '}
                        {new Date(studentSub.submittedAt).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {studentSub.content && (
                      <div className="text-zinc-300 font-sans text-xs bg-zinc-900/80 p-2.5 rounded border border-zinc-800/60 break-words">
                        {studentSub.content}
                      </div>
                    )}

                    {studentSub.attachmentUrl && (
                      <div>
                        <AttachmentViewer
                          url={studentSub.attachmentUrl}
                          name={studentSub.attachmentName || 'Your Submitted File'}
                          size={studentSub.attachmentSize}
                          type={studentSub.attachmentType}
                        />
                      </div>
                    )}

                    {studentSub.status === 'graded' && (
                      <div className="mt-2 bg-emerald-950/40 border border-emerald-900/60 rounded p-3">
                        <div className="font-bold text-emerald-400 uppercase text-[10px] mb-1 flex items-center gap-1">
                          <Award className="w-3.5 h-3.5" />
                          <span>
                            Graded by {studentSub.gradedByName || 'Teacher'} — {studentSub.score} / {a.maxPoints} pts
                          </span>
                        </div>
                        {studentSub.feedback && (
                          <div className="text-zinc-300 italic font-sans text-xs mt-1">
                            "{studentSub.feedback}"
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Assignment Modal (Teacher) */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-4 sm:p-6 text-zinc-200 font-mono text-xs my-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <h2 className="text-base font-bold uppercase tracking-wide flex items-center gap-2">
                <FileText className="w-4 h-4 text-sky-400" />
                Create New Assignment
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAssignment} className="space-y-4">
              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1 font-semibold">
                  Assignment Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lab 2: Sorting Algorithms & Complexity"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1 font-semibold">
                  Instructions & Guidelines
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide detailed instructions, requirements, deliverables..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-100 font-sans text-xs focus:outline-none focus:border-sky-500 resize-y"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 uppercase tracking-wider mb-1 font-semibold">
                    Due Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-zinc-400 uppercase tracking-wider mb-1 font-semibold">
                    Max Points
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={maxPoints}
                    onChange={(e) => setMaxPoints(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              {/* File Attachment for Teachers */}
              <div>
                <FileUploadZone
                  label="Attach Assignment File / Rubric (Optional)"
                  sublabel="Upload PDF brief, starter code, templates, or slides"
                  value={assignmentFile}
                  onChange={setAssignmentFile}
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="w-full sm:w-auto px-4 py-2 border border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingAssignment || !title.trim() || !dueDate}
                  className="w-full sm:w-auto px-5 py-2 bg-sky-600 hover:bg-sky-500 border border-sky-500 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {creatingAssignment ? 'Creating...' : 'Create Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submit Work Modal (Student) */}
      {selectedAssignment && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-lg w-full p-4 sm:p-6 text-zinc-200 font-mono text-xs my-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="min-w-0 pr-2">
                <h2 className="text-base font-bold uppercase tracking-wide truncate">
                  Submit Work: {selectedAssignment.title}
                </h2>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  Due: {selectedAssignment.dueDate} • Max: {selectedAssignment.maxPoints} pts
                </div>
              </div>
              <button
                onClick={() => setSelectedAssignment(null)}
                className="text-zinc-400 hover:text-zinc-100 p-1 rounded-lg hover:bg-zinc-800 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitWork} className="space-y-4">
              <div>
                <label className="block text-zinc-400 uppercase tracking-wider mb-1 font-semibold">
                  Submission Notes / Text Answer
                </label>
                <textarea
                  rows={3}
                  placeholder="Type your notes, solution summary, or explanation..."
                  value={submissionText}
                  onChange={(e) => setSubmissionText(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-zinc-100 font-sans text-xs focus:outline-none focus:border-sky-500 resize-y"
                />
              </div>

              {/* Student File Upload */}
              <div>
                <FileUploadZone
                  label="Upload Your File / Homework Document *"
                  sublabel="Attach PDF, Word doc, code file, zip archive, or image"
                  value={submissionFile}
                  onChange={setSubmissionFile}
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setSelectedAssignment(null)}
                  className="w-full sm:w-auto px-4 py-2 border border-zinc-700 text-zinc-400 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingWork || (!submissionText.trim() && !submissionFile)}
                  className="w-full sm:w-auto px-5 py-2 bg-sky-600 hover:bg-sky-500 border border-sky-500 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{submittingWork ? 'Submitting...' : 'Turn In Work'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grade Submissions Modal (Teacher) */}
      {gradingAssignment && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-3xl w-full p-4 sm:p-6 text-zinc-200 font-mono text-xs my-auto shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-zinc-100 uppercase">
                  Submissions: {gradingAssignment.title}
                </h2>
                <p className="text-zinc-400 text-[11px] mt-0.5">
                  Max Points: {gradingAssignment.maxPoints} pts • Total Turned In:{' '}
                  {submissionsMap[gradingAssignment.id]?.length || 0}
                </p>
              </div>
              <button
                onClick={() => setGradingAssignment(null)}
                className="text-zinc-400 hover:text-zinc-100 p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Submissions list */}
            {submissionsMap[gradingAssignment.id]?.length === 0 ? (
              <div className="py-12 text-center text-zinc-400 bg-zinc-950 p-6 border border-zinc-800 rounded-lg">
                <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                No student work submitted for this assignment yet.
              </div>
            ) : (
              <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
                {submissionsMap[gradingAssignment.id]?.map((s) => {
                  const input = gradeInputs[s.id] || { score: '', feedback: '' };
                  const isSaving = savingGradeId === s.id;

                  return (
                    <div
                      key={s.id}
                      className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 text-xs font-mono"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-zinc-800 pb-2.5 mb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-zinc-100 text-sm">{s.studentName}</span>
                          <span className="text-zinc-400 text-[11px]">({s.studentId})</span>
                          {s.status === 'graded' && (
                            <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] px-1.5 py-0.2 rounded font-bold">
                              Score: {s.score}/{gradingAssignment.maxPoints}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-500">
                          Submitted:{' '}
                          {new Date(s.submittedAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      {s.content && (
                        <div className="bg-zinc-900 border border-zinc-800/80 p-3 rounded-lg text-zinc-200 font-sans mb-3 text-xs leading-relaxed break-words">
                          {s.content}
                        </div>
                      )}

                      {/* Attached Student File */}
                      {s.attachmentUrl && (
                        <div className="mb-3">
                          <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1 flex items-center gap-1">
                            <Paperclip className="w-3 h-3 text-sky-400" />
                            <span>Submitted Work File:</span>
                          </div>
                          <AttachmentViewer
                            url={s.attachmentUrl}
                            name={s.attachmentName || 'Student_Submission_File'}
                            size={s.attachmentSize}
                            type={s.attachmentType}
                          />
                        </div>
                      )}

                      {/* Grade entry controls */}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end pt-3 border-t border-zinc-800">
                        <div className="sm:col-span-3">
                          <label className="block text-[10px] uppercase text-zinc-400 mb-1 font-semibold">
                            Score (Max: {gradingAssignment.maxPoints})
                          </label>
                          <input
                            type="number"
                            placeholder="0"
                            value={input.score}
                            onChange={(e) =>
                              setGradeInputs({
                                ...gradeInputs,
                                [s.id]: { ...input, score: e.target.value },
                              })
                            }
                            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                          />
                        </div>

                        <div className="sm:col-span-6">
                          <label className="block text-[10px] uppercase text-zinc-400 mb-1 font-semibold">
                            Instructor Feedback
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Well organized code and thorough answers."
                            value={input.feedback}
                            onChange={(e) =>
                              setGradeInputs({
                                ...gradeInputs,
                                [s.id]: { ...input, feedback: e.target.value },
                              })
                            }
                            className="w-full bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1.5 text-zinc-100 text-xs focus:outline-none focus:border-sky-500"
                          />
                        </div>

                        <div className="sm:col-span-3">
                          <button
                            onClick={() => handleSaveGrade(s)}
                            disabled={isSaving}
                            className="w-full py-1.5 bg-sky-600 hover:bg-sky-500 border border-sky-500 text-white font-semibold rounded text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          >
                            {isSaving ? 'Saving...' : 'Save Grade'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-zinc-800 text-right">
              <button
                onClick={() => setGradingAssignment(null)}
                className="px-5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-mono text-xs cursor-pointer transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
