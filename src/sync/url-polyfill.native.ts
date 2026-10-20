// React Native's bundled URL implementation predates some of what
// supabase-js expects. Metro resolves this `.native.ts` file on devices and
// iOS/Android simulators only — web and Node get the empty stub below.
import 'react-native-url-polyfill/auto';
