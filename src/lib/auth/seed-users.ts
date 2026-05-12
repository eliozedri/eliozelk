// Paste exported user JSON here to pre-seed users on new devices/browsers.
// Run: AccessManager → "ייצוא משתמשים" → copy JSON → paste the array below.
export const SEED_USERS: Array<{
  id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
  allowed_tabs: string[];
  action_permissions: string[];
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  passwordHash: string;
}> = [];
