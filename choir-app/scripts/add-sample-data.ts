import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function addSampleData() {
  console.log('Adding sample data...');
  
  // Add duty categories
  const categories = ['Preaching', 'Opening Prayer', 'Closing Prayer', 'Bible Reading', 'Worship Leader', 'Song Leader'];
  for (let i = 0; i < categories.length; i++) {
    await addDoc(collection(db, 'dutyCategories'), {
      name: categories[i],
      description: `${categories[i]} duty`,
      sort_order: i,
      is_active: true,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  }
  console.log('Added duty categories');
  
  // Add contribution categories
  const contribCats = ['Monthly Tithe', 'Thanksgiving Offering', 'Special Project', 'Emergency Fund'];
  for (const cat of contribCats) {
    await addDoc(collection(db, 'contributionCategories'), {
      name: cat,
      purpose: cat,
      is_active: true,
      expected_amount: cat === 'Monthly Tithe' ? 50 : 20,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  }
  console.log('Added contribution categories');
  
  // Add songs
  const songs = [
    { title: 'Amazing Grace', lyrics: 'Amazing grace how sweet the sound...', category: 'Worship', author: 'John Newton' },
    { title: 'How Great Thou Art', lyrics: 'O Lord my God when I in awesome wonder...', category: 'Praise', author: 'Carl Boberg' },
  ];
  for (const song of songs) {
    await addDoc(collection(db, 'songs'), {
      ...song,
      is_public: true,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  }
  console.log('Added songs');
  
  console.log('Sample data added successfully!');
}

addSampleData().catch(console.error);
