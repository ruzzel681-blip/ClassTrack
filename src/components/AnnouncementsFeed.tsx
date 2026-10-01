import React, { useEffect, useState, useRef } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Classroom, Announcement, AnnouncementComment, UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { logAuditEvent } from '../lib/audit';
import { FileUploadZone, UploadedFileMeta } from './FileUploadZone';
import { AttachmentViewer } from './AttachmentViewer';
import { UserAvatar } from './UserAvatar';
import {
  MessageSquare,
  Send,
  Trash2,
  Plus,
  Megaphone,
  Video,
  ExternalLink,
  Paperclip,
  Check,
  Copy,
  Edit3,
  Save,
  Link as LinkIcon,
  X,
  Sparkles,
} from 'lucide-react';

interface AnnouncementsFeedProps {
  classroom: Classroom;
  onStartMessage?: (recipient: UserProfile) => void;
  onClassroomUpdated?: () => void;
}

// Clean and normalize a user-provided Google Meet URL
function normalizeMeetUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('meet.google.com/')) {
    return `https://${trimmed}`;
  }
  if (/^[a-z0-9\-]+$/i.test(trimmed)) {
    return `https://meet.google.com/${trimmed}`;
  }
  return `https://${trimmed}`;
}

// Extract any meet link from text
function extractMeetLink(text: string): string | null {
  const match = text.match(/https?:\/\/(?:meet\.google\.com\/[a-z0-9\-_]+|[^\s]+meet\.google\.com[^\s]*)/i);
  return match ? match[0] : null;
}

