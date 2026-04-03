/**
 * Browser Supabase client for this Vite + React app.
 *
 * This project does not use Next.js, so there is no `utils/supabase/server.ts`
 * or Next middleware for cookie-based SSR. Session refresh is handled by
 * `@supabase/supabase-js` in the browser (`persistSession: true` in
 * `src/lib/supabaseClient.js`).
 *
 * @see https://supabase.com/docs/guides/auth/client-side-deep-linking/vite
 */
export { supabase } from '../../lib/supabaseClient.js';
