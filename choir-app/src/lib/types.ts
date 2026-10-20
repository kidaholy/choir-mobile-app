export type UserRole = 'super_admin' | 'choir_admin' | 'treasurer' | 'program_coordinator' | 'member';
export type ProgramType = 'annual' | 'monthly' | 'weekly' | 'occasional';
export type ProgramStatus = 'planned' | 'upcoming' | 'completed' | 'postponed' | 'cancelled';
export type AssignmentStatus = 'assigned' | 'completed' | 'absent' | 'reassigned' | 'cancelled' | 'draft';
export type ContributionStatus = 'fully_paid' | 'partially_paid' | 'unpaid' | 'overdue' | 'waived';
export type PaymentMethod = 'cash' | 'mobile_money' | 'bank_transfer' | 'check' | 'other';
export type MemberStatus = 'active' | 'inactive' | 'suspended';

export type Member = {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  voice_part: string | null;
  role: UserRole;
  additional_permissions?: string[];
  is_admin: boolean;
  is_active: boolean;
  status: MemberStatus;
  joined_on: string;
  created_at: string;
  updated_at: string;
};

export type AssignmentRole = {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  sort_order: number;
  program_type?: ProgramType;
  created_at: string;
  updated_at: string;
};

export type DutyCategory = AssignmentRole; // Alias for clarity

export type Program = {
  id: string;
  title: string;
  program_type: ProgramType;
  scheduled_for: string;
  time?: string;
  end_time?: string;
  location?: string;
  description: string | null;
  status: ProgramStatus;
  responsible_person?: string;
  created_by: string | null;
  parent_program_id?: string; // For linking annual->monthly->weekly
  recurrence_rule?: string;
  recurrence_id?: string; // Series id for recurring programs
  is_occurrence?: boolean;
  replaced?: boolean;
  replaced_by?: string;
  original_occurrence_id?: string;
  occurrence_date?: string;
  occurrence_index?: number;
  edit_scope?: 'this' | 'this_and_future' | 'all';
  notes?: string;
  completed_at?: string;
  cancelled_at?: string;
  postponed_at?: string;
  created_at: string;
  updated_at: string;
};

export type ProgramAssignment = {
  id: string;
  program_id: string;
  member_id: string;
  role_id: string;
  status: AssignmentStatus;
  notes: string | null;
  reason?: string;
  assigned_on: string;
  completed_on?: string;
  reassigned_from?: string;
  previous_member_id?: string;
  changed_by?: string;
  changed_at?: string;
  change_reason?: string;
  accepted?: boolean;
  conflict_reported?: boolean;
  is_draft?: boolean;
  published?: boolean;
  created_at: string;
  updated_at: string;
};

export type Song = {
  id: string;
  title: string;
  lyrics: string;
  language?: string;
  category?: string;
  author?: string;
  source?: string;
  notes?: string;
  is_public: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
};

export type ContributionCategory = {
  id: string;
  name: string;
  purpose: string;
  expected_amount?: number;
  due_date?: string;
  collection_period?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type Contribution = {
  id: string;
  member_id: string;
  category_id: string;
  period?: string; // e.g., "2026-01" for monthly
  expected_amount: number;
  total_paid: number;
  balance: number;
  status: ContributionStatus;
  due_date?: string;
  notes?: string;
  is_historical: boolean;
  historical_date?: string; // original transaction date
  data_entry_date?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: string;
  contribution_id: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod;
  notes?: string;
  is_historical: boolean;
  historical_date?: string;
  created_by?: string;
  created_at: string;
};

export type Expense = {
  id: string;
  description: string;
  amount: number;
  expense_date: string;
  category?: string;
  notes?: string;
  receipt_url?: string;
  is_historical: boolean;
  historical_date?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
};

export type AuditLog = {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  details: Record<string, any>;
  ip_address?: string;
  created_at: string;
};

export type Announcement = {
  id: string;
  title: string;
  message: string;
  target_roles?: UserRole[];
  is_published: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};
