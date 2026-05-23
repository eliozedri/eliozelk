// Shared helper for the realtime-sync hooks (useOrders, useCrews, useCatalog,
// useWorkDiaries). Decides whether an incoming Supabase realtime UPDATE should
// replace the locally-held row.
//
// We use "newer than, OR within a small clock-skew tolerance" rather than a
// strict greater-than: the local optimistic timestamp comes from the client
// clock and can be slightly ahead of the server clock, and a strict comparison
// would silently drop legitimate remote updates in that window.
export function isNewerOrRecent(existing: string, incoming: string, toleranceMs = 5000): boolean {
  try {
    return new Date(incoming).getTime() > new Date(existing).getTime() - toleranceMs;
  } catch {
    return true;
  }
}
