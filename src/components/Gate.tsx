import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import { Decode } from "./Motion";

// The door.
//
// This console reaches an agent that runs shell commands, so who may open it
// is not a question with a comfortable default. The dev proxy can hold a
// bearer token because it is a socket on one laptop; a hostname on the public
// internet cannot, and a build that assumed it could would be an unguarded
// agent behind a name anyone can resolve.
//
// So the console authenticates the way the desktop app does: POST the password
// to /api/login, which is the one path the backend leaves ungated, and carry
// the session cookie it sets. The cookie is scoped to whatever origin served
// this page, which is exactly the property wanted — signing in here does not
// hand out anything anywhere else.

export type Session = "checking" | "in" | "out";

/** useSession asks the backend whether this browser is already signed in.
 *
 *  Asked once on load rather than inferred from a failed call: a console that
 *  discovers it is signed out by having its first RPC rejected shows an error
 *  before it shows a password box, which reads as broken rather than as
 *  locked. */
export function useSession(): [Session, (s: Session) => void] {
  const [state, setState] = useState<Session>("checking");
  useEffect(() => {
    let live = true;
    fetch("/api/session")
      .then((r) => r.json())
      .then((d: { authed?: boolean }) => live && setState(d.authed ? "in" : "out"))
      // Unreachable is not the same as signed out, but the door is the only
      // screen that can say anything useful about either.
      .catch(() => live && setState("out"));
    return () => {
      live = false;
    };
  }, []);
  return [state, setState];
}

export default function Gate({ onIn }: { onIn: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setPassword("");
        onIn();
        return;
      }
      // The backend's own words: it distinguishes a wrong password from too
      // many attempts, and the second one needs to say so or the person keeps
      // typing a password that is actually correct.
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error || `signin failed (${res.status})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="console-ground flex h-dvh items-center justify-center overflow-hidden px-6">
      <div className="absolute right-4 top-3">
        <ThemeToggle />
      </div>
      <form onSubmit={submit} className="w-full max-w-[320px] space-y-5">
        <div className="space-y-1.5">
          <Decode text="SUPERAI" step={60} className="block text-xs font-semibold tracking-[0.34em] text-ink-0" />
          <Decode text="CONSOLE" delay={380} step={45} className="block text-[10px] font-medium tracking-[0.26em] text-ink-3" />
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          aria-label="Password"
          autoFocus
          className="h-[46px] w-full border border-line bg-transparent px-3 text-[13px] text-ink-0 placeholder:text-ink-3 focus:border-sig-model/50 focus:outline-none"
        />
        {error ? <p className="text-[11px] leading-[1.6] text-sig-bad">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !password}
          className="h-[46px] w-full border border-line-strong text-[11px] font-medium tracking-[0.22em] text-ink-1 transition-colors hover:border-ink-3 hover:text-ink-0 disabled:opacity-40"
        >
          {busy ? "…" : "ENTER"}
        </button>
      </form>
    </div>
  );
}
