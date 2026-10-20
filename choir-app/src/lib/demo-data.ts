import { collection, addDoc, getDocs, deleteDoc, doc, query, where, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { generateAssignments } from './assignment';

const DEMO_MARKER = { isDemo: true };

export const demoMembers = [
  { full_name: 'Sarah Johnson', email: 'sarah.demo@choir.com', role: 'choir_admin', voice_part: 'Soprano' },
  { full_name: 'Michael Chen', email: 'michael.demo@choir.com', role: 'program_coordinator', voice_part: 'Tenor' },
  { full_name: 'David Okonkwo', email: 'david.demo@choir.com', role: 'treasurer', voice_part: 'Bass' },
  { full_name: 'Rachel Smith', email: 'rachel.demo@choir.com', role: 'super_admin', voice_part: 'Alto' },
  { full_name: 'Grace Adebayo', email: 'grace.demo@choir.com', role: 'member', voice_part: 'Soprano' },
  { full_name: 'James Wilson', email: 'james.demo@choir.com', role: 'member', voice_part: 'Tenor' },
  { full_name: 'Mary Thompson', email: 'mary.demo@choir.com', role: 'member', voice_part: 'Alto' },
  { full_name: 'Daniel Kim', email: 'daniel.demo@choir.com', role: 'member', voice_part: 'Bass' },
  { full_name: 'Emma Davis', email: 'emma.demo@choir.com', role: 'member', voice_part: 'Soprano' },
  { full_name: 'Joseph Osei', email: 'joseph.demo@choir.com', role: 'member', voice_part: 'Tenor' },
  { full_name: 'Hannah Patel', email: 'hannah.demo@choir.com', role: 'member', voice_part: 'Alto' },
  { full_name: 'Samuel Adeyemi', email: 'samuel.demo@choir.com', role: 'member', voice_part: 'Bass' },
  { full_name: 'Rebecca Lewis', email: 'rebecca.demo@choir.com', role: 'member', voice_part: 'Soprano' },
  { full_name: 'Thomas Mensah', email: 'thomas.demo@choir.com', role: 'member', voice_part: 'Tenor' },
  { full_name: 'Elizabeth Nkrumah', email: 'elizabeth.demo@choir.com', role: 'member', voice_part: 'Alto' },
];

export const demoRoles = [
  { name: 'Preaching', description: 'Deliver the sermon', sort_order: 1 },
  { name: 'Opening prayer', description: 'Open service in prayer', sort_order: 2 },
  { name: 'Closing prayer', description: 'Close service in prayer', sort_order: 3 },
  { name: 'Bible reading', description: 'Read scripture', sort_order: 4 },
  { name: 'Worship leader', description: 'Lead worship', sort_order: 5 },
  { name: 'Song leader', description: 'Lead hymns', sort_order: 6 },
];

export const demoSongs = [
  { title: 'Amazing Grace', lyrics: 'Amazing grace! How sweet the sound\nThat saved a wretch like me!', category: 'Traditional', language: 'English' },
  { title: 'How Great Thou Art', lyrics: 'O Lord my God, When I in awesome wonder...', category: 'Worship', language: 'English' },
  { title: 'Great Is Thy Faithfulness', lyrics: 'Great is Thy faithfulness, O God my Father...', category: 'Hymn', language: 'English' },
  { title: 'Blessed Assurance', lyrics: 'Blessed assurance, Jesus is mine!', category: 'Traditional', language: 'English' },
  { title: 'It Is Well With My Soul', lyrics: 'When peace, like a river, attendeth my way...', category: 'Hymn', language: 'English' },
  { title: 'Holy, Holy, Holy', lyrics: 'Holy, holy, holy! Lord God Almighty!', category: 'Worship', language: 'English' },
  { title: 'To God Be The Glory', lyrics: 'To God be the glory, great things He has done!', category: 'Praise', language: 'English' },
  { title: 'What A Friend We Have In Jesus', lyrics: 'What a friend we have in Jesus, all our sins and griefs to bear!', category: 'Hymn', language: 'English' },
  { title: 'The Old Rugged Cross', lyrics: 'On a hill far away stood an old rugged cross...', category: 'Traditional', language: 'English' },
  { title: 'In Christ Alone', lyrics: 'In Christ alone my hope is found, He is my light, my strength, my song', category: 'Contemporary', language: 'English' },
];

export async function seedDemoData() {
  try {
    // Check if demo data exists
    const membersSnap = await getDocs(query(collection(db, 'members'), where('isDemo', '==', true)));
    if (!membersSnap.empty) {
      throw new Error('Demo data already exists. Reset first.');
    }

    // Add members
    const memberIds: string[] = [];
    for (const member of demoMembers) {
      const docRef = await addDoc(collection(db, 'members'), {
        ...member,
        user_id: null,
        is_admin: member.role === 'super_admin' || member.role === 'choir_admin',
        is_active: true,
        status: 'active',
        isDemo: true,
        joined_on: new Date().toISOString().split('T')[0],
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      memberIds.push(docRef.id);
    }

    // Add roles
    const roleIds: string[] = [];
    for (const role of demoRoles) {
      const docRef = await addDoc(collection(db, 'dutyCategories'), {
        ...role,
        is_active: true,
        isDemo: true,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      roleIds.push(docRef.id);
    }

    // Add songs
    for (const song of demoSongs) {
      await addDoc(collection(db, 'songs'), {
        ...song,
        is_public: true,
        isDemo: true,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    }

    const today = new Date();
    
    // Create annual plan
    const annualRef = await addDoc(collection(db, 'programs'), {
      title: '2026 Annual Choir Plan',
      program_type: 'annual',
      scheduled_for: '2026-01-01',
      description: 'Comprehensive annual program plan for the choir',
      status: 'planned',
      isDemo: true,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    // Create monthly program
    const monthlyRef = await addDoc(collection(db, 'programs'), {
      title: 'January Monthly Review',
      program_type: 'monthly',
      scheduled_for: '2026-01-31',
      parent_program_id: annualRef.id,
      description: 'Monthly review and planning',
      status: 'planned',
      isDemo: true,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    // Create weekly Sunday services
    const sundayDates = ['2026-01-04', '2026-01-11', '2026-01-18', '2026-01-25'];
    const sundayPrograms: string[] = [];
    for (const date of sundayDates) {
      const ref = await addDoc(collection(db, 'programs'), {
        title: 'Sunday Worship Service',
        program_type: 'weekly',
        scheduled_for: date,
        time: '09:00',
        location: 'Main Sanctuary',
        description: 'Weekly Sunday worship service',
        status: date < today.toISOString().split('T')[0] ? 'completed' : 'upcoming',
        recurrence_id: 'sunday-series',
        isDemo: true,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
      sundayPrograms.push(ref.id);
    }

    // Create occasional events
    await addDoc(collection(db, 'programs'), {
      title: 'Wedding Ceremony - John & Mary',
      program_type: 'occasional',
      scheduled_for: '2026-02-14',
      time: '14:00',
      location: 'Chapel',
      description: 'Special wedding ceremony',
      status: 'upcoming',
      isDemo: true,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    await addDoc(collection(db, 'programs'), {
      title: 'Youth Revival Night',
      program_type: 'occasional',
      scheduled_for: '2026-01-15',
      time: '18:00',
      location: 'Fellowship Hall',
      description: 'Special youth revival event',
      status: 'upcoming',
      isDemo: true,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    // Replace one Sunday with special event
    await addDoc(collection(db, 'programs'), {
      title: 'New Year Special Service',
      program_type: 'occasional',
      scheduled_for: '2026-01-01',
      time: '10:00',
      location: 'Main Sanctuary',
      description: 'New Year special service replacing regular service',
      status: 'completed',
      replaced: true,
      isDemo: true,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    // Mark Jan 1 Sunday as replaced
    await addDoc(collection(db, 'programs'), {
      title: 'Sunday Worship Service (Replaced)',
      program_type: 'weekly',
      scheduled_for: '2026-01-01',
      time: '09:00',
      status: 'cancelled',
      replaced_by: 'new-year-special',
      isDemo: true,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    // Generate assignments for a completed Sunday
    const completedSunday = sundayPrograms[0];
    const history = [];
    for (let i = 0; i < 4; i++) {
      history.push({ member_id: memberIds[i], assigned_on: '2025-12-28' });
    }

    const result = generateAssignments({
      roles: demoRoles.map((r, idx) => ({ id: roleIds[idx], name: r.name, sort_order: r.sort_order })),
      members: memberIds.slice(0, 10).map((id, idx) => ({ id, full_name: demoMembers[idx].full_name, is_active: true })),
      history,
    });

    for (const assignment of result.assignments) {
      await addDoc(collection(db, 'programAssignments'), {
        program_id: completedSunday,
        member_id: assignment.member_id,
        role_id: assignment.role_id,
        status: Math.random() > 0.1 ? 'completed' : 'assigned',
        assigned_on: '2026-01-04',
        isDraft: false,
        published: true,
        isDemo: true,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    }

    // Add financial records
    for (let i = 0; i < memberIds.length - 5; i++) {
      const amount = 50 + Math.random() * 100;
      const paid = Math.random() > 0.3 ? amount : amount * 0.6;
      await addDoc(collection(db, 'contributions'), {
        member_id: memberIds[i],
        category_id: 'monthly-offering',
        expected_amount: amount,
        total_paid: paid,
        balance: amount - paid,
        status: paid >= amount ? 'fully_paid' : paid > 0 ? 'partially_paid' : 'unpaid',
        period: '2026-01',
        isDemo: true,
        is_historical: false,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });
    }

    // Add expenses
    await addDoc(collection(db, 'expenses'), {
      description: 'Sound equipment maintenance',
      amount: 150.00,
      expense_date: '2026-01-10',
      category: 'Equipment',
      isDemo: true,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    await addDoc(collection(db, 'expenses'), {
      description: 'Choir robes cleaning',
      amount: 75.50,
      expense_date: '2026-01-15',
      category: 'Supplies',
      isDemo: true,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });

    return { success: true, message: 'Demo data seeded successfully' };
  } catch (error: any) {
    console.error('Error seeding demo data:', error);
    throw error;
  }
}

export async function clearDemoData() {
  try {
    const collections = ['members', 'dutyCategories', 'programs', 'programAssignments', 'songs', 'contributions', 'expenses'];
    for (const collName of collections) {
      const snap = await getDocs(query(collection(db, collName), where('isDemo', '==', true)));
      for (const docSnap of snap.docs) {
        await deleteDoc(doc(db, collName, docSnap.id));
      }
    }
    return { success: true, message: 'Demo data cleared successfully' };
  } catch (error: any) {
    console.error('Error clearing demo data:', error);
    throw error;
  }
}
