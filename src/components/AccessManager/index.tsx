"use client";

import { useEffect, useState, useCallback } from "react";
import {
  UserProfile, Role, ALL_ROLES, ALL_TABS, ALL_ACTIONS,
  ROLE_LABELS, ACTION_PERMISSION_LABELS, ROLE_DEFAULTS, canPerformAction,
} from "@/types/auth";
import { useAuth } from "@/context/AuthContext";
import { loadUsers, createUser, updateUser, deleteUser, changePassword, getRawUsers } from "@/lib/auth/store";

const NAVY = "#0d1b2e";
const EK_BLUE = "#1d6fd8";

interface NewUserForm {
  name: string; email: string; password: string; role: Role;
  allowed_tabs: string[]; action_permissions: string[];
}

function defaultsForRole(role: Role) {
  const d = ROLE_DEFAULTS[role];
  return { allowed_tabs: d.tabs as string[], action_permissions: d.actions as string[] };
}

function StatusBadge({ active }: { active: boolean }) {
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
    style={{ backgroundColor: active ? "#dcfce7" : "#fee2e2", color: active ? "#15803d" : "#dc2626" }}>
    {active ? "פעיל" : "מושבת"}</span>;
}

function RoleBadge({ role }: { role: Role }) {
  const isMaster = role === "master";
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
    style={{ backgroundColor: isMaster ? "#fef3c7" : "#eff6ff", color: isMaster ? "#92400e" : "#1e40af" }}>
    {ROLE_LABELS[role] ?? role}</span>;
}

