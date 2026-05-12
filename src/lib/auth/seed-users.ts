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
}> = [
  {
    "id": "478bd622-a9b2-4265-93fd-9badc4b849ec",
    "email": "elioz.edri@gmail.com",
    "name": "ELIOZ EDRI",
    "role": "master",
    "is_active": true,
    "allowed_tabs": ["*"],
    "action_permissions": ["*"],
    "last_login_at": "2026-05-12T01:07:41.091Z",
    "created_at": "2026-05-12T01:07:28.133Z",
    "updated_at": "2026-05-12T02:10:55.018Z",
    "passwordHash": "b9380d3b51896e1322c779600eeb383477a27a88c96f2bd5d19f9279bb70dc8a"
  },
  {
    "id": "b6ae7f14-e208-4441-9d21-eb748e7bf4d1",
    "email": "edenelk11@gmail.com",
    "name": "EDEN ELKAYAM",
    "role": "office_manager",
    "is_active": true,
    "allowed_tabs": ["dashboard","orders","customers","graphics","catalog","schedule","workmap","work-diary","accounting","safety","crews"],
    "action_permissions": ["create_order","edit_order","create_customer","edit_customer","export_accounting","delete_order","manage_graphics","view_accounting","submit_diary","delete_diary"],
    "last_login_at": null,
    "created_at": "2026-05-12T01:19:08.203Z",
    "updated_at": "2026-05-12T02:10:20.003Z",
    "passwordHash": "50b7676a81abe0502fb9677e24921264396354b3aa90c6ac3072fc35100576a4"
  },
  {
    "id": "26c88f9f-83e6-4001-82db-b592a0aa11c1",
    "email": "shaked357951@gmail.com",
    "name": "שקד אדרי",
    "role": "viewer",
    "is_active": true,
    "allowed_tabs": ["dashboard","work-diary","crews","safety","accounting","orders","graphics","customers","workmap","schedule","catalog"],
    "action_permissions": ["create_order"],
    "last_login_at": null,
    "created_at": "2026-05-12T02:04:57.264Z",
    "updated_at": "2026-05-12T02:09:25.401Z",
    "passwordHash": "932f3c1b56257ce8539ac269d7aab42550dacf8818d075f0bdf1990562aae3ef"
  },
  {
    "id": "5a038765-2a8a-4348-ae8f-648553859baf",
    "email": "elkayam@elkayam.co.il",
    "name": "מזכירות",
    "role": "viewer",
    "is_active": true,
    "allowed_tabs": ["dashboard","customers"],
    "action_permissions": ["create_order","edit_order"],
    "last_login_at": null,
    "created_at": "2026-05-12T02:08:48.306Z",
    "updated_at": "2026-05-12T02:08:48.306Z",
    "passwordHash": "cb63c48ec53f6eb251698e91f743691e8094fc691c213032dadfc8ff3a627e8c"
  }
];
