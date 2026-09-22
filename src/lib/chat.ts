import { useCallback, useEffect, useRef, useState } from "react";
import { events as openEvents, rpc } from "./api";

// The other half of saying something.
//
// SendChat returns a request id and nothing else; the answer arrives on the
// same stream everything else does, in pieces, tagged with that id. Until this
// existed the console could talk and not listen: you spoke, the telemetry
// moved, and what SuperAI said went nowhere at all.
//
// The id is why this is not three lines. One conversation can have several
// asks open — the schedule fires one while you are speaking — and every
// chunk carries the id of the ask it belongs to. Dropping the ones that are
// not ours is what keeps a scheduled run's answer from being read aloud in
// the middle of yours.

export type Turn = {
  id: string;
  said: string;
  /** What has arrived so far. Grows while the answer streams. */
  reply: string;
  state: "sending" | "streaming" | "done" | "error" | "cancelled";
  error?: string;
};

type ChatPayload = {
  requestId?: string;
  type?: string;
  content?: string;
  final?: string;
  error?: string;
};

/**
 * useChat sends a message and follows its answer.
 *
 * onSettled fires once per finished turn with the final text — the hook does
 * not speak it, because whether an answer is read aloud is a decision for the
 * page and not for the transport.
 */
export function useChat(session: string, onSettled?: (text: string) => void) {
  const [turns, setTurns] = useState<Turn[]>([]);
  // The subscription is opened once. Reading the callback through a ref keeps
  // it that way while still calling the current one.
  const settledRef = useRef(onSettled);
  settledRef.current = onSettled;
  // Which ids this console started. A turn we did not send still streams on
  // this connection — the desktop app's window, a schedule — and showing it
  // here as an answer to something nobody asked is worse than not showing it.
  const mine = useRef(new Set<string>());

  useEffect(() => {
    const close = openEvents((ev) => {
      if (!ev.name.startsWith("chat:")) return;
      const p = (ev.payload ?? {}) as ChatPayload;
      const id = p.requestId;
      if (!id || !mine.current.has(id)) return;

      if (ev.name === "chat:event") {
        // A tombstone asks for what has streamed so far to be thrown away —
        // the model was interrupted and is about to say something else. Left
        // unhandled it is not cosmetic: the next chunks append to text that
        // was retracted, and the sentence read aloud is two halves of
        // different answers.
        if (p.type === "tombstone") {
          setTurns((ts) => ts.map((t) => (t.id === id ? { ...t, reply: "" } : t)));
          return;
        }
        // Only the text the user is meant to read. agent-go's EventType for
        // it is exactly "partial" (pkg/agent/events.go); the same stream also
        // carries tool_call, tool_result, thinking and state_update, which
        // the In · Out panel already shows — folding them in here would put
        // JSON in the middle of a sentence.
        if (p.type !== "partial") return;
        const chunk = p.content ?? "";
        if (!chunk) return;
        setTurns((ts) =>
          ts.map((t) =>
            t.id === id ? { ...t, reply: t.reply + chunk, state: "streaming" } : t,
          ),
        );
        return;
      }

      const settle = (state: Turn["state"], text?: string, error?: string) => {
        mine.current.delete(id);
        setTurns((ts) =>
          ts.map((t) =>
            t.id === id
              ? { ...t, state, error, reply: text !== undefined && text !== "" ? text : t.reply }
              : t,
          ),
        );
      };

      if (ev.name === "chat:done") {
        // The final is the whole answer, not the last chunk: taking it over
        // the accumulated text repairs a turn that missed a chunk while the
        // stream reconnected.
        settle("done", p.final ?? "");
        const text = (p.final ?? "").trim();
        if (text) settledRef.current?.(text);
      } else if (ev.name === "chat:error") {
        settle("error", undefined, p.error ?? "failed");
      } else if (ev.name === "chat:cancelled") {
        settle("cancelled", p.final ?? "");
      }
    });
    return close;
  }, []);

  const send = useCallback(
    async (text: string) => {
      const said = text.trim();
      if (!said) return;
      // The row appears before the id does, so speaking feels answered
      // immediately rather than after a round trip.
      const pending: Turn = { id: "", said, reply: "", state: "sending" };
      setTurns((ts) => [...ts.slice(-30), pending]);
      try {
        const id = await rpc<string>("SendChat", session, said, null);
        mine.current.add(id);
        setTurns((ts) =>
          ts.map((t) => (t === pending || (t.id === "" && t.said === said) ? { ...t, id } : t)),
        );
      } catch (e) {
        setTurns((ts) =>
          ts.map((t) =>
            t.id === "" && t.said === said
              ? { ...t, state: "error", error: e instanceof Error ? e.message : String(e) }
              : t,
          ),
        );
      }
    },
    [session],
  );

  const busy = turns.some((t) => t.state === "sending" || t.state === "streaming");
  return { turns, send, busy };
}