function PermissionEditor({ tabs, actions, onChange, role }: { tabs: string[]; actions: string[]; onChange: (t: string[], a: string[]) => void; role: Role }) {
  if (role === "master") return <p className="text-xs text-gray-500 italic">מנהל ראשי — גישה מלאה לכל הטאבים והפעולות</p>;
  const hasAllTabs = tabs.includes("*");
  const hasAllActions = actions.includes("*");
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">טאבים מורשים</p>
        <div className="flex flex-wrap gap-2">
          {ALL_TABS.filter((t) => t.id !== "access").map((tab) => (
            <label key={tab.id} className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={hasAllTabs || tabs.includes(tab.id)} className="rounded"
                onChange={() => onChange(tabs.includes(tab.id) ? tabs.filter((t) => t !== tab.id) : [...tabs, tab.id], actions)} />
              <span className="text-xs text-gray-700">{tab.label}</span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">פעולות מורשות</p>
        <div className="flex flex-wrap gap-2">
          {ALL_ACTIONS.map((action) => (
            <label key={action} className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={hasAllActions || actions.includes(action)} className="rounded"
                onChange={() => onChange(tabs, actions.includes(action) ? actions.filter((a) => a !== action) : [...actions, action])} />
              <span className="text-xs text-gray-700">{ACTION_PERMISSION_LABELS[action]}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<NewUserForm>({ name: "", email: "", password: "", role: "viewer", ...defaultsForRole("viewer") });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await createUser(form);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="font-black text-lg" style={{ color: NAVY }}>הוספת משתמש חדש</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">שם מלא</label>
              <input type="text" required value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm" placeholder="ישראל ישראלי" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">אימייל</label>
              <input type="email" required value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm" dir="ltr" placeholder="user@company.co.il" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">סיסמה ראשונית</label>
              <input type="text" required minLength={8} value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm" dir="ltr" placeholder="לפחות 8 תווים" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">תפקיד</label>
              <select value={form.role} onChange={(e) => { const r = e.target.value as Role; setForm((p) => ({ ...p, role: r, ...defaultsForRole(r) })); }}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white">
                {ALL_ROLES.filter((r) => r !== "master").map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="border rounded-xl p-4 bg-gray-50">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">הגדרת הרשאות</p>
            <PermissionEditor tabs={form.allowed_tabs} actions={form.action_permissions} role={form.role}
              onChange={(t, a) => setForm((p) => ({ ...p, allowed_tabs: t, action_permissions: a }))} />
          </div>
          {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200"><p className="text-sm text-red-700">{error}</p></div>}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={loading} className="flex-1 py-2.5 rounded-lg font-bold text-sm text-white"
              style={{ backgroundColor: loading ? "#9ca3af" : EK_BLUE }}>
              {loading ? "יוצר משתמש..." : "יצירת משתמש"}
            </button>
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50">ביטול</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ user, allUsers, onClose, onSaved }: { user: UserProfile; allUsers: UserProfile[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(user.name);
  const [tabs, setTabs] = useState<string[]>(user.allowed_tabs);
  const [actions, setActions] = useState<string[]>(user.action_permissions);
  const [role, setRole] = useState<Role>(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const masterCount = allUsers.filter((u) => u.role === "master" && u.is_active).length;
  const isLastMaster = user.role === "master" && masterCount === 1;

  const handleRoleChange = (r: Role) => {
    setRole(r);
    const d = defaultsForRole(r);
    setTabs(d.allowed_tabs);
    setActions(d.action_permissions);
  };

  const handleSave = async () => {
    if (isLastMaster && (!isActive || role !== "master")) {
      setError("לא ניתן לבטל או לשנות תפקיד המנהל הראשי האחרון.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      updateUser(user.id, {
        name,
        role,
        is_active: isActive,
        allowed_tabs: role === "master" ? ["*"] : tabs,
        action_permissions: role === "master" ? ["*"] : actions,
      });
      if (newPassword.length >= 8) {
        await changePassword(user.id, newPassword);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירה");
    }
    setLoading(false);
  };

  const handleDelete = () => {
    if (!confirm(`למחוק את ${user.name}?`)) return;
    try {
      deleteUser(user.id);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה במחיקה");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="font-black text-lg" style={{ color: NAVY }}>עריכת משתמש</h2>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">שם מלא</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>

          {/* Role + Status */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">תפקיד</label>
              <select value={role} onChange={(e) => handleRoleChange(e.target.value as Role)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white" disabled={isLastMaster}>
                {ALL_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">סטטוס</label>
              <select value={isActive ? "active" : "inactive"} onChange={(e) => setIsActive(e.target.value === "active")}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white" disabled={isLastMaster}>
                <option value="active">פעיל</option>
                <option value="inactive">מושבת</option>
              </select>
            </div>
          </div>

          {/* Password change */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">שינוי סיסמה (אופציונלי)</label>
            <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm" dir="ltr"
              placeholder="השאר ריק לאי שינוי — לפחות 8 תווים" />
          </div>

          {/* Permissions */}
          {!isLastMaster && (
            <div className="border rounded-xl p-4 bg-gray-50">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">הרשאות</p>
              <PermissionEditor tabs={tabs} actions={actions} role={role}
                onChange={(t, a) => { setTabs(t); setActions(a); }} />
            </div>
          )}

          {isLastMaster && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-xs text-amber-700 font-semibold">⚠️ זהו המנהל הראשי האחרון — לא ניתן לשנות תפקיד או לבטל חשבון זה.</p>
            </div>
          )}

          {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200"><p className="text-sm text-red-700">{error}</p></div>}

          <div className="flex gap-2 pt-2">
            <button onClick={handleSave} disabled={loading} className="flex-1 py-2.5 rounded-lg font-bold text-sm text-white"
              style={{ backgroundColor: loading ? "#9ca3af" : EK_BLUE }}>
              {loading ? "שומר..." : "שמירת שינויים"}
            </button>
            {!isLastMaster && (
              <button onClick={handleDelete} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50">מחיקה</button>
            )}
            <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50">ביטול</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportModal({ onClose }: { onClose: () => void }) {
  const json = JSON.stringify(getRawUsers(), null, 2);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "elkayam-users-seed.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b shrink-0">
          <div>
            <h2 className="font-black text-lg" style={{ color: NAVY }}>ייצוא משתמשים</h2>
            <p className="text-xs text-gray-500 mt-0.5">העתק את ה-JSON ושלח לשם הטמעה בקוד</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          <textarea readOnly value={json} rows={12}
            className="w-full text-xs font-mono p-3 border rounded-lg bg-gray-50 resize-none focus:outline-none"
            dir="ltr" />
        </div>
        <div className="p-4 border-t flex gap-2 shrink-0">
          <button onClick={handleCopy} className="flex-1 py-2.5 rounded-lg font-bold text-sm text-white"
            style={{ backgroundColor: copied ? "#16a34a" : EK_BLUE }}>
            {copied ? "✓ הועתק!" : "העתק JSON"}
          </button>
          <button onClick={handleDownload} className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">
            הורדה
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50">
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

export function AccessManager() {
  const { profile, loading: authLoading, refreshProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [editUser, setEditUser] = useState<UserProfile | null>(null);

  const canManage = !authLoading && profile && canPerformAction(profile, "manage_access");

  const reloadUsers = useCallback(() => {
    setUsers(loadUsers());
    setLoading(false);
  }, []);

  useEffect(() => { reloadUsers(); }, [reloadUsers]);

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-[400px]"><p className="text-sm text-gray-400">טוען...</p></div>;
  }

  if (!canManage) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <p className="text-lg font-bold text-gray-700">אין לך הרשאה לצפות בעמוד זה</p>
          <p className="text-sm text-gray-400 mt-1">פנה למנהל המערכת</p>
        </div>
      </div>
    );
  }

  const handleSaved = () => { reloadUsers(); refreshProfile(); };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black" style={{ color: NAVY }}>הרשאות גישה</h1>
          <p className="text-sm text-gray-500 mt-0.5">ניהול משתמשים, תפקידים ורמות גישה</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowExport(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">
            ייצוא משתמשים
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm text-white" style={{ backgroundColor: EK_BLUE }}>
            <span className="text-lg leading-none">+</span>הוספת משתמש
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: "סה״כ משתמשים", value: users.length },
          { label: "פעילים", value: users.filter((u) => u.is_active).length },
          { label: "מנהלים ראשיים", value: users.filter((u) => u.role === "master").length },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border p-4">
            <p className="text-2xl font-black" style={{ color: NAVY }}>{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">טוען משתמשים...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">אין משתמשים במערכת</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "#f8fafc" }}>
                {["שם", "אימייל", "תפקיד", "סטטוס", "כניסה אחרונה", ""].map((h) => (
                  <th key={h} className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-800">{u.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs" dir="ltr">{u.email}</td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3"><StatusBadge active={u.is_active} /></td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{u.last_login_at ? new Date(u.last_login_at).toLocaleDateString("he-IL") : "טרם נכנס"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setEditUser(u)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border hover:bg-gray-50"
                      style={{ color: EK_BLUE, borderColor: EK_BLUE }}>עריכה</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onCreated={handleSaved} />}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
      {editUser && <EditUserModal user={editUser} allUsers={users} onClose={() => setEditUser(null)} onSaved={handleSaved} />}
    </div>
  );
}
