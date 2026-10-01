import React, { useEffect, useState, useRef } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  orderBy,
  getDocs,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { DirectMessage, UserProfile } from '../types';
import { useAuth } from '../context/AuthContext';
import { UserAvatar } from './UserAvatar';
import { processSelectedFile, formatFileSize, ProcessedFile } from '../lib/fileUpload';
import {
  X,
  Send,
  Paperclip,
  Search,
  MessageSquare,
  File,
  Download,
  CheckCheck,
  Check,
  User,
  Users,
} from 'lucide-react';

interface DirectMessagesDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialRecipient?: UserProfile | null;
}

export const DirectMessagesDrawer: React.FC<DirectMessagesDrawerProps> = ({
  isOpen,
  onClose,
  initialRecipient,
}) => {
  const { userProfile } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [activeContact, setActiveContact] = useState<UserProfile | null>(initialRecipient || null);
  const [availableContacts, setAvailableContacts] = useState<UserProfile[]>([]);
  const [textInput, setTextInput] = useState('');
  const [selectedAttachment, setSelectedAttachment] = useState<ProcessedFile | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [searchContact, setSearchContact] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialRecipient) {
      setActiveContact(initialRecipient);
    }
  }, [initialRecipient]);

  // Load all accessible contacts (approved teachers & students)
  useEffect(() => {
    if (!isOpen || !userProfile) return;

    const fetchContacts = async () => {
      try {
        const qUsers = query(collection(db, 'users'));
        const snap = await getDocs(qUsers);
        const list: UserProfile[] = [];
        snap.forEach((d) => {
          const u = d.data() as UserProfile;
          if (u.uid !== userProfile.uid && (u.role === 'student' || u.approved)) {
            list.push(u);
          }
        });
        setAvailableContacts(list);
      } catch (err) {
        console.error('Error loading contacts:', err);
      }
    };

    fetchContacts();
  }, [isOpen, userProfile]);

  // Listen to messages where current user is sender or recipient
  useEffect(() => {
    if (!isOpen || !userProfile) return;

    // Fetch messages sent or received
    const qSent = query(
      collection(db, 'direct_messages'),
      where('senderUid', '==', userProfile.uid)
    );
    const qReceived = query(
      collection(db, 'direct_messages'),
      where('recipientUid', '==', userProfile.uid)
    );

    let sentList: DirectMessage[] = [];
    let receivedList: DirectMessage[] = [];

    const updateCombined = () => {
      const combined = [...sentList, ...receivedList];
      // Deduplicate by ID
      const map = new Map<string, DirectMessage>();
      combined.forEach((m) => map.set(m.id, m));
      const sorted = Array.from(map.values()).sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      setMessages(sorted);
    };

    const unsubSent = onSnapshot(qSent, (snap) => {
      sentList = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as DirectMessage));
      updateCombined();
    });

    const unsubReceived = onSnapshot(qReceived, (snap) => {
      receivedList = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as DirectMessage));
      updateCombined();
    });

    return () => {
      unsubSent();
      unsubReceived();
    };
  }, [isOpen, userProfile]);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeContact]);

  // Mark unread messages as read when active contact is opened
  useEffect(() => {
    if (!activeContact || !userProfile) return;

    const unreadFromContact = messages.filter(
      (m) => m.senderUid === activeContact.uid && m.recipientUid === userProfile.uid && !m.read
    );

    unreadFromContact.forEach(async (m) => {
      try {
        await updateDoc(doc(db, 'direct_messages', m.id), { read: true });
      } catch (err) {
        // Ignore read mark errors
      }
    });
  }, [activeContact, messages, userProfile]);

  if (!isOpen || !userProfile) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setAttachmentError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const processed = await processSelectedFile(file);
      setSelectedAttachment(processed);
    } catch (err: any) {
      setAttachmentError(err.message || 'Failed to process file attachment.');
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeContact || (!textInput.trim() && !selectedAttachment) || sending) return;

    setSending(true);
    setAttachmentError(null);

    try {
      const newMsg = {
        senderUid: userProfile.uid,
        senderName: userProfile.displayName,
        senderRole: userProfile.role,
        senderAvatar: userProfile.avatar || '',
        recipientUid: activeContact.uid,
        recipientName: activeContact.displayName,
        recipientRole: activeContact.role,
        recipientAvatar: activeContact.avatar || '',
        message: textInput.trim(),
        attachmentUrl: selectedAttachment?.dataUrl || '',
        attachmentName: selectedAttachment?.name || '',
        read: false,
        timestamp: new Date().toISOString(),
      };

      await addDoc(collection(db, 'direct_messages'), newMsg);

      setTextInput('');
      setSelectedAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      console.error('Failed to send direct message:', err);
      setAttachmentError('Failed to send message. Please try again.');
    }
    setSending(false);
  };

  // Filter messages for current active conversation
  const activeMessages = messages.filter(
    (m) =>
      activeContact &&
      ((m.senderUid === userProfile.uid && m.recipientUid === activeContact.uid) ||
        (m.senderUid === activeContact.uid && m.recipientUid === userProfile.uid))
  );

  // Group contacts by recent conversations
  const contactsWithMessages = availableContacts.map((c) => {
    const convo = messages.filter(
      (m) =>
        (m.senderUid === userProfile.uid && m.recipientUid === c.uid) ||
        (m.senderUid === c.uid && m.recipientUid === userProfile.uid)
    );
    const lastMsg = convo[convo.length - 1];
    const unreadCount = convo.filter(
      (m) => m.senderUid === c.uid && m.recipientUid === userProfile.uid && !m.read
    ).length;

    return {
      contact: c,
      lastMsg,
      unreadCount,
    };
  });

  // Sort contacts by latest message timestamp, then alphabetically
  contactsWithMessages.sort((a, b) => {
    if (a.lastMsg && b.lastMsg) {
      return new Date(b.lastMsg.timestamp).getTime() - new Date(a.lastMsg.timestamp).getTime();
    }
    if (a.lastMsg) return -1;
    if (b.lastMsg) return 1;
    return a.contact.displayName.localeCompare(b.contact.displayName);
  });

  const filteredContacts = contactsWithMessages.filter((item) => {
    if (!searchContact.trim()) return true;
    const q = searchContact.toLowerCase();
    return (
      item.contact.displayName.toLowerCase().includes(q) ||
      item.contact.email.toLowerCase().includes(q) ||
      item.contact.role.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-3 sm:p-6 font-sans">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-4xl w-full h-[88vh] max-h-[700px] flex flex-col overflow-hidden text-zinc-200 shadow-2xl">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-zinc-800 bg-zinc-950 font-mono text-xs">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-sky-400" />
            <h2 className="font-bold text-zinc-100 uppercase tracking-wide">
              Direct Messages & Faculty Comms
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body: Sidebar Contacts + Chat Window */}
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] flex-1 overflow-hidden">
          {/* Contacts Sidebar */}
          <div
            className={`border-r border-zinc-800 bg-zinc-950/60 flex flex-col h-full ${
              activeContact ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Search */}
            <div className="p-3 border-b border-zinc-800">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search contacts..."
                  value={searchContact}
                  onChange={(e) => setSearchContact(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded pl-8 pr-2.5 py-1.5 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                />
              </div>
            </div>

            {/* Contacts list */}
            <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
              {filteredContacts.length === 0 ? (
                <div className="p-6 text-center text-xs font-mono text-zinc-500">
                  No contacts found.
                </div>
              ) : (
                filteredContacts.map(({ contact, lastMsg, unreadCount }) => {
                  const isSelected = activeContact?.uid === contact.uid;
                  return (
                    <button
                      key={contact.uid}
                      onClick={() => setActiveContact(contact)}
                      className={`w-full p-3 text-left flex items-start gap-3 transition-colors ${
                        isSelected ? 'bg-sky-950/40 border-l-2 border-sky-400' : 'hover:bg-zinc-900/60'
                      }`}
                    >
                      <UserAvatar
                        displayName={contact.displayName}
                        avatar={contact.avatar}
                        role={contact.role}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-xs text-zinc-100 truncate">
                            {contact.displayName}
                          </span>
                          <span
                            className={`text-[9px] font-mono px-1 py-0.2 rounded uppercase ${
                              contact.role === 'teacher'
                                ? 'bg-sky-950 text-sky-400 border border-sky-900'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {contact.role}
                          </span>
                        </div>

                        <div className="flex items-center justify-between gap-1 mt-0.5">
                          <p className="text-[11px] text-zinc-400 truncate">
                            {lastMsg ? lastMsg.message || 'Attachment sent' : contact.email}
                          </p>
                          {unreadCount > 0 && (
                            <span className="bg-sky-500 text-zinc-950 font-bold font-mono text-[9px] px-1.5 py-0.2 rounded-full shrink-0">
                              {unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Active Conversation Pane */}
          <div
            className={`flex flex-col h-full bg-zinc-900/90 ${
              !activeContact ? 'hidden md:flex' : 'flex'
            }`}
          >
            {activeContact ? (
              <>
                {/* Active contact header */}
                <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-950/40 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => setActiveContact(null)}
                      className="md:hidden p-1 text-zinc-400 hover:text-zinc-100 mr-1"
                    >
                      &larr; Back
                    </button>
                    <UserAvatar
                      displayName={activeContact.displayName}
                      avatar={activeContact.avatar}
                      role={activeContact.role}
                      size="sm"
                    />
                    <div>
                      <div className="font-bold text-xs text-zinc-100">
                        {activeContact.displayName}
                      </div>
                      <div className="text-[10px] font-mono text-zinc-400">
                        {activeContact.role === 'teacher' ? 'Instructor' : 'Student'} •{' '}
                        {activeContact.email}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Messages stream */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-xs">
                  {activeMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 text-xs">
                      <MessageSquare className="w-8 h-8 text-zinc-700 mb-2" />
                      <p>Start a direct conversation with {activeContact.displayName}</p>
                    </div>
                  ) : (
                    activeMessages.map((msg) => {
                      const isMe = msg.senderUid === userProfile.uid;
                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg p-3 font-sans text-xs ${
                              isMe
                                ? 'bg-sky-950/80 border border-sky-800 text-zinc-100'
                                : 'bg-zinc-950 border border-zinc-800 text-zinc-200'
                            }`}
                          >
                            {msg.message && <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>}

                            {/* Attachment */}
                            {msg.attachmentUrl && (
                              <div className="mt-2 pt-2 border-t border-zinc-700/60 font-mono text-[11px]">
                                {msg.attachmentUrl.startsWith('data:image') ? (
                                  <div className="space-y-1">
                                    <img
                                      src={msg.attachmentUrl}
                                      alt={msg.attachmentName || 'Image attachment'}
                                      className="max-h-44 rounded border border-zinc-700 object-contain"
                                    />
                                    <span className="text-[10px] text-zinc-400 block truncate">
                                      {msg.attachmentName}
                                    </span>
                                  </div>
                                ) : (
                                  <a
                                    href={msg.attachmentUrl}
                                    download={msg.attachmentName || 'attachment'}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-200"
                                  >
                                    <File className="w-3.5 h-3.5 text-sky-400" />
                                    <span className="truncate max-w-[160px]">
                                      {msg.attachmentName || 'Attachment'}
                                    </span>
                                    <Download className="w-3 h-3 text-zinc-400 ml-1" />
                                  </a>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1 text-[9px] font-mono text-zinc-500 mt-1 px-1">
                            <span>
                              {new Date(msg.timestamp).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {isMe && (
                              <span>
                                {msg.read ? (
                                  <CheckCheck className="w-3 h-3 text-sky-400 inline" />
                                ) : (
                                  <Check className="w-3 h-3 text-zinc-500 inline" />
                                )}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input form */}
                <form
                  onSubmit={handleSendMessage}
                  className="p-3 border-t border-zinc-800 bg-zinc-950"
                >
                  {/* Selected attachment preview */}
                  {selectedAttachment && (
                    <div className="mb-2 p-2 bg-zinc-900 border border-zinc-800 rounded flex items-center justify-between font-mono text-xs text-zinc-300">
                      <div className="flex items-center gap-2 truncate">
                        <Paperclip className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span className="truncate">{selectedAttachment.name}</span>
                        <span className="text-zinc-500 text-[10px]">
                          ({formatFileSize(selectedAttachment.size)})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAttachment(null);
                          if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        className="text-zinc-500 hover:text-red-400 p-1"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {attachmentError && (
                    <div className="mb-2 text-red-400 text-xs font-mono bg-red-950/50 border border-red-900 p-2 rounded">
                      {attachmentError}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="p-2 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                      title="Attach file or image (<800KB)"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>

                    <input
                      type="text"
                      placeholder={`Message ${activeContact.displayName}...`}
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-xs font-sans text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
                    />

                    <button
                      type="submit"
                      disabled={sending || (!textInput.trim() && !selectedAttachment)}
                      className="px-3.5 py-2 rounded bg-sky-900 hover:bg-sky-800 border border-sky-700 text-sky-100 font-mono text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Send</span>
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 font-mono text-xs p-6 text-center">
                <Users className="w-10 h-10 text-zinc-700 mb-3" />
                <h3 className="font-bold text-zinc-300 uppercase mb-1">
                  Select a Conversation
                </h3>
                <p className="max-w-xs text-zinc-500">
                  Choose a faculty instructor or classmate from the left to begin direct messaging.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
