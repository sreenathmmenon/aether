import { useCallback, useEffect, useRef, useState } from "react";
import {
  activeParticipants,
  type AgentRole,
  type Participant,
} from "@core/room-presence";

/**
 * Announce yourself to the room, and read who else is in it.
 *
 * The workspace already reconciles between participants every few seconds,
 * so presence rides on it rather than opening a second channel: a
 * participant writes its own row, everybody's reconcile carries it, and a
 * row nobody has refreshed falls off the board on its own.
 *
 * Deliberately no accounts. A room is a link, and the people in it are
 * whoever has the link -- which is how incident rooms actually work at
 * three in the morning.
 */
export function usePresence(
  participants: Participant[],
  announce: (participant: Participant) => void,
  self: { id: string; name: string },
) {
  const [agents, setAgents] = useState<Participant[]>([]);
  const selfRef = useRef(self);
  selfRef.current = self;

  // Keep the human's own row warm while the tab is open.
  useEffect(() => {
    const beat = () =>
      announce({
        id: selfRef.current.id,
        kind: "human",
        name: selfRef.current.name,
        lastSeen: Date.now(),
      });
    beat();
    const timer = window.setInterval(beat, 15_000);
    return () => window.clearInterval(timer);
  }, [announce]);

  /**
   * Bring an agent into the room.
   *
   * The role is a label. Every agent gets the same registered surface, and
   * nothing here widens it -- which is the point worth making out loud: a
   * participant that calls itself a commander is still refused the commit
   * tool, because there is no commit tool.
   */
  const bringAgent = useCallback(
    (role: AgentRole, name: string) => {
      const agent: Participant = {
        id: `agent-${role}-${Math.random().toString(36).slice(2, 8)}`,
        kind: "agent",
        name,
        role,
        broughtBy: selfRef.current.id,
        lastSeen: Date.now(),
      };
      setAgents((current) => [...current, agent]);
      announce(agent);
      return agent;
    },
    [announce],
  );

  // Agents this tab brought keep their own rows warm, so they stay on the
  // board while they are working.
  useEffect(() => {
    if (!agents.length) return;
    const timer = window.setInterval(() => {
      for (const agent of agents) announce({ ...agent, lastSeen: Date.now() });
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [agents, announce]);

  return {
    room: activeParticipants(participants),
    agents,
    bringAgent,
  };
}
