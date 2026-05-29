"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

export function Topbar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const initials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        background: "var(--bg)",
        borderBottom: "1px solid var(--border)",
        zIndex: 40,
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 60,
          gap: 12,
        }}
      >
        {/* Logo */}
        <Link
          href={session ? "/dashboard" : "/"}
          style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}
          aria-label="Cogni home"
        >
          <span
            style={{
              width: 30,
              height: 30,
              background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
              borderRadius: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              color: "var(--bg)",
              fontSize: 15,
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            C
          </span>
          <span
            style={{
              fontWeight: 800,
              fontSize: 19,
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            Cogni
          </span>
        </Link>

        {/* Nav — shown when signed in */}
        {session && (
          <nav
            aria-label="Main navigation"
            className="topbar-nav"
            style={{ display: "flex", gap: 6, fontSize: 13, color: "var(--text-dim)" }}
          >
            <NavButton href="/dashboard" active={isActive("/dashboard")}>
              Dashboard
            </NavButton>
            <NavButton href="/chat" active={isActive("/chat")}>
              Chat
            </NavButton>
            <Link
              href="/courses/new"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "7px 14px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                color: "var(--bg)",
                whiteSpace: "nowrap",
              }}
            >
              + New course
            </Link>
            <NavButton href="/settings" active={isActive("/settings")}>
              Settings
            </NavButton>
          </nav>
        )}

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {session ? (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 12px 6px 6px",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 999,
                  fontSize: 13,
                  color: "var(--text)",
                  cursor: "pointer",
                  transition: "border-color var(--duration-fast)",
                }}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="User menu"
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 10,
                    fontWeight: 700,
                    color: "var(--bg)",
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                >
                  {initials}
                </span>
                <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {session.user?.name ?? session.user?.email}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: "1px 6px",
                    borderRadius: 4,
                    color: "var(--text-faint)",
                    background: "var(--surface-2)",
                    letterSpacing: "0.04em",
                  }}
                >
                  FREE
                </span>
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 8px)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 12,
                    padding: 4,
                    minWidth: 160,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                  }}
                >
                  {/* Mobile-only nav links */}
                  <div className="topbar-mobile-menu">
                    <MenuLink href="/dashboard" onClick={() => setMenuOpen(false)}>
                      Dashboard
                    </MenuLink>
                    <MenuLink href="/chat" onClick={() => setMenuOpen(false)}>
                      Chat
                    </MenuLink>
                    <MenuLink href="/courses/new" onClick={() => setMenuOpen(false)}>
                      + New course
                    </MenuLink>
                  </div>
                  <MenuLink href="/settings" onClick={() => setMenuOpen(false)}>
                    Settings
                  </MenuLink>
                  <button
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); signOut({ callbackUrl: "/" }); }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      fontSize: 13,
                      color: "var(--high)",
                      borderRadius: 8,
                      cursor: "pointer",
                      background: "none",
                      border: "none",
                      transition: "background var(--duration-fast)",
                    }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/auth/signin"
              style={{
                padding: "8px 16px",
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                color: "var(--bg)",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                transition: "opacity var(--duration-fast)",
              }}
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function NavButton({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "inline-block",
        padding: "7px 14px",
        borderRadius: 8,
        fontSize: 13,
        color: active ? "var(--text)" : "var(--text-dim)",
        background: active ? "var(--surface-2)" : "transparent",
        transition: "all var(--duration-fast)",
        fontWeight: active ? 500 : 400,
      }}
    >
      {children}
    </Link>
  );
}

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      role="menuitem"
      href={href}
      onClick={onClick}
      style={{
        display: "block",
        padding: "8px 12px",
        fontSize: 13,
        color: "var(--text)",
        borderRadius: 8,
        transition: "background var(--duration-fast)",
      }}
    >
      {children}
    </Link>
  );
}
