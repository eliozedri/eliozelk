export function resolveShape(key: string): string {
  if (key.startsWith("p")) return "לא ידוע";
  const n = parseInt(key.split("_")[0], 10);
  if (n >= 100 && n < 200) return "משולש";
  if (n >= 200 && n < 300) return "עיגול";
  if (n >= 300 && n < 400) return "מלבן";
  if (n >= 400 && n < 500) return "עיגול";
  if (n >= 500 && n < 600) return "מלבן";
  if (n >= 600 && n < 700) return "מלבן";
  if (n >= 700 && n < 800) return "מלבן";
  if (n >= 800 && n < 900) return "עיגול";
  if (n >= 900 && n < 1000) return "מיוחד";
  return "לא ידוע";
}
