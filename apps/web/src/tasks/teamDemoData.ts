import type { TeamMember } from "./taskTypes";

// Integrantes fictícios para distribuir tarefas; não são usuários autenticados da API.
export const demoTeam: TeamMember[] = [
  { id: "demo-team-lucas", name: "Lucas Martins", role: "Coordenação jurídica", initials: "LM", color: "violet" },
  { id: "demo-team-mariana", name: "Mariana Costa", role: "Analista jurídica", initials: "MC", color: "blue" },
  { id: "demo-team-rafael", name: "Rafael Lima", role: "Advogado", initials: "RL", color: "amber" },
  { id: "demo-team-ana", name: "Ana Ferreira", role: "Especialista ambiental", initials: "AF", color: "green" },
  { id: "demo-team-beatriz", name: "Beatriz Nunes", role: "Assistente de operações", initials: "BN", color: "rose" },
];
