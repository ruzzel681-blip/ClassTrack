import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebase';
import { AuditActionType, UserRole } from '../types';

export async function logAuditEvent(
  userUid: string,
  userName: string,
  userRole: UserRole,
  action: AuditActionType,
  details: string,
  classId?: string
) {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      userUid,
      userName: userName || 'Unknown User',
      userRole,
      action,
      details,
      classId: classId || '',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to log audit event:', err);
  }
}