export const AnnouncementsFeed: React.FC<AnnouncementsFeedProps> = ({
  classroom,
  onClassroomUpdated,
}) => {
  const { userProfile } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [commentsMap, setCommentsMap] = useState<Record<string, AnnouncementComment[]>>({});
  const [loading, setLoading] = useState(true);

  // Saved Google Meet Link for this classroom
  const [savedMeetUrl, setSavedMeetUrl] = useState<string>(() => {
    if (classroom.meetUrl) return classroom.meetUrl;
    try {
      return localStorage.getItem(`classtrack_meet_${classroom.id}`) || '';
    } catch {
      return '';
    }
  });

  // Modal / popover for editing or saving the class Google Meet link
  const [showMeetModal, setShowMeetModal] = useState(false);
  const [meetInput, setMeetInput] = useState('');
  const [savingMeetUrl, setSavingMeetUrl] = useState(false);
  const [copiedMeet, setCopiedMeet] = useState(false);
  const [insertAfterSave, setInsertAfterSave] = useState(false);

  // New announcement composer form
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [attachment, setAttachment] = useState<UploadedFileMeta | null>(null);
  const [meetUrl, setMeetUrl] = useState('');
  const [posting, setPosting] = useState(false);
  const [insertedMeetNotice, setInsertedMeetNotice] = useState(false);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Comment input per announcement
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [postingComment, setPostingComment] = useState<Record<string, boolean>>({});

  if (!userProfile) return null;

  const isTeacher = userProfile.role === 'teacher';

  // Sync savedMeetUrl if classroom prop updates
  useEffect(() => {
    if (classroom.meetUrl) {
      setSavedMeetUrl(classroom.meetUrl);
    } else {
      try {
        const cached = localStorage.getItem(`classtrack_meet_${classroom.id}`);
        if (cached) setSavedMeetUrl(cached);
      } catch {}
    }
  }, [classroom]);

  const fetchAnnouncementsAndComments = async () => {
    setLoading(true);
    const annList: Announcement[] = [];
    const comMap: Record<string, AnnouncementComment[]> = {};

    try {
      // Query announcements for this class
      const qAnn = query(
        collection(db, 'announcements'),
        where('classId', '==', classroom.id)
      );
      const annSnap = await getDocs(qAnn);
      annSnap.forEach((d) => {
        annList.push({ id: d.id, ...(d.data() as object) } as Announcement);
      });

      // Query comments for this class
      const qCom = query(collection(db, 'comments'), where('classId', '==', classroom.id));
      const comSnap = await getDocs(qCom);
      comSnap.forEach((d) => {
        const c = { id: d.id, ...(d.data() as object) } as AnnouncementComment;
        if (!comMap[c.announcementId]) comMap[c.announcementId] = [];
        comMap[c.announcementId].push(c);
      });
    } catch (err) {
      console.warn('Firestore announcements query notice:', err);
    }

    // Merge any locally stored announcements for offline resilience
    try {
      const localAnn = localStorage.getItem(`classtrack_ann_${classroom.id}`);
      if (localAnn) {
        const parsed: Announcement[] = JSON.parse(localAnn);
        parsed.forEach((pa) => {
          if (!annList.some((a) => a.id === pa.id)) {
            annList.push(pa);
          }
        });
      }
    } catch (_) {}

    // Sort newest first
    annList.sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    );
    setAnnouncements(annList);

    // Sort comments oldest to newest
    Object.keys(comMap).forEach((annId) => {
      comMap[annId].sort(
        (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      );
    });
    setCommentsMap(comMap);
    setLoading(false);
  };

  useEffect(() => {
    fetchAnnouncementsAndComments();
  }, [classroom]);

  // Copy Google Meet link to clipboard
  const handleCopyMeetLink = (linkToCopy?: string) => {
    const target = linkToCopy || savedMeetUrl;
    if (!target) return;
    navigator.clipboard.writeText(target);
    setCopiedMeet(true);
    setTimeout(() => setCopiedMeet(false), 2000);
  };

  // Save or update persistent Google Meet link for this classroom
  const handleSaveMeetUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = normalizeMeetUrl(meetInput);
    if (!cleanUrl) return;

    setSavingMeetUrl(true);
    try {
      // 1. Update Firestore classes collection
      try {
        await updateDoc(doc(db, 'classes', classroom.id), {
          meetUrl: cleanUrl,
          updatedAt: new Date().toISOString(),
        });
      } catch (firestoreErr) {
        console.warn('Firestore update class meetUrl notice:', firestoreErr);
      }

      // 2. Update local storage
      try {
        localStorage.setItem(`classtrack_meet_${classroom.id}`, cleanUrl);
      } catch {}

      // 3. Update state
      setSavedMeetUrl(cleanUrl);
      setShowMeetModal(false);

      // 4. Log audit event
      try {
        await logAuditEvent(
          userProfile.uid,
          userProfile.displayName,
          userProfile.role,
          'MEET_LINK_SAVED',
          `Saved Google Meet link "${cleanUrl}" for classroom ${classroom.name}`,
          classroom.id
        );
      } catch {}

      // 5. If user wanted to insert it right into the current announcement composer
      if (insertAfterSave) {
        insertMeetUrlIntoAnnouncement(cleanUrl);
        setInsertAfterSave(false);
      }

      if (onClassroomUpdated) {
        onClassroomUpdated();
      }
    } catch (err) {
      console.error('Error saving Google Meet link:', err);
    } finally {
      setSavingMeetUrl(false);
    }
  };

  // Helper to insert a meet URL directly into announcement content
  const insertMeetUrlIntoAnnouncement = (urlToInsert: string) => {
    setMeetUrl(urlToInsert);
    const meetSnippet = `\n\n📹 Google Meet Link: ${urlToInsert}`;
    setContent((prev) => {
      if (prev.includes(urlToInsert) || (prev.includes('meet.google.com') && prev.includes(urlToInsert))) {
        return prev;
      }
      return prev ? `${prev.trim()}${meetSnippet}` : `Class meeting online via Google Meet:\n${urlToInsert}`;
    });

    setInsertedMeetNotice(true);
    setTimeout(() => setInsertedMeetNotice(false), 3000);

    setTimeout(() => {
      contentTextareaRef.current?.focus();
    }, 100);
  };

  // One-tap Add Google Meet Link in the announcement composer
  const handleAddGoogleMeetLink = () => {
    if (savedMeetUrl) {
      // 1-tap insert of the saved link!
      insertMeetUrlIntoAnnouncement(savedMeetUrl);
    } else {
      // If no link is saved yet, open modal to save one and automatically insert it
      setMeetInput('');
      setInsertAfterSave(true);
      setShowMeetModal(true);
    }
  };

  const handlePostAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setPosting(true);

    const detectedMeet = meetUrl || extractMeetLink(content) || (savedMeetUrl && content.includes(savedMeetUrl) ? savedMeetUrl : undefined);

    const newAnn: Announcement = {
      id: 'ann_' + Date.now(),
      classId: classroom.id,
      title: title.trim(),
      content: content.trim(),
      authorUid: userProfile.uid,
      authorName: userProfile.displayName,
      authorRole: userProfile.role,
      authorAvatar: userProfile.avatar,
      attachmentUrl: attachment?.url,
      attachmentName: attachment?.name,
      attachmentSize: attachment?.size,
      attachmentType: attachment?.type,
      meetUrl: detectedMeet || undefined,
      createdAt: new Date().toISOString(),
    };

    try {
      try {
        const docRef = await addDoc(collection(db, 'announcements'), {
          classId: newAnn.classId,
          title: newAnn.title,
          content: newAnn.content,
          authorUid: newAnn.authorUid,
          authorName: newAnn.authorName,
          authorRole: newAnn.authorRole,
          authorAvatar: newAnn.authorAvatar || '',
          attachmentUrl: newAnn.attachmentUrl || '',
          attachmentName: newAnn.attachmentName || '',
          attachmentSize: newAnn.attachmentSize || '',
          attachmentType: newAnn.attachmentType || '',
          meetUrl: newAnn.meetUrl || '',
          createdAt: newAnn.createdAt,
        });
        newAnn.id = docRef.id;
      } catch (firestoreErr) {
        console.warn('Firestore write announcement notice:', firestoreErr);
      }

      // Save to local storage cache
      try {
        const localKey = `classtrack_ann_${classroom.id}`;
        const prevLocal = JSON.parse(localStorage.getItem(localKey) || '[]');
        localStorage.setItem(localKey, JSON.stringify([newAnn, ...prevLocal]));
      } catch (_) {}

      try {
        await logAuditEvent(
          userProfile.uid,
          userProfile.displayName,
          userProfile.role,
          'ANNOUNCEMENT_POSTED',
          `Posted announcement "${title.trim()}" in ${classroom.name}`,
          classroom.id
        );
      } catch (_) {}

      setTitle('');
      setContent('');
      setAttachment(null);
      setMeetUrl('');
      setShowCreate(false);
      await fetchAnnouncementsAndComments();
    } catch (err) {
      console.error('Error posting announcement:', err);
    } finally {
      setPosting(false);
    }
  };

  const handleAddComment = async (announcementId: string) => {
    const text = commentInputs[announcementId]?.trim();
    if (!text) return;

    setPostingComment((prev) => ({ ...prev, [announcementId]: true }));
    const newComment: AnnouncementComment = {
      id: 'com_' + Date.now(),
      announcementId,
      classId: classroom.id,
      content: text,
      authorUid: userProfile.uid,
      authorName: userProfile.displayName,
      authorRole: userProfile.role,
      authorAvatar: userProfile.avatar,
      createdAt: new Date().toISOString(),
    };

    try {
      try {
        const docRef = await addDoc(collection(db, 'comments'), {
          announcementId,
          classId: classroom.id,
          content: text,
          authorUid: userProfile.uid,
          authorName: userProfile.displayName,
          authorRole: userProfile.role,
          authorAvatar: userProfile.avatar || '',
          createdAt: newComment.createdAt,
        });
        newComment.id = docRef.id;
      } catch (firestoreErr) {
        console.warn('Firestore write comment notice:', firestoreErr);
      }

      setCommentInputs((prev) => ({ ...prev, [announcementId]: '' }));
      setCommentsMap((prev) => ({
        ...prev,
        [announcementId]: [...(prev[announcementId] || []), newComment],
      }));
    } catch (err) {
      console.error('Error posting comment:', err);
    } finally {
      setPostingComment((prev) => ({ ...prev, [announcementId]: false }));
    }
  };

  const handleDeleteAnnouncement = async (id: string, annTitle: string) => {
    if (!confirm(`Delete announcement "${annTitle}"?`)) return;
    try {
      try {
        await deleteDoc(doc(db, 'announcements', id));
      } catch (firestoreErr) {
        console.warn('Firestore delete notice:', firestoreErr);
      }

      // Remove from local cache
      try {
        const localKey = `classtrack_ann_${classroom.id}`;
        const prevLocal: Announcement[] = JSON.parse(localStorage.getItem(localKey) || '[]');
        localStorage.setItem(localKey, JSON.stringify(prevLocal.filter((a) => a.id !== id)));
      } catch (_) {}

      await fetchAnnouncementsAndComments();
    } catch (err) {
      console.error('Error deleting announcement:', err);
    }
  };

  return (
    <div className="font-sans">
      {/* Top action header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800 pb-3 mb-4 font-mono text-xs">
        <div>
          <h3 className="text-sm font-bold text-zinc-100 uppercase flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-sky-400" />
            Class Announcements & Meet
          </h3>
          <p className="text-zinc-400 text-[11px] mt-0.5">
            Broadcast updates, launch saved Google Meet sessions, and share files
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isTeacher && (
            <button
              onClick={() => {
                setMeetInput(savedMeetUrl);
                setInsertAfterSave(false);
                setShowMeetModal(true);
              }}
              className="w-full sm:w-auto px-3 py-2 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-xs"
              title="Save or configure the recurring Google Meet link for this class"
            >
              <Video className="w-3.5 h-3.5 text-emerald-400" />
              <span>{savedMeetUrl ? 'Manage Meet Link' : '+ Save Meet Link'}</span>
            </button>
          )}

          {isTeacher && (
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="w-full sm:w-auto px-3.5 py-2 rounded bg-sky-600 hover:bg-sky-500 border border-sky-500 text-white font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-xs"
            >
              {showCreate ? (
                <>
                  <X className="w-4 h-4" />
                  Close Composer
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  New Announcement
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Persistent Class Google Meet Quick-Access Card */}
      <div className="mb-4 bg-zinc-900 border border-zinc-800 rounded-lg p-3 sm:p-4 font-mono text-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-emerald-950/80 border border-emerald-800/80 flex items-center justify-center shrink-0">
              <Video className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-zinc-100 uppercase tracking-wide text-xs">
                  Class Google Meet Room
                </span>
                {savedMeetUrl ? (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Link Active
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400 border border-zinc-700">
                    No Saved Link
                  </span>
                )}
              </div>
              <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                {savedMeetUrl ? (
                  <span className="text-emerald-400 font-mono select-all break-all">
                    {savedMeetUrl}
                  </span>
                ) : (
                  <span className="text-zinc-500 italic">
                    {isTeacher
                      ? 'Save your recurring Google Meet link for 1-tap access and quick announcements.'
                      : 'No recurring Google Meet link configured yet by the teacher.'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {savedMeetUrl ? (
              <>
                <button
                  type="button"
                  onClick={() => handleCopyMeetLink()}
                  className="flex-1 sm:flex-none px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-xs"
                  title="Copy Google Meet Link"
                >
                  {copiedMeet ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Copy Link</span>
                    </>
                  )}
                </button>

                <a
                  href={savedMeetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 sm:flex-none px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-semibold inline-flex items-center justify-center gap-1.5 shadow-sm transition-colors text-xs"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span>Join Google Meet</span>
                  <ExternalLink className="w-3 h-3 opacity-80" />
                </a>

                {isTeacher && (
                  <button
                    type="button"
                    onClick={() => {
                      setMeetInput(savedMeetUrl);
                      setInsertAfterSave(false);
                      setShowMeetModal(true);
                    }}
                    className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded border border-transparent hover:border-zinc-700 transition-colors"
                    title="Edit Saved Google Meet Link"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            ) : (
              isTeacher && (
                <button
                  type="button"
                  onClick={() => {
                    setMeetInput('');
                    setInsertAfterSave(false);
                    setShowMeetModal(true);
                  }}
                  className="w-full sm:w-auto px-3.5 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 border border-emerald-600 text-white font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Set Class Meet Link</span>
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Modal / Dialog for Saving or Editing the Google Meet Link */}
      {showMeetModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 w-full max-w-lg shadow-2xl font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
              <div className="flex items-center gap-2 text-sm font-bold text-zinc-100 uppercase">
                <Video className="w-4 h-4 text-emerald-400" />
                <span>{savedMeetUrl ? 'Update Google Meet Link' : 'Save Google Meet Link'}</span>
              </div>
              <button
                onClick={() => {
                  setShowMeetModal(false);
                  setInsertAfterSave(false);
                }}
                className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMeetUrl} className="space-y-4">
              <div>
                <label className="block text-zinc-300 font-semibold uppercase tracking-wider mb-1.5">
                  Google Meet URL or Code *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="https://meet.google.com/abc-defg-hij"
                  value={meetInput}
                  onChange={(e) => setMeetInput(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-lg px-3.5 py-2.5 text-zinc-100 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                />
                <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed">
                  Paste your real Google Meet URL (or room code). Once saved, tapping &quot;Add Google Meet Link&quot; in any announcement will immediately insert this exact link.
                </p>
              </div>

              {insertAfterSave && (
                <div className="p-2.5 rounded bg-sky-950/60 border border-sky-800/80 text-sky-300 text-[11px] flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>This link will also be automatically added to your current announcement draft.</span>
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowMeetModal(false);
                    setInsertAfterSave(false);
                  }}
                  className="w-full sm:w-auto px-4 py-2 border border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMeetUrl || !meetInput.trim()}
                  className="w-full sm:w-auto px-5 py-2 bg-emerald-600 hover:bg-emerald-500 border border-emerald-500 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingMeetUrl ? 'Saving Link...' : 'Save Meet Link'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Announcement Composer */}
      {showCreate && (
        <form
          onSubmit={handlePostAnnouncement}
          className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 sm:p-5 mb-6 space-y-4 font-mono text-xs shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
            <div className="text-sm font-bold text-zinc-100 uppercase flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-sky-400" />
              Post New Announcement
            </div>
            <span className="text-[10px] text-zinc-500 uppercase">
              Posting as {userProfile.displayName}
            </span>
          </div>

          <div>
            <label className="block text-zinc-400 uppercase tracking-wider mb-1 font-semibold">
              Announcement Title *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Midterm Review Session / Online Lab Schedule"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2.5 text-zinc-100 text-sm focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
              <label className="block text-zinc-400 uppercase tracking-wider font-semibold">
                Main Message / Details *
              </label>

              {/* 1-Tap Google Meet Link Insert Button */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleAddGoogleMeetLink}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-950/90 hover:bg-emerald-900 text-emerald-300 border border-emerald-800 hover:border-emerald-700 text-[11px] font-semibold transition-colors cursor-pointer"
                  title={
                    savedMeetUrl
                      ? `1-Tap insert saved link: ${savedMeetUrl}`
                      : 'Set and insert a Google Meet link'
                  }
                >
                  <Video className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    {savedMeetUrl ? '+ Add Saved Google Meet Link' : '+ Add Google Meet Link'}
                  </span>
                </button>

                {savedMeetUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setMeetInput(savedMeetUrl);
                      setInsertAfterSave(false);
                      setShowMeetModal(true);
                    }}
                    className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded border border-zinc-800"
                    title="Change or edit saved Google Meet link"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {insertedMeetNotice && (
              <div className="mb-2 text-[11px] text-emerald-400 flex items-center gap-1">
                <Check className="w-3.5 h-3.5" />
                <span>Google Meet link inserted into message!</span>
              </div>
            )}

            <textarea
              ref={contentTextareaRef}
              required
              rows={4}
              placeholder="Write your announcement details, instructions, or meeting agenda..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-100 font-sans text-sm leading-relaxed focus:outline-none focus:border-sky-500 resize-y"
            />
          </div>

          {/* File Upload Zone for Teacher Attachments */}
          <div className="pt-1">
            <FileUploadZone
              label="Attach File or Document (Optional)"
              sublabel="Upload PDF slides, notes, images, or project files"
              value={attachment}
              onChange={setAttachment}
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => {
                setShowCreate(false);
                setAttachment(null);
                setMeetUrl('');
              }}
              className="w-full sm:w-auto px-4 py-2 border border-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={posting || !title.trim() || !content.trim()}
              className="w-full sm:w-auto px-5 py-2 bg-sky-600 hover:bg-sky-500 border border-sky-500 text-white font-semibold rounded-lg disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {posting ? 'Publishing...' : 'Publish Announcement'}
            </button>
          </div>
        </form>
      )}

      {/* Announcements List */}
      {loading ? (
        <div className="text-center py-12 font-mono text-xs text-zinc-400">
          Loading announcements feed...
        </div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-12 font-mono text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-lg p-6">
          <Megaphone className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
          No announcements posted in this classroom yet.
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((a) => {
            const comments = commentsMap[a.id] || [];
            const meetLink = a.meetUrl || extractMeetLink(a.content);

            return (
              <div
                key={a.id}
                className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 sm:p-5 font-mono text-xs text-zinc-200 shadow-sm"
              >
                {/* Announcement Card Header */}
                <div className="flex items-start justify-between gap-3 border-b border-zinc-800/80 pb-3 mb-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <UserAvatar
                      displayName={a.authorName}
                      avatar={a.authorAvatar}
                      role={a.authorRole}
                      size="md"
                    />
                    <div className="min-w-0">
                      <h4 className="text-base font-bold text-zinc-100 break-words">{a.title}</h4>
                      <div className="text-[11px] text-zinc-400 mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-zinc-200 font-semibold">{a.authorName}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] uppercase font-bold ${
                            a.authorRole === 'teacher'
                              ? 'bg-sky-950 text-sky-400 border border-sky-800'
                              : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          }`}
                        >
                          {a.authorRole}
                        </span>
                        <span>•</span>
                        <span>
                          {new Date(a.createdAt).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    </div>
                  </div>

                  {isTeacher && (a.authorUid === userProfile.uid || userProfile.approved) && (
                    <button
                      onClick={() => handleDeleteAnnouncement(a.id, a.title)}
                      className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded transition-colors shrink-0"
                      title="Delete Announcement"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Prominent Google Meet Join Banner */}
                {meetLink && (
                  <div className="mb-4 bg-emerald-950/40 border border-emerald-800/80 rounded-lg p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-emerald-900/80 border border-emerald-700 flex items-center justify-center shrink-0">
                        <Video className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-emerald-300 font-bold text-xs uppercase tracking-wide">
                          Live Google Meet Session
                        </div>
                        <div className="text-[11px] text-emerald-400/80 truncate font-mono">
                          {meetLink}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleCopyMeetLink(meetLink)}
                        className="p-2 text-emerald-300 hover:text-white bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-800 rounded-lg transition-colors text-xs"
                        title="Copy Meet Link"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <a
                        href={meetLink}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold inline-flex items-center justify-center gap-1.5 text-xs shadow transition-colors"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Join Google Meet</span>
                        <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
                      </a>
                    </div>
                  </div>
                )}

                {/* Announcement Content */}
                <div className="text-zinc-200 whitespace-pre-wrap leading-relaxed mb-4 text-sm font-sans break-words">
                  {a.content}
                </div>

                {/* Announcement Attachment */}
                {a.attachmentUrl && (
                  <div className="mb-4 pt-1 border-t border-zinc-800/60">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                      <Paperclip className="w-3 h-3" />
                      <span>Attached Material</span>
                    </div>
                    <AttachmentViewer
                      url={a.attachmentUrl}
                      name={a.attachmentName || 'Attachment'}
                      size={a.attachmentSize}
                      type={a.attachmentType}
                    />
                  </div>
                )}

                {/* Comments Section */}
                <div className="border-t border-zinc-800 pt-3">
                  <div className="text-[11px] text-zinc-400 uppercase tracking-wider mb-2.5 font-bold flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-sky-400" />
                    Discussion Comments ({comments.length})
                  </div>

                  {comments.length > 0 && (
                    <div className="space-y-2 mb-3 max-h-64 overflow-y-auto pr-1">
                      {comments.map((c) => (
                        <div
                          key={c.id}
                          className="bg-zinc-950 border border-zinc-800/90 rounded-lg p-3 text-xs font-mono"
                        >
                          <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                            <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                              {c.authorName}
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded uppercase ${
                                  c.authorRole === 'teacher'
                                    ? 'bg-sky-950 text-sky-400 border border-sky-800'
                                    : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                }`}
                              >
                                {c.authorRole}
                              </span>
                            </span>
                            <span className="text-[10px] text-zinc-500">
                              {new Date(c.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <div className="text-zinc-300 text-xs font-sans break-words">
                            {c.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Comment Input */}
                  <div className="flex flex-col sm:flex-row gap-2 font-mono text-xs">
                    <input
                      type="text"
                      placeholder="Write a comment or question for the class..."
                      value={commentInputs[a.id] || ''}
                      onChange={(e) =>
                        setCommentInputs({ ...commentInputs, [a.id]: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddComment(a.id);
                      }}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-500 text-xs focus:outline-none focus:border-zinc-600"
                    />
                    <button
                      onClick={() => handleAddComment(a.id)}
                      disabled={postingComment[a.id] || !commentInputs[a.id]?.trim()}
                      className="w-full sm:w-auto px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 rounded-lg font-medium flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{postingComment[a.id] ? 'Posting...' : 'Comment'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
