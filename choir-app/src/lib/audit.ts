import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

export type AuditAction = 
  | 'member_created' | 'member_updated' | 'member_activated' | 'member_deactivated' | 'role_changed'
  | 'contribution_recorded' | 'payment_recorded' | 'expense_recorded' | 'financial_correction'
  | 'program_created' | 'program_updated' | 'assignment_created' | 'assignment_published'
  | 'song_created' | 'song_updated' | 'song_deleted'
  | 'user_login' | 'settings_changed' | 'data_export';

export const logAudit = async (
  userId: string,
  userName: string,
  action: AuditAction,
  resourceType: string,
  resourceId?: string,
  details: Record<string, any> = {}
) => {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      user_id: userId,
      user_name: userName,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details,
      created_at: serverTimestamp(),
    });
  } catch (error) {
    console.error('Failed to log audit:', error);
  }
};
