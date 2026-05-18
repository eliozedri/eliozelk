"use client";

import { useEffect, useState, useCallback } from "react";
import {
  UserProfile,
  Role,
  ALL_ROLES,
  ALL_TABS,
  ALL_ACTIONS,
  ROLE_LABELS,
  ACTION_PERMISSION_LABELS,
  ROLE_DEFAULTS,
  canPerformAction,
} from "@/types/auth";
import { useAuth } from "@/context/AuthContext";
import {
  loadUsers,
  createUser,
  updateUser,
  deleteUser,
  sendPasswordResetLink,
  setUserPassword,
} from "@/lib/auth/store";

const NAVY = "#0d1b2e";
const EK_BLUE = "#1d6fd8";

interface NewUserForm {
  name: string;
  email: string;
  password: string;
  role: Role;
  allowed_tabs: string[];
  action_permissions: string[];
}

function defaultsForRole(role: Role): { allowed_tabs: string[]; action_permissions: string[] } {
  const d = ROLE_DEFAULTS[role];
  return {
    allowed_tabs: d.tabs as string[],
    action_permissions: d.actions as string[],
  };
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: active ? "#dcfce7" : "#fee2e2", color: active ? "#15803d" : "#dc2626" }}
    >
      {active ? "פעיל" : "מושבת"}
    </span>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const isMaster = role === "master";
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: isMaster ? "#fef3c7" : "#eff6ff", color: isMaster ? "#92400e" : "#1e40af" }}
    >
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

interface PermissionEditorProps {
  tabs: string[];
  actions: string[];
  onChange: (tabs: string[], actions: string[]) => void;
  role: Role;
}

