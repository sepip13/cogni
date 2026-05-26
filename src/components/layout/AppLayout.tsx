import { Topbar } from "./Topbar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Topbar />
      <main style={{ flex: 1 }}>{children}</main>
    </>
  );
}