function PermissionEditor({ tabs, actions, onChange, role }: PermissionEditorProps) {
  if (role === "master") {
    return <p className="text-xs text-gray-500 italic">מנהל ראשי — גישה מלאה לכל הטאבים והפעולות</p>;
  }

  const hasAllTabs = tabs.includes("*");
  const hasAllActions = actions.includes("*");

  const toggleTab = (id: string) => {
    onChange(tabs.includes(id) ? tabs.filter((t) => t !== id) : [...tabs, id], actions);
  };

  const toggleAction = (id: string) => {
    onChange(tabs, actions.includes(id) ? actions.filter((a) => a !== id) : [...actions, id]);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">טאבים מורשים</p>
        <div className="flex flex-wrap gap-2">
          {ALL_TABS.filter((t) => t.id !== "access").map((tab) => (
            <label key={tab.id} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={hasAllTabs || tabs.includes(tab.id)}
                onChange={() => toggleTab(tab.id)}
                className="rounded"
              />
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
              <input
                type="checkbox"
                checked={hasAllActions || actions.includes(action)}
                onChange={() => toggleAction(action)}
                className="rounded"
              />
              <span className="text-xs text-gray-700">{ACTION_PERMISSION_LABELS[action]}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Password helpers ──────────────────────────────────────────────────────────

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const arr = new Uint8Array(14);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => chars[b % chars.length]).join("");
}

function validateNewPassword(pwd: string): string | null {
  if (pwd.length < 8) return "הסיסמה חייבת להכיל לפחות 8 תווים";
  if (!/[A-Za-z]/.test(pwd)) return "הסיסמה חייבת להכיל לפחות אות אחת";
  if (!/[0-9!@#$%^&*]/.test(pwd)) return "הסיסמה חייבת להכיל לפחות ספרה אחת או תו מיוחד";
  return null;
}

type PwdTab = "reset" | "new" | "temp";

interface PasswordManagerSectionProps {
  userId: string;
  userEmail: string;
}

function PasswordManagerSection({ userId, userEmail }: PasswordManagerSectionProps) {
  const [tab, setTab] = useState<PwdTab>("reset");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);

  // New-password tab
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  // Temp-password tab
  const [tempPwd, setTempPwd] = useState("");
  const [tempApplied, setTempApplied] = useState(false);

  const clearMsg = () => { setMsg(null); setResetLink(null); };

  const switchTab = (t: PwdTab) => { setTab(t); clearMsg(); };

  // ── 1. Send reset link ──
  const handleSendReset = async () => {
    setLoading(true);
    clearMsg();
    try {
      const link = await sendPasswordResetLink(userId, userEmail);
      if (link) {
        setResetLink(link);
        setMsg({ type: "ok", text: "קישור איפוס נוצר. העתק אותו ושלח למשתמש ישירות." });
      } else {
        setMsg({ type: "ok", text: "אם SMTP מוגדר ב-Supabase — המשתמש קיבל אימייל לאיפוס סיסמה." });
      }
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "שגיאה בשליחת קישור" });
    }
    setLoading(false);
  };

  // ── 2. Set new password ──
  const handleSetPassword = async () => {
    const validErr = validateNewPassword(newPwd);
    if (validErr) { setMsg({ type: "err", text: validErr }); return; }
    if (newPwd !== confirmPwd) { setMsg({ type: "err", text: "הסיסמאות אינן תואמות" }); return; }
    setLoading(true);
    clearMsg();
    try {
      await setUserPassword(userId, newPwd);
      setMsg({ type: "ok", text: "הסיסמה עודכנה בהצלחה" });
      setNewPwd("");
      setConfirmPwd("");
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "שגיאה בעדכון הסיסמה" });
    }
    setLoading(false);
  };

  // ── 3. Temporary password ──
  const handleGenerate = () => {
    setTempPwd(generateTempPassword());
    setTempApplied(false);
    clearMsg();
  };

  const handleApplyTemp = async () => {
    if (!tempPwd) return;
    setLoading(true);
    clearMsg();
    try {
      await setUserPassword(userId, tempPwd);
      setTempApplied(true);
      setMsg({ type: "ok", text: "הסיסמה הזמנית הוגדרה בהצלחה. העתק אותה לפני סגירת החלון." });
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "שגיאה בהגדרת הסיסמה" });
    }
    setLoading(false);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => undefined);
  };

  const tabDef: { id: PwdTab; label: string }[] = [
    { id: "reset", label: "קישור איפוס" },
    { id: "new",   label: "סיסמה חדשה" },
    { id: "temp",  label: "סיסמה זמנית" },
  ];

  return (
    <div className="border rounded-xl bg-gray-50 overflow-hidden">
      <div className="px-4 pt-3 pb-1">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">ניהול סיסמה</p>
      </div>

      {/* Tab strip */}
      <div className="flex border-b border-gray-200 px-3 gap-1">
        {tabDef.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => switchTab(t.id)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {/* ── Tab: קישור איפוס ── */}
        {tab === "reset" && (
          <>
            <p className="text-xs text-gray-500">
              שולח קישור איפוס סיסמה מאובטח לכתובת{" "}
              <span dir="ltr" className="font-mono text-gray-700">{userEmail}</span>.{" "}
              אם SMTP מוגדר ב-Supabase המשתמש מקבל אימייל אוטומטי; אחרת הקישור יוצג כאן להעתקה ידנית.
            </p>
            {!msg && (
              <button
                type="button"
                onClick={handleSendReset}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? "שולח..." : "שלח קישור איפוס"}
              </button>
            )}
            {msg?.type === "ok" && resetLink && (
              <div className="space-y-2">
                <p className="text-xs text-green-700 font-medium">{msg.text}</p>
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-xs font-mono text-gray-600 truncate flex-1" dir="ltr">{resetLink}</span>
                  <button
                    type="button"
                    onClick={() => handleCopy(resetLink)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 whitespace-nowrap"
                  >
                    העתק
                  </button>
                </div>
                <button type="button" onClick={clearMsg} className="text-xs text-gray-400 hover:text-gray-600">
                  שלח שוב
                </button>
              </div>
            )}
            {msg?.type === "ok" && !resetLink && (
              <div className="flex items-center gap-3">
                <p className="text-xs text-green-700 font-medium">{msg.text}</p>
                <button type="button" onClick={clearMsg} className="text-xs text-gray-400 hover:text-gray-600">
                  שלח שוב
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Tab: סיסמה חדשה ── */}
        {tab === "new" && (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">סיסמה חדשה</label>
              <div className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-2 bg-white focus-within:ring-2 focus-within:ring-blue-400">
                <input
                  type={showPwd ? "text" : "password"}
                  value={newPwd}
                  onChange={(e) => { setNewPwd(e.target.value); clearMsg(); }}
                  className="flex-1 text-sm outline-none bg-transparent"
                  dir="ltr"
                  placeholder="לפחות 8 תווים"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap"
                >
                  {showPwd ? "הסתר" : "הצג"}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">אישור סיסמה</label>
              <input
                type={showPwd ? "text" : "password"}
                value={confirmPwd}
                onChange={(e) => { setConfirmPwd(e.target.value); clearMsg(); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                dir="ltr"
                placeholder="חזור על הסיסמה"
                autoComplete="new-password"
              />
            </div>
            <p className="text-[11px] text-gray-400">לפחות 8 תווים + אות אחת + ספרה או תו מיוחד (!@#$%)</p>
            <button
              type="button"
              onClick={handleSetPassword}
              disabled={loading || !newPwd || !confirmPwd}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "מעדכן..." : "הגדר סיסמה חדשה"}
            </button>
          </>
        )}

        {/* ── Tab: סיסמה זמנית ── */}
        {tab === "temp" && (
          <>
            <p className="text-xs text-gray-500">
              צור סיסמה זמנית חזקה, העתק אותה ושלח לעובד. הסיסמה מוצגת פעם אחת בלבד — לאחר סגירת החלון לא ניתן לראות אותה שוב.
            </p>
            {!tempPwd && (
              <button
                type="button"
                onClick={handleGenerate}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 hover:bg-gray-100 transition-colors"
              >
                🔑 צור סיסמה זמנית
              </button>
            )}
            {tempPwd && (
              <div className="space-y-3">
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 font-semibold">
                  ⚠️ הסיסמה מוצגת פעם אחת בלבד. לאחר הסגירה לא ניתן לראות אותה שוב.
                </div>
                <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <span className="text-sm font-mono tracking-widest text-gray-900 flex-1 select-all" dir="ltr">
                    {tempPwd}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy(tempPwd)}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 whitespace-nowrap"
                  >
                    העתק
                  </button>
                </div>
                {!tempApplied && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleApplyTemp}
                      disabled={loading}
                      className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {loading ? "מגדיר..." : "הגדר כסיסמה של המשתמש"}
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerate}
                      className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-200 hover:bg-gray-50"
                    >
                      צור חדשה
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Shared message banner */}
        {msg?.type === "err" && (
          <div className="p-2 rounded-lg bg-red-50 border border-red-200">
            <p className="text-xs text-red-700">{msg.text}</p>
          </div>
        )}
        {msg?.type === "ok" && !resetLink && tab !== "reset" && (
          <div className="p-2 rounded-lg bg-green-50 border border-green-200">
            <p className="text-xs text-green-700">{msg.text}</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface AddUserModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function AddUserModal({ onClose, onCreated }: AddUserModalProps) {
  const [form, setForm] = useState<NewUserForm>({
    name: "",
    email: "",
    password: "",
    role: "viewer",
    ...defaultsForRole("viewer"),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRoleChange = (role: Role) => {
    setForm((prev) => ({ ...prev, role, ...defaultsForRole(role) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await createUser(form);
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה ביצירת המשתמש");
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
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="ישראל ישראלי"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">אימייל</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                dir="ltr"
                placeholder="user@company.co.il"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">סיסמה ראשונית</label>
              <input
                type="text"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                dir="ltr"
                placeholder="לפחות 8 תווים"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">תפקיד</label>
              <select
                value={form.role}
                onChange={(e) => handleRoleChange(e.target.value as Role)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
              >
                {ALL_ROLES.filter((r) => r !== "master").map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="border rounded-xl p-4 bg-gray-50">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">הגדרת הרשאות</p>
            <PermissionEditor
              tabs={form.allowed_tabs}
              actions={form.action_permissions}
              role={form.role}
              onChange={(t, a) => setForm((p) => ({ ...p, allowed_tabs: t, action_permissions: a }))}
            />
          </div>
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 rounded-lg font-bold text-sm text-white"
              style={{ backgroundColor: loading ? "#9ca3af" : EK_BLUE }}
            >
              {loading ? "יוצר משתמש..." : "יצירת משתמש"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50"
            >
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface EditUserModalProps {
  user: UserProfile;
  allUsers: UserProfile[];
  onClose: () => void;
  onSaved: () => void;
}

function EditUserModal({ user, allUsers, onClose, onSaved }: EditUserModalProps) {
  const [tabs, setTabs] = useState<string[]>(user.allowed_tabs);
  const [actions, setActions] = useState<string[]>(user.action_permissions);
  const [role, setRole] = useState<Role>(user.role);
  const [isActive, setIsActive] = useState(user.is_active);
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
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
      setError("לא ניתן לבטל או לשנות את המנהל הראשי האחרון במערכת.");
      return;
    }
    if (!name.trim()) { setError("שם לא יכול להיות ריק"); return; }
    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed.includes("@")) { setError("כתובת אימייל לא תקינה"); return; }
    setError("");
    setLoading(true);
    try {
      await updateUser(user.id, {
        name: name.trim(),
        email: emailTrimmed,
        role,
        is_active: isActive,
        allowed_tabs: role === "master" ? ["*"] : tabs,
        action_permissions: role === "master" ? ["*"] : actions,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשמירה");
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!confirm(`למחוק את ${user.name}?`)) return;
    try {
      await deleteUser(user.id);
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
            <p className="text-sm text-gray-500">{user.name} · {user.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
        </div>
        <div className="p-6 space-y-4">
          {/* Basic details */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">שם מלא</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                placeholder="שם מלא"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">אימייל</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
                dir="ltr"
                placeholder="email@company.co.il"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">תפקיד</label>
              <select
                value={role}
                onChange={(e) => handleRoleChange(e.target.value as Role)}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                disabled={isLastMaster}
              >
                {ALL_ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">סטטוס</label>
              <select
                value={isActive ? "active" : "inactive"}
                onChange={(e) => setIsActive(e.target.value === "active")}
                className="w-full px-3 py-2 border rounded-lg text-sm bg-white"
                disabled={isLastMaster}
              >
                <option value="active">פעיל</option>
                <option value="inactive">מושבת</option>
              </select>
            </div>
          </div>
          <div className="border rounded-xl p-4 bg-gray-50">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">הרשאות</p>
            <PermissionEditor
              tabs={tabs}
              actions={actions}
              role={role}
              onChange={(t, a) => { setTabs(t); setActions(a); }}
            />
          </div>
          <PasswordManagerSection userId={user.id} userEmail={user.email} />

          {isLastMaster && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-xs text-amber-700 font-semibold">
                ⚠️ זהו המנהל הראשי האחרון — לא ניתן לשנות תפקידו או לבטלו.
              </p>
            </div>
          )}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 py-2.5 rounded-lg font-bold text-sm text-white"
              style={{ backgroundColor: loading ? "#9ca3af" : EK_BLUE }}
            >
              {loading ? "שומר..." : "שמירת שינויים"}
            </button>
            {!isLastMaster && (
              <button
                onClick={handleDelete}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold text-red-600 border border-red-200 hover:bg-red-50"
              >
                מחיקה
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50"
            >
              ביטול
            </button>
          </div>
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
  const [editUser, setEditUser] = useState<UserProfile | null>(null);

  const canManage = !authLoading && profile && canPerformAction(profile, "manage_access");

  const reloadUsers = useCallback(async () => {
    setUsers(await loadUsers());
    setLoading(false);
  }, []);

  useEffect(() => {
    reloadUsers(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [reloadUsers]);

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-sm text-gray-400">טוען...</p>
      </div>
    );
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

  const handleSaved = () => {
    reloadUsers();
    refreshProfile();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black" style={{ color: NAVY }}>הרשאות גישה</h1>
          <p className="text-sm text-gray-500 mt-0.5">ניהול משתמשים, תפקידים ורמות גישה</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg font-bold text-sm text-white"
          style={{ backgroundColor: EK_BLUE }}
        >
          <span className="text-lg leading-none">+</span>
          הוספת משתמש
        </button>
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
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">שם</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">אימייל</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">תפקיד</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">סטטוס</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-gray-500 uppercase tracking-wide">כניסה אחרונה</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-semibold text-gray-800">{u.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs" dir="ltr">{u.email}</td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3"><StatusBadge active={u.is_active} /></td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {u.last_login_at
                      ? new Date(u.last_login_at).toLocaleDateString("he-IL")
                      : "טרם נכנס"}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditUser(u)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border hover:bg-gray-50 transition-colors"
                      style={{ color: EK_BLUE, borderColor: EK_BLUE }}
                    >
                      עריכה
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <AddUserModal onClose={() => setShowAdd(false)} onCreated={handleSaved} />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          allUsers={users}
          onClose={() => setEditUser(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
